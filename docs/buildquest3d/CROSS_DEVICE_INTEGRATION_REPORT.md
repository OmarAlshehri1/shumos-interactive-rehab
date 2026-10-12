# Build Quest 3D — cross-device integration report

2026-10-10. **Software release candidate validated locally. No deployment performed.** This report supersedes the earlier stopped inspection. The subsequent explicit authorization permits local rules/schema changes; those changes and the complete manual cross-device workflow are implemented.

## 1. Manual therapist controls

The normal library lists **عالم البناء** once. Control provides large touch buttons for every available piece and eligible matching target, directional movement, selection/progress feedback, and the existing Three.js preview. All accepted selection/placement actions use the original authoritative gameplay rules and prerequisites. Start, pause/resume, restart, skip, end, difficulty/stage selection, assistance and dwell settings remain available. Manual controls work in MANUAL, RIGHT_HAND and HANDHELD modes, without hardware. Browser tests use touch events rather than keyboard or mouse to complete every stage. Final-stage skip now records the skipped stage before ending; this was a narrowly scoped integration fix.

## 2. Cross-device Firebase architecture

Configured environments reuse the existing named staff/display Firebase applications, staff sign-in/active-staff checks, anonymous Display authentication and Realtime Database. Build Quest uses a separately validated `buildQuest3d` namespace, leaving the existing games' live-session envelope and dispatch unchanged. `rooms/{sessionId}` stores compact versioned accepted state; `active` routes the normal `/display`; private immutable `patients/{sessionId}` binds patient history. A newer legacy live session takes precedence over an older Build active selection in the normal Display router.

Control is authoritative; Display subscribes read-only and never scores. No Build Quest BroadcastChannel carries state between devices. The existing local sensor pointer channel remains an input to Control. Without Firebase configuration, the prior browser-local demonstration remains available; configured Firebase failures never silently fall back to it.

## 3. All nine stages validation

Independent browser contexts completed first-shapes (2 pieces), three-shapes (3), four-shapes (4), house (4), car (4), robot (4), tower (3), bridge (3), and castle (5): **nine stages, 32 placements**, using therapist touch buttons. Display reload, Control reload and saved history were verified. Core tests also exercise manual completion in all three interaction modes. Completed Q1–Q4 artwork/game-development phases were not rebuilt.

## 4. Sensor/manual fallback

RIGHT_HAND receives the existing final normalized pointer. Simulated sensor selection/placement, therapist override while a sensor streams, disconnect/manual continuation and HANDHELD manual fallback passed. Manual commands suppress competing transient input briefly and clear stale Control pointer state. Keyboard simulation and prepared standard Gamepad support remain intact. WT901 drivers, calibration, motion filters, assignments and authentication were not edited by this task. Physical hardware is explicitly marked pending in registration and Control.

## 5. Session synchronization

Ownership is fenced by UID, token and epoch, with a 12-second lease, three-second heartbeat, server-time offset and transactional expected-revision checks. A second browser, including the same staff UID with a different token, cannot take an unexpired room. Transactions accept one state publication at a time and coalesce pending work. Accepted placements keep unique IDs; stale/duplicate commands and obsolete owners are rejected. Heartbeats cannot change semantic state without advancing its revision. Release/active cleanup also check token and epoch.

Raw pointer, hover/dwell timing and complete scene objects are excluded from Firebase payloads. Payload size is bounded at 32 KiB; the nine-stage final browser sample was 1,245 bytes. Control workbench motion is local and responsive; Display renders accepted selection/placement and its existing animation. It does not receive a continuous movement stream. Offline edits are disabled. Reload/reconnect recovers canonical state paused with a new epoch/run; the therapist resumes explicitly, rather than replaying offline edits. Sleeping/background devices may therefore require resume after lease expiry.

## 6. History persistence

Patient-selected sessions save a separate `gameId: build-quest-3d`, `resultVersion: 1` record through the existing create-only history repository. Patient binding is frozen at room creation. Results report completed/skipped stages, distinct pieces and explicitly tagged `build3` rows. Unavailable row durations are null; no invented accuracy or response-time metrics are presented. RTDB omitted empty arrays are normalized by the versioned reader. Existing-game readers and data remain unchanged.

History writes require active staff, the ended owned room, its private patient binding, matching canonical counters and bounded versioned rows. Overwrites, forged identities/counts, unsupported versions, malformed rows and unauthorized reads/writes are denied. Write failure retains the accepted result and displays retry status; retries are bounded to at most once per three seconds and clear the error after saving. Production browser validation temporarily denied history only in the isolated demo emulator, then restored the candidate rules and verified recovery. Walk-in sessions intentionally do not save patient history. There is no automatic room-retention deletion or historical-data migration.

