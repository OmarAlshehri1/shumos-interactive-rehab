# Harvest Valley 3D — final report

Harvest Valley 3D implementation and game-specific validation complete. Release acceptance is BLOCKED by concurrent Pearl Voyage TypeScript/build and source ESLint errors.

Validation: 11 October 2026, Asia/Riyadh. Arabic: **موسم الحصاد**. Game ID: `harvest-valley-3d`. Projection: **WALL**.

## H1–H13

| Gate | Area | Result |
| --- | --- | --- |
| H1 | Platform architecture | PASS: Reuses registry, Control/Display, shared liveSession, lib/liveGame, staff auth, lease/presence, versioned patient history and Fire Rescue calibration. |
| H2 | 3D countryside | PASS: Original detailed countryside matte behind real instanced crops, terrain, foliage, roads, fences, barns, rural lighting and soft shadows. |
| H3 | Combine harvester | PASS: Original mechanical model with cabin/glass, grain hopper, auger, rear grille, lights, exhaust, ladders/rails, tyre treads, animated front drive wheels, rear steering and operating header. |
| H4 | Accessible driving | PASS: Real pose responds to steering/throttle/brake. Small ranges, gain/dead zones, thresholds, low speeds, hold expiry, row guidance, boundary stopping and reset. |
| H5 | Spatial coverage | PASS: Deterministic crop cells intersected by a swept harvesting header. Deduplication, reduced area goal, separate assistance, visible stubble, grain and explicit therapist advancement. |
| H6 | Crop behaviour | PASS: Golden wheat, green grass and decorative flower materials; seeded density/height variation, soft wind, dust/grain, quiet rewards and low/reduced-motion settings. |
| H7 | Nine stages | PASS: Exactly three levels × three stages; straight rows, adjacent rows, meadow, broad curve, larger field, separated zones and grand field. |
| H8 | Accessibility | PASS: Arabic settings, seated participation, automatic steering/throttle, width, goal, field size, movement range, guidance, reduced camera, contrast, mute/volume and graphics presets. |
| H9 | Manual controls | PASS: Large touch steering/pedal/brake, sliders, auto-drive, harvest switch, repeat, reposition, selection, assist, skip, pause/resume, restart, end and results. |
| H10 | Platform sync/history | PASS: Shared authoritative Control publishing, read-only Display, strict revivers, staff ownership, takeover protection, paused reload recovery and save-once non-clinical history. |
| H11 | Device preparation | PASS: Fire Rescue axis adapter reused; mapping, centre/rest, min/max, inversion, thresholds and disconnect/manual override. No remote wheel relay claimed. |
| H12 | Validation | BLOCKED: Focused/full tests, full lint, TypeScript, emulator rules, enabled/disabled production builds, independent browser gameplay, screenshots/video and measurements. |
| H13 | Release candidate | BLOCKED: One WALL card, correct routes, original thumbnail, existing library arrangement, flag/rollback and batch checklist. |

## Platform protection and implementation

This is an addition to the existing Shumos application. It adds no Firebase project, game-specific session tree, authentication system, synchronization protocol or separate history repository. Existing `lib/liveGame` controller, coalescing publisher, staff auth, controller lease, presence, session repository, ownership/recovery and HistorySaver are reused. Control is authoritative; Display renders decoded snapshots. No Three.js geometry is sent to Firebase. The new game is the `hv3` tagged session/result variant, engineVersion/resultVersion 1.

The starting tree contained substantial unrelated uncommitted work and retired Feed the Animals deletions. It was preserved. Concurrent Pearl Voyage code appeared during development and its game code was not edited; transient lint errors in those in-progress files were left to that work and the final lint was rerun. No reset, stash, clean, discard, commit, push, deployment or real Firebase rule publication occurred. No other agent's server was terminated. QA used current uncommitted source snapshots under `/tmp/harvestvalley3d-qa`, dedicated `.harvest-*` build directories, localhost app ports 3303/3304, and local demo Firebase ports 19970/19979. This prevents interference with the shared `.next` cache and other servers. Local Next server/client and distDir guides were read before implementation. Webpack was used because linked dependencies sit outside the snapshot's Turbopack root; the existing font configuration was preserved. All Firebase test writes target loopback demo namespaces.

