# Feed the Animals — Permanent Removal Report

Completed 11 October 2026. Canonical ID `feed-the-animals` is retired from the active platform. Existing patient records and historical results remain readable. No commit, push, deployment, Firebase rules publication or production data operation was performed.

## Result and scope

Both `/control/feed-the-animals` and `/control/feed-the-animals-sensor-play` are removed and return HTTP 404 in the production browser. There is no active registry card, thumbnail, Display module, controller, gameplay engine, live serializer, sensor target mapping, audio event, prefetch configuration or exclusive game artwork left. No feature flag can re-enable the game.

Nine remaining canonical cards/routes were tested: Balloon Quest, Follow the Footsteps 3D, Bubble Pop Wall 3D, Color Chase, Space Pilot 3D, Build Quest 3D, Runner Quest 3D, Mirror Quest 3D and Safe Hex Arena 3D. The six interaction categories remain intact. Therapist manual controls and shared sensor drivers/calibration were preserved; sensor-router and shell documentation edits remove obsolete examples only. No package dependency was removed because the installed libraries are shared with remaining games.

The starting tree had extensive unrelated uncommitted work. Source backups and isolated build copies used the actual workspace contents, not an old clean Git revision. Concurrent Footsteps scene, resume support, tests and legacy route additions were preserved. A final integrated build and browser run include those additions; source hashes were checked against that snapshot. No other agent's server was stopped and no reset, stash, clean or discard was used.

## Dependency classification

| Classification | Treatment |
| --- | --- |
| Exclusive active game implementation | Delete both routes, Control/Display trees, engine/controllers, thumbnail/preview, theme CSS, sensor demo/mapping, safari Web Audio/voice lines and obsolete exclusive gameplay tests. |
| Shared platform | Remove only Feed-specific imports, union members, registry entries, event cases, ambience handles, sensor mapping and presentation constants. Keep all other games' implementations, navigation, authentication, session transport, analytics and assets. |
| Historical compatibility | Preserve stored session/stage types, original history reviver and game-specific metrics. Extract only Arabic label/formatters; separate historical IDs from launchable IDs. |

## Exact files deleted — 76

