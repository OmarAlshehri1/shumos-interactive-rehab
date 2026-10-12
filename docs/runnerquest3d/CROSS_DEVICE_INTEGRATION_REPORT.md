# Runner Quest 3D — Cross-device production integration report

**Result: RUNNER QUEST 3D CROSS-DEVICE RELEASE CANDIDATE READY — Awaiting final deployment approval.**
Nothing was committed, pushed or deployed. No live Firebase project, rules or patient record was touched: every Firebase interaction below used the **local Firebase emulators** (project `demo-rq3`) and a seeded test patient.

> **Simulated vs. real.** "Two devices" below means **two separate Chrome processes with separate profiles** (no shared BroadcastChannel/storage), one emulating an iPad (touch, 1180×820 @2x, iPad user agent) and one a 1920×1080 laptop, talking **only through the emulated Firebase**. This is *not* validation on a real iPad, a real projector laptop or a real network. Touch taps are an in-page touch-event sequence after a real hit-test (CDP's own touch injection was unreliable in this headless two-window setup).

## 1. Manual therapist controls (implemented)
Control screen (`RunnerControlPanels`), touch-first and responsive (≥ 88 px pad buttons, ≥ 56 px action buttons, `touch-action: manipulation`, single column on narrow screens):
* **Start / pause / resume / restart / skip / advance / end** (end uses the platform's end-reason sheet in production).
* **Select difficulty and stage** (3×3 grid; single stage or "to the end"), speed, spacing, sensitivity, tolerance, foot-lift requirement, pause-before-obstacle, reduced motion.
* **Move the runner left/right** (◀ ▶) and **trigger the in-game step-over** (▲ — a game action, never a physical jump), **assist past an obstacle**.
* **Progress/results**: stars, progress %, waiting stops, obstacles, per-stage summary table.
* Needs **no keyboard, mouse, Bluetooth sensor or gamepad**; `MANUAL` is the default input source. Manual actions are accepted **in every input mode** (explicit override), go through the **same authoritative `applyAction`** as sensor input, share the sensors' debounce (two sources cannot double-move the runner) and carry unique input ids (duplicates ignored). Destructive commands carry the run identity the therapist was looking at, so a stale tap on an older run is refused.

## 2. Firebase synchronisation architecture
Reuses the existing platform plumbing exactly as Balloon Quest 3D does: staff auth (`StaffAuthGate`), single-controller **lease**, **presence**, one `/liveSession` record, per-patient history. The existing system was not replaced.
* **Control is the only writer** (`useRunnerQuestRealtimeControl` → `publishSession`, game id `runner-quest-3d`); the **Display is read-only** (`RunnerQuestLiveDisplay` via the existing `DisplayScreen` → `GAME_DISPLAY_MODULES`) — its game view has no controls and no write path, and it never scores.
* **Bounded transport**: one record (≈ 1.1 KB), strictly increasing `revision` (platform rule). Written **immediately on each discrete change** (start, lane, step accepted, obstacle resolved, hold, pause, stage…) plus **at most one clock sample per second** while playing. **Measured over a full nine-stage session: 526 writes in 435 s = 1.21/s.** No per-frame writes, no raw input, no 3D scene state, no obstacle positions (the Display regenerates them from the seed).
* **Smooth motion over a 1 Hz feed**: between samples the Display re-runs the *same deterministic kinematics* Control uses (`projection.ts` shadow simulation: acceleration, braking, hold lines, pause-before-obstacle) from the last authoritative sample; it **stops where Control stops** (tested) and freezes if Control goes silent (bounded projection, "waiting for therapist" card after 6 s).
* **Versioned/safe messages**: identity tuple `[ownerStartedAt, sessionEpoch, runId, revision]` + clock `seq` reject stale, duplicate and old-run data; malformed records fail to the waiting world (strict reviver that repairs RTDB's dropped nulls/empty arrays).

## 3. Cross-device workflow
Therapist opens the library on the iPad/computer → taps the **مغامرة العدّاء** card (`/control/runner-quest-3d`, behind the existing staff login) → the child's laptop simply stays on **`/display`** (as for every other game) → the Display shows the ready screen as soon as a child name exists → therapist starts and drives with touch → Display renders the authoritative state. Control shows "Display connected" from the existing presence node.

## 4. Input fallback behaviour
Sources: `MANUAL` (default), `KEYBOARD` (desktop aid), `RIGHT_FOOT`, `LEFT_FOOT`, `DUAL_FOOT` (prepared; **simulated only**, unvalidated, labelled "تجريبي"). Hand/handheld input is always ignored. If a sensor drops: play **suspends (session, stars and progress preserved)**, the Display shows the calm pause, a plain *resume* is refused, and the therapist taps **«متابعة يدويًا»** to continue with the same session; the bypass clears automatically when the sensor returns and settles. The sensor disconnect never ends the session. BLE drivers, calibration and role assignment were not touched.

## 5. Session ownership and recovery
Ownership = the existing controller lease (a second therapist device gets the platform's takeover overlay). Reload/reconnect: **Display reload** re-joins the live record on its own; **Control reload** starts a fresh safe session (checkpoint hint), the live record is re-based above the stored revision and the Display follows the new session id; leaving the page mid-session ends it, saves the partial history and clears the live record. Publishing retries with back-off and re-bases after a rejected write.

## 6. History persistence
`/sessions/{patientId}/{sessionId}` with its **own versioned type** `StoredRunnerQuestSession` (`gameId: "runner-quest-3d"`, `resultVersion: 1`, `engine: "rq3"` on each stage row; stars, waiting stops, assists, obstacle counts, active time, input source). **No accuracy/incorrect fields; legacy records are never reinterpreted.** Each run has its own immutable key (`<sessionId>` / `<sessionId>-r<runId>`). History list row, detail page and analytics handle it without inventing accuracy; verified that a legacy Balloon Quest record in the same patient stays **byte-identical** and still renders. A real bug found by the cross-device run and fixed: the save effect watched a mutated object and never fired (now depends on the summary value; also logs failures instead of swallowing them).

## 7. Exact files
**New:** `lib/runnerquest3d/{live,projection}.ts`; `lib/control/runnerquest3d/useRunnerQuestRealtimeControl.ts`; `lib/sessions/buildStoredRunnerQuestSession.ts`; `components/control/runnerquest3d/RunnerQuestControl.tsx`; `components/display/runnerquest3d/{RunnerQuest3DView,RunnerQuestLiveDisplay}.tsx`; `components/display/games/RunnerQuestDisplayModule.tsx`; tests `lib/runnerquest3d/__tests__/{live,projection,registry,rules.emulator}.test.ts`, `lib/sessions/__tests__/runnerQuestHistory.test.ts`; validation scripts `docs/runnerquest3d/validation/{crosslib,seed,e2e-cross-full,e2e-cross-workflow,latency-cross,prod-cross}.mjs`; this report + `cross-device/`.
**Modified (Runner Quest code):** `lib/runnerquest3d/{types,arabic,session,protocol,replica,controlRuntime,controlMount}.ts`, `input/hub.ts`; `components/control/runnerquest3d/{RunnerQuest3DControl.tsx (rewritten around RunnerControlPanels),control.module.css}`; `components/display/runnerquest3d/RunnerQuest3DDisplay.tsx`; `app/control/runner-quest-3d/page.tsx`; tests `engine/input/runtime`.
**Modified shared tracked files (small, additive; unrelated changes by other agents preserved):**
| File | Change |
|---|---|
| `database.rules.json` | `runner-quest-3d` added to the 2 game-id whitelists, one history branch, 6 field validators (`resultVersion`, `totalStars`, `totalHolds`, `totalAssists`, `totalObstaclesPresented/Resolved`, `inputSource`). *The same file also carries Build Quest 3D's separate `buildQuest3d` subtree from another agent — see §10.* |
| `lib/games/registry.ts` | `GameId` now includes `"runner-quest-3d"`; `LocalGameId` narrowed to Build Quest only; `RUNNER_QUEST_3D_GAME_ID`. |
| `lib/audio/AudioManager.ts` | +4 lines: empty prefetch list and silent ambience for the game (no voice, no TTS, no music). |
| `lib/audio/__tests__/prefetchLines.test.ts` | type-only (`VoicedGameId`); **no assertion changed**. |
| `lib/realtime/types.ts`, `lib/realtime/sessionRepository.ts` | `RunnerLiveSession` in the session union; `parseLiveSessionValue` branch with its own reviver. |
| `lib/sessions/types.ts`, `lib/sessions/sessionHistoryRepository.ts` | `StoredRunnerQuestSession` + reviver + dispatch (`reviveAnyStoredSession` exported for tests). |
| `lib/analytics/patientAnalytics.ts`, `components/control/patients/{SessionDetailScreen,SessionHistoryRow}.tsx` | Runner Quest branches (stars/assists; no accuracy). |
| `components/display/gameDisplayRegistry.tsx`, `components/control/library/gameThumbnails.tsx` | module / thumbnail entries. |
The earlier `LOCAL_INTEGRATION.patch` is **superseded** (it was the local-only design).
Untouched: Space Pilot, Balloon Quest, Build Quest code, other games' gameplay, BLE drivers, calibration, auth code, existing patient records.

## 8. Test results (final tree)
| Gate | Result |
|---|---|
| `tsc --noEmit` (whole repo) | **0 errors** |
| `eslint .` (whole repo, incl. docs scripts) | **0 problems** |
| Full `vitest run` | **1708 passed, 17 skipped (emulator-only suites), 133 files**; Runner Quest + history + audio: 206 passed |
| Cross-device sync unit tests | live record round-trip with RTDB null/array loss, strict reviver, publisher rate bound / strictly increasing revisions / re-base after rejected write, replica stale/duplicate/old-run rejection, projection ≤ 2.2 m error from a 1 Hz clock and **never past Control's hold line**, manual in every source, sensor-loss → continue-manually → sensor returns, stale commands, duplicate ids |
| **Firebase emulator rules** (`RQ3_RULES_EMULATOR=1`), against the **merged** current `database.rules.json` | **7/7**, repeatable: all lifecycle states of the live record accepted; Display (anonymous) can read, cannot write; rejected: non-increasing revision, empty/long name, unknown game id, non-staff, unauthenticated; history accepted once, overwrite rejected, 2nd run has its own key; missing result fields / unknown field / wrong writer / bad stage rejected; legacy live + history records still accepted |
| Production build (`next build`, real tree, emulator env, flag on / flag off) | **succeeds** both |

## 9. Browser validation (two browser processes, emulators; simulated devices)
* **Full nine-stage session by touch from the iPad-like device**, dev build (`e2e-cross-full.mjs`): **9/9 stages in 7.3 min**, every stage-complete moment identical on both devices (stars 8,8,10,7,10,12,9,12 → 88), Display summary, **one history record** (9 completed, stars 88/88, no accuracy), **1.21 Firebase writes/s**, 0 exceptions. (16/17: the one failing check was my latency matching, fixed in the script and measured separately below.)
* **Workflow suite** (`e2e-cross-workflow.mjs`): **41/41** — read-only Display; touch start/left/right/step (+ star parity); rapid triple tap = one move; pause/resume/restart; idle child waits ≥ 8 s with hint; assist; skip waits for therapist; RIGHT_FOOT (simulated) + manual override; **sensor loss → suspended, session id unchanged, plain resume refused, "continue manually" resumes, no re-suspension, manual keeps working, reconnect clears bypass**; Display reload re-joins; stale command refused; Control reload → safe fresh session and Display follows; history record written once; legacy record byte-identical; patient profile + detail pages render both games; library + balloon-quest, space-pilot, color-chase routes still load; **non-staff account blocked by the existing gate and wrote nothing**.
* **Production build, two profiles** (`prod-cross.mjs`): **18/18** — library card next to the six original games, card → Control through the staff gate, name prefilled, no simulator and no dev hooks, MANUAL default and sensor modes labelled experimental, touch start/left/pause/resume/assist/skip/advance, platform end-reason sheet, Display follows each state, one history record, 0 exceptions.
* **Latency** (touch tap → visible change on the other device, 40 taps, `latency-cross.mjs`): **p50 18.6 ms, p95 23.1 ms, max 28.5 ms** — same machine and Firebase *emulator*; real WAN latency will be higher (the Display projection hides it for motion).
* Screenshots: `cross-device/screenshots/` (iPad layout, paused, sensor-lost, history list/detail, outsider blocked, production library card, Display holding with hint, ended).
* Not covered: a real iPad, real Safari, a real projector, internet latency, the real Firebase project.

## 10. Firebase rule changes still required (not deployed)
`database.rules.json` **must be deployed before** Runner Quest can run against a real project (the old whitelists reject `runner-quest-3d`). The changes are additive and emulator-tested. **Caution:** the working-tree file also contains Build Quest 3D's `buildQuest3d` subtree (≈ 400 lines) written by another agent, plus unrelated edits; deploying "the file" deploys all of it. Review/approve the combined diff (`git diff database.rules.json`) jointly, deploy to a staging project first, re-run `RQ3_RULES_EMULATOR=1 npx vitest run lib/runnerquest3d/__tests__/rules.emulator.test.ts` and the other games' emulator suites, then deploy. No rules were deployed. Nothing is written to real patient records by any of this work.

## 11. Physical hardware / real-device tests pending
Real **iPad** (Safari touch ergonomics, orientation, sleep/wake, the library flow) and a real **projector laptop**; real network latency/offline recovery; foot sensors: **iPad Safari has no Web Bluetooth**, so physical foot sensors must connect to a Chromium Control device (laptop) — the iPad can run MANUAL only; real WT901 foot axes/thresholds/BLE behaviour (all prior limitations stand); WebGL performance on the target machine; therapist usability review of the touch layout and wording.

## 12. Production build and feature-flag status
Flag `NEXT_PUBLIC_RUNNER_QUEST_3D`: development = on unless `0`; production = **off unless `1` at build time**. Flag **on**: card in the library, `/control/runner-quest-3d` and `/display/runner-quest-3d` work (verified). Flag **off** (verified on a production build): no library card, the Display route is a true 404, the Control page renders the platform's "404 — page could not be found" and the game never mounts (HTTP status is 200 there because the existing Control layout streams first), all other games load. Rollback = unset the flag and rebuild; the additive rules can stay in place.

## 13. Remaining steps before push / deployment
1. Human review of the diff of the 13 shared files above and of the **combined** `database.rules.json` (with the Build Quest agent's changes); decide ownership of the shared files with that agent.
2. Commit (not done), then deploy rules to a **staging** Firebase project; run the emulator rule suites and a staging session with a **test patient**.
3. Preview deployment with `NEXT_PUBLIC_RUNNER_QUEST_3D=1` and the normal Firebase env; real iPad + projector laptop pass (§11), including a full session and history check.
4. Clinical/therapist review (speeds, hints, touch layout); optional: voice/audio decision, a Firebase-side "Display connected" nicety, a real WT901 foot adapter feeding `ControlRuntime.ingestFoot` on a Chromium Control device.
5. Production rules deployment and app deployment only after explicit approval; keep the flag off until then.
