# Blooming World 3D — final release report

BLOOMING WORLD 3D SOFTWARE RELEASE CANDIDATE READY — Physical sensor and projector validation pending batch deployment.

Validation date: 11 October 2026, Asia/Riyadh. Arabic title: **الحديقة التي تستيقظ**. Canonical game ID: `blooming-world-3d`.

## G1–G14

| Gate | Area | Result |
| --- | --- | --- |
| G1 | Platform inspection | PASS: Shared registry, routes, staff auth, WT901 input, session/history helpers and local Next.js guides inspected. |
| G2 | Immersive 3D garden | PASS: Original forest matte, parametric layered 3D flowers, textured trees and moss, instanced foliage, ferns, sunlight beams, particles and soft wall shadows. |
| G3 | Awakening engine | PASS: Five visual milestones; deterministic per-region accepted events; spatial restoration, persistent blooms and bounded practice history. |
| G4 | Wall and floor | PASS: Forward perspective wall garden and independent top-down orthographic floor camera; aspect, measured projection dimensions, margins, grid and access settings. |
| G5 | Coverage and progress | PASS: Therapist goal of 1–12 regions, repetitions, configurable size/range and ordered/free targeting; goal completion scales to 100%. |
| G6 | Nine stages | PASS: Exactly 3 levels × 3 stages, default goals 4–12. No forced timer, punishment, standing or walking requirement. |
| G7 | Hand preparation | PASS: Existing RIGHT_HAND/LEFT_HAND WT901 normalized-pointer runtimes; alternation, role isolation, freshness, dead zone, sensitivity, smoothing and dwell gating. Physical validation pending. |
| G8 | Foot preparation | PASS: Independent role-isolated onset/rest/freshness/disconnection detector and clearly labeled simulation. Foot orientation never awards spatial occupancy; therapist confirms arrival. |
| G9 | Manual therapist control | PASS: Touch map, cursor, independent/assisted confirmation, start/pause/resume/restart/practice/skip/stage/end/results. No sensor required. |
| G10 | Shared synchronization | PASS: Existing liveSession repository, publisher, staff auth, ownership/lease, presence, heartbeat, reload recovery and save-once helpers. |
| G11 | Library and history | PASS: One canonical BOTH card, original thumbnail, existing six categories; versioned non-clinical metrics in existing patient history and analytics. |
| G12 | Audio and feel | PASS: Original procedural wind/leaves, bird/water phrases, bloom chimes and celebration; gesture unlock, global mute and quiet adjustable volume. |
| G13 | Validation | PASS: TypeScript, full ESLint/Vitest, emulator authorization, both production builds, independent browser contexts, visual/video/performance evidence. |
| G14 | Release candidate | PASS: Final software gates passed; no unresolved critical software blocker. |

## Implementation and platform protection

The implementation followed this sequence: reuse platform services; implement a pure deterministic region engine; build both camera modes; add therapist and prepared sensor input; integrate one registry identity and versioned history; validate security, gameplay, rendering and rollback. The initial working tree contained extensive unrelated uncommitted game work, including retired Feed the Animals deletions. None was reset, stashed, discarded, restored or committed. Other agents' servers and emulators were left running.

Game modules are isolated under `lib/bloomingworld3d/` and dedicated Control/Display component folders. Shared edits add one registration, tagged session/history variants, display/thumbnail adapters, non-clinical history presentation, BOTH labels and narrowly scoped rules. No separate app, auth system, patient-history repository, production Firebase project or independent session tree was created. No commit, push, deployment or production rule publication was performed.

Validation used source snapshots in `/tmp/bloomingworld3d-qa` and `/tmp/bloomingworld3d-disabled`, separate build outputs, localhost app ports 3293/3294, and demo-only Firebase emulator ports 19920/19929. Dependencies were reused through a symlink; Next builds used webpack because Turbopack rejects dependencies outside an isolated snapshot's filesystem root. The existing Google Fonts needed network access during builds; fonts were not replaced. The original shared `.next` cache contained stale references to deleted Feed Animals routes, so TypeScript and builds were verified with fresh isolated Next-generated types instead of altering another agent's cache or restoring retired routes.

## Visual architecture

The scene is real Three.js geometry with shared materials and instanced flower petals, tree leaves, grass and ferns. Each main flower has three layers of curved petals, a stem, leaves and a centre. A seeded layout varies vegetation and flower colour while preserving reconstruction after reload. Original code generates bark/moss/contact-shadow textures. Wall mode adds soft sunlight shafts, fog, directional lighting/shadows, particles and butterflies. The static original distant-forest matte supplies visual depth; a screen-projected transition blends it into the actual 3D moss ground. Interactive flowers and restoration are geometry, not pixels painted onto the backdrop.