- `app/control/feed-the-animals/page.tsx`
- `app/control/feed-the-animals-sensor-play/page.tsx`
- `app/display/feed-the-animals.css`
- `components/control/feedanimals/FeedAnimalsControlScreen.tsx`
- `components/control/feedanimals/copy.ts`
- `components/control/feedanimals/live/AnimalFoodMap.tsx`
- `components/control/feedanimals/live/AnimalPathMap.tsx`
- `components/control/feedanimals/live/FeedAnimalsLiveHeader.tsx`
- `components/control/feedanimals/live/FeedAnimalsLiveProgress.tsx`
- `components/control/feedanimals/live/FeedAnimalsLiveSessionScreen.tsx`
- `components/control/feedanimals/live/FeedAnimalsStageCompleteOverlay.tsx`
- `components/control/feedanimals/live/FeedAnimalsStageStrip.tsx`
- `components/control/feedanimals/ready/FeedAnimalsReadyScreen.tsx`
- `components/control/feedanimals/setup/FeedAnimalsSetupScreen.tsx`
- `components/control/feedanimals/summary/FeedAnimalsSessionSummaryScreen.tsx`
- `components/display/feedanimals/animals/AnimalArt.tsx`
- `components/display/feedanimals/animals/AnimalWalker.tsx`
- `components/display/feedanimals/animals/ElephantWalker.tsx`
- `components/display/feedanimals/animals/GiraffeWalker.tsx`
- `components/display/feedanimals/animals/MonkeyWalker.tsx`
- `components/display/feedanimals/animals/PandaWalker.tsx`
- `components/display/feedanimals/animals/PathAnimalWalker.tsx`
- `components/display/feedanimals/animals/RabbitHopper.tsx`
- `components/display/feedanimals/animals/walkerGeometry.ts`
- `components/display/feedanimals/celebration/AnimalParade.tsx`
- `components/display/feedanimals/celebration/ButterflyCrossing.tsx`
- `components/display/feedanimals/celebration/HappyAnimalGroup.tsx`
- `components/display/feedanimals/celebration/LeafStarBurst.tsx`
- `components/display/feedanimals/celebration/SafariSparkleWave.tsx`
- `components/display/feedanimals/environment/SafariEnvironment.tsx`
- `components/display/feedanimals/environment/WaterFeature.tsx`
- `components/display/feedanimals/food/BambooCluster.tsx`
- `components/display/feedanimals/food/BananaBunch.tsx`
- `components/display/feedanimals/food/CarrotPatch.tsx`
- `components/display/feedanimals/food/FoodArt.tsx`
- `components/display/feedanimals/food/GoalArt.tsx`
- `components/display/feedanimals/food/LeafyTree.tsx`
- `components/display/feedanimals/food/WatermelonPatch.tsx`
- `components/display/feedanimals/obstacles/ObstacleArt.tsx`
- `components/display/feedanimals/path/SafariTrail.tsx`
- `components/display/feedanimals/path/__tests__/pathAlignment.test.ts`
- `components/display/feedanimals/path/pathAlignment.ts`
- `components/display/feedanimals/scenes/FeedAnimalsInstructionsScene.tsx`
- `components/display/feedanimals/scenes/FeedAnimalsPathPlayingScene.tsx`
- `components/display/feedanimals/scenes/FeedAnimalsPlayingScene.tsx`
- `components/display/feedanimals/scenes/FeedAnimalsReadyPositionScene.tsx`
- `components/display/feedanimals/scenes/FeedAnimalsSessionCompleteScene.tsx`
- `components/display/feedanimals/scenes/FeedAnimalsStageCompleteScene.tsx`
- `components/display/feedanimals/scenes/FeedAnimalsWelcomeScene.tsx`
- `lib/feedanimals/__tests__/feedGenerator.test.ts`
- `lib/feedanimals/__tests__/pathStage.test.ts`
- `lib/feedanimals/__tests__/session.test.ts`
- `lib/feedanimals/difficultyRules.ts`
- `lib/feedanimals/feedGenerator.ts`
- `lib/feedanimals/index.ts`
- `lib/feedanimals/pathCurve.ts`
- `lib/feedanimals/pathStages.ts`
- `lib/feedanimals/scoring.ts`
- `lib/feedanimals/session.ts`
- `lib/feedanimals/types.ts`
- `lib/control/feedanimals/__tests__/stagePreset.test.ts`
- `lib/control/feedanimals/smartDefaults.ts`
- `lib/control/feedanimals/stageCopy.ts`
- `lib/control/feedanimals/stagePreset.ts`
- `lib/control/feedanimals/useFeedAnimalsRealtimeControllerSession.ts`
- `lib/control/feedanimals/useLocalFeedAnimalsControllerSession.ts`
- `components/control/library/FeedTheAnimalsThumbnail.tsx`
- `components/control/sensors/FeedAnimalsSensorContactDemo.tsx`
- `components/control/setup/previews/FeedAnimalsStagePreview.tsx`
- `components/display/games/FeedTheAnimalsDisplay.tsx`
- `lib/audio/feedAnimalsVoiceLines.ts`
- `lib/audio/safariEffects.ts`
- `lib/audio/safariAmbience.ts`
- `lib/sessions/buildStoredFeedAnimalsSession.ts`
- `lib/sessions/__tests__/buildStoredFeedAnimalsSession.test.ts`
- `lib/realtime/__tests__/feedAnimalsSerialization.test.ts`

This includes the previously modified exclusive `AnimalFoodMap.tsx`, whose removal is explicitly within the discontinued-game scope. Shared sensor mapping, contact detection and other games' maps remain present.

## Exact existing shared files modified — 38

