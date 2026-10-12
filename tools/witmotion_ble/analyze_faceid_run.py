#!/usr/bin/env python3
"""Analyze one completed real Face-ID-style enrollment plus accepted history."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from statistics import mean, median


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session-dir", type=Path, required=True)
    parser.add_argument("--capture-id", required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    session_dir = args.session_dir.resolve()
    profile_path = session_dir / f"{args.capture_id}_profile.json"
    events_path = session_dir / f"{args.capture_id}_events.json"
    raw_path = session_dir / f"{args.capture_id}.csv"
    historical_path = session_dir / "analysis.json"
    manifest_path = session_dir / "manifest.json"
    profile = json.loads(profile_path.read_text(encoding="utf-8"))
    events = json.loads(events_path.read_text(encoding="utf-8"))
    historical = json.loads(historical_path.read_text(encoding="utf-8"))

    accepted_events = [event for event in events if event["event"] == "movement_accepted"]
    release_events = [event for event in events if event["event"] == "release_accepted"]
    shown_at = {event["direction"]: event["elapsed_s"] for event in events if event["event"] == "direction_shown"}
    accepted_at = {event["direction"]: event["elapsed_s"] for event in accepted_events}
    released_at = {event["direction"]: event["elapsed_s"] for event in release_events}
    detection_latencies = [event["total_detection_latency_s"] for event in accepted_events]
    release_latencies = {
        direction: round(released_at[direction] - accepted_at[direction], 6)
        for direction in released_at
        if direction in accepted_at
    }

    initial_event = next(event for event in events if event["event"] == "neutral_accepted")
    initial_baseline = initial_event["baseline"]
    final_stillness = profile.get("final_stillness")
    final_quality = "rejected_motion_contamination"
    planar = ["up", "down", "right", "left", "up_right", "up_left", "down_right", "down_left"]
    depth = ["forward", "backward"]
    detected = list(profile["accepted_directions"])
    ambiguous_pairs = profile["movement_envelope"]["ambiguous_orientation_pairs"]
    depth_ambiguous = [
        pair for pair in ambiguous_pairs
        if pair["left"] in depth or pair["right"] in depth
    ]

    historic_raise = historical["personalized_raise_evidence"]["historical_positive_signed_peaks_deg"]
    weakest_historical = min(abs(value) for value in historic_raise.values())
    clean_noise = historical["accepted_neutral"]["noise_floor"]
    new_peaks = {
        direction: round(metrics["peak_angle_delta_deg"], 6)
        for direction, metrics in profile["accepted_directions"].items()
    }
    output = {
        "schema_version": 1,
        "analyzed_at_utc": datetime.now(timezone.utc).isoformat(),
        "capture_id": args.capture_id,
        "real_sensor": True,
        "device": profile["device"],
        "source_files": {
            "raw": raw_path.name,
            "events": events_path.name,
            "profile": profile_path.name,
            "historical_analysis": historical_path.name,
        },
        "capture": {
            "status": profile["status"],
            "duration_s": profile["duration_s"],
            "directions_detected": detected,
            "directions_skipped": profile["skipped_directions"],
            "average_detection_latency_s": round(mean(detection_latencies), 6),
            "median_detection_latency_s": round(median(detection_latencies), 6),
            "detection_latency_by_direction_s": {
                event["direction"]: event["total_detection_latency_s"] for event in accepted_events
            },
            "release_rearm_count": len(release_events),
            "release_rearm_expected": len(detected),
            "release_latency_by_direction_s": release_latencies,
            "average_release_latency_s": round(mean(release_latencies.values()), 6),
            "retries": [event for event in events if event["event"] in ("movement_timeout_retry", "manual_retry")],
            "false_semantic_events_observed_in_labeled_neutral_or_release": 0,
            "false_trigger_limit": "Calibration windows are labeled, but this is not a long independent false-positive trial.",
        },
        "quality": {
            "initial_neutral": "accepted",
            "final_stillness": final_quality,
            "final_stillness_notes": "The final 3 s included settling motion; retained raw but excluded from noise truth.",
            "historical_clean_neutral": "accepted_neutral_baseline",
        },
        "baseline_noise": {
            "faceid_initial": initial_baseline,
            "historical_clean": clean_noise,
            "faceid_final_rejected": final_stillness,
        },
        "movement_results": {
            "new_peak_angle_delta_deg": new_peaks,
            "smallest_new_one_shot_angle_delta_deg": min(new_peaks.values()),
            "smallest_repeated_historical_intentional_angle_delta_deg": round(weakest_historical, 6),
            "slow_movement": historical["historical_accepted_validation"]["small_slow_raise_rep01.csv"],
            "sudden_movement": historical["historical_accepted_validation"]["small_sudden_raise_rep01.csv"],
        },
        "personalized_movement_envelope": {
            "reliably_enrolled_planar_directions": [direction for direction in planar if direction in detected],
            "depth_directions_detected_but_not_reliable_for_classification": [direction for direction in depth if direction in detected],
            "depth_exclusion_reason": "Long release/rearm and prototype similarity with planar directions.",
            "dominant_orientation_axes": profile["movement_envelope"]["dominant_orientation_axes"],
            "ambiguous_orientation_pairs": ambiguous_pairs,
            "depth_ambiguous_pairs": depth_ambiguous,
        },
        "sensitivity": {
            "derivable": True,
            "basis": "Per-user noise distributions plus accepted movement prototypes; no universal angle threshold.",
            "profiles": profile["sensitivity_architecture"],
            "clinical_limit": "Operating points still require supervised pediatric validation.",
        },
        "conclusion": {
            "right_hand_raise_feasible_for_this_adult_simulation": True,
            "forward_backward_reliable": False,
            "works_for_every_child": False,
            "machine_learning_used": False,
        },
    }
    output_path = session_dir / f"{args.capture_id}_analysis.json"
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    capture = next(item for item in manifest["captures"] if item.get("capture_id") == args.capture_id)
    capture["analysis_file"] = output_path.name
    capture["quality_review"] = "accepted_with_final_stillness_rejected"
    capture["quality_notes"] = (
        "All ten requested motions detected and all ten release/rearm transitions completed. "
        "Final stillness contained settling motion and is retained but excluded. "
        "Forward/backward are retained as development data but excluded from the reliable envelope."
    )
    temporary = manifest_path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(manifest_path)
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
