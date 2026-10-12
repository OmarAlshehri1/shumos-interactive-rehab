#!/usr/bin/env python3
"""One command, run after tomorrow's two clean captures exist: full acceptance gate.

Combines two things, both replayed offline against the SAME unmodified
``semantic_detector.RightHandRaiseSession`` - this tool never adjusts a
single detector constant, it only reports what the detector already does:

1. ``replay_gate.py`` unchanged, as a subprocess - its own ten criteria over
   neutral / jitter / very_small / medium / the old small_slow+small_sudden
   (kept for transparency) / normal_full_raise_clean / the full 10-direction
   Face-ID enrollment (directional specificity).
2. Ground-truth window checks (the same method
   ``analyze_ground_truth_capture.py`` already uses for
   normal_full_raise_clean_rep01.csv) for THREE ground-truth-marked
   datasets: normal_full_raise_clean (already captured), and
   small_slow_raise_clean / small_sudden_raise_clean (produced by
   ``capture_small_movements_clean.py`` - not yet captured as of the night
   this tool was written; this tool finds them automatically once they
   exist and reports NOT_YET_CAPTURED honestly, not a fabricated pass, if
   they do not).

For each ground-truth dataset present, checks per the module's own
requirements: every one of the 5 repetition windows contains EXACTLY one
detected event (duplicates show as DUPLICATE, missed reps as MISSING), zero
detected events fall outside every window (spurious detections), and zero
rearms complete before their own repetition's ground-truth release marker
(premature rearm = hold/rearm behavior failure).

Usage (after tomorrow's two clean captures exist):

    tools/witmotion_ble/.venv/bin/python tools/witmotion_ble/full_validation_gate.py

Exits 0 only if every check - replay_gate.py's own gate AND all three
ground-truth datasets - passes. Never tunes anything; PASS or FAIL honestly.
"""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
from typing import Any

try:
    from analyze_ground_truth_capture import load_events, repetition_windows
    from calibration_engine import BaselineProfile
    from replay_gate import (
        BOOTSTRAP_SAMPLE_COUNT,
        NEUTRAL_BASELINE_FILE,
        SESSION_DIR,
        bootstrap_baseline_from_prefix,
        load_directional_prototypes,
        load_raise_axis,
        load_rows,
    )
    from semantic_detector import RightHandRaiseSession
except ImportError:  # Support module execution from the repository root.
    from tools.witmotion_ble.analyze_ground_truth_capture import load_events, repetition_windows
    from tools.witmotion_ble.calibration_engine import BaselineProfile
    from tools.witmotion_ble.replay_gate import (
        BOOTSTRAP_SAMPLE_COUNT,
        NEUTRAL_BASELINE_FILE,
        SESSION_DIR,
        bootstrap_baseline_from_prefix,
        load_directional_prototypes,
        load_raise_axis,
        load_rows,
    )
    from tools.witmotion_ble.semantic_detector import RightHandRaiseSession

VENV_PYTHON = Path(__file__).parent / ".venv" / "bin" / "python"
REPLAY_GATE_SCRIPT = Path(__file__).parent / "replay_gate.py"
REPLAY_GATE_REPORT = Path(__file__).parent / "replay_gate_report.json"
FULL_REPORT_PATH = Path(__file__).parent / "full_validation_gate_report.json"

# (dataset label, filename label prefix). rep01 only, per capture_*_clean.py's own convention.
GROUND_TRUTH_DATASETS = [
    ("normal_full_raise_clean", "normal_full_raise_clean"),
    ("small_slow_raise_clean", "small_slow_raise_clean"),
    ("small_sudden_raise_clean", "small_sudden_raise_clean"),
]


def run_replay_gate() -> dict[str, Any]:
    """Run replay_gate.py unmodified as a subprocess and load its JSON report."""
    python = str(VENV_PYTHON) if VENV_PYTHON.exists() else sys.executable
    result = subprocess.run(
        [python, str(REPLAY_GATE_SCRIPT)], cwd=str(Path(__file__).parent), capture_output=True, text=True
    )
    print(result.stdout)
    if result.returncode not in (0, 1):
        print(result.stderr, file=sys.stderr)
        raise RuntimeError(f"replay_gate.py crashed (exit {result.returncode})")
    if not REPLAY_GATE_REPORT.exists():
        raise RuntimeError("replay_gate.py did not write replay_gate_report.json")
    report = json.loads(REPLAY_GATE_REPORT.read_text(encoding="utf-8"))
    report["_subprocess_exit_code"] = result.returncode
    return report