The floor uses a stable orthographic camera, flat ground and large flower regions. It has no cliff, hole, deep-water, walking or jumping mechanic. No forward forest image is used as a floor surface. High quality enables denser foliage, more companion flowers, higher pixel density and wall shadows; low quality reduces these costs. Motion reduction freezes ambient movement, and high contrast strengthens region outlines.

The initial render was inspected and improved: flat ground and sparse vegetation were replaced with textured moss, denser foliage, original forest depth, soft shadows, a blended horizon and richer floor flower clusters. Final wall/floor screenshots, Control and history renders were inspected directly; test success alone was not used as a visual-quality claim.

## Restoration, progress and nine stages

The five phases are 0–20% grass/small flowers, 20–40% opening large flowers, 40–60% spreading companion plants, 60–80% richer trees/butterflies and 80–100% warm lighting. These are visual milestones, not measured physical distances. Local region progress determines which plants grow; the overall phase controls environmental richness. At completion a slow golden wave and optional soft musical phrase play. The therapist chooses when to continue.

| Level | Stages | Default required regions |
| --- | --- | --- |
| First Blooms | 1, 2, 3 | 4, 5, 6 |
| Garden Awakening | 1, 2, 3 | 7, 8, 9 |
| Magical Garden | 1, 2, 3 | 10, 11, 12 |

A therapist can choose a smaller goal, 1–5 accepted repetitions per region, region size, small virtual movement range and ordered/free selection. Progress is accepted required interactions divided by the configured goal, bounded at 100%. Incomplete regions are not reported as restored in history. Skipping never fabricates restoration. Repeating an incomplete region preserves its existing progress; practicing a completed region preserves the flower and 100% progress, records a separate practice event, and cannot inflate the score. Explicit restart or selection of a fresh stage starts that stage's new garden. Current-stage restoration survives reload, and completed-stage results remain archived.

Region identity is stage + cell identity, with run/epoch/hit tokens rejecting duplicate or stale acceptance, including after restart or repeat. The payload contains cell hits, assisted counts and accepted keys, not Three.js meshes. Even the largest configured nine-stage session plus bounded practice history remains below the 32 KB payload limit.

## Manual control and prepared sensors

Manual confirmation drives the same engine used by sensor acceptance. An iPad-sized touch context completed all nine stages in WALL and FLOOR without hardware. The map selects the actual region and virtual cursor; independent and assisted blooms are distinct. Pause, resume, repeat/practice, skip region/stage, restart, stage selection, end and results are available.

Hand input reuses the existing shared calibrated WT901 pointer. Single right/left and alternate-hand participation are prepared; dual mode alternates roles by region. The game applies local sensitivity, smoothing and dead zone without changing global calibration. Samples require a connected, centered role and age below 500 ms. Wall contact requires a 900 ms dwell, with latching and accepted-event tokens preventing stale scoring. Lost input leaves manual control available. Wrist IMUs do not measure absolute 3D hand position.

The existing platform exposes physical hand runtimes; foot hardware attachment is still preparation, not a new BLE implementation. The independent foot detector accepts role-tagged gyro samples and emits movement/rest/unavailable hints. UI simulation is explicitly labeled and cannot award floor coverage. A therapist must confirm the child's actual floor region. Right/left/dual roles and freshness/disconnection semantics have synthetic tests. Actual WT901 hardware, projector geometry and any future position tracker remain unvalidated.

## Shared synchronization, authorization and history

Control is authoritative. Display decodes shared `liveSession` records and is read-only apart from the platform's existing presence/audio behavior. The game reuses `useLiveGameController`, `LiveRecordPublisher`, ownership recovery, the controller lease, staff auth, session repository and `HistorySaver`. Reloaded running sessions recover paused and need an explicit resume. Separate browser contexts exercise the actual Firebase path rather than relying on a same-device BroadcastChannel.

The shared rules add the game ID, bounded `bw3` payload/owner/tab/heartbeat validators and versioned history fields. The live session requires the active staff lease owner; competing controller tabs and stale revisions are rejected. Patient bindings remain in the platform's staff-only private node, never the Display-readable record. History is immutable, requires an existing patient and matching creator/path, bounds counts and metadata, and rejects unsupported clinical fields. Other games' validators and retired read-only history compatibility remain intact. The canonical console rules snapshot was updated, but not published.

