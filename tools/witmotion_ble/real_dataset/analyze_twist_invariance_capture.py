#!/usr/bin/env python3
"""
Offline replay of the 2026-09-04 TWIST_INVARIANCE capture (4,960 real
samples, 14 phases: neutral/twist_45/twist_90 x up/down/left/right, plus
2 missing edge-reversal retries) against THREE models:

  A. legacy_default        - FROZEN_AT_RECENTER de-roll, no cross-axis
                              calibration. The actual shipped DEFAULT
                              ContinuousMotionConfig as of tonight (what any
                              new/未-enrolled patient gets).
  B. today_continuous_calib - CONTINUOUS_GRAVITY_REFERENCED de-roll + the
                              2026-09-04 FINAL_SESSION-derived 2x2 pointer-
                              space calibration matrix. This is exactly what
                              was LIVE during this capture (read straight
                              from each record's own `output` field - no
                              re-derivation needed, it's already the ground
                              truth of what that config produced).
  C. candidate_roll_invariant - NEW this turn: projects the raw gyro
                              transverse-rate vector onto a gravity-defined
                              2D basis (perpendicular to the sensor's local
                              +X/forward axis) that rotates WITH the sensor
                              as it rolls, instead of rotating the raw
                              pitch/yaw-rate pair by a scalar "roll angle".
                              See candidate_roll_invariant_step()'s own doc
                              comment for the derivation.

Reads only raw accelerationG/gyroscopeDps/anglesDeg + timestamps per
record - never trusts the embedded `output` field as ground truth for
anything except Model B (which is DEFINED as "whatever was live", so its
own output IS the ground truth for that model specifically).

Writes twist_invariance_replay_report.json next to this script.
"""
from __future__ import annotations
import json
import math
import os
import statistics

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "raw", "wt901-right-hand-twist-invariance-1788531321165.json")
OUT = os.path.join(HERE, "twist_invariance_replay_report.json")

BASE_HALF_RANGE_DEG = 28.0
DEAD_ZONE_DEG = 1.25
SENSITIVITY = 1.0
TWIST_DOMINANCE_THRESHOLD = 0.92
TWIST_DOMINANCE_MAX_SUPPRESSION = 0.7
INVERT_X = True
INVERT_Y = False

# The 2x2 pointer-space calibration matrix live during THIS capture (2026-09-04 FINAL_SESSION-derived,
# post RIGHT/LEFT-inversion-bug fix) - RightHandAdultCalibrationEvidence.ts's matrix.
FINAL_SESSION_CALIBRATION = [[0.9968752603593519, 0.11005764226383348], [-0.18590835990159593, 0.9855511407612992]]


def clamp(v, lo, hi):
    return min(hi, max(lo, v))


def effective_half_range_deg():
    return BASE_HALF_RANGE_DEG / clamp(SENSITIVITY, 0.25, 4)


def remove_dead_zone(delta, dead_zone):
    magnitude = abs(delta)
    if magnitude <= dead_zone:
        return 0.0
    return math.copysign(magnitude - dead_zone, delta)


def normalized_axis(delta_deg, inverted):
    half_range = effective_half_range_deg()
    usable_range = max(1.0, half_range - DEAD_ZONE_DEG)
    analog = remove_dead_zone(delta_deg, DEAD_ZONE_DEG) / usable_range
    return clamp(0.5 + (-analog if inverted else analog) * 0.5, 0.0, 1.0)


def apply_pointer_space_matrix(x, y, m):
    dx, dy = x - 0.5, y - 0.5
    a, b = m[0]
    c, d = m[1]
    return clamp(0.5 + a * dx + b * dy, 0.0, 1.0), clamp(0.5 + c * dx + d * dy, 0.0, 1.0)


def twist_damping(twist_rate, pitch_rate, yaw_rate):
    magnitude = math.hypot(twist_rate, pitch_rate, yaw_rate)
    dominance = abs(twist_rate) / magnitude if magnitude > 1e-6 else 0.0
    suppression = clamp((dominance - TWIST_DOMINANCE_THRESHOLD) / (1 - TWIST_DOMINANCE_THRESHOLD), 0, 1)
    return 1 - suppression * TWIST_DOMINANCE_MAX_SUPPRESSION


