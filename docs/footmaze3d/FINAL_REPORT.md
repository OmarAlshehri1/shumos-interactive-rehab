# Foot Maze 3D — متاهة القدمين · Final report

Branch `feature/foot-maze-3d` (worktree `../shumos-foot-maze`, based on clean `e6aa5fd`). Game id `foot-maze-3d`, engine tag `fm3`.
**Nothing is pushed, deployed or published. Firebase rules are patched in the repo files only (not in the console).**

Legend: **Implemented** (code) · **Browser-tested** (real Chrome, real GPU on this Mac, local Firebase emulators) · **Simulated** (simulated foot source) · **Hardware-validated** (none) · **Incomplete**.

## 1. Architecture (one canonical game, no new infrastructure)
* Publishes into the existing `/liveSession` through `lib/liveGame/*` (lease, ownership, heartbeat, takeover, recovery), exactly like Safe Hex Arena / Turn & Go. No new Firebase tree, project, launcher, calibration system or Bluetooth code.
* `lib/footmaze3d/`: `mazes.ts` (maze graph + pure geometry/BFS/solvability helpers), `config.ts`, `stages.ts`, `engine.ts` (pure reducer), `captions.ts`, `live.ts`, `history.ts`, `projectionProfile.ts`, `useSession.ts`, `registration.ts`.
* Display `components/display/footmaze3d/` (Three.js: `world.ts` environment, `scene.ts` dynamic layer, `characters.ts`, particles, audio, HUD) + `games/FootMazeDisplayModule.tsx`. Control `components/control/footmaze3d/` (maze map, settings, step controls). Routes `/control/foot-maze-3d`, `/display/foot-maze-3d`, dev-only `/dev/foot-maze-preview`.
* Library: one registry entry (FLOOR, FOOT; tags «حركة القدمين والمشي», «التوازن والثبات», «التخطيط الحركي»), thumbnail captured from real gameplay (`public/library-thumbnails/foot-maze-3d.webp`, provenance recorded), vector fallback card.
* History: one record per run (`sessionId-r{run}`), `resultVersion 1`, `engine fm3`; patient analytics, session row and detail screens. No score / accuracy / speed fields (rules forbid them).
* Feature flag `NEXT_PUBLIC_FOOT_MAZE_3D` (dev on unless `false`; production opt-in). Rollback = unset.
* Reuse: shared audio primitives + speech provider, `safehexarena3d/sensorInput` foot hint detector/simulator, `footsteps3d/rng`; 3D kit/textures/particles copied from Turn & Go's display layer and adapted.

## 2. Maze mechanics
* Real topology: each stage is an authored 7×4-grid ASCII drawing compiled to a graph (start, finish, junctions, turns, dead ends, safe waiting zones, rooms, corridors). Straight filler cells are compressed away so every node is a decision, a turn or a landmark.
* Therapist-driven movement: the child's position is **never inferred**. The therapist taps the corridor the child chose (`choose`, shown neutrally on the Display), then confirms arrival (`arrive`, optionally "assisted"). A junction never preselects a direction; a corridor with one way onward is preselected; a dead end preselects the way back (gentle cue, no penalty).
* Route choices are counted (made / correct-toward-finish / detour); detours, dead ends, repeats and skips are never failures.
* Stars: one outcome slot per star, awarded only on a confirmed arrival, never twice (revisiting does nothing; a skipped star can still be collected later). Finish is always a star and ends the stage.
* Guidance level per stage (arrows on whole route / next leg / none) + therapist **hint** button (7 s). Left/right come from the child's heading, not the screen, so rotation (0/180) and mirroring never flip meaning (unit-tested).
* **Simplified route**: only the main corridor, no dead ends, side stars or route-changing events, wider corridor.
* Solvability is **proved in tests** from every state a child can reach (all node × fired-events combinations), for all 9 mazes, full and simplified, events on and off; corridors never cross except at nodes; walls keep a gap at default width.