## Visual architecture and vehicle

The original generated countryside matte supplies distant mountain, sky, cloud and forest detail. It is an atmospheric background, not a claim that those pixels are navigable geometry. A screen-space ground transition blends that background into the real 3D foreground. Actual crop instances, terrain, soil/stubble patches, roads/ruts, fences, farm buildings/silos, bushes, tree trunks/branches and instanced individual canopy leaves supply depth. Terrain textures and crop/foliage geometry are original procedural work. No model, texture, logo or image from Farming Simulator or the attached reference was copied.

The combine has full-size proportions, a curved/bevelled panel structure, tapered grain hopper, glazed framed cabin and seat/steering wheel, front drive wheels and smaller rear steering wheels, tyre treads, wheel hubs, fenders, head/rear lights, grille/vents, access steps/rails, exhaust, auger, grain storage, cutter teeth, rotating reel and screw. Wheels follow travelled distance and rear steering follows input/turning. Header equipment and restrained particles operate during harvesting; grain height grows with accepted coverage. A small suspension movement is disabled by reduced motion. This is an original stylized farming machine, not a licensed industrial simulator or an AAA rendering claim.

Default camera follows behind and above the vehicle with a stable forward view, smooth pose/camera interpolation, no shake and no aggressive zoom. Reduced motion uses a fixed wider camera. Display retains the 16:9 wall aspect. Control uses an economical low-detail preview to reduce tablet/GPU work while the Display follows the selected high/medium/low preset. Screenshots were actually inspected and the first sparse scene was improved with dense crops, original countryside, detailed foliage and refined machinery before acceptance.

Level 1 uses golden wheat, warm light and the wheat-valley farm; level 2 uses green meadow/grass, greener foliage, pine borders and a different barn placement/lighting; level 3 uses a broader countryside field, multiple farm structures, golden final crops and a decorative flower crop in the separated-zone stage. These change crop layout, vegetation, buildings and lighting, not only a background colour. Completion warms the scene slightly, fills the grain objective and adds restrained golden particles with a friendly Arabic message; reduced motion suppresses particles.

## Deterministic harvesting and scoring

Each stage creates a seeded spatial grid with stable cell IDs, crop type, world coordinates and visual density. The vehicle integrates actual steering, throttle, braking and heading at bounded steps. A swept header segment checks each cell against the header's lateral width and forward depth, avoiding missed coverage between ticks. Only previously uncut, non-skipped intersected cells are accepted while harvesting is active and the vehicle moves. Idle elapsed time never adds progress. Each accepted ID is stored once; repeated driving over it cannot add grain or score.

Required cells = ceil(stage harvestable cell count × configured coverage / 100), with at least one. Progress is accepted cells / required cells, capped at 100%. This objective can cover 5–100% of the configured field, independent of decorative surroundings. Harvested crop stalks visibly shorten and soil/stubble patches appear. At the objective the vehicle stops, automatic drive switches off, and the therapist chooses the next stage. No forced timer, collision penalty, falling or irreversible failure exists.

Guidance uses deterministic approach/harvest waypoints, gentle turns and slower turning speed. The therapist can reposition to a selected remaining cell/zone, widen the effective header or explicitly confirm assisted coverage. Manual therapist driving, therapist repeat/reposition setup, row/auto steering, pedal-guided driving and direct confirmations are recorded as assistance; calibrated hardware driving without assistance is distinguishable. These are activity counts, not clinical independence or outcome scores.