# ---------------------------------------------------------------------------
# Model A/B: same de-roll-by-scalar-roll-angle architecture as
# ContinuousMotionController.ts, ported 1:1. de_roll_mode is "frozen" (Model
# A) or "continuous" (Model B, though B is actually read straight from the
# file's own `output` - this function exists for completeness/cross-check).
# ---------------------------------------------------------------------------
class ScalarDeRollModel:
    def __init__(self, de_roll_mode: str, calibration_matrix=None):
        self.de_roll_mode = de_roll_mode
        self.calibration_matrix = calibration_matrix
        self.aim_yaw = 0.0
        self.aim_pitch = 0.0
        self.center_yaw = 0.0
        self.center_pitch = 0.0
        self.reference_roll_cos = 1.0
        self.reference_roll_sin = 0.0
        self.centered = False
        self.prev_ts = None

    def commit_center(self, roll_deg):
        self.centered = True
        self.center_yaw = self.aim_yaw
        self.center_pitch = self.aim_pitch
        self.reference_roll_cos = math.cos(math.radians(-roll_deg))
        self.reference_roll_sin = math.sin(math.radians(-roll_deg))

    def step(self, sample):
        gyro = sample["gyroscopeDps"]
        angles = sample["anglesDeg"]
        ts = sample["timestampMs"]
        dt = 0.0 if self.prev_ts is None else max(0.0, (ts - self.prev_ts) / 1000.0)
        self.prev_ts = ts

        twist_rate, raw_pitch_rate, raw_yaw_rate = gyro
        damping = twist_damping(twist_rate, raw_pitch_rate, raw_yaw_rate)
        damped_pitch = raw_pitch_rate * damping
        damped_yaw = raw_yaw_rate * damping

        if self.de_roll_mode == "continuous":
            roll_cos = math.cos(math.radians(-angles[0]))
            roll_sin = math.sin(math.radians(-angles[0]))
        else:
            roll_cos, roll_sin = self.reference_roll_cos, self.reference_roll_sin

        pitch_rate = damped_pitch * roll_cos - damped_yaw * roll_sin
        yaw_rate = damped_pitch * roll_sin + damped_yaw * roll_cos
        self.aim_pitch += pitch_rate * dt
        self.aim_yaw += yaw_rate * dt

        half_range = effective_half_range_deg()
        self.aim_yaw = clamp(self.aim_yaw, self.center_yaw - half_range, self.center_yaw + half_range)
        self.aim_pitch = clamp(self.aim_pitch, self.center_pitch - half_range, self.center_pitch + half_range)

        if not self.centered:
            self.commit_center(angles[0])
            return 0.5, 0.5

        x = normalized_axis(self.aim_yaw - self.center_yaw, INVERT_X)
        y = normalized_axis(self.aim_pitch - self.center_pitch, INVERT_Y)
        if self.calibration_matrix:
            x, y = apply_pointer_space_matrix(x, y, self.calibration_matrix)
        return x, y


