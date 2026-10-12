#!/usr/bin/env python3
"""
Offline replay of the CURRENT scalar rotation-compensation model vs a
CANDIDATE quaternion swing-twist model, against every preserved REAL
WT901BLECL RIGHT_HAND diagnostic capture.

This does not touch the live app. It only reads raw sensor fields
(accelerationG, gyroscopeDps, anglesDeg) from each capture's records and
re-derives pointer output offline, so it is a fair apples-to-apples replay
regardless of what rotationCompensationX the capture itself was recorded
with.

Why swing-twist:
  The current model computes X = deltaYaw - k * deltaRoll using
  independently-wrapped Euler-angle deltas. That linear combination is only
  a valid approximation of 3D rotation composition for small angles. The
  rotate_one/rotate_other phases in every real capture involve ~70-100 deg
  of actual rotation, far outside that regime, which is why a single scalar
  k (however it is fitted) leaves residual drift: the true relationship
  between "spin about the forward axis" and "yaw/pitch readout" is not
  linear at these angles.

  Swing-twist decomposition of the *relative quaternion* Qrel = inv(Q0) * Qcur
  about the sensor's own local roll axis (1,0,0) is the exact (not linear-
  approximation) geometric answer: rotating purely about local X leaves the
  local X axis itself unchanged, so the "swing" component - and therefore
  the pointer aim derived from it - is mathematically invariant under pure
  twist, not just approximately compensated by a fitted slope.

Usage:
  python3 replay_models.py
Writes replay_report.json next to this script and prints a summary table.
"""
from __future__ import annotations
import json
import math
import os
import statistics
from dataclasses import dataclass, field

HERE = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(HERE, "raw")
OUT_PATH = os.path.join(HERE, "replay_report.json")

# ---------------------------------------------------------------------------
# Quaternion / swing-twist math (pure python, no numpy dependency)
# ---------------------------------------------------------------------------

Quat = tuple  # (w, x, y, z)


def euler_deg_to_quat(roll_deg: float, pitch_deg: float, yaw_deg: float) -> Quat:
    """Standard aerospace roll(X)-pitch(Y)-yaw(Z) intrinsic convention,
    matching anglesDeg=[roll,pitch,yaw] and ContinuousMotionController's
    axisValue mapping (index0=roll about local X, index1=pitch about local
    Y, index2=yaw about local Z)."""
    r = math.radians(roll_deg) / 2.0
    p = math.radians(pitch_deg) / 2.0
    y = math.radians(yaw_deg) / 2.0
    cr, sr = math.cos(r), math.sin(r)
    cp, sp = math.cos(p), math.sin(p)
    cy, sy = math.cos(y), math.sin(y)
    w = cr * cp * cy + sr * sp * sy
    x = sr * cp * cy - cr * sp * sy
    yq = cr * sp * cy + sr * cp * sy
    z = cr * cp * sy - sr * sp * cy
    return (w, x, yq, z)


def quat_conj(q: Quat) -> Quat:
    w, x, y, z = q
    return (w, -x, -y, -z)


def quat_mul(a: Quat, b: Quat) -> Quat:
    aw, ax, ay, az = a
    bw, bx, by, bz = b
    return (
        aw * bw - ax * bx - ay * by - az * bz,
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
    )


def quat_normalize(q: Quat) -> Quat:
    w, x, y, z = q
    n = math.sqrt(w * w + x * x + y * y + z * z)
    if n < 1e-12:
        return (1.0, 0.0, 0.0, 0.0)
    return (w / n, x / n, y / n, z / n)


def quat_rotate(q: Quat, v):
    """Rotate 3-vector v by unit quaternion q."""
    w, x, y, z = q
    vx, vy, vz = v
    # q * (0,v) * q^-1, expanded
    ix = w * vx + y * vz - z * vy
    iy = w * vy + z * vx - x * vz
    iz = w * vz + x * vy - y * vx
    iw = -x * vx - y * vy - z * vz
    rx = ix * w - iw * x - iy * z + iz * y
    ry = iy * w - iw * y - iz * x + ix * z
    rz = iz * w - iw * z - ix * y + iy * x
    return (rx, ry, rz)


def swing_twist_about_x(q: Quat):
    """Decompose q into twist (about local X) and swing (remainder) such
    that q == swing * twist. Standard exact decomposition (Dobrowolski),
    valid for any rotation magnitude, no small-angle assumption."""
    w, x, y, z = q
    # projection of vector part onto twist axis (1,0,0) is just x
    twist = quat_normalize((w, x, 0.0, 0.0))
    swing = quat_mul(q, quat_conj(twist))
    return swing, twist


