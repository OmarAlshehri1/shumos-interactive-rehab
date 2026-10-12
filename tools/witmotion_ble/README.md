# WT901BLECL5.0 macOS hardware test

This directory is an isolated command-line hardware prototype. It does not import
or modify any Shumos game, Firebase, audio, or production code.

It follows WITMOTION's official BLE 5.0 SDK protocol:

- GATT service: `0000ffe5-0000-1000-8000-00805f9a34fb`
- notification characteristic: `0000ffe4-0000-1000-8000-00805f9a34fb`
- write characteristic: `0000ffe9-0000-1000-8000-00805f9a34fb`
- real-time frame: 20 bytes beginning `55 61`
- acceleration: signed int16, `raw / 32768 * 16` g
- gyroscope: signed int16, `raw / 32768 * 2000` degrees/second
- roll/pitch/yaw: signed int16, `raw / 32768 * 180` degrees

Official reference: https://github.com/WITMOTION/WitBluetooth_BWT901BLE5_0

## Setup

```sh
./tools/witmotion_ble/setup.sh
```

macOS may ask for Bluetooth permission. Allow the terminal application being
used. If previously denied, enable it in System Settings > Privacy & Security >
Bluetooth.

## Real-hardware run

Before running this command, fully quit the WITMOTION app so it releases its BLE
connection. Turn the sensor on and move/rotate it during the test:

```sh
tools/witmotion_ble/.venv/bin/python \
  tools/witmotion_ble/wt901ble_test.py \
  --duration 30 \
  --reconnect-test-after 10
```

The tool discovers by the `WT901BLE` advertised-name prefix or official FFE5
service UUID. It does not embed a particular sensor's identifier. Use `--device`
with a name fragment or the macOS CoreBluetooth UUID only when selecting among
multiple sensors.

The reconnect test intentionally disconnects once after receiving telemetry,
then rescans and reconnects. The process exits successfully only if it received
real `0x61` packets and detected physical motion (more than 0.10 g axis change
or more than 5 degrees/second on a gyro axis), rather than sensor noise or slow
orientation-filter settling.

## Arabic visual calibration prototype

Fully quit the official WITMOTION app, then run:

```sh
tools/witmotion_ble/.venv/bin/python \
  tools/witmotion_ble/faceid_calibration.py \
  --session right_hand_adult_sim_20260902_01
```

The native macOS window waits for real movement; a timer never marks a
direction successful. It captures one comfortable movement per direction,
offers retry and skip, waits for a natural return along the enrolled movement
axis, and records raw telemetry plus event/profile metadata under
`calibration_data/`. Every capture uses a timestamp and random suffix and is
opened with exclusive-create semantics, so previous real data is never
overwritten.

The calibration engine is deterministic, not machine learning. It derives its
neutral/noise envelope from the current user, supports slow displacement and
short coherent motion paths, and applies release hysteresis before rearming.
Forward/backward remain optional because a wrist IMU may not reliably separate
translation depth from rotation.

Run the isolated parser and calibration-engine tests with:

```sh
tools/witmotion_ble/.venv/bin/python -m unittest -v \
  tools/witmotion_ble/test_protocol.py \
  tools/witmotion_ble/test_calibration_engine.py
```

## RIGHT_HAND_RAISE semantic event + offline replay gate

`semantic_detector.py` adds a continuous, streaming `RightHandRaiseSession`
on top of the calibration engine's per-attempt primitives, so a real game
session (no prompts, no fixed duration) can be watched for one semantic
event: RIGHT_HAND_RAISE. It runs an explicit
`ARMED -> CANDIDATE_UP -> TRIGGERED -> RETURNING -> NEUTRAL_CONFIRMED -> ARMED`
state machine: baseline pose is frozen for the whole CANDIDATE/TRIGGERED/
RETURNING span (a session must not rearm merely because time passed, gyro
went quiet, or the baseline happened to drift) and only advances once
`NeutralRegionTest` confirms an actual, sustained return toward the
personalized neutral region - proximity to the ARMED baseline on the raise
axis specifically (looser on the other two axes, which need not retrace the
exact departure path) plus low angular velocity, tolerances derived from
this user's own noise floor and the movement's own observed size, not fixed
constants. A movement is only RIGHT_HAND_RAISE when it aligns with this
user's own personalized raise axis/sign from `analysis.json`'s
`personalized_raise_evidence` - not a hardcoded axis. A generous backstop
timer exists only as a pathological safety net (logged distinctly in the
trace) so a disconnected sensor can never lock the detector up forever; it
is not the mechanism recovery normally relies on.

`replay_gate.py` replays every accepted real RIGHT_HAND recording in
`calibration_data/right_hand_adult_sim_20260902_01/` through that detector
and checks it against the ten acceptance criteria required before any game
may be wired to real hardware (rejected/cancelled recordings are replayed
for transparency only and excluded from both the pass/fail result and the
baseline/enrollment inputs). Run it directly for the full printed report:

```sh
tools/witmotion_ble/.venv/bin/python tools/witmotion_ble/replay_gate.py
```

or as a test (currently FAILS - see the report for exactly which criteria
do not yet pass and why):

```sh
tools/witmotion_ble/.venv/bin/python -m unittest -v \
  tools/witmotion_ble/test_replay_gate.py
```

## MotionSample format (the one boundary everything shares)

Every consumer in this directory - `calibration_engine.py`'s
`PersonalizedMovementDetector`/`ReleaseDetector`, `semantic_detector.py`'s
`RightHandRaiseSession`, `replay_gate.py`, `simulation.py`, and
`lib/physicalInput`'s TypeScript types (`MotionSample` in
`../../lib/physicalInput/types.ts`) - shares one sample shape:

```
timestamp: float (seconds, monotonic within one session/recording)
acceleration_g: (x, y, z)   # g
gyroscope_dps:  (x, y, z)   # degrees/second
angles_deg:     (roll, pitch, yaw)  # degrees, sensor's own fused orientation
```

A real recording (via `capture_calibration.py` and friends) produces this
from parsed `0x61` BLE frames (`protocol.py`); `simulation.py` produces the
exact same shape from deterministic synthetic kinematics, so any tool here
can run against either without modification.

## Simulating the sensor (no hardware required)

`simulation.py` generates deterministic telemetry for eleven scenarios -
neutral, very_small_raise, small_slow_raise, small_sudden_raise,
medium_raise, large_raise, hold, release, jitter, baseline_drift,
changed_rest_position - reproducible across separate process runs (see
`test_simulation.py`'s regression test for the PYTHONHASHSEED bug this was
built to avoid). Two ways to use it:

```sh
# Feed a scenario straight into the real detector in Python:
tools/witmotion_ble/.venv/bin/python -c "
from simulation import build_scenario
from calibration_engine import BaselineProfile
from semantic_detector import RightHandRaiseSession
samples = build_scenario('medium_raise')
baseline = BaselineProfile.from_samples(samples[:15])
session = RightHandRaiseSession(baseline, raise_axis_index=1, raise_sign=-1)
for i, s in enumerate(samples[15:]): session.observe(15 + i, s)
print(len(session.events), 'events')
"

# Or dump a scenario to a replay_gate.py-compatible CSV:
tools/witmotion_ble/.venv/bin/python tools/witmotion_ble/simulation.py medium_raise
```

`SimulatedSensor` (same file) additionally exposes a connect/stream/
disconnect shape matching a real BLE adapter, including a
`force_disconnect_after(n)` test hook, for exercising disconnect handling
without hardware.

## Tomorrow's two clean captures (SMALL_SLOW / SMALL_SUDDEN)

The two OLD recordings (`small_slow_raise_rep01.csv`,
`small_sudden_raise_rep01.csv`) have no independent per-repetition ground
truth - only a manifest note of how many raises were *intended* - which is
exactly why `replay_gate_report.json` currently fails on them (see criteria
1/7/8/9). `capture_small_movements_clean.py` produces a sensor-gated,
ground-truth-marked recapture of both, the same proven way
`capture_normal_full_clean.py` already did for NORMAL/FULL:

```sh
tools/witmotion_ble/.venv/bin/python tools/witmotion_ble/capture_small_movements_clean.py --movement-style small_slow
tools/witmotion_ble/.venv/bin/python tools/witmotion_ble/capture_small_movements_clean.py --movement-style small_sudden
```

Each: large Arabic on-screen instructions, exactly 5 sensor-confirmed
repetitions (never timer-gated, never cut off early), explicit rest/release
confirmation between every repetition, and unique, never-overwritten output
files (exclusive-create).

## Final live validation (no fixed script, no gating)

```sh
tools/witmotion_ble/.venv/bin/python tools/witmotion_ble/live_validation.py
```

Connects to the real sensor, loads this user's existing RIGHT_WRIST
calibration (refuses to fake detection and says "يحتاج معايرة" plainly if
none exists), runs a brief live neutral confirmation, then continuously
shows: connection state, calibration state, current movement, and a live
detected-movement counter - the same unmodified `RightHandRaiseSession`
`replay_gate.py` uses. A reference checklist (rest, very-small/slow/fast/
medium/large raises, hold, release, a changed rest position, one final
raise) is shown alongside for free-form testing; nothing is scored or
gated. Every detected event is logged to a timestamped JSON file on exit.

## Full validation gate (run once tomorrow's clean captures exist)

```sh
tools/witmotion_ble/.venv/bin/python tools/witmotion_ble/full_validation_gate.py
```

