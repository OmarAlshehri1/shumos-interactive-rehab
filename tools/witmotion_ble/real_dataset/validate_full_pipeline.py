#!/usr/bin/env python3
"""
Final BEFORE/AFTER regression for the shipped Part 1 (twist-dominance gate)
+ Part 2 (intent gate) changes, replayed against all 3 real RIGHT_HAND
captures, across every phase in the task's offline-validation checklist:
  1. rotate_one drift   2. rotate_other drift   3. still/jitter
  4. left aim           5. right aim            6. up aim
  7. down aim           8. diagonal              9. tiny
  10. slow              11. fast

BEFORE = the model shipped immediately prior to this task (gyro-integrated,
no twist-dominance gate, no intent gate).
AFTER  = BEFORE + twist-dominance gate (threshold=0.92, maxSuppression=0.7)
         + intent gate (window=180ms, coherence 0.35-0.75, min gain 0.10)
         chained in front of ADAPTIVE_EMA, exactly as wired in
         ContinuousMotionController.observe().

Usage: python3 validate_full_pipeline.py
"""
from __future__ import annotations
import json
import math
import os
import statistics

HERE = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(HERE, "raw")

DEG_TO_RAD = math.pi / 180.0
BASE_HALF_RANGE_DEG = 28.0
DRIFT_SETTLE_GYRO_DPS = 6.0
DRIFT_SETTLE_REQUIRED_MS = 300.0
DRIFT_REANCHOR_PER_SECOND = 1.5
TWIST_DOMINANCE_THRESHOLD = 0.92
TWIST_DOMINANCE_MAX_SUPPRESSION = 0.7
INTENT_WINDOW_MS = 180
INTENT_COHERENCE_LOW = 0.35
INTENT_COHERENCE_HIGH = 0.75
INTENT_FAST_BYPASS_UNITS_PER_SEC = 3.0
INTENT_MIN_GAIN = 0.10


def clamp(v, lo, hi):
    return min(hi, max(lo, v))


def normalized_axis(delta_deg, inverted, sensitivity, dead_zone_deg):
    half_range = BASE_HALF_RANGE_DEG / clamp(sensitivity, 0.25, 4)
    usable_range = max(1.0, half_range - dead_zone_deg)
    magnitude = abs(delta_deg)
    dead = 0.0 if magnitude <= dead_zone_deg else math.copysign(magnitude - dead_zone_deg, delta_deg)
    analog = dead / usable_range
    return clamp(0.5 + (-analog if inverted else analog) * 0.5, 0.0, 1.0)


class IntentGate:
    def __init__(self):
        self.buffer = []
        self.corrected = None

    def apply(self, target, timestamp_ms):
        if self.corrected is None:
            self.corrected = dict(target)
            self.buffer.append({"t": timestamp_ms, **target})
            return dict(self.corrected)
        self.buffer.append({"t": timestamp_ms, **target})
        cutoff = timestamp_ms - INTENT_WINDOW_MS
        while len(self.buffer) > 1 and self.buffer[0]["t"] < cutoff:
            self.buffer.pop(0)
        first = self.buffer[0]
        net_disp = math.hypot(target["x"] - first["x"], target["y"] - first["y"])
        path_length = sum(
            math.hypot(self.buffer[i]["x"] - self.buffer[i - 1]["x"], self.buffer[i]["y"] - self.buffer[i - 1]["y"])
            for i in range(1, len(self.buffer))
        )
        window_seconds = max((timestamp_ms - first["t"]) / 1000.0, 1e-3)
        speed = path_length / window_seconds
        if speed >= INTENT_FAST_BYPASS_UNITS_PER_SEC or path_length < 1e-6:
            gain = 1.0
        else:
            coherence = clamp(net_disp / path_length, 0.0, 1.0)
            gain = clamp((coherence - INTENT_COHERENCE_LOW) / (INTENT_COHERENCE_HIGH - INTENT_COHERENCE_LOW), INTENT_MIN_GAIN, 1.0)
        self.corrected = {
            "x": self.corrected["x"] + gain * (target["x"] - self.corrected["x"]),
            "y": self.corrected["y"] + gain * (target["y"] - self.corrected["y"]),
        }
        return dict(self.corrected)


def ema_adaptive(targets, gyro_mags, smoothing=0.35):
    out = []
    value = None
    for t, g in zip(targets, gyro_mags):
        if value is None:
            value = dict(t)
            out.append(dict(value))
            continue
        strength = clamp(smoothing, 0, 0.9)
        deliberate = clamp(g / 240.0, 0, 1)
        retained = strength * (1 - deliberate * 0.7)
        applied = 1 - retained
        value = {"x": value["x"] * retained + t["x"] * applied, "y": value["y"] * retained + t["y"] * applied}
        out.append(dict(value))
    return out


