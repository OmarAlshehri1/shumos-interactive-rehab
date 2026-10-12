#!/usr/bin/env python3
"""
Quantitative REAL-hardware still-phase noise characterization (overnight
task Part 4). Read-only over raw/ — never mutates a capture, never pools in
the simulated calibration_data/ directory (see FINDINGS.md / manifest.json
for why that would misrepresent real hardware evidence).

For each of the 3 real RIGHT_HAND sessions, and pooled across all three,
computes per-axis statistics over BOTH still phases (still_start, still_end)
for:
  - gyroscopeDps (deg/s)   -> gyro bias (mean) and gyro noise (std/RMS/MAD)
  - accelerationG (g)      -> accelerometer noise while stationary
  - anglesDeg (deg)        -> the device's own fused-angle jitter while still
  - short-window variance  -> gyroscopeDps variance over a rolling 5-sample
                              window, to see whether noise clusters in bursts
                              rather than being uniform (relevant to jitter
                              suppression design, Part 5/6)

This does NOT tune or change any controller parameter — it only measures
what the real sensor's stationary noise floor actually looks like, so a
future dead-zone/tremor-envelope choice can be justified against real
numbers instead of a guess (see the overnight brief's explicit "do not
choose dead zones from guesses").
"""
import json
import math
import os
import statistics

HERE = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(HERE, "raw")
OUT_PATH = os.path.join(HERE, "still_noise_report.json")

STILL_PHASES = ("still_start", "still_end")
AXES = ("x", "y", "z")


def stats1d(values):
    if not values:
        return None
    mean = statistics.fmean(values)
    variance = statistics.pvariance(values) if len(values) > 1 else 0.0
    std = math.sqrt(variance)
    rms = math.sqrt(statistics.fmean(v * v for v in values))
    median = statistics.median(values)
    mad = statistics.median([abs(v - median) for v in values])
    return {
        "n": len(values),
        "mean": mean,
        "std": std,
        "rms": rms,
        "median": median,
        "mad": mad,
        "min": min(values),
        "max": max(values),
        "peakToPeak": max(values) - min(values),
    }


def rolling_window_variance(values, window=5):
    if len(values) < window:
        return None
    variances = []
    for i in range(len(values) - window + 1):
        chunk = values[i:i + window]
        variances.append(statistics.pvariance(chunk))
    return stats1d(variances)


def load_session(path):
    with open(path) as f:
        d = json.load(f)
    records = [r for r in d.get("records", []) if r.get("phase") in STILL_PHASES]
    return d, records


def axis_series(records, field, axis_index):
    return [r["sample"][field][axis_index] for r in records]


def gyro_magnitude_series(records):
    return [math.hypot(*r["sample"]["gyroscopeDps"]) for r in records]


def analyze_records(records):
    result = {"sampleCount": len(records)}
    for field, unit in (("gyroscopeDps", "degPerSec"), ("accelerationG", "g"), ("anglesDeg", "deg")):
        per_axis = {}
        for index, axis in enumerate(AXES):
            series = axis_series(records, field, index)
            per_axis[axis] = stats1d(series)
        result[f"{field}_{unit}"] = per_axis

    gyro_mag = gyro_magnitude_series(records)
    result["gyroMagnitudeDps"] = stats1d(gyro_mag)
    result["gyroMagnitudeShortWindowVariance"] = rolling_window_variance(gyro_mag, window=5)

    # Orientation drift while "still": how far anglesDeg wandered from the phase's own first sample -
    # captures slow fused-angle drift a pure per-sample std would miss.
    if records:
        first_angles = records[0]["sample"]["anglesDeg"]
        drift = [math.dist(r["sample"]["anglesDeg"], first_angles) for r in records]
        result["orientationDriftFromPhaseStartDeg"] = stats1d(drift)
    return result


def build():
    sessions = []
    pooled_records = []
    for fn in sorted(os.listdir(RAW_DIR)):
        if not fn.endswith(".json"):
            continue
        path = os.path.join(RAW_DIR, fn)
        d, still_records = load_session(path)
        pooled_records.extend(still_records)
        sessions.append({
            "file": fn,
            "date": d.get("capturedAt"),
            "sampleRateHzMeasured": None,  # cross-referenced from manifest.json, not recomputed here
            "stillPhases": STILL_PHASES,
            "analysis": analyze_records(still_records),
        })

    report = {
        "generatedBy": "analyze_still_noise.py",
        "note": (
            "REAL WT901BLECL RIGHT_HAND still-phase (still_start + still_end) noise "
            "characterization, per session and pooled. Source: raw sensor fields only "
            "(gyroscopeDps/accelerationG/anglesDeg), never the embedded `output` field. "
            "Simulated data is excluded (see manifest.json)."
        ),
        "sessions": sessions,
        "pooledAcrossAllSessions": analyze_records(pooled_records),
    }
    with open(OUT_PATH, "w") as f:
        json.dump(report, f, indent=2)

    print(f"Analyzed {len(sessions)} sessions, {len(pooled_records)} pooled still-phase samples -> {OUT_PATH}")
    pooled = report["pooledAcrossAllSessions"]
    print("\nPooled still-phase gyro noise (deg/s), per axis (bias=mean, noise=std):")
    for axis in AXES:
        a = pooled["gyroscopeDps_degPerSec"][axis]
        if a:
            print(f"  axis[{axis}]: bias(mean)={a['mean']:.4f}  std={a['std']:.4f}  rms={a['rms']:.4f}  mad={a['mad']:.4f}  p2p={a['peakToPeak']:.4f}")
    print("\nPooled still-phase acceleration noise (g), per axis:")
    for axis in AXES:
        a = pooled["accelerationG_g"][axis]
        if a:
            print(f"  axis[{axis}]: mean={a['mean']:.5f}  std={a['std']:.5f}  rms={a['rms']:.5f}")
    print("\nPooled still-phase fused-angle jitter (deg), per axis:")
    for axis in AXES:
        a = pooled["anglesDeg_deg"][axis]
        if a:
            print(f"  axis[{axis}]: std={a['std']:.4f}  mad={a['mad']:.4f}  p2p={a['peakToPeak']:.4f}")
    if pooled.get("orientationDriftFromPhaseStartDeg"):
        d = pooled["orientationDriftFromPhaseStartDeg"]
        print(f"\nOrientation drift from each still-phase's own start (deg): mean={d['mean']:.4f} max={d['max']:.4f}")
    gm = pooled["gyroMagnitudeDps"]
    print(f"\nGyro magnitude while still (deg/s): mean={gm['mean']:.4f} std={gm['std']:.4f} p95-ish max={gm['max']:.4f}")


if __name__ == "__main__":
    build()
