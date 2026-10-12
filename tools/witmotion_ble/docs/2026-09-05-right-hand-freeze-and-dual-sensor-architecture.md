# 2026-09-05 — RIGHT_HAND freeze + LEFT_HAND/dual-sensor architecture

Both physical WT901BLECL sensors were OFF all night (per the brief). Nothing
below required hardware to build or verify except where explicitly marked
"needs real hardware." No commit/push/deploy, no Firebase rules change, no
unrelated game-logic change, no patient fabrication.

## 1. RIGHT_HAND baseline — FROZEN, not retuned

The accepted, real-gameplay/video-validated RIGHT_HAND implementation is
extracted, byte-for-byte unchanged in behavior, into one frozen config
object so it can never drift by accident while LEFT_HAND work touches
nearby files:

- `lib/physicalInput/SensorHandRuntimeConfig.ts` — `RIGHT_HAND_RUNTIME_CONFIG`
  (filter mode `ADAPTIVE_EMA`, `autoCenter: true`,
  `twistTrackingMode: "ROLL_INVARIANT_TRANSVERSE_FRAME"`, the exact
  2026-09-04 real twist-invariance `crossAxisCalibration` matrix, the exact
  long-standing `shumos:sensor:right-hand:deviceId` localStorage hint key).
- Regression lock: `lib/physicalInput/__tests__/SensorHandRuntimeConfig.test.ts`
  — fails loudly if any of those specific values ever change without an
  explicit, reviewed reason.
- The RIGHT_HAND connection/reconnect/rate-bump/recenter/filter-selection
  state machine itself was extracted verbatim (no behavior change) from
  `SensorRuntimeProvider.tsx`'s old inline effect into
  `components/control/sensors/useSensorHandRuntime.ts`, a role-parameterized
  hook BOTH RIGHT_HAND and LEFT_HAND now instantiate independently — see
  "dual-sensor architecture" below. `useSensorRuntime()` (RIGHT_HAND's own
  hook, read by every existing game) keeps the exact same name/shape/return
  type; no call site anywhere in the app changed.
- Frozen and covered by existing/extended tests: 50Hz/20Hz bandwidth
  handling (`WitmotionBleProtocol.ts`, unchanged), roll-invariant transform
  (`ContinuousMotionController.ts`, unchanged), stabilization
  (`StabilizationProfiles.ts`, unchanged), hold behavior, twist handling,
  edge saturation/reversal (`ContinuousMotionController.test.ts`, unchanged),
  auto-center, therapist recenter, reconnect backoff
  (`RECONNECT_DELAYS_MS`, unchanged), shared game integration
  (`useSensorPointerTargets.ts`, unchanged), Control -> Display
  BroadcastChannel fast path (`LocalPointerBroadcastSync.tsx`, additive-only
  change — see section 15), Balloon Quest immediate local feedback
  (untouched).
- Full test suite: 1248/1248 passing after every change tonight (see
  section 18) — zero RIGHT_HAND regressions.

## 2. Official WT901BLECL BLE rename — researched, UNCONFIRMED, nothing executed

See `tools/witmotion_ble/docs/ble-device-rename-notes.md` for the full
citation trail. Summary: WITMOTION's own app/PC utility documents a working
rename feature (always prefixes the entered name with `WT`, ends with a
"Save Config" step), but **no register, BLE command, or SDK method for
setting that name exists** anywhere in WITMOTION's own published register
map, their open-source BLE 5.0 Android SDK, or their BLE 5.0 protocol docs —
checked against three independent official sources. Verdict: **UNCONFIRMED
programmatically** (app-only, not automatable from this codebase without
guessing an unofficial protocol extension). No code was written for this —
per the research task's own branching rule, inventing a plausible-looking
register address without a citable source would be exactly the kind of
"invented, not measured" shortcut this project avoids. No hardware was
contacted.

## 3. Application-level role identity — independent of BLE name

`lib/physicalInput/types.ts`'s `PhysicalRole.RIGHT_HAND`/`LEFT_HAND` (already
existed) is the sole role identity throughout the stack; nothing reads a
device's advertised BLE name to decide its role. Arabic labels:
`SensorHandRuntimeConfig.ts`'s `arabicLabelFor()` — "حساس اليد اليمنى" /
"حساس اليد اليسرى". No CoreBluetooth UUID is hardcoded anywhere in product
code — role identity is a persisted device-id -> role mapping (see below),
learned at runtime, never a hardcoded identity.