## 7. Exact files modified by this task

The list below includes additions and targeted modifications, rather than the entire already-dirty worktree. Concurrent Balloon Quest, Runner Quest, Space Pilot and shared-file changes were inspected and preserved. Registry registration, thumbnails, routes and the sensor boundary existed before this task; the registry edit here is documentation only. Rules retain the concurrent Runner additions. No reset/stash/clean/discard/commit/push/deployment was performed.

- `app/display/page.tsx`
- `components/control/buildquest3d/BuildQuestControl.tsx`
- `components/control/buildquest3d/ManualWorkbench.tsx`
- `components/control/patients/SessionDetailScreen.tsx`
- `components/control/patients/SessionHistoryRow.tsx`
- `components/display/buildquest3d/BuildQuestDisplay.tsx`
- `components/display/buildquest3d/BuildQuestDisplayRouter.tsx`
- `components/display/buildquest3d/WorkshopCanvas.tsx`
- `components/display/buildquest3d/workshop.module.css`
- `database.rules.json`
- `lib/analytics/patientAnalytics.ts`
- `lib/buildquest3d/__tests__/crossDevice.test.ts`
- `lib/buildquest3d/__tests__/libraryIntegration.test.ts`
- `lib/buildquest3d/__tests__/registration.test.ts`
- `lib/buildquest3d/__tests__/rules.emulator.test.ts`
- `lib/buildquest3d/cloudState.ts`
- `lib/buildquest3d/gameplay.ts`
- `lib/buildquest3d/history.ts`
- `lib/buildquest3d/manual.ts`
- `lib/buildquest3d/registration.ts`
- `lib/buildquest3d/useFirebaseSession.ts`
- `lib/buildquest3d/useSession.ts`
- `lib/games/registry.ts`
- `lib/realtime/buildQuestRepository.ts`
- `lib/sessions/sessionHistoryRepository.ts`
- `lib/sessions/types.ts`
- `docs/buildquest3d/CROSS_DEVICE_INTEGRATION_REPORT.md`
- `docs/buildquest3d/DATABASE_RULES_FOR_FIREBASE_CONSOLE.json`
- `docs/buildquest3d/README.md`
- `docs/buildquest3d/LOCAL_INTEGRATION_CONFLICT.md`
- `docs/buildquest3d/validation/README.md`
- `docs/buildquest3d/validation/cross-device.mjs`
- `docs/buildquest3d/validation/cross-device.json`
- `docs/buildquest3d/validation/production-cross-device.mjs`
- `docs/buildquest3d/validation/production-cross-device.json`
- `docs/buildquest3d/validation/rollback.mjs`
- `docs/buildquest3d/validation/rollback.json`

## 8. Automated validation

- Full Vitest regression: **1,725 tests, 135 files passed, zero skipped**, including Build Quest, Balloon Quest and Runner Quest rules emulator suites against the candidate rules. Existing Balloon/Runner test copies were redirected only to this task's isolated loopback emulator ports; original workspace tests were not modified.
- Build Quest rules suite: seven tests containing positive/negative assertions for active/inactive/anonymous/unauthenticated actors, ownership/lease/revision fencing, schema and payload bounds, immutable patient binding/history, actual nine-stage serialization, and all seven other games' live/history compatibility. Final rules assertions rerun separately after the complete suite.
- Full TypeScript: passed. Full ESLint: passed, zero errors; final run had no warnings. `git diff --check`: passed.
- Feature-enabled and feature-disabled production webpack builds: passed, including Next.js TypeScript/build checks. Webpack was used for the isolated dependency-symlink snapshots.
- Candidate rules JSON parses and its complete Console copy matches the tested root rules byte-for-byte.

Tests used fake demo accounts/patients in Auth/Realtime Database emulators on 127.0.0.1:19099/19000. No test account, result, rules publication or patient mutation went to a live Firebase project. Other agents' emulators and the original configured development server were left alone.

## 9. Browser validation

See `validation/cross-device.json`, `production-cross-device.json` and `rollback.json`, with reproducible harnesses beside them. Separate Chrome contexts used a touch-enabled 1024×768 therapist viewport and independent anonymous Display. Tests covered real emulator staff login, inactive-staff denial, competing owner, nine-stage manual completion/history/detail view, reload recovery, normalized sensor simulation, manual override/disconnect, handheld fallback, lifecycle changes, 150 ms simulated latency and network loss/reconnect. No browser page errors or external Firebase requests were observed in cross-device suites.

