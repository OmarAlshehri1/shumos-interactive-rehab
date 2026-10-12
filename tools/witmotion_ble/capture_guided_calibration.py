#!/usr/bin/env python3
"""Capture one continuous, phase-labeled WT901BLE calibration scan."""

from __future__ import annotations

import argparse
import asyncio
import csv
from datetime import datetime, timezone
import json
from pathlib import Path
import signal
import sys
import time
from typing import Any

try:
    from bleak import BleakClient
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Bleak is not installed. Run: ./tools/witmotion_ble/setup.sh"
    ) from exc

from capture_calibration import (
    DATA_ROOT,
    NOTIFY_UUID,
    SERVICE_UUID,
    advertised_name,
    find_sensor,
    safe_component,
)
from protocol import REALTIME_FRAME, WitmotionFrameStream, parse_realtime_frame


PHASES = {
    "neutral_start",
    "up_down",
    "left_right",
    "front_back",
    "very_small",
    "slow",
    "fast",
    "hold",
    "jitter",
    "neutral_end",
}
CSV_FIELDS = (
    "timestamp_utc",
    "monotonic_ns",
    "elapsed_s",
    "label",
    "phase",
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


def write_manifest_entry(
    session_dir: Path,
    args: argparse.Namespace,
    device_name: str,
    device_id: str,
    output_path: Path,
    events_path: Path,
    events: list[dict[str, Any]],
    samples: int,
    seconds: float,
    rate_hz: float,
    status: str,
) -> None:
    manifest_path = session_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["device"] = {"name": device_name, "corebluetooth_id": device_id}
    manifest["captures"].append(
        {
            "file": output_path.name,
            "events_file": events_path.name,
            "label": args.label,
            "capture_type": "guided_continuous_scan",
            "actual_seconds": round(seconds, 6),
            "samples": samples,
            "observed_rate_hz": round(rate_hz, 4),
            "phase_order": [event["phase"] for event in events],
            "status": status,
            "captured_at_utc": datetime.now(timezone.utc).isoformat(),
        }
    )
    temporary_path = manifest_path.with_suffix(".json.tmp")
    temporary_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    temporary_path.replace(manifest_path)


async def run(args: argparse.Namespace) -> int:
    session_dir = DATA_ROOT / safe_component(args.session)
    session_dir.mkdir(parents=True, exist_ok=True)
    output_path = session_dir / f"{safe_component(args.label)}.csv"
    events_path = session_dir / f"{safe_component(args.label)}_events.json"
    if output_path.exists() or events_path.exists():
        raise FileExistsError(f"refusing to overwrite guided scan: {output_path}")
    if not (session_dir / "manifest.json").exists():
        raise FileNotFoundError("session manifest is missing; capture NEUTRAL first")

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
    phase = ""
    capture_start = 0.0
    sample_times: list[float] = []
    events: list[dict[str, Any]] = []
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
                        "phase": phase,
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

        print("ARMED guided scan; waiting for START <phase>", flush=True)
        status = "cancelled"
        while not stop_event.is_set() and not disconnected.is_set():
            timeout = None
            if recording:
                timeout = max(0.01, args.max_duration - (time.monotonic() - capture_start))
            try:
                line = await asyncio.wait_for(
                    asyncio.to_thread(sys.stdin.readline), timeout=timeout
                )
            except asyncio.TimeoutError:
                status = "max_duration"
                break
            if not line:
                status = "stdin_closed"
                break
            parts = line.strip().split(maxsplit=1)
            command = parts[0].upper() if parts else ""
            requested_phase = parts[1] if len(parts) == 2 else ""

            if command == "START" and not recording:
                if requested_phase not in PHASES:
                    print(f"STATE invalid_phase phase={requested_phase!r}", flush=True)
                    continue
                csv_file = output_path.open("x", newline="", encoding="utf-8")
                writer = csv.DictWriter(csv_file, fieldnames=CSV_FIELDS)
                writer.writeheader()
                capture_start = time.monotonic()
                phase = requested_phase
                recording = True
                events.append({"phase": phase, "elapsed_s": 0.0})
                print(f"CAPTURE_STARTED phase={phase}", flush=True)
            elif command == "PHASE" and recording:
                if requested_phase not in PHASES:
                    print(f"STATE invalid_phase phase={requested_phase!r}", flush=True)
                    continue
                phase = requested_phase
                elapsed = time.monotonic() - capture_start
                events.append({"phase": phase, "elapsed_s": round(elapsed, 6)})
                print(f"PHASE_CHANGED phase={phase} elapsed_s={elapsed:.3f}", flush=True)
            elif command == "STOP" and recording:
                status = "complete"
                break
            else:
                print(f"STATE invalid_command command={line.strip()!r}", flush=True)

        if recording:
            recording = False
            seconds = time.monotonic() - capture_start
            assert csv_file is not None
            csv_file.flush()
            csv_file.close()
            csv_file = None
            writer = None
            events_path.write_text(json.dumps(events, indent=2) + "\n", encoding="utf-8")
            rate_hz = 0.0
            if len(sample_times) > 1:
                rate_hz = (len(sample_times) - 1) / (sample_times[-1] - sample_times[0])
            write_manifest_entry(
                session_dir,
                args,
                device_name,
                device.address,
                output_path,
                events_path,
                events,
                len(sample_times),
                seconds,
                rate_hz,
                status,
            )
            print(
                f"CAPTURE_FINISHED status={status} seconds={seconds:.2f} "
                f"samples={len(sample_times)} rate_hz={rate_hz:.2f} file={output_path}",
                flush=True,
            )
        return 0 if status == "complete" and sample_times else 4


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", required=True)
    parser.add_argument("--label", default="guided_quick_scan_rep01")
    parser.add_argument("--max-duration", type=float, default=40.0)
    parser.add_argument("--device", help="optional name fragment or macOS CoreBluetooth UUID")
    parser.add_argument("--scan-seconds", type=float, default=5.0)
    args = parser.parse_args()
    if args.max_duration <= 0 or args.scan_seconds <= 0:
        parser.error("duration and scan time must be positive")
    return args


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run(parse_args())))
