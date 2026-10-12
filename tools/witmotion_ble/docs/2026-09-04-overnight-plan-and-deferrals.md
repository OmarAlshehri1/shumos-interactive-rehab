# Overnight session 2026-09-04 — what shipped, what's designed-but-deferred

Hardware was OFF all night (per the brief). Nothing here required a sensor
to build or verify except where explicitly marked "needs tomorrow's
hardware." No commit/push/deploy, no Firebase rules change, no game-logic
change — see each section for exactly what touched what.

## Shipped tonight (code + tests, verified without hardware)

1. **Edge-saturation / hidden-overflow fix** — `lib/physicalInput/
   ContinuousMotionController.ts`. See `real_dataset/FINDINGS.md`'s
   "edge-saturation / hidden-overflow fix" update for the root cause and
   fix. Tests: new "edge saturation / immediate reversal" suite in
   `ContinuousMotionController.test.ts`.
2. **Recenter phantom-contact protection** — `ContactActivationGate.primeAt`,
   `SensorContactRouter.notePendingRecenter`, threaded through
   `useSensorPointerTargets.ts`'s `recenterEpoch` and
   `SensorRuntimeProvider.tsx`. Reused automatically by every sensor-play
   game through the existing shared `useSensorPointerTargets`/
   `SensorHandLayer` — no per-game changes needed. Tests: new suites in
   `ContactActivationGate.test.ts` and `SensorContactRouter.test.ts`.
3. **Always-visible pointer (radius-inset bounds)** —
   `SensorHandCursor.tsx` now insets its mapped range by one cursor radius
   on each side instead of mapping `[0,1]` straight onto `left`/`top`
   percentages, so the full 64px hand stays inside its container even at
   the extremes. One shared component — fixes Control, Display, and every
   `*SensorContactDemo.tsx` reference implementation at once (see grep
   evidence in this session's own investigation: every renderer already
   goes through `SensorHandCursor`, none duplicate the positioning math).
4. **Invalid-sample / pointer-visibility regression tests** —
   `pointerInvariants.test.ts` (new): a seeded pseudo-random 5000-step
   stress test asserting `0 <= pointer.x/y <= 1` and finite across holds,
   reversals, saturation, twist, and fast/slow/tiny motion; plus NaN/
   Infinity sample tests confirming the controller already degrades safely
   (returns `null` from `observe()`, never corrupting or nulling the
   published pointer — this was already true structurally, now covered by
   a test).
5. **Real still-phase noise characterization** —
   `real_dataset/analyze_still_noise.py` (new) + `still_noise_report.json`
   (generated) — see FINDINGS.md's Part 4 update.
6. **WT901BLECL bandwidth register (0x1F) research + guarded trial tool** —
   `docs/official-output-rate-notes.md`'s update, plus
   `WitmotionBleProtocol.ts` (new `WITMOTION_BANDWIDTH_CODES` +
   restorability guard), `Wt901BleInputSource.ts` (new
   `readBandwidthCode`/`setTemporaryBandwidth`/`restoreBandwidthCode`,
   mirroring the existing rate methods exactly), and
   `WitmotionConfigTrial.ts` (new — a guarded rate+bandwidth comparison
   trial, same restore-on-failure safety policy as the existing
   rate-only `WitmotionRateTest.ts`). Never invoked against hardware
   tonight; covered by `WitmotionConfigTrial.test.ts` against a fake
   source.
7. **Dataset indexing** — `build_manifest.py` now stamps a
   `controllerVersionAtIndexTime` (git short hash) per session and picks up
   an optional `<file>.notes.md` sidecar if one is added later, without
   requiring `manifest.json` itself to be hand-edited. Re-running it
   (`python3 build_manifest.py`) is how a NEW real capture gets indexed —
   this already happens automatically for anything dropped into `raw/`,
   which is the "auto-accumulation" the brief asked for; there was no
   existing gap here beyond the two new fields.

All of the above: `npx tsc --noEmit` clean, full `npx vitest run` — 1135/1135
passing (up from 1130 before tonight; the 5 new files' tests all pass, zero
regressions in any pre-existing test).

## Deferred — designed here, not built tonight (see report item 13 for why)

### Face-ID-style enrollment (Parts 11-14)

**Why deferred**: this is a genuinely new screen with new interaction model
(coverage-confidence tracking, adaptive re-request of only-missing
categories, free play, Arabic coverage checklist UI) — building it
shallow tonight risks exactly the "half-finished implementation" this
project's own standards forbid, for a screen whose entire point is to be
used ONCE, tomorrow, without a repeat. Better to design it precisely now
and build it with full attention (and, ideally, a few minutes of real
sensor smoke-testing before the real session) than ship something untested
against a live BLE connection at 2am.

**What already exists and should be reused, not rebuilt**:
- `components/control/sensors/SensorHandDemoScreen.tsx` +
  `lib/physicalInput/MotionDiagnostic.ts`'s `MOTION_DIAGNOSTIC_PHASES` —
  already a sequential labeled-phase capture wizard with Arabic titles/
  instructions, a per-phase sample-count gate, and JSON export. This
  produced the exact 3 real captures this whole dataset is built from.
- `tools/witmotion_ble/real_dataset/build_manifest.py` — already ingests
  exactly this export shape.