Repeat/reposition preserve earned coverage, grain and stage results. Skip-objective records a skipped cell without harvesting it or reducing the goal; use therapist assistance on a remaining goal or skip the stage if an objective is unsuitable. Skipped stages and partial coverage remain honest partial/skipped results. Already completed stages never become skipped. Restart creates a distinct immutable history run ID. Stage selection is available outside active driving and preserves other archived stages.

## Nine stages

| Level | Stage | Layout | Full objective cells |
| --- | --- | --- | ---: |
| Golden Wheat Valley | 1 | One short straight row | 6 |
| Golden Wheat Valley | 2 | Two adjacent rows, assisted turns | 16 |
| Golden Wheat Valley | 3 | Small rectangular area | 32 |
| Green Meadow Farm | 1 | Three gentle rows | 27 |
| Green Meadow Farm | 2 | Grass meadow | 60 |
| Green Meadow Farm | 3 | One broad curve | 36 |
| Grand Harvest Countryside | 1 | Larger wheat field | 72 |
| Grand Harvest Countryside | 2 | Separated decorative-flower zones; optional repositioning | 48 |
| Grand Harvest Countryside | 3 | Grand harvest field | 96 |

## Therapist controls and accessibility

The touch interface has left/right hold buttons and steering slider, throttle hold/slider, brake, assisted auto-drive, harvest on/off, map selection, assisted cell confirmation, repeat row, reposition, pause/resume, restart, stage selection, objective/stage skip, next, end and results. These operate the real engine; automatic driving physically traverses cells instead of instantly granting success. Manual steering and pedal authority remain available in every participation mode, including when a wheel was previously selected. The map shows cut, uncut, active, skipped cells and vehicle pose.

Arabic settings include manual/steering-only/pedal-only/combined participation, 5–100% coverage, field size, effective width, movement range down to 0.05, speed down to 0.3, gain/dead zones, pedal threshold, assistance strength, auto steering/throttle/harvest, input hold expiry, target guidance, reduced motion, contrast, audio/volume and graphics presets. Config changes occur before a stage; pause/change stage/restart when a new objective is needed. Focus loss releases manual throttle and brakes; connection loss freezes the engine and requires explicit resume. The field boundary includes vehicle-length margin even for reduced fields, verified by additional tests.

The child may remain seated. The therapist determines positioning and actual safe physical demands. The game does not infer joint angles, balance, anatomical accuracy or rehabilitation effectiveness.

## Wheel/pedal preparation and limits

`lib/harvestvalley3d/input.ts` delegates to Fire Rescue's existing calibrated axes and Gamepad sampler. UI exposes device index, steering/accelerator/brake axis IDs, centre, min/max, rest/pressed values, dead zones and inversion; calibration is saved locally. Engine adds steering gain, small activation range, pedal threshold and hold expiry. Device disconnect pauses and stops; large manual controls remain available.

Gamepad input runs only on the authoritative Control browser/device. Browser support, exact physical axis layout, Safari support and HID/force feedback are not assumed. A wheel on a separate Windows/Mac machine cannot currently relay to the therapist's iPad through this game; **remote wheel relay remains pending**. No new Firebase hardware node was invented. The complete manual path is available now. Synthetic Gamepad tests do not constitute real wheel/pedal validation.

## Firebase rules, history and privacy

The rules add the single game ID, hv3 engine metadata/payload bounds, lease-owner and tab protection, heartbeat bounds and takeover semantics on the existing `liveSession`. Different staff, anonymous clients, forged owners, duplicate revisions and competing tabs are rejected. JSON payload shape is validated by strict client revivers; Firebase rules bound the string/metadata rather than claiming JSON parsing. Existing game validators remain intact.

