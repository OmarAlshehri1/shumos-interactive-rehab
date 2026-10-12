# Shumos Care — unified game architecture report (2026-10-10)

Written for: the project owner, ahead of the batch deployment. Nothing was committed, pushed or deployed, and no Firebase rules were published. All Firebase testing used local emulators; the real `.env.local` was never used for a server. Supersedes the architecture parts of `FOUR_GAME_RELEASE_REPORT.md` and the per-game `DATABASE_RULES_FOR_FIREBASE_CONSOLE.json` files in `docs/{balloonquest3d,buildquest3d,spacepilot3d}/` (those still contain the retired trees: do not publish them).

## Status
| Migration | Status |
|---|---|
| Build Quest 3D → shared `/liveSession` | **COMPLETE** |
| Space Pilot 3D → shared `/liveSession` (session, state, ownership, patient binding, recovery, history) | **PARTIALLY COMPLETE, by design:** two small paths stay under `spacePilot3d/` as documented exceptions (Display acknowledgements, remote sensor relay) |
| Balloon Quest, Runner Quest | already on `/liveSession`; now also use the shared controller hook / ownership rules |
| Original six games | untouched (rollback routes kept); regression-tested |

So: no game has its own session tree, lease or cloud protocol any more, but one game-named node (`spacePilot3d`, 99 rule lines) still exists for the two exceptions in §12.

## 1. Original architecture (the source of truth)
`/liveSession` (one record: game id, strictly increasing revision, free-form `session` block; staff-only writes; Display read-only), `/controllerLease` (client-enforced, 45 s), `/presence/{controller,display}`, `/sessions/{patient}/{id}` (create-only history, per-game required fields). Shared code: `lib/realtime/sessionRepository.ts`, `lib/games/registry.ts`, `components/display/gameDisplayRegistry.tsx` (Display dispatch by game id).

## 2. Final shared architecture
* **One live record, any number of games.** A game publishes `{engine, …generic fields…, <engineBlock>}` into `liveSession.session` (free-form under the rules). The Display needs only a registry entry. Records carry the platform ownership facts (`controlTabId`, `heartbeatAt`, `takeoverFrom`, `ownerId`).
* **New shared runtime `lib/liveGame/`** (see §5).
* **Display:** `/display` is the original `DisplayScreen` again (`app/display/page.tsx` is identical to the committed original); the registry has `build-quest-3d`, and `space-pilot` routes by engine (`sp3` → 3D scene, untagged → original Space Pilot).
* **History:** the existing create-only `sessions` path, existing `saveSessionHistoryOnce`; Build/Space use their versioned record types.

## 3. Build Quest migration — COMPLETE
`cloudState.ts` now builds/validates a live record (`engine: "build3"`, accepted discrete state as one JSON string, ≤ 32 KB); `useFirebaseSession.ts` runs on the shared hook, publisher, ownership and history saver; Display module renders the accepted state; the dedicated tree, repository, `active` pointer and router were removed. Gameplay, nine stages, touch workbench, RIGHT_HAND, manual priority, pause/resume/restart/skip/end and the history shape are unchanged. A finished session is never reopened (a fresh one starts; its history is re-saved idempotently). Browser: **12/12** (nine stages by touch under 150 ms simulated latency, reload recovery, sensor loss, handheld, offline/reconnect, history, second window blocked) + take-over **7/7**.

## 4. Space Pilot migration — PARTIALLY COMPLETE
Moved to the shared record: session state (`sp3` block: bounded checkpoint JSON with the state, the presentation frame the Display draws, mission clock), window ownership and reload recovery (adopted paused, new epoch), patient binding (`liveSession.patientId`), history save-once, the lease/presence plumbing (shared controller hook), Display routing. The 10 Hz flight checkpoint **does ride on `/liveSession`** at the same cadence: measured identical to the dedicated room (§11), so no specialized transport was needed for it. Removed: rooms, `active`, `patients` rules, repository functions, router.
**Retained as documented exceptions** (`spacePilot3d/presence/{session}/{displayUid}`, `spacePilot3d/sensor/{session}`):
1. Display → Control acknowledgements (the Display proves it is visible and has rendered before flight may start). The live record is Control → Display only, so this needs a node the anonymous Display may write.
2. The remote RIGHT_HAND relay from a second staff device (iPad Safari has no Web Bluetooth). This should become a game-agnostic relay later.
Both are **re-anchored to the live record in the rules** (owner token, epoch, run, owner uid, session id, and "live record updated within 20 s"), so they remain server-validated. Browser: **12/12** including the laptop sensor relay with 2 minutes of clock skew, all nine mode×difficulty configurations, three missions with 15 rings, reload, offline, walk-in (no history) + take-over/blocked.

