# Real RIGHT_HAND rotation-compensation investigation — 2026-09-03

Offline-only. No production/game code changed. No Firebase touched.

## What real data actually exists

Only **3 real WT901BLECL hardware sessions exist on this machine**, all
captured today (2026-09-03, RIGHT_HAND), all recovered from the in-app
diagnostic tool's browser download (`~/Downloads/wt901-right-hand-
diagnostic-*.json`) and copied read-only into `raw/`. There is no separate
Face-ID export, no separate neutral-only file, no left-hand data, and no
earlier-day session — those did not exist as files before this indexing.
`tools/witmotion_ble/calibration_data/right_hand_adult_sim_20260902_01/` is
**simulated** data (its own directory name says so) and was excluded from
this dataset; it must never be pooled with real hardware evidence.

3,620 real samples total across the 3 sessions. See `manifest.json`.

## Sample rate

All three sessions: ~9.93 Hz (100.7ms mean interval), consistently. This is
not a one-off; it is the BLE notification default across every real
capture that exists. Confirms the rate problem is systemic, not
session noise.

## Current model: `X = deltaYaw − k·deltaRoll`, k = 0.2771

Already fit from real data (session 2's rotate_one/rotate_other, per-
direction slopes 0.2614 / 0.2928, averaged) — not a guess.

## What was actually tested offline (`replay_models.py`)

Raw sensor fields (`accelerationG`, `gyroscopeDps`, `anglesDeg`) were
re-processed independently of whatever `output` each capture already
contains, so every candidate below is evaluated fairly against the same
raw ground truth.

### 1. Naive quaternion swing-twist about the assumed local-X (roll) axis
Built Qcur from Euler via the standard aerospace roll-pitch-yaw
convention (verified round-trip exact against the device's own angle
output), decomposed `Qrel = inv(Q0)·Qcur` into swing/twist about local
X, derived pointer X/Y from the swing-rotated forward vector.

**Result: WORSE than the current scalar model on all 3 sessions**
(e.g. session 3: rot1 maxDrift 0.362 → 0.515, rot2 0.483 → 0.527). See
`replay_report.json`.

Why: the assumption "twist axis == local X exactly" doesn't hold. Gyro-
vector analysis (average gyro direction during high-|ω| samples of each
rotate phase) shows the true rotation axis is close to local X but
tilted 8°–55° depending on session/phase, **and is not the same estimated
axis between rotate_one and rotate_other within the same session**
(dot product 0.50–0.97 instead of the ≈ −1 a clean fixed-axis, opposite-
spin pair would give). With only 9.93 Hz and short phase windows, only
17–39 samples per phase clear the |gyro|>20 dps threshold used for that
estimate — too few, too noisy, to trust a calibrated axis from this data.

### 2. Per-session self-calibrated k (best possible linear fit, in-sample)
Refit k separately on each session's own rotate_one+rotate_other data
(0.36 / 0.33 / 0.25 across the 3 sessions — same sign, same order of
magnitude, confirms the model FORM is reasonable) and replayed each
session against its own best-fit k.

**Result: no meaningful improvement over the shipped k=0.2771** (deltas
of 0.01–0.04 in max drift, sometimes worse). This is the important
negative result: **even the best possible constant scalar, fit fresh
per session, cannot suppress the residual drift.** At the single sample
with peak roll excursion (93°) in session 3, k=0.2771 cancels almost
perfectly (x lands at 0.500); across the rest of the same phase's
trajectory it does not, because yaw-vs-roll is not a single-valued
function of roll during real rotation (the phase's roll trace goes out
to ~83–93° and back, retracing different yaw/pitch values along the
way) — i.e. there is real path-dependence / hysteresis in this data
that no static linear coefficient, however tuned, can represent.

### Conclusion on the rotation model
**A single linear scalar has demonstrably hit its ceiling on the
evidence that exists.** A properly *calibrated* (not assumed) swing-
twist model is still the right longer-term direction — but the axis
calibration itself is not trustworthy yet at 9.93 Hz with only ~20–40
usable high-velocity samples per phase. **Recommendation: do not ship a
rotation-model change now.** Keep the current k=0.2771 (not worse than
anything tested), and revisit axis calibration once the rate test
raises the real sample rate — a faster stream both improves WitMotion's
own onboard fusion during fast rotation and gives enough samples to fit
a trustworthy twist axis per patient/mount.

## Filter comparison (LIGHT_EMA / ADAPTIVE_EMA / ONE_EURO)

Replayed all three filters (ported 1:1 from `MotionFilters.ts`) against
the current-scalar target series for `still_start`/`still_end` (jitter),
`tiny` and `fast` (tracking ratio = peak filtered displacement / peak
raw displacement within the phase).

**Result: at 9.93 Hz the three filters are statistically indistinguishable**
(tracking ratios all within 0.97–1.05 of each other; jitter near-identical)
— see `filter_replay_report.json`. There isn't enough temporal resolution
between samples for their designed dynamics to diverge. **This cannot be
decided from the current data**; it needs the raised sample rate first.
Recommendation for the live A/B once the rate is higher: **ADAPTIVE_EMA**
(current default, gyro-magnitude-aware) vs **ONE_EURO** (velocity-adaptive,
standard for pointing tasks) — the two soundest designs already implemented
in `MotionFilters.ts`, not a new build.

## Rate-test readiness

`lib/physicalInput/WitmotionRateTest.ts::runTemporaryWitmotionRateTrial`
already exists, is type-restricted to 20|50 Hz (no 200 Hz path), reads
the original rate before changing anything, refuses to proceed if that
rate isn't restorable, and restores it in a `finally` block even on
error. It is already wired into `SensorHandDemoScreen.tsx`. No new code
needed for section 9 — it is ready.

## Update — 2026-09-04: twist-dominance gate shipped (real 50Hz RIGHT_HAND asymmetry)

Everything above predates `ContinuousMotionController`'s current gyro-
integrated model (this doc's `X = deltaYaw − k·deltaRoll` scalar and the
swing-twist candidate were both evaluated against the OLD fused-angle
model, since replaced — see the class's own doc comment). It is kept for
the record, not as the current model's status.

A live 50Hz hardware test surfaced a NEW asymmetry the fused-angle-era data
never exercised: LEFT wrist twist well-rejected, RIGHT still leaked. Two
more analysis passes were run against these same 3 sessions
(`analyze_twist_asymmetry.py`, `analyze_twist_coupling_by_sign.py`) before
touching any code: neither found a stable, session-independent left/right
coefficient — `rotate_one`/`rotate_other` phase labels don't carry a
consistent physical direction across sessions (net twist integral has the
SAME sign for both phases in 2 of 3 sessions), and the pooled raw
pitch/yaw-vs-twist coupling is nearly symmetric by sign (kYaw+ 0.0968 vs
kYaw− 0.0909), with the small per-session asymmetry flipping which side is
worse between session 1 and session 3. Fitting a hardcoded directional
constant from this would repeat the exact mistake documented above for the
fused-angle model.

Shipped instead: a **twist-dominance gate** (`tune_twist_dominance_gate.py`,
threshold=0.92, maxSuppression=0.7) — damps the raw pitch/yaw remainder only
when a sample's angular rate is almost entirely twist, symmetric in code
(no hardcoded sign) but adaptive in effect (whichever direction leaks more
for a given mount gets damped more, self-adapting session to session). See
`validate_full_pipeline.py` / `final_before_after_report.json` for the
combined before/after replay (also includes Part 2's intent/jitter gate):
rotate_one/rotate_other max drift dropped 71-100% across all 3 sessions,
while every real aim phase's range moved by <1%.

## Update — 2026-09-04: real still-phase noise characterization (Part 4, hardware OFF)

`analyze_still_noise.py` (new tonight) computes per-axis mean/std/RMS/
median/MAD/peak-to-peak over every `still_start`+`still_end` sample in all 3
real sessions (457 samples pooled) — see `still_noise_report.json` for the
full breakdown. Source: raw `gyroscopeDps`/`accelerationG`/`anglesDeg`
only, never the embedded `output` field, same convention as every other
script in this directory.

**Headline numbers (pooled across all 3 sessions):**
- Gyro bias (mean while still): x=-0.015, y=-0.44, z=+0.10 deg/s — small,
  consistent with ordinary MEMS gyro bias, not a mounting problem.
- Gyro noise, MAD (robust "typical" noise, ignores rare outliers):
  x=0.67, y=0.43, z=0.43 deg/s.
- Gyro noise, STD (mean-based, sensitive to outliers): x=5.6, y=3.9,
  z=3.5 deg/s — **8x higher than MAD**, meaning the noise is NOT uniform:
  most still-phase time is genuinely quiet, punctuated by occasional brief
  bursts.
- Confirmed per-session: session 1 has one dramatic burst (gyro magnitude
  peak 117 deg/s during a labeled "still" phase — almost certainly the
  person settling their hand into position right as that phase's recording
  started, not sensor noise); sessions 2/3 are much cleaner (peak 8-9 deg/s).
  This is exactly the MAD-vs-STD gap's explanation, not sensor pathology.
- Fused-angle jitter while still (device's own anglesDeg, NOT used for
  pointer math — see ContinuousMotionController's class doc comment): std
  3.3-8.1deg depending on axis, confirming the earlier finding that the
  device's own fused output is noisier/less trustworthy than raw gyro
  integration for this purpose.

**Design implication for Part 5 (pediatric jitter model):** a single
STD-based noise threshold would be dominated by rare transients (the 117
deg/s outlier), forcing an unnecessarily large dead zone that would also
suppress genuine tiny intentional movement. A robust statistic (MAD) or a
SHORT-WINDOW/shape-based measure is the right foundation — which is exactly
what `MotionIntentGate` (`lib/physicalInput/MotionFilters.ts`) already is:
it distinguishes jitter from intent by path COHERENCE within a short
rolling window, not by a single global noise magnitude, so an isolated
settling-motion burst at the start of a hold does not by itself force a
larger dead zone for the whole session. This still needs the real 50Hz
rate test to properly validate (see the intent gate's own doc comment: it
was structurally inert at the only rate captured so far, 9.93Hz) — tonight's
noise numbers justify keeping that design, not changing it blind.

## Update — 2026-09-04: FINAL_SESSION real capture (11,402 samples, 50Hz confirmed) — cross-axis coupling & twist-invariance status

`raw/wt901-right-hand-final-session-1788527323549.json` — a NEW capture tool/
schema (FINAL_SESSION_2026_09_04, superset phases from `FinalSessionPhases.ts`),
not the 3 2026-09-03 diagnostic captures above. Copied read-only into `raw/`
(sha256-verified identical to the `~/Downloads` original), indexed in
`manifest.json`. Full numeric breakdown: `final_session_cross_coupling_report.json`
(script: `analyze_final_session_cross_coupling.py`, reads only raw
`accelerationG`/`gyroscopeDps`/`anglesDeg`/`output` per record, never
re-prints the raw JSON).

**RIGHT_HAND IS NOT ACCEPTED/FINALIZED as of this update** — this is offline
analysis of one real session plus a proposed protocol for the one still-
missing capture (twist-while-aiming), not a go/no-go decision.

### Sample rate: 50Hz genuinely achieved (first real capture at this rate)
Naive mean-interval math on this file gives a misleading ~24.8Hz because
~50% of consecutive records share an identical `timestampMs` (accel/gyro/
angle land as separate BLE packets within the same ms tick at this rate).
Correcting for that (and for the session's one 13.9s non-streaming pause,
a recenter-dialog wait) gives **49.66 Hz measured**, matching the session's
own `finalHardwareApplied` (50Hz/20Hz) almost exactly. `build_manifest.py`'s
`sample_interval_stats` was fixed to handle this generally (streaming-only
duration ÷ streaming interval count) — verified it leaves the 3 old 9.93Hz
sessions' numbers unchanged.

### Cross-axis coupling (Problem 1): quantified, and a calibration matrix removes most of it
PCA on `unfilteredPointer` displacement within each cardinal phase (relative
to that phase's own first sample):
- `up`: principal axis 7.06° off true vertical, eccentricity (minor/major std) 0.055
- `down`: 4.25° off vertical, eccentricity 0.035
- `left`: 8.97° off horizontal, eccentricity 0.073
- `right`: 10.75° off horizontal, eccentricity 0.077
- Linear cross-leakage (pooled, sign-aligned): vertical motion leaks ~0.11
  units of X per unit Y moved; horizontal motion leaks ~0.19 units of Y per
  unit X moved.

A 2x2 calibration matrix built from the two pooled principal directions
(`e_h`, `e_v` — measured angle between them 94.4°, close to but not exactly
90°, consistent with real wrist biomechanics not being a perfect orthogonal
gimbal) and inverted: applying `M⁻¹` to the same raw displacement clouds
drops the residual angle to **-0.77°(up) / 2.06°(down) / 1.73°(left) /
-0.04°(right)** — all under ~2°, down from 4-11°. The `diagonal` phase's
principal angle shifts (-30.0° → 42.9°) but stays a genuine diagonal, not
collapsed onto a cardinal axis — expected, since a linear invertible
transform can't do that. **This validates the orthogonalized-basis approach
the brief asked to evaluate; it is not yet wired into `ContinuousMotionController`.**

### Twist-in-place (existing gate) vs twist-while-aiming (Problem 2, NOT covered by this session)
`rotate_one`/`rotate_other` (this session's ONLY twist-related phases) show
the shipped twist-dominance gate already holds up well for PURE stationary
twist: pointer drift stayed ≤0.067 (rotate_one) / ≤0.054 (rotate_other) of
the full [0,1] range even as roll swung 89°/151° and twist rate peaked at
157/259 deg/s. **This says nothing about the actual complaint** — aiming
up/down/left/right *while* the wrist is held rotated 45°/90° — because no
phase in `FinalSessionPhases.ts` tests that combination. `commitCenter()`'s
de-roll correction (`referenceRollCos/Sin`) is captured ONCE at recenter from
the device's fused roll (`anglesDeg[0]`, gravity-referenced — unlike fused
YAW, roll/pitch have an absolute gravity reference, so this one-time snapshot
should itself be low-drift) and then frozen for the rest of the session; if
the wrist rotates further AFTER that snapshot, the fixed 2D de-roll rotation
becomes stale relative to the sensor's actual current axes — the most likely
mechanism for axis-swap, but unverified against real data because the data
doesn't exist yet.

**New targeted capture protocol prepared, not yet run or wired into a
screen:** `lib/physicalInput/TwistInvarianceCapturePhases.ts` — 12 phases
(neutral/twist_45/twist_90 × up/down/left/right, ~2-3s each, reuses
`MotionDiagnosticRecord`'s plain-string `phase` field so no recording/replay
machinery needs to change), plus an optional opposite-rotation set. Needs a
go-ahead before building a screen around it.

### Held-position jitter (still_start/still_end, real 50Hz data)
Pointer RMS distance from mean: 0.0048 (still_start) / 0.0073 (still_end) of
the full [0,1] range; 95th percentile 0.009 / 0.012; worst single-axis
peak-to-peak 0.020-0.024. Gyro MAD while still: 0.37-0.79 deg/s per axis —
in the same range as the 3 old sessions' pooled MAD (0.43-0.67), so the
noise FLOOR hasn't changed with rate; what changed is having ~5x more
still-phase samples (594 pooled per the session's own `noiseEnvelope`) to
estimate it from.

### Latency: controller-side processing is not the bottleneck
Per-record `output.timing`, BLE-notification-timestamp → pointer-output:
mean 0.23ms, p95 0.40ms, max 0.50ms, across all 11,402 records. This
session's export does NOT include UI-commit/visual-frame timestamps (unlike
the 3 old sessions' `embeddedLatency`), so Display-side latency has no
measurement here — known gap, not measured as zero. Given
`SensorPointerDisplaySync.tsx` (20Hz/50ms Firebase throttle) and
`SensorHandCursor.tsx` (75ms CSS transition), those two stages are the
credible bottleneck candidates versus a sub-millisecond controller, but
that is architecture reading, not a measurement from this dataset.

### Edge reversal: 2 of 4 directions validated this session
`edge_right_reverse_left`: 254ms. `edge_bottom_reverse_up`: 120ms.
`edge_left_reverse_right` / `edge_top_reverse_down`: `reversalResponseMs`
null — the specific edge-reversal phase didn't register hitting the exact
saturated edge that repetition (even though the pointer DID reach x≈0/y≈0
elsewhere in the session per `achievedRange`). Only these two specific short
phases need a repeat, not the whole session.

### hardwareComparison duplicate label: confirmed benign, not data corruption
All 3 trials in `hardwareComparison` share `originalRateCode: 6,
originalBandwidthCode: 4` even though their `candidate.rateHz/bandwidthHz`
correctly differ (50/20, 50/20, 100/42) — traced to
`WitmotionConfigTrial.ts`: `originalRateCode`/`originalBandwidthCode` are
named for what they mean (the device's PRE-trial code, read once so it can
be restored after each candidate), not "the code this candidate used." A
confusingly-named diagnostic field, not corrupted measurements — each
trial's own `measuredHz` (49.94 / 50.07 / 100.05) is correct and distinct.
Separately, trial 1 ("50Hz + الفلتر الحالي") shows gyro std 8.2-18.4 deg/s
while trial 2 (also nominally 50Hz/20Hz, "فلتر أضيق") shows 0.34-0.70 deg/s
— almost certainly trial 1's still-noise window caught the hand still
settling into position, not a real hardware difference between two
identically-configured trials; trial 2 and the session's own final
`noiseEnvelope` (0.90-1.41 deg/s std) agree far better with each other.

## Update — 2026-09-04: RIGHT/LEFT inversion bug found and fixed BEFORE any twist-invariance capture

Caught by Omar on real hardware on `/control/right-hand-twist-invariance` — physical UP/DOWN correct, but physical RIGHT moved the screen hand LEFT and vice versa. **No data was recorded from that session; nothing was indexed.**

Two independent, real bugs, both in code added earlier tonight for the cross-axis calibration matrix (Problem 1) — traced, not blindly sign-flipped:

1. **Sign-ambiguous matrix derivation** (`deriveCrossAxisCalibration`, `RightHandSessionProfile.ts`, and its Python counterpart `analyze_final_session_cross_coupling.py`): the principal-direction sign was aligned to the POOLED cloud's own mean (`left` phase pooled with a sign-flipped `right` phase to combine their shape for one PCA fit) — an artifact of whichever phase's displacement happened to dominate the pooling, not a stable "which way is actually right/down" reference. Worse, even "the phase's own un-pooled mean displacement" turned out unreliable as a sign reference: the real `down` phase's own recorded samples START near the bottom (carried over from the prior phase) and drift back toward center by the phase's end, so its own relative-displacement mean is negative (backwards) even though the phase genuinely sits in the screen's lower half throughout. **Fix:** sign-align to the mean ABSOLUTE `unfilteredPointer` position relative to screen center (0.5, 0.5) for the `right`/`down` phases specifically — "which half of the screen was this phase generally on," which survives both the pooling artifact and the within-phase transition noise. Re-derived matrix for the 2026-09-04 adult session: `[[0.9969, 0.1101], [-0.1859, 0.9856]]` (previously `[[-0.9969, -0.1101], [-0.1859, 0.9856]]` — only the X row's sign was wrong, matching exactly what was observed: UP/DOWN correct, RIGHT/LEFT inverted). New `sign_check`/`sign_check_all_preserved` fields in `final_session_cross_coupling_report.json` now explicitly validate this (the old `post_calibration_angle_deviation_deg` check alone is mod-180 blind to a full flip and would not have caught it).

2. **Matrix applied in the wrong coordinate space** (`ContinuousMotionController.ts`): the matrix was applied to the raw PRE-invert angle delta, but `deriveCrossAxisCalibration` fits it against `unfilteredPointer`, which is POST-invertX/invertY. Since this RIGHT_HAND profile has `invertX=true, invertY=false` (they disagree), `S*(M*delta)` ≠ `M*(S*delta)` once `M` has off-diagonal terms — proven algebraically to leave each axis's own primary response to its own motion unaffected, but to flip the sign of the CROSS-leak term and, for a genuinely mixed raw signal, actively double a real coupling leak instead of cancelling it. **Fix:** apply the matrix to the `(x-0.5, y-0.5)` POINTER-space offset, after `normalizedAxis`, matching exactly the space it is derived and validated in. New regression test in `ContinuousMotionController.test.ts` pins this with a synthetic mixed-axis leak under `invertX=true, invertY=false` (fails under the old placement, passes under the new one).

**Mandatory pre-capture direction check added** to `RightHandTwistInvarianceScreen.tsx` (between centering and the guided phases): the therapist confirms all four of UP/DOWN/LEFT/RIGHT move the on-screen hand the correct way — no data is recorded during this check — before "ابدأ الالتقاط" unlocks. This is now the standing safety net for this exact failure mode on every future run of that screen, not just tonight's fix.

**Lesson for future calibration-matrix work**: an angle-deviation check (mod 180°, "is the motion cardinal") is NOT sufficient validation for a real calibration matrix — it is blind to a full sign flip. Always pair it with an explicit sign check against an external, un-pooled reference before trusting a derived matrix, and validate on real hardware with a live direction check before any data-collection session that depends on it.

## Update — 2026-09-04: ROLL_INVARIANT_TRANSVERSE_FRAME — feasibility gate PASSED on real data

Source: `raw/wt901-right-hand-twist-invariance-1788531321165.json` (4,960 real
samples, sha256-verified copy, 14 phases: neutral/twist_45/twist_90 x
up/down/left/right + 2 retried edge phases). Full replay:
`analyze_twist_invariance_capture.py` -> `twist_invariance_replay_report.json`.

**The old scalar-de-roll architecture (both FROZEN_AT_RECENTER and the
earlier CONTINUOUS_GRAVITY_REFERENCED attempt) measured badly on real
roll-varying data**, using ACTUAL measured wrist angle (device's own fused
roll relative to the session's one recenter, not the phase label — real
`twist_45_*` phases drifted to 45-69°, `twist_90_*` to 84-108°):

| bucket (actual angle) | FROZEN_AT_RECENTER mean error | CONTINUOUS_GRAVITY_REFERENCED mean error | ROLL_INVARIANT_TRANSVERSE_FRAME mean error |
|---|---|---|---|
| ~0° (neutral) | 9.4° | 2.8° | 2.0° |
| ~45° (30-80°) | 53.4° | 123.6° (worse than doing nothing) | 2.4° |
| ~90° (>80°) | 80.7° | 89.8° (up to 172° — fully inverted at times) | 4.2° |

CONTINUOUS_GRAVITY_REFERENCED being WORSE than FROZEN at large roll confirms
the exact risk flagged before building it: rotating the raw pitch/yaw-rate
pair by the device's own fused Euler roll angle still inherits that fused
angle's own instability at large rolls — an Euler-angle abstraction, not
geometry.

**New model**: abandons the Euler "roll angle" entirely. Tracks a gravity
direction estimate in sensor-local coordinates (gyro integration + slow
complementary correction toward raw accelerometer, gated by
`|accelerationG|` deviation from 1g so dynamic motion can't yank it),
projects it onto the plane perpendicular to the sensor's local +X/forward
axis to get a 2D transverse basis that rotates WITH the sensor as it rolls,
then projects the raw (twist-damped) pitch/yaw-rate vector onto that basis
via plain dot products — an exact change of orthonormal basis, not a
small-angle approximation. Per-phase error across all 12 directional
phases (0-98° actual roll): 0.3°-8.6°, no axis swaps, no sign inversions
anywhere. Singularity (forward parallel to gravity) never hit in this real
data (`singularityHitsModelC: 0`); handled safely (frozen last-valid basis)
regardless.

**A separate finding, proven on real data, not just reasoned**: the
personalized screen-axis `crossAxisCalibration` matrix (already shipped for
Problem 1) is NOT frame-portable — the 2026-09-04 FINAL_SESSION's matrix
was fit for the OLD scalar-de-roll frame's geometry and residual error
source; the new frame needs and gets its OWN matrix, fit fresh from THIS
session's own `neutral_*` phases only (`RightHandAdultTwistInvariantCalibrationEvidence.ts`)
— and that same matrix, fit ONLY on neutral-roll data, is what achieves the
~2-4° error at 45°/90° above. Also proven redundant on real data: a
separate raw-sign-flip step before deriving this matrix (to pre-resolve
which way is "right"/"down") changes NOTHING in the final output — the
calibration-matrix derivation's own external-sign-reference logic already
absorbs it. One clean personalized-alignment step, not two overlapping ones.

**Shipped**: `ContinuousMotionController.ts` gets a third
`twistTrackingMode`, `"ROLL_INVARIANT_TRANSVERSE_FRAME"` (default stays
`FROZEN_AT_RECENTER` — this is real-game-validated evidence for ONE adult,
not promoted to `DEFAULT_CONTINUOUS_MOTION_CONFIG`). `SensorRuntimeProvider.tsx`
(the one shared runtime every real game reads from) now explicitly
constructs its controller with this mode + this adult's matrix, so the next
real-game session actually exercises it. 4 new roll-invariance regression
tests (`ContinuousMotionController.test.ts`) prove the SAME physical
transverse motion produces the SAME pointer output at 0°/45°/90° roll
(synthetic, physically-transformed sensor data) and that the singularity
case stays finite/bounded — full suite: 1159/1159 passing.

**Not fully resolved**: cross-axis eccentricity at neutral roll (straight
up/down/left/right still shows a small non-cardinal component, ~0.03-0.12
minor/major ratio) is similar across FROZEN/CONTINUOUS/ROLL_INVARIANT —
residual, not eliminated by any frame or calibration tried so far. Most
likely real human/biomechanical imprecision (the therapist's own "straight"
UP/DOWN motion isn't perfectly planar) rather than a fixable sensor/model
defect — reported honestly, not hidden, and not chased further with
"another arbitrary 2x2 matrix" per this evening's own explicit instruction.
Edge reversal: the retried `edge_top_reverse_down` now measures 688.9ms
under the new model's replay (previously null); `edge_left_reverse_right`
is still inconclusive (didn't hit the exact saturated edge value even in
this retry) — a measurement-strictness issue (exact equality to 0/1) more
than evidence the pointer doesn't reach the edge.

## Update — 2026-09-04: edge-saturation / hidden-overflow fix (ADDITIONAL FINAL PRODUCT REQUIREMENT)

Root cause found and fixed in `ContinuousMotionController.ts` (code, not
data-analysis): `aimYawDeg`/`aimPitchDeg` are a plain gyro-rate integral
with NO bound of their own — only the final `normalizedAxis()` output was
clamped to `[0,1]`. Pushing physically past the mapped range kept growing
the internal angle invisibly while the pointer sat pinned at the edge;
reversing then had to first "unwind" however much invisible angle had
piled up before the pointer visibly moved — exactly the real-hardware
complaint ("push LEFT past the edge, reverse RIGHT, nothing happens for a
while"). Fixed by clamping the accumulator itself, every sample, to the
same angular half-range `normalizedAxis()` already maps onto `[0,1]`
(`effectiveHalfRangeDeg` — one shared formula, so the two can never
disagree) — see the new "SATURATING INTEGRATOR" section of that file's
class doc comment and its "edge saturation / immediate reversal" test
suite. This is a controller-code fix verified by deterministic unit tests
(`ContinuousMotionController.test.ts`, `pointerInvariants.test.ts`), not a
real-hardware-dependent finding — it needed no sensor to discover or fix,
only reading the existing integration code closely.
