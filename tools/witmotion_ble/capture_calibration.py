#!/usr/bin/env python3
"""Capture one labeled WT901BLECL5.0 calibration example to local CSV."""

from __future__ import annotations

import argparse
import asyncio
import csv
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import signal
import sys
import time
from typing import Any

try:
    from bleak import BleakClient, BleakScanner
    from bleak.backends.device import BLEDevice
    from bleak.backends.scanner import AdvertisementData
except ImportError as exc:  # pragma: no cover - actionable CLI error
    raise SystemExit(
        "Bleak is not installed. Run: ./tools/witmotion_ble/setup.sh"
    ) from exc

try:
    from protocol import REALTIME_FRAME, WitmotionFrameStream, parse_realtime_frame
except ImportError:  # Support import as tools.witmotion_ble.capture_calibration.
    from tools.witmotion_ble.protocol import REALTIME_FRAME, WitmotionFrameStream, parse_realtime_frame


SERVICE_UUID = "0000ffe5-0000-1000-8000-00805f9a34fb"
NOTIFY_UUID = "0000ffe4-0000-1000-8000-00805f9a34fb"
DATA_ROOT = Path(__file__).resolve().parent / "calibration_data"
CSV_FIELDS = (
    "timestamp_utc",
    "monotonic_ns",
    "elapsed_s",
    "label",
    "repetition",
    "device_name",
    "device_id",
    "packet_hex",
    "acc_x_g",
    "acc_y_g",
    "acc_z_g",
    "gyro_x_dps",
    "gyro_y_dps",
    "gyro_z_dps",
    "roll_deg",
    "pitch_deg",
    "yaw_deg",
)


def advertised_name(device: BLEDevice, advertisement: AdvertisementData) -> str:
    return advertisement.local_name or device.name or "(unnamed)"


async def find_sensor(
    scan_seconds: float, selector: str | None
) -> tuple[BLEDevice, AdvertisementData] | None:
    discovered = await BleakScanner.discover(timeout=scan_seconds, return_adv=True)
    candidates: list[tuple[BLEDevice, AdvertisementData]] = []
    for device, advertisement in discovered.values():
        name = advertised_name(device, advertisement)
        services = {value.lower() for value in advertisement.service_uuids}
        if not (name.upper().startswith("WT901BLE") or SERVICE_UUID in services):
            continue
        if selector:
            wanted = selector.casefold()
            if wanted not in name.casefold() and wanted not in device.address.casefold():
                continue
        candidates.append((device, advertisement))
    candidates.sort(key=lambda item: item[1].rssi or -999, reverse=True)
    return candidates[0] if candidates else None


def safe_component(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "_", value).strip("_")
    if not cleaned:
        raise ValueError("label/session must contain a letter or number")
    return cleaned


def update_manifest(
    session_dir: Path,
    args: argparse.Namespace,
    device: BLEDevice,
    device_name: str,
    capture_file: Path,
    sample_count: int,
    actual_seconds: float,
    rate_hz: float,
    status: str,
) -> None:
    manifest_path = session_dir / "manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    else:
        manifest = {
            "session_id": args.session,
            "created_at_utc": datetime.now(timezone.utc).isoformat(),
            "purpose": "Adult-simulated movement dataset for later pediatric rehab calibration design",
            "clinical_limit": "Not child validation and not a medical device validation dataset",
            "mounting": {
                "side": "RIGHT_WRIST",
                "sensor_face": "logo upward",
                "approximate_x_axis": "toward hand/fingers",
                "attachment": "fixed orientation",
            },
            "protocol": {
                "service_uuid": SERVICE_UUID,
                "notify_uuid": NOTIFY_UUID,
                "frame": "20-byte 0x55 0x61",
            },
            "device": {"name": device_name, "corebluetooth_id": device.address},
            "captures": [],
        }
    manifest["captures"].append(
        {
            "file": capture_file.name,
            "label": args.label,
            "repetition": args.repetition,
            "requested_seconds": args.duration,
            "actual_seconds": round(actual_seconds, 6),
            "samples": sample_count,
            "observed_rate_hz": round(rate_hz, 4),
            "notes": args.notes,
            "status": status,
            "captured_at_utc": datetime.now(timezone.utc).isoformat(),
        }
    )
    temporary_path = manifest_path.with_suffix(".json.tmp")
    temporary_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    temporary_path.replace(manifest_path)