- `app/display/layout.tsx`
- `components/control/library/gameThumbnails.tsx`
- `components/control/patients/LastProgressCard.tsx`
- `components/control/patients/PatientSessionHistorySection.tsx`
- `components/control/patients/SessionDetailScreen.tsx`
- `components/control/patients/SessionHistoryRow.tsx`
- `components/control/sensors/SensorPlayPage.tsx`
- `components/control/sensors/useSensorPointerTargets.ts`
- `components/control/session/__tests__/AllGameSetupIdentity.test.tsx`
- `components/display/DisplayScreen.tsx`
- `components/display/__tests__/stageCompletionPresentation.test.ts`
- `components/display/events.ts`
- `components/display/gameDisplayRegistry.tsx`
- `components/display/useStageCompletionPresentation.ts`
- `database.rules.json`
- `docs/release/FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json`
- `lib/analytics/patientAnalytics.ts`
- `lib/audio/AudioManager.ts`
- `lib/audio/__tests__/AudioManager.test.ts`
- `lib/audio/__tests__/AudioManagerAmbience.test.ts`
- `lib/audio/__tests__/ambienceSources.test.ts`
- `lib/audio/__tests__/prefetchLines.test.ts`
- `lib/control/__tests__/topLevelNavigation.test.ts`
- `lib/footsteps3d/__tests__/libraryIntegration.test.ts`
- `lib/games/registry.ts`
- `lib/physicalInput/SensorContactRouter.ts`
- `lib/physicalInput/__tests__/gameSensorTargets.test.ts`
- `lib/physicalInput/gameSensorTargets.ts`
- `lib/physicalInput/index.ts`
- `lib/realtime/__tests__/platformRules.emulator.test.ts`
- `lib/realtime/serialization.ts`
- `lib/realtime/sessionRepository.ts`
- `lib/realtime/types.ts`
- `lib/runnerquest3d/__tests__/registry.test.ts`
- `lib/safehexarena3d/__tests__/libraryIntegration.test.ts`
- `lib/sessions/__tests__/resumeSuggestion.test.ts`
- `lib/sessions/__tests__/sessionHistoryRepository.test.ts`
- `lib/sessions/types.ts`

Mixed-game tests retain all other games' assertions. Only discontinued gameplay cases and old launchable-card expectations were removed; the base-game count now correctly expects five instead of six. The Footsteps and Safe Hex library tests still check their own registrations and every remaining base game. Patient history tests retain their old Feed records and assertions, importing the retired history ID instead of a launchable constant.

The console-ready rules export was older than the canonical rules and lacked the merged Dome/Forest validators. It was refreshed from the current canonical `database.rules.json`, preserving those validators and the retirement denial. It was not published.

## New minimal compatibility/test files

- `lib/sessions/__tests__/retiredFeedAnimals.test.tsx`
- `lib/sessions/historicalGames.ts`
- `lib/sessions/retiredFeedAnimals.ts`

`retiredFeedAnimals.ts` contains the retired ID, Arabic name and three existing numeric formatters; it contains no gameplay or session-writing code. `historicalGames.ts` resolves history labels without restoring a launchable registry entry. The retirement regression test covers absence of active integration, unchanged historical rendering/metrics and the reviewed rules export.

This report and [validation evidence](feed-animals-removal/) were also added. [Machine-readable file scope](feed-animals-removal/scope.json) records exact deletions and changes.

## Historical patient compatibility

`StoredFeedAnimalsSession`, `StoredFeedAnimalsStageResult` and the existing `reviveStoredFeedAnimalsSession` remain. Their rounds, incorrect count, completion/accuracy calculations, duration, stage status and response timing interpretation were not changed. They no longer depend on the deleted engine. The historical list, detail screen and analytics retain the label **أطعم الحيوانات** and the original game-specific metrics.

Feed-specific last-progress/resume UI and filtering were removed, so the retired game cannot be launched from patient history. Generic structural-history tests do not expose a resume action. History entries still link to their read-only patient session detail pages.