History stores result version 1, completed/skipped stages, fully restored regions, assisted restored regions, selected projection, participation mode and session completion. Rows/analytics use the existing patient system and Arabic labels. No accuracy, anatomical-position or therapeutic-effectiveness claim is stored. Completed manual sessions in each projection recorded nine stages and 72 restored regions; reloads did not duplicate history. Walk-in sessions finish without creating patient history. Restarted saved runs receive distinct immutable history IDs.

## Automated and browser validation

- Focused engine/sensor/serialization/history tests pass, including visual milestone boundaries, completed-region practice and maximum payload size.
- Full Vitest: **1843 passed**, 147 files passed; 79 environment-dependent tests skipped in 11 files. The skipped emulator tests relevant here were run separately.
- Local Firebase emulator: **16 passed** (4 Blooming World security tests and 12 shared-platform tests), including anonymous/non-owner denial, competing tabs, versions, payload bounds, immutable history, invalid metadata and privacy.
- Full ESLint: pass. Fresh isolated TypeScript: zero errors.
- Production build enabled: pass. Production build disabled: pass. Disabled Control and Display return 404; the disabled library contains zero Blooming World cards.
- Independent browser contexts: all nine stages in both modes; right/left/alternate-hand preparation; right/left/dual-foot modes; foot hints without occupancy scoring; disconnected-sensor manual fallback; assistance; map selection; goal/repetition scaling; practice; pause/resume; restart; skip; both reloads; history UI/save-once; competing tabs; audio gesture/global mute; canonical library; existing Balloon Quest, Fire Rescue and Safe Hex routes.
- Browser page errors: 0. Browser detailed checks: 236.

## Measured performance

GPU: `ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)`. The test ran two app windows on the same Apple M1 computer; this does not validate an iPad, projector or separate physical sensor host.

| Capture | FPS | Draw calls | Triangles | Geometries | Textures |
| --- | ---: | ---: | ---: | ---: | ---: |
| wall-0 | 53 | 770 | 1,319,390 | 124 | 7 |
| wall-50 | 60 | 773 | 1,319,550 | 126 | 7 |
| wall-100 | 59 | 806 | 1,335,518 | 127 | 7 |
| wall-medium | 56 | 1055 | 1,676,186 | 127 | 7 |
| wall-advanced | 51 | 1304 | 2,016,854 | 127 | 7 |
| wall-celebration | 47 | 1470 | 2,243,966 | 127 | 7 |
| floor-0 | 58 | 684 | 781,278 | 11 | 4 |
| floor-50 | 60 | 684 | 781,278 | 11 | 4 |
| floor-100 | 60 | 723 | 835,806 | 12 | 4 |
| floor-medium | 60 | 1173 | 1,215,708 | 12 | 4 |
| floor-advanced | 60 | 1623 | 1,595,610 | 12 | 4 |
| floor-celebration | 60 | 1923 | 1,848,878 | 12 | 4 |
| floor-accessibility-low | 58 | 165 | 204,556 | 12 | 4 |

Sampled render rate: **47–60 FPS**; high-detail wall scenes include shadow passes in triangle/draw counts. The low floor preset used approximately 205k triangles in the accessible-goal capture. Stable low-preset samples retained 12 geometries and 4 textures at 60 FPS. JS heap samples ranged from 16.3 to 40.6 MiB, with garbage collection returning the heap downward; this short observation does not establish hours-long memory stability.

Measured idle Firebase write frequency: 0.27/second, from heartbeats. Gameplay publishing is coalesced with a 150 ms minimum interval and one write in flight. Control-to-Display acceptance observation averaged **223 ms**, range 91–505 ms. This includes Playwright touch action and synchronization polling on localhost, not a measured cross-network hardware latency.

A separate continuous manual-cursor drag measured **6.15 Firebase writes/second** over 5.37 seconds. Cursor movement alone restored zero regions; the final cursor was synchronized. The Display record contained no patient identifier. The observed wire size was 1,471 bytes.

Scene cleanup cancels animation frames, disconnects ResizeObserver, disposes instanced meshes, geometry, materials, textures and shadow targets, disposes the renderer and releases its WebGL context. Controller cleanup removes timers/subscriptions and disposes the publisher. Audio closes its context and removes ambience timers. Resource counts, reloads and stage changes were exercised in the browser; physical-device thermal/long-duration performance remains a batch-validation item.

## Evidence and reproducibility

