# Runner Quest 3D — Dual-projection upgrade report (WALL + FLOOR)

Canonical id `runner-quest-3d` · مغامرة العدّاء · one library card · feature flag `NEXT_PUBLIC_RUNNER_QUEST_3D`.
Nothing was committed, pushed, deployed or published. No live Firebase project, rules file publication or patient record was touched: every Firebase interaction used **isolated local emulators** (project `demo-rq5`, ports 19410/19411; platform-rules check on a second pair 19420/19421) and a seeded test patient. The scratch copy used for servers/builds never contained `.env.local`.

> **Simulated vs. real.** "Two devices" = two separate Chrome processes/profiles (iPad touch emulation 1180×820 @2×, and a 1920×1080 laptop) sharing only the Firebase emulators. FPS/latency come from headless Chrome on one Mac. **No projector, no WT901/foot sensor, no physical iPad was used.**

## R1–R12 status

| Phase | Status | Where |
|---|---|---|
| R1 audit | Done. WALL engine, 9 stages, protocol/live record, history, flag, registration and rollback inspected and **left intact**. | this report §1 |
| R2 floor design | Done: top-down journey, three large regions, therapist-confirmed objectives, no jumping/running/time. | §2 |
| R3 premium floor graphics | Done: orthographic top-down Three.js scene, calibration. Screenshots inspected. | §3 |
| R4 floor engine | Done: deterministic, shares the lifecycle/results layer with WALL (no duplicate engine). | §4 |
| R5 nine stages × both modes | Done and **browser-verified in both**. | §5 |
| R6 therapist Control | Done: projection selector, synchronized region map, all manual actions. | §6 |
| R7 foot sensors | Prepared as **hints only**; simulated; physical validation pending. | §7 |
| R8 Firebase | Done on the existing `/liveSession` record; no new tree. | §8 |
| R9 history | Done: result version 2, backward compatible. | §9 |
| R10 visual/perf | Done within headless limits (numbers in §10). | §10 |
| R11 validation | Done; see §11. | §11 |
| R12 release prep | Done; checklist §13. | §12–13 |

## 1. What already existed and was preserved
Pure authoritative `session.ts` (WALL lane runner: distance/speed, holds, no failure), `ControlRuntime`, versioned `DisplayState` protocol, `DisplayReplica`, `RunnerLivePublisher` (+ `/liveSession` record `engine:"rq3"`), per-patient history `StoredRunnerQuestSession`, WALL scene, nine WALL stage definitions (`stages.ts` unchanged), input hub/foot recognizer (simulated), flag + registration. WALL gameplay code paths are unchanged; the only edits in WALL files are additive branches (`if (st.floor)`), two data attributes on the WALL Display root, and `data-testid`-neutral UI wrapping. WALL passed the full nine-stage browser matrix after the change (§11).

