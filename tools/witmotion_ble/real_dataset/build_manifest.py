#!/usr/bin/env python3
"""
Builds manifest.json indexing every preserved REAL WT901BLECL RIGHT_HAND
diagnostic capture under raw/. Read-only over the raw files; never deletes
or overwrites a raw capture.

Ground-truth quality tiers (see AGENTS/task brief):
  HIGH_CONFIDENCE - real capture + independently validated against another
                    real source (not yet true for any session here).
  USABLE          - real capture, complete phase set, finite values,
                    physically plausible, no independent cross-validation.
  AMBIGUOUS       - real capture with a gap/inconsistency that needs a human
                    call before trusting it for a given use.
  TRUNCATED       - session ended before all planned phases were captured.
  REJECTED        - simulated/synthetic data, or corrupt/unusable.
"""
import json
import os
import statistics
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(HERE, "raw")
OUT_PATH = os.path.join(HERE, "manifest.json")


def git_short_hash() -> str | None:
    """Best-effort controller-code version stamp (Part 1: 'controller version/config' per session). Never fails the build if git is unavailable."""
    try:
        return subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"], cwd=HERE, capture_output=True, text=True, timeout=2,
        ).stdout.strip() or None
    except Exception:
        return None

EXPECTED_PHASES = [
    "still_start", "rotate_one", "rotate_other", "right", "left",
    "up", "down", "diagonal", "tiny", "slow", "fast", "still_end",
]
# Additive phases present in FINAL_SESSION captures (see
# lib/physicalInput/FinalSessionPhases.ts) on top of EXPECTED_PHASES above.
# Not required (older diagnostic-only captures won't have them), but counted
# in phaseCounts/labelsPhases when present so the manifest doesn't silently
# drop them.
OPTIONAL_FINAL_SESSION_PHASES = [
    "edge_right_reverse_left", "edge_left_reverse_right",
    "edge_top_reverse_down", "edge_bottom_reverse_up",
    "recenter_test", "free_play",
]

# A completely different phase taxonomy (see lib/physicalInput/
# TwistInvarianceCapturePhases.ts's TWIST_INVARIANCE_SESSION_PHASES) - not a
# superset of EXPECTED_PHASES, so it needs its own classify() path,
# dispatched by sessionKind rather than assumed compatible.
EXPECTED_TWIST_INVARIANCE_PHASES = [
    f"{posture}_{direction}"
    for posture in ("neutral", "twist_45", "twist_90")
    for direction in ("up", "down", "left", "right")
]
OPTIONAL_TWIST_INVARIANCE_PHASES = ["edge_left_reverse_right", "edge_top_reverse_down"]


def classify_against(records, phase_counts, expected_phases) -> tuple[str, list[str]]:
    problems = []
    missing = [p for p in expected_phases if phase_counts.get(p, 0) == 0]
    if missing:
        problems.append(f"missing phases: {missing}")
        return "TRUNCATED", problems

    finite_ok = True
    for r in records:
        s = r["sample"]
        for group in (s["accelerationG"], s["gyroscopeDps"], s["anglesDeg"]):
            for v in group:
                if not isinstance(v, (int, float)) or v != v:  # NaN check
                    finite_ok = False
    if not finite_ok:
        problems.append("non-finite sensor values present")
        return "REJECTED", problems

    for p in expected_phases:
        if phase_counts.get(p, 0) < 10:
            problems.append(f"phase '{p}' has only {phase_counts.get(p, 0)} samples (<10)")
    if problems:
        return "AMBIGUOUS", problems

    return "USABLE", problems


def classify(records, phase_counts) -> tuple[str, list[str]]:
    return classify_against(records, phase_counts, EXPECTED_PHASES)


def sample_interval_stats(records):
    """Gap/duplicate-aware rate estimate.

    Two real-world quirks a plain mean-of-positive-intervals miscounts:
    1. Higher-rate WT901 exports (e.g. 50Hz FINAL_SESSION captures) deliver
       accel/gyro/angle as separate BLE packets that often land within the
       same millisecond, so ~half of consecutive records share an identical
       timestampMs (delta 0). Dropping those (old behaviour: `if b > a`)
       still measures the right INSTANTANEOUS notification cadence, but
       silently halves the reported Hz relative to the true record rate,
       since two records land per averaged interval.
    2. A single long non-streaming pause (e.g. a recenter button dialog)
       dominates a plain mean and drags the estimate down even though
       streaming itself was steady throughout.
    Fix: sum only intervals <= 500ms (small enough to be within-stream, not
    a UI pause) as the streaming duration, and divide the number of such
    intervals by that duration -> records-per-second actually delivered
    while streaming, immune to both quirks. Falls back to the old
    positive-only mean if every interval is 0 or >500ms (nothing to divide).
    """
    ts = [r["sample"]["timestampMs"] for r in records]
    intervals = [b - a for a, b in zip(ts, ts[1:])]
    streaming = [x for x in intervals if 0 <= x <= 500]
    streaming_duration_ms = sum(streaming)
    if streaming_duration_ms > 0:
        hz = 1000.0 * len(streaming) / streaming_duration_ms
        mean_ms = streaming_duration_ms / len(streaming)
        return mean_ms, hz
    positive = [x for x in intervals if x > 0]
    if not positive:
        return None, None
    mean_ms = sum(positive) / len(positive)
    return mean_ms, (1000.0 / mean_ms if mean_ms > 0 else None)


