#!/usr/bin/env python3
"""
Offline replay of the gyro-integrated twist-rejection model (shipped in
lib/physicalInput/ContinuousMotionController.ts) against all three real
WT901BLECL RIGHT_HAND diagnostic captures, compared against the previous
fused-angle geometric model it replaced.

Why this script exists: a REAL RIGHT_HAND WT901BLECL test at 50Hz showed the
fused-angle geometric model (BEFORE below) still let wrist twist move the
pointer strongly, despite passing synthetic math tests. This replay is the
"real recorded telemetry" evidence required before asking for another
physical test — see the PR/commit discussion. It is not a substitute for a
live hardware check; it is the evidence that justifies running one.

BEFORE (fused-angle geometric model): reconstructs a rotation matrix from
each sample's fused anglesDeg=[roll,pitch,yaw] relative to the still_start
reference, and reads off the swing-rotated local-X forward vector. Provably
roll-invariant in isolation (see the ContinuousMotionController tests) but,
per this replay, still shows large rotate_one/rotate_other drift on real
data, because the DEVICE'S OWN fused yaw swings substantially during a real
twist (up to ~47deg in these captures) even though the physical rotation
axis is not far from local X.

AFTER (gyro-integrated model, shipped): integrates aim angle directly from
raw gyroscopeDps[1]/[2] (pitch-rate/yaw-rate) each sample and NEVER
integrates gyroscopeDps[0] (twist-rate) at all - dropping wrist twist by
never reading it, rather than trying to algebraically cancel its effect on a
fused value that turns out not to be trustworthy during fast rotation. A
one-time reference-roll correction (captured at the still_start sample,
mirroring commitCenter()'s recenter-time snapshot) re-projects the raw
gy/gz pair for whatever angle the strap/mount happens to sit at. A
time-based (not sample-count-based) settle/re-anchor rule slowly corrects
long-session drift during genuine stillness, frozen during real motion -
mirrors applyConservativeDriftCorrection() exactly.

Usage:
  python3 replay_twist_rejection.py
Writes replay_twist_rejection_report.json next to this script and prints a
summary table.
"""
from __future__ import annotations
import json
import math
import os
from dataclasses import dataclass

HERE = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(HERE, "raw")
OUT_PATH = os.path.join(HERE, "replay_twist_rejection_report.json")

DEG_TO_RAD = math.pi / 180.0
BASE_HALF_RANGE_DEG = 28.0

# Must match ContinuousMotionController.ts exactly.
DRIFT_SETTLE_GYRO_DPS = 6.0
DRIFT_SETTLE_REQUIRED_MS = 300.0
DRIFT_REANCHOR_PER_SECOND = 1.5


def clamp(v: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, v))


def angular_delta_deg(angle: float, center: float) -> float:
    return ((angle - center + 540.0) % 360.0) - 180.0


def normalized_axis(delta_deg: float, inverted: bool, sensitivity: float, dead_zone_deg: float) -> float:
    half_range = BASE_HALF_RANGE_DEG / clamp(sensitivity, 0.25, 4)
    usable_range = max(1.0, half_range - dead_zone_deg)
    magnitude = abs(delta_deg)
    dead = 0.0 if magnitude <= dead_zone_deg else math.copysign(magnitude - dead_zone_deg, delta_deg)
    analog = dead / usable_range
    return clamp(0.5 + (-analog if inverted else analog) * 0.5, 0.0, 1.0)


# ---------------------------------------------------------------------------
# BEFORE: fused-angle geometric model (rotation-matrix swing about local X)
# ---------------------------------------------------------------------------

def euler_zyx_matrix(roll_deg: float, pitch_deg: float, yaw_deg: float):
    r, p, y = roll_deg * DEG_TO_RAD, pitch_deg * DEG_TO_RAD, yaw_deg * DEG_TO_RAD
    cr, sr, cp, sp, cy, sy = math.cos(r), math.sin(r), math.cos(p), math.sin(p), math.cos(y), math.sin(y)
    return (
        (cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr),
        (sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr),
        (-sp, cp * sr, cp * cr),
    )


def transpose3(m):
    return tuple(tuple(m[j][i] for j in range(3)) for i in range(3))


def mat_vec3(m, v):
    return tuple(sum(m[i][j] * v[j] for j in range(3)) for i in range(3))


def before_target(center_angles, cur_angles, invert_x: bool, invert_y: bool, sensitivity: float, dead_zone_deg: float):
    reference = euler_zyx_matrix(*center_angles)
    current = euler_zyx_matrix(*cur_angles)
    world_forward = mat_vec3(current, (1.0, 0.0, 0.0))
    forward = mat_vec3(transpose3(reference), world_forward)
    horizontal_deg = math.degrees(math.atan2(forward[1], forward[0]))
    vertical_deg = math.degrees(math.atan2(-forward[2], math.hypot(forward[0], forward[1])))
    return {
        "x": normalized_axis(horizontal_deg, invert_x, sensitivity, dead_zone_deg),
        "y": normalized_axis(vertical_deg, invert_y, sensitivity, dead_zone_deg),
    }


# ---------------------------------------------------------------------------
# AFTER: gyro-integrated twist-rejection model (shipped)
# ---------------------------------------------------------------------------

@dataclass
class AfterState:
    aim_yaw_deg: float = 0.0
    aim_pitch_deg: float = 0.0
    center_yaw_deg: float = 0.0
    center_pitch_deg: float = 0.0
    reference_roll_cos: float = 1.0
    reference_roll_sin: float = 0.0
    settled_since_ms: float | None = None