## 4. Dashboard readiness — both hands, independent states

`components/control/home/SystemReadinessCard.tsx` now renders one
`HandSensorRow` per hand, each reading its OWN independent
`useSensorRuntime()`/`useLeftHandSensorRuntime()` — pure function
`deriveSensorRow()` (unchanged) computes each row's state
(غير متصل/جاري الاتصال/متصل + Hz/جاري إعادة الاتصال) from that hand's own
state only. One hand's connecting/error state cannot affect the other row
(each row is a separate component instance reading a separate context).
"خطأ"/"يحتاج إعداد" states are covered by `SensorRuntime.error` and the
`NEEDS_RECALIBRATION` calibration status respectively (both already modeled
in `PhysicalInputManager`/`CalibrationStatus`); not yet surfaced as
dashboard row text distinct from "غير متصل" — a small future copy addition,
not an architecture gap.

## 5. First-time role assignment + persistence

- `lib/physicalInput/roleAssignment.ts`: `assignRole()` now refuses in BOTH
  directions — a different device already owning the requested role
  (pre-existing), AND (new tonight) the SAME device already owning a
  DIFFERENT role — closing the "accidentally assign one physical sensor to
  both hands" gap. `clearRoleAssignment(store, role)` is the only sanctioned
  way to free a role for reassignment (the "استبدال" flow).
- `LocalStorageRoleAssignmentStore` (new): persists the device-id -> role
  map in localStorage, survives reload/restart — tested for exactly that
  (`roleAssignment.test.ts`).
- `useSensorHandRuntime.ts` calls `assignRole()` automatically the instant
  ANY connect succeeds (manual, silent-authorized, or auto-reconnect),
  confirming a device's role on every ordinary connect and REFUSING +
  immediately disconnecting when a device already belongs to the other
  role — even if that other role is currently offline (checked against the
  PERSISTED map, not just live connection state).
