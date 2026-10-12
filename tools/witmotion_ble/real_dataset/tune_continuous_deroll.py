#!/usr/bin/env python3
"""
Candidate fix B: use the device's CURRENT fused roll (anglesDeg[0]), read
fresh every sample, to build the de-roll rotation basis for raw pitch/yaw
gyro rate -- instead of freezing that basis once at recenter time (the
shipped model's referenceRollCos/Sin, computed once in commitCenter()).

Why this is different from the rejected "BEFORE" fused-angle model: BEFORE
used fused YAW as the pointer signal itself (aim comes directly from a
fused angle that is not twist-independent during fast rotation -- see
ContinuousMotionController's class doc). This candidate still derives aim
ONLY by integrating raw gyroscopeDps[1]/[2] every sample (never fused yaw,
never gyroscopeDps[0]); fused ROLL is used only to continuously rebuild the
2D rotation basis that separates that raw rate into pitch/yaw components --
a bounded coordinate transform, not an integrated pointer quantity. Any
residual roll estimation error only misrotates whatever real (small)
pitch/yaw rate exists at that instant; it does not inject fused yaw's own
drift into the aim total.

Why it can plausibly fix a DIRECTIONAL asymmetry without any hardcoded
sign: the shipped one-time reference is exactly correct only at the roll
angle captured at recenter. As actual roll departs from that frozen
reference, the fixed-basis projection increasingly misprojects the raw
pitch/yaw-rate vector -- and if the resting/neutral roll is not exactly
centered between the two twist extremes (very plausible: comfortable wrist
neutral is rarely the midpoint of full pronation/supination range), the
LARGER-excursion twist direction accumulates more misprojection error than
the smaller one. Continuously re-deriving the basis from the current roll
removes this frozen-reference error entirely, self-adapting to whichever
direction traveled further that session -- no direction-keyed constant.

Validated the same way as the shipped model: replayed against all 3 real
RIGHT_HAND captures, comparing rotate_one/rotate_other drift AND
right/left/up/down/diagonal ranges against the shipped one-time-reference
baseline.

Usage: python3 tune_continuous_deroll.py
"""
from __future__ import annotations
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(HERE, "raw")

DEG_TO_RAD = math.pi / 180.0
BASE_HALF_RANGE_DEG = 28.0
DRIFT_SETTLE_GYRO_DPS = 6.0
DRIFT_SETTLE_REQUIRED_MS = 300.0
DRIFT_REANCHOR_PER_SECOND = 1.5


def clamp(v, lo, hi):
    return min(hi, max(lo, v))


def normalized_axis(delta_deg, inverted, sensitivity, dead_zone_deg):
    half_range = BASE_HALF_RANGE_DEG / clamp(sensitivity, 0.25, 4)
    usable_range = max(1.0, half_range - dead_zone_deg)
    magnitude = abs(delta_deg)
    dead = 0.0 if magnitude <= dead_zone_deg else math.copysign(magnitude - dead_zone_deg, delta_deg)
    analog = dead / usable_range
    return clamp(0.5 + (-analog if inverted else analog) * 0.5, 0.0, 1.0)


def dist(a, b):
    return math.hypot(a["x"] - b["x"], a["y"] - b["y"])


def run_session(records, invert_x, invert_y, sensitivity, dead_zone_deg, continuous_deroll: bool):
    still_start = [r for r in records if r["phase"] == "still_start"]
    center_angles = still_start[0]["sample"]["anglesDeg"]
    frozen_cos = math.cos(-center_angles[0] * DEG_TO_RAD)
    frozen_sin = math.sin(-center_angles[0] * DEG_TO_RAD)

    aim_yaw = 0.0
    aim_pitch = 0.0
    center_yaw = 0.0
    center_pitch = 0.0
    settled_since_ms = None
    previous_ts = None

    series = []
    phases_order = []
    for r in records:
        s = r["sample"]
        twist, raw_pitch, raw_yaw = s["gyroscopeDps"]
        dt = 0.0 if previous_ts is None else max(0.0, (s["timestampMs"] - previous_ts) / 1000.0)
        previous_ts = s["timestampMs"]

        if continuous_deroll:
            current_roll = s["anglesDeg"][0]
            roll_cos = math.cos(-current_roll * DEG_TO_RAD)
            roll_sin = math.sin(-current_roll * DEG_TO_RAD)
        else:
            roll_cos, roll_sin = frozen_cos, frozen_sin

        pitch_rate = raw_pitch * roll_cos - raw_yaw * roll_sin
        yaw_rate = raw_pitch * roll_sin + raw_yaw * roll_cos
        aim_pitch += pitch_rate * dt
        aim_yaw += yaw_rate * dt

        gyro_mag = math.hypot(twist, raw_pitch, raw_yaw)
        if gyro_mag >= DRIFT_SETTLE_GYRO_DPS:
            settled_since_ms = None
        else:
            if settled_since_ms is None:
                settled_since_ms = s["timestampMs"]
            elif s["timestampMs"] - settled_since_ms >= DRIFT_SETTLE_REQUIRED_MS:
                rate = clamp(DRIFT_REANCHOR_PER_SECOND * dt, 0.0, 1.0)
                center_yaw += rate * (aim_yaw - center_yaw)
                center_pitch += rate * (aim_pitch - center_pitch)

        series.append({
            "x": normalized_axis(aim_yaw - center_yaw, invert_x, sensitivity, dead_zone_deg),
            "y": normalized_axis(aim_pitch - center_pitch, invert_y, sensitivity, dead_zone_deg),
        })
        phases_order.append(r["phase"])
    return series, phases_order


def phase_metrics(series, phases_order, phase_id):
    idxs = [i for i, p in enumerate(phases_order) if p == phase_id]
    if not idxs:
        return None
    baseline = series[idxs[0]]
    drifts = [dist(series[i], baseline) for i in idxs]
    xs = [series[i]["x"] for i in idxs]
    ys = [series[i]["y"] for i in idxs]
    return {"maxDrift": round(max(drifts), 4), "xRange": round(max(xs) - min(xs), 4), "yRange": round(max(ys) - min(ys), 4)}


PHASES = ["rotate_one", "rotate_other", "right", "left", "up", "down", "diagonal", "tiny", "slow", "fast"]


def main():
    files = sorted(f for f in os.listdir(RAW_DIR) if f.endswith(".json"))
    print(f"{'session':<45} {'model':<20} " + " ".join(f"{p:>13}" for p in PHASES))
    for fn in files:
        with open(os.path.join(RAW_DIR, fn)) as f:
            data = json.load(f)
        config = data.get("config", {})
        invert_x = bool(config.get("invertX", True))
        invert_y = bool(config.get("invertY", False))
        sensitivity = config.get("sensitivity", 1)
        dead_zone_deg = config.get("deadZoneDeg", 1.25)
        records = data["records"]
        for label, continuous in (("frozen(shipped)", False), ("continuous_deroll", True)):
            series, phases_order = run_session(records, invert_x, invert_y, sensitivity, dead_zone_deg, continuous)
            row = []
            for p in PHASES:
                m = phase_metrics(series, phases_order, p)
                row.append(m["maxDrift"] if m else float("nan"))
            print(f"{fn:<45} {label:<20} " + " ".join(f"{v:>13.4f}" for v in row))
        print()


if __name__ == "__main__":
    main()