- [Wall 0%](evidence/wall-0.png), [50%](evidence/wall-50.png), [100%](evidence/wall-100.png), [Medium](evidence/wall-medium.png), [Advanced](evidence/wall-advanced.png), [celebration](evidence/wall-celebration.png).
- [Floor 0%](evidence/floor-0.png), [50%](evidence/floor-50.png), [100%](evidence/floor-100.png), [Medium](evidence/floor-medium.png), [Advanced](evidence/floor-advanced.png), [celebration](evidence/floor-celebration.png).
- [Therapist Control](evidence/therapist-control.png), [low/reduced-motion/high-contrast/grid](evidence/floor-accessibility-low.png), [wall history](evidence/history-wall.png), [floor history](evidence/history-floor.png).
- [Actual gameplay recording](evidence/garden-gameplay.webm), [browser measurements](evidence/browser-results.json), [active write measurements](evidence/performance-results.json), [disabled results](evidence/disabled-results.json).
- Complete build/type/lint/test output is in `evidence/*.log`.

Focused test command: `npx vitest run lib/bloomingworld3d/__tests__/engine.test.ts`. Full regression: `npm test -- --maxWorkers=2`; full lint: `npm run lint`. Emulator tests use `BLOOM_RULES_EMULATOR=1 PLATFORM_RULES_EMULATOR=1 PLATFORM_DB_PORT=19920 PLATFORM_AUTH_PORT=19929` with the two corresponding test files. The Blooming World test installs current rules only into its hardcoded loopback demo namespace; load the same rules into the shared-platform test namespace before its suite.

Browser scripts: `validation/browser.mjs`, `validation/disabled.mjs`, `validation/performance.mjs`. Set `BLOOM_PLAYWRIGHT_PATH` to an installed Playwright package directory. They target only the isolated localhost app ports and demo emulator. The main browser script creates demo staff/patient fixtures and clears only its local demo session/history state. Run scripts serially so their controller-ownership fixtures do not compete.

## Feature flag, rollback and batch deployment

`NEXT_PUBLIC_BLOOMING_WORLD_3D`: development is enabled unless explicitly `false`; production requires literal `true`. The example environment defaults it to `false`. It gates both routes and the single registry card. `SHUMOS_BUILD_DIR` optionally isolates Next build output; leaving it unset preserves the platform's normal `.next` output.

Rollback: set the Blooming World flag to `false` and rebuild through the normal approved platform release process. This removes its launch card/routes without deleting existing patient history, changing other game flags or reverting their work. Historical game naming is retained even while the feature is disabled.

Batch checklist, requiring a separate authorized deployment:

1. Review the minimal integration diff against the latest unified Shumos baseline and re-run the shared regression/security gates.
2. Review the canonical rules snapshot and merge the Blooming World validators into the batch; publish nothing automatically.
3. Enable the production flag in the existing platform project, preserving all other game flags and real Firebase configuration. Do not copy demo-emulator settings into production.
4. Measure projected width/height, aspect, margins and safe target sizes for WALL and FLOOR; verify a genuinely flat floor and therapist sightlines.
5. Validate actual RIGHT_HAND, LEFT_HAND and alternate-hand WT901 mapping/freshness/disconnects without altering shared calibration. Foot IMUs remain hints/manual arrival confirmation unless an independent position tracker is validated.
6. Test an actual therapist iPad and separate Display computer: start-to-end manual completion, connection recovery, lease protection, save-once history, mute/gesture audio and patient privacy.
7. Check brightness/contrast, comfortable audio level, reduced motion, high/low quality, sustained FPS/thermal/memory and control latency on the real projector hardware.
8. Confirm one library card, correct history and the other games' routes, then deploy only through the approved batch workflow. Keep the feature-flag rollback available.

No real sensor, anatomical accuracy, physical projector calibration or therapeutic effectiveness has been claimed by these software checks.

## Original asset provenance and exact prompt

The built-in `image_gen` tool generated one original distant-forest asset, copied unchanged into `public/bloomingworld3d/forest-matte.png` (3.4 MiB). The same asset supplies the original thumbnail. The attached venue images were art direction only and were not copied into the app. No CLI/API-key fallback was used.

Exact generation prompt:

> Use case: stylized-concept. Asset type: original panoramic distant-forest matte texture for Shumos Care's real-time 3D Awakening Garden, a child-friendly immersive rehabilitation exhibition. Create a breathtaking cinematic magical garden forest, lush varied natural foliage and elegant arching ancient trees framing a softly luminous turquoise and warm honey-lit clearing. Deep layers of ferns, moss, climbing vines, small lavender wildflowers, dappled sunlight and delicate atmospheric mist. Premium detailed 3D animated-film environment art, realistic natural textures, beautiful rich emerald, sage, teal, lavender and warm golden color grading, peaceful and welcoming. Composition: wide 16:9 landscape panorama, eye-level forest viewed across a clearing; trunks mainly at sides, a softly glowing distant forest opening at center, uninterrupted mossy ground at the very bottom; this is distant scenery behind real 3D interactive flowers. Keep detailed scenery principally in the upper 75% and softly textured ground in lower 25%. No characters, no people, no text, no logos, no watermarks, no projected room, no venue installation, no cliffs or holes, no frightening darkness, no giant foreground flowers, no bright hotspots, no extreme bloom. Original artwork, not a copy of any particular installation.

