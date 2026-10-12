"""Deterministic simulated WT901BLECL motion source.

This exists so development can continue tonight without the physical sensor
(it is powered off — see tonight's instructions). It produces the exact same
``calibration_engine.MotionSample`` boundary real telemetry does, so every
consumer downstream (``semantic_detector.RightHandRaiseSession``,
``replay_gate.py``-style replay, the live validation tool, the future
``PhysicalInputManager``) can run unmodified against either a real recording
or a simulated one.

Nothing here is machine learning and nothing here tunes any detector
constant — it only generates plausible telemetry shapes (a still baseline
with small noise, an eased angular excursion, a fast burst, a slow drift)
using explicit kinematics, seeded RNG for reproducibility, and this
session's own already-recorded sensor rate (~9.93 Hz).

Two layers:

- Pure scenario builders (``build_scenario`` / ``SCENARIOS``) return a
  ``list[MotionSample]`` for a named scenario. Use these to feed
  ``RightHandRaiseSession`` or ``PersonalizedMovementDetector`` directly, the
  same way ``replay_gate.py`` feeds a real CSV's rows.
- ``SimulatedSensor`` wraps a scenario (or an explicit sample script) behind
  a connect/disconnect/stream interface shaped like a real BLE sensor
  (``is_connected``, ``connect()``, ``disconnect()``, ``stream()`` as an
  async generator, a ``force_disconnect_after`` hook for disconnect-safety
  testing). This is the shape ``input_architecture``'s ``SimulatedInputSource``
  wraps for the future ``PhysicalInputManager``.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
from dataclasses import dataclass
import math
import random
from pathlib import Path
from typing import AsyncIterator, Callable, Sequence
import zlib

try:
    from calibration_engine import MotionSample
except ImportError:  # Support module execution from the repository root.
    from tools.witmotion_ble.calibration_engine import MotionSample


SAMPLE_RATE_HZ = 9.93  # matches this session's own observed real sensor rate
DT_S = 1.0 / SAMPLE_RATE_HZ

# Simulated telemetry noise magnitudes, chosen to sit in the same order of
# magnitude as this session's own accepted neutral baseline
# (neutral_rep02.csv: angle_noise_p95_deg well under 1deg, gyro noise a
# couple dps) - not fitted to it, just plausible enough that a detector
# tuned on real data does not see obviously-fake telemetry.
REST_ANGLE_NOISE_DEG = 0.12
REST_GYRO_NOISE_DPS = 0.6
REST_ACCEL_NOISE_G = 0.01
GRAVITY_G = 1.0


def _smoothstep(t: float) -> float:
    """Ease-in/ease-out on [0, 1]; used for slow/coherent excursions."""
    t = min(max(t, 0.0), 1.0)
    return t * t * (3.0 - 2.0 * t)


def _ease_in_out_sharp(t: float) -> float:
    """A much sharper ramp than smoothstep; used for sudden excursions."""
    t = min(max(t, 0.0), 1.0)
    return math.sin(t * math.pi / 2.0) ** 0.3 if t < 1.0 else 1.0


@dataclass(frozen=True, slots=True)
class Phase:
    """One segment of a simulated timeline. See module docstring for kinds."""

    kind: str  # "rest" | "excursion" | "jitter" | "drift"
    duration_s: float
    # excursion/drift only: target angle delta (roll, pitch, yaw) in degrees,
    # applied on top of whatever pose was active at the start of this phase.
    delta_deg: tuple[float, float, float] = (0.0, 0.0, 0.0)
    # excursion only: "slow" (smoothstep) or "sudden" (sharp ramp).
    style: str = "slow"
    # jitter only: peak wobble amplitude in degrees.
    jitter_amplitude_deg: float = 0.0


def _rng_for(seed: int) -> random.Random:
    return random.Random(seed)


def _generate_timeline(phases: Sequence[Phase], seed: int) -> list[MotionSample]:
    rng = _rng_for(seed)
    samples: list[MotionSample] = []
    t = 0.0
    pose = (0.0, 0.0, 0.0)  # (roll, pitch, yaw) degrees - current settled pose
    previous_angles = pose

    def noisy_rest_sample(base_pose: tuple[float, float, float], timestamp: float) -> MotionSample:
        angles = tuple(base_pose[i] + rng.gauss(0.0, REST_ANGLE_NOISE_DEG) for i in range(3))
        gyro = tuple(rng.gauss(0.0, REST_GYRO_NOISE_DPS) for _ in range(3))
        acc = (
            rng.gauss(0.0, REST_ACCEL_NOISE_G),
            rng.gauss(0.0, REST_ACCEL_NOISE_G),
            GRAVITY_G + rng.gauss(0.0, REST_ACCEL_NOISE_G),
        )
        return MotionSample(timestamp, acc, gyro, angles)

    for phase in phases:
        sample_count = max(1, round(phase.duration_s / DT_S))

        if phase.kind == "rest":
            for _ in range(sample_count):
                samples.append(noisy_rest_sample(pose, t))
                t += DT_S
            previous_angles = pose

        elif phase.kind == "jitter":
            for _ in range(sample_count):
                wobble = tuple(
                    phase.jitter_amplitude_deg * math.sin(2 * math.pi * (3.0 + i * 0.3) * t + i)
                    for i in range(3)
                )
                base = tuple(pose[i] + wobble[i] for i in range(3))
                sample = noisy_rest_sample(base, t)
                # jitter is fast but not coherent/net-displacing - the whole
                # point of this scenario is that it must NOT satisfy either
                # OnsetEvidence path.
                samples.append(sample)
                t += DT_S
            previous_angles = pose

        elif phase.kind == "drift":
            start_pose = pose
            end_pose = tuple(pose[i] + phase.delta_deg[i] for i in range(3))
            for index in range(sample_count):
                progress = _smoothstep(index / max(1, sample_count - 1))
                current = tuple(start_pose[i] + (end_pose[i] - start_pose[i]) * progress for i in range(3))
                samples.append(noisy_rest_sample(current, t))
                t += DT_S
            pose = end_pose
            previous_angles = pose

        elif phase.kind == "excursion":
            start_pose = pose
            peak_pose = tuple(pose[i] + phase.delta_deg[i] for i in range(3))
            ease = _smoothstep if phase.style == "slow" else _ease_in_out_sharp
            for index in range(sample_count):
                progress = ease(index / max(1, sample_count - 1))
                current = tuple(start_pose[i] + (peak_pose[i] - start_pose[i]) * progress for i in range(3))
                angles = tuple(current[i] + rng.gauss(0.0, REST_ANGLE_NOISE_DEG) for i in range(3))
                gyro = tuple(
                    (current[i] - previous_angles[i]) / DT_S + rng.gauss(0.0, REST_GYRO_NOISE_DPS)
                    for i in range(3)
                )
                accel_kick = min(1.0, vector_magnitude(gyro) / 60.0)
                acc = (
                    rng.gauss(0.0, REST_ACCEL_NOISE_G) + 0.15 * accel_kick,
                    rng.gauss(0.0, REST_ACCEL_NOISE_G) + 0.1 * accel_kick,
                    GRAVITY_G + rng.gauss(0.0, REST_ACCEL_NOISE_G) - 0.1 * accel_kick,
                )
                samples.append(MotionSample(t, acc, gyro, angles))
                previous_angles = current
                t += DT_S
            pose = peak_pose

        else:
            raise ValueError(f"unknown phase kind: {phase.kind}")

    return samples


def vector_magnitude(values: Sequence[float]) -> float:
    return math.sqrt(sum(value * value for value in values))


# ---------------------------------------------------------------------------
# Named scenarios. Angle deltas are on pitch (index 1), matching this
# session's own personalized_raise_evidence dominant axis - see
# analysis.json - purely so simulated data looks like this user's real
# raises; a different user's simulated timeline would use their own axis.
# ---------------------------------------------------------------------------

def _raise_cycle(delta_deg: float, rise_s: float, hold_s: float, fall_s: float, rest_s: float, style: str) -> list[Phase]:
    return [
        Phase("excursion", rise_s, delta_deg=(0.0, -delta_deg, 0.0), style=style),
        Phase("rest", hold_s),
        Phase("excursion", fall_s, delta_deg=(0.0, delta_deg, 0.0), style=style),
        Phase("rest", rest_s),
    ]


def _repeated(cycle: Sequence[Phase], repetitions: int) -> list[Phase]:
    phases: list[Phase] = [Phase("rest", 3.0)]
    for _ in range(repetitions):
        phases.extend(cycle)
    return phases


SCENARIO_BUILDERS: dict[str, Callable[[], list[Phase]]] = {
    "neutral": lambda: [Phase("rest", 10.0)],
    "very_small_raise": lambda: _repeated(_raise_cycle(2.0, 1.0, 0.5, 1.0, 2.0, "slow"), 5),
    "small_slow_raise": lambda: _repeated(_raise_cycle(8.0, 4.0, 1.0, 4.0, 3.0, "slow"), 5),
    "small_sudden_raise": lambda: _repeated(_raise_cycle(8.0, 0.6, 1.0, 0.8, 3.0, "sudden"), 5),
    "medium_raise": lambda: _repeated(_raise_cycle(25.0, 2.0, 1.0, 2.0, 3.0, "slow"), 5),
    "large_raise": lambda: _repeated(_raise_cycle(55.0, 2.0, 1.0, 2.0, 3.0, "sudden"), 5),
    "hold": lambda: [
        Phase("rest", 2.0),
        Phase("excursion", 1.0, delta_deg=(0.0, -20.0, 0.0), style="sudden"),
        Phase("rest", 6.0),  # long hold at the raised pose - must not re-trigger
        Phase("excursion", 1.0, delta_deg=(0.0, 20.0, 0.0), style="slow"),
        Phase("rest", 3.0),
    ],
    "release": lambda: [
        Phase("rest", 2.0),
        Phase("excursion", 1.0, delta_deg=(0.0, -20.0, 0.0), style="sudden"),
        Phase("rest", 1.0),
        Phase("excursion", 1.5, delta_deg=(0.0, 20.0, 0.0), style="slow"),
        Phase("rest", 5.0),  # settled release window a live release detector should confirm
    ],
    "jitter": lambda: [
        Phase("rest", 2.0),
        Phase("jitter", 3.0, jitter_amplitude_deg=0.8),
        Phase("rest", 2.0),
    ],
    "baseline_drift": lambda: [
        Phase("rest", 3.0),
        Phase("drift", 20.0, delta_deg=(0.0, 4.0, 1.5, )[:3]),
        Phase("rest", 5.0),
    ],
    "changed_rest_position": lambda: [
        Phase("rest", 3.0),
        Phase("excursion", 1.0, delta_deg=(0.0, -18.0, 0.0), style="sudden"),
        Phase("rest", 1.0),
        # returns to a NEW rest pose, 6deg away from the original - "release
        # may move" per semantic_detector.py's SettledStateTest design.
        Phase("excursion", 1.5, delta_deg=(0.0, 12.0, 0.0), style="slow"),
        Phase("rest", 6.0),
        Phase("excursion", 0.8, delta_deg=(0.0, -20.0, 0.0), style="sudden"),
        Phase("rest", 1.0),
        Phase("excursion", 1.5, delta_deg=(0.0, 20.0, 0.0), style="slow"),
        Phase("rest", 4.0),
    ],
}

SCENARIO_EXPECTED_RAISES: dict[str, int] = {
    "neutral": 0,
    "very_small_raise": 5,
    "small_slow_raise": 5,
    "small_sudden_raise": 5,
    "medium_raise": 5,
    "large_raise": 5,
    "hold": 1,
    "release": 1,
    "jitter": 0,
    "baseline_drift": 0,
    "changed_rest_position": 2,
}


def _stable_name_hash(name: str) -> int:
    """A per-process-independent hash, unlike the builtin ``hash()`` (which
    PYTHONHASHSEED randomizes per process for strings) - required so the
    same scenario name always seeds the same telemetry across separate runs,
    not just within one process.
    """
    return zlib.crc32(name.encode("utf-8"))


def build_scenario(name: str, seed: int = 20260902) -> list[MotionSample]:
    if name not in SCENARIO_BUILDERS:
        raise KeyError(f"unknown scenario {name!r}; available: {sorted(SCENARIO_BUILDERS)}")
    phases = SCENARIO_BUILDERS[name]()
    return _generate_timeline(phases, seed=(seed ^ _stable_name_hash(name)) & 0xFFFFFFFF)


# ---------------------------------------------------------------------------
# SimulatedSensor: connect/disconnect/stream shape for higher-level tests
# (disconnect safety, PhysicalInputManager's SimulatedInputSource port).
# ---------------------------------------------------------------------------

class SimulatedSensor:
    """A fake sensor exposing the same connect/stream/disconnect shape a
    real BLE ``InputSource`` adapter needs, so disconnect-safety and manager
    tests can run without any real hardware, tonight or any other night.
    """

    def __init__(self, scenario: str, seed: int = 20260902, sample_interval_s: float = DT_S) -> None:
        self.scenario = scenario
        self.samples = build_scenario(scenario, seed=seed)
        self.sample_interval_s = sample_interval_s
        self.connected = False
        self._disconnect_after_index: int | None = None

    def force_disconnect_after(self, sample_index: int) -> None:
        """Test hook: simulate a mid-stream BLE drop after N samples."""
        self._disconnect_after_index = sample_index

    async def connect(self) -> None:
        await asyncio.sleep(0)
        self.connected = True

    async def disconnect(self) -> None:
        await asyncio.sleep(0)
        self.connected = False

    async def stream(self) -> AsyncIterator[MotionSample]:
        if not self.connected:
            raise RuntimeError("stream() called while not connected")
        for index, sample in enumerate(self.samples):
            if not self.connected:
                return
            if self._disconnect_after_index is not None and index >= self._disconnect_after_index:
                self.connected = False
                return
            yield sample
            await asyncio.sleep(0)  # cooperative yield, no real-time wait needed for tests


# ---------------------------------------------------------------------------
# CLI: dump a scenario to a replay_gate.py-compatible CSV, so it can be
# replayed through the exact same detector code real recordings use.
# ---------------------------------------------------------------------------

REPLAY_COMPATIBLE_FIELDS = (
    "elapsed_s", "phase", "requested_direction",
    "acc_x_g", "acc_y_g", "acc_z_g",
    "gyro_x_dps", "gyro_y_dps", "gyro_z_dps",
    "roll_deg", "pitch_deg", "yaw_deg",
)


def write_scenario_csv(name: str, output_path: Path, seed: int = 20260902) -> int:
    samples = build_scenario(name, seed=seed)
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=REPLAY_COMPATIBLE_FIELDS)
        writer.writeheader()
        for sample in samples:
            roll, pitch, yaw = sample.angles_deg
            gx, gy, gz = sample.gyroscope_dps
            ax, ay, az = sample.acceleration_g
            writer.writerow(
                {
                    "elapsed_s": f"{sample.timestamp:.6f}",
                    "phase": name,
                    "requested_direction": "",
                    "acc_x_g": f"{ax:.8f}", "acc_y_g": f"{ay:.8f}", "acc_z_g": f"{az:.8f}",
                    "gyro_x_dps": f"{gx:.8f}", "gyro_y_dps": f"{gy:.8f}", "gyro_z_dps": f"{gz:.8f}",
                    "roll_deg": f"{roll:.8f}", "pitch_deg": f"{pitch:.8f}", "yaw_deg": f"{yaw:.8f}",
                }
            )
    return len(samples)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scenario", choices=sorted(SCENARIO_BUILDERS) + ["all"])
    parser.add_argument("--out-dir", type=Path, default=Path(__file__).parent / "simulated_data")
    parser.add_argument("--seed", type=int, default=20260902)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)
    names = list(SCENARIO_BUILDERS) if args.scenario == "all" else [args.scenario]
    for name in names:
        output_path = args.out_dir / f"{name}.csv"
        count = write_scenario_csv(name, output_path, seed=args.seed)
        print(f"wrote {count} samples -> {output_path}")


if __name__ == "__main__":
    main()
