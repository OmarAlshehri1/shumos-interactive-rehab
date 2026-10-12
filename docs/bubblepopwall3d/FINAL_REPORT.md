# Bubble Pop Wall 3D — The Wonder Dome

Software release candidate, validated 10 October 2026. Physical hardware validation and coordinated batch deployment remain pending. No commit, push, deployment, or production rules publication was performed.

## 1. P1–P10 completion

| Phase | Result |
| --- | --- |
| P1 — Discovery and protection | Complete: legacy contracts, auth, shared live state, patient history, canonical routes and concurrent Footsteps changes retained. Installed Next.js guides read before implementation. |
| P2 — Creative direction | Complete: glass observatory, floating miniature worlds and cumulative dome restoration. |
| P3 — Scene | Complete: procedural Three.js scene, transmissive/iridescent bubbles, miniature inhabitants, architectural lighting and contained rewards. |
| P4 — Manual interaction | Complete: deliberate reach, sequential guide checkpoints, forgiving accumulated hold, return to neutral, hand alternation. |
| P5 — Nine stages | Complete: all nine completed through actual browser cursor input without sensors. |
| P6 — Therapist Control | Complete: settings, accessible movement controls and session lifecycle. |
| P7 — Sensors | Software complete: existing normalized/calibrated pointer adapter, synthetic tests, explicit opt-in, role/freshness isolation and manual fallback. Physical WT901 validation pending. |
| P8 — Shared architecture | Complete: existing liveGame publisher, controller lease, staff authorization, presence, Display and session repository reused. |
| P9 — History/security | Complete: versioned non-clinical results, immutable save-once, legacy revival, emulator authorization tests. |
| P10 — Release gate | Complete for software: TypeScript, lint, tests, emulator rules, enabled/disabled production builds, independent browser contexts, screenshots/video and measured performance. Hardware/endurance deployment gate remains open. |

## 2. Creative direction and signature mechanic

The child sits inside a brass-and-glass observatory above clouds. Each bubble contains a garden, starscape or reef with a friendly light creature. Gentle reaching opens a miniature world; guiding light and holding position restore it. Each completed interaction grows the central crystal, and each completed stage releases another world around the dome. This provides a cumulative, calm reward rather than an isolated pop counter.

All geometry, materials, environments, thumbnail artwork and synthesized audio were authored procedurally in this implementation; no downloaded art or licensed sound dependency was introduced. There is no camera shake, strobe, explosive particle burst or paid TTS request for Dome sessions. Sound defaults off, requires a local gesture, and respects the existing global mute.

## 3. Before/after visual comparison

| Legacy, exercised on the final application | Wonder Dome, actual production browser |
| --- | --- |
| [Legacy Display](validation/legacy-display.png) | [Easy Display](validation/display-level-1.png) |
| [Legacy Control](validation/legacy-control.png) | [iPad-sized Control](validation/control-level-1.png) |

The legacy screenshots are rollback/untagged-session fixtures, not reconstructed mockups. Final images were visually inspected for transparency, material definition, miniature creatures, framing, instruction readability, hand/target placement and progression. The camera leaves the active bubble unobstructed; instructions and progress remain outside the interaction region.

## 4. All nine stages

| Difficulty / stage | Arabic name | Required deliberate action |
| --- | --- | --- |
| Easy 1 | اكتشف الحديقة | Reach one garden bubble. |
| Easy 2 | نافذتان للعجائب | Reach two sequential targets. |
| Easy 3 | رحلة والعودة | Reach, then return from the reached position to neutral. |
| Medium 1 | نهر من الضوء | Follow a straight light corridor through sequential checkpoints. |
| Medium 2 | منعطف القمر | Follow a curved corridor; jumping to the endpoint cannot complete it. |
| Medium 3 | أضئ العالم | Guide, then hold at the destination. |
| Advanced 1 | جسر النجمتين | Reach two sequential worlds. |
| Advanced 2 | يد تلو الأخرى | Right-hand reach followed by left-hand reach. |
| Advanced 3 | قبة العجائب | Reach, guide and hold to complete the dome. |

Default full progression contains 16 objectives. The therapist can repeat the stage sequence 1–3 times. Outward target acceptance never overlaps neutral, including minimum movement range and maximum tolerance. Stationary waiting cannot complete an outward reach. Holds accumulate without discarding participation on a brief deviation; pause freezes progress. Wrong-hand, duplicate, stale and obsolete-objective inputs cannot advance state.