# ---------------------------------------------------------------------------
# Model C: candidate roll-invariant transverse-basis transform.
#
# DERIVATION:
#   forward = sensor-local +X = (1,0,0), always (it's a physical direction
#   fixed ON the sensor, not something to compute).
#
#   g_est: a running estimate of "which way gravity points, in the sensor's
#   OWN rotating local coordinates" - a standard gyro+accel complementary
#   filter (gyro integration for fast response between corrections, slow
#   blending toward the raw accelerometer reading for drift correction,
#   gated by how close |accelerationG| is to 1g so DYNAMIC acceleration
#   during fast motion doesn't yank the estimate around - the brief's own
#   "do not allow accelerometer dynamic motion to create pointer jumps").
#   For a vector that is fixed in the WORLD frame (gravity, when not
#   accelerating) observed in a frame rotating with body-frame angular
#   velocity omega, the standard strapdown/Poisson relation is
#   d(g_est)/dt = -omega x g_est - integrated here with a plain forward
#   Euler step (dt is ~20ms, fine at this rate) then renormalized.
#
#   v_local = normalize(g_est - (g_est . forward) * forward): the component
#   of the CURRENT gravity direction perpendicular to forward, i.e. "which
#   sensor-local direction currently points toward gravity's transverse
#   component" - this rotates WITH the sensor as it rolls around forward,
#   which is exactly the point: it tracks roll automatically, continuously,
#   without ever computing a scalar "roll angle" or hitting an Euler-angle
#   singularity in the usual sense.
#
#   h_local = forward x v_local: the third orthonormal axis, "horizontal
#   transverse".
#
#   Both v_local and h_local necessarily have a zero X-component (forward is
#   excluded by construction), so they live entirely in the sensor's local
#   Y-Z plane alongside the raw pitch/yaw-rate vector (gyro[1], gyro[2]) -
#   which means projecting that rate vector onto (v_local, h_local) via two
#   dot products is an EXACT change of orthonormal basis within that plane,
#   not a small-angle approximation.
#
#   SINGULARITY: when forward is nearly parallel to gravity (pointing
#   straight up/down at the ceiling/floor), |g_perp| -> 0 and v_local's
#   direction becomes numerically undefined - the previous valid basis is
#   held (frozen) rather than updated from noise. This is a genuine physical
#   ambiguity (gravity alone cannot define "which way is screen-horizontal"
#   when forward IS vertical), not an implementation gap - flagged in the
#   report if it is ever hit in this real dataset.
#
#   AXIAL twist rate (gyro[0], about forward) is discarded for gameplay,
#   exactly as today - never contributes to aim.
# ---------------------------------------------------------------------------
def normalize3(v):
    n = math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2)
    if n < 1e-9:
        return (0.0, 0.0, 1.0)
    return (v[0] / n, v[1] / n, v[2] / n)