The production browser loaded an emulator-only old record with 3 of 4 rounds completed, 75% completion/accuracy and 1.5-second recorded response time, then verified both patient history and detail UI. The raw stored object remained byte-for-value equivalent after browsing. Existing Firebase patient/history data was never accessed or deleted.

## Firebase rules

Only two live authorization predicates changed in canonical rules:

1. Remove `feed-the-animals` from the `liveSession/gameId` allowlist.
2. Add a parent `liveSession` validation that rejects `newData.child('gameId').val() == 'feed-the-animals'`, including partial updates to an existing retired live record.

The second predicate closes a measured loophole: the child allowlist alone rejected new full writes but allowed a revision-only patch to an old admin-seeded record. The final emulator test proves full creation and partial continuation are denied, while active staff can clear the stale live record.

Historical Feed ID/field validation, private staff-only history reads, create-only session persistence and authorized therapist-note behavior remain. Keeping the historical create validator also allows an authenticated old client's already-finished/queued result to retain its original schema; it does not authorize another live game session. All other game validators, ownership/lease checks and rules trees were preserved. No wildcard permission or new Firebase architecture was introduced.

Rules tests used local Auth/RTDB emulators on ports 19999/19900 with explicit demo namespaces. The canonical rules and console export match. Neither was sent to production Firebase.

## Size reduction

Matched pre-/post-removal snapshots used identical dependency versions, build backend and public game flags. Source totals cover `app`, `components` and `lib`, including tests and source-generated art; public totals cover `public`. Identified later concurrent Footsteps additions are excluded from this matched reduction and are included in the separately validated final integrated snapshot.

| Measurement | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Source files | 884 | 811 | 73 net files |
| Source bytes | 5,207,086 | 4,727,820 | 479,266 (9.20%) |
| Public asset files | 3 | 3 | 0 |
| Public asset bytes | 3,781,098 | 3,781,098 | 0 |
| Production static JavaScript files | 109 | 105 | 4 |
| Production static JavaScript bytes | 3,854,888 | 3,657,883 | 197,005 |
| Aggregate gzipped JavaScript bytes | 1,156,002 | 1,106,824 | 49,178 |
| Production static CSS bytes | 201,543 | 194,101 | 7,442 |
| Aggregate gzipped CSS bytes | 42,789 | 41,920 | 869 |

76 exclusive files totaling 458,344 bytes were deleted; shared-case cleanup supplies the additional net reduction, offset by the minimal compatibility/test files. The game had no exclusive files under `public`: its source-generated animal/food/environment/celebration art, thumbnail/CSS and synthesized audio implementation were removed. All three shared public assets remain unchanged.

Bundle totals sum generated static assets across all routes; gzip totals sum independently compressed files. They are not a per-page transfer estimate or a measured FPS/Web Vitals improvement. No runtime performance improvement is claimed. See [raw size measurements](feed-animals-removal/sizes.json), [pre-removal comparison build](feed-animals-removal/baseline-build.log) and [matched post-removal build](feed-animals-removal/production-build.log).

## Regression validation

| Gate | Final result |
| --- | --- |
| TypeScript | Pass in a fresh isolated latest integrated workspace with regenerated Next route types: `npx tsc --noEmit --incremental false`; [log](feed-animals-removal/typescript.log). |
| Full ESLint | Pass, zero errors and zero warnings in the final rerun; [log](feed-animals-removal/eslint.log). |
| Focused compatibility/audio/sensor/setup tests | 12 files, 111 tests passed; [log](feed-animals-removal/focused.log). |
| Full Vitest | 144 files / 1,787 tests passed, including concurrent Footsteps tests; 8 files / 58 conditional tests skipped; [log](feed-animals-removal/vitest.log). |
| Relevant emulator rules | 23 tests passed across shared platform, Dome and Forest suites; [log](feed-animals-removal/rules.log). Conditional emulator suites were enabled explicitly. |
| Production build | Pass with Next.js 16.3.1 webpack; matched comparison and final latest integrated builds both passed, including TypeScript and route generation; [latest build](feed-animals-removal/integrated-build.log). |
| Production browser | Pass in independent Control/Display contexts, no JavaScript page errors; [results](feed-animals-removal/browser.json). |
| Diff hygiene | `git diff --check` passed. |