def build():
    controller_version = git_short_hash()
    entries = []
    for fn in sorted(os.listdir(RAW_DIR)):
        if not fn.endswith(".json"):
            continue
        path = os.path.join(RAW_DIR, fn)
        with open(path) as f:
            d = json.load(f)
        records = d.get("records", [])
        phase_counts = {}
        for r in records:
            phase_counts[r["phase"]] = phase_counts.get(r["phase"], 0) + 1
        mean_interval_ms, hz = sample_interval_stats(records)
        session_kind = d.get("sessionKind")
        if session_kind == "TWIST_INVARIANCE_2026_09_04":
            quality, problems = classify_against(records, phase_counts, EXPECTED_TWIST_INVARIANCE_PHASES)
            labels_phases = EXPECTED_TWIST_INVARIANCE_PHASES + [p for p in OPTIONAL_TWIST_INVARIANCE_PHASES if p in phase_counts]
        else:
            quality, problems = classify(records, phase_counts)
            labels_phases = EXPECTED_PHASES + [p for p in OPTIONAL_FINAL_SESSION_PHASES if p in phase_counts]

        # note whether the shipped-in-code rotationCompensationX (0.2771) or
        # an earlier value (0) was active when this capture's own `output`
        # field was computed by the app - irrelevant to replay (which always
        # re-derives from raw sensor fields) but relevant to a human reading
        # this session's embedded rotationAnalysis numbers directly.
        recorded_k = d.get("config", {}).get("rotationCompensationX")

        # Optional freeform sidecar, e.g. raw/<file>.notes.md — never required, never generated
        # automatically (a human/therapist note about this specific session), picked up automatically
        # on the next build_manifest.py run if one is added later (Part 1: dataset "should become
        # progressively more useful" without hand-editing manifest.json itself).
        notes_path = path + ".notes.md"
        notes = open(notes_path).read().strip() if os.path.exists(notes_path) else None

        entries.append({
            "file": fn,
            "path": f"tools/witmotion_ble/real_dataset/raw/{fn}",
            "date": d.get("capturedAt"),
            "sensorRole": d.get("role"),
            "controllerVersionAtIndexTime": controller_version,
            "notes": notes,
            "mountingOrientation": "not recorded by capture tool - unknown, treat as fixed-but-unverified per session",
            "sampleRateHz": {"measured": round(hz, 2) if hz else None, "meanIntervalMs": round(mean_interval_ms, 2) if mean_interval_ms else None},
            "controllerConfigAtCapture": d.get("config"),
            "recordedRotationCompensationX": recorded_k,
            "sessionKind": session_kind,
            "sampleCount": len(records),
            "phaseCounts": phase_counts,
            "labelsPhases": labels_phases,
            "embeddedRotationAnalysis": d.get("rotationAnalysis"),
            "embeddedLatency": d.get("latency"),
            "groundTruthQuality": quality,
            "knownProblems": problems + (
                [f"sample rate ~{round(hz)} Hz (BLE notification default), far below the device's supported output rate - flagged as the primary open reliability risk"]
                if hz is not None and hz < 20 else []
            ) + [
                "no independent (e.g. camera/mocap) ground truth - phase labels are self-reported by the same person performing the motion, not externally verified",
            ],
            "acceptedUse": [
                "rotation-compensation model replay and comparison (source of truth: raw accelerationG/gyroscopeDps/anglesDeg, not the embedded `output` field, which reflects whatever k was active at capture time)",
                "sample-rate-problem evidence",
                "filter behaviour replay (LIGHT_EMA / ADAPTIVE_EMA / ONE_EURO)",
                "NOT accepted as the sole ground truth for a shipped rotationCompensationX value - see replay_report.json for why a single session's regression should not be trusted alone",
            ],
        })

    manifest = {
        "generatedBy": "build_manifest.py",
        "datasetRoot": "tools/witmotion_ble/real_dataset/raw/",
        "note": (
            "Every REAL WT901BLECL RIGHT_HAND hardware capture found on this "
            "machine as of 2026-09-04, recovered from ~/Downloads (the "
            "in-app diagnostic/final-session tool's export location) and "
            "copied here read-only (original files in ~/Downloads left "
            "untouched). tools/witmotion_ble/calibration_data/"
            "right_hand_adult_sim_20260902_01/ is SIMULATED data (see its "
            "own name) and is intentionally excluded from this real-data "
            "manifest - it must not be pooled with these sessions as if it "
            "were hardware evidence. Three capture tool/schema eras exist: "
            "the 3 2026-09-03 diagnostic captures (9.93Hz, fused-angle "
            "controller), the 2026-09-04 FINAL_SESSION capture (11,402 "
            "samples, 50Hz/20Hz, gyro-integrated controller), and the "
            "2026-09-04 TWIST_INVARIANCE capture (4,960 samples, 50Hz/20Hz, "
            "0-98deg actual measured wrist roll - the one dataset with "
            "real roll-varying evidence) - see each session's own entry "
            "below and tools/witmotion_ble/real_dataset/FINDINGS.md for how "
            "they compare."
        ),
        "totalSessions": len(entries),
        "totalSamples": sum(e["sampleCount"] for e in entries),
        "sessions": entries,
    }
    with open(OUT_PATH, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"Indexed {len(entries)} real sessions, {manifest['totalSamples']} samples -> {OUT_PATH}")
    for e in entries:
        print(f"  {e['file']}: {e['groundTruthQuality']}, {e['sampleCount']} samples, {e['sampleRateHz']['measured']} Hz, k_at_capture={e['recordedRotationCompensationX']}")


if __name__ == "__main__":
    build()