## 5. Shared runtime components (`lib/liveGame/`)
| File | Role |
|---|---|
| `ownership.ts` | window id (sessionStorage), `decideRecovery` (same account/patient, valid snapshot, age, same window → recover, other live window → blocked unless explicit take-over and same patient, stale → recover), `isTakenOver`, `ControlFreshness` (Display liveness by local receipt time only) |
| `publisher.ts` | generic coalescing `/liveSession` publisher (one write in flight, rebase + back-off, heartbeat, ownership stamps) |
| `useLiveGameController.ts` | staff auth, controller lease (claim/refresh/takeover), connection + Display presence, stable `getLive()` facts — extracted from the Balloon/Runner hooks |
| `historySaver.ts` | save-once guard with retry pacing and a UI status |
| `useControlAlive.ts` | Display hook over `ControlFreshness` |
Adopted by: Build Quest, Space Pilot, Balloon Quest (hook + ownership decision), Runner Quest (hook). The Balloon/Runner engines, protocols and revivers are unchanged. Per-game code stays: simulation, scoring, rendering, input adapters, record block + reviver.

## 6. Files
**Created:** `lib/liveGame/{ownership,publisher,historySaver,useLiveGameController,useControlAlive}.ts`, `lib/liveGame/__tests__/liveGame.test.ts`, `components/display/games/{BuildQuestDisplayModule,SpacePilotDisplayModule}.tsx`, `components/display/{buildquest3d/BuildQuestDisplayEntry,spacepilot3d/SpacePilotDisplayEntry}.tsx`, `docs/release/validation/{legacy-smoke,takeover}.mjs`, `docs/release/evidence/*`, this report.
**Rewritten/modified:** `lib/buildquest3d/{cloudState,useFirebaseSession,history,useSession}.ts`, `lib/spacepilot3d/{cloudState,firebaseControlRuntime,firebaseDisplayRuntime,history}.ts`, `lib/realtime/{sessionRepository,types,spacePilotRepository}.ts`, `lib/games/registry.ts` (Build Quest is a full `GameId`), `lib/audio/AudioManager.ts` (+ a type-only edit in `prefetchLines.test.ts`), `lib/balloonquest/recovery.ts`, `lib/control/{balloonquest3d,runnerquest3d}/*Control.ts`, `lib/control/spacepilot/useSpacePilotRealtimeControllerSession.ts` (one guard: the original controller never adopts a 3D record), `components/control/{buildquest3d/BuildQuestControl,balloonquest3d/BalloonQuestControl,spacepilot3d/SpacePilot3DControl,spacepilot3d/SpacePilotSensorSource}.tsx`, `components/display/{DisplayScreen,gameDisplayRegistry,buildquest3d/BuildQuestDisplay,spacepilot3d/SpacePilot3DSessionDisplay}.tsx`, `app/display/page.tsx` (back to the original), `app/display/{build-quest-3d,space-pilot}/page.tsx`, `database.rules.json`, the Build/Space cross-device scripts, tests (below).
**Removed:** `lib/realtime/buildQuestRepository.ts`, `components/display/buildquest3d/BuildQuestDisplayRouter.tsx`, `components/display/spacepilot3d/SpacePilotDisplayRouter.tsx`; rules `buildQuest3d` tree and `spacePilot3d/{rooms,active,patients}`.
**Tests changed (not weakened):** Build `crossDevice` and `rules.emulator`, Space `crossDevice` and `rules.emulator` were rewritten to test the same guarantees on the new record (room-fencing tests that no longer have a subject were replaced, see §8); Balloon recovery test updated for the stricter ownership rule. No test was deleted without an equivalent.

## 7. Firebase rules, before/after
| | Original (HEAD) | Before this task | Now |
|---|---|---|---|
| Lines | 168 | 660 | **425** |
| Bytes | 11.5 KB | 46.1 KB | **25.5 KB** |
| `buildQuest3d` | – | 111 | **0** |
| `spacePilot3d` | – | 223 | **99** (presence + sensor only) |
| `liveSession` | 35 | 40 | 40 |
Per future game that follows the platform pattern: **0 tree lines**; the only rule touch points are the `gameId` entry in `liveSession`, the history required-fields branch and (optionally) the history shape fields. Note the history `.write` rule is one very long line, so its *line* count did not change although its text shrank from 2,951 to 370 characters (−87%).
`docs/release/FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json` is a byte copy of `database.rules.json` (SHA-256 `c76e462f36e18a520a37e414b01d5ca17d860d113d90382bfc8e8a6bdc516dfe`). Re-check the hash before publishing.