- `components/control/sensors/SensorRoleAssignmentControls.tsx`: the "تم
  العثور على حساس جديد" / "[اليد اليمنى] [اليد اليسرى]" confirmation prompt
  component, and the "استبدال حساس اليد اليمنى/اليسرى" buttons (clear both
  the persisted role AND that role's Wt901BleInputSource hint key, so a
  replaced sensor's old identity never keeps winning the "prefer last-known
  device" reconnect race).

## 6/7. Dual SensorRuntime architecture — one engine, two independent instances

`components/control/sensors/useSensorHandRuntime.ts` is the ONE reusable
implementation; `SensorRuntimeProvider.tsx` instantiates it twice (RIGHT_HAND
with the frozen config, LEFT_HAND with its own independent config) sharing
no state whatsoever: independent `Wt901BleInputSource` (own hint key), own
`PhysicalInputManager`, own `ContinuousMotionController`
(`CalibrationProfile`), own connection/reconnect/recenter state. Each
role's `Wt901BleInputSource` excludes the OTHER role's currently-connected
device id from both its silent and manual connect paths
(`excludeDeviceIds`), on top of the persisted-role guard in section 5 — two
independent layers against one physical sensor ever serving both roles.
`useSensorRuntime()` (RIGHT_HAND) and `useLeftHandSensorRuntime()`
(LEFT_HAND) are exposed separately, plus `useDualSensorRuntime()` for UI
that genuinely needs both (dashboard, role-assignment, recenter-both).

## 8/9. LEFT_HAND enrollment UI + pre-capture sanity check

- `lib/physicalInput/LeftHandEnrollmentPhases.ts`: one combined phase list
  (reusing `MOTION_DIAGNOSTIC_PHASES` + `TWIST_INVARIANCE_PHASES` +
  `EDGE_REVERSAL_PHASES`, plus two genuinely new phases —
  `hold_naturally` and `small_natural_shake`) covering every category
  tonight's brief lists: connection/assign/Hz (screen-level, not a phase),
  recenter, up/down/left/right/diagonal, hold, tiny, small natural shake,
  wrist roll normal/45°/90°, recenter, edge/reversal (all four), free play.
- `components/control/sensors/LeftHandPreCaptureCheck.tsx`: hard gate
  requiring an explicit human confirmation that physical
  UP/DOWN/RIGHT/LEFT match on-screen UP/DOWN/RIGHT/LEFT before any
  recording starts; marking any direction wrong blocks continuing and shows
  a concrete diagnosis checklist + retry, never silently saving mislabeled
  data.
- `components/control/sensors/LeftHandEnrollmentScreen.tsx` +
  `app/control/left-hand-enrollment-session/page.tsx`: the guided capture
  wizard itself (mirrors the existing, real, working
  `RightHandFinalSessionScreen.tsx` mechanics — explicit "التالي" stepping,
  no automatic timers — built by a delegated, precisely-scoped task against
  that same file's pattern; see this session's own build log for exact
  diff). Tags every exported record with `role: "LEFT_HAND"`.

## 10. Dual-sensor simulation — all 13 lettered scenarios (A-M) passing

`lib/physicalInput/__tests__/dualSensorSimulation.test.ts` (15 tests, all
passing): A/B (one hand only), C (both simultaneously, full isolation),
D/E (one disconnects, other continues unaffected), F/G (reconnect restores
the correct independent role/calibration status), H/I (concurrent movement,
one held while other moves), J (independent jittered sample timing never
misroutes), K (a stale packet after unassignment is dropped, never
misrouted), L (role assignment persists across a simulated reload and
drives real manager wiring), M (duplicate role/device assignment refused in
three sub-cases: same device two roles, second device stealing a role,
explicit-replace-only flow).

## 11/12. Dual-hand pointer model + visual differentiation

Two independent logical pointers already exist structurally (RIGHT_HAND's
and LEFT_HAND's `NormalizedPointer`, each from its own
`ContinuousMotionController`) — `useDualSensorRuntime()` is the reusable
access point a future game can read from however it chooses (right-only,
left-only, both, therapist-selected). `SensorHandCursor.tsx` gained an
OPTIONAL `handRole` prop (omitted = byte-identical rendering to before) —
LEFT_HAND gets a violet color, a mirrored icon, AND a small "ي"/"د" text
badge (never color alone, for colorblind accessibility). Not enabled in any
production game yet, per the brief's own "not until dual-hand real
validation passes."

## 13/14. Recenter controls + disconnect isolation

`components/control/sensors/DualHandRecenterControls.tsx`: three buttons
("إعادة تعيين اليد اليمنى/اليسرى/اليدين"), each calling ONLY that role's own
`ContinuousMotionController.recenter()` — no shared state, no score/session
touch. Disconnect isolation proven in `PhysicalInputManager.test.ts`
(pre-existing) and freshly in `dualSensorSimulation.test.ts` scenarios D/E/F/G
above: a disconnect nulls only that role's pointer and cancels only that
role's detector state; reconnect restores the correct role/calibration
independently, with zero phantom action.

## 15. Shared display fast path — dual-hand ready, not yet switched over

`lib/display/LocalPointerChannel.ts`'s `LocalPointerMessage` now carries a
`role: "RIGHT_HAND" | "LEFT_HAND"` field (existing single-hand consumer
ignores it — zero behavior change for today's RIGHT_HAND-only display path).
`lib/display/DualLocalPointerDemuxer.ts` (new, fully unit-tested, 6/6
passing) implements "latest sample wins PER HAND, not globally" — a burst
of newer RIGHT_HAND messages provably cannot make a still-valid LEFT_HAND
sample stale, and vice versa. `components/display/useDualLocalPointerChannel.ts`
wraps it with the same rAF-paced commit pattern as the existing single-hand
hook. Deliberately NOT wired into `DisplayScreen.tsx` yet — mounting a
second (LEFT_HAND) publisher onto the shared channel is only safe once the
DISPLAY side also reads through the dual-aware hook; doing that swap
without a real second sensor to verify against would be exactly the
"shipped untested against reality" mistake this project's conventions
avoid. Firebase fallback architecture and rules: untouched.

## 16. Performance

No new global context, no new full-tree re-renders: each role's
high-frequency pointer state lives in its own `useSensorHandRuntime`
instance (separate React state, separate context), exactly mirroring the
existing RIGHT_HAND isolation. Diagnostics per hand already exist via each
`SensorRuntime`'s own `liveRateHz`/`connection`/`sample`; render-Hz/packet-age
diagnostics exist on the (not-yet-wired) `useDualLocalPointerChannel`'s
health tracking, mirroring the existing single-hand
`useLocalPointerChannel`'s `LocalPointerDiagnostics`. No BroadcastChannel
throughput measurement was possible tonight (no real second sensor
producing ~50Hz traffic) — the demuxer's logic was verified correct at
the message level, not load-tested.

## 17. Dataset/profile storage — role-separated, LEFT_HAND additive only

`tools/witmotion_ble/real_dataset/build_manifest.py`'s `sensorRole` field
already reads `role` generically from each raw capture's own JSON, so
LEFT_HAND captures are indexed without touching any RIGHT_HAND data (no
existing raw file, manifest entry, or profile was overwritten tonight — see
git status, only new files were added). LEFT_HAND's own session-directory
naming convention (`left_hand_adult_sim_<date>_01`, mirroring RIGHT_HAND's)
was already specified in `tools/witmotion_ble/docs/left-hand-phase2-plan.md`
before tonight. KNOWN GAP: `build_manifest.py`'s phase-taxonomy classifier
(`EXPECTED_PHASES`/`EXPECTED_TWIST_INVARIANCE_PHASES`) has no entry yet for
LEFT_HAND's new COMBINED phase set (`LEFT_HAND_ENROLLMENT_PHASES` mixes
categories the Python side currently classifies as three separate session
kinds) — a real LEFT_HAND capture would still be indexed and readable, just
possibly labeled AMBIGUOUS/TRUNCATED quality rather than USABLE until that
classifier gets its own LEFT_HAND_ENROLLMENT branch. Small, scoped, deferred
rather than rushed blind.

## 18. Tests / typecheck / build

`npx vitest run`: 1253/1253 passing across 95 test files (up from 1233
before tonight — 20 new tests added, zero removed or weakened). `npx tsc
--noEmit`: clean. `npx eslint .`: clean (two real issues caught and fixed —
see below). `npx next build`: succeeds, 26 routes including the new
`/control/left-hand-enrollment-session` (up from 25). Every new piece has
real unit tests (roleAssignment, Wt901BleInputSource, SensorHandRuntimeConfig,
dualSensorSimulation, DualLocalPointerDemuxer, LeftHandEnrollmentPhases,
LeftHandEnrollmentProfile) — no existing test was weakened or deleted to
make anything pass; five real bugs were found and fixed via TDD/lint in the
process (see "bugs found tonight" below).

## Bugs found and fixed tonight (not pre-existing regressions — caught before shipping)

1. `roleAssignment.ts` imported `PhysicalRole` via `import type`, but
   `LocalStorageRoleAssignmentStore.get()` needs it as a runtime value (the
   `in` operator) — silently threw and was swallowed by a try/catch,
   returning `null` for every stored role. Fixed by using a value import.
   Caught by a failing new test before this file was ever wired into the
   live connect path.
2. `assignRole()` did not refuse assigning the SAME physical device to a
   SECOND role — exactly the "M: duplicate device/role" gap tonight's brief
   calls out explicitly. Fixed (see section 5).
3. `SensorRuntimeProvider.tsx`'s first draft of the cross-role device
   exclusion had a temporal-dead-zone bug (`leftHand` referenced before its
   `const` declaration in the same expression used to construct
   `rightHand`) — caught immediately by `tsc`/would have thrown at runtime;
   fixed by moving both device ids into `useRef`s written after both hook
   calls.
4. Both `SensorRuntimeProvider.tsx` and `useSensorHandRuntime.ts` read/wrote
   a ref's `.current` directly during render (to always resolve the OTHER
   role's latest known device id without an extra re-render) — flagged by
   `eslint`'s `react-hooks/refs` rule as unsafe under React's rules. Fixed
   by moving every such write into its own small `useEffect` and building
   the stable accessor closures via `useMemo(() => fn, [])` instead of
   `useRef(fn).current` — same runtime behavior (the ref is still only ever
   read asynchronously, after any BLE promise resolves), now rule-compliant.
5. `LeftHandEnrollmentScreen.tsx`'s first draft called `setStage(...)`
   synchronously inside a `useEffect` reacting to `runtime.connected` (an
   "avoid setState-in-effect cascading renders" `eslint` finding). Fixed by
   removing the effect entirely and computing the "connect -> direction
   check" transition as plain derived state during render
   (`effectiveStage`), matching React's own "you might not need an effect"
   guidance for state that's a pure function of already-owned state.

## 19. Exact return-flow instructions

See the final Arabic report's item 20 for the literal 7-step Arabic
instruction sequence this was all built to enable.