def run_session(records, invert_x, invert_y, sensitivity, dead_zone_deg, use_twist_gate, use_intent_gate):
    still_start = [r for r in records if r["phase"] == "still_start"]
    center_angles = still_start[0]["sample"]["anglesDeg"]
    roll_cos = math.cos(-center_angles[0] * DEG_TO_RAD)
    roll_sin = math.sin(-center_angles[0] * DEG_TO_RAD)

    aim_yaw = 0.0
    aim_pitch = 0.0
    center_yaw = 0.0
    center_pitch = 0.0
    settled_since_ms = None
    previous_ts = None
    intent_gate = IntentGate() if use_intent_gate else None

    targets, phases = [], []
    for r in records:
        s = r["sample"]
        twist, raw_pitch, raw_yaw = s["gyroscopeDps"]
        dt = 0.0 if previous_ts is None else max(0.0, (s["timestampMs"] - previous_ts) / 1000.0)
        previous_ts = s["timestampMs"]

        gyro_mag = math.hypot(twist, raw_pitch, raw_yaw)
        if use_twist_gate:
            dominance = abs(twist) / gyro_mag if gyro_mag > 1e-6 else 0.0
            suppression = clamp((dominance - TWIST_DOMINANCE_THRESHOLD) / (1 - TWIST_DOMINANCE_THRESHOLD), 0.0, 1.0)
            damping = 1 - suppression * TWIST_DOMINANCE_MAX_SUPPRESSION
            raw_pitch *= damping
            raw_yaw *= damping

        pitch_rate = raw_pitch * roll_cos - raw_yaw * roll_sin
        yaw_rate = raw_pitch * roll_sin + raw_yaw * roll_cos
        aim_pitch += pitch_rate * dt
        aim_yaw += yaw_rate * dt

        if gyro_mag >= DRIFT_SETTLE_GYRO_DPS:
            settled_since_ms = None
        else:
            if settled_since_ms is None:
                settled_since_ms = s["timestampMs"]
            elif s["timestampMs"] - settled_since_ms >= DRIFT_SETTLE_REQUIRED_MS:
                rate = clamp(DRIFT_REANCHOR_PER_SECOND * dt, 0.0, 1.0)
                center_yaw += rate * (aim_yaw - center_yaw)
                center_pitch += rate * (aim_pitch - center_pitch)

        target = {
            "x": normalized_axis(aim_yaw - center_yaw, invert_x, sensitivity, dead_zone_deg),
            "y": normalized_axis(aim_pitch - center_pitch, invert_y, sensitivity, dead_zone_deg),
        }
        gated = intent_gate.apply(target, s["timestampMs"]) if intent_gate else target
        targets.append({"raw": target, "gated": gated, "gyroMag": gyro_mag})
        phases.append(r["phase"])
    filtered = ema_adaptive([t["gated"] for t in targets], [t["gyroMag"] for t in targets])
    return targets, filtered, phases


def dist(a, b):
    return math.hypot(a["x"] - b["x"], a["y"] - b["y"])


def phase_report(filtered, raw_targets, phases, phase_id):
    idxs = [i for i, p in enumerate(phases) if p == phase_id]
    if not idxs:
        return None
    baseline = filtered[idxs[0]]
    drifts = [dist(filtered[i], baseline) for i in idxs]
    xs = [filtered[i]["x"] for i in idxs]
    ys = [filtered[i]["y"] for i in idxs]
    steps = [dist(filtered[idxs[k]], filtered[idxs[k - 1]]) for k in range(1, len(idxs))]
    base_raw = raw_targets[idxs[0]]["raw"]
    peak_raw = max(dist(raw_targets[i]["raw"], base_raw) for i in idxs)
    peak_filtered = max(drifts)
    return {
        "maxDrift": round(max(drifts), 4),
        "xRange": round(max(xs) - min(xs), 4),
        "yRange": round(max(ys) - min(ys), 4),
        "jitterStd": round(statistics.pstdev(xs) + statistics.pstdev(ys), 5) if len(idxs) > 1 else None,
        "maxStep": round(max(steps), 5) if steps else None,
        "trackingRatio": round(peak_filtered / peak_raw, 3) if peak_raw > 1e-6 else None,
    }


PHASES = ["rotate_one", "rotate_other", "still_start", "still_end", "left", "right", "up", "down", "diagonal", "tiny", "slow", "fast"]


def main():
    files = sorted(f for f in os.listdir(RAW_DIR) if f.endswith(".json"))
    report = {"before": [], "after": []}
    for fn in files:
        with open(os.path.join(RAW_DIR, fn)) as f:
            data = json.load(f)
        config = data.get("config", {})
        invert_x = bool(config.get("invertX", True))
        invert_y = bool(config.get("invertY", False))
        sensitivity = config.get("sensitivity", 1)
        dead_zone_deg = config.get("deadZoneDeg", 1.25)
        records = data["records"]

        for label, use_twist, use_intent in (("before", False, False), ("after", True, True)):
            raw_targets, filtered, phases = run_session(records, invert_x, invert_y, sensitivity, dead_zone_deg, use_twist, use_intent)
            entry = {"file": fn, "phases": {p: phase_report(filtered, raw_targets, phases, p) for p in PHASES}}
            report[label].append(entry)

    with open(os.path.join(HERE, "final_before_after_report.json"), "w") as f:
        json.dump(report, f, indent=2)

    print(f"{'phase':<14} {'metric':<12} {'session':<45} {'BEFORE':>10} {'AFTER':>10}")
    for i, fn in enumerate(files):
        for phase in PHASES:
            b = report["before"][i]["phases"][phase]
            a = report["after"][i]["phases"][phase]
            if b is None:
                continue
            for metric in ("maxDrift", "jitterStd", "maxStep", "trackingRatio"):
                bv, av = b.get(metric), a.get(metric)
                if bv is None and av is None:
                    continue
                print(f"{phase:<14} {metric:<12} {fn:<45} {bv if bv is not None else float('nan'):>10} {av if av is not None else float('nan'):>10}")
    print("\nWritten to final_before_after_report.json")


if __name__ == "__main__":
    main()
