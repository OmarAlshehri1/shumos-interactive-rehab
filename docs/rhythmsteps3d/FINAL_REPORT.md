# نبض الألوان · Rhythm Steps 3D — Final report

Branch `feature/rhythm-steps-3d` (git worktree `../shumos-rhythm-steps`, from `e6aa5fd`). **Nothing was pushed, deployed or published; Firebase rules were not published.**
Status key: **IMPLEMENTED** · **BROWSER TESTED** · **SIMULATED** · **PHYSICAL HARDWARE UNVERIFIED** · **NOT IMPLEMENTED**

## 1. Architecture (native, no duplicate systems)
- Canonical id `rhythm-steps-3d`, one registry entry (`lib/games/registry.ts`), category FOOT SENSORS only, projection FLOOR, `sensorCompatible:false`. Feature flag `NEXT_PUBLIC_RHYTHM_STEPS_3D` (dev on; production opt-in), same pattern as Safe Hex Arena. IMPLEMENTED, BROWSER TESTED.
- Reuses: the shared `/liveSession` + `LiveRecordPublisher`, controller lease, window ownership/recovery (`lib/liveGame`), `useLiveGameController`, `saveSessionHistoryOnce` + `HistorySaver`, the library launch boundary, the Safe Hex foot-movement detector (hints only), the existing `three` dependency. **No new dependency, Firebase project, session tree, auth, history DB or Bluetooth code.**
- Game code: `lib/rhythmsteps3d/` (config, stages, engine, layout, live, history, useSession, captions), `components/display/rhythmsteps3d/`, `components/control/rhythmsteps3d/`, routes `app/control|display/rhythm-steps-3d`, dev-only harness `app/dev/rhythm-steps-preview`.
- **Gameplay clock** (`engine.ts`): one authoritative `clock` per stage advanced only by `dt × speed` while running. Target position = f(arrival − clock); arrivals sit on a 750 ms beat grid. Pause freezes it; resume re-bases (no jump); speed changes only the rate; Assisted Flow stalls it at the earliest unconfirmed target; "stop new targets" shifts only unseen targets. Display extrapolates with its own time and eases onto each update; Control re-sends the clock every 2 s and on any change (no per-frame writes). Music is scheduled from the same clock (`audio.ts`).

## 2. Nine-stage matrix (all BROWSER TESTED through the touch UI, assisted flow, both devices)
| # | Stage | Content |
|---|---|---|
|1|First Light|8 single targets, same colour in runs of 3, either foot|
|2|Color Switch|10 singles, alternating lanes, optional L/R|
|3|Neon Path|4 three-step sequences on two adjacent lanes (numbered)|
|4|Twin Lights|8 two-foot pairs on adjacent lanes, long preview|
|5|Split Rhythm|10 "one foot stays (hollow marker), other moves", alternating sides, therapist-chosen anchor lane|
|6|Color Patterns|patterns of single/both/two-foot steps shown twice|
|7|Energy Hold|4 holds + 2 singles, configurable duration, ring|
|8|Dual Flow|12 alternating single / two-foot, optional jump|
|9|Neon Championship|16 mixed (single, two-foot, split, hold, both-feet), optional faster, final celebration|

Exercise types: single (either/left/right), both feet on a square, two-foot adjacent pair, split, hold, optional jump (off by default, therapist-enabled, step alternative, confirmed manually only). Two-foot pairs are generated only on adjacent lanes (or one apart if the therapist allows), left foot always left of right; unit-tested across every lane set × limb × stance configuration.

## 3. Therapist Control (manual, works with no sensors)
Select stage, start, pause/resume, safety stop (floating), restart and end with confirmation, flow (continuous/assisted), speed profile gentle/comfortable/active/custom, spacing, wait window, lane set (4/3/2), limb participation, stance width, allowed movement types, hold duration, jumping, confirm / assist / skip / repeat, start/cancel/complete hold, stop-new-targets, visual intensity, reduced effects, high contrast, quality, music/SFX/volume/mute, projection calibration (margin, target size, lane spacing, near position, perspective strength, aspect, measured floor size, grid, calibration statement), results summary. Control shows a 2D lane map, never a second 3D scene. A missed target is "unconfirmed", never a failure. IMPLEMENTED, BROWSER TESTED.

## 4. Sensors — what is and is not claimed
No spatial validation exists. WT901 = IMU: no floor position, pressure, single-leg weight-bearing or jump validation. Control says so in the sensor panel and under the lane map. The only sensor path is the existing **simulated** foot-movement detector; it can raise a "movement hint" banner and can never confirm a target, start a hold or count a jump (unit-tested). PHYSICAL HARDWARE UNVERIFIED; no BLE test was run.

## 5. Visual implementation
Procedural only (no downloaded assets, nothing to license): shader floor with lane-tinted light and scrolling panels, white rails with glow, glass near zones (flat, never move/rotate/resize), pooled glass targets with opaque foot decals (Arabic labels يمين/يسار/القدمان/أي قدم/ثبّت/ثبات), instanced glass pillars, floating light bars, gates and prisms per stage theme (9 themes), vanishing-point flare, particles, hit rings/beams/sparks, rising pad dust, stage and final fireworks, optional bloom (high quality only). **Projection safety:** fixed camera; `perspective` slider 0 (top-down) → 100; near zones are depth-compensated so they appear square in the image (unit-tested ±7 % across 4 aspects × 5 perspectives); zones are kept inside the bottom/side safe margins; no holes, cliffs or camera motion. Physical centimetres appear only if the therapist enters a measured width, labelled as an estimate. Fonts: system. Screenshots in `docs/rhythmsteps3d/screenshots/` and `evidence/shots/` (real browser captures of the running game, compared with the owner's reference during iteration; the result is a synthwave-style neon corridor in the reference's palette — it is an approximation of the reference, not a copy, and I judge it less cinematic/glossy than the reference image: no real floor reflections of targets).