**Concrete gap to close, file by file**:
1. `lib/physicalInput/MotionDiagnostic.ts` — extend
   `MOTION_DIAGNOSTIC_PHASES` with the categories Part 12 lists that don't
   exist yet: `تحكم_صغيرة` (tiny intentional — distinct from the existing
   `tiny` phase's likely larger movement), `لف_المعصم` (wrist twist —
   doesn't exist as its own phase yet, only inferred from `rotate_one`/
   `rotate_other`), and four new `عكس_الاتجاه_عند_الحافة_{يمين,يسار,فوق,تحت}`
   phases (push to an edge, hold, reverse — direct coverage for tonight's
   new edge-saturation fix). Each phase needs a `confidenceCheck` (e.g.
   minimum net displacement + minimum sample count) rather than the
   current fixed "5 samples" gate, so a phase can be marked ✓ only once
   it's actually good evidence, not just present.
2. New component `SensorEnrollmentScreen.tsx` (sibling of
   `SensorHandDemoScreen.tsx`, NOT a modification of it — the diagnostic
   lab stays available for engineering use): renders the coverage map
   (Part 12 — a checklist/grid of Arabic labels with ✓ per confidently-
   covered category), lets the therapist re-trigger ONLY an unconfident
   category rather than restarting, ends with a `FREE_PLAY` phase (Part 13,
   30-60s, no phase gate beyond a minimum duration) labeled distinctly in
   the export, and exercises the new recenter/edge-reversal button mid-flow
   per the brief's "tomorrow" checklist.
3. Export shape: same `{capturedAt, role, config, records[]}` shape
   `build_manifest.py` already parses (add `phase: "FREE_PLAY"` and the new
   phase ids to `EXPECTED_PHASES` there) — no new ingestion pipeline needed.
4. `lib/physicalInput/calibrationProfile.ts`'s `envelope: unknown` field is
   already the intended home for a generated RIGHT_HAND profile (noise
   envelope, range/gain, edge behavior, filter params, twist model, sample
   rate/bandwidth, controller version, evidence references — Part 14) —
   it does not need a new type, only a generator function
   (`buildRightHandProfileFromEnrollment(records): CalibrationProfile`)
   that reduces one `FREE_PLAY` + labeled-category session into that shape,
   built from the SAME `analyze_still_noise.py`-style statistics already
   proven tonight, not new arbitrary constants.

Estimated size: one new ~400-line component + ~100 lines of phase-list/
profile-generator additions — a few focused hours with the real sensor
available to sanity-check each new phase's instructions actually read
correctly on a touchscreen, which tonight's hardware-off constraint
specifically ruled out doing properly.

### Display pointer transport (Part 16)

**Current state, already Firebase-Realtime-Database-based, already NOT raw
telemetry**: `SensorPointerDisplaySync.tsx` throttles the shared, already-
filtered `NormalizedPointer` (never raw IMU samples) to at most 20Hz
(`MIN_PUBLISH_INTERVAL_MS = 50`) and skips a write below a `MIN_MOVEMENT`
threshold. Control itself renders the same pointer un-throttled, at full
BLE sample rate (currently 50Hz), directly from local React state — no
Firebase round-trip on that side at all.

**Is 20Hz now the limiting factor?** The component's own existing doc
comment already documents WHY 20Hz was chosen over the previous ~11Hz:
combined with `SensorHandCursor`'s 75ms CSS transition, 20Hz (50ms between
updates) keeps each new position arriving before the previous transition
finishes, which is what makes it read as continuous motion rather than
discrete hops — the same logic a 30fps video reads as smooth playback
against display refresh, not because every intermediate frame exists.
Going to 50Hz over Firebase RTDB would mean 2.5x the write volume for a
value the CSS transition already smooths out at the receiving end — likely
a cost/complexity increase for a improvement below the threshold a
projector viewer could perceive, given the transition is already
absorbing the gap. **This was not re-measured against real hardware
tonight** (no sensor); the existing 20Hz choice already has doc-commented
reasoning behind it and nothing found tonight contradicts it.

**If a future measurement DOES show visible stepping on real hardware**:
before assuming Firebase RTDB itself is the bottleneck, first rule out the
CSS transition duration and the therapist/child devices' actual network
RTT (RTDB write-to-read latency is dominated by round-trip to Firebase's
servers, not by the write itself) — a same-LAN clinic setup could
alternatively use a `BroadcastChannel`/`WebRTC DataChannel` peer transport
between Control and Display if they're proven to share a local network
reliably, but that is a real architecture change (new failure modes:
peer discovery, NAT/firewall behavior on the clinic's actual network) that
deserves its own explicitly-approved task, not a same-night swap under "no
hardware to verify against."

### Benchmark suite additions (Part 17)

The existing Python replay suite (`replay_gate.py`, `full_validation_gate.py`,
`validate_full_pipeline.py`) already scores still jitter, hold stability,
tiny/slow/fast tracking ratio, and twist contamination against the 3 real
sessions — see FINDINGS.md. It does NOT yet score edge-reversal latency,
overshoot, or directional accuracy in isolation, because those are new
requirements from tonight's brief and the 3 existing real sessions have no
labeled edge-saturation phase to replay against (see the enrollment gap
above — the new `عكس_الاتجاه_عند_الحافة_*` phases would supply that).
Tonight's edge-saturation/reversal correctness is instead covered by the
deterministic TypeScript unit tests added to `ContinuousMotionController.
test.ts` (exact, synthetic, not dependent on real capture availability) —
a real-data edge-reversal benchmark should be added to the Python suite
once the enrollment session actually produces a labeled real capture of
someone pushing into and reversing off an edge.
