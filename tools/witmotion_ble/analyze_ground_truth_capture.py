#!/usr/bin/env python3
"""Score the CURRENT, unmodified semantic_detector.py against a ground-truth-marked capture.

Companion to capture_normal_full_clean.py. That tool records explicit
per-repetition markers (neutral_confirmed, raise_requested, movement_started,
movement_peak_trigger, lowering_requested, neutral_release_confirmed,
repetition_complete) instead of inferring repetition boundaries after the
fact - this script replays RightHandRaiseSession against the raw CSV exactly
as replay_gate.py does (same bootstrap, same axis/prototypes, no constant
tuning) and reports counts against those markers specifically, per the
request that produced both tools:

    - expected vs detected RIGHT_HAND_RAISE events
    - each event's timestamp, and which ground-truth repetition window (if
      any) it falls inside
    - whether one physical repetition produced more than one event
    - whether the detector rearmed (returned to ARMED) before the matching
      repetition's own neutral_release_confirmed marker - i.e. while the arm
      was, per ground truth, still mid-movement
    - how far the live baseline pose drifted from the first confirmed
      neutral, across the whole file
    - whether all 5 repetitions produced a confirmed release/rearm

Usage:

    tools/witmotion_ble/.venv/bin/python tools/witmotion_ble/analyze_ground_truth_capture.py \\
        --session right_hand_adult_sim_20260902_01 --label normal_full_raise_clean --repetition 1
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

try:
    from calibration_engine import vector_norm
    from replay_gate import (
        BOOTSTRAP_SAMPLE_COUNT,
        SESSION_DIR as DEFAULT_SESSION_DIR,
        bootstrap_baseline_from_prefix,
        load_directional_prototypes,
        load_raise_axis,
        load_rows,
    )
    from semantic_detector import RightHandRaiseSession
except ImportError:  # Support module execution from the repository root.
    from tools.witmotion_ble.calibration_engine import vector_norm
    from tools.witmotion_ble.replay_gate import (
        BOOTSTRAP_SAMPLE_COUNT,
        SESSION_DIR as DEFAULT_SESSION_DIR,
        bootstrap_baseline_from_prefix,
        load_directional_prototypes,
        load_raise_axis,
        load_rows,
    )
    from tools.witmotion_ble.semantic_detector import RightHandRaiseSession


def load_events(events_path: Path) -> list[dict]:
    return json.loads(events_path.read_text(encoding="utf-8"))


def repetition_windows(events: list[dict]) -> list[dict]:
    """One window per ground-truth repetition, keyed by its own markers."""
    windows: dict[int, dict] = {}
    for event in events:
        rep = event.get("repetition")
        if not rep:
            continue
        windows.setdefault(rep, {"repetition": rep})[event["event"]] = event["elapsed_s"]
    return [windows[rep] for rep in sorted(windows)]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", default=DEFAULT_SESSION_DIR.name)
    parser.add_argument("--label", required=True)
    parser.add_argument("--repetition", type=int, default=1)
    parser.add_argument("--expected-repetitions", type=int, default=5)
    args = parser.parse_args()

    session_dir = DEFAULT_SESSION_DIR.parent / args.session
    raw_path = session_dir / f"{args.label}_rep{args.repetition:02d}.csv"
    events_path = session_dir / f"{args.label}_rep{args.repetition:02d}_events.json"
    if not raw_path.exists() or not events_path.exists():
        print(f"missing capture files: {raw_path} / {events_path}")
        return 2

    ground_truth_events = load_events(events_path)
    windows = repetition_windows(ground_truth_events)

    raise_axis_index, raise_sign, raise_axis_name = load_raise_axis()
    directional_prototypes = load_directional_prototypes()

    rows = load_rows(raw_path)
    samples = [row.sample for row in rows]
    # Same, unbiased bootstrap methodology as every other file in replay_gate.py -
    # no per-file tuning, no use of the ground-truth neutral markers to seed it.
    neutral_rows = load_rows(session_dir / "neutral_rep02.csv")
    from calibration_engine import BaselineProfile

    neutral_baseline_full = BaselineProfile.from_samples([row.sample for row in neutral_rows])
    local_baseline, remainder = bootstrap_baseline_from_prefix(samples, neutral_baseline_full)

    trace: list = []
    session = RightHandRaiseSession(
        local_baseline, raise_axis_index, raise_sign,
        directional_prototypes=directional_prototypes, trace=trace,
    )
    for offset, sample in enumerate(remainder):
        session.observe(BOOTSTRAP_SAMPLE_COUNT + offset, sample)

    offset_elapsed = remainder[0].timestamp - samples[0].timestamp if remainder else 0.0
    # Ground-truth elapsed_s is relative to capture_started_at (sample 0); detector
    # timestamps are the MotionSample.timestamp values straight from the CSV
    # (elapsed_s already, since load_rows uses record["elapsed_s"] directly) - both
    # share the same time base, so no re-basing is actually needed; kept explicit
    # for clarity in case bootstrap ever changes what remainder's first timestamp means.
    del offset_elapsed

    print("=" * 78)
    print(f"GROUND-TRUTH REPLAY: {raw_path.name}")
    print(f"Personalized raise axis: {raise_axis_name} (sign {raise_sign:+d})")
    print(f"Ground-truth repetitions recorded: {len(windows)} (expected {args.expected_repetitions})")
    print("=" * 78)

    detected = [(event.timestamp, event) for event in session.events]
    print(f"Detected RIGHT_HAND_RAISE events: {len(detected)} (expected {args.expected_repetitions})")
    for timestamp, event in detected:
        print(
            f"  event idx={event.sample_index} t={timestamp:7.2f}  "
            f"nearest={event.nearest_prototype} cos={event.nearest_prototype_cosine} "
            f"path={event.movement.detection_path} peak={event.movement.peak_angle_delta_deg:.2f}deg"
        )

    print("-" * 78)
    print("Per ground-truth repetition window:")
    duplicate_windows = []
    unmatched_windows = []
    for window in windows:
        rep = window["repetition"]
        start = window.get("raise_requested")
        end = window.get("repetition_complete")
        if start is None or end is None:
            print(f"  rep {rep}: INCOMPLETE ground-truth window (missing markers) {window}")
            continue
        inside = [(t, e) for t, e in detected if start <= t <= end + 0.5]
        status = "OK" if len(inside) == 1 else ("MISSING" if not inside else "DUPLICATE")
        if status == "DUPLICATE":
            duplicate_windows.append(rep)
        if status == "MISSING":
            unmatched_windows.append(rep)
        print(
            f"  rep {rep}: window [{start:.2f}, {end:.2f}]s  "
            f"peak_trigger_gt={window.get('movement_peak_trigger')}  "
            f"detected_in_window={len(inside)}  [{status}]"
        )

    outside = [(t, e) for t, e in detected if not any(
        w.get("raise_requested") is not None and w.get("repetition_complete") is not None
        and w["raise_requested"] <= t <= w["repetition_complete"] + 0.5
        for w in windows
    )]
    print("-" * 78)
    print(f"Events OUTSIDE any ground-truth repetition window (spurious): {len(outside)}")
    for t, e in outside:
        print(f"  t={t:7.2f} idx={e.sample_index} nearest={e.nearest_prototype}")

    # Did the detector rearm (return to ARMED, i.e. declared the release
    # confirmed) BEFORE ground truth's own neutral_release_confirmed marker
    # for the repetition that was in progress at that time?
    rearm_times = [t.timestamp for t in trace if t.new_state == "IDLE" and t.previous_state != "IDLE"]
    premature_rearms = []
    for window in windows:
        rep = window["repetition"]
        gt_release = window.get("neutral_release_confirmed")
        gt_trigger = window.get("movement_peak_trigger")
        if gt_release is None or gt_trigger is None:
            continue
        early = [rt for rt in rearm_times if gt_trigger < rt < gt_release - 0.3]
        if early:
            premature_rearms.append((rep, early))
    print("-" * 78)
    print(f"Rearms that landed BEFORE ground truth's own release confirmation: {len(premature_rearms)}")
    for rep, times in premature_rearms:
        print(f"  rep {rep}: detector rearmed at {times} while ground truth release was at "
              f"{next(w['neutral_release_confirmed'] for w in windows if w['repetition'] == rep):.2f}")

    # Baseline drift across the whole file.
    baseline_poses = [t.baseline_pose_deg for t in trace if t.new_state == "IDLE"]
    if len(baseline_poses) >= 2:
        first, last = baseline_poses[0], baseline_poses[-1]
        drift = vector_norm(tuple(last[i] - first[i] for i in range(3)))
        max_drift = max(
            vector_norm(tuple(pose[i] - first[i] for i in range(3))) for pose in baseline_poses
        )
        print("-" * 78)
        print(f"Baseline pose drift across file: first={tuple(round(v,2) for v in first)} "
              f"last={tuple(round(v,2) for v in last)} net_drift={drift:.2f}deg max_drift={max_drift:.2f}deg")

    print("-" * 78)
    print(f"session.rearm_count={session.rearm_count}  events={len(session.events)}  "
          f"ends_in_state={session.state}")
    print(f"All {args.expected_repetitions} releases confirmed by detector: "
          f"{session.rearm_count >= min(len(session.events), args.expected_repetitions)}")
    print("=" * 78)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
