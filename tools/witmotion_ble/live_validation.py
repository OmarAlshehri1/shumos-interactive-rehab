#!/usr/bin/env python3
"""Final live validation tool for RIGHT_HAND_RAISE - real-time, no fixed script.

Unlike every capture_*.py tool in this directory, this one does not record a
prescribed sequence of repetitions. It connects to the real sensor, runs a
brief live neutral confirmation, then continuously feeds every sample
through the SAME unmodified ``semantic_detector.RightHandRaiseSession`` used
by ``replay_gate.py``, and shows one always-current status panel:

    حساس اليد اليمنى           (device label)
    متصل / غير متصل            (connection state)
    تمت المعايرة ✓ / يحتاج معايرة  (calibration state)
    الحركة الحالية              (current movement)
    RIGHT_HAND_RAISE ✓          (flashes when the detector fires)
    عدد الحركات المكتشفة         (live detected-movement counter)

A reference checklist of the ten conditions this tool is meant to be tried
against tomorrow (rest, very-small raise, small-slow raise, small-fast
raise, medium raise, larger raise, hold, release, a changed comfortable
rest position, and one final raise) is shown alongside the live status so a
therapist can work through them freely, in any order, without the tool
gating or scoring anything - this is validation, not data capture. Every
detected event is still logged to a timestamped JSON file on exit (never
overwriting a previous run) so tonight's/tomorrow's results can be reviewed
afterward.

This tool does NOT fabricate hardware data. If no sensor is found, or if
this user has no existing calibration (RIGHT_WRIST profile.json /
analysis.json under calibration_data/), it says so plainly and refuses to
pretend detection is happening.

This is an isolated development prototype. It does not touch games,
Firebase, patient records, audio, or Munsit.
"""

from __future__ import annotations

import argparse
import asyncio
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
        NSTextAlignmentRight,
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
    from calibration_engine import BaselineProfile, MotionSample, vector_norm
    from capture_calibration import DATA_ROOT, NOTIFY_UUID, SERVICE_UUID, advertised_name, find_sensor
    from protocol import REALTIME_FRAME, WitmotionFrameStream, parse_realtime_frame
    from replay_gate import PROFILE_FILE, ANALYSIS_FILE, NEUTRAL_BASELINE_FILE, SESSION_DIR as DEFAULT_SESSION_DIR, hybrid_baseline
    from semantic_detector import RightHandRaiseSession
except ImportError:  # Support module execution from the repository root.
    from tools.witmotion_ble.calibration_engine import BaselineProfile, MotionSample, vector_norm
    from tools.witmotion_ble.capture_calibration import DATA_ROOT, NOTIFY_UUID, SERVICE_UUID, advertised_name, find_sensor
    from tools.witmotion_ble.protocol import REALTIME_FRAME, WitmotionFrameStream, parse_realtime_frame
    from tools.witmotion_ble.replay_gate import PROFILE_FILE, ANALYSIS_FILE, NEUTRAL_BASELINE_FILE, SESSION_DIR as DEFAULT_SESSION_DIR, hybrid_baseline
    from tools.witmotion_ble.semantic_detector import RightHandRaiseSession


ANGLE_AXIS_INDEX = {"roll_deg": 0, "pitch_deg": 1, "yaw_deg": 2}
NEUTRAL_CONFIRM_SECONDS = 2.5

CHECKLIST_AR = [
    "وضع الراحة (بدون حركة)",
    "رفع صغير جدًا",
    "رفع صغير وبطيء",
    "رفع صغير وسريع",
    "رفع متوسط",
    "رفع كبير",
    "تثبيت اليد للأعلى (Hold)",
    "إنزال اليد (Release)",
    "تغيير وضع الراحة المريح",
    "رفعة أخيرة",
]


