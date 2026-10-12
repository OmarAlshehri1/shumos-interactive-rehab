#!/usr/bin/env python3
"""
Candidate fix for the asymmetric RIGHT/LEFT twist leak observed live at
50Hz, validated offline against the 3 real 9.93Hz RIGHT_HAND captures.

Why not a hardcoded per-direction coefficient: analyze_twist_asymmetry.py
showed rotate_one/rotate_other phase labels don't carry a consistent
physical direction across sessions, and analyze_twist_coupling_by_sign.py
showed the pooled raw cross-axis coupling is nearly symmetric by
sign(twistRateDps) (kYaw+ 0.0968 vs kYaw- 0.0909) with the per-session
asymmetry flipping direction between sessions (session1: + bigger;
session3: - bigger) -- i.e. there is no stable, data-supported "always
correct twist>0 more" constant to fit. Baking in a fixed sign-keyed
coefficient from this dataset would be fitting session-to-session noise,
repeating the mistake FINDINGS.md already documents for the old model.

Candidate instead: TWIST-DOMINANCE GATING. When a sample's angular rate is
mostly twist (gyroscopeDps[0] dominates the 3-axis magnitude), damp the
residual raw pitch/yaw rate before it is de-rolled and integrated into aim.
This is symmetric in CODE (no hardcoded direction), but adaptive in EFFECT:
whichever physical twist direction happens to produce more real cross-axis
coupling for a given user/mount gets damped more, because the damping
is driven by the instantaneous ratio of that sample's own axes, not a
global constant. During genuine aim (right/left/up/down), twistRateDps is
near zero (confirmed: -0.38..+0.19 dps mean vs the rotate phases' active
twisting), so twist-dominance stays low and the gate stays open (no
suppression) -- it cannot suppress genuine aiming, only twist-dominant
samples.

This script grid-searches (threshold, maxSuppression) to find the smallest
correction that meaningfully reduces rotate_one/rotate_other drift without
moving right/left/up/down/diagonal/tiny/slow/fast metrics from the shipped
(no-gate) baseline.

Usage: python3 tune_twist_dominance_gate.py
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


def run_session(records, invert_x, invert_y, sensitivity, dead_zone_deg, threshold, max_suppression):
    still_start = [r for r in records if r["phase"] == "still_start"]
    center_angles = still_start[0]["sample"]["anglesDeg"]
    reference_roll_cos = math.cos(-center_angles[0] * DEG_TO_RAD)
    reference_roll_sin = math.sin(-center_angles[0] * DEG_TO_RAD)

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

        gyro_mag = math.hypot(twist, raw_pitch, raw_yaw)
        if threshold is not None and gyro_mag > 1e-6:
            twist_dominance = abs(twist) / gyro_mag
            suppression = clamp((twist_dominance - threshold) / max(1e-6, 1 - threshold), 0.0, 1.0)
            damping = 1 - suppression * max_suppression
            raw_pitch *= damping
            raw_yaw *= damping

        pitch_rate = raw_pitch * reference_roll_cos - raw_yaw * reference_roll_sin
        yaw_rate = raw_pitch * reference_roll_sin + raw_yaw * reference_roll_cos
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
    return {"maxDrift": max(drifts), "xRange": max(xs) - min(xs), "yRange": max(ys) - min(ys)}


def load_sessions():
    files = sorted(f for f in os.listdir(RAW_DIR) if f.endswith(".json"))
    out = []
    for fn in files:
        with open(os.path.join(RAW_DIR, fn)) as f:
            data = json.load(f)
        config = data.get("config", {})
        out.append({
            "file": fn,
            "records": data["records"],
            "invert_x": bool(config.get("invertX", True)),
            "invert_y": bool(config.get("invertY", False)),
            "sensitivity": config.get("sensitivity", 1),
            "dead_zone_deg": config.get("deadZoneDeg", 1.25),
        })
    return out


PHASES_TO_TRACK = ["rotate_one", "rotate_other", "right", "left", "up", "down", "diagonal"]


def evaluate(sessions, threshold, max_suppression):
    per_session = []
    for sess in sessions:
        series, phases_order = run_session(
            sess["records"], sess["invert_x"], sess["invert_y"], sess["sensitivity"], sess["dead_zone_deg"],
            threshold, max_suppression,
        )
        metrics = {p: phase_metrics(series, phases_order, p) for p in PHASES_TO_TRACK}
        per_session.append({"file": sess["file"], "metrics": metrics})
    return per_session


def summarize(per_session):
    rot_drift = []
    aim_ranges = []
    for s in per_session:
        for p in ("rotate_one", "rotate_other"):
            if s["metrics"][p]:
                rot_drift.append(s["metrics"][p]["maxDrift"])
        for p in ("right", "left"):
            if s["metrics"][p]:
                aim_ranges.append(s["metrics"][p]["xRange"])
        for p in ("up", "down"):
            if s["metrics"][p]:
                aim_ranges.append(s["metrics"][p]["yRange"])
        if s["metrics"]["diagonal"]:
            aim_ranges.append(s["metrics"]["diagonal"]["xRange"])
            aim_ranges.append(s["metrics"]["diagonal"]["yRange"])
    return {
        "maxRotDrift": max(rot_drift) if rot_drift else None,
        "meanRotDrift": sum(rot_drift) / len(rot_drift) if rot_drift else None,
        "minAimRange": min(aim_ranges) if aim_ranges else None,
    }


def main():
    sessions = load_sessions()

    baseline = evaluate(sessions, threshold=None, max_suppression=0.0)
    baseline_summary = summarize(baseline)
    print("BASELINE (no gate, shipped model):")
    for s in baseline:
        print(f"  {s['file']}: {s['metrics']}")
    print(f"  summary: {baseline_summary}\n")

    print(f"{'threshold':>10} {'maxSuppress':>12} {'maxRotDrift':>12} {'meanRotDrift':>13} {'minAimRange':>12}")
    grid = []
    for threshold in (0.4, 0.5, 0.6, 0.7, 0.8):
        for max_suppression in (0.3, 0.5, 0.7, 0.85, 1.0):
            per_session = evaluate(sessions, threshold, max_suppression)
            summary = summarize(per_session)
            grid.append({"threshold": threshold, "maxSuppression": max_suppression, "summary": summary, "perSession": per_session})
            print(f"{threshold:>10.2f} {max_suppression:>12.2f} {summary['maxRotDrift']:>12.4f} {summary['meanRotDrift']:>13.4f} {summary['minAimRange']:>12.4f}")

    with open(os.path.join(HERE, "twist_dominance_gate_tuning_report.json"), "w") as f:
        json.dump({"baseline": {"summary": baseline_summary, "perSession": baseline}, "grid": grid}, f, indent=2)
    print("\nWritten to twist_dominance_gate_tuning_report.json")


if __name__ == "__main__":
    main()