## 3. Guardians and safe waiting
A guardian / swarm / gate / bridge / route switch (an "act") starts **only** immediately after a therapist-confirmed arrival at its marked waiting zone, i.e. while the child stands still. During an act no move is accepted. Phases (running clock): enter (1.6 s) → hold (default 6 s, 3–15 s) → leave (1.4 s) → **CONTINUE** sign. Pause / safety / lost connection freeze the clock, so they freeze the act. Therapist can pause, **release** early, **extend** (+2 s), **trigger/replay** by hand, shorten/lengthen the wait, turn guardians or all dynamic events off, and enable a "stand steady" stance sign. Characters (toy robot, duck, bear, butterfly swarm) pop out of the hedge beside the corridor, stand in a taped, clearly marked spot with a drawn WAIT hand sign, then step back; a guardian that "moves between two corridors" slides from one blocked corridor to the other. No chasing, no scary audio, no reaction deadline. A bridge is drawn as a flat shallow stream (never a hole) whose planks extend; gates are low glass/wood leaves; the crystal switch closes a corridor with posts and candy-striped tape before anyone enters it.

## 4. Nine-stage matrix (generated from the code; `stage-matrix.md`)
| Stage | Name | Environment | Nodes | Corridors | Junctions | Dead ends | Stars | Turns on main route | Route length | Guardians / mechanisms | Route events | Collectible | Guidance | Default width |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1.1 | الحديقة المشمسة / Sunny Garden | garden | 6 | 5 | 1 | 1 | 5 | 1 | 18 | — | — | — | always | 2.4 |
| 1.2 | الشاطئ الاستوائي / Tropical Beach | beach | 8 | 7 | 1 | 1 | 5 | 3 | 20 | — | — | — | always | 2 |
| 1.3 | البيت السحري / Magical House | house | 8 | 9 | 2 | 0 | 5 | 0 | 12 | — | — | — | always | 1.7 |
| 2.1 | الغابة الودودة / Friendly Forest | forest | 11 | 10 | 3 | 3 | 6 | 5 | 26 | — | — | — | always | 1.6 |
| 2.2 | ملعب المهرجان / Festival Playground | festival | 8 | 8 | 3 | 1 | 4 | 2 | 16 | guard | — | — | next | 1.6 |
| 2.3 | حديقة الفراشات / Butterfly Garden | butterfly | 13 | 14 | 5 | 2 | 4 | 3 | 18 | swarm | — | — | next | 1.6 |
| 3.1 | عالم الكريستال / Crystal World | crystal | 10 | 10 | 2 | 1 | 4 | 3 | 18 | gate, bridge | switch×1 | — | none | 1.6 |
| 3.2 | المدينة المصغّرة / Miniature Town | town | 10 | 12 | 5 | 1 | 5 | 3 | 18 | guard, guard↔ | — | — | none | 1.6 |
| 3.3 | قصر الألوان / Color Palace | palace | 11 | 15 | 6 | 0 | 5 | 4 | 18 | guard↔, bridge | switch×1 | yes | none | 1.5 |

Each stage has its own environment, lights, floor, wall material, decor, destination landmark, ambient life and star-effect (garden fountain; beach treasure chest; house bed with moon-lamp in a highlighted room; forest tree house; festival carousel; butterfly giant flower; crystal tower; town hall; rainbow throne). Only the current stage is built; it is rebuilt on layout change and fully disposed on stage change.

## 5. Therapist controls (all manual-completable without sensors)
Start / pause / resume / safety stop / skip stage / restart stage / restart run / end (confirmations on destructive ones) · level+stage grid with preview before starting · choose route, confirm arrival, assisted arrival · repeat step, step back, skip next star · hint · release / extend / trigger guardian · guardians on/off, wait length, dynamic events on/off, event length, stance sign · simplified route · corridor width 1.3–2.6 (auto or fixed) · orientation 0/180 and mirror · guidance level · saved FLOOR projection profile · foot-sensor simulator · sound / music / voice / volume · reduced motion · reduced effects · high contrast · minimal HUD · quality. Route-shaping settings lock once a stage starts (the maze never changes under a walking child).

