#!/usr/bin/env python3
"""
Diagnoses WHY rotate_one leaks more than rotate_other under the shipped
gyro-integrated model (see replay_twist_rejection.py), using the same three
real RIGHT_HAND captures. Offline only, read-only against raw/.

For each session, for each of rotate_one/rotate_other/left/right/up/down:
  - mean/median signed twistRateDps (gyroscopeDps[0], raw, before any
    reference-roll rotation) -- tells us which raw sign each phase is.
  - the shipped model's signed (not abs) final x-drift from phase start --
    tells us which pointer direction the residual leak pushes toward, and
    lets us compare that to the sign of a genuine "right" vs "left" aim.
  - a regression of the shipped model's integrated pre-center aimYawDeg delta
    (from phase start) against the integrated twist angle (integral of
    twistRateDps dt, from phase start) -- the effective coupling gain
    "how many deg of yaw-leak per deg of actual twist", separately for
    rotate_one and rotate_other, i.e. exactly the asymmetric quantity we
    need to justify a signed correction.

Usage: python3 analyze_twist_asymmetry.py
"""
from __future__ import annotations
import json
import math
import os
import statistics

HERE = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(HERE, "raw")

DEG_TO_RAD = math.pi / 180.0


def regression_slope(xs, ys):
    if len(xs) < 3:
        return None
    xmean = sum(xs) / len(xs)
    ymean = sum(ys) / len(ys)
    var = sum((x - xmean) ** 2 for x in xs)
    if var < 1e-9:
        return None
    return sum((x - xmean) * (y - ymean) for x, y in zip(xs, ys)) / var


def analyze_session(path: str) -> dict:
    with open(path) as f:
        data = json.load(f)
    records = data["records"]
    config = data.get("config", {})

    still_start = [r for r in records if r["phase"] == "still_start"]
    center_angles = still_start[0]["sample"]["anglesDeg"]
    reference_roll_cos = math.cos(-center_angles[0] * DEG_TO_RAD)
    reference_roll_sin = math.sin(-center_angles[0] * DEG_TO_RAD)

    # Replay the shipped model's aimYaw/aimPitch (pre-center, monotonic
    # integrator state) across the WHOLE session in order, so per-phase
    # regressions use the same running state the real controller would.
    aim_yaw = 0.0
    aim_pitch = 0.0
    twist_integral = 0.0
    previous_ts = None

    rows = []  # per record: phase, twistRateDps, aimYawDeg(delta accum handled outside), twist_integral
    for r in records:
        s = r["sample"]
        twist_rate, raw_pitch_rate, raw_yaw_rate = s["gyroscopeDps"]
        dt = 0.0 if previous_ts is None else max(0.0, (s["timestampMs"] - previous_ts) / 1000.0)
        previous_ts = s["timestampMs"]
        pitch_rate = raw_pitch_rate * reference_roll_cos - raw_yaw_rate * reference_roll_sin
        yaw_rate = raw_pitch_rate * reference_roll_sin + raw_yaw_rate * reference_roll_cos
        aim_pitch += pitch_rate * dt
        aim_yaw += yaw_rate * dt
        twist_integral += twist_rate * dt
        rows.append({
            "phase": r["phase"],
            "twistRateDps": twist_rate,
            "aimYawDeg": aim_yaw,
            "aimPitchDeg": aim_pitch,
            "twistIntegralDeg": twist_integral,
        })

    def phase_rows(phase_id):
        return [row for row in rows if row["phase"] == phase_id]

    summary = {}
    for phase_id in ("rotate_one", "rotate_other", "left", "right", "up", "down"):
        pr = phase_rows(phase_id)
        if not pr:
            summary[phase_id] = None
            continue
        twist_rates = [row["twistRateDps"] for row in pr]
        base_yaw = pr[0]["aimYawDeg"]
        base_pitch = pr[0]["aimPitchDeg"]
        base_twist_int = pr[0]["twistIntegralDeg"]
        yaw_deltas = [row["aimYawDeg"] - base_yaw for row in pr]
        pitch_deltas = [row["aimPitchDeg"] - base_pitch for row in pr]
        twist_int_deltas = [row["twistIntegralDeg"] - base_twist_int for row in pr]
        summary[phase_id] = {
            "n": len(pr),
            "meanTwistRateDps": statistics.mean(twist_rates),
            "medianTwistRateDps": statistics.median(twist_rates),
            "finalYawDeltaDeg": yaw_deltas[-1],
            "maxAbsYawDeltaDeg": max(yaw_deltas, key=abs),
            "finalPitchDeltaDeg": pitch_deltas[-1],
            "finalTwistIntegralDeg": twist_int_deltas[-1],
            # coupling gain candidate: yaw-leak per deg of actual twist
            "yawPerTwistSlope": regression_slope(twist_int_deltas, yaw_deltas),
            "pitchPerTwistSlope": regression_slope(twist_int_deltas, pitch_deltas),
        }
    return {"file": os.path.basename(path), "phases": summary}


def main():
    files = sorted(f for f in os.listdir(RAW_DIR) if f.endswith(".json"))
    results = [analyze_session(os.path.join(RAW_DIR, f)) for f in files]
    for res in results:
        print(f"\n=== {res['file']} ===")
        for phase_id, s in res["phases"].items():
            if s is None:
                print(f"  {phase_id:12s}: (no data)")
                continue
            print(
                f"  {phase_id:12s} n={s['n']:3d}  meanTwistRate={s['meanTwistRateDps']:8.2f} dps  "
                f"finalTwistIntegral={s['finalTwistIntegralDeg']:8.2f} deg  "
                f"finalYawDelta={s['finalYawDeltaDeg']:7.3f} deg  maxAbsYawDelta={s['maxAbsYawDeltaDeg']:7.3f} deg  "
                f"yawPerTwistSlope={s['yawPerTwistSlope']}  pitchPerTwistSlope={s['pitchPerTwistSlope']}"
            )
    with open(os.path.join(HERE, "twist_asymmetry_report.json"), "w") as f:
        json.dump(results, f, indent=2)
    print("\nWritten to twist_asymmetry_report.json")


if __name__ == "__main__":
    main()