def check_ground_truth_dataset(label: str, file_prefix: str) -> dict[str, Any]:
    raw_path = SESSION_DIR / f"{file_prefix}_rep01.csv"
    events_path = SESSION_DIR / f"{file_prefix}_rep01_events.json"
    if not raw_path.exists() or not events_path.exists():
        return {
            "label": label,
            "status": "NOT_YET_CAPTURED",
            "hint": f"run capture_small_movements_clean.py or capture_normal_full_clean.py to produce {raw_path.name}",
            "passed": False,
        }

    raise_axis_index, raise_sign, raise_axis_name = load_raise_axis()
    directional_prototypes = load_directional_prototypes()
    neutral_rows = load_rows(SESSION_DIR / NEUTRAL_BASELINE_FILE)
    neutral_baseline_full = BaselineProfile.from_samples([row.sample for row in neutral_rows])

    ground_truth_events = load_events(events_path)
    windows = repetition_windows(ground_truth_events)

    rows = load_rows(raw_path)
    samples = [row.sample for row in rows]
    local_baseline, remainder = bootstrap_baseline_from_prefix(samples, neutral_baseline_full)
    # Built directly (not via replay_gate.replay()) so a trace list can be
    # threaded through - needed for the premature-rearm check below, exactly
    # as analyze_ground_truth_capture.py does for the same reason.
    trace: list = []
    session = RightHandRaiseSession(
        local_baseline, raise_axis_index, raise_sign,
        directional_prototypes=directional_prototypes, trace=trace,
    )
    for offset, sample in enumerate(remainder):
        session.observe(BOOTSTRAP_SAMPLE_COUNT + offset, sample)
    detected = [(event.timestamp, event) for event in session.events]

    per_repetition: list[dict[str, Any]] = []
    duplicate_reps: list[int] = []
    missing_reps: list[int] = []
    for window in windows:
        rep = window["repetition"]
        start = window.get("raise_requested")
        end = window.get("repetition_complete")
        if start is None or end is None:
            per_repetition.append({"repetition": rep, "status": "INCOMPLETE_GROUND_TRUTH"})
            continue
        inside = [t for t, _ in detected if start <= t <= end + 0.5]
        status = "OK" if len(inside) == 1 else ("MISSING" if not inside else "DUPLICATE")
        if status == "DUPLICATE":
            duplicate_reps.append(rep)
        if status == "MISSING":
            missing_reps.append(rep)
        per_repetition.append({"repetition": rep, "status": status, "detected_in_window": len(inside)})

    outside = [
        t for t, _ in detected
        if not any(
            w.get("raise_requested") is not None and w.get("repetition_complete") is not None
            and w["raise_requested"] <= t <= w["repetition_complete"] + 0.5
            for w in windows
        )
    ]

    rearm_times = [t.timestamp for t in trace if t.new_state == "IDLE" and t.previous_state != "IDLE"]
    premature_rearms: list[int] = []
    for window in windows:
        gt_release = window.get("neutral_release_confirmed")
        gt_trigger = window.get("movement_peak_trigger")
        if gt_release is None or gt_trigger is None:
            continue
        early = [rt for rt in rearm_times if gt_trigger < rt < gt_release - 0.3]
        if early:
            premature_rearms.append(window["repetition"])

    all_ok = (
        len(windows) == 5
        and all(item["status"] == "OK" for item in per_repetition)
        and not outside
        and not premature_rearms
    )
    return {
        "label": label,
        "status": "CHECKED",
        "passed": all_ok,
        "ground_truth_repetitions": len(windows),
        "detected_events": len(detected),
        "per_repetition": per_repetition,
        "duplicate_repetitions": duplicate_reps,
        "missing_repetitions": missing_reps,
        "spurious_events_outside_any_window": len(outside),
        "premature_rearms_before_release_marker": premature_rearms,
    }


def main() -> int:
    print("=" * 78)
    print("FULL VALIDATION GATE - RIGHT_HAND_RAISE")
    print("Step 1/2: replay_gate.py (unmodified, own 10 criteria)")
    print("=" * 78)
    replay_gate_report = run_replay_gate()

    print("=" * 78)
    print("Step 2/2: ground-truth per-repetition window checks")
    print("=" * 78)
    ground_truth_reports = [check_ground_truth_dataset(label, prefix) for label, prefix in GROUND_TRUTH_DATASETS]
    for report in ground_truth_reports:
        if report["status"] == "NOT_YET_CAPTURED":
            print(f"[NOT YET CAPTURED] {report['label']}: {report['hint']}")
            continue
        status = "PASS" if report["passed"] else "FAIL"
        print(f"[{status}] {report['label']}: {report['ground_truth_repetitions']} ground-truth reps, "
              f"{report['detected_events']} detected, "
              f"duplicates={report['duplicate_repetitions']}, missing={report['missing_repetitions']}, "
              f"spurious={report['spurious_events_outside_any_window']}, "
              f"premature_rearms={report['premature_rearms_before_release_marker']}")

    all_ground_truth_present = all(r["status"] != "NOT_YET_CAPTURED" for r in ground_truth_reports)
    all_ground_truth_passed = all(r["passed"] for r in ground_truth_reports)
    overall_pass = bool(replay_gate_report.get("overall_pass")) and all_ground_truth_present and all_ground_truth_passed

    print("=" * 78)
    if not all_ground_truth_present:
        missing = [r["label"] for r in ground_truth_reports if r["status"] == "NOT_YET_CAPTURED"]
        print(f"OVERALL GATE RESULT: FAIL (honest - not all ground-truth datasets captured yet: {missing})")
    else:
        print(f"OVERALL GATE RESULT: {'PASS' if overall_pass else 'FAIL'}")
    print("=" * 78)

    full_report = {
        "overall_pass": overall_pass,
        "replay_gate_overall_pass": replay_gate_report.get("overall_pass"),
        "replay_gate_report": replay_gate_report,
        "ground_truth_datasets": ground_truth_reports,
        "all_ground_truth_datasets_present": all_ground_truth_present,
    }
    FULL_REPORT_PATH.write_text(json.dumps(full_report, indent=2), encoding="utf-8")
    print(f"Full report written to {FULL_REPORT_PATH}")
    return 0 if overall_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())