The enabled production build additionally verified normal library navigation, touch directional movement, accepted placement, final-stage skip with strict history rows, and denied-history recovery with bounded retries. The disabled production build hides the card, blocks both dedicated game screens and retains existing-game library links and normal Display. Next.js streamed Control not-found returns HTTP 200 with a 404 fallback and no game controls; non-streamed dedicated Display returns 404. This is documented Next.js not-found behavior, not an enabled route.

These are browser/emulator software tests, **not physical iPad/Safari/projector or hardware validation**.

## 10. Complete Firebase rules and publication order

**Copy the entire contents of `DATABASE_RULES_FOR_FIREBASE_CONSOLE.json` into Firebase Console → Realtime Database → Rules.** It is the complete 412-line rules document, including existing platform/Runner rules, not a patch or snippet. Do not paste this Markdown report. It is identical to root `database.rules.json` and the tested emulator candidate.

Before publication, export the currently deployed Console rules and compare them with this candidate. Deployed rules were not queried during this task; if the Console contains additional concurrent changes, preserve/merge and revalidate those rather than overwriting them. Existing root default-deny policy and staff authorization remain. Build Quest adds explicit path permissions and validators, not a permissive wildcard. Authenticated Display access is limited to named Build rooms/active routing; patient binding/history remain staff-only.

**Publish the reviewed additive rules FIRST, while the existing application is still served. Deploy the updated application SECOND, with `NEXT_PUBLIC_BUILD_QUEST_3D_ENABLED=true` explicitly set for that approved production build.** Never serve an enabled Build Quest app before the rules. A disabled application build may be staged earlier, but enablement requires a new build after rules publication. Use real project configuration and remove all emulator settings from any eventual deployed build. No publication, push or deployment was executed or is authorized by this task.

## 11. Hardware validation pending

Real iPad touch/Safari, separate physical laptop/projector, WT901 RIGHT_HAND calibration-to-game behavior, BLE sleep/reconnect and physical handheld/JoyCon compatibility remain pending. These do not gate the tested hardware-free manual software workflow. Do not advertise these devices as verified.

## 12. Feature flag, URLs and rollback

Development defaults on unless `NEXT_PUBLIC_BUILD_QUEST_3D_ENABLED=false`. Production defaults off unless exactly `true`. Public flags are embedded at build time: restart development or rebuild production after changing them.

Tested emulator-only local URL: `http://127.0.0.1:3148/control/build-quest-3d`. Normal configured local URL: `http://127.0.0.1:3000/control/build-quest-3d` (staff sign-in; live cross-device writes require the candidate rules to be published first); library: `/control/activities`; child: the generated room-specific `/display/build-quest-3d?session=…` link or normal `/display`. On two physical devices use the same reachable origin rather than each device's localhost, with the platform's normal Firebase configuration. Local emulator test origins were 3148 development, 3158 enabled production and 3168 disabled production, isolated from live credentials.

Safe application rollback: end/save active sessions, close or refresh old enabled tabs, set the flag false and rebuild/redeploy the approved application. Normally **keep the additive rules and existing Build history**; other games remain compatible. An older application may omit unknown Build history rather than display it; the new explicit reader never reinterprets legacy games. Reverting older rules while Build clients are active denies their room/history writes and may strand pending results. Reverting a stale rules file may also remove concurrent Runner permissions. Only revert rules after active clients finish and the exact exported baseline has been reviewed. No data deletion is needed.

Local pretask file backups and hashes remain in `/private/tmp/buildquest-crossdevice-backup`; they include earlier uncommitted work but do not include subsequent concurrent edits. Use selective reversal, never wholesale restoration over newer work.

## 13. Remaining steps before Push/deployment

1. Review this task's targeted changes alongside preserved concurrent work and obtain separate authorization for any commit/push/deployment.
2. Complete physical iPad/projector validation and the optional hardware batch checks; retain pending labels until those pass.
3. Export/compare actual live rules, resolve any additional live-only differences, and publish the reviewed additive rules before the enabled application.
4. Build the approved real-config application with the explicit true flag, deploy only after authorization, and perform an authorized production smoke check without fabricated patient data.

No critical local software integration task remains open. Live rules publication, application deployment and physical hardware validation remain external release steps.

Candidate rules SHA-256: `db3c726d896ef6a3e033508fe126d327e8008918d17d5cdd7bf38a46c008ae01`.