## 6. Audio
Synth music + SFX (spawn tick, hit, dual, assist, hold, stage, final); music scheduled from the gameplay clock (unit-tested with a fake audio graph: on-grid, stretches with speed, silent when paused/muted). Needs one click on the Display for browser autoplay (hint chip shown). Real audio output was **not** listened to by me: only the scheduling logic is tested.

## 7. History
Existing save-once path; type `StoredRhythmSession` (`resultVersion 1`, `engine rs3`): counts only (total/confirmed/assisted/skipped/unconfirmed, single/two-foot/hold, repetitions, active time, flow mode, speed profile, settings, per-stage rows). No score/accuracy (rules forbid them). Shown in patient history row/detail and analytics. Walk-in sessions save nothing.

## 8. Tests executed
- `npx vitest run`: **161 files / 2021 tests passed** (14 emulator files skipped by design). New: 56 game tests (engine, config, stages, layout/projection, captions, live codec/recovery, history, library registration, audio scheduling).
- Rules emulator (own emulators 19500/19599, Java 21): `RS_RULES_EMULATOR=1 npx vitest run lib/rhythmsteps3d/__tests__/rules.emulator.test.ts` → 10/10 (ownership, revisions, payload size, create-only history, tamper/score/unknown-field rejection, other games still accepted). Other games' own emulator suites were **not** re-run.
- `tsc --noEmit`: clean (apart from the pre-existing generated-type `LayoutProps` message in a fresh worktree); `eslint` on new code clean; `next build` succeeds.
- Cross-device browser E2E (`docs/rhythmsteps3d/validation/e2e.mjs`): two Chrome processes (iPad-style touch Control, 1920×1080 Display) sharing only local emulators, against the **production build**: **46/46** — publish/Display render, no patient id on the public path, clock agreement, pause/resume, speed change, manual confirm, skip/repeat, stop-stream, assisted stall, Control reload recovery (stays paused, same counts, no re-confirm), Display reload, safety stop, restart, all nine stages by touch (holds in 7 and 9, two-foot in 4–6/8/9), history saved exactly once and not duplicated after reload, no uncaught exceptions.
- Performance (headless Chrome with this Mac's GPU, 1920×1080, bloom on, production build, stages 8–9 played): fps min 60 / median 60 as sampled every 2 s; max per-frame JS time 1.9 ms. **One machine, headless, no projector laptop: not a claim of stable 60 FPS on target hardware.**

## 9. Not tested / not implemented / known issues
- NOT TESTED: physical projector, real floor, real BLE/WT901, real child use, iPad hardware (emulated viewport only), Safari/other browsers, long soak, low-end GPU, listening to audio, Arabic review by a native clinician.
- Observed during E2E, not investigated: Firebase emulator warnings `permission_denied` on `/presence/display` (Display anonymous presence) — Display still connects.
- One earlier full dev-server run had Control auto-enter safety pause at stage 9 (a connection-lost safety by design, under load); not reproduced in the final production run. A `console.warn` now logs such events.
- `reducedEffects` / `highContrast` / `low quality` modes and the calibration grid are implemented and covered by unit logic, but only default-mode screenshots were reviewed visually.
- Library thumbnail is a real Display capture (stage 5).
- NOT IMPLEMENTED: automatic placement/hold/jump validation; beat-synchronised movement requirement (beat is cosmetic); Display event audio per patient; shared multi-game 0–5 visit (future platform work, intentionally absent).

## 10. Integration changes (shared files — minimal, additive)
`lib/games/registry.ts`, `lib/games/library/capabilities.ts`, `components/display/gameDisplayRegistry.tsx`, `components/control/library/gameThumbnails.tsx` + `realGameThumbnails.ts`, `lib/realtime/types.ts`, `lib/realtime/sessionRepository.ts`, `lib/sessions/types.ts`, `lib/sessions/sessionHistoryRepository.ts`, `lib/analytics/patientAnalytics.ts`, `lib/audio/AudioManager.ts` (+ its test type), patient history row/detail, `database.rules.json` (+ copies `docs/release/FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json`, `docs/rhythmsteps3d/DATABASE_RULES_FOR_FIREBASE_CONSOLE.json`), `docs/release/library-evidence/*` (thumbnail + provenance), library tests (counts 13→14).

## 11. Concurrent-work safety and merge sequence
Developed in an isolated worktree from a clean `HEAD`; the main working tree (Codex's uncommitted Castle Legends work) was never edited, no processes of others were touched, own ports only (dev 3620/3621, prod 3622, RTDB 19500, Auth 19599). Files both branches touch (expect textual conflicts, all additive): registry, capabilities, gameDisplayRegistry, gameThumbnails/realGameThumbnails, realtime types/repository, sessions types/repository, patientAnalytics, AudioManager, history row/detail, database.rules.json, thumbnail provenance, library tests. Suggested order: merge Castle Legends first; then merge this branch, keep both entries in each list, re-run my `database.rules.json` edit by hand (rules additions are self-contained blocks: `rhythm-steps-3d`/`rs3`), regenerate both rules copies from the merged `database.rules.json`, set library test counts to the final total, then run vitest + the rules emulator suites. Before commit I excluded the local `.ignore`, `.next-rs*` dirs and the Next-generated `tsconfig.json` change.

## 12. Remaining work
Physical projector calibration pass; real hardware validation before any sensor claim; review of the neon look on the real projector (and against the reference with the owner); native-speaker review of Arabic wording; owner approval before any deploy/rules publish.