Versioned history uses the existing `/sessions/{patientId}/{sessionId}` system: completed/skipped stages, harvested cells, requested cell coverage, assisted actions, skipped/repeated objectives, participation mode and session completion. It requires an existing patient, matching creator/path and immutable create-only write. Counts are integer-bounded, clinical accuracy fields are rejected, and unknown fields are denied. Shared naming, detail rows, history and analytics show Arabic activity counts. Real rules were not published; the console snapshot was synchronized to the latest source rules, including the parallel Pearl Voyage additions, and is prepared for batch review. No game validators were removed.

Patient identifiers stay in the platform's private binding and are absent from the Display-readable live record. Independent browser contexts exercise the actual shared Firebase route rather than relying on same-device BroadcastChannel. Reloaded running sessions resume paused, with stopped vehicle/cleared input. Bound history saves once; walk-in sessions do not create patient history.

## Validation

- Focused Harvest tests: **16 passed**; full default nine-stage assisted driving, expanded/reduced fields, spatial sweeps, idle/no duplicates, input expiry, manual authority in every mode, token deduplication, repeat/skip integrity, strict serialization/history and reused device mapping.
- Full Vitest: **1902 passed**. See the complete log for concurrently added tests and environment-skipped suites.
- Firebase emulator: **16 passed** (4 Harvest security tests + 12 shared platform tests). Rules loaded into each demo namespace before the suites; no permissive test namespace accepted as proof.
- Harvest final-source enabled build and fresh TypeScript: PASS. Earlier protected flag-disabled build/routes: PASS. Latest merged enabled/disabled builds and TypeScript: BLOCKED by TS2352 in the concurrently added Pearl Voyage rules test. Harvest source ESLint: PASS. Full repository source ESLint: BLOCKED by concurrent Pearl Voyage errors.
- Independent browser acceptance: nine touch-initiated spatial stages with accessible objectives; all participation selections, actual steering/pedal/brake, harvest switch, assistance, auto-drive, no duplicate coverage, 0–100%, pause/resume, repeat/reposition, skips, stage advancement, restart, both reloads, competing tab denial, real history UI and save-once, audio gesture/global mute, one WALL library card and existing Blooming World/Fire Rescue/Balloon Quest routes.
- Browser page errors: **0**. Detailed synchronization checks: **62**. Browser objectives intentionally use 20% coverage to exercise the small-goal path; engine tests also complete all nine full default fields.
- Synthetic device: mapping, pedal-only driving, disconnect pause and manual override passed. Walk-in/privacy: completed without patient history.

## Measured performance

GPU: `ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)`. Two independent app contexts ran on the same Apple M1 computer. These are local browser observations, not physical wheel, iPad, separate-network or projector benchmarks.

| Scene | FPS | Draw calls | Triangles | Geometries | Textures |
| --- | ---: | ---: | ---: | ---: | ---: |
| wheat-0 | 45 | 1022 | 1,434,240 | 791 | 6 |
| wheat-start | 50 | 1022 | 1,434,240 | 791 | 6 |
| wheat-50 | 47 | 1022 | 1,434,240 | 793 | 6 |
| wheat-100 | 54 | 1013 | 1,431,996 | 794 | 6 |
| meadow-start | 44 | 1112 | 852,524 | 865 | 6 |
| meadow-50 | 53 | 1006 | 846,252 | 892 | 6 |
| meadow-100 | 60 | 943 | 841,124 | 893 | 6 |
| grand-start | 44 | 906 | 2,107,808 | 686 | 6 |
| grand-50 | 49 | 864 | 2,098,000 | 699 | 6 |
| grand-100 | 47 | 874 | 2,100,628 | 700 | 6 |
| accessibility-low | 53 | 379 | 401,084 | 375 | 4 |

Observed scene rates: **44–60 FPS**. High includes shadow passes; medium meadow and economical reduced-motion captures are identified in the browser scenario. Shared crop geometry/materials and instanced plants/canopy reduce GPU allocation. Quality changes lower vegetation density, pixel ratio, shadows and geometry detail. Per-stage scene replacement disposes the previous scene. The Control preview always uses economical detail.