## 5. Therapist manual controls

The same authoritative cursor is available by touch dragging, four large directional buttons and arrow keys. Controls include start, pause/resume, neutral reset, explicit assistance, repeat, skip objective, skip stage, stage selection, end and restart. Restart after activity requires ending/saving the existing run first.

Settings include right/left/alternating hand, movement range, target size, path tolerance, hold duration, magnetic assistance, movement speed, side placement, sequence count, sensor sensitivity, reduced motion, high contrast, optional quiet audio/volume and high/low graphics quality. The manual map exposes the same target, corridor and progression as Display. Touch remains available when sensors are selected.

## 6. Sensor integration status

`DomeSensorMapper` consumes the existing calibrated `NormalizedPointer`; no new BLE connection, hardware service, global calibration or shared filter was added. It checks calibration, confidence, role, future/stale samples (900 ms freshness), duplicates and normalized bounds, then applies a local dead zone, sensitivity and smoothing.

Synthetic calibrated-pointer tests passed for role isolation, freshness, duplicate suppression, clamping and smoothing. Reducer tests cover sensor loss and explicit manual takeover. The real production browser verified an unavailable sensor cannot enable sensor mode and leaves manual control usable. Physical packets, separate left/right WT901 mounting, reconnect behavior and therapist calibration need hardware testing; synthetic input is not evidence of physical tracking accuracy.

## 7. Shared Shumos architecture

Canonical ID remains `bubble-pop-wall`, Control remains `/control/bubble-pop-wall`, Display remains `/display`, projection remains WALL, and the library contains exactly one Bubble Pop Wall card. The independent browser also confirmed the concurrently developed Footsteps card remained present.

Control alone owns the reducer. Existing `useLiveGameController`, `LiveRecordPublisher`, ownership/lease/presence/recovery helpers and `HistorySaver` publish through the shared `liveSession` and existing patient session history repository. Dome sessions carry `engine: dome3`, version 1 and a bounded serialized payload; tagged Display is a read-only subscriber. Another active game or another staff member's unended Dome session cannot be overwritten. Reload restores the same session in paused/manual mode. Patient identity is bound at run creation, not taken from a subsequently changed selection.

Idle lastTick changes do not cause React updates or live writes. Meaningful active updates are capped at one publication per 150 ms, with an approximately four-second heartbeat. Display uses the existing mute state, avoids legacy Bubble Pop TTS/background/duplicate hand behavior only for tagged Dome sessions, and still routes untagged sessions to the original renderer.

## 8. Exact authored files

The repository already contained extensive uncommitted work and concurrent Footsteps additions. The following lists this task's authored scope, not attribution of every line in the shared dirty diff.

New implementation files:

- `lib/bubblepopwall3d/engine.ts`
- `lib/bubblepopwall3d/live.ts`
- `lib/bubblepopwall3d/history.ts`
- `lib/bubblepopwall3d/useSession.ts`
- `lib/bubblepopwall3d/sensorInput.ts`
- `lib/bubblepopwall3d/audio.ts`
- `lib/bubblepopwall3d/releasePolicy.ts`
- `lib/bubblepopwall3d/__tests__/engine.test.ts`
- `lib/bubblepopwall3d/__tests__/rules.emulator.test.ts`
- `components/control/bubblepopwall3d/DomeControl.tsx`
- `components/control/bubblepopwall3d/control.module.css`
- `components/display/bubblepopwall3d/DomeScene.tsx`
- `components/display/bubblepopwall3d/DomeView.tsx`
- `components/display/bubblepopwall3d/dome.module.css`
- `components/display/games/BubblePopDomeDisplayRouter.tsx`

Focused merges into existing files:

- `.env.example`
- `app/control/bubble-pop-wall/page.tsx`
- `components/control/library/BubblePopWallThumbnail.tsx`
- `lib/games/registry.ts`
- `components/display/gameDisplayRegistry.tsx`
- `components/display/DisplayScreen.tsx`
- `lib/realtime/types.ts`
- `lib/realtime/sessionRepository.ts`
- `lib/sessions/types.ts`
- `lib/sessions/sessionHistoryRepository.ts`
- `lib/sessions/resumeSuggestion.ts`
- `components/control/patients/LastProgressCard.tsx`
- `components/control/patients/PatientSessionHistorySection.tsx`
- `components/control/patients/SessionHistoryRow.tsx`
- `components/control/patients/SessionDetailScreen.tsx`
- `database.rules.json`

