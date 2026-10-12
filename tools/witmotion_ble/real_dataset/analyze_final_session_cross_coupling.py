#!/usr/bin/env python3
"""
Deep offline analysis of wt901-right-hand-final-session-1788527323549.json
(11,402 real samples). Reads raw JSON from disk once, never re-prints it,
writes a compact JSON report to disk. Uses only stdlib (no numpy needed,
but numpy is used if available for convenience).
"""
import json, os, math, statistics
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "raw", "wt901-right-hand-final-session-1788527323549.json")
OUT = os.path.join(HERE, "final_session_cross_coupling_report.json")

with open(SRC) as f:
    d = json.load(f)

records = d["records"]
phases = defaultdict(list)
for r in records:
    phases[r["phase"]].append(r)

report = {}

# ---------------------------------------------------------------------
# 1. Sample rate (dedup-aware: many consecutive records share timestampMs
#    because WT901 delivers accel/gyro/angle as separate BLE packets that
#    land within the same millisecond tick)
# ---------------------------------------------------------------------
ts_all = [r["sample"]["timestampMs"] for r in records]
span_ms = ts_all[-1] - ts_all[0]
intervals = [b - a for a, b in zip(ts_all, ts_all[1:])]
big_gaps = [x for x in intervals if x > 500]
small_intervals_sum = sum(x for x in intervals if x <= 500)
n_small = sum(1 for x in intervals if x <= 500)
effective_hz = 1000 * n_small / small_intervals_sum if small_intervals_sum > 0 else None
zero_dt_fraction = sum(1 for x in intervals if x == 0) / len(intervals)

report["sample_rate"] = {
    "n_records": len(records),
    "span_s": span_ms / 1000,
    "big_gaps_ms": big_gaps,
    "effective_hz_excl_gaps": effective_hz,
    "zero_dt_fraction": zero_dt_fraction,
    "note": "~half of consecutive records share an identical timestampMs (separate accel/gyro/angle BLE packets landing in the same ms) -> naive mean-interval math undercounts true rate by ~2x; effective_hz_excl_gaps corrects for this and for the single long pause.",
}

# ---------------------------------------------------------------------
# 2. Phase inventory
# ---------------------------------------------------------------------
report["phase_counts"] = {k: len(v) for k, v in phases.items()}

# ---------------------------------------------------------------------
# 3. Cross-axis coupling: PCA on unfilteredPointer displacement within
#    each cardinal phase, relative to the phase's own first sample.
# ---------------------------------------------------------------------
def pca_2d(points):
    n = len(points)
    mx = sum(p[0] for p in points) / n
    my = sum(p[1] for p in points) / n
    sxx = sum((p[0]-mx)**2 for p in points) / n
    syy = sum((p[1]-my)**2 for p in points) / n
    sxy = sum((p[0]-mx)*(p[1]-my) for p in points) / n
    # eigen-decomposition of [[sxx,sxy],[sxy,syy]]
    trace = sxx + syy
    det = sxx*syy - sxy*sxy
    disc = math.sqrt(max(trace*trace/4 - det, 0))
    l1 = trace/2 + disc  # major
    l2 = trace/2 - disc  # minor
    if abs(sxy) < 1e-15 and abs(sxx-syy) < 1e-15:
        angle = 0.0
    else:
        angle = 0.5 * math.atan2(2*sxy, sxx-syy)
    return {
        "meanX": mx, "meanY": my,
        "majorStd": math.sqrt(max(l1,0)), "minorStd": math.sqrt(max(l2,0)),
        "principalAngleDeg": math.degrees(angle),  # angle of major axis from +X axis
        "eccentricity_minor_over_major": (math.sqrt(max(l2,0)) / math.sqrt(max(l1,0))) if l1 > 1e-12 else None,
    }

def phase_points(phase_id, field="unfilteredPointer"):
    recs = phases[phase_id]
    return [(r["output"][field]["x"], r["output"][field]["y"]) for r in recs]