def cross3(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


class RollInvariantModel:
    ACCEL_CORRECTION_BASE_GAIN = 0.03  # per-sample blend toward raw accel when near 1g -> ~1-2s time constant at 50Hz
    ACCEL_DEVIATION_GATE = 0.35  # same threshold already used elsewhere in this codebase for confidence gating

    def __init__(self, sign_flip_v=1.0, sign_flip_h=1.0, calibration_matrix=None):
        self.g_est = None
        self.v_local = None
        self.h_local = None
        self.aim_v = 0.0
        self.aim_h = 0.0
        self.center_v = 0.0
        self.center_h = 0.0
        self.centered = False
        self.prev_ts = None
        self.sign_flip_v = sign_flip_v
        self.sign_flip_h = sign_flip_h
        self.calibration_matrix = calibration_matrix
        self.singularity_hits = 0

    def _update_gravity_estimate(self, accel, gyro, dt):
        if self.g_est is None:
            self.g_est = normalize3(accel)
            return
        if dt > 0:
            omega = gyro  # deg/s, sensor-local
            omega_rad = tuple(math.radians(w) for w in omega)
            # d(g)/dt = -omega x g  (Poisson equation for a world-fixed vector seen in the rotating body frame)
            dgdt = tuple(-c for c in cross3(omega_rad, self.g_est))
            predicted = tuple(self.g_est[i] + dgdt[i] * dt for i in range(3))
            self.g_est = normalize3(predicted)
        accel_mag = math.sqrt(accel[0] ** 2 + accel[1] ** 2 + accel[2] ** 2)
        deviation = abs(accel_mag - 1.0)
        trust = clamp(1 - deviation / self.ACCEL_DEVIATION_GATE, 0.0, 1.0)
        gain = self.ACCEL_CORRECTION_BASE_GAIN * trust
        if gain > 0:
            accel_n = normalize3(accel)
            blended = tuple(self.g_est[i] * (1 - gain) + accel_n[i] * gain for i in range(3))
            self.g_est = normalize3(blended)

    def step(self, sample):
        accel = sample["accelerationG"]
        gyro = sample["gyroscopeDps"]
        ts = sample["timestampMs"]
        dt = 0.0 if self.prev_ts is None else max(0.0, (ts - self.prev_ts) / 1000.0)
        self.prev_ts = ts

        self._update_gravity_estimate(accel, gyro, dt)

        g_perp = (0.0, self.g_est[1], self.g_est[2])
        g_perp_mag = math.hypot(g_perp[1], g_perp[2])
        if g_perp_mag > 0.05:  # ~87deg from singular; below this, freeze the last valid basis
            v_local = (0.0, g_perp[1] / g_perp_mag, g_perp[2] / g_perp_mag)
            h_local = cross3((1.0, 0.0, 0.0), v_local)
            self.v_local, self.h_local = v_local, h_local
        elif self.v_local is None:
            self.v_local, self.h_local = (0.0, 1.0, 0.0), (0.0, 0.0, 1.0)
            self.singularity_hits += 1
        else:
            self.singularity_hits += 1

        twist_rate, raw_pitch_rate, raw_yaw_rate = gyro
        damping = twist_damping(twist_rate, raw_pitch_rate, raw_yaw_rate)
        damped_pitch = raw_pitch_rate * damping
        damped_yaw = raw_yaw_rate * damping

        omega_v = damped_pitch * self.v_local[1] + damped_yaw * self.v_local[2]
        omega_h = damped_pitch * self.h_local[1] + damped_yaw * self.h_local[2]
        omega_v *= self.sign_flip_v
        omega_h *= self.sign_flip_h

        self.aim_v += omega_v * dt
        self.aim_h += omega_h * dt
        half_range = effective_half_range_deg()
        self.aim_v = clamp(self.aim_v, self.center_v - half_range, self.center_v + half_range)
        self.aim_h = clamp(self.aim_h, self.center_h - half_range, self.center_h + half_range)

        if not self.centered:
            self.centered = True
            self.center_v = self.aim_v
            self.center_h = self.aim_h
            return 0.5, 0.5

        # aim_v drives screen Y (down=+y), aim_h drives screen X (right=+x) - NOT inverted here; sign_flip_v/h
        # (calibrated from real neutral-phase data, see main()) already resolve the true polarity.
        x = normalized_axis(self.aim_h - self.center_h, False)
        y = normalized_axis(self.aim_v - self.center_v, False)
        if self.calibration_matrix:
            x, y = apply_pointer_space_matrix(x, y, self.calibration_matrix)
        return x, y


# ---------------------------------------------------------------------------
# Shared analysis helpers (PCA + sign-referenced direction, same convention
# fixed in RightHandSessionProfile.ts after the RIGHT/LEFT inversion bug).
# ---------------------------------------------------------------------------
def pca_principal_angle_deg(points):
    n = len(points)
    mx = sum(p[0] for p in points) / n
    my = sum(p[1] for p in points) / n
    sxx = sum((p[0] - mx) ** 2 for p in points) / n
    syy = sum((p[1] - my) ** 2 for p in points) / n
    sxy = sum((p[0] - mx) * (p[1] - my) for p in points) / n
    if abs(sxy) < 1e-15 and abs(sxx - syy) < 1e-15:
        return 0.0
    return math.degrees(0.5 * math.atan2(2 * sxy, sxx - syy))


IDEAL_ANGLE_DEG = {"up": -90.0, "down": 90.0, "left": 180.0, "right": 0.0}


def angle_wrap_diff(a, b):
    d = (a - b + 180.0) % 360.0 - 180.0
    return d


def directional_error(points, direction):
    """Signed-resolved directional error in degrees (0=perfect, 180=fully backwards).
    Sign-resolves the PCA axis (mod-180-ambiguous) against the mean ABSOLUTE-position-
    relative-to-center convention (the fix from the RIGHT/LEFT inversion bug), then
    measures the FULL 0-360 angular difference from the ideal direction."""
    principal = pca_principal_angle_deg(points)
    mean_x = sum(p[0] for p in points) / len(points)
    mean_y = sum(p[1] for p in points) / len(points)
    ux, uy = math.cos(math.radians(principal)), math.sin(math.radians(principal))
    if ux * mean_x + uy * mean_y < 0:
        principal = (principal + 180.0) % 360.0
    ideal = IDEAL_ANGLE_DEG[direction]
    return abs(angle_wrap_diff(principal, ideal))


def displacement_cloud(records, field):
    x0 = records[0]["output"][field]["x"] if field != "candidate" else records[0]["_candidate"][0]
    y0 = records[0]["output"][field]["y"] if field != "candidate" else records[0]["_candidate"][1]
    if field == "candidate":
        return [(r["_candidate"][0] - x0, r["_candidate"][1] - y0) for r in records]
    return [(r["output"][field]["x"] - x0, r["output"][field]["y"] - y0) for r in records]


def absolute_points(records, field):
    if field == "candidate":
        return [r["_candidate"] for r in records]
    return [(r["output"][field]["x"], r["output"][field]["y"]) for r in records]


def main():
    with open(SRC) as f:
        data = json.load(f)
    records = data["records"]

    # --- Model A: legacy shipped default (frozen de-roll, no calibration) ---
    model_a = ScalarDeRollModel("frozen", calibration_matrix=None)
    for r in records:
        x, y = model_a.step(r["sample"])
        r.setdefault("_modelA", (x, y))

    # --- Model C pass 1: uncalibrated, to determine sign flips + derive its own calibration ---
    probe = RollInvariantModel()
    for r in records:
        r["_candidate_raw"] = probe.step(r["sample"])

    def phase_records(phase_id):
        return [r for r in records if r["phase"] == phase_id]

    def mean_pos(recs, key):
        pts = [r[key] for r in recs]
        return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))

    # Sign calibration from the NEUTRAL phases (screen convention: right=+x, down=+y).
    # PROVEN REDUNDANT (verified: forcing sign_flip_v/h to -1,-1 instead of the "correct" values
    # below produces a correspondingly negated calibration matrix and BYTE-IDENTICAL final
    # directional errors) - the calibration matrix construction below already sign-resolves
    # against the same down_mean/right_mean reference, so any fixed pre-flip here is absorbed
    # without residual. Kept only for a clean/interpretable intermediate `_candidate_signed`
    # value in the report; the TypeScript port omits this step entirely (raw IMU -> roll-
    # invariant frame -> ONE personalized screen-axis-alignment matrix, not two overlapping
    # sign-resolution steps).
    right_mean = mean_pos(phase_records("neutral_right"), "_candidate_raw")
    down_mean = mean_pos(phase_records("neutral_down"), "_candidate_raw")
    sign_flip_h = 1.0 if (right_mean[0] - 0.5) >= 0 else -1.0
    sign_flip_v = 1.0 if (down_mean[1] - 0.5) >= 0 else -1.0

    model_c_signed = RollInvariantModel(sign_flip_v=sign_flip_v, sign_flip_h=sign_flip_h)
    for r in records:
        r["_candidate_signed"] = model_c_signed.step(r["sample"])

    # Derive Model C's OWN fresh 2x2 pointer-space calibration from THIS session's neutral phases
    # (not reusing the FINAL_SESSION matrix - different frame, different residual error source).
    def displacement(recs, key):
        x0, y0 = recs[0][key]
        return [(r[key][0] - x0, r[key][1] - y0) for r in recs]

    def principal_unit(points, sign_ref):
        n = len(points)
        mx = sum(p[0] for p in points) / n
        my = sum(p[1] for p in points) / n
        sxx = sum((p[0] - mx) ** 2 for p in points) / n
        syy = sum((p[1] - my) ** 2 for p in points) / n
        sxy = sum((p[0] - mx) * (p[1] - my) for p in points) / n
        angle = 0.0 if (abs(sxy) < 1e-15 and abs(sxx - syy) < 1e-15) else 0.5 * math.atan2(2 * sxy, sxx - syy)
        ux, uy = math.cos(angle), math.sin(angle)
        if ux * sign_ref[0] + uy * sign_ref[1] < 0:
            ux, uy = -ux, -uy
        return (ux, uy)

    up_d = displacement(phase_records("neutral_up"), "_candidate_signed")
    down_d = displacement(phase_records("neutral_down"), "_candidate_signed")
    left_d = displacement(phase_records("neutral_left"), "_candidate_signed")
    right_d = displacement(phase_records("neutral_right"), "_candidate_signed")

    up_mean_dy = sum(p[1] for p in up_d) / len(up_d)
    down_mean_dy = sum(p[1] for p in down_d) / len(down_d)
    vflip = -1 if up_mean_dy * down_mean_dy < 0 else 1
    pooled_v = up_d + [(vflip * p[0], vflip * p[1]) for p in down_d]
    down_center_ref = (down_mean[0] - 0.5, down_mean[1] - 0.5)
    e_v = principal_unit(pooled_v, down_center_ref)

    left_mean_dx = sum(p[0] for p in left_d) / len(left_d)
    right_mean_dx = sum(p[0] for p in right_d) / len(right_d)
    hflip = -1 if left_mean_dx * right_mean_dx < 0 else 1
    pooled_h = left_d + [(hflip * p[0], hflip * p[1]) for p in right_d]
    right_center_ref = (right_mean[0] - 0.5, right_mean[1] - 0.5)
    e_h = principal_unit(pooled_h, right_center_ref)

    a, c = e_h
    b, dd = e_v
    det = a * dd - b * c
    model_c_calibration = None
    model_c_calib_info = None
    if abs(det) > 1e-6:
        model_c_calibration = [[dd / det, -b / det], [-c / det, a / det]]
        model_c_calib_info = {
            "matrix": model_c_calibration,
            "e_h": e_h, "e_v": e_v,
            "angle_between_h_v_deg": math.degrees(math.acos(clamp(e_h[0] * e_v[0] + e_h[1] * e_v[1], -1, 1))),
        }

    model_c_final = RollInvariantModel(sign_flip_v=sign_flip_v, sign_flip_h=sign_flip_h, calibration_matrix=model_c_calibration)
    for r in records:
        r["_candidate"] = model_c_final.step(r["sample"])

    # --- Per-phase report for all directional phases ---
    directional_phases = [
        "neutral_up", "neutral_down", "neutral_left", "neutral_right",
        "twist_45_up", "twist_45_down", "twist_45_left", "twist_45_right",
        "twist_90_up", "twist_90_down", "twist_90_left", "twist_90_right",
    ]

    def phase_direction(phase_id):
        return phase_id.split("_")[-1]

    per_phase = []
    for ph in directional_phases:
        recs = phase_records(ph)
        if len(recs) < 3:
            continue
        direction = phase_direction(ph)
        angles = [r["sample"]["anglesDeg"][0] - data["centerRollDeg"] for r in recs]
        angles = [((a + 180) % 360) - 180 for a in angles]
        b_cloud = displacement_cloud(recs, "unfilteredPointer")
        a_cloud = [(r["_modelA"][0], r["_modelA"][1]) for r in recs]
        a0 = a_cloud[0]
        a_cloud = [(p[0] - a0[0], p[1] - a0[1]) for p in a_cloud]
        c_cloud = displacement_cloud(recs, "candidate")

        per_phase.append({
            "phase": ph,
            "direction": direction,
            "n": len(recs),
            "actualWristAngleDeg": {"mean": statistics.mean(angles), "min": min(angles), "max": max(angles)},
            "modelA_legacy_default_errorDeg": directional_error(a_cloud, direction),
            "modelB_today_continuous_calib_errorDeg": directional_error(b_cloud, direction),
            "modelC_candidate_roll_invariant_errorDeg": directional_error(c_cloud, direction),
        })

    # --- Bucket into neutral / ~45 / ~90 using ACTUAL measured angle, not phase name ---
    def bucket_for(mean_angle):
        m = abs(mean_angle)
        if m < 20:
            return "near_0"
        if 25 <= m <= 80:
            return "near_45"
        if m > 80:
            return "near_90"
        return "ambiguous"

    buckets = {}
    for p in per_phase:
        b = bucket_for(p["actualWristAngleDeg"]["mean"])
        buckets.setdefault(b, {"phases": [], "modelA": [], "modelB": [], "modelC": []})
        buckets[b]["phases"].append(p["phase"])
        buckets[b]["modelA"].append(p["modelA_legacy_default_errorDeg"])
        buckets[b]["modelB"].append(p["modelB_today_continuous_calib_errorDeg"])
        buckets[b]["modelC"].append(p["modelC_candidate_roll_invariant_errorDeg"])

    bucket_summary = {}
    for name, b in buckets.items():
        bucket_summary[name] = {
            "phases": b["phases"],
            "modelA_meanErrorDeg": statistics.mean(b["modelA"]),
            "modelB_meanErrorDeg": statistics.mean(b["modelB"]),
            "modelC_meanErrorDeg": statistics.mean(b["modelC"]),
            "modelA_maxErrorDeg": max(b["modelA"]),
            "modelB_maxErrorDeg": max(b["modelB"]),
            "modelC_maxErrorDeg": max(b["modelC"]),
        }

    # --- Cross-coupling (eccentricity) before/after, up/down and left/right, per model ---
    def eccentricity(points):
        n = len(points)
        mx = sum(p[0] for p in points) / n
        my = sum(p[1] for p in points) / n
        sxx = sum((p[0] - mx) ** 2 for p in points) / n
        syy = sum((p[1] - my) ** 2 for p in points) / n
        sxy = sum((p[0] - mx) * (p[1] - my) for p in points) / n
        trace = sxx + syy
        disc = math.sqrt(max(trace * trace / 4 - (sxx * syy - sxy * sxy), 0))
        l1, l2 = trace / 2 + disc, trace / 2 - disc
        return math.sqrt(max(l2, 0) / max(l1, 1e-12))

    cross_coupling = {}
    for ph in ["neutral_up", "neutral_down", "neutral_left", "neutral_right"]:
        recs = phase_records(ph)
        cross_coupling[ph] = {
            "modelA_eccentricity": eccentricity([(r["_modelA"][0], r["_modelA"][1]) for r in recs]),
            "modelB_eccentricity": eccentricity(displacement_cloud(recs, "unfilteredPointer")),
            "modelC_eccentricity": eccentricity(displacement_cloud(recs, "candidate")),
        }

    # --- Edge reversal (2 retried directions) ---
    def measure_edge_reversal(recs, field, axis_index, edge_value):
        recs_sorted = sorted(recs, key=lambda r: r["output"]["timestampMs"])
        vals = [r["output"][field][["x", "y"][axis_index]] if field != "candidate" else r["_candidate"][axis_index] for r in recs_sorted]
        last_at_edge = None
        for i, v in enumerate(vals):
            if v == edge_value:
                last_at_edge = i
        if last_at_edge is None or last_at_edge == len(vals) - 1:
            return None
        for i in range(last_at_edge + 1, len(vals)):
            if abs(vals[i] - edge_value) >= 0.01:
                return recs_sorted[i]["output"]["timestampMs"] - recs_sorted[last_at_edge]["output"]["timestampMs"]
        return None

    edge_report = {}
    for ph, axis_i, edge_v in (("edge_left_reverse_right", 0, 0), ("edge_top_reverse_down", 1, 0)):
        recs = phase_records(ph)
        edge_report[ph] = {
            "n": len(recs),
            "modelB_liveReversalMs": measure_edge_reversal(recs, "pointer", axis_i, edge_v),
            "modelC_reversalMs": measure_edge_reversal(recs, "candidate", axis_i, edge_v),
        }

    report = {
        "generatedBy": "analyze_twist_invariance_capture.py",
        "sourceFile": os.path.basename(SRC),
        "sampleCount": len(records),
        "singularityHitsModelC": model_c_final.singularity_hits,
        "signCalibration": {"sign_flip_v": sign_flip_v, "sign_flip_h": sign_flip_h},
        "modelC_ownCalibration": model_c_calib_info,
        "perPhase": per_phase,
        "buckets": bucket_summary,
        "crossCouplingEccentricity": cross_coupling,
        "edgeReversal": edge_report,
    }
    with open(OUT, "w") as f:
        json.dump(report, f, indent=2)
    print(f"Wrote {OUT}")
    print(json.dumps(bucket_summary, indent=2))


if __name__ == "__main__":
    main()