def twist_angle_deg(twist: Quat) -> float:
    w, x, _y, _z = twist
    return math.degrees(2.0 * math.atan2(x, w))


def angular_delta_deg(angle: float, center: float) -> float:
    return ((angle - center + 540.0) % 360.0) - 180.0


def clamp(v, lo, hi):
    return min(hi, max(lo, v))


def normalized_axis(delta_deg: float, inverted: bool, sensitivity: float, dead_zone_deg: float) -> float:
    BASE_HALF_RANGE_DEG = 28.0
    half_range = BASE_HALF_RANGE_DEG / clamp(sensitivity, 0.25, 4)
    usable_range = max(1.0, half_range - dead_zone_deg)
    magnitude = abs(delta_deg)
    dead = 0.0 if magnitude <= dead_zone_deg else math.copysign(magnitude - dead_zone_deg, delta_deg)
    analog = dead / usable_range
    return clamp(0.5 + (-analog if inverted else analog) * 0.5, 0.0, 1.0)


# ---------------------------------------------------------------------------
# Candidate model
# ---------------------------------------------------------------------------

CURRENT_K = 0.2771  # value currently shipped in ContinuousMotionConfig


def candidate_swing_twist_target(q0: Quat, qcur: Quat, invert_x: bool, invert_y: bool, sensitivity: float, dead_zone_deg: float):
    q_rel = quat_normalize(quat_mul(quat_conj(q0), qcur))
    swing, twist = swing_twist_about_x(q_rel)
    # Where the local forward/roll axis (1,0,0) has swung to; invariant
    # under pure twist by construction.
    vx, vy, vz = quat_rotate(swing, (1.0, 0.0, 0.0))
    vx = clamp(vx, -1.0, 1.0)
    azimuth_deg = math.degrees(math.atan2(vy, vx))       # left/right, driven by yaw-like swing
    elevation_deg = math.degrees(math.atan2(vz, vx))     # up/down, driven by pitch-like swing
    rotation_deg = clamp(twist_angle_deg(twist), -110.0, 110.0)
    x = normalized_axis(azimuth_deg, invert_x, sensitivity, dead_zone_deg)
    y = normalized_axis(elevation_deg, invert_y, sensitivity, dead_zone_deg)
    return {"x": x, "y": y, "rotationDeg": rotation_deg, "azimuthDeg": azimuth_deg, "elevationDeg": elevation_deg}


def current_scalar_target(center_angles, cur_angles, x_axis_i, y_axis_i, rot_axis_i, k_x, k_y, invert_x, invert_y, sensitivity, dead_zone_deg, invert_rotation):
    rotation_delta = angular_delta_deg(cur_angles[rot_axis_i], center_angles[rot_axis_i])
    raw_x = angular_delta_deg(cur_angles[x_axis_i], center_angles[x_axis_i])
    raw_y = angular_delta_deg(cur_angles[y_axis_i], center_angles[y_axis_i])
    x = normalized_axis(raw_x - rotation_delta * k_x, invert_x, sensitivity, dead_zone_deg)
    y = normalized_axis(raw_y - rotation_delta * k_y, invert_y, sensitivity, dead_zone_deg)
    rotation_deg = clamp(rotation_delta * (-1.0 if invert_rotation else 1.0), -110.0, 110.0)
    return {"x": x, "y": y, "rotationDeg": rotation_deg}


def dist(a, b):
    return math.hypot(a["x"] - b["x"], a["y"] - b["y"])


AXIS_INDEX = {"roll": 0, "pitch": 1, "yaw": 2}


@dataclass
class PhaseStats:
    n: int = 0
    max_drift_from_phase_start: float = 0.0
    final_drift_from_phase_start: float = 0.0
    max_drift_from_center: float = 0.0
    x_range: float = 0.0
    y_range: float = 0.0
    rotation_range_deg: float = 0.0