## 6. Sensors (foot)
Reuses the shared foot-movement hint detector. It can only say "a foot started moving"; it matters only during a guardian wait, where it shows a banner to the therapist. It never moves the child, collects a star or ends a wait (unit-tested). **Only the simulated source was run. No physical WT901 and no real BLE path was tested.** Library launch adapter exposes MANUAL only.

## 7. Projector calibration
The shared calibration (`lib/projection/calibration.ts`) is not on this branch's base (uncommitted in main). `projectionProfile.ts` mirrors its key/shape read-only; a saved FLOOR profile's rotation, safe inset and measured size are copied into the config. The layout shrinks uniformly to stay inside the safe inset **but never narrows the corridor below the therapist's chosen width**; a warning appears when corridors get too close. Units are course units, never pixels = cm; cm hints appear only with a measured profile. A profile is a software layout record, not an alignment proof.

## 8. Audio
Shared primitives/speech. Spoken only at: intro («اختر الطريق الصحيح، واتبع الأسهم، وانتظر إذا كان الحارس في الطريق.»), countdown «استعد», halfway, first guardian wait, gentle dead-end hint, stage completion, final. Soft chimes for stars, guardian, door/bridge, route success, victory; a gentle sigh (never a buzzer) for a detour. Mute and Display audio readiness respected. **Audio was not listened to by a human**; only call counts/automation were checked.

## 9. Tests (all run on this Mac)
* Unit: whole repo `vitest run`: 163 files pass, 2056+ tests (28 maze-topology/solvability, 39 engine incl. 9-stage play-throughs ×4 configurations, live/history, library integration, geometry kit, stage matrix).
* Firebase rules emulator: **10/10** (publish fencing, create-only history, tamper/score/unknown-field/ghost-patient rejection, other games unaffected).
* Cross-device browser E2E (two Chrome processes: iPad-like touch Control + 1920×1080 Display, local emulators): **74/74** — setup preview sync, simplified/width/orientation, countdown, pause, assisted arrival, route choice + dead end + detour, guardian wait (start only on confirmed arrival, moves refused, pause freezes, extend, natural end, manual re-trigger, early release), gate, route switch (corridor closes on both devices, no longer offered), events/guards off, hint, back, skip, restart stage, reload recovery (paused + safety, act preserved), Display reload, safety stop, history save-once (partial + nine-stage run), no uncaught exceptions, bounded GPU resources.
* `tsc` clean (only the pre-existing generated `LayoutProps` issue in `app/layout.tsx`), eslint clean on all touched areas, `next build` OK (flag on).
* Screenshots: `docs/footmaze3d/screenshots` (previews of all 9 stages, guardians, options) and `docs/footmaze3d/evidence/shots` (E2E). Validation harness: `docs/footmaze3d/validation` (ports app 3662, RTDB 19660, auth 19669; emulators need Java 21).

## 10. Performance observations (measurement only; no FPS claim for other hardware)
On this Mac's real GPU the per-frame CPU draw time was ~0.6–1.7 ms; calls 70–195, triangles 5k–210k per stage (butterfly garden heaviest from flowers; 'low' quality ≈ 120k). Textures are cached per theme (≤ ~55 after visiting all stages); geometries stay ~60 after nine stage changes. **Not profiled on a projector PC or weak GPU**; `quality: low` / reduced effects exist for that.

## 11. Known issues / remaining work
* Not tested with physical projector, floor, real child, real sensors, or by ear (audio).
* Rotation is 0/180 + mirror only (90/270 would shrink corridors below safe width on a 16:9 picture).
* Dense mazes (stages 6, 9) at 1.5–1.6 corridor width leave thin walls; the therapist can use the simplified route or narrower width.
* Merge notes: add `'fm3'` to the `suffixed` list in `lib/therapyVisits/gameSafety.ts` (uncommitted in main); replace `projectionProfile.ts` mirror with imports from `lib/projection/calibration.ts`; apply rules with `python3 docs/footmaze3d/rules-patch.py` (already applied in this branch's rule files; **not deployed**). Library test counts assume Rhythm Steps/Turn & Go are not merged (14 games here).
* The E2E library-card screenshot captured the home screen (the check only asserts the card text/image exist); a visual check of the card in the library is still advisable.