def load_calibration(session_dir: Path) -> dict[str, Any] | None:
    """Load this user's existing RIGHT_WRIST calibration, or None if missing.

    Mirrors replay_gate.py's own load_raise_axis/load_directional_prototypes
    (same files, same fields) - reused via import above, not reimplemented -
    but tolerates missing files instead of raising, since this tool must be
    able to say "يحتاج معايرة" rather than crash when run for a user/session
    that has not completed Face-ID enrollment yet.
    """
    analysis_path = session_dir / ANALYSIS_FILE.name if session_dir != DEFAULT_SESSION_DIR else ANALYSIS_FILE
    profile_path = session_dir / PROFILE_FILE.name if session_dir != DEFAULT_SESSION_DIR else PROFILE_FILE
    neutral_path = session_dir / NEUTRAL_BASELINE_FILE
    if not (analysis_path.exists() and profile_path.exists() and neutral_path.exists()):
        return None
    analysis = json.loads(analysis_path.read_text(encoding="utf-8"))
    evidence = analysis.get("personalized_raise_evidence")
    if not evidence:
        return None
    profile = json.loads(profile_path.read_text(encoding="utf-8"))
    directions = profile.get("accepted_directions", {})
    return {
        "raise_axis_index": ANGLE_AXIS_INDEX[evidence["dominant_angle_axis"]],
        "raise_axis_name": evidence["dominant_angle_axis"],
        "raise_sign": int(evidence["raise_direction_sign"]),
        "directional_prototypes": {name: tuple(data["angle_vector_deg"]) for name, data in directions.items()},
        "neutral_path": neutral_path,
    }


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


