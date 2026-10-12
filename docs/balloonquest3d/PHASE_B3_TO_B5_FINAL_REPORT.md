# Balloon Quest 3D — Phases B3 → B5: final report

| Phase | Status |
|---|---|
| **B3 — gameplay engine, therapist Control, child Display, experimental sync** | **COMPLETE** |
| **B4 — multi-input integration** | **COMPLETE (software acceptance).** Only RIGHT_HAND has any prior hardware validation; LEFT_HAND / both hands / foot / handheld are simulation-tested only and labelled experimental. |
| **B5 — validation and release preparation** | **COMPLETE (software).** No physical hardware, real projector or production deployment was involved. |

Detail reports: `PHASE_B3_REPORT.md`, `PHASE_B4_REPORT.md`, `PHASE_B5_REPORT.md` (same folder). Evidence: `validation/`, `screenshots/`, `video/`.

**Try it** (dev server running; sign-in is bypassed in local mode): open `/display/balloon-quest-3d-prototype` in one window and `/control/balloon-quest-3d-prototype` in another window of the **same browser**. Pick *لوحة المفاتيح* (keyboard) and press *ابدأ*, or use the simulator pad / a connected RIGHT_HAND sensor. Both routes are development-only (404 in production).

## 1. Implemented gameplay
A new, isolated Balloon Quest engine (`lib/balloonquest/`) — 3 levels × 3 stages, deterministic, clock-driven, with no timer and no failure state. Stationary balloons in Easy (selected balloons vanish; replacements appear only in a *different* free slot); continuous rise from below in Medium and Advanced (popped balloons never return; new ones enter from below; balloons leaving the top are replaced); the requested colour is always available or reappears within seconds; wrong colours only cue gently (balloon stays, nothing deducted); selections score exactly once; pause and every automatic hold freeze the simulation exactly. The therapist controls level/stage, scope, size, speed, count, colours, contact tolerance, wall/floor, reduced motion, input mode, auto-advance, start, pause/resume, restart, skip, next, end, new run/session — in Arabic.

## 2. The nine stages
| # | Stage | Motion | Goal | Colours | In play | Rise (s) |
|---|---|---|---|---|---|---|
| 1–3 | Easy 1/2/3 | stationary | 3 / 4 / 5 | 3 (red, blue, yellow) | 5 / 6 / 6 | – |
| 4–6 | Medium 1/2/3 | rising | 4 / 5 / 6 | 5 (red, blue, green, yellow, purple) | 6 / 7 / 7 | 42 / 40 / 38 |
| 7–9 | Advanced 1/2/3 | rising | 5 / 6 / 7 | 7 (black, white, green, blue, yellow, red, purple) | 7 / 8 / 8 | 33 / 31 / 29 |

## 3. Visual improvements
The approved B2 look is used unchanged for balloons, sky, clouds and the Arabic HUD (volumetric SVG balloons with outline/halo so black and white stay visible, optional shape symbols, no leaves/birds/"stand here"). New on top: complete child scenes (ready, paused "استراحة قصيرة", hold "لحظة من فضلك…", stage-complete with stars, session-complete), a gentle wrong-colour sway, a pure-CSS "أحسنت!" toast, a floor layout that moves the HUD to the far band and keeps the near edge clear, and a static fallback for reduced motion. No technical text ever appears on the child screen.

## 4. Input integrations
A narrow typed adapter layer (`PointerSample` → `InputHub` → per-source contact gates → `selectBalloon`). RIGHT_HAND: the existing final normalised pointer, existing `ContactActivationGate`, recenter priming, 250 ms freshness. LEFT_HAND and both hands: read from the existing second runtime, experimental. Foot and handheld: adapter interface, explicit floor/wall coordinate mapping and compatibility requirements; simulation only; no BLE code, no new library. Keyboard (real key events) for development. Input loss holds play after 600 ms and auto-resumes after 300 ms of fresh input without a phantom selection. Details: `PHASE_B4_REPORT.md`.

## 5. Files
**Created (all new; nothing existing was edited):**
* Engine and runtime — `lib/balloonquest/{types,rng,stages,geometry,spawner,session,colors,arabic,protocol,replica,controlRuntime,controlMount,displayMount}.ts`, `lib/balloonquest/input/{types,hub,pipeline,keyboard,simulated}.ts` (≈ 2,300 lines).
* Tests — `lib/balloonquest/__tests__/{session,runtime,input}.test.ts`, `harness.ts`, `helpers.ts` (≈ 1,070 lines, 79 tests).
* Child UI — `components/display/balloonquest3d/game/{BalloonStage,GameHud,Scenes,BalloonQuest3DDisplay}.tsx`, `game.css`.
* Therapist UI — `components/control/balloonquest3d/{BalloonQuest3DControl,HandInputBridge,SimulatorPad}.tsx`.
* Routes (development only) — `app/control/balloon-quest-3d-prototype/page.tsx`, `app/display/balloon-quest-3d-prototype/page.tsx`.
* From the approved B2 phase (re-used) — `components/display/balloonquest3d/preview/*`, `app/display/balloon-quest-visual-preview/page.tsx`.
* Documentation and evidence — `docs/balloonquest3d/` (reports, screenshots, video, validation scripts and results).