def analyze_session(path: str) -> dict:
    with open(path) as f:
        data = json.load(f)

    role = data.get("role")
    captured_at = data.get("capturedAt")
    config = data.get("config", {})
    records = data.get("records", [])
    x_i = AXIS_INDEX[config.get("xAxis", "yaw")]
    y_i = AXIS_INDEX[config.get("yAxis", "pitch")]
    r_i = AXIS_INDEX[config.get("rotationAxis", "roll")]
    invert_x = bool(config.get("invertX", True))
    invert_y = bool(config.get("invertY", False))
    invert_rotation = bool(config.get("invertRotation", False))
    sensitivity = config.get("sensitivity", 1)
    dead_zone_deg = config.get("deadZoneDeg", 1.25)

    still_start = [r for r in records if r["phase"] == "still_start"]
    if not still_start:
        raise ValueError(f"{path}: no still_start phase, cannot center")
    center_sample = still_start[0]["sample"]
    center_angles = center_sample["anglesDeg"]
    q0 = quat_normalize(euler_deg_to_quat(center_angles[0], center_angles[1], center_angles[2]))

    # Precompute both models for every record, in phase order.
    scalar_series = []
    candidate_series = []
    phases_order = []
    for r in records:
        s = r["sample"]
        angles = s["anglesDeg"]
        scalar = current_scalar_target(center_angles, angles, x_i, y_i, r_i, CURRENT_K, 0.0, invert_x, invert_y, sensitivity, dead_zone_deg, invert_rotation)
        qcur = quat_normalize(euler_deg_to_quat(angles[0], angles[1], angles[2]))
        cand = candidate_swing_twist_target(q0, qcur, invert_x, invert_y, sensitivity, dead_zone_deg)
        scalar_series.append(scalar)
        candidate_series.append(cand)
        phases_order.append(r["phase"])

    center_pt = {"x": 0.5, "y": 0.5}

    def phase_metrics(series, phase_id):
        idxs = [i for i, p in enumerate(phases_order) if p == phase_id]
        if not idxs:
            return None
        baseline = series[idxs[0]]
        drifts = [dist(series[i], baseline) for i in idxs]
        drifts_from_center = [dist(series[i], center_pt) for i in idxs]
        rotations = [series[i]["rotationDeg"] for i in idxs]
        xs = [series[i]["x"] for i in idxs]
        ys = [series[i]["y"] for i in idxs]
        return {
            "n": len(idxs),
            "maxDriftFromPhaseStart": max(drifts),
            "finalDriftFromPhaseStart": drifts[-1],
            "maxDriftFromCenter": max(drifts_from_center),
            "xRange": max(xs) - min(xs),
            "yRange": max(ys) - min(ys),
            "rotationRangeDeg": max(rotations) - min(rotations),
        }

    def jitter(series, phase_id):
        idxs = [i for i, p in enumerate(phases_order) if p == phase_id]
        if len(idxs) < 2:
            return None
        xs = [series[i]["x"] for i in idxs]
        ys = [series[i]["y"] for i in idxs]
        return {
            "xStd": statistics.pstdev(xs),
            "yStd": statistics.pstdev(ys),
            "xRange": max(xs) - min(xs),
            "yRange": max(ys) - min(ys),
        }

    def small_movement_response(series, phase_id):
        idxs = [i for i, p in enumerate(phases_order) if p == phase_id]
        if not idxs:
            return None
        baseline = series[idxs[0]]
        drifts = [dist(series[i], baseline) for i in idxs]
        return {"maxDeltaFromPhaseStart": max(drifts)}

    result = {
        "file": os.path.basename(path),
        "capturedAt": captured_at,
        "role": role,
        "recordedRotationCompensationX": config.get("rotationCompensationX"),
        "sampleCount": len(records),
        "phaseCounts": {p: phases_order.count(p) for p in sorted(set(phases_order))},
        "models": {},
    }
    for name, series in (("current_scalar_k0.2771", scalar_series), ("candidate_swing_twist", candidate_series)):
        result["models"][name] = {
            "rotate_one": phase_metrics(series, "rotate_one"),
            "rotate_other": phase_metrics(series, "rotate_other"),
            "left": phase_metrics(series, "left"),
            "right": phase_metrics(series, "right"),
            "up": phase_metrics(series, "up"),
            "down": phase_metrics(series, "down"),
            "diagonal": phase_metrics(series, "diagonal"),
            "tiny": small_movement_response(series, "tiny"),
            "slow": phase_metrics(series, "slow"),
            "fast": phase_metrics(series, "fast"),
            "still_start_jitter": jitter(series, "still_start"),
            "still_end_jitter": jitter(series, "still_end"),
        }
    return result