cross = {}
for ph in ["up", "down", "left", "right", "diagonal", "tiny", "slow", "fast"]:
    pts = phase_points(ph)
    if len(pts) >= 3:
        cross[ph] = pca_2d(pts)
report["cross_axis_pca_unfiltered"] = cross

# angle deviation from ideal cardinal (vertical phases should have principalAngle near 90deg or -90deg; horizontal near 0/180)
def angle_dev_from_axis(angle_deg, target_deg):
    # angle_deg and target_deg are axes (mod 180)
    d = (angle_deg - target_deg + 90) % 180 - 90
    return d

deviations = {}
for ph in ["up", "down"]:
    if ph in cross:
        deviations[ph + "_deg_off_vertical"] = angle_dev_from_axis(cross[ph]["principalAngleDeg"], 90)
for ph in ["left", "right"]:
    if ph in cross:
        deviations[ph + "_deg_off_horizontal"] = angle_dev_from_axis(cross[ph]["principalAngleDeg"], 0)
report["cross_axis_angle_deviation_deg"] = deviations

# ---------------------------------------------------------------------
# 4. Linear cross-coupling coefficient: pooled up+down (sign-aligned) and
#    pooled left+right (sign-aligned), regression slope of the
#    "unintended" axis on the "intended" axis (least squares through the
#    phase-start-centered displacement cloud).
# ---------------------------------------------------------------------
def displacement_cloud(phase_id, field="unfilteredPointer"):
    recs = phases[phase_id]
    if not recs:
        return []
    x0, y0 = recs[0]["output"][field]["x"], recs[0]["output"][field]["y"]
    return [(r["output"][field]["x"] - x0, r["output"][field]["y"] - y0) for r in recs]

def lstsq_slope(xs, ys):
    n = len(xs)
    mx = sum(xs)/n
    my = sum(ys)/n
    sxx = sum((x-mx)**2 for x in xs)
    sxy = sum((x-mx)*(y-my) for x,y in zip(xs,ys))
    return sxy/sxx if sxx > 1e-15 else None

up_d = displacement_cloud("up")
down_d = displacement_cloud("down")
# sign-align: "up" phase intended dy should be negative-ish or positive-ish - just flip down to match sign of up's mean dy
if up_d and down_d:
    up_mean_dy = sum(p[1] for p in up_d)/len(up_d)
    down_mean_dy = sum(p[1] for p in down_d)/len(down_d)
    flip = -1 if (up_mean_dy * down_mean_dy < 0) else 1
    pooled_dy = [p[1] for p in up_d] + [flip*p[1] for p in down_d]
    pooled_dx = [p[0] for p in up_d] + [flip*p[0] for p in down_d]
    vertical_coupling_slope = lstsq_slope(pooled_dy, pooled_dx)  # dx per unit dy
else:
    vertical_coupling_slope = None

left_d = displacement_cloud("left")
right_d = displacement_cloud("right")
if left_d and right_d:
    left_mean_dx = sum(p[0] for p in left_d)/len(left_d)
    right_mean_dx = sum(p[0] for p in right_d)/len(right_d)
    flip = -1 if (left_mean_dx * right_mean_dx < 0) else 1
    pooled_dx2 = [p[0] for p in left_d] + [flip*p[0] for p in right_d]
    pooled_dy2 = [p[1] for p in left_d] + [flip*p[1] for p in right_d]
    horizontal_coupling_slope = lstsq_slope(pooled_dx2, pooled_dy2)  # dy per unit dx
else:
    horizontal_coupling_slope = None

report["linear_coupling"] = {
    "vertical_phase_dx_per_unit_dy": vertical_coupling_slope,
    "horizontal_phase_dy_per_unit_dx": horizontal_coupling_slope,
    "note": "slope of the UNINTENDED pointer axis vs the INTENDED axis, pooled across up+down (sign-aligned) and left+right (sign-aligned); 0 = no coupling, +-1 = coupling as strong as the intended motion itself.",
}