async def capture(args: argparse.Namespace) -> int:
    session_dir = DATA_ROOT / safe_component(args.session)
    session_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{safe_component(args.label)}_rep{args.repetition:02d}.csv"
    output_path = session_dir / filename
    if output_path.exists():
        raise FileExistsError(f"refusing to overwrite existing capture: {output_path}")

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signal_number in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(signal_number, stop_event.set)
        except NotImplementedError:
            pass

    print(f"STATE scanning session={args.session} label={args.label}", flush=True)
    found = await find_sensor(args.scan_seconds, args.device)
    if found is None:
        print("STATE sensor_not_found", flush=True)
        return 2
    device, advertisement = found
    device_name = advertised_name(device, advertisement)
    print(
        f"STATE discovered name={device_name!r} id={device.address} rssi={advertisement.rssi}",
        flush=True,
    )

    stream = WitmotionFrameStream()
    first_packet = asyncio.Event()
    disconnected = asyncio.Event()
    recording = False
    capture_start = 0.0
    sample_times: list[float] = []
    csv_file: Any = None
    writer: csv.DictWriter[str] | None = None

    def on_disconnect(_: BleakClient) -> None:
        disconnected.set()
        print("STATE disconnected", flush=True)

    async with BleakClient(device, disconnected_callback=on_disconnect, timeout=15.0) as client:
        notify_characteristic = client.services.get_characteristic(NOTIFY_UUID)
        if client.services.get_service(SERVICE_UUID) is None or notify_characteristic is None:
            raise RuntimeError("official FFE5 service / FFE4 notify characteristic not found")

        def on_notification(_: Any, payload: bytearray) -> None:
            nonlocal writer
            for frame in stream.feed(payload):
                if frame[1] != REALTIME_FRAME:
                    continue
                first_packet.set()
                if not recording or writer is None:
                    continue
                now = time.monotonic()
                telemetry = parse_realtime_frame(frame)
                ax, ay, az = telemetry.acceleration_g
                gx, gy, gz = telemetry.gyroscope_dps
                sample_times.append(now)
                writer.writerow(
                    {
                        "timestamp_utc": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
                        "monotonic_ns": time.monotonic_ns(),
                        "elapsed_s": f"{now - capture_start:.6f}",
                        "label": args.label,
                        "repetition": args.repetition,
                        "device_name": device_name,
                        "device_id": device.address,
                        "packet_hex": frame.hex(),
                        "acc_x_g": f"{ax:.8f}",
                        "acc_y_g": f"{ay:.8f}",
                        "acc_z_g": f"{az:.8f}",
                        "gyro_x_dps": f"{gx:.8f}",
                        "gyro_y_dps": f"{gy:.8f}",
                        "gyro_z_dps": f"{gz:.8f}",
                        "roll_deg": f"{telemetry.roll:.8f}",
                        "pitch_deg": f"{telemetry.pitch:.8f}",
                        "yaw_deg": f"{telemetry.yaw:.8f}",
                    }
                )

        await client.start_notify(notify_characteristic, on_notification)
        try:
            await asyncio.wait_for(first_packet.wait(), timeout=5.0)
        except asyncio.TimeoutError:
            raise RuntimeError("subscribed, but no real 0x61 packet arrived within 5 seconds")

        print(
            f"ARMED label={args.label} duration={args.duration:.1f}s; waiting for GO on stdin",
            flush=True,
        )
        command = (await asyncio.to_thread(sys.stdin.readline)).strip().upper()
        if command != "GO":
            print(f"STATE cancelled command={command!r}", flush=True)
            return 3

        csv_file = output_path.open("x", newline="", encoding="utf-8")
        writer = csv.DictWriter(csv_file, fieldnames=CSV_FIELDS)
        writer.writeheader()
        capture_start = time.monotonic()
        recording = True
        print(f"CAPTURE_STARTED label={args.label}", flush=True)
        try:
            await asyncio.wait_for(disconnected.wait(), timeout=args.duration)
        except asyncio.TimeoutError:
            pass
        finally:
            recording = False
            csv_file.flush()
            csv_file.close()
            csv_file = None
            writer = None
        actual_seconds = time.monotonic() - capture_start
        complete = not disconnected.is_set() and actual_seconds >= args.duration * 0.95
        status = "complete" if complete else "partial"
        rate_hz = 0.0
        if len(sample_times) > 1:
            rate_hz = (len(sample_times) - 1) / (sample_times[-1] - sample_times[0])
        update_manifest(
            session_dir,
            args,
            device,
            device_name,
            output_path,
            len(sample_times),
            actual_seconds,
            rate_hz,
            status,
        )
        print(
            f"CAPTURE_FINISHED status={status} samples={len(sample_times)} "
            f"rate_hz={rate_hz:.2f} file={output_path}",
            flush=True,
        )
        return 0 if complete and sample_times else 4


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--repetition", type=int, default=1)
    parser.add_argument("--duration", type=float, required=True)
    parser.add_argument("--notes", default="")
    parser.add_argument("--device", help="optional name fragment or macOS CoreBluetooth UUID")
    parser.add_argument("--scan-seconds", type=float, default=5.0)
    args = parser.parse_args()
    if args.repetition < 1 or args.duration <= 0 or args.scan_seconds <= 0:
        parser.error("repetition, duration, and scan time must be positive")
    return args


if __name__ == "__main__":
    raise SystemExit(asyncio.run(capture(parse_args())))