Documentation/evidence: this report and the files in [validation](validation/). Executable local browser recipes are archived as `.cjs.txt`, outside application code; paths describe the test machine and must be adapted when rerunning. No package/dependency, global sensor or production credential change was needed.

## 9. Firebase rules

Changes extend existing rules, with no new Firebase tree: tagged Dome live writes require the authorized owner/controller lease, validate supported version and payload length, and retain existing shared checks. Existing session history permits the `dome3` engine with version-2 bounded objective/assistance/repeat/completion fields. Patient history remains private and immutable after creation.

Rules were loaded only into isolated local Auth/RTDB emulators (19999/19900, demo namespace). Dedicated Dome tests and existing platform emulator tests passed for unauthenticated/unauthorized access, wrong owner, stale lease, oversized payload, invalid metrics, private history and save-once behavior. This is not a production rules publication.

## 10. History compatibility

Dome results use the existing repository with `resultVersion: 2` and `engine: dome3`. They record completed objectives, explicitly assisted objectives, completed stages, repeats, skips and session completion. Compatibility target fields remain available. Accuracy, completion percentage and reaction/response timing are deliberately not inferred as anatomical or therapeutic measures.

An assisted objective records use of the explicit assist command; configurable magnetic guidance is not a clinical independence assessment. Legacy unversioned Bubble Pop history keeps its original revival/scoring and five-stage denominator; Dome uses three stages per difficulty. Resume suggestions and history/detail UI distinguish the engines instead of reinterpreting old runs. Browser completion saved exactly one immutable 16-objective, nine-stage result, including after reload.

## 11. Automated checks

| Check | Final result / evidence |
| --- | --- |
| TypeScript | Pass, `npx tsc --noEmit --incremental false`; [log](validation/typescript.log) is empty on success. |
| Full ESLint | Pass, zero errors or warnings in the final rerun; [log](validation/eslint.log) is empty on success. |
| Dome unit tests | Seven pass, including all nine stages and synthetic sensor input; included in the full suite. |
| Full Vitest | 148 files / 1,905 tests passed; 8 files / 58 conditional tests skipped; [log](validation/vitest.log). |
| Rules emulator | 14 tests passed across Dome and platform suites; [log](validation/rules.log). |
| Enabled production build | Pass; [log](validation/build-enabled.log). |
| Disabled production build | Pass; [log](validation/build-disabled.log). |
| Whitespace/conflict check | `git diff --check` passed. |

The final full suite ran with `--no-file-parallelism` without competing build/browser work. An earlier loaded parallel run exceeded two existing SpacePilot test timeouts; the same tests passed in the final full run without modifying them. Conditional emulator tests were run explicitly in their separate emulator gate.

Production builds used isolated copies of the actual uncommitted workspace with emulator-only environment values. Enabled/disabled results therefore exercise the integrated source, including concurrent additions, without replacing the shared workspace or using an outdated clean Git checkout.

## 12. Browser checks

[Main browser results](validation/browser.json) and [rollback results](validation/rollback.json) passed with no JavaScript page errors. Separate browser contexts exercised authenticated touch-sized Control (1024×1366) and read-only Display (1600×900) against local emulators and production builds.

All nine stages were completed by moving the actual manual cursor, including corridor checkpoints, hold, return to neutral and alternating hands. Pause/resume, same-ID paused reload recovery, restart, explicit assistance, immutable save-once history and the single canonical library card passed. Disabled Control restored the original game; an untagged playing legacy fixture rendered through the original Display on the enabled build. These browser checks complement the full existing-game regression suite; they do not claim physical device coverage.

## 13. Screenshots

- Display: [Easy](validation/display-level-1.png), [Medium](validation/display-level-2.png), [Advanced](validation/display-level-3.png), [Completed](validation/display-complete.png).
- Control: [Easy](validation/control-level-1.png), [Medium](validation/control-level-2.png), [Advanced](validation/control-level-3.png).
- [Library](validation/library.png), [low graphics](validation/display-low-quality.png), [high contrast/reduced motion](validation/display-accessible.png).
- Rollback: [legacy Control](validation/legacy-control.png), [legacy Display](validation/legacy-display.png).

