#!/usr/bin/env python3
"""Produce a reproducible per-user summary from the isolated BLE captures."""

from __future__ import annotations

import argparse
import csv
from collections import defaultdict
import json
import math
from pathlib import Path
import statistics
from typing import Any, Iterable


ACC_KEYS = ("acc_x_g", "acc_y_g", "acc_z_g")
GYRO_KEYS = ("gyro_x_dps", "gyro_y_dps", "gyro_z_dps")
ANGLE_KEYS = ("roll_deg", "pitch_deg", "yaw_deg")
NUMERIC_KEYS = ACC_KEYS + GYRO_KEYS + ANGLE_KEYS
VERTICAL_PHASES = ("up_down", "very_small", "slow", "fast")
NEGATIVE_PHASES = ("neutral_start", "neutral_end", "jitter")


def quantile(values: Iterable[float], probability: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    position = (len(ordered) - 1) * probability
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    weight = position - lower
    return ordered[lower] * (1.0 - weight) + ordered[upper] * weight


def angle_delta(value: float, center: float) -> float:
    return (value - center + 180.0) % 360.0 - 180.0


def vector_norm(values: Iterable[float]) -> float:
    return math.sqrt(sum(value * value for value in values))


def load_rows(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(newline="", encoding="utf-8") as handle:
        for raw in csv.DictReader(handle):
            row: dict[str, Any] = dict(raw)
            row["elapsed_s"] = float(raw["elapsed_s"])
            for key in NUMERIC_KEYS:
                row[key] = float(raw[key])
            rows.append(row)
    return rows


def center(rows: list[dict[str, Any]], keys: tuple[str, ...]) -> dict[str, float]:
    return {key: statistics.median(row[key] for row in rows) for key in keys}


def signed_peak(values: list[float]) -> float:
    return max(values, key=abs) if values else 0.0


def summarize_rows(
    rows: list[dict[str, Any]], reference: dict[str, float] | None = None
) -> dict[str, Any]:
    if not rows:
        return {"samples": 0}
    summary: dict[str, Any] = {
        "samples": len(rows),
        "duration_s": round(rows[-1]["elapsed_s"] - rows[0]["elapsed_s"], 4),
        "observed_rate_hz": round(
            (len(rows) - 1) / (rows[-1]["elapsed_s"] - rows[0]["elapsed_s"]), 4
        ) if len(rows) > 1 and rows[-1]["elapsed_s"] > rows[0]["elapsed_s"] else 0.0,
        "ranges": {},
    }
    for key in NUMERIC_KEYS:
        values = [row[key] for row in rows]
        summary["ranges"][key] = {
            "median": round(statistics.median(values), 6),
            "min": round(min(values), 6),
            "max": round(max(values), 6),
            "range": round(max(values) - min(values), 6),
        }
    gyro_magnitudes = [vector_norm(row[key] for key in GYRO_KEYS) for row in rows]
    summary["gyro_magnitude_dps"] = {
        "p50": round(quantile(gyro_magnitudes, 0.50), 6),
        "p95": round(quantile(gyro_magnitudes, 0.95), 6),
        "max": round(max(gyro_magnitudes), 6),
    }
    if reference:
        deltas: dict[str, list[float]] = {}
        for key in ACC_KEYS + GYRO_KEYS:
            deltas[key] = [row[key] - reference[key] for row in rows]
        for key in ANGLE_KEYS:
            deltas[key] = [angle_delta(row[key], reference[key]) for row in rows]
        summary["reference_delta"] = {
            key: {
                "p95_abs": round(quantile((abs(value) for value in values), 0.95), 6),
                "signed_peak": round(signed_peak(values), 6),
                "max_abs": round(max(abs(value) for value in values), 6),
            }
            for key, values in deltas.items()
        }
    return summary


def local_phase_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    anchor_rows = rows[: max(1, min(5, len(rows)))]
    anchor = center(anchor_rows, NUMERIC_KEYS)
    return summarize_rows(rows, anchor)


def stable_start_reference(rows: list[dict[str, Any]], window_size: int = 20) -> dict[str, float]:
    """Find the quietest ~2 s reference window in the first 15 seconds."""
    candidates = [row for row in rows if row["elapsed_s"] <= 15.0]
    if len(candidates) < window_size:
        candidates = rows
    best_window = candidates[:window_size]
    best_score = math.inf
    for index in range(0, len(candidates) - window_size + 1):
        window = candidates[index : index + window_size]
        gyro_score = statistics.mean(
            vector_norm(row[key] for key in GYRO_KEYS) for row in window
        )
        angle_range_score = sum(
            max(row[key] for row in window) - min(row[key] for row in window)
            for key in ANGLE_KEYS
        )
        score = gyro_score + angle_range_score
        if score < best_score:
            best_score = score
            best_window = window
    return center(best_window, NUMERIC_KEYS)


def analyze(session_dir: Path) -> dict[str, Any]:
    manifest = json.loads((session_dir / "manifest.json").read_text(encoding="utf-8"))
    capture_meta = {item["file"]: item for item in manifest["captures"]}
    inventory: list[dict[str, Any]] = []
    loaded: dict[str, list[dict[str, Any]]] = {}

    for path in sorted(session_dir.glob("*.csv")):
        rows = load_rows(path)
        loaded[path.name] = rows
        meta = capture_meta.get(path.name, {})
        inventory.append(
            {
                "file": path.name,
                "label": meta.get("label", rows[0].get("label") if rows else None),
                "samples": len(rows),
                "status": meta.get("status", "unknown"),
                "quality_review": meta.get("quality_review", "not_reviewed"),
                "role": (
                    "validation_only"
                    if str(meta.get("quality_review", "")).startswith("rejected")
                    else "profile_and_validation"
                ),
            }
        )

    neutral_rows = loaded["neutral_rep02.csv"]
    neutral_center = center(neutral_rows, NUMERIC_KEYS)
    neutral_summary = summarize_rows(neutral_rows, neutral_center)
    neutral_angle_norms = [
        vector_norm(angle_delta(row[key], neutral_center[key]) for key in ANGLE_KEYS)
        for row in neutral_rows
    ]
    neutral_acc_norms = [
        vector_norm(row[key] - neutral_center[key] for key in ACC_KEYS)
        for row in neutral_rows
    ]
    neutral_gyro_norms = [vector_norm(row[key] for key in GYRO_KEYS) for row in neutral_rows]

    guided_rows = loaded["guided_quick_scan_rep03.csv"]
    by_phase: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in guided_rows:
        by_phase[row["phase"]].append(row)
    phase_summaries = {
        phase: local_phase_summary(by_phase.get(phase, []))
        for phase, _, _ in (
            ("neutral_start", 0, ""),
            ("up_down", 0, ""),
            ("left_right", 0, ""),
            ("front_back", 0, ""),
            ("very_small", 0, ""),
            ("slow", 0, ""),
            ("fast", 0, ""),
            ("hold", 0, ""),
            ("jitter", 0, ""),
            ("neutral_end", 0, ""),
        )
    }

    historical: dict[str, Any] = {}
    for filename in (
        "very_small_raise_rep01.csv",
        "small_slow_raise_rep01.csv",
        "small_sudden_raise_rep01.csv",
        "medium_raise_rep01.csv",
        "normal_full_raise_rep01.csv",
    ):
        reference = stable_start_reference(loaded[filename])
        historical[filename] = summarize_rows(loaded[filename], reference)
        historical[filename]["stable_start_center"] = {
            key: round(value, 6) for key, value in reference.items()
        }

    axis_strength: dict[str, float] = {key: 0.0 for key in ANGLE_KEYS}
    acc_axis_strength: dict[str, float] = {key: 0.0 for key in ACC_KEYS}
    for summary in historical.values():
        for key in ANGLE_KEYS:
            axis_strength[key] += summary["reference_delta"][key]["max_abs"]
        for key in ACC_KEYS:
            acc_axis_strength[key] += summary["reference_delta"][key]["max_abs"]
    dominant_angle_axis = max(axis_strength, key=axis_strength.get)  # type: ignore[arg-type]
    dominant_acc_axis = max(acc_axis_strength, key=acc_axis_strength.get)  # type: ignore[arg-type]
    historical_positive_peaks = {
        filename: summary["reference_delta"][dominant_angle_axis]["signed_peak"]
        for filename, summary in historical.items()
    }
    sign_vote = sum(1.0 if value >= 0 else -1.0 for value in historical_positive_peaks.values())
    raise_sign = 1 if sign_vote >= 0 else -1
    positive_amplitudes = [abs(value) for value in historical_positive_peaks.values()]

    jitter_angle = phase_summaries["jitter"]["reference_delta"][dominant_angle_axis]
    baseline_axis_noise = neutral_summary["reference_delta"][dominant_angle_axis]
    negative_envelope = max(jitter_angle["max_abs"], baseline_axis_noise["p95_abs"])
    weakest_positive = min(positive_amplitudes)
    guided_vertical_peaks = {
        phase: phase_summaries[phase]["reference_delta"][dominant_angle_axis]["signed_peak"]
        for phase in VERTICAL_PHASES
    }

    return {
        "session_id": manifest["session_id"],
        "dataset_inventory": inventory,
        "accepted_neutral": {
            "file": "neutral_rep02.csv",
            "center": {key: round(value, 6) for key, value in neutral_center.items()},
            "noise_floor": {
                "gyro_magnitude_p95_dps": round(quantile(neutral_gyro_norms, 0.95), 6),
                "gyro_magnitude_max_dps": round(max(neutral_gyro_norms), 6),
                "acc_vector_deviation_p95_g": round(quantile(neutral_acc_norms, 0.95), 6),
                "angle_vector_deviation_p95_deg": round(quantile(neutral_angle_norms, 0.95), 6),
            },
            "summary": neutral_summary,
        },
        "guided_scan": {
            "file": "guided_quick_scan_rep03.csv",
            "samples": len(guided_rows),
            "duration_s": round(guided_rows[-1]["elapsed_s"] - guided_rows[0]["elapsed_s"], 6),
            "phases": phase_summaries,
        },
        "personalized_raise_evidence": {
            "dominant_angle_axis": dominant_angle_axis,
            "raise_direction_sign": raise_sign,
            "dominant_acceleration_axis": dominant_acc_axis,
            "historical_positive_signed_peaks_deg": historical_positive_peaks,
            "guided_vertical_phase_signed_peaks_deg": guided_vertical_peaks,
            "guided_up_down_prompt_motion_detected": (
                phase_summaries["up_down"]["gyro_magnitude_dps"]["p95"]
                > neutral_summary["gyro_magnitude_dps"]["p95"]
                or abs(guided_vertical_peaks["up_down"]) > negative_envelope
            ),
            "weakest_demonstrated_intentional_amplitude_deg": round(weakest_positive, 6),
            "median_demonstrated_intentional_amplitude_deg": round(statistics.median(positive_amplitudes), 6),
            "largest_demonstrated_intentional_amplitude_deg": round(max(positive_amplitudes), 6),
            "negative_local_envelope_deg": round(negative_envelope, 6),
            "weakest_positive_to_negative_ratio": round(
                weakest_positive / negative_envelope if negative_envelope else math.inf, 6
            ),
            "separable_in_this_scan": weakest_positive > negative_envelope,
            "note": "Evidence only; detector thresholds must be selected from labeled positive/negative distributions and validated per user.",
        },
        "historical_accepted_validation": historical,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("session_dir", type=Path)
    args = parser.parse_args()
    result = analyze(args.session_dir)
    output_path = args.session_dir / "analysis.json"
    output_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    evidence = result["personalized_raise_evidence"]
    noise = result["accepted_neutral"]["noise_floor"]
    print(f"analysis={output_path}")
    print(f"files={len(result['dataset_inventory'])}")
    print(f"neutral_gyro_p95_dps={noise['gyro_magnitude_p95_dps']}")
    print(f"neutral_angle_vector_p95_deg={noise['angle_vector_deviation_p95_deg']}")
    print(f"dominant_angle_axis={evidence['dominant_angle_axis']}")
    print(f"raise_direction_sign={evidence['raise_direction_sign']}")
    print(f"dominant_acceleration_axis={evidence['dominant_acceleration_axis']}")
    print(f"weakest_intentional_deg={evidence['weakest_demonstrated_intentional_amplitude_deg']}")
    print(f"negative_envelope_deg={evidence['negative_local_envelope_deg']}")
    print(f"separation_ratio={evidence['weakest_positive_to_negative_ratio']}")
    print(f"separable={evidence['separable_in_this_scan']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