Runs `replay_gate.py` unmodified, then separately checks
normal_full_raise_clean / small_slow_raise_clean / small_sudden_raise_clean
against their own ground-truth repetition windows (same method
`analyze_ground_truth_capture.py` already uses) - duplicate detections,
missed repetitions, spurious out-of-window events, and premature rearms
(hold/rearm behavior) are all reported explicitly per dataset. Reports
`NOT_YET_CAPTURED` honestly for any clean dataset that does not exist yet,
rather than skipping it silently. Never tunes a detector constant - PASS or
FAIL, reported honestly, one JSON report
(`full_validation_gate_report.json`) plus a printed summary.

**Already found tonight, without touching the detector:** this per-
repetition check caught something `replay_gate.py`'s own simpler
"total-count-only" check for `normal_full_raise_clean_rep01.csv` masked -
the aggregate count matched (5 detected / 5 expected, PASS under
`replay_gate.py`), but the per-repetition ground truth shows repetition 3
was double-detected, repetition 5 was missed entirely, and 4 of 5
repetitions rearmed before their own ground-truth release marker. This is
real, pre-existing detector behavior on real data, not a simulator
artifact - worth investigating before this dataset is trusted as a gating
reference, independent of tomorrow's new captures.

## Physical input architecture (prepared, not wired to any game)

`../../lib/physicalInput/` (TypeScript, in the main app) is the prepared,
tested `PhysicalInputManager` architecture for RIGHT_HAND/LEFT_HAND/
RIGHT_FOOT/LEFT_FOOT input, described in the brief that produced tonight's
work. It is intentionally NOT imported by any game/control/display code
yet, and does not reimplement `semantic_detector.py`'s validated algorithm
(that port is deliberately deferred - see `SemanticDetector.ts`'s doc
comment). See:

- `lib/physicalInput/PhysicalInputManager.ts` - per-role isolation,
  disconnect safety, recalibration gating.
- `lib/physicalInput/roleAssignment.ts` - stable device-id → role
  assignment with no hardcoded MAC/UUID anywhere.
- `lib/physicalInput/__tests__/` - role isolation, disconnect safety,
  calibration gating, all runnable with `npx vitest run lib/physicalInput`.
- `docs/balloon-quest-integration-plan.md` - exactly which existing
  Balloon Quest action a future RIGHT_HAND_RAISE would call, and which
  files that would touch (none touched yet).
- `docs/left-hand-phase2-plan.md` - how the second real WT901BLECL that
  has now arrived gets its own independent calibration once its own
  capture work starts.
- `../../components/control/sensors/SensorSetupPrototypeScreen.tsx` (at
  `/control/sensor-setup-prototype`, not linked from any nav) - an isolated
  therapist-facing UX prototype for discovering/pairing/calibrating
  sensors per role, using local mock state only - not wired to real BLE or
  to `lib/physicalInput` yet.

## Troubleshooting

- **"لم أجد الحساس" / sensor not found**: fully quit the WITMOTION app
  first - it holds an exclusive BLE connection. Confirm the sensor is
  powered on (LED). macOS Bluetooth permission must be granted to the
  terminal app running these tools (System Settings → Privacy & Security →
  Bluetooth).
- **Capture tool refuses to start / `FileExistsError`**: every capture tool
  uses exclusive-create output paths on purpose, so a previous real
  recording is never silently overwritten. Use a different `--repetition`
  or investigate the existing file before removing anything.
- **`replay_gate.py` / `full_validation_gate.py` FAILs**: expected until
  tomorrow's clean small-movement captures exist - see "Full validation
  gate" above. Read the printed per-criterion detail; never "fix" this by
  changing a detector constant to force a pass.
- **`live_validation.py` says "يحتاج معايرة"**: no calibration exists for
  this session yet - run `faceid_calibration.py` first.
- **Two sensors visible while capturing**: pass `--device` with a name
  fragment or CoreBluetooth UUID to `capture_calibration.py`/
  `capture_normal_full_clean.py`/`capture_small_movements_clean.py`/
  `live_validation.py` to disambiguate.

## What remains unvalidated

- `small_slow_raise_clean` / `small_sudden_raise_clean` ground-truth
  datasets do not exist yet - tomorrow's first task.
- `replay_gate.py` currently FAILS (criteria 1/2/5/7/8/9 - see
  `replay_gate_report.json`) pending those two captures.
- `normal_full_raise_clean_rep01.csv`, despite passing `replay_gate.py`'s
  simpler count check, shows a duplicate detection, a missed repetition,
  and 4 premature rearms under `full_validation_gate.py`'s per-repetition
  ground-truth check (see above) - not yet explained or fixed.
- LEFT_HAND, RIGHT_FOOT, LEFT_FOOT have zero real recordings, zero
  calibration, and zero validation of any kind - see
  `docs/left-hand-phase2-plan.md`.
- `lib/physicalInput` has never received a real BLE sample - its tests use
  `SimulatedInputSource` and mock detectors only.
- No real hardware validation was performed while writing this - the
  sensor was off and unplugged for all of it.