## 14. Gameplay video

Full synchronized test-session recordings: [Control gameplay](validation/gameplay-control.webm) and [Display gameplay](validation/gameplay-display.webm). They contain actual production-browser nine-stage play and lifecycle checks, not a prerecorded animation or concept render.

## 15. Performance measurements

See [raw measurements](validation/performance.json). Environment: local desktop Chrome headless using Metal, 1600×900 Display and separate 1024×1366 touch Control, local Firebase emulators. No physical iPad or projector performance claim is made.

| Measurement | Observed |
| --- | --- |
| Sustained stationary running interval | 123.298 seconds after warm-up; no objectives auto-completed. |
| High-quality sustained FPS | 41.7–60.0; most samples 59–60. |
| Stage-one draw calls / triangles | 489 / 116,348. |
| Stable resources | 268 geometries, 3 textures and one canvas throughout the interval. |
| JavaScript heap | Approximately 23.9–58.1 MB with garbage collection; end 35.0 MB versus initial 36.0 MB. |
| Quality recreation | Four low/high changes returned to the same geometry/texture counts and one canvas; high after recreation 57.5 FPS. |
| Low-quality sample | 60 FPS, 109,580 triangles; reduced rendering cost/resolution. |
| Idle live-session writes | 34 revisions / 123.298 s, approximately 0.276 writes/s (includes heartbeats and sampling interval). |
| Input-to-Display propagation | Five actual input samples: 109, 109, 209, 183, 129 ms; median 129 ms. |
| Whole nine-stage gameplay | 35.4–39.5 FPS while other local validation load was present; 489–844 calls, 268–490 geometries, 3 textures. |

Geometry growth across stages reflects bounded new miniature/reward worlds becoming visible; it is distinct from the constant-resource stationary and recreate checks. Scene teardown disposes geometry, materials, environment texture, animation and observer, and destroys the renderer/context. Two minutes of stability plus a full progression and recreation checks are useful software evidence, not a clinic-length soak or a guarantee of performance on ordinary tablets. Active writes are capped at approximately 6.7/s; network/production latency still requires deployment testing.

Reduced motion, high contrast, gesture-unlocked audio, global mute/unmute and unavailable-sensor manual fallback all passed during the performance run without page errors.

## 16. Remaining physical tests

Before clinical release, validate real iPad touch ergonomics and GPU/thermal performance; projector distance, brightness, transparency and target contrast; both WT901 hand mounts with actual calibration, role assignment, dropout/reconnect and physical neutral return; and a clinic-length endurance session, including repeated runs, Wi-Fi interruptions and therapist handover. Confirm movement settings and audio comfort with therapists and intended users. Participation metrics are not a therapeutic outcome claim.

## 17. Feature flag and rollback

`NEXT_PUBLIC_BUBBLE_POP_WALL_3D` defaults enabled. Set it to `0` before building to restore the existing Bubble Pop Control on the canonical route. This is a build-time public flag, so changing the deployment environment requires a new build. Enabled and disabled production builds and actual disabled Control rendering passed.

End and save active Dome runs before rolling back Control. The Display router retains recognition of existing tagged Dome snapshots while untagged legacy snapshots use the original renderer. Keep the compatible history reviver and additive rules; reverting these while Dome results exist would make new history unreadable. Do not remove shared Footsteps changes or replace shared files with an older branch wholesale.

## 18. Coordinated batch deployment requirements

No deploy or rules publication is authorized or performed. The batch owner must review and coordinate this task's focused changes with the concurrent Footsteps work, rerun the final integrated checks after any further merges, preserve canonical IDs/history/rules validators for both games, complete the physical gate, select the public flag, and build the application with the intended production environment.

Publish the reviewed additive rules and compatible application as a coordinated release so version-2 history writes are accepted; retain a compatible rollback build and monitor ownership, rendering, history save failures and write traffic. Production staff records, leases and patient data continue through the existing authorized platform configuration. Do not introduce a second live tree, alternate authentication or a separate calibration service.

**BUBBLE POP WALL 3D — THE WONDER DOME SOFTWARE RELEASE CANDIDATE READY. Physical hardware validation and batch deployment pending.**