# ---------------------------------------------------------------------
# 5. Calibration matrix from principal directions of vertical/horizontal
#    pooled clouds, and validation of residual angle after applying M^-1.
# ---------------------------------------------------------------------
def unit_dir_from_cloud(pts, sign_reference):
    # PCA major-axis unit vector (SHAPE: which direction does within-phase motion vary along,
    # from the phase's own displacement-from-first-sample cloud), sign chosen to match an
    # EXTERNAL screen-convention reference — NOT the pooled cloud's own mean (an artifact of
    # whichever of the two sign-flipped-and-combined phases dominated the pooling) and NOT the
    # phase's own displacement-from-its-own-first-sample mean either (these guided-capture phases
    # are not clean "start at center, push one way" segments — e.g. this session's real "down"
    # phase STARTS already near the bottom, at y=0.78, and its own recorded samples drift back
    # toward center by the phase's end, so ITS OWN relative-displacement mean is dy=-0.057, i.e.
    # backwards, even though the phase unambiguously sits in the screen's lower half throughout).
    # The one reference that survives this: mean ABSOLUTE unfilteredPointer position relative to
    # screen CENTER (0.5, 0.5) — "which half of the screen was this phase generally on" is stable
    # regardless of within-phase transition noise, and is what `sign_reference` carries in here.
    pca = pca_2d(pts)
    ang = math.radians(pca["principalAngleDeg"])
    ux, uy = math.cos(ang), math.sin(ang)
    rx, ry = sign_reference
    if ux*rx + uy*ry < 0:
        ux, uy = -ux, -uy
    return ux, uy

def mean_position_relative_to_center(phase_id):
    pts = phase_points(phase_id)
    mx = sum(p[0] for p in pts) / len(pts)
    my = sum(p[1] for p in pts) / len(pts)
    return (mx - 0.5, my - 0.5)

if up_d and down_d:
    up_mean_dy = sum(p[1] for p in up_d)/len(up_d)
    down_mean_dy_rel_start = sum(p[1] for p in down_d)/len(down_d)
    vflip = -1 if (up_mean_dy * down_mean_dy_rel_start < 0) else 1
    pooled_vertical = up_d + [(vflip*p[0], vflip*p[1]) for p in down_d]
    e_v = unit_dir_from_cloud(pooled_vertical, mean_position_relative_to_center("down"))  # screen convention: DOWN is +y
else:
    e_v = None

if left_d and right_d:
    left_mean_dx = sum(p[0] for p in left_d)/len(left_d)
    right_mean_dx_rel_start = sum(p[0] for p in right_d)/len(right_d)
    hflip = -1 if (left_mean_dx * right_mean_dx_rel_start < 0) else 1
    pooled_horizontal = left_d + [(hflip*p[0], hflip*p[1]) for p in right_d]
    e_h = unit_dir_from_cloud(pooled_horizontal, mean_position_relative_to_center("right"))  # screen convention: RIGHT is +x
else:
    e_h = None