An initial test still expected six base cards; its expectation was updated to five because the game is permanently removed, and the full suite passed again. Initial root TypeScript encountered stale generated route imports for the deleted pages; validation regenerated route types in isolated copies instead of interfering with another agent's development cache. Initial isolated Turbopack rejected an external `node_modules` symlink, so production builds used Next's supported webpack backend; application build configuration and dependencies were not changed.

## Browser navigation and UI evidence

Production testing used emulator-only settings, a 1024×1366 touch-sized Control viewport and a separate 1600×900 Display context. All remaining opt-in game flags were enabled for coverage in the isolated build; actual workspace/deployment flags were not edited.

Verified:

- No Feed the Animals library card, thumbnail or navigation link.
- Both deleted Control routes return HTTP 404.
- Exactly one card per remaining game, nine total, with all six library categories intact.
- Each of the nine remaining canonical Control routes returns HTTP 200 and renders its UI controls without page errors.
- Historical Feed patient/list/detail UI remains readable and has no retired-game launch link.
- An admin-seeded old Feed live fixture cannot mount an active renderer; Display returns to its waiting experience.
- Dome therapist direction input changes the authoritative cursor and reaches the independent Display through the shared live record.

Screenshots: [library](feed-animals-removal/library.png), [historical patient](feed-animals-removal/historical-patient.png), [historical session](feed-animals-removal/historical-session.png), [retired Display waiting](feed-animals-removal/retired-display-waiting.png), [manual Control](feed-animals-removal/manual-control.png), [Dome Display](feed-animals-removal/dome-display.png). The [browser recipe](feed-animals-removal/browser.cjs.txt) is archived as text and contains local test-machine paths, which require adaptation to rerun elsewhere.

Navigation/manual smoke checks supplement the complete existing game regression suite; they are not physical sensor/device validation or a full new gameplay acceptance run for every unchanged game.

## Remaining references and why

- `lib/sessions/types.ts`, `sessionHistoryRepository.ts`, `retiredFeedAnimals.ts`, `historicalGames.ts`: required old-record schema, revival, formatting and labels, separate from active game IDs.
- Patient history rows/detail and shared analytics: required original results and Arabic labels.
- History repository and generic structural-history tests: protect existing stored record compatibility; no active route is registered.
- Platform/Build rules tests: protect legacy immutable history; platform tests additionally assert retirement denial for full and partial live writes.
- `database.rules.json` and its console export: explicit live denial plus minimum historical validation.
- Older release reports, request notes and evidence under `docs`: historical provenance, not imported application code or launch configuration. Their old activity lists are superseded by this removal report. The executable console rules artifact was refreshed rather than left stale.
- This report and new evidence: document removal and regression results.

A final reference scan found no Feed runtime references in `app`, sensor/audio implementation, shared drivers, scripts or tools. No exclusive gameplay tree or dangling import remains.

## Deployment considerations and blockers

No software removal blocker remains. Changes are prepared locally and have not reached production. The existing deployed application/rules will continue their old behavior until an authorized coordinated batch release.

Before that release, end any active Feed session and save its result with the existing client, coordinate with the other in-progress game work, then deploy the reviewed application and current additive canonical rules/export together. Old open clients will have Feed live writes rejected; authorized staff can clear a stale live record. Do not migrate, delete or relabel historical patient records. Preserve all other games' public flags, auth, lease, sensor and session configuration. If more concurrent changes land after this validated snapshot, rerun the integrated release gate for that new snapshot.

**FEED THE ANIMALS REMOVED — Remaining Shumos games and historical records preserved.**
