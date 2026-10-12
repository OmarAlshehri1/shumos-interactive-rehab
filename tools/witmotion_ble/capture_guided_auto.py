#!/usr/bin/env python3
"""Run a short phase-labeled BLE scan with timed Arabic macOS prompts."""

from __future__ import annotations

import argparse
import asyncio
import csv
from datetime import datetime, timezone
import json
import signal
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


PHASES = (
    ("neutral_start", 3.0, "ابدأ الآن\nثبت يدك في وضع الراحة. لا تحركها."),
    ("up_down", 3.0, "فوق ثم تحت\nاستخدم المدى المريح لك. مرة واحدة."),
    ("left_right", 3.0, "يمين ثم يسار\nثم ارجع إلى الوسط."),
    ("front_back", 3.0, "قدام ثم ورا\nثم ارجع إلى الوسط."),
    ("very_small", 2.5, "حركة صغيرة جدًا\nفوق ثم تحت، من 2 إلى 5 سم فقط."),
    ("slow", 3.5, "حركة بطيئة\nفوق ثم تحت، بالمدى المريح."),
    ("fast", 2.5, "حركة سريعة ومريحة\nفوق ثم تحت، مرة واحدة."),
    ("hold", 3.0, "ثبت يدك\nارفعها قليلًا وثبتها في مكانها."),
    ("jitter", 2.5, "رجفة صغيرة جدًا\nاعمل اهتزازًا خفيفًا باليد."),
    ("neutral_end", 3.0, "ارجع إلى وضع الراحة\nثبت يدك ولا تحركها."),
)
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


async def display_dialog(message: str, seconds: float | None = None) -> bool:
    if seconds is None:
        script = (
            'on run argv\n'
            'display dialog (item 1 of argv) with title "معايرة حركة اليد" '
            'buttons {"إلغاء", "ابدأ"} default button "ابدأ" cancel button "إلغاء"\n'
            'end run'
        )
        arguments = ["osascript", "-e", script, "--", message]
    else:
        script = (
            'on run argv\n'
            'set waitSeconds to (item 2 of argv) as real\n'
            'display dialog (item 1 of argv) with title "معايرة حركة اليد" '
            'buttons {"انتظر"} default button "انتظر" giving up after waitSeconds\n'
            'end run'
        )
        arguments = ["osascript", "-e", script, "--", message, str(seconds)]
    process = await asyncio.create_subprocess_exec(
        *arguments,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    return await process.wait() == 0


async def run(args: argparse.Namespace) -> int:
    session_dir = DATA_ROOT / safe_component(args.session)
    output_path = session_dir / f"{safe_component(args.label)}.csv"
    events_path = session_dir / f"{safe_component(args.label)}_events.json"
    manifest_path = session_dir / "manifest.json"
    if output_path.exists() or events_path.exists():
        raise FileExistsError(f"refusing to overwrite guided scan: {output_path}")
    if not manifest_path.exists():
        raise FileNotFoundError("session manifest is missing")

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
    print(f"STATE discovered name={device_name!r} id={device.address}", flush=True)

    stream = WitmotionFrameStream()
    first_packet = asyncio.Event()
    disconnected = asyncio.Event()
    recording = False
    phase = ""
    capture_start = 0.0
    sample_times: list[float] = []
    events: list[dict[str, Any]] = []
    writer: csv.DictWriter[str] | None = None

    def on_disconnect(_: BleakClient) -> None:
        disconnected.set()

    async with BleakClient(device, disconnected_callback=on_disconnect, timeout=15.0) as client:
        characteristic = client.services.get_characteristic(NOTIFY_UUID)
        if client.services.get_service(SERVICE_UUID) is None or characteristic is None:
            raise RuntimeError("official FFE5 service / FFE4 notify characteristic not found")

        def on_notification(_: Any, payload: bytearray) -> None:
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

        await client.start_notify(characteristic, on_notification)
        await asyncio.wait_for(first_packet.wait(), timeout=5.0)
        print("ARMED local Arabic prompt window", flush=True)
        ready = await display_dialog(
            "الحساس جاهز.\n\nاجلس بشكل مريح.\nستظهر حركة واحدة كل مرة.\n\nاضغط ابدأ عندما تكون جاهزًا."
        )
        if not ready:
            print("STATE cancelled_before_capture", flush=True)
            return 3

        csv_file = output_path.open("x", newline="", encoding="utf-8")
        writer = csv.DictWriter(csv_file, fieldnames=CSV_FIELDS)
        writer.writeheader()
        capture_start = time.monotonic()
        recording = True
        try:
            for next_phase, seconds, message in PHASES:
                if stop_event.is_set() or disconnected.is_set():
                    break
                phase = next_phase
                elapsed = time.monotonic() - capture_start
                events.append({"phase": phase, "elapsed_s": round(elapsed, 6)})
                print(f"PHASE phase={phase} elapsed_s={elapsed:.3f}", flush=True)
                phase_started = time.monotonic()
                await display_dialog(message, seconds)
                remaining = seconds - (time.monotonic() - phase_started)
                if remaining > 0:
                    await asyncio.sleep(remaining)
        finally:
            recording = False
            seconds = time.monotonic() - capture_start
            csv_file.flush()
            csv_file.close()

        complete = not stop_event.is_set() and not disconnected.is_set() and len(events) == len(PHASES)
        status = "complete" if complete else "partial"
        events_path.write_text(json.dumps(events, indent=2) + "\n", encoding="utf-8")
        rate_hz = 0.0
        if len(sample_times) > 1:
            rate_hz = (len(sample_times) - 1) / (sample_times[-1] - sample_times[0])
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["captures"].append(
            {
                "file": output_path.name,
                "events_file": events_path.name,
                "label": args.label,
                "capture_type": "guided_continuous_scan_local_arabic_prompts",
                "actual_seconds": round(seconds, 6),
                "samples": len(sample_times),
                "observed_rate_hz": round(rate_hz, 4),
                "phase_order": [event["phase"] for event in events],
                "status": status,
                "captured_at_utc": datetime.now(timezone.utc).isoformat(),
            }
        )
        temporary_path = manifest_path.with_suffix(".json.tmp")
        temporary_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        temporary_path.replace(manifest_path)
        print(
            f"CAPTURE_FINISHED status={status} seconds={seconds:.2f} "
            f"samples={len(sample_times)} rate_hz={rate_hz:.2f} file={output_path}",
            flush=True,
        )
        await display_dialog("وقف\n\nانتهى التسجيل. يمكنك تحريك يدك الآن.")
        return 0 if complete and sample_times else 4


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", required=True)
    parser.add_argument("--label", default="guided_quick_scan_rep03")
    parser.add_argument("--device")
    parser.add_argument("--scan-seconds", type=float, default=5.0)
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run(parse_args())))