## 8. Security comparison
| Protection | Before (dedicated trees) | Now |
|---|---|---|
| Staff-only authoritative writes | yes | yes (`liveSession`, `sessions`) |
| Revision ordering | per-room epoch+revision | server-enforced strictly increasing revision (same as the original six) |
| Ownership fencing against a second window | **server-enforced** token/epoch/12 s lease with transactions | **client-enforced**: window id + heartbeat + explicit take-over (hand-over marker), on top of the cooperative controller lease. This is the original six games' model. **Weaker server-side**; acceptable under the trusted-staff threat model, and covered by browser tests (blocked, take-over, stood-down). |
| History bound to server-side room counters | yes (counters had to match the room) | **removed** (no room). Replaced by: create-only, creator = caller, patient must exist, strict shape, and self-consistency rules for Space Pilot (score = collected × 100, rate exact, missed bounded, upgrade ≤ 3). Any active staff member may write a record for an existing patient, as for the original six. A staff member who owned the room could forge both room and history before, so the guarantee mostly caught bugs. |
| Patient identity in anonymous-readable data | not present | **now present, like the other 9 games:** `liveSession.patientId` (opaque key) and the child's first name are readable by the anonymous Display. Privacy cost of unification; a future change could publish a Display-only projection. |
| Display read-only | yes | yes. The ack channel and relay are server-validated against the live record, and now also require it to be fresh (≤ 20 s). |
| Duplicate / stale event rejection | client | client (unchanged; unit-tested for Build placements, Space actions, Balloon events) |
| Immutable history, legacy compatibility | yes | yes (legacy records and star-history preserved, tested) |
Unrelated open issues from the audit remain: `presence/display` is writable by any signed-in user, and anonymous sign-in exposes the live record to anyone with the public web config.

## 9. Test results
| Gate | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| ESLint, whole repo | 0 errors, 0 warnings |
| Vitest, full repo | 137 files passed (3 skipped opt-in); **1,764 tests passed**, 21 skipped (the four emulator-only suites, run separately) |
| New/changed unit tests | `liveGame` 12 (ownership decisions, publisher coalescing/retry/heartbeat, history saver); Build live record (strip/revive, tamper, recovery); Space live record; Balloon recovery 17 |
| Firebase emulator rules (Auth + RTDB, final rules) | **22/22**: Balloon 4, Build 6, Space Pilot 5, Runner 7. Covers staff/inactive/non-staff/anonymous, revision order, name bounds, game-id enum, retired-path denial, history shape/forgery/overwrite/patient existence, ack/relay binding and staleness, legacy history. Re-run twice for repeatability |
| Production build, all flags on | succeeds; all routes 200 |
| Production build, flags off (+ Balloon legacy flag) | succeeds; Build/Runner Control render not-found and their Displays 404; Space Pilot serves the original; Balloon legacy route kept |

## 10. Cross-device browser results
Method: Chrome, Control = iPad-sized touch context, Display = separate context/profile, Firebase emulators, production build (dev server only where noted because test hooks/simulators are hidden in production). **Not a real iPad/projector.**
| Game | Suite | Result |
|---|---|---|
| Build Quest | cross-device (nine stages by touch, 150 ms latency, reloads, RIGHT_HAND sim, sensor loss, handheld, offline, history, second window) | 12/12 |
| Space Pilot | cross-device (touch steering, nine mode×difficulty configs, three missions/15 rings, sensor relay with clock skew, reload, offline, walk-in) | 12/12 |
| Balloon Quest | production nine-stage flow; reload recovery (moving balloons, paused, completion, second window); manual fallback and sensor-loss + reload (dev) | no failures; 26/26; 11/11; 8/8 |
| Runner Quest | production flow; nine stages by touch (dev); workflow (sensor loss, reloads, stale commands, history; dev) | 18/18; 17/17; 41/41 |
| Build + Space | window take-over / blocked / stood-down, Display follows, no history written by the hand-over | 12/12 |
| Original six | each game started from its own Control publishes into the shared record and renders on a separate Display; library lists all games | 14/14 |
Not re-run in this pass: Balloon "Flow B" (pause/restart/skip/end sheet/legacy rollback in production; the Runner workflow and legacy smoke cover the same platform paths), the no-Firebase local mode of Build/Space (code path unchanged, unit-tested), 60-minute soak, real WAN.