def after_step(state: AfterState, gyro_dps, dt_seconds: float, invert_x: bool, invert_y: bool, sensitivity: float, dead_zone_deg: float, timestamp_ms: float):
    twist_rate, raw_pitch_rate, raw_yaw_rate = gyro_dps
    gyro_magnitude = math.hypot(twist_rate, raw_pitch_rate, raw_yaw_rate)
    pitch_rate = raw_pitch_rate * state.reference_roll_cos - raw_yaw_rate * state.reference_roll_sin
    yaw_rate = raw_pitch_rate * state.reference_roll_sin + raw_yaw_rate * state.reference_roll_cos
    state.aim_pitch_deg += pitch_rate * dt_seconds
    state.aim_yaw_deg += yaw_rate * dt_seconds

    if gyro_magnitude >= DRIFT_SETTLE_GYRO_DPS:
        state.settled_since_ms = None
    else:
        if state.settled_since_ms is None:
            state.settled_since_ms = timestamp_ms
        elif timestamp_ms - state.settled_since_ms >= DRIFT_SETTLE_REQUIRED_MS:
            rate = clamp(DRIFT_REANCHOR_PER_SECOND * dt_seconds, 0.0, 1.0)
            state.center_yaw_deg += rate * (state.aim_yaw_deg - state.center_yaw_deg)
            state.center_pitch_deg += rate * (state.aim_pitch_deg - state.center_pitch_deg)

    return {
        "x": normalized_axis(state.aim_yaw_deg - state.center_yaw_deg, invert_x, sensitivity, dead_zone_deg),
        "y": normalized_axis(state.aim_pitch_deg - state.center_pitch_deg, invert_y, sensitivity, dead_zone_deg),
    }


def dist(a, b) -> float:
    return math.hypot(a["x"] - b["x"], a["y"] - b["y"])


PHASES = ["rotate_one", "rotate_other", "right", "left", "up", "down", "diagonal", "tiny", "slow", "fast"]


def phase_metrics(series, phases_order, phase_id):
    idxs = [i for i, p in enumerate(phases_order) if p == phase_id]
    if not idxs:
        return None
    baseline = series[idxs[0]]
    drifts = [dist(series[i], baseline) for i in idxs]
    xs = [series[i]["x"] for i in idxs]
    ys = [series[i]["y"] for i in idxs]
    return {
        "n": len(idxs),
        "maxDriftFromPhaseStart": max(drifts),
        "xRange": max(xs) - min(xs),
        "yRange": max(ys) - min(ys),
    }


def analyze_session(path: str) -> dict:
    with open(path) as f:
        data = json.load(f)
    config = data.get("config", {})
    records = data.get("records", [])
    invert_x = bool(config.get("invertX", True))
    invert_y = bool(config.get("invertY", False))
    sensitivity = config.get("sensitivity", 1)
    dead_zone_deg = config.get("deadZoneDeg", 1.25)

    still_start = [r for r in records if r["phase"] == "still_start"]
    if not still_start:
        raise ValueError(f"{path}: no still_start phase, cannot center")
    center_angles = still_start[0]["sample"]["anglesDeg"]

    after_state = AfterState(
        reference_roll_cos=math.cos(-center_angles[0] * DEG_TO_RAD),
        reference_roll_sin=math.sin(-center_angles[0] * DEG_TO_RAD),
    )

    before_series, after_series, phases_order = [], [], []
    previous_ts = None
    for r in records:
        s = r["sample"]
        before_series.append(before_target(center_angles, s["anglesDeg"], invert_x, invert_y, sensitivity, dead_zone_deg))
        dt = 0.0 if previous_ts is None else max(0.0, (s["timestampMs"] - previous_ts) / 1000.0)
        previous_ts = s["timestampMs"]
        after_series.append(after_step(after_state, s["gyroscopeDps"], dt, invert_x, invert_y, sensitivity, dead_zone_deg, s["timestampMs"]))
        phases_order.append(r["phase"])

    result = {"file": os.path.basename(path), "sampleCount": len(records), "models": {}}
    for name, series in (("before_fused_angle_geometric", before_series), ("after_gyro_integrated_shipped", after_series)):
        result["models"][name] = {phase: phase_metrics(series, phases_order, phase) for phase in PHASES}
    return result


def main():
    files = sorted(f for f in os.listdir(RAW_DIR) if f.endswith(".json"))
    report = {"generatedBy": "replay_twist_rejection.py", "sessions": [analyze_session(os.path.join(RAW_DIR, f)) for f in files]}
    with open(OUT_PATH, "w") as f:
        json.dump(report, f, indent=2)

    print(f"{'session':<45} {'model':<28} {'rot1 maxDrift':>13} {'rot2 maxDrift':>13} {'right xRange':>12} {'left xRange':>11} {'up yRange':>9} {'down yRange':>11}")
    for s in report["sessions"]:
        for model_name, m in s["models"].items():
            def g(phase, key):
                return m[phase][key] if m.get(phase) else float("nan")
            print(
                f"{s['file']:<45} {model_name:<28} "
                f"{g('rotate_one','maxDriftFromPhaseStart'):>13.4f} {g('rotate_other','maxDriftFromPhaseStart'):>13.4f} "
                f"{g('right','xRange'):>12.4f} {g('left','xRange'):>11.4f} {g('up','yRange'):>9.4f} {g('down','yRange'):>11.4f}"
            )
        print()
    print(f"Full report written to {OUT_PATH}")


if __name__ == "__main__":
    main()
