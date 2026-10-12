> Unified integration update (12 October 2026): use the final merged `database.rules.json` and `docs/release/FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json` for publication review. Per-game candidates below are historical. See [unified integration report](../unified-integration/FINAL_REPORT.md). Nothing has been pushed or published.

# Balance Bridge 3D — implementation and verification

12 October 2026 · Shumos Care · canonical ID `balance-bridge-3d`

The nine-stage floor adventure runs inside the existing Shumos application. Its progress is therapist-confirmed, its Display reads the shared live session, and its results use the existing immutable patient-history repository. Physical projector, foot-device, and audible speech validation have not been performed. Production activation is deliberately pending separate rules review and owner approval.

## Verification status

| Status | Scope |
| --- | --- |
| **IMPLEMENTED** | Nine 3D environments and routes; start/countdown, pause/resume, stage/level selection, widths, foot guidance, assistance, repeat, skip, holds, deviation feedback, replay, safe restart/end, results; optional foot BLE connection panels; shared registry/library, ownership, Display, history, calibration, and visit-result identity integration. |
| **BROWSER TESTED** | All nine stages in native Control and independent Display contexts against a local Firebase emulator; assisted and skipped checkpoints; two therapist-started holds; pause and reload recovery; deviation feedback; immutable history; restart result keys; patient detail UI; rotation, calibration import, reduced effects, low quality, mobile layout; no-device foot modes and foreign-activity protection. |
| **SIMULATED** | Demo patient/staff accounts; therapist actions automated by Playwright; constructed normalized IMU samples in unit tests. Speech upstream requests were intercepted locally. These are software tests, not observations of a child's gait. |
| **PHYSICAL HARDWARE UNVERIFIED** | WT901 devices worn on feet, real BLE pairing/drop/reconnection, two-device foot throughput, projector brightness and physical dimensions/keystone, actual foot placement, audible Arabic speech and sound output, and child/therapist usability. Four simultaneous BLE devices have not been validated. |
| **NOT IMPLEMENTED** | Validated absolute floor tracking, pressure/weight distribution, automatic checkpoint or water-contact detection, imported console-grade hero assets, and nine separate continuous ambient soundscapes. Spatial/pressure inference is intentionally absent from this IMU game. |

## Architecture and preservation

`lib/balancebridge3d/` holds the reducer, stage definitions, configuration, wire validation, session hook, history builder, launch guard and advisory sensor adapter. `components/balancebridge3d/` holds the Three.js renderer, shared view, therapist UI, optional foot telemetry and thumbnail fallback.

- Control: `/control/balance-bridge-3d`; Display: existing `/display` resolver.
- Local development harness: `/dev/balance-bridge`, using the same reducer and renderer. It clearly identifies local preview mode and does not save patient records or publish a clinical session.
- Shared `useLiveGameController`, `LiveRecordPublisher`, controller lease, per-tab ownership, heartbeat, private patient binding, recovery and `HistorySaver` are reused. The canonical session is `engine: bb3`, version 1, in `/liveSession`; there is no second session store.
- Running sessions recover paused. Network loss freezes the activity and requires explicit resume.
- Existing `GameSafetyProvider` prevents mounting another activity over a recoverable session. Bridge also checks foreign activity completion and its exact immutable patient result before publishing, and relinquishes publication if another canonical activity takes the channel.
- History remains `/sessions/{patientId}/{sessionId}`. Restarted runs receive `-rN` result keys. Walk-ins do not invent a patient record.
- The generic visit provider uses the existing saved result. The shared history-key helper now understands `bb3` restart suffixes. Active-visit linking is implemented through that existing workflow; a new active-visit browser scenario was not exercised here.

The working tree contained substantial pre-existing changes. No reset, unrelated commit, push, deployment, or production-rule edit was performed. Integration edits preserve those changes. Development/build artifacts use isolated `.next-balancebridge*` directories and `tsconfig.balancebridge.json` to avoid other servers' generated caches. ESLint ignores generated Next.js directories and recognizes existing CommonJS browser-evidence scripts.

