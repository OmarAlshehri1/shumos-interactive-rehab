# Runner Quest 3D — Phase R4 report (foot-sensor input, Control/Display)

**Status: COMPLETE for software. Physical foot-sensor behaviour is NOT validated and is NOT claimed.**

> Everything below that involves a foot sensor ran against **simulated** WT901-shaped sample streams (`lib/runnerquest3d/input/simulatedFoot.ts`). Passing these tests proves the pipeline wiring and the logic; it says nothing about how a real WT901 mounted on a real foot behaves.

## Input-source contract (`input/hub.ts`)
Each session selects exactly one source. Everything else is dropped before it can reach the game:

| Source | Accepts | Maps to |
|---|---|---|
| `KEYBOARD` | keyboard only (←/→/A/D, Space/↑/W; auto-repeat ignored) | lane ∓1 / step |
| `RIGHT_FOOT` | `PhysicalRole.RIGHT_FOOT` samples only | tilt L/R → lane, lift → step |
| `LEFT_FOOT` | `PhysicalRole.LEFT_FOOT` samples only | same |
| `DUAL_FOOT` | both feet | left foot tilt-left → left, right foot tilt-right → right, lift of **either** foot → step; crossed tilts ignored |

`RIGHT_HAND`, `LEFT_HAND`, handheld controllers and unknown roles are always ignored (counted in `counters.ignoredRole`). In foot modes the keyboard drives the *simulated* sensors, never the game directly. No shared input routing, BLE driver or calibration was touched: the module only `import`s the `MotionSample`/`PhysicalRole` **types** from `lib/physicalInput/types.ts`.

## Foot-action adapter (`input/footRecognizer.ts`)
WT901 orientation/acceleration does **not** give absolute foot position or height, so no height is measured. The adapter detects a **deliberate change in sensor orientation relative to a learned rest pose**:
* learns the rest pose only from a still foot (gyro below `restGyroDps` for `settleMs`); movement during warm-up restarts the window, so a gesture can never become the baseline;
* `TILT_LEFT/RIGHT` = roll deviation beyond `tiltDeg` (15° default), `LIFT` = pitch deviation beyond `liftDeg` (18°); the dominant axis (normalised by its threshold) wins, so a lift is never also a tilt;
* debounce: must stay beyond threshold `dwellMs` (70 ms), then needs a return below `rearm` × threshold (0.5) and `refractoryMs` (450 ms) before another gesture; a held tilt fires once;
* freshness: > 400 ms without a sample ⇒ stale; `markDisconnected()` forgets the rest pose and requires re-settling (600 ms) after reconnection; **recenter** relearns neutral;
* invalid, duplicate and out-of-order samples are rejected; angles are wrapped at ±180°.
* Sensitivity (×1.4 / ×1 / ×0.7 thresholds) and tolerance (re-arm 0.35/0.5/0.65, dwell 110/70/40 ms, refractory 600/450/350 ms) are therapist settings.

**A real jump is never required.** A lift only *arms* the next hurdle; the hop is an in-game animation timed from the authoritative distance, and the step window is 5–9.5 m wide. Hurdles can also be disabled entirely ("foot lift not required").

### Limitations to settle on hardware
Axis choice and sign (`tiltAxis/Sign`, `liftAxis/Sign`), mirrored signs between left and right feet, threshold values, how seated vs standing mounting changes the signal, mounting position, BLE latency and drop-out behaviour are all **unvalidated assumptions** exposed as configuration (`BASE_CONFIG`). No clinical accuracy is claimed.

## Control/Display synchronisation
* Separate experimental channel `shumos-experimental-runner-quest-3d-v1:` (BroadcastChannel); a single Control owner via Web Locks.
* Messages: `probe → sync`, `state` (on every discrete change, monotonic `revision`), `clock` (125 ms: distance, speed), `ack` (500 ms, includes tab visibility), `closed`. Ordering tuple `[ownerStartedAt, sessionEpoch, runId, revision]`; duplicates, stale and foreign messages are rejected; a lost state triggers a re-sync; a reloaded Control (later `ownerStartedAt`) supersedes the old one.
* Control owns accepted movement, obstacle outcomes, stars and lifecycle. The Display never scores: it receives `armed[]/resolved[]/stars` and regenerates obstacle geometry from the seed. Extrapolation is bounded to 700 ms.
* Suspension: input loss (> 700 ms), Display lost/hidden, scheduling gap (> 500 ms) and a hidden Control tab each suspend play; recovery of a sensor never resumes motion by itself — the therapist resumes, and only after the foot has re-settled.
* No Firebase, no per-frame network writes, no patient data on the wire (test asserts the payload has no obstacle positions or personal fields).

## Validation
* **Unit/integration tests** (`__tests__/input.test.ts` 16, `runtime.test.ts` 23): recogniser (settle, three gestures, hold-once, 60 s noise soak, thresholds, dominance, stale/reconnect, recenter, invalid samples, wrap), hub isolation for all four sources, Control→Display agreement, replica rejection rules, malformed message rejection, input/Display loss, gap, hidden tab, therapist commands.
* **Real browser workflow suite** (`validation/e2e-r4.mjs`, **47/47 PASS**, `results/e2e-r4.json`): keyboard with real key events, simulated RIGHT/LEFT/DUAL foot with isolation, unrelated hand samples ignored, foot lift out of/in the step window, sensor loss → suspended → recovery gating, pause/resume/restart/skip/advance/end with summary on both windows, reduced motion on the Display, Display reload and close/reopen, hidden-window suspension, second Control window blocked by the lock, Control reload, and an **idle child** (runner holds 1.60 m short, 20 s later still playing, Arabic hint shown, acting releases it, therapist assist passes it).
* Screenshots: `screenshots/r4-*.png`, `r3-hold-hint-display.png`.

## What this does not prove
Real WT901 behaviour on feet, BLE jitter/latency/drop-outs, mirrored axis signs, seated vs standing use, and any clinical meaning of the detected motions. See the hardware checklist in the final report.