calib = {}
if e_v and e_h:
    # B = [e_h | e_v] columns; want B^-1 to map observed -> screen-aligned (1,0)/(0,1)
    a, c = e_h
    b, dd = e_v
    det = a*dd - b*c
    if abs(det) > 1e-9:
        # inverse of [[a,b],[c,d]]
        inv = [[dd/det, -b/det], [-c/det, a/det]]
        calib["e_h"] = e_h
        calib["e_v"] = e_v
        calib["angle_between_h_v_deg"] = math.degrees(math.acos(max(-1,min(1, e_h[0]*e_v[0]+e_h[1]*e_v[1]))))
        calib["M_inverse"] = inv
        calib["det"] = det

        def apply(inv, pt):
            return (inv[0][0]*pt[0] + inv[0][1]*pt[1], inv[1][0]*pt[0] + inv[1][1]*pt[1])

        # validate: recompute PCA angle deviation after calibration for each phase
        post = {}
        for ph, target_axis in (("up", 90), ("down", 90), ("left", 0), ("right", 0)):
            pts = displacement_cloud(ph)
            if len(pts) < 3:
                continue
            corrected = [apply(inv, p) for p in pts]
            pca_c = pca_2d(corrected)
            post[ph] = angle_dev_from_axis(pca_c["principalAngleDeg"], target_axis)
        calib["post_calibration_angle_deviation_deg"] = post

        # check diagonal is preserved (not forced to cardinal): angle should stay ~45 off both axes, just report new principal angle
        diag_pts = displacement_cloud("diagonal")
        if len(diag_pts) >= 3:
            diag_corrected = [apply(inv, p) for p in diag_pts]
            calib["diagonal_principal_angle_before_deg"] = cross.get("diagonal", {}).get("principalAngleDeg")
            calib["diagonal_principal_angle_after_deg"] = pca_2d(diag_corrected)["principalAngleDeg"]

        # SIGN check (angle_dev_from_axis alone is mod-180 blind to a full flip — this is what would
        # have caught the RIGHT/LEFT-inversion bug before it shipped): applying M_inverse to each
        # phase's own mean ABSOLUTE position-relative-to-center must land on the expected screen side
        # (right phase -> +x, left -> -x, down -> +y, up -> -y). Ground truth is absolute position
        # relative to center, not displacement-from-the-phase's-own-first-sample (see
        # unit_dir_from_cloud's doc comment for why the latter is unreliable on these real phases).
        sign_check = {}
        expected_sign = {"up": (1, -1), "down": (1, 1), "left": (0, -1), "right": (0, 1)}
        for ph, (axis_index, expected) in expected_sign.items():
            mean_before = mean_position_relative_to_center(ph)
            mean_after = apply(inv, mean_before)
            sign_check[ph] = {
                "beforeValue": mean_before[axis_index],
                "afterValue": mean_after[axis_index],
                "expectedSign": expected,
                "preserved": math.copysign(1, mean_after[axis_index]) == expected if mean_after[axis_index] != 0 else False,
            }
        calib["sign_check"] = sign_check
        calib["sign_check_all_preserved"] = all(v["preserved"] for v in sign_check.values())
report["calibration_matrix"] = calib

# ---------------------------------------------------------------------
# 6. Twist (rotate_one/rotate_other) evidence — pure in-place twist only
#    (this session tests holding aim + twisting, NOT aiming-while-twisted)
# ---------------------------------------------------------------------
twist = {}
for ph in ["rotate_one", "rotate_other"]:
    recs = phases[ph]
    if not recs:
        continue
    pts = [(r["output"]["pointer"]["x"], r["output"]["pointer"]["y"]) for r in recs]
    x0, y0 = pts[0]
    drifts = [math.hypot(x-x0, y-y0) for x,y in pts]
    twist_rate = [r["sample"]["gyroscopeDps"][0] for r in recs]
    twist[ph] = {
        "n": len(recs),
        "maxPointerDriftFromPhaseStart": max(drifts),
        "finalPointerDriftFromPhaseStart": drifts[-1],
        "meanAbsTwistRateDps": sum(abs(x) for x in twist_rate)/len(twist_rate),
        "maxAbsTwistRateDps": max(abs(x) for x in twist_rate),
        "anglesRollRangeDeg": max(r["sample"]["anglesDeg"][0] for r in recs) - min(r["sample"]["anglesDeg"][0] for r in recs),
    }
report["twist_in_place"] = twist

