#!/usr/bin/env python3
"""
Candidate jitter-vs-intent gate (Part 2). Ported 1:1 from the intended
lib/physicalInput/MotionFilters.ts MotionIntentGate design, chained BEFORE
the existing ADAPTIVE_EMA filter on the shipped (twist-dominance-gated)
target series.

Mechanism: a short time-windowed buffer of the raw (pre-filter) target
position. Each sample computes:
  netDisplacement = |current - oldest-in-window|
  pathLength = sum of consecutive step magnitudes within the window
  coherence = netDisplacement / pathLength  (1.0 = straight consistent
    motion, ~0 = back-and-forth/canceling motion)
An intentGain in [MIN_GAIN, 1] is derived from coherence (low coherence ->
low gain -> heavy damping toward the previous corrected value; high
coherence -> gain 1 -> full responsiveness), UNLESS the window's speed
(pathLength / windowSeconds) is at/above a fast-bypass threshold, in which
case gain is forced to 1 (never adds lag to fast deliberate movement).

Only the 3 real ~9.93Hz sessions exist to replay (no 50Hz capture exists
yet - see memory / FINDINGS.md), so this can only prove the gate does not
regress real 9.93Hz behavior and can measure jitter reduction where real
jitter actually exists (session 1). The window is TIME-based (ms), so its
qualitative behavior (not exact sample count) carries to 50Hz; effective
delay at 50Hz is separately estimated with a synthetic step-response test
(see the TS unit tests), since resampling 9.93Hz recordings to 50Hz would
fabricate samples that were never measured.

Usage: python3 tune_intent_gate.py
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


def clamp(v, lo, hi):
    return min(hi, max(lo, v))


def normalized_axis(delta_deg, inverted, sensitivity, dead_zone_deg):
    half_range = BASE_HALF_RANGE_DEG / clamp(sensitivity, 0.25, 4)
    usable_range = max(1.0, half_range - dead_zone_deg)
    magnitude = abs(delta_deg)
    dead = 0.0 if magnitude <= dead_zone_deg else math.copysign(magnitude - dead_zone_deg, delta_deg)
    analog = dead / usable_range
    return clamp(0.5 + (-analog if inverted else analog) * 0.5, 0.0, 1.0)


def build_target_series(records, invert_x, invert_y, sensitivity, dead_zone_deg):
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

    targets, timestamps, gyro_mags, phases = [], [], [], []
    for r in records:
        s = r["sample"]
        twist, raw_pitch, raw_yaw = s["gyroscopeDps"]
        dt = 0.0 if previous_ts is None else max(0.0, (s["timestampMs"] - previous_ts) / 1000.0)
        previous_ts = s["timestampMs"]

        gyro_mag = math.hypot(twist, raw_pitch, raw_yaw)
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

        targets.append({
            "x": normalized_axis(aim_yaw - center_yaw, invert_x, sensitivity, dead_zone_deg),
            "y": normalized_axis(aim_pitch - center_pitch, invert_y, sensitivity, dead_zone_deg),
        })
        timestamps.append(s["timestampMs"])
        gyro_mags.append(gyro_mag)
        phases.append(r["phase"])
    return targets, timestamps, gyro_mags, phases


class IntentGate:
    def __init__(self, window_ms, coherence_low, coherence_high, fast_bypass_units_per_sec, min_gain):
        self.window_ms = window_ms
        self.coherence_low = coherence_low
        self.coherence_high = coherence_high
        self.fast_bypass = fast_bypass_units_per_sec
        self.min_gain = min_gain
        self.buffer = []
        self.corrected = None

    def apply(self, target, timestamp_ms):
        if self.corrected is None:
            self.corrected = dict(target)
            self.buffer.append({"t": timestamp_ms, **target})
            return dict(self.corrected)
        self.buffer.append({"t": timestamp_ms, **target})
        cutoff = timestamp_ms - self.window_ms
        while len(self.buffer) > 1 and self.buffer[0]["t"] < cutoff:
            self.buffer.pop(0)

        first = self.buffer[0]
        net_dx = target["x"] - first["x"]
        net_dy = target["y"] - first["y"]
        net_disp = math.hypot(net_dx, net_dy)
        path_length = 0.0
        for i in range(1, len(self.buffer)):
            path_length += math.hypot(self.buffer[i]["x"] - self.buffer[i - 1]["x"], self.buffer[i]["y"] - self.buffer[i - 1]["y"])
        window_seconds = max((timestamp_ms - first["t"]) / 1000.0, 1e-3)
        speed = path_length / window_seconds

        if speed >= self.fast_bypass or path_length < 1e-6:
            intent_gain = 1.0
        else:
            coherence = clamp(net_disp / path_length, 0.0, 1.0)
            intent_gain = clamp((coherence - self.coherence_low) / (self.coherence_high - self.coherence_low), self.min_gain, 1.0)

        self.corrected = {
            "x": self.corrected["x"] + intent_gain * (target["x"] - self.corrected["x"]),
            "y": self.corrected["y"] + intent_gain * (target["y"] - self.corrected["y"]),
        }
        return dict(self.corrected)


def ema_adaptive(targets, gyro_mags, smoothing):
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


def dist(a, b):
    return math.hypot(a["x"] - b["x"], a["y"] - b["y"])


def load_sessions():
    files = sorted(f for f in os.listdir(RAW_DIR) if f.endswith(".json"))
    out = []
    for fn in files:
        with open(os.path.join(RAW_DIR, fn)) as f:
            data = json.load(f)
        config = data.get("config", {})
        targets, timestamps, gyro_mags, phases = build_target_series(
            data["records"], bool(config.get("invertX", True)), bool(config.get("invertY", False)),
            config.get("sensitivity", 1), config.get("deadZoneDeg", 1.25),
        )
        out.append({"file": fn, "targets": targets, "timestamps": timestamps, "gyro_mags": gyro_mags, "phases": phases})
    return out


def evaluate(sessions, gate_params, smoothing=0.35):
    results = []
    for sess in sessions:
        if gate_params is None:
            gated = sess["targets"]
        else:
            gate = IntentGate(**gate_params)
            gated = [gate.apply(t, ts) for t, ts in zip(sess["targets"], sess["timestamps"])]
        filtered = ema_adaptive(gated, sess["gyro_mags"], smoothing)

        def idxs(phase):
            return [i for i, p in enumerate(sess["phases"]) if p == phase]

        def jitter_metrics(phase):
            ii = idxs(phase)
            if len(ii) < 2:
                return None
            xs = [filtered[i]["x"] for i in ii]
            ys = [filtered[i]["y"] for i in ii]
            steps = [dist(filtered[ii[k]], filtered[ii[k - 1]]) for k in range(1, len(ii))]
            return {"std": statistics.pstdev(xs) + statistics.pstdev(ys), "maxStep": max(steps)}

        def tracking_ratio(phase):
            ii = idxs(phase)
            if not ii:
                return None
            base_f = filtered[ii[0]]
            base_t = sess["targets"][ii[0]]
            peak_f = max(dist(filtered[i], base_f) for i in ii)
            peak_t = max(dist(sess["targets"][i], base_t) for i in ii)
            return peak_f / peak_t if peak_t > 1e-6 else None

        results.append({
            "file": sess["file"],
            "still_start": jitter_metrics("still_start"),
            "still_end": jitter_metrics("still_end"),
            "tiny": tracking_ratio("tiny"),
            "slow": tracking_ratio("slow"),
            "fast": tracking_ratio("fast"),
        })
    return results


def main():
    sessions = load_sessions()
    baseline = evaluate(sessions, None)
    print("BASELINE (no intent gate):")
    for r in baseline:
        print(f"  {r}")

    print(f"\n{'window':>7} {'lo':>5} {'hi':>5} {'fastBP':>7} {'minG':>5}  s1_still_std  s1_maxStep  tiny  slow  fast")
    for window_ms in (120, 160, 200, 260):
        for lo, hi in ((0.3, 0.7), (0.35, 0.75), (0.4, 0.8)):
            params = {"window_ms": window_ms, "coherence_low": lo, "coherence_high": hi, "fast_bypass_units_per_sec": 3.0, "min_gain": 0.05}
            results = evaluate(sessions, params)
            s1 = results[0]
            tiny = [r["tiny"] for r in results if r["tiny"] is not None]
            slow = [r["slow"] for r in results if r["slow"] is not None]
            fast = [r["fast"] for r in results if r["fast"] is not None]
            print(f"{window_ms:>7} {lo:>5.2f} {hi:>5.2f} {3.0:>7.1f} {0.05:>5.2f}  "
                  f"{s1['still_start']['std'] if s1['still_start'] else float('nan'):>12.5f}  "
                  f"{s1['still_start']['maxStep'] if s1['still_start'] else float('nan'):>10.5f}  "
                  f"{statistics.mean(tiny):>4.2f}  {statistics.mean(slow):>4.2f}  {statistics.mean(fast):>4.2f}")


if __name__ == "__main__":
    main()