## Nine-stage matrix

Every route has a start, destination, ordered checkpoint sequence, illuminated current target, footprints, arrows and therapist-controlled advancement. Holds default to disabled and are enabled only by therapist configuration.

| Level / stage | Environment and route | Movement goal | Checkpoints / optional hold indices* | Environmental reward |
| --- | --- | --- | --- | --- |
| 1 / 1 | Sunny Wooden Bridge: textured individual boards, posts, shallow turquoise stream, lily pads, flowers and leafy banks; straight route | Comfortable forward movement | 5 / none | Warm checkpoint light and stream-side sparkles |
| 1 / 2 | Flower Garden: flowering trees, garden pools and fountains, stone-colored curved path | Walking and stopping | 6 / 2, 4 | Flower illumination and butterfly movement |
| 1 / 3 | Golden Beach: sand, palm canopies, shells, foam edge and calm water; broad left/right turns | Introductory turns | 6 / none | Water shimmer and warm sparkle feedback |
| 2 / 1 | Frozen Lake: snow-covered pines, decorative ice fractures and crystal clusters; alternating route offsets | Deliberate placement using selected guidance | 6 / 3 | Cool pond illumination and pale sparkles |
| 2 / 2 | Butterfly Forest: shaded woodland, flowers, rocks and woodland pools; winding route | Turns with optional stops | 7 / 2, 5 | Butterflies move around the progressing route |
| 2 / 3 | Crystal Valley: three crystal colors, pastel terrain and rocks; varied target positions | More precise placement within therapist-selected width | 7 / 2, 4 | Crystal emissive intensity increases with confirmations |
| 3 / 1 | Cloud Garden: soft ground-level cloud forms, rainbow-colored flowers and fountains; connected turning sections | Therapist-selected left-first or right-first sequence | 7 / 3 | Cloud/fountain illumination and magical particles |
| 3 / 2 | Luminous Night Garden: blue/teal ground, glowing flowers, firefly-like creatures and lit route edges | Alternating directions and stopping | 7 / 1, 3, 5 | Flower glow and gentle luminous particles |
| 3 / 3 | Magical Castle Bridge: wooden approach, towers, banners, fountains and sunset colors | Combination of walking, turns, placement and optional holds | 7 / 2, 5 | Golden details, moving particles and shared celebration chord |

\* Indices are zero-based implementation indices, not physical coordinates.

The camera is fixed and orthographic, essentially directly overhead. Water, ice and cloud forms are shallow decorative scenery around a continuous safe-looking surface. No falling, slippery-floor physics, raised equipment, abyss, jumping, speed failure, or unsupported balance requirement is introduced. Vegetation, crystals and fountains are kept clear of the configured route. Art is original procedural browser 3D; console-reference fidelity has not been certified and remains subject to owner art review.

## Therapist controls and accessibility

The stage grid selects both level and stage. Width options are wide, standard, narrower and measured custom; movement options adjust guidance without automatically forcing a narrow stance. Guidance includes right, left, alternating, either, both and neutral feet.

Checkpoints accept confirmed, assisted or skipped outcomes. Duplicate/stale confirmation tokens are rejected. Repetition restarts the current pending checkpoint's attempt and hold guidance, preserving earlier confirmations. A deviation is an explicit therapist action, with a soft ripple/light response, pleasant chime and Arabic return-to-path cue.

At a configured hold marker, the therapist first presses **بدء الثبات عند الوصول** after observing arrival. Only then does the timer count. Pause suspends it, a long timer stall contributes at most 250 ms per tick, and elapsed time never automatically confirms success. The final confirmation remains manual. Stance correctness is not inferred from quiet IMU data.

Walking is untimed. Assistance, repetition, skip, pause and reduced effects are available. The existing visit exercise blocks can record alternative activities; the game does not prescribe a universally safe exercise or certify a child's ability.