Idle heartbeat writes: **0.26/second**. Active simulated driving writes: **4.98/second**; publisher coalesces to a 150 ms minimum interval with one write in flight. No geometry is streamed. Display wire size during the device check: 1682 bytes. Touch acceptance-to-Display observations: 267 ms, 86 ms; includes Playwright touch overhead and polling on localhost, based on a small sample, not a hardware latency claim.

Low-preset JS heap samples ranged 40.4–61.5 MiB; sampled resource counts are preserved in browser JSON. This short observation does not prove hours-long memory/thermal stability. Cleanup cancels RAF and timers, disconnects ResizeObserver/subscriptions, disposes meshes, instanced buffers, shared geometry/materials/textures and shadow targets, disposes/releases the WebGL context and removes its canvas. Audio cancels ambience and stops/closes its context. Long-duration real-device validation remains pending.

## Evidence and reproducibility

- [Wheat start](evidence/wheat-start.png), [50%](evidence/wheat-50.png), [complete](evidence/wheat-100.png).
- [Meadow start](evidence/meadow-start.png), [50%](evidence/meadow-50.png), [complete](evidence/meadow-100.png).
- [Grand field start](evidence/grand-start.png), [50%](evidence/grand-50.png), [complete](evidence/grand-100.png).
- [Economical accessibility view](evidence/accessibility-low.png), [therapist touch Control](evidence/therapist-control.png), [actual patient-history UI](evidence/patient-history.png).
- [Gameplay video](evidence/harvest-gameplay.webm), [browser checks/measurements](evidence/browser-results.json), [device/privacy checks](evidence/input-results.json), [disabled checks](evidence/disabled-results.json).
- All focused/full test, build, TypeScript, lint and browser logs are saved in `evidence/*.log`.

Generated `.next*` outputs from parallel servers were excluded from lint; they are generated bundles, not source. Full source lint command: `npm run lint -- --ignore-pattern '.next*/**'`.

Commands: `npx vitest run lib/harvestvalley3d/__tests__/engine.test.ts`; `npm test -- --maxWorkers=2`; `npm run lint`; fresh isolated `npx tsc --noEmit`. Rules: `HARVEST_RULES_EMULATOR=1 PLATFORM_RULES_EMULATOR=1 PLATFORM_DB_PORT=19970 PLATFORM_AUTH_PORT=19979 npx vitest run lib/harvestvalley3d/__tests__/rules.emulator.test.ts lib/realtime/__tests__/platformRules.emulator.test.ts`. Load current rules into `demo-rules-default-rtdb` for the shared suite; Harvest loads its own hardcoded demo namespace.

Browser scripts are `validation/browser.mjs`, `validation/disabled.mjs`, `validation/input.mjs`; set `HARVEST_PLAYWRIGHT_PATH` to an installed Playwright package directory. Run them serially, because they deliberately clear only their own loopback demo live session/lease/fixture history. They require the isolated demo auth/database and ports documented above. They never target production.

## Feature flag, rollback and batch checklist

`NEXT_PUBLIC_HARVEST_VALLEY_3D`: development enabled unless explicitly `false`; production requires literal `true`. `.env.example` defaults false. The flag gates both launch routes and the one registry card. History naming remains available while disabled. The existing temporary six-category library arrangement is preserved.

Rollback: set the flag false and rebuild via the normal approved platform process; routes return 404 and the card disappears without deleting history or changing other game flags. Do not roll back unrelated shared-file edits.

Before later batch deployment:

1. Review the latest unified integration diff and prepared canonical Firebase rules with the other games; rerun shared regression/security gates.
2. Keep production in the existing Shumos project/auth/history system. Remove demo-emulator env values. No rules/deployment publication is authorized by this report.
3. Enable the game flag only through the approved batch release and retain the disabled-build rollback.
4. Validate physical steering wheel/pedal axis layout, centre/rest/pressed values, inversion, gain, dead zones, disconnects and manual override on actual supported Control hardware.
5. Treat remote wheel-to-iPad relay as pending; use the complete manual path until a shared transport is implemented and validated.
6. Verify separate therapist iPad and Display/projector start-to-end flow, lease conflict/reload/reconnect, private patient binding and immutable history.
7. Measure real projector aspect/visibility, gentle volume, small-movement settings, low/high contrast and comfortable seated positioning with the therapist.
8. Run sustained FPS/temperature/memory/write-frequency/latency observations on physical deployment hardware and inspect all three environments before batch release.

## Asset provenance

The built-in `image_gen` tool generated `public/harvestvalley3d/countryside-matte.png` (original file copied unchanged from `/Users/omaralshehri/.codex/generated_images/01a12b0d-c430-7a30-9701-9a14461ecb57/exec-3dc5a62b-e024-42dc-8986-f668d5830143.png`). The thumbnail is an actual browser canvas capture of the original in-app scene saved at `public/harvestvalley3d/thumbnail.png`. No CLI/API-key fallback was used. The attached tractor photo was visual direction only.

Exact generation prompt:

> Create an original premium semi-realistic panoramic 16:9 countryside environment matte for a calm children's assisted harvesting game. View from a low third-person camera at the edge of a golden wheat valley, clear softly blue sky occupies upper 45%, layered realistic rolling green hills and distant rugged alpine mountains, dense natural pine forests in the middle distance, a small elegant timber farm barn and a dirt country road winding beside golden crop fields, warm late summer sunlight from upper left, soft atmospheric distance, exceptionally rich restrained natural texture and vegetation. Lower quarter is continuous softly lit pale olive-green grassy ground and golden stubble, mostly open, suitable to blend with a real 3D foreground. Horizon around upper-middle, believable photographic game environment depth, warm gold sage emerald cream palette. No vehicle, no people, no logos, no UI, no words, no watermark. Entirely original countryside, not a copy of any commercial game or existing image.

## Remaining release blocker

The latest merged source must pass TypeScript/build and full source ESLint before the release-candidate status can be declared. `lib/pearlvoyage3d/__tests__/rules.emulator.test.ts:45` fails TS2352 (a direct cast to `Record<string, unknown>` without the required intermediate unknown type), blocking both flag-enabled and flag-disabled production builds. Current lint errors belong to the parallel Pearl Voyage work: `lib/pearlvoyage3d/__tests__/engine.test.ts` (three `prefer-const` errors) and `app/dev/pearl-voyage-preview/PreviewClient.tsx` (synchronous state updates in effects). Those files were preserved. A narrowly scoped question about the three declarations was raised under the user's explicit concurrent-work preservation instruction; elapsed time was not treated as approval. Review `evidence/full-eslint.log`, `evidence/typescript-unified.log`, `evidence/build-unified-enabled.log` and `evidence/build-disabled.log` for the final exact errors. These need correction by the parallel work or separate authorization, followed by the latest unified release gates. The older disabled-build proof is preserved as `evidence/build-disabled-harvest-snapshot.log`; its route checks do not claim the currently blocked merged build succeeded.

## Exact file inventory

Shared additions below were made within the already dirty unified source; existing unrelated changes in those files were preserved:

- `.env.example`
- `lib/games/registry.ts`
- `lib/realtime/types.ts`
- `lib/realtime/sessionRepository.ts`
- `lib/sessions/types.ts`
- `lib/sessions/sessionHistoryRepository.ts`
- `lib/sessions/historicalGames.ts`
- `lib/analytics/patientAnalytics.ts`
- `lib/audio/AudioManager.ts`
- `lib/audio/__tests__/prefetchLines.test.ts`
- `components/display/gameDisplayRegistry.tsx`
- `components/control/library/gameThumbnails.tsx`
- `components/control/library/presentation.ts`
- `components/control/patients/SessionDetailScreen.tsx`
- `components/control/patients/SessionHistoryRow.tsx`
- `database.rules.json`
- `docs/release/FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json`

