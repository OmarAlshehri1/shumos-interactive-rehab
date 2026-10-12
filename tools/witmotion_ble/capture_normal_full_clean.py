#!/usr/bin/env python3
"""Native macOS ground-truth-marked capture: 5 clean NORMAL/FULL RIGHT_HAND_RAISE reps.

Targeted recapture requested after the trajectory-based redesign of
semantic_detector.py could not fully resolve normal_full_raise_rep01.csv's
over-counting: that old recording has no per-repetition ground truth, so
there was no way to tell a genuine extra onset from a recording/baseline
artifact. This tool produces one with explicit markers.

Every repetition is entirely sensor-gated, not timer-gated:

    neutral confirmed -> "ارفع يدك للأعلى" -> real onset detected
    -> real movement accepted (peak/trigger) -> "ثبت يدك" -> brief hold
    -> "انزل يدك" -> real return-to-rest confirmed (ReleaseDetector)
    -> "ممتاز" -> ~2-3s rest -> next repetition's own neutral confirmation

There is no fixed recording duration. The capture ends only once 5
repetitions have each produced a confirmed release. Ground-truth markers
(neutral_confirmed, raise_requested, movement_started, movement_peak_trigger,
lowering_requested, neutral_release_confirmed, repetition_complete) are
written to an events JSON alongside the raw CSV, so the recording can later
be scored against exactly five known repetition boundaries - not inferred
from a bootstrapped quiet window the way every prior file in this session
was.

This is an isolated development prototype. It does not touch games,
Firebase, patient records, audio, or Munsit.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
from dataclasses import asdict
from datetime import datetime, timezone
import json
from pathlib import Path
import queue
import threading
import time
from typing import Any
from uuid import uuid4

try:
    from AppKit import (
        NSApplication,
        NSApplicationActivationPolicyRegular,
        NSBackingStoreBuffered,
        NSButton,
        NSColor,
        NSFont,
        NSMakeRect,
        NSTextAlignmentCenter,
        NSTextField,
        NSWindow,
        NSWindowStyleMaskClosable,
        NSWindowStyleMaskMiniaturizable,
        NSWindowStyleMaskResizable,
        NSWindowStyleMaskTitled,
    )
    from Foundation import NSObject, NSTimer
    from PyObjCTools import AppHelper
    from bleak import BleakClient
    import objc
except ImportError as exc:  # pragma: no cover - actionable startup error
    raise SystemExit("Missing macOS dependencies. Run: ./tools/witmotion_ble/setup.sh") from exc

try:
    from calibration_engine import (
        BaselineProfile,
        MotionSample,
        MovementResult,
        PersonalizedMovementDetector,
        ReleaseDetector,
        vector_norm,
    )
    from capture_calibration import (
        DATA_ROOT,
        NOTIFY_UUID,
        SERVICE_UUID,
        advertised_name,
        find_sensor,
        safe_component,
    )
    from protocol import REALTIME_FRAME, WitmotionFrameStream, parse_realtime_frame
except ImportError:  # Support module execution from the repository root.
    from tools.witmotion_ble.calibration_engine import (
        BaselineProfile,
        MotionSample,
        MovementResult,
        PersonalizedMovementDetector,
        ReleaseDetector,
        vector_norm,
    )
    from tools.witmotion_ble.capture_calibration import (
        DATA_ROOT,
        NOTIFY_UUID,
        SERVICE_UUID,
        advertised_name,
        find_sensor,
        safe_component,
    )
    from tools.witmotion_ble.protocol import REALTIME_FRAME, WitmotionFrameStream, parse_realtime_frame


REPETITIONS = 5
RAW_FIELDS = (
    "timestamp_utc", "monotonic_ns", "elapsed_s", "capture_id", "sensor_role",
    "repetition", "phase", "requested_direction", "detector_state", "device_name",
    "device_id", "packet_hex", "acc_x_g", "acc_y_g", "acc_z_g", "gyro_x_dps",
    "gyro_y_dps", "gyro_z_dps", "roll_deg", "pitch_deg", "yaw_deg",
    "delta_roll_deg", "delta_pitch_deg", "delta_yaw_deg", "angle_delta_norm_deg",
    "gyro_delta_norm_dps", "acc_delta_norm_g",
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def json_ready(value: Any) -> Any:
    if isinstance(value, tuple):
        return list(value)
    if isinstance(value, dict):
        return {key: json_ready(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_ready(item) for item in value]
    return value


class GroundTruthWorker:
    """Sensor-gated 5-repetition RIGHT_HAND_RAISE capture with ground-truth markers.

    Uses calibration_engine.py's proven, already-validated primitives
    (BaselineProfile, PersonalizedMovementDetector, ReleaseDetector) live,
    exactly as faceid_calibration.py does - this tool's job is clean,
    truthfully-labeled data collection, not a second implementation of
    detection logic. The trajectory-based semantic_detector.py is deliberately
    NOT run live here; it is replayed against the finished recording
    afterward, unmodified, per the request that produced this tool.
    """

    def __init__(self, args: argparse.Namespace, ui_events: queue.Queue[dict[str, Any]], commands: queue.Queue[str]) -> None:
        self.args = args
        self.ui_events = ui_events
        self.commands = commands
        self.capture_id = f"normalfullclean_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}_{uuid4().hex[:8]}"
        self.session_dir = DATA_ROOT / safe_component(args.session)
        self.raw_path = self.session_dir / f"{safe_component(args.label)}_rep{args.repetition:02d}.csv"
        self.events_path = self.session_dir / f"{safe_component(args.label)}_rep{args.repetition:02d}_events.json"
        self.manifest_path = self.session_dir / "manifest.json"
        self.events: list[dict[str, Any]] = []
        self.rep_results: list[dict[str, Any]] = []

        self.baseline: BaselineProfile | None = None
        self.detector: PersonalizedMovementDetector | None = None
        self.release_detector: ReleaseDetector | None = None
        self.current_result: MovementResult | None = None

        self.state = "connecting"
        self.phase = "connection"
        self.repetition = 0  # 1-indexed once started
        self.state_started_at = 0.0
        self.raise_shown_at = 0.0
        self.capture_started_at = 0.0
        self.last_sample_at = 0.0
        self.samples = 0
        self.sample_times: list[float] = []
        self.neutral_samples: list[MotionSample] = []
        self.last_neutral_wait_notice = 0.0
        self.retry_count = 0

        self.raw_file: Any = None
        self.writer: csv.DictWriter[str] | None = None
        self.device_name = ""
        self.device_id = ""
        self.finished = False

    def emit(self, event_type: str, **payload: Any) -> None:
        self.ui_events.put({"type": event_type, **payload})

    def mark(self, event_type: str, now: float, **payload: Any) -> None:
        """Ground-truth marker, written to the events JSON (see module docstring)."""
        self.events.append(
            {
                "event": event_type,
                "repetition": self.repetition,
                "timestamp_utc": utc_now(),
                "elapsed_s": round(now - self.capture_started_at, 6) if self.capture_started_at else None,
                **json_ready(payload),
            }
        )

    def start_recording(self, now: float) -> None:
        self.session_dir.mkdir(parents=True, exist_ok=True)
        if self.raw_path.exists() or self.events_path.exists():
            raise FileExistsError(f"refusing to overwrite existing capture: {self.raw_path}")
        self.raw_file = self.raw_path.open("x", newline="", encoding="utf-8")
        self.writer = csv.DictWriter(self.raw_file, fieldnames=RAW_FIELDS)
        self.writer.writeheader()
        self.capture_started_at = now
        self.begin_neutral_confirm(now)

    def begin_neutral_confirm(self, now: float) -> None:
        upcoming = self.repetition + 1
        self.state = "neutral_confirm"
        self.phase = f"rep{upcoming}_neutral_confirm"
        self.state_started_at = now
        self.neutral_samples = []
        self.last_neutral_wait_notice = 0.0
        self.emit(
            "neutral_confirm",
            instruction="استعد" if upcoming == 1 else "استعد للحركة التالية",
            detail="ثبت يدك في وضع الراحة. سننتظر السنسور نفسه.",
            repetition=self.repetition,
            total=REPETITIONS,
        )

    def sample_from_frame(self, now: float, frame: bytes) -> MotionSample:
        telemetry = parse_realtime_frame(frame)
        return MotionSample(now, telemetry.acceleration_g, telemetry.gyroscope_dps, telemetry.angles_deg)

    def write_sample(self, sample: MotionSample, frame: bytes) -> None:
        if self.writer is None:
            return
        angle_delta = (0.0, 0.0, 0.0)
        gyro_delta = sample.gyroscope_dps
        acceleration_delta = sample.acceleration_g
        if self.baseline is not None:
            angle_delta, gyro_delta, acceleration_delta = self.baseline.deltas(sample)
        ax, ay, az = sample.acceleration_g
        gx, gy, gz = sample.gyroscope_dps
        roll, pitch, yaw = sample.angles_deg
        self.writer.writerow(
            {
                "timestamp_utc": utc_now(),
                "monotonic_ns": time.monotonic_ns(),
                "elapsed_s": f"{sample.timestamp - self.capture_started_at:.6f}",
                "capture_id": self.capture_id,
                "sensor_role": "RIGHT_WRIST",
                "repetition": self.repetition,
                "phase": self.phase,
                "requested_direction": "up" if self.state in ("wait_movement",) else "",
                "detector_state": self.state,
                "device_name": self.device_name,
                "device_id": self.device_id,
                "packet_hex": frame.hex(),
                "acc_x_g": f"{ax:.8f}", "acc_y_g": f"{ay:.8f}", "acc_z_g": f"{az:.8f}",
                "gyro_x_dps": f"{gx:.8f}", "gyro_y_dps": f"{gy:.8f}", "gyro_z_dps": f"{gz:.8f}",
                "roll_deg": f"{roll:.8f}", "pitch_deg": f"{pitch:.8f}", "yaw_deg": f"{yaw:.8f}",
                "delta_roll_deg": f"{angle_delta[0]:.8f}",
                "delta_pitch_deg": f"{angle_delta[1]:.8f}",
                "delta_yaw_deg": f"{angle_delta[2]:.8f}",
                "angle_delta_norm_deg": f"{vector_norm(angle_delta):.8f}",
                "gyro_delta_norm_dps": f"{vector_norm(gyro_delta):.8f}",
                "acc_delta_norm_g": f"{vector_norm(acceleration_delta):.8f}",
            }
        )
        self.samples += 1
        self.sample_times.append(sample.timestamp)
        if self.raw_file is not None and self.samples % 10 == 0:
            self.raw_file.flush()

    def handle_sample(self, sample: MotionSample, frame: bytes) -> None:
        self.last_sample_at = sample.timestamp
        if not self.capture_started_at:
            return
        self.write_sample(sample, frame)

        if self.state == "neutral_confirm":
            self.neutral_samples.append(sample)
            cutoff = sample.timestamp - self.args.neutral_seconds
            self.neutral_samples = [item for item in self.neutral_samples if item.timestamp >= cutoff]
            window_ready = (
                len(self.neutral_samples) >= 15
                and self.neutral_samples[-1].timestamp - self.neutral_samples[0].timestamp
                >= self.args.neutral_seconds * 0.85
            )
            if window_ready and self.neutral_window_is_stable(self.neutral_samples):
                self.baseline = BaselineProfile.from_samples(self.neutral_samples)
                self.repetition += 1
                self.mark("neutral_confirmed", sample.timestamp, baseline=asdict(self.baseline))
                self.emit("neutral_confirmed", repetition=self.repetition, total=REPETITIONS)
                self.begin_raise_prompt(sample.timestamp)
            elif sample.timestamp - self.state_started_at >= self.args.neutral_seconds and sample.timestamp - self.last_neutral_wait_notice >= 2.5:
                self.last_neutral_wait_notice = sample.timestamp
                self.emit("neutral_wait")
            return

        if self.state == "wait_movement" and self.detector is not None:
            had_candidate = self.detector.candidate_started_at is not None
            result = self.detector.observe(sample)
            if not had_candidate and self.detector.candidate_started_at is not None:
                self.mark("movement_started", self.detector.candidate_started_at)
                self.emit("movement_started")
            if result is not None:
                self.current_result = result
                self.mark(
                    "movement_peak_trigger",
                    sample.timestamp,
                    detection_latency_s=round(sample.timestamp - self.raise_shown_at, 6),
                    attempt=self.retry_count + 1,
                    metrics=asdict(result),
                )
                self.emit("movement_peak_trigger")
                self.state = "hold"
                self.phase = f"rep{self.repetition}_hold"
                self.state_started_at = sample.timestamp
                return
            if sample.timestamp - self.state_started_at >= self.args.movement_timeout:
                self.retry_count += 1
                self.state_started_at = sample.timestamp
                assert self.baseline is not None
                self.detector = PersonalizedMovementDetector(self.baseline, sample.timestamp)
                self.mark("movement_wait_retry", sample.timestamp, attempt=self.retry_count)
                self.emit("movement_retry")
            return

        if self.state == "hold" and sample.timestamp - self.state_started_at >= self.args.hold_seconds:
            self.begin_lower_prompt(sample.timestamp)
            return

        if self.state == "wait_release" and self.release_detector is not None:
            if self.release_detector.observe(sample):
                assert self.baseline is not None
                previous_baseline = self.baseline
                self.baseline = BaselineProfile.from_samples(self.release_detector.rest_samples)
                self.mark(
                    "neutral_release_confirmed",
                    sample.timestamp,
                    release_latency_s=round(sample.timestamp - self.state_started_at, 6),
                    release_angle_deg=self.release_detector.release_angle,
                    previous_baseline=asdict(previous_baseline),
                    adapted_rest_baseline=asdict(self.baseline),
                )
                self.emit("neutral_release_confirmed")
                self.rep_results.append(
                    {
                        "repetition": self.repetition,
                        "peak_angle_delta_deg": self.current_result.peak_angle_delta_deg if self.current_result else None,
                        "detection_path": self.current_result.detection_path if self.current_result else None,
                    }
                )
                self.mark("repetition_complete", sample.timestamp)
                self.emit("repetition_complete", repetition=self.repetition, total=REPETITIONS)
                if self.repetition >= REPETITIONS:
                    self.complete(sample.timestamp)
                else:
                    self.state = "rest"
                    self.phase = f"rep{self.repetition}_rest"
                    self.state_started_at = sample.timestamp
                return
            if sample.timestamp - self.state_started_at >= self.args.release_timeout and sample.timestamp - self.last_neutral_wait_notice >= 2.5:
                self.last_neutral_wait_notice = sample.timestamp
                self.emit("release_still_waiting")
            return

        if self.state == "rest" and sample.timestamp - self.state_started_at >= self.args.rest_seconds:
            self.begin_neutral_confirm(sample.timestamp)
            return

    @staticmethod
    def neutral_window_is_stable(samples: list[MotionSample]) -> bool:
        """Accept natural jitter but reject a coherent settling movement (see faceid_calibration.py)."""
        path = 0.0
        for previous, current in zip(samples, samples[1:]):
            step = tuple(
                (current.angles_deg[index] - previous.angles_deg[index] + 180.0) % 360.0 - 180.0
                for index in range(3)
            )
            path += vector_norm(step)
        net = vector_norm(
            tuple(
                (samples[-1].angles_deg[index] - samples[0].angles_deg[index] + 180.0) % 360.0 - 180.0
                for index in range(3)
            )
        )
        coherence = net / path if path > 1e-9 else 0.0
        return coherence <= 0.40

    def begin_raise_prompt(self, now: float) -> None:
        assert self.baseline is not None
        self.state = "wait_movement"
        self.phase = f"rep{self.repetition}_wait_movement"
        self.state_started_at = now
        self.raise_shown_at = now
        self.retry_count = 0
        self.detector = PersonalizedMovementDetector(self.baseline, now)
        self.release_detector = None
        self.current_result = None
        self.mark("raise_requested", now)
        self.emit("raise_requested", repetition=self.repetition, total=REPETITIONS)

    def begin_lower_prompt(self, now: float) -> None:
        assert self.baseline is not None and self.current_result is not None
        self.release_detector = ReleaseDetector(self.baseline, self.current_result)
        self.state = "wait_release"
        self.phase = f"rep{self.repetition}_wait_release"
        self.state_started_at = now
        self.mark("lowering_requested", now)
        self.emit("lowering_requested")

    def complete(self, now: float) -> None:
        if self.finished:
            return
        self.state = "complete"
        self.phase = "complete"
        self.mark("capture_completed", now)
        self.finalize("complete", now)
        self.emit("complete", capture_id=self.capture_id, path=str(self.raw_path))

    def finalize(self, status: str, now: float | None = None) -> None:
        if self.finished:
            return
        self.finished = True
        ended_at = time.monotonic() if now is None else now
        if self.raw_file is not None:
            self.raw_file.flush()
            self.raw_file.close()
            self.raw_file = None
            self.writer = None
        if not self.capture_started_at:
            return
        self.events_path.write_text(json.dumps(json_ready(self.events), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        rate_hz = 0.0
        if len(self.sample_times) > 1:
            rate_hz = (len(self.sample_times) - 1) / (self.sample_times[-1] - self.sample_times[0])
        manifest = json.loads(self.manifest_path.read_text(encoding="utf-8")) if self.manifest_path.exists() else {
            "session_id": self.args.session,
            "created_at_utc": utc_now(),
            "captures": [],
        }
        manifest["captures"].append(
            {
                "capture_id": self.capture_id,
                "file": self.raw_path.name,
                "events_file": self.events_path.name,
                "label": self.args.label,
                "capture_type": "guided_ground_truth_repetition_marked",
                "sensor_role": "RIGHT_WRIST",
                "data_role": self.args.data_role,
                "actual_seconds": round(ended_at - self.capture_started_at, 6),
                "samples": self.samples,
                "observed_rate_hz": round(rate_hz, 4),
                "repetitions_completed": len(self.rep_results),
                "repetitions_requested": REPETITIONS,
                "rep_results": self.rep_results,
                "status": status,
                "quality_review": "pending_post_capture_analysis",
                "notes": (
                    "Sensor-gated, ground-truth-marked NORMAL/FULL RIGHT_HAND_RAISE recapture "
                    "(neutral_confirmed/raise_requested/movement_started/movement_peak_trigger/"
                    "lowering_requested/neutral_release_confirmed/repetition_complete markers in "
                    "the events file); no fixed recording duration."
                ),
                "captured_at_utc": utc_now(),
            }
        )
        temporary = self.manifest_path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        temporary.replace(self.manifest_path)
        print(
            f"GROUND_TRUTH_CAPTURE status={status} id={self.capture_id} "
            f"reps_completed={len(self.rep_results)}/{REPETITIONS} samples={self.samples} "
            f"file={self.raw_path}",
            flush=True,
        )

    async def run_async(self) -> None:
        try:
            self.emit("connection", status="scanning", text="جاري البحث عن الحساس…")
            found = await find_sensor(self.args.scan_seconds, self.args.device)
            if found is None:
                self.emit("fatal", text="لم أجد الحساس. تأكد أنه يعمل وأن تطبيق WITMOTION مغلق.")
                return
            device, advertisement = found
            self.device_name = advertised_name(device, advertisement)
            self.device_id = device.address
            stream = WitmotionFrameStream()
            first_packet = asyncio.Event()
            disconnected = asyncio.Event()

            def on_disconnect(_: BleakClient) -> None:
                disconnected.set()

            self.emit("connection", status="connecting", text=f"جاري الاتصال بـ {self.device_name}…")
            async with BleakClient(device, disconnected_callback=on_disconnect, timeout=15.0) as client:
                characteristic = client.services.get_characteristic(NOTIFY_UUID)
                if client.services.get_service(SERVICE_UUID) is None or characteristic is None:
                    raise RuntimeError("official FFE5/FFE4 service not found")

                def on_notification(_: Any, payload: bytearray) -> None:
                    for frame in stream.feed(payload):
                        if frame[1] != REALTIME_FRAME:
                            continue
                        first_packet.set()
                        now = time.monotonic()
                        self.handle_sample(self.sample_from_frame(now, frame), frame)

                await client.start_notify(characteristic, on_notification)
                await asyncio.wait_for(first_packet.wait(), timeout=5.0)
                self.state = "ready"
                self.emit("ready", device_name=self.device_name)
                while not self.finished and not disconnected.is_set():
                    while True:
                        try:
                            command = self.commands.get_nowait()
                        except queue.Empty:
                            break
                        now = self.last_sample_at or time.monotonic()
                        if command == "start" and self.state == "ready":
                            self.start_recording(now)
                        elif command == "cancel":
                            self.mark("capture_cancelled", now)
                            self.finalize("cancelled", now)
                            self.emit("cancelled")
                    await asyncio.sleep(0.05)
                if disconnected.is_set() and not self.finished:
                    now = self.last_sample_at or time.monotonic()
                    self.mark("sensor_disconnected", now)
                    self.finalize("partial_disconnected", now)
                    self.emit("fatal", text="انقطع اتصال الحساس. حُفظ التسجيل الجزئي بأمان.")
        except Exception as exc:
            now = self.last_sample_at or time.monotonic()
            self.mark("error", now, error_type=type(exc).__name__, message=str(exc))
            self.finalize("error", now)
            self.emit("fatal", text=f"تعذر تشغيل التسجيل: {exc}")

    def run(self) -> None:
        asyncio.run(self.run_async())


class AppDelegate(NSObject):
    def initWithArgs_(self, args: argparse.Namespace) -> "AppDelegate":
        self = objc.super(AppDelegate, self).init()
        if self is None:
            return self
        self.args = args
        self.ui_events: queue.Queue[dict[str, Any]] = queue.Queue()
        self.commands: queue.Queue[str] = queue.Queue()
        self.worker = GroundTruthWorker(args, self.ui_events, self.commands)
        self.completed = False
        return self

    def makeLabel_frame_size_(self, text: str, frame: Any, size: float) -> NSTextField:
        label = NSTextField.alloc().initWithFrame_(frame)
        label.setStringValue_(text)
        label.setBezeled_(False)
        label.setEditable_(False)
        label.setSelectable_(False)
        label.setDrawsBackground_(False)
        label.setAlignment_(NSTextAlignmentCenter)
        label.setFont_(NSFont.systemFontOfSize_(size))
        return label

    def applicationDidFinishLaunching_(self, _: Any) -> None:
        style = NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable
        self.window = NSWindow.alloc().initWithContentRect_styleMask_backing_defer_(
            NSMakeRect(0, 0, 900, 620), style, NSBackingStoreBuffered, False
        )
        self.window.setTitle_("تسجيل نظيف: رفع اليد الكامل")
        self.window.setMinSize_((760, 560))
        self.window.center()
        content = self.window.contentView()
        content.setWantsLayer_(True)
        content.layer().setBackgroundColor_(NSColor.colorWithCalibratedRed_green_blue_alpha_(0.045, 0.065, 0.10, 1.0).CGColor())

        self.progress = self.makeLabel_frame_size_("0 / 5", NSMakeRect(350, 560, 200, 36), 26)
        self.progress.setTextColor_(NSColor.whiteColor())
        content.addSubview_(self.progress)

        self.big_icon = self.makeLabel_frame_size_("✋", NSMakeRect(300, 330, 300, 140), 90)
        self.big_icon.setTextColor_(NSColor.whiteColor())
        content.addSubview_(self.big_icon)

        self.instruction = self.makeLabel_frame_size_("جاري البحث عن الحساس…", NSMakeRect(60, 230, 780, 80), 44)
        self.instruction.setTextColor_(NSColor.whiteColor())
        content.addSubview_(self.instruction)

        self.detail = self.makeLabel_frame_size_("", NSMakeRect(60, 190, 780, 34), 20)
        self.detail.setTextColor_(NSColor.colorWithCalibratedWhite_alpha_(0.75, 1.0))
        content.addSubview_(self.detail)

        self.connection = self.makeLabel_frame_size_("BLE: جاري الاتصال", NSMakeRect(200, 30, 500, 26), 15)
        self.connection.setTextColor_(NSColor.colorWithCalibratedWhite_alpha_(0.55, 1.0))
        content.addSubview_(self.connection)

        self.start_button = self.makeButtonWithTitle_frame_action_("ابدأ", NSMakeRect(370, 90, 160, 46), "startPressed:")
        self.start_button.setEnabled_(False)
        content.addSubview_(self.start_button)
        self.cancel_button = self.makeButtonWithTitle_frame_action_("إلغاء", NSMakeRect(25, 25, 100, 36), "cancelPressed:")
        content.addSubview_(self.cancel_button)

        self.window.makeKeyAndOrderFront_(None)
        NSApplication.sharedApplication().activateIgnoringOtherApps_(True)
        NSTimer.scheduledTimerWithTimeInterval_target_selector_userInfo_repeats_(0.08, self, "pollEvents:", None, True)
        threading.Thread(target=self.worker.run, name="wt901-ground-truth-capture", daemon=True).start()

    def makeButtonWithTitle_frame_action_(self, title: str, frame: Any, action: str) -> NSButton:
        button = NSButton.alloc().initWithFrame_(frame)
        button.setTitle_(title)
        button.setFont_(NSFont.systemFontOfSize_(18))
        button.setTarget_(self)
        button.setAction_(action)
        return button

    def startPressed_(self, _: Any) -> None:
        self.start_button.setHidden_(True)
        self.commands.put("start")

    def cancelPressed_(self, _: Any) -> None:
        if self.completed:
            NSApplication.sharedApplication().terminate_(None)
        else:
            self.instruction.setStringValue_("جاري حفظ التسجيل…")
            self.commands.put("cancel")

    def setIconColor_(self, color: Any) -> None:
        self.big_icon.setTextColor_(color)

    def pollEvents_(self, _: Any) -> None:
        white = NSColor.whiteColor()
        blue = NSColor.colorWithCalibratedRed_green_blue_alpha_(0.10, 0.43, 0.92, 1.0)
        green = NSColor.colorWithCalibratedRed_green_blue_alpha_(0.10, 0.62, 0.32, 1.0)
        while True:
            try:
                event = self.ui_events.get_nowait()
            except queue.Empty:
                return
            event_type = event["type"]
            if event_type == "connection":
                self.connection.setStringValue_(f"BLE: {event['text']}")
            elif event_type == "ready":
                self.connection.setStringValue_(f"BLE: متصل ✓  {event['device_name']}")
                self.instruction.setStringValue_("الحساس جاهز")
                self.detail.setStringValue_("سنسجل 5 حركات رفع كاملة. اضغط ابدأ عندما تكون جاهزًا.")
                self.start_button.setEnabled_(True)
            elif event_type == "neutral_confirm":
                self.instruction.setStringValue_(event["instruction"])
                self.detail.setStringValue_(event["detail"])
                self.progress.setStringValue_(f"{event['repetition']} / {event['total']}")
                self.big_icon.setStringValue_("✋")
                self.setIconColor_(blue)
            elif event_type == "neutral_wait":
                self.instruction.setStringValue_("ثبت يدك بشكل طبيعي")
                self.detail.setStringValue_("لا نحتاج ثباتًا كاملًا. فقط استرخِ وسننتظر السنسور.")
            elif event_type == "neutral_confirmed":
                self.big_icon.setStringValue_("✋ ✓")
                self.setIconColor_(green)
            elif event_type == "raise_requested":
                self.progress.setStringValue_(f"{event['repetition'] - 1} / {event['total']}")
                self.instruction.setStringValue_("ارفع يدك للأعلى")
                self.detail.setStringValue_("حركة واحدة مريحة وكاملة، بالمدى الذي يناسبك.")
                self.big_icon.setStringValue_("⬆️")
                self.setIconColor_(white)
            elif event_type == "movement_started":
                pass
            elif event_type == "movement_peak_trigger":
                self.big_icon.setStringValue_("⬆️ ✓")
                self.setIconColor_(green)
            elif event_type == "movement_retry":
                self.instruction.setStringValue_("ارفع يدك للأعلى")
                self.detail.setStringValue_("لم نلحظ حركة كافية بعد. جرّب مرة أخرى بحرية.")
            elif event_type == "lowering_requested":
                self.instruction.setStringValue_("انزل يدك")
                self.detail.setStringValue_("ارجع بهدوء إلى وضع الراحة.")
                self.big_icon.setStringValue_("⬇️")
                self.setIconColor_(blue)
            elif event_type == "release_still_waiting":
                self.instruction.setStringValue_("انزل يدك")
                self.detail.setStringValue_("خذ وقتك وارجع لوضع الراحة الطبيعي.")
            elif event_type == "neutral_release_confirmed":
                self.big_icon.setStringValue_("✋ ✓")
                self.setIconColor_(green)
            elif event_type == "repetition_complete":
                self.progress.setStringValue_(f"{event['repetition']} / {event['total']}")
                self.instruction.setStringValue_("ممتاز ✓")
                self.detail.setStringValue_("استرح قليلًا.")
            elif event_type == "complete":
                self.completed = True
                self.progress.setStringValue_(f"{REPETITIONS} / {REPETITIONS}")
                self.instruction.setStringValue_("انتهى التسجيل ✓")
                self.detail.setStringValue_("تم حفظ 5 حركات كاملة مع تأكيد الإفلات لكل منها.")
                self.big_icon.setStringValue_("🎉")
                self.setIconColor_(green)
                self.cancel_button.setTitle_("إغلاق")
                self.connection.setStringValue_("تم حفظ القياسات الحقيقية بأمان")
            elif event_type == "cancelled":
                self.completed = True
                self.instruction.setStringValue_("تم إيقاف التسجيل")
                self.detail.setStringValue_("حُفظ أي تسجيل جزئي بأمان.")
                self.cancel_button.setTitle_("إغلاق")
            elif event_type == "fatal":
                self.completed = True
                self.instruction.setStringValue_("تعذر إكمال التسجيل")
                self.detail.setStringValue_(event["text"])
                self.cancel_button.setTitle_("إغلاق")

    def applicationShouldTerminateAfterLastWindowClosed_(self, _: Any) -> bool:
        return True

    def applicationWillTerminate_(self, _: Any) -> None:
        if not self.completed:
            self.commands.put("cancel")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", default="right_hand_adult_sim_20260902_01")
    parser.add_argument("--label", default="normal_full_raise_clean")
    parser.add_argument("--repetition", type=int, default=1, help="dataset file suffix (rep01/rep02/...), not the 5 in-recording repetitions")
    parser.add_argument("--device", help="optional advertised-name fragment or macOS CoreBluetooth UUID")
    parser.add_argument("--scan-seconds", type=float, default=8.0)
    parser.add_argument("--neutral-seconds", type=float, default=2.5)
    parser.add_argument("--hold-seconds", type=float, default=1.0)
    parser.add_argument("--rest-seconds", type=float, default=2.5)
    parser.add_argument("--movement-timeout", type=float, default=20.0)
    parser.add_argument("--release-timeout", type=float, default=20.0)
    parser.add_argument("--data-role", choices=("development", "patient"), default="development")
    args = parser.parse_args()
    if min(args.scan_seconds, args.neutral_seconds, args.hold_seconds, args.rest_seconds, args.movement_timeout, args.release_timeout) <= 0:
        parser.error("all durations must be positive")
    return args


def main() -> None:
    args = parse_args()
    application = NSApplication.sharedApplication()
    application.setActivationPolicy_(NSApplicationActivationPolicyRegular)
    delegate = AppDelegate.alloc().initWithArgs_(args)
    application.setDelegate_(delegate)
    AppHelper.runEventLoop()


if __name__ == "__main__":
    main()
