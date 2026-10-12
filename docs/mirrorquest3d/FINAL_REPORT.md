# Mirror Quest 3D — software release candidate

Date: 10 October 2026 (Asia/Riyadh). Game: `mirror-quest-3d`, **المرآة السحرية / Mirror Quest 3D**.

## Phase status

| Phase | Result |
| --- | --- |
| M1 architecture | Passed. Reused the current unified, uncommitted platform baseline; checkpoint saved. |
| M2 visuals | Passed. Real articulated 3D characters, stage, target ghost, screenshots; no camera or sprites. |
| M3 gameplay | Passed. Exactly nine stages and 28 feature-based targets, manual and simulated engine tests. |
| M4 manual and shared session | Passed. All nine stages completed with limb sliders in independent Control/Display browser contexts. |
| M5 adapters | Software passed. Neutral calibration, role mapping, simulation, loss/pause and manual fallback. Physical recognition remains unavailable pending validation. |
| M6 validation | TypeScript, full lint, Vitest, local emulator rules, production build, and browser integration passed. Final extended rendering evidence is saved. |

## Characters and scene

Original lion, rabbit, bear and fox costumes share one articulated Three.js rig. Independent shoulder/leg groups and nested limb geometry animate smoothly. Rounded hood, facial features, hands, shoes and costume details use real geometry and physically lit materials. Both sides use the selected costume, distinguished by Arabic labels. Random selection changes only appearance.

The friendly studio uses hemisphere/directional lighting, soft shadows in high quality, wall depth, two platforms and seated chairs. The player’s translucent emissive ghost uses the same rig and exact target features, including active-limb markers. Cyan/orange/green feedback includes icons and Arabic text. The instructor demonstrates each new target and repeat request. Success has gentle text feedback, with no timeout failure or speed escalation.

The platform’s existing 16:9 PlayStage remains authoritative. Camera aspect is refreshed independently of canvas allocation, preventing distortion during costume remounts. The low preset reduces pixel ratio and disables shadow mapping; reduced motion presents poses directly. Geometry/materials are disposed and animation frames canceled on remount/unmount. Context loss is not forced during React remounts.

## Gameplay and manual control

Levels: right arm, left arm, both arms; right foot, left foot, alternating feet; arm plus opposite foot, alternating combinations, final imitation sequence. Seated is the default. Standing is an explicit therapist-approved illustration, without jumping or compulsory single-leg balance.

Large touch sliders visibly move active limbs; neutral controls remain available for any non-neutral limb. Start, pause/resume, repeat, assist, skip, restart, stage selection and end are separate commands. Therapist assistance and skipped targets are recorded distinctly from unassisted matches. Visited stages cannot silently be replayed with already accepted event keys; restart creates a new run. Character, tolerance, hold duration, movement size, presentation, simulation, quality and reduced motion are adjustable while ready/paused.

The pure engine applies per-limb feature targets, configurable tolerance/hold, hysteresis, a 750 ms input-freshness window, a 250 ms maximum hold-tick gap, monotonic input sequences, pause resets and unique run/stage/pose acceptance keys. No unmeasured anatomical angle contributes to scoring.

## Sensor limitations

`RIGHT_HAND`, `LEFT_HAND`, `RIGHT_FOOT`, `LEFT_FOOT`, dual hands, dual feet and combinations are covered in manual/simulation software. Simulated adapters separate measured sample, calibrated feature and inferred visual value. Neutral calibration and direction mapping are explicit; sensor-loss simulation disconnects/pauses, preserves outcomes and permits manual continuation after resume. Manual controls remain visible in simulation mode.

No normalized pointer is converted to a joint angle. No WT901 BLE driver, global calibration, role assignment or filter was changed. No physical pose-recognition mode is selectable. Hardware must establish mounting, neutral repeatability, direction semantics, freshness, drift, disconnection/re-engagement and clinical movement suitability before a physical adapter is enabled.

## Shared platform and history

Control is authoritative; Display reads the original `/liveSession` through the existing repository/Display guard and game registry. There is no new session tree, transport, authentication system or application. Staff gate, patient context, account controller lease, per-window ownership/recovery, presence, revision ordering, heartbeat freshness, coalescing publisher and history save-once are reused from `lib/liveGame/` and existing platform modules.

Accepted outcomes and visual state are compact JSON in the versioned `mirror3` block. Optional ownership fields are omitted rather than serialized as undefined. Visible changes coalesce on a 120 ms publication schedule; unchanged sample sequences do not trigger network publication. Idle liveness uses the shared four-second heartbeat. Reload recovery pauses active gameplay and clears hold/input freshness. Another active window cannot silently replace the session.

Patient binding stays in the platform’s existing staff-only `liveSessionPrivate` record. History uses the existing `sessions/{patientId}/{sessionId}` repository and `HistorySaver`, with a run-qualified record ID. Stored counts distinguish accepted poses, assists, completed and incomplete/skipped stages; no fabricated anatomical accuracy or response-time metric is shown. Existing history rows, patient detail and analytics expose Mirror Quest results. Walk-in sessions do not create patient history. Explicit End saves partial progress; navigation preserves the live state for recovery rather than inventing an end result.

## Candidate Firebase rules

Only local candidate rules were edited. Mirror Quest was added to existing game-ID allowlists and history validators. Mirror writes additionally require the staff controller lease and matching block owner; engine/version, ownership metadata and payload size are validated. History is create-only, bound to an existing patient, and checks pose/assist counts. Existing game conditions and confidentiality rules remain in place. **No rules were published.**