New dedicated implementation/evidence files:

- `app/control/harvest-valley-3d/page.tsx`
- `app/display/harvest-valley-3d/page.tsx`
- `components/control/harvestvalley3d/HarvestControl.tsx`
- `components/control/harvestvalley3d/HarvestThumbnail.tsx`
- `components/control/harvestvalley3d/control.module.css`
- `components/display/games/HarvestDisplayModule.tsx`
- `components/display/harvestvalley3d/FarmView.tsx`
- `components/display/harvestvalley3d/farm.module.css`
- `components/display/harvestvalley3d/scene.ts`
- `docs/harvestvalley3d/FINAL_REPORT.md`
- `docs/harvestvalley3d/evidence/accessibility-low.png`
- `docs/harvestvalley3d/evidence/browser-results.json`
- `docs/harvestvalley3d/evidence/browser.log`
- `docs/harvestvalley3d/evidence/build-disabled-harvest-snapshot.log`
- `docs/harvestvalley3d/evidence/build-disabled.log`
- `docs/harvestvalley3d/evidence/build-enabled.log`
- `docs/harvestvalley3d/evidence/build-unified-enabled.log`
- `docs/harvestvalley3d/evidence/combine-thumbnail.png`
- `docs/harvestvalley3d/evidence/disabled-browser.log`
- `docs/harvestvalley3d/evidence/disabled-results.json`
- `docs/harvestvalley3d/evidence/firebase-rules.log`
- `docs/harvestvalley3d/evidence/focused-tests.log`
- `docs/harvestvalley3d/evidence/full-eslint.log`
- `docs/harvestvalley3d/evidence/full-vitest.log`
- `docs/harvestvalley3d/evidence/grand-100.png`
- `docs/harvestvalley3d/evidence/grand-50.png`
- `docs/harvestvalley3d/evidence/grand-start.png`
- `docs/harvestvalley3d/evidence/harvest-eslint.log`
- `docs/harvestvalley3d/evidence/harvest-gameplay.webm`
- `docs/harvestvalley3d/evidence/input-results.json`
- `docs/harvestvalley3d/evidence/input.log`
- `docs/harvestvalley3d/evidence/meadow-100.png`
- `docs/harvestvalley3d/evidence/meadow-50.png`
- `docs/harvestvalley3d/evidence/meadow-start.png`
- `docs/harvestvalley3d/evidence/patient-history.png`
- `docs/harvestvalley3d/evidence/therapist-control.png`
- `docs/harvestvalley3d/evidence/typescript-unified.log`
- `docs/harvestvalley3d/evidence/typescript.log`
- `docs/harvestvalley3d/evidence/wheat-0.png`
- `docs/harvestvalley3d/evidence/wheat-100.png`
- `docs/harvestvalley3d/evidence/wheat-50.png`
- `docs/harvestvalley3d/evidence/wheat-start.png`
- `docs/harvestvalley3d/validation/browser.mjs`
- `docs/harvestvalley3d/validation/disabled.mjs`
- `docs/harvestvalley3d/validation/input.mjs`
- `lib/harvestvalley3d/__tests__/engine.test.ts`
- `lib/harvestvalley3d/__tests__/rules.emulator.test.ts`
- `lib/harvestvalley3d/audio.ts`
- `lib/harvestvalley3d/copy.ts`
- `lib/harvestvalley3d/engine.ts`
- `lib/harvestvalley3d/history.ts`
- `lib/harvestvalley3d/input.ts`
- `lib/harvestvalley3d/live.ts`
- `lib/harvestvalley3d/registration.ts`
- `lib/harvestvalley3d/useSession.ts`
- `public/harvestvalley3d/countryside-matte.png`
- `public/harvestvalley3d/thumbnail.png`