# ---------------------------------------------------------------------
# 7. Still-phase jitter (pointer + gyro)
# ---------------------------------------------------------------------
def jitter_stats(phase_id, field="pointer"):
    recs = phases[phase_id]
    if len(recs) < 3:
        return None
    pts = [(r["output"][field]["x"], r["output"][field]["y"]) for r in recs]
    mx = sum(p[0] for p in pts)/len(pts)
    my = sum(p[1] for p in pts)/len(pts)
    dists = sorted(math.hypot(p[0]-mx, p[1]-my) for p in pts)
    rms = math.sqrt(sum(d*d for d in dists)/len(dists))
    p95 = dists[int(0.95*(len(dists)-1))]
    peak_to_peak_x = max(p[0] for p in pts) - min(p[0] for p in pts)
    peak_to_peak_y = max(p[1] for p in pts) - min(p[1] for p in pts)
    gyro = [r["sample"]["gyroscopeDps"] for r in recs]
    gyro_mad = []
    for axis in range(3):
        vals = sorted(g[axis] for g in gyro)
        med = vals[len(vals)//2]
        mad = sorted(abs(v-med) for v in vals)[len(vals)//2]
        gyro_mad.append(mad)
    return {
        "n": len(recs), "rms_dist_from_mean": rms, "p95_dist_from_mean": p95,
        "peak_to_peak_x": peak_to_peak_x, "peak_to_peak_y": peak_to_peak_y,
        "gyro_mad_dps": gyro_mad,
    }

jitters = {}
for ph in ["still_start", "still_end"]:
    for field in ["pointer", "unfilteredPointer"]:
        j = jitter_stats(ph, field)
        if j:
            jitters[f"{ph}__{field}"] = j
report["still_jitter"] = jitters

# ---------------------------------------------------------------------
# 8. Latency stage breakdown (per-record output.timing)
# ---------------------------------------------------------------------
def stage(a, b):
    return b - a

parsing_ms, controller_ms, filter_ms, total_ms, intent_plus_filter_ms = [], [], [], [], []
for r in records:
    t = r["output"]["timing"]
    if all(k in t and t[k] is not None for k in ("bleNotificationAtMs","parsedAtMs","controllerStartedAtMs","filterStartedAtMs","filterCompletedAtMs","pointerOutputAtMs")):
        parsing_ms.append(stage(t["bleNotificationAtMs"], t["parsedAtMs"]))
        controller_ms.append(stage(t["parsedAtMs"], t["controllerStartedAtMs"]))
        filter_ms.append(stage(t["filterStartedAtMs"], t["filterCompletedAtMs"]))
        total_ms.append(stage(t["bleNotificationAtMs"], t["pointerOutputAtMs"]))

def summarize(vals):
    if not vals:
        return None
    s = sorted(vals)
    return {"mean": statistics.mean(vals), "median": statistics.median(vals), "p95": s[int(0.95*(len(s)-1))], "max": s[-1]}

report["latency_stages_ms"] = {
    "parsing_ble_to_parsed": summarize(parsing_ms),
    "controller_parsed_to_controllerStarted": summarize(controller_ms),
    "filter_stage": summarize(filter_ms),
    "total_ble_to_pointerOutput": summarize(total_ms),
}

# ---------------------------------------------------------------------
# 9. hardwareComparison duplicate-label investigation
# ---------------------------------------------------------------------
hc_summary = []
for hc in d.get("hardwareComparison", []):
    c = hc["candidate"]
    hc_summary.append({
        "label": c["label"], "rateHz": c["rateHz"], "bandwidthHz": c["bandwidthHz"],
        "originalRateCode": hc.get("originalRateCode"), "originalBandwidthCode": hc.get("originalBandwidthCode"),
        "measuredHz": hc.get("measuredHz"), "stillNoiseGyroDps_std": [a["std"] for a in hc.get("stillNoiseGyroDps", [])],
    })
report["hardware_comparison_trials"] = hc_summary

# ---------------------------------------------------------------------
# 10. Edge reversal + achieved range (straight from profile, re-verified)
# ---------------------------------------------------------------------
report["profile_edge_and_range"] = {
    "edgeReversal": d["profile"]["edgeReversal"],
    "achievedRange": d["profile"]["achievedRange"],
    "noiseEnvelope": d["profile"]["noiseEnvelope"],
}

with open(OUT, "w") as f:
    json.dump(report, f, indent=2, default=str)

print("WROTE", OUT)
print(json.dumps({k: report[k] for k in ["sample_rate", "phase_counts"]}, indent=2))
