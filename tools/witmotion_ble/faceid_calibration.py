#!/usr/bin/env python3
"""Native macOS Face-ID-style enrollment for a real WT901BLECL sensor.

The application is an isolated development prototype.  It records raw real
telemetry and deterministic, per-user enrollment metadata; it does not touch
games, Firebase, patient records, or production state.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
from dataclasses import asdict
from datetime import datetime, timezone
import json
import math
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
        cosine_similarity,
        dominant_axes,
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
        cosine_similarity,
        dominant_axes,
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


DIRECTIONS = (
    ("up", "↑\nفوق", "حرك يدك للأعلى"),
    ("down", "↓\nتحت", "حرك يدك للأسفل"),
    ("right", "→\nيمين", "حرك يدك لليمين"),
    ("left", "←\nيسار", "حرك يدك لليسار"),
    ("up_right", "↗\nفوق يمين", "حرك يدك للأعلى واليمين"),
    ("up_left", "↖\nفوق يسار", "حرك يدك للأعلى واليسار"),
    ("down_right", "↘\nتحت يمين", "حرك يدك للأسفل واليمين"),
    ("down_left", "↙\nتحت يسار", "حرك يدك للأسفل واليسار"),
    ("forward", "قدام", "حرك يدك لقدام"),
    ("backward", "ورا", "حرك يدك لورا"),
)
DIRECTION_BY_ID = {item[0]: item for item in DIRECTIONS}
TOTAL_PROGRESS = 1 + len(DIRECTIONS)
RAW_FIELDS = (
    "timestamp_utc", "monotonic_ns", "elapsed_s", "capture_id", "sensor_role",
    "phase", "requested_direction", "detector_state", "device_name", "device_id",
    "packet_hex", "acc_x_g", "acc_y_g", "acc_z_g", "gyro_x_dps", "gyro_y_dps",
    "gyro_z_dps", "roll_deg", "pitch_deg", "yaw_deg", "delta_roll_deg",
    "delta_pitch_deg", "delta_yaw_deg", "angle_delta_norm_deg", "gyro_delta_norm_dps",
    "acc_delta_norm_g",
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


class EnrollmentWorker:
    def __init__(self, args: argparse.Namespace, ui_events: queue.Queue[dict[str, Any]], commands: queue.Queue[str]) -> None:
        self.args = args
        self.ui_events = ui_events
        self.commands = commands
        self.capture_id = f"faceid_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}_{uuid4().hex[:8]}"
        self.session_dir = DATA_ROOT / safe_component(args.session)
        self.raw_path = self.session_dir / f"{self.capture_id}.csv"
        self.events_path = self.session_dir / f"{self.capture_id}_events.json"
        self.profile_path = self.session_dir / f"{self.capture_id}_profile.json"
        self.manifest_path = self.session_dir / "manifest.json"
        self.events: list[dict[str, Any]] = []
        self.results: dict[str, MovementResult] = {}
        self.direction_baselines: dict[str, dict[str, Any]] = {}
        self.skipped: list[str] = []
        self.baseline_samples: list[MotionSample] = []
        self.final_neutral_samples: list[MotionSample] = []
        self.baseline: BaselineProfile | None = None
        self.initial_baseline: BaselineProfile | None = None
        self.detector: PersonalizedMovementDetector | None = None
        self.release_detector: ReleaseDetector | None = None
        self.current_result: MovementResult | None = None
        self.state = "connecting"
        self.phase = "connection"
        self.current_direction = ""
        self.direction_index = -1
        self.state_started_at = 0.0
        self.target_first_shown_at = 0.0
        self.capture_started_at = 0.0
        self.last_sample_at = 0.0
        self.samples = 0
        self.sample_times: list[float] = []
        self.retry_count = 0
        self.completed_progress = 0
        self.neutral_collect_after = 0.0
        self.last_neutral_wait_notice = 0.0
        self.raw_file: Any = None
        self.writer: csv.DictWriter[str] | None = None
        self.device_name = ""
        self.device_id = ""
        self.finished = False

    def emit(self, event_type: str, **payload: Any) -> None:
        self.ui_events.put({"type": event_type, **payload})

    def event(self, event_type: str, now: float | None = None, **payload: Any) -> None:
        timestamp = time.monotonic() if now is None else now
        self.events.append(
            {
                "event": event_type,
                "timestamp_utc": utc_now(),
                "elapsed_s": round(timestamp - self.capture_started_at, 6) if self.capture_started_at else None,
                **json_ready(payload),
            }
        )

    def start_recording(self, now: float) -> None:
        self.session_dir.mkdir(parents=True, exist_ok=True)
        if any(path.exists() for path in (self.raw_path, self.events_path, self.profile_path)):
            raise FileExistsError(f"refusing to overwrite capture {self.capture_id}")
        self.raw_file = self.raw_path.open("x", newline="", encoding="utf-8")
        self.writer = csv.DictWriter(self.raw_file, fieldnames=RAW_FIELDS)
        self.writer.writeheader()
        self.capture_started_at = now
        self.state_started_at = now
        self.neutral_collect_after = now + 1.0
        self.state = "neutral_initial"
        self.phase = "neutral_initial"
        self.event("capture_started", now, capture_id=self.capture_id)
        self.emit("neutral_initial", instruction="ثبت يدك", detail="خلك مرتاحًا. سنقيس حركة يدك الطبيعية.")

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
                "phase": self.phase,
                "requested_direction": self.current_direction,
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

        if self.state == "neutral_initial":
            if sample.timestamp < self.neutral_collect_after:
                return
            self.baseline_samples.append(sample)
            cutoff = sample.timestamp - self.args.neutral_seconds
            self.baseline_samples = [item for item in self.baseline_samples if item.timestamp >= cutoff]
            window_ready = (
                len(self.baseline_samples) >= 20
                and self.baseline_samples[-1].timestamp - self.baseline_samples[0].timestamp
                >= self.args.neutral_seconds * 0.9
            )
            if window_ready and self.neutral_window_is_stable(self.baseline_samples):
                self.baseline = BaselineProfile.from_samples(self.baseline_samples)
                self.initial_baseline = self.baseline
                self.completed_progress = 1
                self.event("neutral_accepted", sample.timestamp, baseline=asdict(self.baseline))
                self.emit("neutral_accepted", progress=self.completed_progress, total=TOTAL_PROGRESS)
                self.show_next_direction(sample.timestamp)
            elif (
                sample.timestamp - self.neutral_collect_after >= self.args.neutral_seconds
                and sample.timestamp - self.last_neutral_wait_notice >= 3.0
            ):
                self.last_neutral_wait_notice = sample.timestamp
                self.emit("neutral_wait")
            return

        if self.state == "target_wait" and self.detector is not None:
            result = self.detector.observe(sample)
            if result is not None:
                self.results[self.current_direction] = result
                self.current_result = result
                self.state = "success_pause"
                self.phase = f"{self.current_direction}_accepted"
                self.state_started_at = sample.timestamp
                self.completed_progress += 1
                self.event(
                    "movement_accepted",
                    sample.timestamp,
                    direction=self.current_direction,
                    total_detection_latency_s=round(sample.timestamp - self.target_first_shown_at, 6),
                    attempt=self.retry_count + 1,
                    metrics=asdict(result),
                )
                self.emit(
                    "movement_accepted",
                    direction=self.current_direction,
                    progress=self.completed_progress,
                    total=TOTAL_PROGRESS,
                )
                return
            if sample.timestamp - self.state_started_at >= self.args.direction_timeout:
                self.retry_count += 1
                self.event("movement_timeout_retry", sample.timestamp, direction=self.current_direction, attempt=self.retry_count)
                self.detector = PersonalizedMovementDetector(self.baseline, sample.timestamp)
                self.state_started_at = sample.timestamp
                self.emit("retry", direction=self.current_direction)
            return

        if self.state == "success_pause" and sample.timestamp - self.state_started_at >= 1.0:
            assert self.baseline is not None and self.current_result is not None
            self.release_detector = ReleaseDetector(self.baseline, self.current_result)
            self.state = "release_wait"
            self.phase = f"{self.current_direction}_release"
            self.state_started_at = sample.timestamp
            self.emit("release_wait", direction=self.current_direction)
            return

        if self.state == "release_wait" and self.release_detector is not None:
            if self.release_detector.observe(sample):
                previous_baseline = self.baseline
                self.baseline = BaselineProfile.from_samples(self.release_detector.rest_samples)
                self.event(
                    "release_accepted",
                    sample.timestamp,
                    direction=self.current_direction,
                    release_latency_s=round(sample.timestamp - self.state_started_at, 6),
                    release_angle_deg=self.release_detector.release_angle,
                    previous_baseline=asdict(previous_baseline),
                    adapted_rest_baseline=asdict(self.baseline),
                )
                self.emit("release_accepted", direction=self.current_direction)
                self.show_next_direction(sample.timestamp)
            elif sample.timestamp - self.state_started_at >= self.args.release_timeout:
                self.state_started_at = sample.timestamp
                self.event("release_still_waiting", sample.timestamp, direction=self.current_direction)
                self.emit("release_retry", direction=self.current_direction)
            return

        if self.state == "skipped_pause" and sample.timestamp - self.state_started_at >= 1.0:
            self.show_next_direction(sample.timestamp)
            return

        if self.state == "neutral_final":
            self.final_neutral_samples.append(sample)
            cutoff = sample.timestamp - self.args.final_neutral_seconds
            self.final_neutral_samples = [item for item in self.final_neutral_samples if item.timestamp >= cutoff]
            window_ready = (
                len(self.final_neutral_samples) >= 20
                and self.final_neutral_samples[-1].timestamp - self.final_neutral_samples[0].timestamp
                >= self.args.final_neutral_seconds * 0.9
            )
            if window_ready and self.neutral_window_is_stable(self.final_neutral_samples):
                candidate = BaselineProfile.from_samples(self.final_neutral_samples)
                assert self.baseline is not None
                matches_personal_noise = (
                    candidate.angle_noise_p95_deg <= self.baseline.angle_noise_p95_deg * 2.5
                    and candidate.gyro_noise_p95_dps <= self.baseline.gyro_noise_p95_dps * 2.5
                    and candidate.acceleration_noise_p95_g <= self.baseline.acceleration_noise_p95_g * 2.5
                )
                if matches_personal_noise:
                    self.complete(sample.timestamp)
                elif sample.timestamp - self.last_neutral_wait_notice >= 3.0:
                    self.last_neutral_wait_notice = sample.timestamp
                    self.emit("neutral_wait")

    @staticmethod
    def neutral_window_is_stable(samples: list[MotionSample]) -> bool:
        """Accept natural jitter but reject a coherent settling movement."""
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

    def show_next_direction(self, now: float) -> None:
        self.direction_index += 1
        if self.direction_index >= len(DIRECTIONS):
            self.current_direction = ""
            self.state = "neutral_final"
            self.phase = "neutral_final"
            self.state_started_at = now
            self.event("final_neutral_started", now)
            self.emit("neutral_final", instruction="ثبت يدك", detail="آخر فحص للراحة. لا تحرك يدك قليلًا.")
            return
        assert self.baseline is not None
        direction, _, instruction = DIRECTIONS[self.direction_index]
        self.current_direction = direction
        self.state = "target_wait"
        self.phase = f"{direction}_movement"
        self.state_started_at = now
        self.target_first_shown_at = now
        self.retry_count = 0
        self.detector = PersonalizedMovementDetector(self.baseline, now)
        self.direction_baselines[direction] = asdict(self.baseline)
        self.release_detector = None
        self.current_result = None
        self.event("direction_shown", now, direction=direction)
        self.emit("direction", direction=direction, instruction=instruction)

    def skip_current(self, now: float) -> None:
        if self.state != "target_wait" or not self.current_direction:
            return
        direction = self.current_direction
        self.skipped.append(direction)
        self.completed_progress += 1
        self.event(
            "direction_skipped",
            now,
            direction=direction,
            wait_before_skip_s=round(now - self.target_first_shown_at, 6),
        )
        self.state = "skipped_pause"
        self.phase = f"{direction}_skipped"
        self.state_started_at = now
        self.emit("skipped", direction=direction, progress=self.completed_progress, total=TOTAL_PROGRESS)

    def retry_current(self, now: float) -> None:
        if self.state != "target_wait" or self.baseline is None:
            return
        self.retry_count += 1
        self.state_started_at = now
        self.detector = PersonalizedMovementDetector(self.baseline, now)
        self.event("manual_retry", now, direction=self.current_direction, attempt=self.retry_count + 1)
        self.emit("direction", direction=self.current_direction, instruction=DIRECTION_BY_ID[self.current_direction][2])

    def profile_payload(self, status: str, ended_at: float) -> dict[str, Any]:
        final_baseline = None
        if len(self.final_neutral_samples) >= 15:
            final_baseline = BaselineProfile.from_samples(self.final_neutral_samples)
        accepted = {direction: asdict(result) for direction, result in self.results.items()}
        similarities: list[dict[str, Any]] = []
        result_items = list(self.results.items())
        for left_index, (left_name, left_result) in enumerate(result_items):
            for right_name, right_result in result_items[left_index + 1:]:
                similarity = cosine_similarity(left_result.angle_vector_deg, right_result.angle_vector_deg)
                if similarity >= 0.88:
                    similarities.append(
                        {"left": left_name, "right": right_name, "cosine_similarity": round(similarity, 6)}
                    )
        baseline = asdict(self.baseline) if self.baseline is not None else None
        movement_peaks = [result.peak_angle_delta_deg for result in self.results.values()]
        return {
            "schema_version": 1,
            "capture_id": self.capture_id,
            "profile_kind": "deterministic_per_user_enrollment",
            "machine_learning": False,
            "development_or_patient": self.args.data_role,
            "sensor_role": "RIGHT_WRIST",
            "status": status,
            "started_at_utc": self.events[0]["timestamp_utc"] if self.events else None,
            "ended_at_utc": utc_now(),
            "duration_s": round(ended_at - self.capture_started_at, 6) if self.capture_started_at else 0.0,
            "device": {"name": self.device_name, "corebluetooth_id": self.device_id},
            "baseline": baseline,
            "initial_baseline": asdict(self.initial_baseline) if self.initial_baseline is not None else None,
            "final_stillness": asdict(final_baseline) if final_baseline is not None else None,
            "accepted_directions": accepted,
            "direction_baselines": self.direction_baselines,
            "skipped_directions": self.skipped,
            "movement_envelope": {
                "available": list(self.results),
                "unavailable_or_skipped": self.skipped,
                "dominant_orientation_axes": dominant_axes(self.results.values()),
                "smallest_enrolled_angle_delta_deg": min(movement_peaks) if movement_peaks else None,
                "largest_enrolled_angle_delta_deg": max(movement_peaks) if movement_peaks else None,
                "ambiguous_orientation_pairs": similarities,
            },
            "sensitivity_architecture": {
                "high": "boundary close to this user's measured noise envelope; requires directional persistence",
                "medium": "balanced boundary between this user's noise and accepted movement distributions",
                "low": "deeper within this user's accepted movement envelope with longer confirmation",
                "fixed_universal_angle_threshold": False,
            },
            "state_machine": ["NEUTRAL", "MOVEMENT_START", "VALID_MOVEMENT", "TRIGGERED", "WAIT_FOR_RELEASE", "NEUTRAL"],
            "clinical_limit": "Adult development capture; not pediatric or medical-device validation.",
        }

    def complete(self, now: float) -> None:
        if self.finished:
            return
        self.state = "complete"
        self.phase = "complete"
        self.event("capture_completed", now)
        self.finalize("complete", now)
        self.emit("complete", capture_id=self.capture_id, profile=str(self.profile_path))

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
        profile = self.profile_payload(status, ended_at)
        self.events_path.write_text(json.dumps(json_ready(self.events), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        self.profile_path.write_text(json.dumps(json_ready(profile), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
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
                "profile_file": self.profile_path.name,
                "label": "faceid_style_right_hand_enrollment",
                "capture_type": "native_macos_faceid_style_event_driven",
                "sensor_role": "RIGHT_WRIST",
                "data_role": self.args.data_role,
                "actual_seconds": profile["duration_s"],
                "samples": self.samples,
                "observed_rate_hz": round(rate_hz, 4),
                "accepted_directions": list(self.results),
                "skipped_directions": self.skipped,
                "status": status,
                "quality_review": "pending_post_capture_analysis" if status == "complete" else "partial_preserved",
                "notes": "One movement per direction; event-driven Arabic visual enrollment; no fixed movement range.",
                "captured_at_utc": utc_now(),
            }
        )
        temporary = self.manifest_path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(self.manifest_path)
        print(
            f"FACEID_CAPTURE status={status} id={self.capture_id} duration_s={profile['duration_s']:.2f} "
            f"samples={self.samples} accepted={list(self.results)} skipped={self.skipped}",
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
                        elif command == "retry":
                            self.retry_current(now)
                        elif command == "skip":
                            self.skip_current(now)
                        elif command == "cancel":
                            self.event("capture_cancelled", now)
                            self.finalize("cancelled", now)
                            self.emit("cancelled")
                    await asyncio.sleep(0.05)
                if disconnected.is_set() and not self.finished:
                    now = self.last_sample_at or time.monotonic()
                    self.event("sensor_disconnected", now)
                    self.finalize("partial_disconnected", now)
                    self.emit("fatal", text="انقطع اتصال الحساس. حُفظ التسجيل الجزئي بأمان.")
        except Exception as exc:
            now = self.last_sample_at or time.monotonic()
            self.event("error", now, error_type=type(exc).__name__, message=str(exc))
            self.finalize("error", now)
            self.emit("fatal", text=f"تعذر تشغيل المعايرة: {exc}")

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
        self.worker = EnrollmentWorker(args, self.ui_events, self.commands)
        self.target_labels: dict[str, NSTextField] = {}
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
            NSMakeRect(0, 0, 1040, 780), style, NSBackingStoreBuffered, False
        )
        self.window.setTitle_("معايرة حركة اليد اليمنى")
        self.window.setMinSize_((900, 700))
        self.window.center()
        content = self.window.contentView()
        content.setWantsLayer_(True)
        content.layer().setBackgroundColor_(NSColor.colorWithCalibratedRed_green_blue_alpha_(0.045, 0.065, 0.10, 1.0).CGColor())

        self.progress = self.makeLabel_frame_size_("0 / 11", NSMakeRect(430, 730, 180, 32), 23)
        self.progress.setTextColor_(NSColor.whiteColor())
        content.addSubview_(self.progress)
        self.instruction = self.makeLabel_frame_size_("جاري البحث عن الحساس…", NSMakeRect(100, 625, 840, 90), 48)
        self.instruction.setTextColor_(NSColor.whiteColor())
        content.addSubview_(self.instruction)
        self.detail = self.makeLabel_frame_size_("", NSMakeRect(100, 585, 840, 36), 22)
        self.detail.setTextColor_(NSColor.colorWithCalibratedWhite_alpha_(0.75, 1.0))
        content.addSubview_(self.detail)

        positions = {
            "up_left": (220, 440), "up": (440, 465), "up_right": (660, 440),
            "left": (190, 310), "right": (690, 310),
            "down_left": (220, 180), "down": (440, 155), "down_right": (660, 180),
            "forward": (35, 80), "backward": (815, 80),
        }
        for direction, title, _instruction in DIRECTIONS:
            x, y = positions[direction]
            label = self.makeLabel_frame_size_(title, NSMakeRect(x, y, 180, 92), 29 if direction not in ("forward", "backward") else 25)
            label.setDrawsBackground_(True)
            label.setBackgroundColor_(NSColor.colorWithCalibratedWhite_alpha_(0.10, 1.0))
            label.setTextColor_(NSColor.colorWithCalibratedWhite_alpha_(0.42, 1.0))
            content.addSubview_(label)
            self.target_labels[direction] = label

        self.center_label = self.makeLabel_frame_size_("✋\nالراحة", NSMakeRect(420, 300, 200, 115), 34)
        self.center_label.setDrawsBackground_(True)
        self.center_label.setBackgroundColor_(NSColor.colorWithCalibratedWhite_alpha_(0.12, 1.0))
        self.center_label.setTextColor_(NSColor.whiteColor())
        content.addSubview_(self.center_label)

        self.connection = self.makeLabel_frame_size_("BLE: جاري الاتصال", NSMakeRect(250, 35, 540, 28), 17)
        self.connection.setTextColor_(NSColor.colorWithCalibratedWhite_alpha_(0.60, 1.0))
        content.addSubview_(self.connection)

        self.start_button = self.makeButtonWithTitle_frame_action_("ابدأ المعايرة", NSMakeRect(420, 95, 200, 48), "startPressed:")
        self.start_button.setEnabled_(False)
        content.addSubview_(self.start_button)
        self.retry_button = self.makeButtonWithTitle_frame_action_("حاول مرة أخرى", NSMakeRect(365, 95, 190, 44), "retryPressed:")
        self.retry_button.setHidden_(True)
        content.addSubview_(self.retry_button)
        self.skip_button = self.makeButtonWithTitle_frame_action_("تخطي", NSMakeRect(570, 95, 120, 44), "skipPressed:")
        self.skip_button.setHidden_(True)
        content.addSubview_(self.skip_button)
        self.cancel_button = self.makeButtonWithTitle_frame_action_("إلغاء", NSMakeRect(25, 25, 100, 38), "cancelPressed:")
        content.addSubview_(self.cancel_button)

        self.window.makeKeyAndOrderFront_(None)
        NSApplication.sharedApplication().activateIgnoringOtherApps_(True)
        NSTimer.scheduledTimerWithTimeInterval_target_selector_userInfo_repeats_(0.08, self, "pollEvents:", None, True)
        threading.Thread(target=self.worker.run, name="wt901-enrollment", daemon=True).start()

    def makeButtonWithTitle_frame_action_(self, title: str, frame: Any, action: str) -> NSButton:
        button = NSButton.alloc().initWithFrame_(frame)
        button.setTitle_(title)
        button.setFont_(NSFont.systemFontOfSize_(18))
        button.setTarget_(self)
        button.setAction_(action)
        return button

    def setTarget_state_(self, direction: str, state: str) -> None:
        label = self.target_labels[direction]
        title = DIRECTION_BY_ID[direction][1]
        if state == "current":
            label.setStringValue_(title)
            label.setBackgroundColor_(NSColor.colorWithCalibratedRed_green_blue_alpha_(0.10, 0.43, 0.92, 1.0))
            label.setTextColor_(NSColor.whiteColor())
        elif state == "success":
            label.setStringValue_(f"{title}\n✓")
            label.setBackgroundColor_(NSColor.colorWithCalibratedRed_green_blue_alpha_(0.10, 0.62, 0.32, 1.0))
            label.setTextColor_(NSColor.whiteColor())
        elif state == "skipped":
            label.setStringValue_(f"{title}\n—")
            label.setBackgroundColor_(NSColor.colorWithCalibratedWhite_alpha_(0.18, 1.0))
            label.setTextColor_(NSColor.colorWithCalibratedWhite_alpha_(0.65, 1.0))

    def showMovementButtons_(self, visible: bool) -> None:
        self.retry_button.setHidden_(not visible)
        self.skip_button.setHidden_(not visible)

    def startPressed_(self, _: Any) -> None:
        self.start_button.setHidden_(True)
        self.commands.put("start")

    def retryPressed_(self, _: Any) -> None:
        self.commands.put("retry")

    def skipPressed_(self, _: Any) -> None:
        self.commands.put("skip")

    def cancelPressed_(self, _: Any) -> None:
        if self.completed:
            NSApplication.sharedApplication().terminate_(None)
        else:
            self.instruction.setStringValue_("جاري حفظ التسجيل…")
            self.commands.put("cancel")

    def pollEvents_(self, _: Any) -> None:
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
                self.detail.setStringValue_("اجلس بشكل مريح. حركة واحدة فقط لكل اتجاه.")
                self.start_button.setEnabled_(True)
            elif event_type == "neutral_initial":
                self.instruction.setStringValue_(event["instruction"])
                self.detail.setStringValue_(event["detail"])
                self.center_label.setBackgroundColor_(NSColor.colorWithCalibratedRed_green_blue_alpha_(0.10, 0.43, 0.92, 1.0))
            elif event_type == "neutral_wait":
                self.instruction.setStringValue_("ثبت يدك بشكل طبيعي")
                self.detail.setStringValue_("لا نحتاج ثباتًا كاملًا. فقط خلك مرتاحًا وسننتظر.")
            elif event_type == "neutral_accepted":
                self.progress.setStringValue_(f"{event['progress']} / {event['total']}")
                self.center_label.setStringValue_("✋\nالراحة ✓")
                self.center_label.setBackgroundColor_(NSColor.colorWithCalibratedRed_green_blue_alpha_(0.10, 0.62, 0.32, 1.0))
            elif event_type == "direction":
                direction = event["direction"]
                self.setTarget_state_(direction, "current")
                self.instruction.setStringValue_(event["instruction"])
                self.detail.setStringValue_("استخدم أي مدى مريح لك. حركة واحدة تكفي.")
                self.showMovementButtons_(True)
            elif event_type == "retry":
                direction = event["direction"]
                self.instruction.setStringValue_("حاول مرة أخرى")
                self.detail.setStringValue_(f"{DIRECTION_BY_ID[direction][2]}. سننتظر معك.")
                self.showMovementButtons_(True)
            elif event_type == "movement_accepted":
                self.setTarget_state_(event["direction"], "success")
                self.progress.setStringValue_(f"{event['progress']} / {event['total']}")
                self.instruction.setStringValue_("ممتاز ✓")
                self.detail.setStringValue_("")
                self.showMovementButtons_(False)
            elif event_type == "release_wait":
                self.instruction.setStringValue_("ارجع لوضع الراحة")
                self.detail.setStringValue_("ثم ثبت يدك قليلًا.")
                self.showMovementButtons_(False)
            elif event_type == "release_retry":
                self.instruction.setStringValue_("ارجع لوضع الراحة")
                self.detail.setStringValue_("خذ وقتك. ثبت يدك عندما تصل لوضع مريح.")
            elif event_type == "skipped":
                self.setTarget_state_(event["direction"], "skipped")
                self.progress.setStringValue_(f"{event['progress']} / {event['total']}")
                self.instruction.setStringValue_("تم التخطي")
                self.detail.setStringValue_("هذا طبيعي. لن نعتبر الاتجاه متاحًا.")
                self.showMovementButtons_(False)
            elif event_type == "neutral_final":
                self.instruction.setStringValue_(event["instruction"])
                self.detail.setStringValue_(event["detail"])
                self.showMovementButtons_(False)
            elif event_type == "complete":
                self.completed = True
                self.progress.setStringValue_(f"{TOTAL_PROGRESS} / {TOTAL_PROGRESS}")
                self.instruction.setStringValue_("تمت المعايرة ✓")
                self.detail.setStringValue_("وقف. انتهى التسجيل ويمكنك تحريك يدك.")
                self.cancel_button.setTitle_("إغلاق")
                self.connection.setStringValue_("تم حفظ القياسات الحقيقية بأمان")
            elif event_type == "cancelled":
                self.completed = True
                self.instruction.setStringValue_("تم إيقاف المعايرة")
                self.detail.setStringValue_("حُفظ أي تسجيل جزئي بأمان.")
                self.cancel_button.setTitle_("إغلاق")
            elif event_type == "fatal":
                self.completed = True
                self.instruction.setStringValue_("تعذر إكمال المعايرة")
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
    parser.add_argument("--device", help="optional advertised-name fragment or macOS CoreBluetooth UUID")
    parser.add_argument("--scan-seconds", type=float, default=8.0)
    parser.add_argument("--neutral-seconds", type=float, default=4.0)
    parser.add_argument("--final-neutral-seconds", type=float, default=3.0)
    parser.add_argument("--direction-timeout", type=float, default=15.0)
    parser.add_argument("--release-timeout", type=float, default=15.0)
    parser.add_argument("--data-role", choices=("development", "patient"), default="development")
    args = parser.parse_args()
    if min(args.scan_seconds, args.neutral_seconds, args.final_neutral_seconds, args.direction_timeout, args.release_timeout) <= 0:
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