## 11. Performance (measured, same machine, same suite)
| | Before (dedicated room) | After (shared liveSession) |
|---|---|---|
| Space Pilot flight, 110 s: accepted writes | 970 (≈ 8.8/s) | 973 (≈ 8.8/s) |
| Space Pilot checkpoint payload, average / max | 5.0 KB / 7,684 B | 5.0 KB / 7,685 B |
| Space Pilot Display frame rate (3D scene) | 60.0 fps, p95 16.8 ms | 60.0 fps, p95 16.8 ms |
| Build Quest nine-stage payload | 1,245 B | 1,245 B |
| Runner touch → Display latency (local emulator) | p50 17 ms | p50 17 ms (p95 124 ms) |
The shared record adds about 0.4 KB of wrapper fields per write (name, window id, heartbeat); I did not measure total bytes on the wire. Build Quest's idle heartbeat is one write per 4 s (was a transaction every 3 s). No improvement is claimed beyond: no regression measured, and 45% smaller rules text (bytes).

## 12. Remaining specialized exceptions
`spacePilot3d/presence` (Display acks) and `spacePilot3d/sensor` (remote hand relay), reasons in §4. Not migrated: the original six games' own controller hooks (by instruction). Duplication that remains: Balloon and Runner still own their publishers/revivers/protocol (`lib/balloonquest/live.ts`, `lib/runnerquest3d/live.ts`); the generic publisher is used by Build and Space only.

## 13. Remaining deployment requirements
1. Publish the complete rules file (§7) **before** deploying the application: the new client writes `build-quest-3d` / `engine: "sp3"` records that the old rules reject, and removed trees must not be needed by any deployed client.
2. Vercel flags unchanged: `NEXT_PUBLIC_SPACE_PILOT_3D_ENABLED=true`, `NEXT_PUBLIC_BUILD_QUEST_3D_ENABLED=true`, `NEXT_PUBLIC_RUNNER_QUEST_3D=1`, `NEXT_PUBLIC_BALLOON_QUEST_LEGACY` unset; no emulator variables.
3. Physical checks still pending: real iPad touch, projector laptop, WT901 RIGHT_HAND with each game and the Space Pilot sensor laptop, real network latency.
4. Re-run the gates on the final tree if anyone edits it (the Space Pilot files were previously being edited by another agent; I edited them here under your instruction).

## 14. Rollback
Per game by flag (see 13.2) and redeploy; legacy routes remain (`/control/balloon-quest-legacy`, `/control/space-pilot-legacy`). Do not revert the rules while new clients are active. If the application must go back to a build older than this change, those builds need the old trees: keep the previous merged rules file (not `docs/release/…`) available and republish it with the old build. Room/active data was always ephemeral and history lives in `sessions`, so no data migration or deletion is needed in either direction.

## 15. Integrating a future game
1. Registry: add the game to `lib/games/registry.ts` (`GameId`, entry, id constant, thumbnail) and a Control route.
2. Record: define `YourLiveSession` = generic fields (`sessionId, seed, createdAt, gameState, currentDifficulty, currentStage, config.childFirstName`) + `engine` tag + your block extending `LiveControlMeta`; write `reviveYourLive` (strict; fail closed) and add one branch in `parseLiveSessionValue` and the `AnySessionState` union.
3. Control: `useLiveGameController()` for auth/lease/presence; `LiveRecordPublisher` for writes (`publish`, `touch(HEARTBEAT_MS)`, `setTakeoverFrom`); `decideRecovery` + `controlTabId`/`isTakenOver` for reload recovery and hand-over; `HistorySaver` + `saveSessionHistoryOnce` for history; keep manual control always available and make sensors optional. Build Quest's `useFirebaseSession.ts` is the shortest worked example.
4. Display: one module in `GAME_DISPLAY_MODULES` that renders the record read-only; `useControlAlive` for "Control connected".
5. Rules: add the game id to `liveSession.gameId`, one `hasChildren` branch (+ optional shape fields) in `sessions`. **No new top-level node.** Add an emulator test for the record and history.
6. Audio: if silent, map it in `AudioManager` like the other 3D games.