**Modified: none.** (`git diff` of every tracked file is byte-identical to the start; Space Pilot 3D's files and all uncommitted changes were left alone.) The only reads of shared production code are `ContactActivationGate` and `useDualSensorRuntime`.

## 6. Dependencies added
**None.** (`package.json` and the lockfile are untouched.)

## 7. Test results
| | |
|---|---|
| TypeScript, whole repo | 0 errors |
| ESLint, whole repo | clean |
| Balloon Quest unit/integration tests | 98 passed (79 engine/runtime/input + 19 preview) |
| Full repo `vitest run` | 113 files, 1,515 tests passed |
| Production build | succeeds; new Display routes → 404 page; new Control route not rendered (behind staff gate + `notFound()`) |

Defects found and fixed along the way: static balloons drawn 0.75 balloon-widths too high versus the hit-test (only visible in the real browser); Easy floor layout had no spare replacement slot; a jittered slot could sit just outside the safe area.

## 8. Browser validation
Two real Chrome windows over the DevTools protocol. A full **nine-stage session completed** (45 correct, 14 wrong-colour touches without penalty, 0 skips); pause/resume/restart/skip/end, both layouts, reduced motion, five simulated input sources and real keyboard events, input loss/recovery, Display close/reopen, Display reload, Control reload, a second Control window, wrong-colour cue in both windows: **all pass** (one measurement artifact recorded and re-tested; one non-meaningful check disclosed). Control vs Display position difference: **0.06 %** of stage height. Message-loss recovery is unit-tested, not browser-tested.

## 9. Performance (headless Chrome, development build, software rendering, simulated pointer)
Display **60.0 fps** (0 frames > 33 ms), Control with live preview **59.3 fps**; pointer → pop latency **≈ 4.5 ms** in the Display (p95 5.2 ms); ≈ 4 channel messages/s; DOM 226–258 (Display) / 368–396 (Control) nodes; heap after forced GC over a 10-minute soak: Display 11.8 → 15.2 MB and Control 17.2 → 20.3 MB, most of it warm-up, then ≈ +0.1 MB/min (too small to call a leak from 10 minutes; a ≥ 60-minute soak is recommended before release); 10-minute frame rate 60.0 / 59.6 fps. Not measured: production build, real projector, low-power laptop, sessions beyond 10 minutes.

## 10. Screenshots and video
`docs/balloonquest3d/screenshots/gameplay-*.png` (Easy, Medium, Advanced, stage complete, session complete, paused, floor Easy/Medium, reduced motion, black target with wrong-cue, Control views, nine-stage summary) — all captured from the running game. `docs/balloonquest3d/video/balloon-quest-3d-gameplay.mp4` — 61 s of the child Display. Earlier B2 visual-preview images are the `b2r-*.png` files.

## 11. Known issues
* Same-browser/same-machine transport (BroadcastChannel) — the production game needs a networked transport (see 13).
* Reloading the Control tab starts a fresh session.
* The shared `/control` layout's pre-existing pointer-to-Firebase mirror (`SensorPointerDisplaySync`) is exempted only for Space Pilot 3D's path, so this route inherits it when realtime is enabled; it needs a one-line approved change.
* Wrong-colour touches keep the balloon and cost nothing (as in the original) but are reported as an informational count with no accuracy figure and a gentler cue; the original reports incorrect counts and accuracy — a mapping decision for history/analytics at integration.
* Large tolerance values can make neighbouring hit areas overlap (nearest centre wins).

## 12. Hardware validation still required
RIGHT_HAND with real children and a real disconnect; LEFT_HAND and two-sensor operation; wall and floor installations (orientation, safe areas, text size, black/white visibility in room light); **foot input needs a positioning method designed first**; handheld controllers need their browser-visible capabilities established before an adapter is written; real-GPU frame rate and projector latency on the clinic machine; a ≥ 60-minute soak on the production build; a supervised therapist pilot (instructions, goal sizes, whether the gentle wrong-colour cue is enough); an accessibility review with clinicians. Full checklist in `PHASE_B5_REPORT.md`.

## 13. Exact production integration steps (none applied — approval needed)
1. Approve a transport: publish `state` + 4 Hz `clock` over `/liveSession` (recommended) or declare same-machine-only.
2. `lib/games/registry.ts`: add `balloon-quest-3d` (or a version flag), WALL/FLOOR surface, `sensorCompatible: true`.
3. `database.rules.json`: whitelist the new `gameId` in `liveSession` and `sessions`; add validators for any new history fields (history uses `"$other": false`). Additive only.
4. `components/display/gameDisplayRegistry.tsx` and the control route: mount `BalloonQuest3DDisplay` / `BalloonQuest3DControl` behind `NEXT_PUBLIC_BALLOON_QUEST_3D`.
5. `lib/sessions`: add a `buildStored…` for the new game; keep `balloon-quest` history readable and labelled "legacy (5 stages)"; make `patientAnalytics` / `resumeSuggestion` / history UI use a per-game stage count; never map legacy stage numbers onto the 3-stage game.
6. `PrototypeLocalOnlyBoundary` (or the layout): exempt the new route from the Firebase pointer mirror.
7. Reuse patient/therapist workflow providers from the original controller.
8. Rollout: staging rules → flag on at one pilot site → review → remove flag. **Rollback:** unset the flag; the original game and code are untouched, rule additions are harmless.

## 14. Recommended approach for the next game
Repeat the pattern that worked: (1) a pure, clock-injected engine in `lib/<game>/` with **one geometry module** shared by hit-testing and rendering; (2) a DOM-free control runtime with injected time and transport, so Control/Display behaviour is unit-testable with a fake clock and a lossy fake channel; (3) a versioned, validated protocol and a Display replica that extrapolates an authoritative clock instead of streaming positions; (4) a real-browser two-window harness from day one — it found the one defect that every unit test missed, a drawn-versus-hit-tested mismatch. After this and Space Pilot 3D, consider extracting the shared pieces (input hub, contact pipeline, protocol/replica skeleton, DevTools harness) into one reviewed "experimental game kit", and agree with the Space Pilot 3D owner on one list-based mechanism for the shared-layout exemption instead of per-game edits.

BALLOON QUEST B3–B5 SOFTWARE COMPLETE — Awaiting physical hardware validation and production approval.