## Exact files changed by this assignment

The list below is this assignment's file inventory, not the entire pre-existing dirty Git diff. Existing unrelated changes in shared files remain preserved.

```text
.env.example
app/control/blooming-world-3d/page.tsx
app/display/blooming-world-3d/page.tsx
components/control/bloomingworld3d/BloomControl.tsx
components/control/bloomingworld3d/BloomThumbnail.tsx
components/control/bloomingworld3d/control.module.css
components/control/library/GameCard.tsx
components/control/library/__tests__/presentation.test.ts
components/control/library/gameThumbnails.tsx
components/control/library/presentation.ts
components/control/patients/SessionDetailScreen.tsx
components/control/patients/SessionHistoryRow.tsx
components/display/bloomingworld3d/GardenView.tsx
components/display/bloomingworld3d/garden.module.css
components/display/bloomingworld3d/scene.ts
components/display/gameDisplayRegistry.tsx
components/display/games/BloomDisplayModule.tsx
database.rules.json
docs/bloomingworld3d/FINAL_REPORT.md
docs/bloomingworld3d/evidence/browser-results.json
docs/bloomingworld3d/evidence/browser.log
docs/bloomingworld3d/evidence/build-disabled.log
docs/bloomingworld3d/evidence/build-enabled.log
docs/bloomingworld3d/evidence/disabled-browser.log
docs/bloomingworld3d/evidence/disabled-results.json
docs/bloomingworld3d/evidence/firebase-rules.log
docs/bloomingworld3d/evidence/floor-0.png
docs/bloomingworld3d/evidence/floor-100.png
docs/bloomingworld3d/evidence/floor-50.png
docs/bloomingworld3d/evidence/floor-accessibility-low.png
docs/bloomingworld3d/evidence/floor-advanced.png
docs/bloomingworld3d/evidence/floor-celebration.png
docs/bloomingworld3d/evidence/floor-medium.png
docs/bloomingworld3d/evidence/focused-tests.log
docs/bloomingworld3d/evidence/full-eslint.log
docs/bloomingworld3d/evidence/full-vitest.log
docs/bloomingworld3d/evidence/garden-gameplay.webm
docs/bloomingworld3d/evidence/history-floor.png
docs/bloomingworld3d/evidence/history-wall.png
docs/bloomingworld3d/evidence/performance-results.json
docs/bloomingworld3d/evidence/performance.log
docs/bloomingworld3d/evidence/therapist-control.png
docs/bloomingworld3d/evidence/typescript.log
docs/bloomingworld3d/evidence/wall-0.png
docs/bloomingworld3d/evidence/wall-100.png
docs/bloomingworld3d/evidence/wall-50.png
docs/bloomingworld3d/evidence/wall-advanced.png
docs/bloomingworld3d/evidence/wall-celebration.png
docs/bloomingworld3d/evidence/wall-medium.png
docs/bloomingworld3d/validation/browser.mjs
docs/bloomingworld3d/validation/disabled.mjs
docs/bloomingworld3d/validation/performance.mjs
docs/release/FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json
lib/analytics/patientAnalytics.ts
lib/audio/AudioManager.ts
lib/audio/__tests__/prefetchLines.test.ts
lib/bloomingworld3d/__tests__/engine.test.ts
lib/bloomingworld3d/__tests__/rules.emulator.test.ts
lib/bloomingworld3d/audio.ts
lib/bloomingworld3d/copy.ts
lib/bloomingworld3d/engine.ts
lib/bloomingworld3d/history.ts
lib/bloomingworld3d/live.ts
lib/bloomingworld3d/registration.ts
lib/bloomingworld3d/sensorInput.ts
lib/bloomingworld3d/useSession.ts
lib/games/registry.ts
lib/realtime/sessionRepository.ts
lib/realtime/types.ts
lib/sessions/historicalGames.ts
lib/sessions/sessionHistoryRepository.ts
lib/sessions/types.ts
next.config.ts
public/bloomingworld3d/forest-matte.png
```
