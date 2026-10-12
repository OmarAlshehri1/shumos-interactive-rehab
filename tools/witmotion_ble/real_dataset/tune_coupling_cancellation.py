#!/usr/bin/env python3
"""
Candidate fix C (chosen): threshold-gated, magnitude-proportional cross-axis
coupling cancellation, using the pooled symmetric coefficients measured by
analyze_twist_coupling_by_sign.py (kYaw+~0.097, kYaw-~0.091 -- close enough,
per-session direction of the small residual asymmetry flips between
sessions, so a single sign-agnostic coefficient is what the evidence
actually supports; see that script's docstring for why a direction-keyed
constant was rejected).

correctedYaw = rawYaw - clamp(kYaw * twist, -cap, cap) applied only when
|twist| exceeds TWIST_GATE_DPS (real active twisting, not idle sensor
noise -- keeps this correction inert during still/jitter, which Part 2
handles separately).

Grid-searches kYaw and the correction cap fraction against all 3 real
sessions across every phase in the acceptance list.

Usage: python3 tune_coupling_cancellation.py
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
TWIST_GATE_DPS = 8.0


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


def run_session(records, invert_x, invert_y, sensitivity, dead_zone_deg, k_yaw, cap_fraction):
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

    series = []
    phases_order = []
    for r in records:
        s = r["sample"]
        twist, raw_pitch, raw_yaw = s["gyroscopeDps"]
        dt = 0.0 if previous_ts is None else max(0.0, (s["timestampMs"] - previous_ts) / 1000.0)
        previous_ts = s["timestampMs"]

        if k_yaw and abs(twist) > TWIST_GATE_DPS:
            correction = k_yaw * twist
            cap = cap_fraction * abs(raw_yaw) if cap_fraction is not None else abs(correction)
            correction = clamp(correction, -cap, cap) if cap_fraction is not None else correction
            raw_yaw = raw_yaw - correction

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
    return {"maxDrift": max(drifts), "xRange": max(xs) - min(xs), "yRange": max(ys) - min(ys)}


def load_sessions():
    files = sorted(f for f in os.listdir(RAW_DIR) if f.endswith(".json"))
    out = []
    for fn in files:
        with open(os.path.join(RAW_DIR, fn)) as f:
            data = json.load(f)
        config = data.get("config", {})
        out.append({
            "file": fn, "records": data["records"],
            "invert_x": bool(config.get("invertX", True)), "invert_y": bool(config.get("invertY", False)),
            "sensitivity": config.get("sensitivity", 1), "dead_zone_deg": config.get("deadZoneDeg", 1.25),
        })
    return out


TRACK_PHASES = ["rotate_one", "rotate_other", "right", "left", "up", "down", "diagonal", "tiny", "slow", "fast"]


def main():
    sessions = load_sessions()

    def evaluate(k_yaw, cap_fraction):
        rows = []
        for sess in sessions:
            series, phases_order = run_session(sess["records"], sess["invert_x"], sess["invert_y"], sess["sensitivity"], sess["dead_zone_deg"], k_yaw, cap_fraction)
            rows.append({"file": sess["file"], "metrics": {p: phase_metrics(series, phases_order, p) for p in TRACK_PHASES}})
        return rows

    def rot_stats(rows):
        vals = [rows[i]["metrics"][p]["maxDrift"] for i in range(len(rows)) for p in ("rotate_one", "rotate_other") if rows[i]["metrics"][p]]
        return max(vals), sum(vals) / len(vals)

    def aim_floor(rows):
        vals = []
        for row in rows:
            m = row["metrics"]
            if m["right"]: vals.append(m["right"]["xRange"])
            if m["left"]: vals.append(m["left"]["xRange"])
            if m["up"]: vals.append(m["up"]["yRange"])
            if m["down"]: vals.append(m["down"]["yRange"])
        return min(vals)

    baseline = evaluate(0, None)
    b_max, b_mean = rot_stats(baseline)
    b_floor = aim_floor(baseline)
    print(f"BASELINE: rot maxDrift={b_max:.4f} meanDrift={b_mean:.4f} aimFloor={b_floor:.4f}")
    for row in baseline:
        print(f"  {row['file']}: rotate_one={row['metrics']['rotate_one']['maxDrift']:.4f} rotate_other={row['metrics']['rotate_other']['maxDrift']:.4f}")

    print(f"\n{'kYaw':>6} {'cap':>6} {'rotMax':>8} {'rotMean':>8} {'aimFloor':>9}  perSession(rot1,rot2)")
    for k_yaw in (0.05, 0.07, 0.09, 0.10, 0.12, 0.15, 0.20):
        for cap_fraction in (None, 0.5, 0.7):
            rows = evaluate(k_yaw, cap_fraction)
            r_max, r_mean = rot_stats(rows)
            floor = aim_floor(rows)
            per = " ".join(f"({row['metrics']['rotate_one']['maxDrift']:.3f},{row['metrics']['rotate_other']['maxDrift']:.3f})" for row in rows)
            cap_s = f"{cap_fraction}" if cap_fraction is not None else "none"
            print(f"{k_yaw:>6.2f} {cap_s:>6} {r_max:>8.4f} {r_mean:>8.4f} {floor:>9.4f}  {per}")


if __name__ == "__main__":
    main()