Restart requires ending an already-started session first; patient results must be saved before restarting. Safe ending includes an explicit reminder to stop the child in a safe place.

## Foot sensors

The optional connection panels instantiate the existing `useSensorHandRuntime` with independent **RIGHT_FOOT** / **LEFT_FOOT** configurations and distinct device-hint keys. Despite its historical hook name, the shared runtime is parameterized by `PhysicalRole` and uses the existing WT901 source, normalized samples, role-assignment store, reconnect and cleanup behavior.

No hand calibration matrix is copied and no foot pointer is projected. Only advisory IMU motion/rest status is shown. Invalid/future/stale sample times and nonfinite gyroscope values are rejected; disconnection displays unavailable data. Foot panel polling uses the same monotonic clock as the WT901 normalized samples. Neither the telemetry component nor the hint adapter has a game-command callback.

Only the selected foot endpoints mount. Active/connecting/reconnecting hand roles prevent foot endpoints from mounting; connected device identities are excluded from the opposing role. Physical four-device readiness is not claimed. Foot-mode manual play was browser-tested with no connected device, and real sensor pairing remains unverified.

## Calibration

The latest valid shared FLOOR profile supplies measured width/height, rotation and safe inset. Control publishes these settings in the existing session so Display uses the same geometry. Custom width accounts for the shared 16:9 play stage, the 14:8 orthographic field, letterboxing and quarter-turn rotation.

Without both measured dimensions, widths remain visual percentages and no centimeter equivalence is claimed. Widths are bounded to 7–28% of the field; a requested centimeter width outside those bounds is constrained. The UI reports effective percentage. Profile target/spacing controls are not substituted for the game's authored route. Real projector dimensions, perspective/keystone and safe individual movement width still require on-floor therapist verification.

Browser evidence includes a 500 × 300 cm *configured test profile*, 90° rotation, a 60 cm requested width, reduced effects and economic quality. These values are test inputs, not real measurements.

## Audio

Shared `AudioManager` handles Arabic introduction, countdown, occasional milestones, replay, stage/end messages and procedural chimes/celebration. Introduction keys include run identity, and the configured audio flag and shared mute setting are respected. No separate TTS engine or automatic paid prefetch for this game was added. Existing browser gesture requirements remain in force. Continuous per-biome ambience and physical audible validation remain outstanding.

## Results, history and library

One registry identity supplies Arabic **الجسر المتوازن**, English **Balance Bridge**, FLOOR projection and FOOT membership. Skill tags are balance and feet, describing intended activities. The historical Arabic name is retained when launching is disabled.

Results store stage/level, selected movement configuration, route-direction choice, width and measured field settings; attempt counts, confirmed/assisted/skipped checkpoints, therapist-confirmed deviations, hold completions, elapsed active time and completion state. Path kind is defined by the version-1 stage matrix. Attempts include therapist-requested repetitions and skips. A resolved stage containing skips is not counted as fully completed. No clinical accuracy, pressure or effectiveness score is invented.

The library thumbnail is an optimized 1280 × 720 WebP derived from the native Display's actual renderer frame buffer. It contains no stock artwork or HTML development overlays. Provenance is appended to the existing library manifest.

## Evidence

- [Native nine-stage workflow and metrics](evidence/native-browser.json)
- [Calibration, rotation and mobile checks](evidence/calibration-browser.json)
- [Foot modes and cross-activity ownership](evidence/foot-ownership-browser.json)
- [Clean gameplay pixels](evidence/thumbnail-source.png)
- [Rotated floor layout](evidence/rotation-90.png), [mobile Control](evidence/mobile-control.png), [patient history](evidence/patient-history.png)
- [Foot panel](evidence/foot-panel.png), [protected foreign session](evidence/foreign-session-blocked.png)