Payload gameplay consistency is checked by the client reviver; RTDB rules validate the envelope rather than parse JSON. This follows the shared platform convention and is not a claim of cryptographic per-browser ownership.

## Validation

- Full Vitest: **138 files passed; 1,784 tests passed; 38 emulator-gated tests skipped** in the default run.
- Mirror engine: 15 focused tests, including all four characters, all nine manual stages, all nine simulated stages, tolerance/hysteresis, freshness, duplicate events, pause/restart/repeat, manual fallback, valid serialization, recovery, history, matching rigs and a simulated thirty-minute stationary session.
- Shared platform emulator suite: **12/12 passed**, including staff/inactive/anonymous access, leases, stale revisions, legacy game IDs/history, private patient binding and note ownership.
- Mirror emulator suite: **5/5 passed**, including controller lease ownership, stale/duplicate revisions, malformed engine/oversized payload, public patient-ID rejection and immutable history.
- TypeScript, whole-repository ESLint, and `git diff --check`: passed.
- Production webpack build: passed in a credential-free snapshot of the current working tree, with fake demo Firebase config and local emulators. No production data or credentials were used.
- Independent browser walkthrough: actual staff login, exactly one Arabic card, anonymous Display, all 28 manual poses, four costumes/random selection, Control/Display reload recovery, history once and patient detail, simulation/loss/manual fallback, stage selection, low quality/reduced motion, repeated costume disposal, and second-window blocking. No browser page errors.

Build and test logs are in `validation/`. The runnable browser script and reproduction notes are also saved there. Default-suite skips are reported honestly; the 17 relevant local rules tests were run separately. No physical iPad, projector, sensor or wireless network is covered by these software tests.

## Browser evidence and performance

Final evidence: [browser metrics](validation/browser.json), [Control](validation/control.png), [both arms and target ghost](validation/both-arms.png), [completed session](validation/completed.png), [low quality](validation/low-quality.png), [lion](validation/lion.png), [rabbit](validation/rabbit.png), [bear](validation/bear.png), [fox](validation/fox.png), and [30-second gameplay recording](validation/gameplay.webm).

Measured macOS Chrome / local-emulator results: foreground Control **60.0 FPS**, Display **60.0 FPS** in the low preset; **39.6 ms** for one manual-input-to-Display sample; **0.267 idle writes/s**. The **120-second** rendering sample kept the lion scene at **165 geometries**, with **129** for rabbit/fox costume remounts and **165** after returning to lion. Low-preset lion draw calls were **165**. These are desktop measurements, not physical iPad/projector performance or a Wi-Fi latency distribution.

A two-minute rendering sample and repeated costume remounts check bounded geometry counts; the deterministic engine soak simulates thirty minutes. These do not replace a clinical-duration hardware soak test.

## Files added

- `app/control/mirror-quest-3d/page.tsx`
- `app/display/mirror-quest-3d/page.tsx`
- `components/control/mirrorquest3d/{MirrorControl.tsx,MirrorThumbnail.tsx}`
- `components/display/games/MirrorQuestDisplayModule.tsx`
- `components/display/mirrorquest3d/{MirrorCanvas.tsx,MirrorView.tsx,scene.ts,mirror.module.css}`
- `lib/mirrorquest3d/{engine.ts,input.ts,live.ts,history.ts,registration.ts,useSession.ts}`
- `lib/mirrorquest3d/__tests__/{engine.test.ts,rules.emulator.test.ts}`
- `docs/mirrorquest3d/{M1_CHECKPOINT.md,FINAL_REPORT.md}` and validation scripts, logs and browser artifacts.

## Shared files amended additively

`lib/games/registry.ts`; `components/control/library/gameThumbnails.tsx`; `components/display/gameDisplayRegistry.tsx`; `lib/realtime/{types.ts,sessionRepository.ts}`; `lib/sessions/{types.ts,sessionHistoryRepository.ts}`; `lib/analytics/patientAnalytics.ts`; `components/control/patients/{SessionHistoryRow.tsx,SessionDetailScreen.tsx}`; `lib/audio/AudioManager.ts`; `lib/audio/__tests__/prefetchLines.test.ts`; `database.rules.json`.

The audio type fixture excludes the new silent game from voiced-game fixtures; existing voiced-game assertions are unchanged. Mirror Quest requests no paid speech prefetch. No package/dependency, global sensor, existing game implementation or app layout was edited for this work. Earlier unrelated changes in these shared files were preserved. No reset, stash, clean, commit, push or deployment occurred.

## Remaining validation and batch deployment

Physical WT901 recognition and actual iPad/projector/Wi-Fi performance remain pending. Silent gameplay currently provides readable Arabic instructions and success text; no new Arabic audio assets were added. Manual sliders represent illustrative movement features, not a clinical measurement. The body rig is procedural geometry, not a motion-capture asset.

Before later batch deployment: merge the current unified platform baseline with these additive changes; review/deploy the candidate rules together with the app; set `NEXT_PUBLIC_MIRROR_QUEST_3D=true` at build time; rebuild and smoke-test staff Control, anonymous Display and patient history on intended devices. Production availability is opt-in; development shows the single card unless the flag is explicitly false. Rollback hides the card by setting the flag false and rebuilding. Hardware validation is required separately before adding physical input modes.

**MIRROR QUEST 3D SOFTWARE RELEASE CANDIDATE READY — Physical sensor validation and batch deployment pending.**