def main():
    files = sorted(f for f in os.listdir(RAW_DIR) if f.endswith(".json"))
    report = {"generatedBy": "replay_models.py", "sessions": []}
    for fn in files:
        path = os.path.join(RAW_DIR, fn)
        try:
            report["sessions"].append(analyze_session(path))
        except Exception as e:  # noqa: BLE001
            report["sessions"].append({"file": fn, "error": str(e)})

    with open(OUT_PATH, "w") as f:
        json.dump(report, f, indent=2)

    # ---- printed summary ----
    print(f"{'session':<45} {'model':<24} {'rot1 maxDrift':>13} {'rot2 maxDrift':>13} {'L/R range':>10} {'U/D range':>10} {'still jitter(x,y)':>20}")
    for s in report["sessions"]:
        if "error" in s:
            print(s["file"], "ERROR:", s["error"])
            continue
        for model_name, m in s["models"].items():
            r1 = m["rotate_one"]["maxDriftFromPhaseStart"] if m["rotate_one"] else float("nan")
            r2 = m["rotate_other"]["maxDriftFromPhaseStart"] if m["rotate_other"] else float("nan")
            lr = None
            if m["left"] and m["right"]:
                lr = (m["right"]["xRange"] + m["left"]["xRange"]) / 2
            ud = None
            if m["up"] and m["down"]:
                ud = (m["up"]["yRange"] + m["down"]["yRange"]) / 2
            j = m["still_start_jitter"]
            jitter_str = f"({j['xStd']:.4f},{j['yStd']:.4f})" if j else "n/a"
            print(f"{s['file']:<45} {model_name:<24} {r1:>13.4f} {r2:>13.4f} {lr if lr is not None else float('nan'):>10.4f} {ud if ud is not None else float('nan'):>10.4f} {jitter_str:>20}")
        print()

    print(f"Full report written to {OUT_PATH}")


if __name__ == "__main__":
    main()


# ---------------------------------------------------------------------------
# Filter replay (LIGHT_EMA / ADAPTIVE_EMA / ONE_EURO), ported 1:1 from
# lib/physicalInput/MotionFilters.ts, run against the current-scalar target
# series so the comparison isolates filter behaviour from the mapping model.
# ---------------------------------------------------------------------------

def ema_filter_series(targets, timestamps, gyro_mags, smoothing, adaptive):
    out = []
    value = None
    for t, ts, g in zip(targets, timestamps, gyro_mags):
        if value is None:
            value = dict(t)
            out.append(dict(value))
            continue
        strength = clamp(smoothing, 0, 0.9)
        deliberate = clamp(g / 240.0, 0, 1)
        retained = strength * (1 - deliberate * 0.7) if adaptive else strength * 0.55
        applied = 1 - retained
        value = {
            "x": value["x"] * retained + t["x"] * applied,
            "y": value["y"] * retained + t["y"] * applied,
            "rotationDeg": value["rotationDeg"] * retained + t["rotationDeg"] * applied,
        }
        out.append(dict(value))
    return out


class OneEuroScalarPy:
    def __init__(self):
        self.value = None
        self.derivative = 0.0
        self.ts = None

    def filter(self, next_v, ts_ms, smoothing):
        if self.value is None or self.ts is None:
            self.value = next_v
            self.ts = ts_ms
            return next_v
        dt = clamp((ts_ms - self.ts) / 1000.0, 1 / 240.0, 0.5)
        self.ts = ts_ms
        deriv = (next_v - self.value) / dt
        a1 = self._alpha(dt, 1.0)
        self.derivative = self.derivative + a1 * (deriv - self.derivative)
        min_cutoff = 7.5 - clamp(smoothing, 0, 0.9) * 7
        cutoff = min_cutoff + 0.06 * abs(self.derivative)
        a2 = self._alpha(dt, cutoff)
        self.value = self.value + a2 * (next_v - self.value)
        return self.value

    @staticmethod
    def _alpha(dt, cutoff_hz):
        tau = 1.0 / (2 * math.pi * cutoff_hz)
        return 1.0 / (1.0 + tau / dt)


def one_euro_series(targets, timestamps, smoothing):
    fx, fy, fr = OneEuroScalarPy(), OneEuroScalarPy(), OneEuroScalarPy()
    out = []
    for t, ts in zip(targets, timestamps):
        out.append({
            "x": fx.filter(t["x"], ts, smoothing),
            "y": fy.filter(t["y"], ts, smoothing),
            "rotationDeg": fr.filter(t["rotationDeg"], ts, smoothing),
        })
    return out


