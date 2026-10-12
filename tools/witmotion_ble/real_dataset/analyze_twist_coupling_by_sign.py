#!/usr/bin/env python3
"""
Pooled, sign-split regression of raw pitch/yaw gyro rate against raw twist
rate (gyroscopeDps[0]) across ALL samples of all 3 real RIGHT_HAND captures,
split by sign(twistRateDps).

Why pooled-by-sign instead of per-phase-label: analyze_twist_asymmetry.py
showed the rotate_one/rotate_other PHASE LABELS do not carry a consistent
physical twist direction across sessions (net integrated twist angle has the
same sign for both phases in 2 of the 3 sessions) -- the capture protocol
never recorded which way "the other direction" was for a given session, and
self-directed execution was inconsistent. Fitting an asymmetric coefficient
keyed to those labels would fit session-execution noise, repeating the
mistake FINDINGS.md already flagged for the old fused-angle model.

What IS session-independent: gyroscopeDps[0] sign is anchored to the
physical mounting orientation on the same right hand, so if cross-axis
coupling (twisting the wrist also produces a genuine raw pitch/yaw-rate
component, not a math artifact -- see ContinuousMotionController's
docstring) is mount-direction-dependent, it should show up as a sign(twist)
asymmetry that IS consistent when pooling all samples across sessions.

This only looks at RAW gyro fields, independent of any phase label.

Usage: python3 analyze_twist_coupling_by_sign.py
"""
from __future__ import annotations
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(HERE, "raw")

TWIST_ACTIVE_THRESHOLD_DPS = 8.0  # only samples where real twisting is happening


def regression_slope_no_intercept(xs, ys):
    """Least-squares slope forced through the origin (y = k*x): physically
    correct here because zero twist-rate must predict zero coupling."""
    denom = sum(x * x for x in xs)
    if denom < 1e-9:
        return None
    return sum(x * y for x, y in zip(xs, ys)) / denom


def main():
    files = sorted(f for f in os.listdir(RAW_DIR) if f.endswith(".json"))

    pos_twist, pos_pitch, pos_yaw = [], [], []
    neg_twist, neg_pitch, neg_yaw = [], [], []
    per_session_rows = []

    for fn in files:
        with open(os.path.join(RAW_DIR, fn)) as f:
            data = json.load(f)
        session_pos = {"twist": [], "pitch": [], "yaw": []}
        session_neg = {"twist": [], "pitch": [], "yaw": []}
        for r in data["records"]:
            twist, pitch, yaw = r["sample"]["gyroscopeDps"]
            if abs(twist) < TWIST_ACTIVE_THRESHOLD_DPS:
                continue
            bucket_all = (pos_twist, pos_pitch, pos_yaw) if twist > 0 else (neg_twist, neg_pitch, neg_yaw)
            bucket_all[0].append(twist)
            bucket_all[1].append(pitch)
            bucket_all[2].append(yaw)
            bucket_session = session_pos if twist > 0 else session_neg
            bucket_session["twist"].append(twist)
            bucket_session["pitch"].append(pitch)
            bucket_session["yaw"].append(yaw)

        row = {"file": fn}
        for label, bucket in (("pos", session_pos), ("neg", session_neg)):
            k_pitch = regression_slope_no_intercept(bucket["twist"], bucket["pitch"])
            k_yaw = regression_slope_no_intercept(bucket["twist"], bucket["yaw"])
            row[f"{label}_n"] = len(bucket["twist"])
            row[f"{label}_kPitch"] = k_pitch
            row[f"{label}_kYaw"] = k_yaw
        per_session_rows.append(row)

    print(f"Twist-active threshold: |twistRateDps| > {TWIST_ACTIVE_THRESHOLD_DPS}\n")
    print(f"{'session':<45} {'n+':>5} {'kPitch+':>9} {'kYaw+':>9}   {'n-':>5} {'kPitch-':>9} {'kYaw-':>9}")
    for row in per_session_rows:
        def fmt(v):
            return f"{v:9.4f}" if v is not None else f"{'n/a':>9}"
        print(
            f"{row['file']:<45} {row['pos_n']:>5} {fmt(row['pos_kPitch'])} {fmt(row['pos_kYaw'])}   "
            f"{row['neg_n']:>5} {fmt(row['neg_kPitch'])} {fmt(row['neg_kYaw'])}"
        )

    pooled_k_pitch_pos = regression_slope_no_intercept(pos_twist, pos_pitch)
    pooled_k_yaw_pos = regression_slope_no_intercept(pos_twist, pos_yaw)
    pooled_k_pitch_neg = regression_slope_no_intercept(neg_twist, neg_pitch)
    pooled_k_yaw_neg = regression_slope_no_intercept(neg_twist, neg_yaw)

    print(f"\nPOOLED (all 3 sessions, n+={len(pos_twist)}, n-={len(neg_twist)}):")
    print(f"  twist>0:  kPitch={pooled_k_pitch_pos:.4f}  kYaw={pooled_k_yaw_pos:.4f}")
    print(f"  twist<0:  kPitch={pooled_k_pitch_neg:.4f}  kYaw={pooled_k_yaw_neg:.4f}")

    with open(os.path.join(HERE, "twist_coupling_by_sign_report.json"), "w") as f:
        json.dump({
            "twistActiveThresholdDps": TWIST_ACTIVE_THRESHOLD_DPS,
            "perSession": per_session_rows,
            "pooled": {
                "n_pos": len(pos_twist), "n_neg": len(neg_twist),
                "kPitchPos": pooled_k_pitch_pos, "kYawPos": pooled_k_yaw_pos,
                "kPitchNeg": pooled_k_pitch_neg, "kYawNeg": pooled_k_yaw_neg,
            },
        }, f, indent=2)
    print("\nWritten to twist_coupling_by_sign_report.json")


if __name__ == "__main__":
    main()
