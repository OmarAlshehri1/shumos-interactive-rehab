"""Deterministic personalized calibration primitives for WT901BLECL telemetry.

This module intentionally contains no machine-learning model.  Thresholds are
derived from a user's neutral capture and the sensor's documented packet
resolution, then enrolled movements are retained as that user's prototypes.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
import math
from statistics import median
from typing import Iterable, Sequence


ANGLE_RESOLUTION_DEG = 180.0 / 32768.0
GYRO_RESOLUTION_DPS = 2000.0 / 32768.0
ACC_RESOLUTION_G = 16.0 / 32768.0


def vector_norm(values: Sequence[float]) -> float:
    return math.sqrt(sum(value * value for value in values))


def percentile(values: Sequence[float], proportion: float) -> float:
    if not values:
        raise ValueError("percentile requires at least one value")
    ordered = sorted(values)
    position = (len(ordered) - 1) * proportion
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    fraction = position - lower
    return ordered[lower] * (1.0 - fraction) + ordered[upper] * fraction


def wrapped_angle_delta(value: float, reference: float) -> float:
    """Return the shortest signed Euler-angle difference in degrees."""
    return (value - reference + 180.0) % 360.0 - 180.0


@dataclass(frozen=True, slots=True)
class MotionSample:
    timestamp: float
    acceleration_g: tuple[float, float, float]
    gyroscope_dps: tuple[float, float, float]
    angles_deg: tuple[float, float, float]


@dataclass(frozen=True, slots=True)
class BaselineProfile:
    acceleration_g: tuple[float, float, float]
    gyroscope_dps: tuple[float, float, float]
    angles_deg: tuple[float, float, float]
    angle_noise_p95_deg: float
    gyro_noise_p95_dps: float
    acceleration_noise_p95_g: float
    sample_count: int

    @classmethod
    def from_samples(cls, samples: Sequence[MotionSample]) -> "BaselineProfile":
        if len(samples) < 10:
            raise ValueError("neutral baseline requires at least 10 samples")
        acceleration = tuple(median(sample.acceleration_g[i] for sample in samples) for i in range(3))
        gyroscope = tuple(median(sample.gyroscope_dps[i] for sample in samples) for i in range(3))
        angles = tuple(median(sample.angles_deg[i] for sample in samples) for i in range(3))
        angle_deviations = [
            vector_norm(tuple(wrapped_angle_delta(sample.angles_deg[i], angles[i]) for i in range(3)))
            for sample in samples
        ]
        gyro_deviations = [
            vector_norm(tuple(sample.gyroscope_dps[i] - gyroscope[i] for i in range(3)))
            for sample in samples
        ]
        acceleration_deviations = [
            vector_norm(tuple(sample.acceleration_g[i] - acceleration[i] for i in range(3)))
            for sample in samples
        ]
        return cls(
            acceleration_g=acceleration,
            gyroscope_dps=gyroscope,
            angles_deg=angles,
            angle_noise_p95_deg=max(percentile(angle_deviations, 0.95), ANGLE_RESOLUTION_DEG * 2.0),
            gyro_noise_p95_dps=max(percentile(gyro_deviations, 0.95), GYRO_RESOLUTION_DPS * 2.0),
            acceleration_noise_p95_g=max(percentile(acceleration_deviations, 0.95), ACC_RESOLUTION_G * 2.0),
            sample_count=len(samples),
        )

    def deltas(self, sample: MotionSample) -> tuple[tuple[float, float, float], tuple[float, float, float], tuple[float, float, float]]:
        angle = tuple(wrapped_angle_delta(sample.angles_deg[i], self.angles_deg[i]) for i in range(3))
        gyro = tuple(sample.gyroscope_dps[i] - self.gyroscope_dps[i] for i in range(3))
        acceleration = tuple(sample.acceleration_g[i] - self.acceleration_g[i] for i in range(3))
        return angle, gyro, acceleration


@dataclass(frozen=True, slots=True)
class MovementResult:
    accepted_at: float
    detection_latency_s: float
    duration_s: float
    peak_angle_delta_deg: float
    peak_gyro_dps: float
    peak_acceleration_delta_g: float
    angle_vector_deg: tuple[float, float, float]
    acceleration_vector_g: tuple[float, float, float]
    angular_path_deg: float
    direction_coherence: float
    detection_path: str


class PersonalizedMovementDetector:
    """Detect one intentional excursion relative to a captured neutral profile."""

    def __init__(self, baseline: BaselineProfile, shown_at: float) -> None:
        self.baseline = baseline
        self.shown_at = shown_at
        self.candidate_started_at: float | None = None
        self.previous_angle: tuple[float, float, float] | None = None
        self.angular_path = 0.0
        self.peak_angle = 0.0
        self.peak_gyro = 0.0
        self.peak_acceleration = 0.0
        self.peak_angle_vector = (0.0, 0.0, 0.0)
        self.peak_acceleration_vector = (0.0, 0.0, 0.0)
        self._onset_samples = 0
        self._recent: deque[tuple[float, float, float]] = deque(maxlen=5)

    @property
    def angle_onset(self) -> float:
        return self.baseline.angle_noise_p95_deg * 3.0

    @property
    def gyro_onset(self) -> float:
        return self.baseline.gyro_noise_p95_dps * 3.5

    @property
    def acceleration_onset(self) -> float:
        return self.baseline.acceleration_noise_p95_g * 3.0

    def observe(self, sample: MotionSample) -> MovementResult | None:
        angle_vector, gyro_vector, acceleration_vector = self.baseline.deltas(sample)
        angle = vector_norm(angle_vector)
        gyro = vector_norm(gyro_vector)
        acceleration = vector_norm(acceleration_vector)
        onset = angle >= self.angle_onset or (
            gyro >= self.gyro_onset and acceleration >= self.acceleration_onset
        )

        if self.candidate_started_at is None:
            self._onset_samples = self._onset_samples + 1 if onset else 0
            if self._onset_samples < 2:
                return None
            self.candidate_started_at = sample.timestamp
            self.previous_angle = angle_vector

        if self.previous_angle is not None:
            step = tuple(angle_vector[i] - self.previous_angle[i] for i in range(3))
            self.angular_path += vector_norm(step)
        self.previous_angle = angle_vector
        if angle > self.peak_angle:
            self.peak_angle = angle
            self.peak_angle_vector = angle_vector
        if acceleration > self.peak_acceleration:
            self.peak_acceleration = acceleration
            self.peak_acceleration_vector = acceleration_vector
        self.peak_gyro = max(self.peak_gyro, gyro)
        self._recent.append((angle, gyro, acceleration))

        duration = sample.timestamp - self.candidate_started_at
        if duration < 0.25 or len(self._recent) < 4:
            return None

        coherence = self.peak_angle / max(self.angular_path, self.peak_angle, ANGLE_RESOLUTION_DEG)
        stable_away = (
            all(value[1] <= self.baseline.gyro_noise_p95_dps * 2.25 for value in list(self._recent)[-3:])
            and median(value[0] for value in list(self._recent)[-3:]) >= self.angle_onset
        )
        displacement_valid = self.peak_angle >= self.baseline.angle_noise_p95_deg * 4.0
        sudden_valid = (
            self.peak_angle >= self.baseline.angle_noise_p95_deg * 2.75
            and self.peak_gyro >= self.baseline.gyro_noise_p95_dps * 5.0
            and self.peak_acceleration >= self.baseline.acceleration_noise_p95_g * 3.0
            and coherence >= 0.45
        )
        if not ((stable_away and displacement_valid) or sudden_valid):
            return None
        path = "stable_displacement" if stable_away and displacement_valid else "sudden_coherent"
        return MovementResult(
            accepted_at=sample.timestamp,
            detection_latency_s=sample.timestamp - self.shown_at,
            duration_s=duration,
            peak_angle_delta_deg=self.peak_angle,
            peak_gyro_dps=self.peak_gyro,
            peak_acceleration_delta_g=self.peak_acceleration,
            angle_vector_deg=self.peak_angle_vector,
            acceleration_vector_g=self.peak_acceleration_vector,
            angular_path_deg=self.angular_path,
            direction_coherence=coherence,
            detection_path=path,
        )


class ReleaseDetector:
    """Apply hysteresis on the enrolled movement axis, not an exact 3-D pose.

    A person's comfortable rest pose can drift after a movement.  Release is
    therefore a return along the enrolled direction followed by local natural
    stillness.  Orthogonal pose changes do not force an exact-point match.
    """

    def __init__(self, baseline: BaselineProfile, movement: MovementResult) -> None:
        self.baseline = baseline
        self.movement = movement
        self.direction = normalized(movement.angle_vector_deg)
        self._recent: deque[tuple[MotionSample, float, float]] = deque(maxlen=12)

    @property
    def release_angle(self) -> float:
        return max(
            self.baseline.angle_noise_p95_deg * 2.25,
            self.movement.peak_angle_delta_deg * 0.35,
        )

    def observe(self, sample: MotionSample) -> bool:
        angle_vector, gyro_vector, acceleration_vector = self.baseline.deltas(sample)
        projection = sum(value * axis for value, axis in zip(angle_vector, self.direction))
        self._recent.append((sample, projection, vector_norm(gyro_vector)))
        if len(self._recent) < self._recent.maxlen:
            return False
        recent = list(self._recent)
        projections = [item[1] for item in recent]
        gyro_magnitudes = [item[2] for item in recent]
        angle_centers = tuple(median(item[0].angles_deg[i] for item in recent) for i in range(3))
        acceleration_centers = tuple(median(item[0].acceleration_g[i] for item in recent) for i in range(3))
        local_angle_radius = max(
            vector_norm(tuple(wrapped_angle_delta(item[0].angles_deg[i], angle_centers[i]) for i in range(3)))
            for item in recent
        )
        local_acceleration_radius = max(
            vector_norm(tuple(item[0].acceleration_g[i] - acceleration_centers[i] for i in range(3)))
            for item in recent
        )
        return (
            max(abs(value) for value in projections) <= self.release_angle
            and median(gyro_magnitudes) <= self.baseline.gyro_noise_p95_dps * 2.5
            and local_angle_radius <= self.baseline.angle_noise_p95_deg * 2.0
            and local_acceleration_radius <= self.baseline.acceleration_noise_p95_g * 2.5
        )

    @property
    def rest_samples(self) -> list[MotionSample]:
        return [item[0] for item in self._recent]


def normalized(values: Sequence[float]) -> tuple[float, ...]:
    magnitude = vector_norm(values)
    if magnitude == 0:
        return tuple(0.0 for _ in values)
    return tuple(value / magnitude for value in values)


def cosine_similarity(left: Sequence[float], right: Sequence[float]) -> float:
    return sum(a * b for a, b in zip(normalized(left), normalized(right)))


def dominant_axes(results: Iterable[MovementResult]) -> list[str]:
    totals = [0.0, 0.0, 0.0]
    for result in results:
        for index, value in enumerate(result.angle_vector_deg):
            totals[index] += abs(value)
    names = ("roll", "pitch", "yaw")
    return [names[index] for index in sorted(range(3), key=lambda i: totals[i], reverse=True)]