## 2–5. FLOOR design, engine and curriculum
* **Concept.** The path runs up the screen. Each waypoint is one objective on three large flat regions (left / centre / right) drawn with a stable orthographic camera. Objectives: `region` (move to the lit region; variants *direction*, *neutral* = back to centre, *choose* = pick the lit one), `step` (a small deliberate foot movement in place — a "virtual stepping stone", never a jump), `rest` (optional calm pause, "continue" ends it).
* **Safety rules encoded and tested.** No time limit/timeout (ticking 2 M ms changes nothing), no speed, no jumping, no irreversible mistake (a wrong region just updates where the child is shown; the target stays lit), no automatic acceptance from a sensor, every objective completable by one therapist tap, assisted/skipped/rest are distinct outcomes.
* **Engine.** `lib/runnerquest3d/floor.ts` (plans), `session.ts` (`newFloorStage`, `applyFloorAction`, `assistPastObstacle`, `repeatObjective`, `skipObjective`, `setProjection`). A FLOOR stage rides on the shared `StageRuntime` (`distance` = objectives resolved, `length` = total, `obstacles[]` = objectives) so lifecycle, results, summary and history are one code path. Plans regenerate from `(stageIndex, seed)` on both devices; positions are never sent.
* **Projection lock.** Only changeable while `ready` with no results in the run (`setProjection` bumps `runId`); refused afterwards; Start is blocked until the therapist has chosen explicitly (in-page buttons or the library launch panel's `applyProjection`).
* **Nine stages (same 3×3, same titles/themes as WALL; objectives):**

| # | Stage | Objectives | Pattern |
|---|---|---|---|
| 1 | Easy 1 الخطوات الأولى | 6 | one simple direction at a time (3 of one side, then 3 of the other) |
| 2 | Easy 2 اختر المسار | 6 | short predictable sequence (L R L R L R, seed picks the start side) |
| 3 | Easy 3 تجنّب بلطف | 8 | gentle seeded left/right variation, never 3 same in a row |
| 4 | Medium 1 أول حاجز | 8 | alternating cues with a return to centre between |
| 5 | Medium 2 الاتجاه والخطوة | 10 | short route with 3 optional rests |
| 6 | Medium 3 درب العوائق | 10 | varied but predictable (directions, centre, small foot movements) |
| 7 | Advanced 1 مسارات متغيّرة | 12 | longer journey, "choose the lit region", rests |
| 8 | Advanced 2 عوائق متنوعة | 12 | combinations of directions + steps + rest |
| 9 | Advanced 3 المغامرة الأخيرة | 14 | every interaction type, ends on a choice |

  Advanced = variety, not speed/effort. Therapist-adjustable **movement range** (قريبة/متوسطة/واسعة), **region size** (all large), **assistance** (extra guidance dots), safe margin, grid, contrast, reduced motion.

## 3. Floor graphics and calibration
`components/display/runnerquest3d/floor/` (`FloorScene.ts`, `FloorCanvas.tsx`, `FloorView.tsx`, `FloorHud.tsx`) + pure geometry in `lib/runnerquest3d/floorLayout.ts` / `floorDecor.ts` (unit-tested: regions never overlap, frustum never stretched for 4:3 … 21:9, safe area always holds the three regions, scenery never inside the clear zone for every stage × preset). Stylised ground/stone path/destination plaza, soft shadows, themed scenery (instanced), friendly top-down avatar, footprint-less calm effects (soft ring + star dust, none in reduced motion), no camera shake, no flashing, no bloom, no holes/cliffs, regions flat. Calibration: projected width/height (the therapist's own measurement → 50 cm grid cells), safe margin, 3 region sizes × 3 ranges, grid + red safe-area frame + a circle (oval on the floor = projector stretch), aspect-correct frustum, high contrast (exact colours, no tone-mapping), reduced motion. **No real projector calibration is claimed.**

## 6. Therapist Control
Projection card (WALL/FLOOR, Arabic explanations, locked after start). FLOOR: synchronized region map (target highlighted, child's confirmed region marked), current objective in Arabic, large confirm buttons (left/centre/right, small foot movement, continue after rest), *assisted confirmation*, *repeat cue*, *skip objective*, pause/resume/restart, 9-stage selector (single stage or to the end), skip stage, end (platform end-reason sheet), results table (skipped-objectives column for FLOOR), route strip (✓ ✋ – ☾ ◉), calibration card. WALL manual controls unchanged. Everything works with no sensor; foot modes are optional.

## 7. Foot-sensor preparation (limitations)
`RIGHT_FOOT / LEFT_FOOT / DUAL_FOOT` reuse the existing hub/recognizer and the existing simulated rig — **no new BLE driver, no calibration change**. In FLOOR a sensor event is only a **movement-onset hint** (left/right/step) or a **return-to-rest hint**; it never completes an objective and never states a position (an IMU cannot). The therapist sees the hint (fresh for 8 s; an onset hint is not buried by a rest hint) with a confirm button. Freshness/disconnect: sensor loss suspends with progress preserved; "continue manually" is offered. Role isolation is the existing hub's (other roles ignored). **Not validated on hardware.**

## 8. Firebase
Existing `/liveSession` record only (`engine:"rq3"`, `engineVersion 1`; protocol version unchanged). `DisplayState` gains optional `projection` + `floor` (`total, current, region, regionSeq, cueSeq, outcomes` string, `cal`) — absent ⇒ WALL, so older records still validate. Control is the only writer; Display read-only (no controls in the game view). FLOOR publishes **no periodic clock writes** (state is discrete): measured 0–1 writes in 15 s idle, ≈ one per confirmation. Controller lease, presence and reload recovery are the platform's (Display reload re-joins at the same objective; Control reload starts a fresh safe session and re-requires a projection choice).

## 9. History (version 2)
`RUNNER_QUEST_RESULT_VERSION = 2`. Each stage row adds `projection` and `objectivesSkipped`; FLOOR rows reuse `obstaclesResolved/Total` for objectives completed (assisted included, skipped excluded)/total and `assists` for assisted actions; `holds` is 0. v1 rows (no `projection`) are revived untouched and never reinterpreted. **No `database.rules.json` change was needed** (row fields are allowed for this game; top-level fields are not, so the session's projection is derived from its rows). Saves exactly once (existing save-once path; verified incl. Control reload). Walk-ins follow the existing no-history convention.

## 10. Visual and performance (headless Chrome, SwiftShader software GL, dev build)
FLOOR across the nine stages: **60 fps** (frame-time avg), **46–52 draw calls**, 28–67 k triangles, JS heap 39–62 MB, GPU **geometries 17–18 and textures 11 constant** across nine stage rebuilds (materials scale with objective count and are released on rebuild), input→Display latency **29–68 ms** (emulator, same machine), Firebase writes ≈ 1 per confirmation, 0 idle. Auto-quality (low/medium/high) and `?quality=` apply as for WALL. These are **not** projector-hardware numbers.

## 11. Validation (all against current working tree, isolated)
| Gate | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| ESLint (whole repo) | 0 errors, 0 warnings in this work |
| Focused Runner tests | 13 files, 158 passed (+ new: `floor.test.ts` 28, `floorLayout.test.ts` 7, `floorDecor.test.ts` 4, FLOOR history 3) |
| Full Vitest | 156 files passed, 13 emulator suites skipped; **1961 passed**, 98 skipped |
| Firebase emulator rules | Runner suite **10/10** (live record all lifecycle states incl. FLOOR; v2 history accepted once; top-level `projection` rejected; v1 record still accepted; stale/non-staff/anonymous writes rejected); platform rules **12/12** |
| Production build, flag **on** | passes; `/control` + `/display/runner-quest-3d` routes present |
| Production build, flag **off** | passes; `/display/runner-quest-3d` 404, `/control/runner-quest-3d` renders not-found, other routes 200 |
| Production smoke (no dev hooks) | 4/4: FLOOR stage by touch, history saved |
| **Browser matrix FLOOR** (Control UI only, 2 Chrome processes) | **74/74**: projection chosen explicitly, Display camera/layout correct, all 9 stages completed, wrong-region ignored, Display in sync, history v2 once, reload no duplicate, no new top-level Firebase tree |
| **Browser matrix WALL** | **73/73**: all 9 stages completed through lane/step touch actions, same checks |
| FLOOR workflow suite | **35/35**: calibration reaches Display (range/pad/grid/contrast/size, 4:3 no overflow), assist, repeat, skip objective, pause/resume, restart, sensor hint→confirm, disconnect→manual fallback, Display reload recovery, history row contents, Control reload, unauthenticated visitor sees login, read-only Display, skip stage, end sheet + results, reduced motion, GPU stability, latency, write rate |

Not exercised in the browser matrix: the matrices run each stage once per projection with deterministic tapping (assist/skip/repeat/pause/restart/reload are covered by the workflow suite on stage 5 and stage 1, and by unit tests on all nine); a full run **with a real patient on production Firebase**, physical iPad, projector and foot sensors.

Environment notes: `tsc`/vitest run concurrently with a browser run starved the 500 ms frame-gap guard once (WALL matrix saw "scheduling-gap" suspensions); the clean rerun passed. A stale-types error and one snapshot test (`retiredFeedAnimals`) failed temporarily while another agent edited `database.rules.json`/Space Pilot; both were green on the final run. `docs/release` library tests still pass with Runner now `BOTH`.

## 12. Exact files changed
**New:** `lib/runnerquest3d/{floor,floorLayout,floorDecor}.ts`; `lib/runnerquest3d/__tests__/{floor,floorLayout,floorDecor}.test.ts`; `components/display/runnerquest3d/floor/{FloorScene.ts,FloorCanvas.tsx,FloorHud.tsx,FloorView.tsx,floor.module.css}`; `components/control/runnerquest3d/FloorControlPanel.tsx`; `docs/runnerquest3d/{DUAL_PROJECTION_UPGRADE_REPORT.md,floor-evidence/**,validation/floor/**}`.
**Modified (Runner):** `lib/runnerquest3d/{types,session,protocol,replica,controlRuntime,arabic,registration}.ts`, `lib/runnerquest3d/input/hub.ts`, `lib/runnerquest3d/__tests__/rules.emulator.test.ts` (env-configurable ports + FLOOR cases), `components/control/runnerquest3d/{RunnerQuest3DControl.tsx,control.module.css}`, `components/display/runnerquest3d/RunnerQuest3DView.tsx` (+ WALL data attributes), `docs/runnerquest3d/README.md`.
**Modified (shared, minimal):** `lib/sessions/types.ts` (version 2 + two optional row fields), `lib/sessions/buildStoredRunnerQuestSession.ts`, `lib/sessions/sessionHistoryRepository.ts` (row reviver), `lib/sessions/__tests__/runnerQuestHistory.test.ts`, `components/control/library/presentation.ts` (one description string; Runner is now `BOTH` via its registration so the "floor pending" notice disappears).
**Not touched:** `database.rules.json`, `lib/games/registry.ts`, Space Pilot, Fire Rescue, Harvest Valley, Pearl Voyage, other games, library layout/four sections, Feed the Animals, BLE drivers, calibration, auth, patient data. Concurrent edits by other agents were preserved.

## 13. Feature flag, rollback, batch-deployment checklist
* **Flag** `NEXT_PUBLIC_RUNNER_QUEST_3D=1` (production opt-in; dev on unless `0`). One flag covers both projections.
* **Rollback:** unset/0 + rebuild removes the card and routes (verified); WALL-only behaviour can also be restored by reverting this change set — v2 history stays readable by v1-tolerant readers (extra row fields ignored; `resultVersion ≥ 1` already accepted by rules).
* **Checklist:** (1) merge with the shared working tree and re-run full tsc/eslint/vitest; (2) rules: **no Runner change needed** — deploy whatever batch rules the other games require (Runner suite passes against the current candidate); (3) set the flag in the production build env; (4) smoke with a staff login on iPad + `/display` on the projector laptop: choose FLOOR, complete one stage, verify one history record; (5) physical: measure projector size, use the calibration grid/circle, verify region sizes on the actual floor and with the child; (6) physical foot sensors: validate hints separately (role, freshness, disconnect) before claiming anything; (7) confirm no other game regressed in the batch smoke.

## 14. Known limitations / pending (not blockers for the software candidate)
Physical projector scale/brightness/contrast on a real floor; real WT901 foot hints; safe-use review of region size/spacing with children and therapists; session projection is derived from stage rows (a session ended before any stage row has no stored projection); materials-per-pad could be merged if a very low-end Display needs fewer GPU objects; headless FPS is not hardware FPS.

**RUNNER QUEST 3D DUAL-PROJECTION SOFTWARE RELEASE CANDIDATE READY — Physical projector and foot-sensor validation pending.**