| Sunny bridge | Garden | Beach |
| --- | --- | --- |
| [Stage 1](evidence/stage-1.png) | [Stage 2](evidence/stage-2.png) | [Stage 3](evidence/stage-3.png) |
| [Stage 4: frozen lake](evidence/stage-4.png) | [Stage 5: forest](evidence/stage-5.png) | [Stage 6: crystals](evidence/stage-6.png) |
| [Stage 7: clouds](evidence/stage-7.png) | [Stage 8: night](evidence/stage-8.png) | [Stage 9: castle](evidence/stage-9.png) |

## Tests and performance

- Full Vitest run with the game enabled: **2,029 passed**, **107 skipped**. Skipped hardware/emulator suites are not counted as successful tests.
- Focused Bridge tests cover all routes, holds, pause, duplicate tokens, repeat/deviation, recovery, validation, widths, run history, sensor-role/time isolation and foreign-session protection.
- Three separate local emulator-rule checks pass: owner/unauthorized access, competing tabs/revisions and immutable private patient history.
- Native browser: nine functioning stages and 16 workflow checks, no `pageerror` events. Additional calibration/mobile and foot/ownership scenarios also report no page errors.
- Typecheck and enabled production build pass. ESLint has **0 errors**, with one existing unused-variable warning in `docs/clinical-upgrade/qa/browser.cjs`.
- A CPU-heavy existing Space Pilot flight test timed out during parallel build/testing; it passed independently and in the final serial full-suite run.
- GPU browser observations in the nine-stage workflow were **60 FPS in each recorded stage** and **139–161 draw calls** in the final run. Earlier GPU runs varied between 37 and 60 FPS during concurrent work. The first unbatched software-renderer attempt was about 3 FPS/1,216 calls. Static scenery, petals, grass, crystals and footprint parts are now batched/instanced; geometry/material/texture and renderer lifetimes are disposed on replacement. These are local browser observations, not projector or connected-foot-device performance guarantees. Current captures/metrics are in the JSON evidence.

No heavy rendering dependency was installed. Stage changes construct only the active environment; materials/geometries are shared within that scene, and high/economic quality and reduced effects are available.

## Activation and remaining work

Production defaults to disabled. After owner review of the candidate rules and physical safety/visual/audio checks, enabling requires `NEXT_PUBLIC_BALANCE_BRIDGE_3D=true`. Development defaults to enabled; use the isolated local emulator setup for testing, not a production clinical backend without the reviewed game rules.

`CANDIDATE_DATABASE_RULES.json` is an **undeployed review artifact** generated from the current shared rules by `build_candidate_rules.py`. Regenerate and review it against the latest shared changes before any approved merge/deployment. This task did not deploy or edit production rules.

Remaining validation: physical WT901 foot pairing/drop behavior and throughput; actual projector layout/contrast/physical scale; spoken instructions and browser audio unlocking on the clinic machine; child/therapist usability and art approval; and a dedicated active-visit browser linkage scenario. Additional handcrafted environmental assets, foliage animation and individual biome ambient sound design can raise fidelity further. No validated clinical effectiveness is claimed.

## Reproducing the software checks

Use `npx tsc --noEmit -p tsconfig.balancebridge.json`, `NEXT_PUBLIC_BALANCE_BRIDGE_3D=true npm test`, and `npm run lint`. Build with `NEXT_PUBLIC_BALANCE_BRIDGE_3D=true SHUMOS_BUILD_DIR=.next-balancebridge-production SHUMOS_TSCONFIG=tsconfig.balancebridge.json npm run build`.

The browser scripts in `validation/` use only loopback `127.0.0.1`, demo Firebase namespace `demo-balance-default-rtdb`, Database/Auth emulator ports 19940/19949 and the isolated dev server on 3399. Provide `PLAYWRIGHT_MODULE` if Playwright is installed outside the project. Native workflow seeds a local QA staff account and patient; calibration and foot scenarios reuse those fixtures. No physical Bluetooth chooser is opened by automated tests. Emulator-rule tests use a separate namespace and `BALANCE_RULES_EMULATOR=1`.