def replay_filters_for_session(path: str, smoothing: float = 0.35) -> dict:
    with open(path) as f:
        data = json.load(f)
    config = data.get("config", {})
    x_i = AXIS_INDEX[config.get("xAxis", "yaw")]
    y_i = AXIS_INDEX[config.get("yAxis", "pitch")]
    r_i = AXIS_INDEX[config.get("rotationAxis", "roll")]
    invert_x = bool(config.get("invertX", True))
    invert_y = bool(config.get("invertY", False))
    invert_rotation = bool(config.get("invertRotation", False))
    sensitivity = config.get("sensitivity", 1)
    dead_zone_deg = config.get("deadZoneDeg", 1.25)
    records = data["records"]
    still = [r for r in records if r["phase"] == "still_start"][0]["sample"]["anglesDeg"]

    targets, timestamps, gyro_mags, phases = [], [], [], []
    for r in records:
        s = r["sample"]
        t = current_scalar_target(still, s["anglesDeg"], x_i, y_i, r_i, CURRENT_K, 0.0, invert_x, invert_y, sensitivity, dead_zone_deg, invert_rotation)
        targets.append(t)
        timestamps.append(s["timestampMs"])
        gyro_mags.append(math.hypot(*s["gyroscopeDps"]))
        phases.append(r["phase"])

    series_by_mode = {
        "LIGHT_EMA": ema_filter_series(targets, timestamps, gyro_mags, smoothing, adaptive=False),
        "ADAPTIVE_EMA": ema_filter_series(targets, timestamps, gyro_mags, smoothing, adaptive=True),
        "ONE_EURO": one_euro_series(targets, timestamps, smoothing),
    }

    def idxs(phase):
        return [i for i, p in enumerate(phases) if p == phase]

    def jitter_std(series, phase):
        ii = idxs(phase)
        if len(ii) < 2:
            return None
        xs = [series[i]["x"] for i in ii]
        ys = [series[i]["y"] for i in ii]
        return statistics.pstdev(xs) + statistics.pstdev(ys)

    def tracking_ratio(series, phase):
        """peak filtered displacement / peak unfiltered(target) displacement
        from the phase's own first sample - close to 1 means the filter
        keeps up with real motion, well under 1 means it lags/suppresses it."""
        ii = idxs(phase)
        if not ii:
            return None
        base_f = series[ii[0]]
        base_t = targets[ii[0]]
        peak_f = max(dist(series[i], base_f) for i in ii)
        peak_t = max(dist(targets[i], base_t) for i in ii)
        if peak_t < 1e-6:
            return None
        return peak_f / peak_t

    out = {"file": os.path.basename(path), "smoothing": smoothing, "modes": {}}
    for mode, series in series_by_mode.items():
        out["modes"][mode] = {
            "stillStartJitterSum": jitter_std(series, "still_start"),
            "stillEndJitterSum": jitter_std(series, "still_end"),
            "tinyTrackingRatio": tracking_ratio(series, "tiny"),
            "slowTrackingRatio": tracking_ratio(series, "slow"),
            "fastTrackingRatio": tracking_ratio(series, "fast"),
        }
    return out


def run_filter_comparison():
    files = sorted(f for f in os.listdir(RAW_DIR) if f.endswith(".json"))
    results = [replay_filters_for_session(os.path.join(RAW_DIR, f)) for f in files]
    print(f"\n{'session':<45} {'mode':<14} {'still jitter':>12} {'tiny track':>11} {'slow track':>11} {'fast track':>11}")
    for r in results:
        for mode, m in r["modes"].items():
            still = m["stillStartJitterSum"] or 0
            tiny = m["tinyTrackingRatio"] if m["tinyTrackingRatio"] is not None else float("nan")
            slow = m["slowTrackingRatio"] if m["slowTrackingRatio"] is not None else float("nan")
            fast = m["fastTrackingRatio"] if m["fastTrackingRatio"] is not None else float("nan")
            print(f"{r['file']:<45} {mode:<14} {still:>12.5f} {tiny:>11.3f} {slow:>11.3f} {fast:>11.3f}")
        print()
    with open(os.path.join(HERE, "filter_replay_report.json"), "w") as f:
        json.dump(results, f, indent=2)
    print("Filter replay report written to filter_replay_report.json")


if __name__ == "__main__" and "--filters" in __import__("sys").argv:
    run_filter_comparison()
