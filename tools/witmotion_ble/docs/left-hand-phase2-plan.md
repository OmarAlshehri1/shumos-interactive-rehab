# LEFT_HAND phase-2 plan (PLAN ONLY — not physically validated tonight)

A second real WT901BLECL has arrived. This documents how the *same*
architecture instantiates independently for `LEFT_HAND`, without assuming
LEFT_HAND shares RIGHT_HAND's axis signs or reusing any of RIGHT_HAND's
calibration data. No LEFT_HAND capture, calibration, or detection has been
run — there is no left-wrist data of any kind yet.

## Why LEFT_HAND is not just "RIGHT_HAND with a flipped sign"

`analysis.json`'s `personalized_raise_evidence` (dominant angle axis +
raise-direction sign) was derived specifically from this user's own
RIGHT_WRIST recordings, with a documented, fixed mounting convention
("logo upward, X toward hand/fingers" — see `manifest.json`'s `mounting`).
A second sensor mounted on the *left* wrist is not guaranteed to share that
convention: the therapist could reasonably orient it "logo upward, X toward
hand/fingers" from the left wrist's own perspective, which is a mirrored —
not identical — physical orientation relative to the body, and could easily
land on a different dominant axis or an opposite sign, or even a different
axis entirely if mounted a few degrees differently. Assuming otherwise
without evidence is exactly the kind of "invented, not measured" shortcut
tonight's brief is written to avoid.

## What stays shared vs. what must be independent

**Shared (already reusable, no LEFT_HAND-specific work needed):**
- `protocol.py` — the WITMOTION BLE frame format is per-sensor-model, not
  per-mounting-side.
- `calibration_engine.py` — `BaselineProfile`, `PersonalizedMovementDetector`,
  `ReleaseDetector` all already take a baseline as data; nothing in them
  assumes RIGHT_WRIST.
- `semantic_detector.py`'s state machine — `RightHandRaiseSession` already
  takes `raise_axis_index`/`raise_sign`/`directional_prototypes` as
  constructor arguments, not constants. A `LeftHandRaiseSession` (or a
  renamed, role-parameterized session — see below) needs no new detection
  logic, only its own axis/sign/prototypes.
- `lib/physicalInput`'s whole architecture (`PhysicalInputManager`,
  `CalibrationProfile`, `roleAssignment.ts`) — already role-parameterized;
  see `types.ts`'s `PhysicalRole.LEFT_HAND`.

**Must be independent (LEFT_HAND-specific, not yet produced):**
- Its own neutral baseline capture (own `neutral_repXX.csv`), own accepted
  noise floor — a different wrist, different strap, different day.
- Its own Face-ID-style directional enrollment (`faceid_calibration.py`
  already supports running it against a different session/device — see
  `capture_calibration.py`'s `--session` flag; a `left_hand_...` session
  directory is the natural container, mirroring
  `right_hand_adult_sim_20260902_01`'s own naming).
- Its own `personalized_raise_evidence` (own dominant axis + sign, computed
  by `analyze_calibration.py` from LEFT_HAND's own recordings only).
- Its own clean, ground-truth-marked capture set once axis/sign are known
  (the same `capture_normal_full_clean.py` / `capture_small_movements_clean.py`
  pattern, pointed at the LEFT_HAND session directory).
- Its own `replay_gate.py`-equivalent acceptance pass — RIGHT_HAND's
  passing does not imply LEFT_HAND passes; the whole point of this
  project's evidence-driven approach is that each side earns its own
  validation.

## Naming/renaming consideration (not done tonight)

`semantic_detector.RightHandRaiseSession` and
`RightHandRaiseEvent`/`RejectedMovement` are currently named for the one
role that exists. Once LEFT_HAND capture work actually starts, renaming to
a role-neutral `HandRaiseSession` (constructed with a `role` alongside
axis/sign) is likely cleaner than a parallel `LeftHandRaiseSession` class —
but that is a rename of already-validated, tested code, so it belongs in
its own reviewed change, not bundled into whichever task starts capturing
LEFT_HAND data.

## Sensor role assignment (already prepared, not exercised with real hardware)

`lib/physicalInput/roleAssignment.ts` already implements "sensor 1 →
RIGHT_HAND, sensor 2 → LEFT_HAND" as an explicit, persisted
device-id → role mapping with no hardcoded MAC/CoreBluetooth UUID anywhere
in product code — `assignRole()` refuses to silently displace an existing
owner, so a newly discovered second sensor can never accidentally steal
RIGHT_HAND's assignment. `tools/witmotion_ble/capture_calibration.py`'s own
`--device` flag already supports selecting among multiple discovered
sensors by name fragment or CoreBluetooth UUID for the Python-side capture
tools once a second real device is being captured from.

## What "done" looks like for LEFT_HAND (future task, not tonight)

1. A `left_hand_adult_sim_<date>_01`-style session directory with its own
   accepted neutral baseline and full Face-ID enrollment.
2. Its own `analysis.json` → `personalized_raise_evidence`.
3. Its own clean ground-truth captures (small_slow, small_sudden,
   normal_full at minimum) and a passing `full_validation_gate.py` run
   against that session directory (the tool already accepts any session via
   its `SESSION_DIR`-relative lookups — pointing it at a new session
   directory is a config change, not new code).
4. Only then, `lib/physicalInput`'s `LEFT_HAND` role gets assigned a real
   calibrated `CalibrationProfile` — until that exists, `assignRole` +
   `NOT_CALIBRATED` correctly keeps `PhysicalInputManager` from ever routing
   LEFT_HAND samples to a detector (see
   `lib/physicalInput/__tests__/PhysicalInputManager.test.ts`'s calibration-
   gating tests).