class LiveValidationWorker:
    def __init__(self, args: argparse.Namespace, ui_events: queue.Queue[dict[str, Any]], commands: queue.Queue[str]) -> None:
        self.args = args
        self.ui_events = ui_events
        self.commands = commands
        self.session_dir = DATA_ROOT / args.session
        self.calibration = load_calibration(self.session_dir)
        self.detected_events: list[dict[str, Any]] = []
        self.device_name = ""
        self.device_id = ""
        self.finished = False
        self.run_id = f"liveval_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}_{uuid4().hex[:8]}"
        self.log_path = self.session_dir / f"{self.run_id}_events.json"

        self._neutral_samples: list[MotionSample] = []
        self._neutral_started_at = 0.0
        self._session: RightHandRaiseSession | None = None
        self._noise_source: BaselineProfile | None = None
        self._recalibrate_requested = False

    def emit(self, event_type: str, **payload: Any) -> None:
        self.ui_events.put({"type": event_type, **payload})

    def begin_neutral_wait(self, now: float) -> None:
        self._neutral_samples = []
        self._neutral_started_at = now
        self.emit("calibrating")

    def try_finish_neutral(self, sample: MotionSample) -> bool:
        self._neutral_samples.append(sample)
        cutoff = sample.timestamp - NEUTRAL_CONFIRM_SECONDS
        self._neutral_samples = [item for item in self._neutral_samples if item.timestamp >= cutoff]
        ready = (
            len(self._neutral_samples) >= 15
            and self._neutral_samples[-1].timestamp - self._neutral_samples[0].timestamp >= NEUTRAL_CONFIRM_SECONDS * 0.85
        )
        if not ready or self.calibration is None or self._noise_source is None:
            return False
        baseline = hybrid_baseline(self._neutral_samples, self._noise_source)
        self._session = RightHandRaiseSession(
            baseline,
            self.calibration["raise_axis_index"],
            self.calibration["raise_sign"],
            directional_prototypes=self.calibration["directional_prototypes"],
        )
        self.emit("calibrated", raise_axis=self.calibration["raise_axis_name"])
        return True

    def handle_sample(self, index: int, sample: MotionSample) -> None:
        if self.calibration is None:
            return
        if self._recalibrate_requested:
            self._recalibrate_requested = False
            self.begin_neutral_wait(sample.timestamp)
        if self._session is None:
            if self.try_finish_neutral(sample):
                pass
            return

        previous_state = self._session.state
        event = self._session.observe(index, sample)
        if self._session.state != previous_state:
            self.emit("state_changed", state=self._session.state)
        if event is not None:
            record = {
                "detected_at_utc": utc_now(),
                "sample_index": index,
                "elapsed_s": round(sample.timestamp, 3),
                "detection_path": event.movement.detection_path,
                "peak_angle_delta_deg": round(event.movement.peak_angle_delta_deg, 3),
                "nearest_prototype": event.nearest_prototype,
                "nearest_prototype_cosine": event.nearest_prototype_cosine,
            }
            self.detected_events.append(record)
            self.emit("raise_detected", count=len(self.detected_events), **record)

    def write_log(self) -> None:
        if not self.detected_events and self.calibration is None:
            return
        payload = {
            "run_id": self.run_id,
            "session": self.args.session,
            "device_name": self.device_name,
            "device_id": self.device_id,
            "calibrated": self.calibration is not None,
            "raise_axis": self.calibration["raise_axis_name"] if self.calibration else None,
            "detected_events": self.detected_events,
            "total_detected": len(self.detected_events),
            "checklist_reference_ar": CHECKLIST_AR,
            "ended_at_utc": utc_now(),
        }
        self.log_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    async def run_async(self) -> None:
        try:
            if self.calibration is None:
                self.emit(
                    "no_calibration",
                    text="لا توجد معايرة سابقة لهذا المستخدم (RIGHT_WRIST). شغّل faceid_calibration.py أولًا.",
                )

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

                if self.calibration is not None:
                    from replay_gate import load_rows as _load_rows  # local import: avoid module-level coupling for the no-calibration path
                    neutral_rows = _load_rows(self.calibration["neutral_path"])
                    self._noise_source = BaselineProfile.from_samples([row.sample for row in neutral_rows])

                index = 0

                def on_notification(_: Any, payload: bytearray) -> None:
                    nonlocal index
                    for frame in stream.feed(payload):
                        if frame[1] != REALTIME_FRAME:
                            continue
                        first_packet.set()
                        now = time.monotonic()
                        telemetry = parse_realtime_frame(frame)
                        sample = MotionSample(now, telemetry.acceleration_g, telemetry.gyroscope_dps, telemetry.angles_deg)
                        self.handle_sample(index, sample)
                        index += 1

                await client.start_notify(characteristic, on_notification)
                await asyncio.wait_for(first_packet.wait(), timeout=5.0)
                self.emit("connected", device_name=self.device_name)
                if self.calibration is not None:
                    self.begin_neutral_wait(time.monotonic())

                while not self.finished and not disconnected.is_set():
                    while True:
                        try:
                            command = self.commands.get_nowait()
                        except queue.Empty:
                            break
                        if command == "recalibrate":
                            self._session = None
                            self._recalibrate_requested = True
                        elif command == "reset_count":
                            self.detected_events = []
                            self.emit("count_reset")
                        elif command == "quit":
                            self.finished = True
                    await asyncio.sleep(0.05)

                if disconnected.is_set():
                    self.emit("disconnected", text="انقطع اتصال الحساس.")
        except Exception as exc:
            self.emit("fatal", text=f"تعذر تشغيل الأداة: {exc}")
        finally:
            self.write_log()

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
        self.worker = LiveValidationWorker(args, self.ui_events, self.commands)
        return self

    def makeLabel_frame_size_align_(self, text: str, frame: Any, size: float, alignment: Any) -> NSTextField:
        label = NSTextField.alloc().initWithFrame_(frame)
        label.setStringValue_(text)
        label.setBezeled_(False)
        label.setEditable_(False)
        label.setSelectable_(False)
        label.setDrawsBackground_(False)
        label.setAlignment_(alignment)
        label.setFont_(NSFont.systemFontOfSize_(size))
        return label

    def applicationDidFinishLaunching_(self, _: Any) -> None:
        style = NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable
        self.window = NSWindow.alloc().initWithContentRect_styleMask_backing_defer_(
            NSMakeRect(0, 0, 1040, 680), style, NSBackingStoreBuffered, False
        )
        self.window.setTitle_("التحقق المباشر النهائي: رفع اليد اليمنى")
        self.window.setMinSize_((900, 620))
        self.window.center()
        content = self.window.contentView()
        content.setWantsLayer_(True)
        content.layer().setBackgroundColor_(NSColor.colorWithCalibratedRed_green_blue_alpha_(0.045, 0.065, 0.10, 1.0).CGColor())

        center = NSTextAlignmentCenter
        right = NSTextAlignmentRight

        self.device_title = self.makeLabel_frame_size_align_("حساس اليد اليمنى", NSMakeRect(40, 610, 640, 40), 28, center)
        self.device_title.setTextColor_(NSColor.whiteColor())
        content.addSubview_(self.device_title)

        self.connection_status = self.makeLabel_frame_size_align_("غير متصل", NSMakeRect(40, 570, 640, 34), 22, center)
        content.addSubview_(self.connection_status)

        self.calibration_status = self.makeLabel_frame_size_align_("—", NSMakeRect(40, 530, 640, 30), 20, center)
        content.addSubview_(self.calibration_status)

        self.movement_title = self.makeLabel_frame_size_align_("الحركة الحالية", NSMakeRect(40, 470, 640, 30), 18, center)
        self.movement_title.setTextColor_(NSColor.colorWithCalibratedWhite_alpha_(0.7, 1.0))
        content.addSubview_(self.movement_title)

        self.movement_value = self.makeLabel_frame_size_align_("—", NSMakeRect(40, 400, 640, 60), 42, center)
        self.movement_value.setTextColor_(NSColor.colorWithCalibratedWhite_alpha_(0.5, 1.0))
        content.addSubview_(self.movement_value)

        self.count_value = self.makeLabel_frame_size_align_("عدد الحركات المكتشفة: 0", NSMakeRect(40, 350, 640, 34), 22, center)
        self.count_value.setTextColor_(NSColor.whiteColor())
        content.addSubview_(self.count_value)

        self.state_value = self.makeLabel_frame_size_align_("", NSMakeRect(40, 315, 640, 24), 14, center)
        self.state_value.setTextColor_(NSColor.colorWithCalibratedWhite_alpha_(0.45, 1.0))
        content.addSubview_(self.state_value)

        # Reference checklist panel (right-aligned Arabic list, not sensor-gated).
        checklist_header = self.makeLabel_frame_size_align_("قائمة الاختبار المرجعية", NSMakeRect(720, 610, 280, 28), 16, right)
        checklist_header.setTextColor_(NSColor.colorWithCalibratedWhite_alpha_(0.8, 1.0))
        content.addSubview_(checklist_header)

        checklist_text = "\n".join(f"{i + 1}. {item}" for i, item in enumerate(CHECKLIST_AR))
        checklist_box = self.makeLabel_frame_size_align_(checklist_text, NSMakeRect(700, 260, 320, 340), 15, right)
        checklist_box.setTextColor_(NSColor.colorWithCalibratedWhite_alpha_(0.75, 1.0))
        checklist_box.cell().setWraps_(True)
        content.addSubview_(checklist_box)

        self.recalibrate_button = self.makeButtonWithTitle_frame_action_("إعادة المعايرة", NSMakeRect(60, 60, 180, 44), "recalibratePressed:")
        self.recalibrate_button.setEnabled_(False)
        content.addSubview_(self.recalibrate_button)
        self.reset_button = self.makeButtonWithTitle_frame_action_("تصفير العداد", NSMakeRect(260, 60, 180, 44), "resetPressed:")
        self.reset_button.setEnabled_(False)
        content.addSubview_(self.reset_button)
        self.quit_button = self.makeButtonWithTitle_frame_action_("إنهاء", NSMakeRect(880, 60, 120, 44), "quitPressed:")
        content.addSubview_(self.quit_button)

        self.window.makeKeyAndOrderFront_(None)
        NSApplication.sharedApplication().activateIgnoringOtherApps_(True)
        NSTimer.scheduledTimerWithTimeInterval_target_selector_userInfo_repeats_(0.08, self, "pollEvents:", None, True)
        threading.Thread(target=self.worker.run, name="wt901-live-validation", daemon=True).start()

    def makeButtonWithTitle_frame_action_(self, title: str, frame: Any, action: str) -> NSButton:
        button = NSButton.alloc().initWithFrame_(frame)
        button.setTitle_(title)
        button.setFont_(NSFont.systemFontOfSize_(16))
        button.setTarget_(self)
        button.setAction_(action)
        return button

    def recalibratePressed_(self, _: Any) -> None:
        self.commands.put("recalibrate")

    def resetPressed_(self, _: Any) -> None:
        self.commands.put("reset_count")

    def quitPressed_(self, _: Any) -> None:
        self.commands.put("quit")
        NSApplication.sharedApplication().terminate_(None)

    def pollEvents_(self, _: Any) -> None:
        green = NSColor.colorWithCalibratedRed_green_blue_alpha_(0.10, 0.62, 0.32, 1.0)
        red = NSColor.colorWithCalibratedRed_green_blue_alpha_(0.75, 0.18, 0.18, 1.0)
        amber = NSColor.colorWithCalibratedRed_green_blue_alpha_(0.85, 0.6, 0.1, 1.0)
        dim = NSColor.colorWithCalibratedWhite_alpha_(0.5, 1.0)
        while True:
            try:
                event = self.ui_events.get_nowait()
            except queue.Empty:
                return
            event_type = event["type"]
            if event_type == "connection":
                self.connection_status.setStringValue_(event["text"])
                self.connection_status.setTextColor_(amber)
            elif event_type == "connected":
                self.connection_status.setStringValue_(f"متصل ✓  {event['device_name']}")
                self.connection_status.setTextColor_(green)
            elif event_type == "no_calibration":
                self.calibration_status.setStringValue_("يحتاج معايرة")
                self.calibration_status.setTextColor_(red)
                self.movement_value.setStringValue_(event["text"])
            elif event_type == "calibrating":
                self.calibration_status.setStringValue_("جاري تثبيت وضع الراحة…")
                self.calibration_status.setTextColor_(amber)
            elif event_type == "calibrated":
                self.calibration_status.setStringValue_(f"تمت المعايرة ✓ (محور: {event['raise_axis']})")
                self.calibration_status.setTextColor_(green)
                self.movement_value.setStringValue_("بلا حركة")
                self.movement_value.setTextColor_(dim)
                self.recalibrate_button.setEnabled_(True)
                self.reset_button.setEnabled_(True)
            elif event_type == "state_changed":
                self.state_value.setStringValue_(f"الحالة الداخلية: {event['state']}")
                if event["state"] == "IDLE":
                    self.movement_value.setStringValue_("بلا حركة")
                    self.movement_value.setTextColor_(dim)
                elif event["state"] == "GESTURE_ACTIVE":
                    self.movement_value.setStringValue_("حركة قيد الرصد…")
                    self.movement_value.setTextColor_(amber)
            elif event_type == "raise_detected":
                self.movement_value.setStringValue_("RIGHT_HAND_RAISE ✓")
                self.movement_value.setTextColor_(green)
                self.count_value.setStringValue_(f"عدد الحركات المكتشفة: {event['count']}")
            elif event_type == "count_reset":
                self.count_value.setStringValue_("عدد الحركات المكتشفة: 0")
            elif event_type == "disconnected":
                self.connection_status.setStringValue_("غير متصل")
                self.connection_status.setTextColor_(red)
                self.calibration_status.setStringValue_(event["text"])
            elif event_type == "fatal":
                self.connection_status.setStringValue_("خطأ")
                self.connection_status.setTextColor_(red)
                self.calibration_status.setStringValue_(event["text"])

    def applicationShouldTerminateAfterLastWindowClosed_(self, _: Any) -> bool:
        return True

    def applicationWillTerminate_(self, _: Any) -> None:
        self.commands.put("quit")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", default="right_hand_adult_sim_20260902_01")
    parser.add_argument("--device", help="optional advertised-name fragment or macOS CoreBluetooth UUID")
    parser.add_argument("--scan-seconds", type=float, default=8.0)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    application = NSApplication.sharedApplication()
    application.setActivationPolicy_(NSApplicationActivationPolicyRegular)
    delegate = AppDelegate.alloc().initWithArgs_(args)
    application.setDelegate_(delegate)
    AppHelper.runEventLoop()


if __name__ == "__main__":
    main()
