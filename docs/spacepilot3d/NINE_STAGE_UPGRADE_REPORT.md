# Space Pilot 3D — Nine-stage upgrade

Date: 11 October 2026. Canonical game: `space-pilot` / قائد الفضاء 3D.

This report supersedes the three-mission Space Pilot limitation in the earlier library audit. It describes this focused upgrade in the existing unified working tree; earlier game-library changes and concurrent Runner Quest work are preserved. No commit, push, deployment, rules publication, or live patient operation was performed.

## S1–S9

| Step | Result |
|---|---|
| S1 | Audited the actual mission definitions, world flight/ring physics, authoritative session, publisher, lease, sensor relay, renderer, flags and history readers. |
| S2 | Added an explicit accessible 3×3 curriculum with nine distinct static ring patterns. |
| S3 | Added arbitrary selection, current-stage restart/repeat/skip and progression through all unresolved stages. Accepted stage results have unique identities. |
| S4 | Preserved native touch flight and sensor/manual takeover. All nine stages were completed through the actual Control touch interface. |
| S5 | Reused the existing Control authority, `liveSession.sp3`, Display subscription/ACK, lease, sensor relay and immutable history saver. |
| S6 | Added result version 3 / `sp3-nine-v1`; kept unversioned star history and version-2 three-mission ring history. Dense and sparse Firebase stage-key arrays are normalized on read. |
| S7 | Added Arabic level/stage labels, nine-stage selection and summaries. Existing spacecraft, environments, renderer, camera, ring collision and reduced-motion support remain. |
| S8 | All required software validation passes; exact results are recorded below. |
| S9 | One canonical registration and existing routes are retained; deployment and physical hardware validation remain separate batch work. |

## Source audit and changed structure

Previously `missions.ts` defined three mission plans, with LOW/MEDIUM/HIGH presets and a three-mission run. `worldGameplay.ts` performed real world flight and capsule/ring-plane resolution, while `SessionAuthority` fenced commands with run/revision/input identities. Rings score 100 points. The integrated Control already had native touch/manual controls and the Display used the existing Three renderer.

The new curriculum is opt-in at fresh production/session creation. Old checkpoints without a curriculum marker remain three-mission sessions. Legacy `missions.ts`, the older lane gameplay engine, sensor transport, flight integration, collision implementation and visual renderer have not been replaced.

| Level | Stage | Arabic name | Rings | Route |
|---|---|---|---:|---|
| Easy | 1 | الحلقات الأولى | 4 | Stationary central rings, generous default assistance |
| Easy | 2 | اتجاه لطيف | 4 | Short, small directional changes |
| Easy | 3 | الطريق المضيء | 6 | Longer predictable horizontal sequence |
| Medium | 1 | حديقة الكواكب | 5 | Varied ring positions |
| Medium | 2 | يمين ويسار | 5 | Gentle alternating directions |
| Medium | 3 | رحلة بين النجوم | 6 | Longer route with adjustable assistance |
| Advanced | 1 | ألوان المدار | 5 | Varied route pattern |
| Advanced | 2 | مسار الأصدقاء | 5 | Short combined directions |
| Advanced | 3 | المغامرة الختامية | 6 | Scenic combination of previous patterns |

Total: **46 ring encounters**. Ring positions are static during each attempt; vertical differences are flattened in EASY flight assistance and become available when the therapist chooses another flight mode. Curriculum level does not change selected assistance, sensitivity or turn settings. Every stage has speed factor 1 and the curriculum uses the same base speed 9; EASY flight remains 16.875 world units/s, other flight modes 22.5. Advanced curriculum stages do not force faster travel or reduced assistance. Conservative placement still uses the existing flight bounds/turn budget.

## Therapist participation and progression

Control exposes nine independent choices, with Arabic level/local-stage names and completed/skipped feedback. Selection stops/reprepares the target stage. Restart and repeat clear that stage's accepted attempt and score before replay; other stage results remain. Abandoning an unfinished attempt removes its unfinished outcomes. Repeats are recorded without adding duplicate accepted results. Paused settings changes reprepare only the current stage.

Skip records a separate skipped stage, including any actual participation already accepted. Advance finds the next unresolved stage and wraps after stage 9 if earlier stages remain. Terminal curriculum progress can include skips; `sessionCompleted` in history is true only when all nine stages were actually completed. Completed means the actual stage attempt resolved its objectives; missed rings remain missed and do not award points. Assistance is a separate property, based on configured flight assistance/tolerance or actual accepted therapist manual input, rather than another completion count. The current-stage assistance marker survives reload, including when ADVANCED flight and zero ring tolerance are selected. Recovery explicitly restores the saved difficulty after initial scene preparation, so advanced-stage indices remain aligned with their level. Stage 8 recovery is verified in unit and browser tests.

Start/pause/resume/end/results retain existing lifecycle guards. Native touch up/down/left/right/neutral feed actual flight input. Manual takeover remains available when sensor control is selected; unavailable input without takeover safely suspends the simulation. Changing levels does not activate unsupported hardware.

## Cross-device integration and bounded data

Control remains authoritative; Display presents accepted state and emits existing bounded readiness/presence acknowledgements. Protocol version 4, run/revision/input epoch fencing, staff authentication, controller lease and ownership recovery remain. The existing `lib/liveGame` publisher, repository and save-once history path are reused. The checkpoint remains within the existing 32,768-character bound; stage ledgers/outcomes have explicit nine-stage/46-encounter limits.

There is no new Firebase tree. Existing `liveSession`, patient `sessions`, `spacePilot3d/presence` and authorized right-hand relay paths remain. The running snapshot interval stays 100 ms, stopped snapshots 1 s and heartbeat behavior stays unchanged. The scene keeps its existing six-object reusable encounter pool; routes with four/five rings use that pool without adding a new renderer.

## History and rules

| Format | Interpretation |
|---|---|
| Legacy stars, unversioned (historical v1) | Original star counts and upgrade scale; no reinterpretation |
| `resultVersion: 2`, `engine: sp3-rings` | Original three-mission ring record |
| `resultVersion: 3`, same ring engine, `curriculumId: sp3-nine-v1` | Nine-stage ledger, start/end global indices, completed/skipped/assisted counts and full-curriculum completion |

New history keeps the same canonical game and session ID/save-once contract. Records retain one accepted row per global stage index; replays replace an attempt rather than multiplying totals. Firebase can return a dense numeric-key ledger as an array, so the reader removes array null placeholders for absent stages, validates every remaining canonical key/row and normalizes it into the expected record. Null rows in object-form ledgers remain invalid. Empty ledgers, malformed/null rows, duplicate identities and inconsistent counts are handled explicitly. Historical records are not migrated or edited. Mixed three-stage/nine-stage records do not generate an apparent progression trend solely from the changed curriculum.

Rules add a scoped version-3 branch and fields, canonical stage-key/index checks, per-stage encounter counts, completed/skipped/assisted ledger-count checks, ring conservation/score limits and rejection of star fields on new ring results. Existing star/version-2 branches and all authentication, owner, immutable-history and anonymous Display restrictions remain. The shared release candidate matches `database.rules.json`; it has **not** been published.

## Browser evidence

`nine-stage-evidence/nine-stage-browser.json` records nine actual native-touch stage completions in independent Control and Display contexts (iPad-sized touch Control, separate child Display). No command injection, engine acceleration or fabricated ring results were used. Tests observed the real authoritative checkpoint and steered using only native flight buttons, including neutral/braking.

The completed run collected **45 of 46** rings, missed one, scored **4500**, completed nine stages and skipped zero. All nine assisted stage results are represented once. There were zero unexpected suspensions in the completed run, zero application page errors and zero observed resolved-count lag in 67 sampled Control/Display comparisons. Stage 1 was reloaded after collecting two rings; its stage, ring progress and pending repeat count survived, with stopped recovery and explicit resume. Selection of stage 9 before prerequisites, skip/repeat replacement, current-stage restart, pause synchronization, sensor loss and manual fallback were also exercised.

Screenshots `stage-1-control.png` through `stage-9-display.png` capture each completed stage in both views. `nine-stage-history.png` captures the saved patient detail. The history read initially exposed Firebase's dense-key array representation; the reader was fixed and the retained actual completed result was verified again with the final build. Flight/progression behavior was unchanged by the reader corrections. The later manual-participation marker only records assistance; it does not change pose, physics, scoring or stage resolution. Its accepted-input/reload behavior with zero tolerance and ADVANCED flight is verified in `manual-assistance-browser.json` and unit tests. Save-once remained intact across reload.

## Validation

| Check | Result |
|---|---|
| TypeScript | Standalone `tsc --noEmit` in the fresh isolated unified tree and production type checks pass. |
| Full ESLint | `npm run lint`: zero errors and zero warnings. |
| Focused Space Pilot | 17 suites pass; 202 tests pass, 7 emulator tests intentionally skipped outside emulator execution. |
| Full Vitest | 156 suites pass; 1961 tests pass, 98 emulator tests intentionally skipped. No test timeout was weakened. |
| Firebase emulator rules | 14 suites, 99 tests pass, including actual nine-stage completion, save-once, malformed ledgers and unauthorized writes. |
| Production enabled | `next build --webpack`, isolated final unified source: pass. |
| Production disabled | Final flag-disabled production build passes; canonical legacy fallback and all history readers pass. |
| Nine-stage browser | All nine actual manual-mode touch attempts pass; completed result, reload/save-once and staff gate pass. |
| Historical readers | Legacy stars, version-2 rings, new nine-stage history and sparse-ledger fixtures pass in both final flag configurations. Old fixtures remain byte-for-value unchanged. |
| Other game launches | All 12 other canonical games start with shared Display and zero page errors. Final native manual checks also pass; Runner's new projection selection was explicitly chosen. |
| Resources / walk-in | Four-direction touch, neutral, end/results, scene cleanup, stopped publications and no patient history writes pass against baseline and new build. |

Evidence logs and JSON are stored in `nine-stage-evidence/`. `other-games-final.json` combines the initial launch matrix with focused follow-ups adapting to moving balloons, uppercase safe-tile state and Runner's current projection/button UI. The earlier library category counts remain 6/7/6/3 (22 presentations, 13 canonical games).

An initial full run caught the release candidate needing synchronization with the additive rules. It was synchronized. A later concurrent-heavy run timed out in an unchanged flight-boundary test; final verification runs without concurrent builds rather than weakening the test timeout. An accidentally root-started isolated-output build was removed together with its generated-only configuration entries; the original tracked TypeScript configuration was preserved and full lint was rerun.

## Performance and physical limits

Recorded baseline/new Display animation cadence: **59.88 / 59.88 FPS** median. Baseline p95 frame gap 17.5 ms; nine-stage sample 18.4 ms. Baseline sample 5,043 ms, new sample 15,061 ms. These are browser `requestAnimationFrame` cadence measurements on this machine, not certified iPad GPU frame-rate measurements.

Baseline/new published-revision rate: **7.93 / 8.37 per second**. This is a live-record revision proxy and excludes presence/lease traffic; sample windows differ. The actual configured publisher interval is unchanged at 100 ms. Local native pause-to-independent-Display latency was **117 / 48 ms** (one sample each, not a latency percentile or a physical-network guarantee). A separate equal-window measurement counted actual Control WebSocket root merges containing `liveSession`: baseline **90**, new **90** in 10,000 / 10,002 ms (**9.00 / 9.00 writes/s**). ACK, presence and lease-only writes were excluded; there is no meaningful write-frequency regression. The equal-window cadence was 59.88 / 59.88 FPS, with p95 gaps 18.6 / 18.7 ms. See `resource-cleanup-browser.json`.

Existing graphics lifecycle tests verify model/scene/texture/instanced-resource disposal, late-fetch cancellation and idempotent disposal. Browser cleanup additionally verified all four native touch directions and neutral, actual end/results, scene removal (one canvas to zero), stopped live updates and no walk-in writes to patient history. After forced GC, active Display JS heap was 11,117,416 / 11,151,412 bytes; after cleanup 9,783,464 / 9,886,400 bytes (baseline/new). Both runs retain cached app code after the scene is removed. The browser released 1,333,952 / 1,265,012 bytes from the active scene. These are two representative sessions, supported by resource-disposal unit tests, not a long-duration GPU-memory certification. No physical sensor, joystick, steering wheel, clinical network, projected room or real iPad has been certified by these local software checks. The existing right-hand/manual capability stays accurate; unsupported left/dual hand, joystick and driving hardware are not falsely enabled for Space Pilot.

## Library and feature flag

`space-pilot` remains one canonical registry definition and one Control route, with its existing Display integration. Required Hand-sensor and Joystick category preferences remain; the same definition is intentionally presented in both sections, as required by the preceding device-based library specification. Two category presentations do not constitute two games or registrations. The 13 canonical games/22 category presentations are preserved.

Flag: `NEXT_PUBLIC_SPACE_PILOT_3D_ENABLED`. Production enablement remains explicit. False routes the canonical Control to its original legacy fallback; historical readers for all three result formats remain available independently of the flag. Existing in-progress unmarked three-mission checkpoints remain recoverable.

## Exact implementation files changed for this upgrade

- `lib/spacepilot3d/curriculum.ts` (new)
- `lib/spacepilot3d/worldGameplay.ts`
- `lib/spacepilot3d/sessionContract.ts`
- `lib/spacepilot3d/sessionAuthority.ts`
- `lib/spacepilot3d/firebaseControlRuntime.ts`
- `lib/spacepilot3d/controlSessionRuntime.ts`
- `lib/spacepilot3d/cloudState.ts`
- `lib/spacepilot3d/sessionStorage.ts`
- `lib/spacepilot3d/history.ts`
- `lib/spacepilot3d/__tests__/nineStage.test.ts` (new)
- `lib/spacepilot3d/__tests__/rules.emulator.test.ts`
- `lib/sessions/types.ts`
- `lib/analytics/patientAnalytics.ts`
- `components/control/spacepilot3d/SpacePilot3DControl.tsx`
- `components/display/spacepilot3d/SpacePilot3DSessionDisplay.tsx`
- `components/control/patients/SessionDetailScreen.tsx`
- `database.rules.json`
- `docs/release/FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json` (matching shared candidate)
- `docs/spacepilot3d/NINE_STAGE_UPGRADE_REPORT.md`
- Evidence files under `docs/spacepilot3d/nine-stage-evidence/` (manifest lists exact artifacts)

No unrelated game implementation was edited for this assignment. Concurrent Runner Quest changes were included in unified build/test validation and left intact. A late floor shadow-map constant change was copied only into the isolated validation tree; final enabled/disabled builds, full tests and the actual Runner floor Control/Display launch pass against it (`runner-floor-launch.json`). Isolated local ports and synthetic demo users/patients were used; no other agent's servers were stopped.

## Rollback and batch deployment checklist

1. Review the latest unified source and matching rules candidate, including concurrent game changes; retain normal operator backups.
2. Before activating the version-3-writing build, deploy the reviewed additive schema rules through the authorized batch process. This report does not authorize or perform that publication.
3. Deploy the reviewed application with the intended feature flags. Verify staff Control, anonymous read-only Display, ownership fencing, nine-stage selection and a synthetic save-once result.
4. Verify legacy star, version-2 three-mission ring and version-3 nine-stage patient detail views. Keep old records immutable.
5. Validate physical iPad touch, right-hand sensor loss/takeover/reconnect, projector readability, latency and stability with staff before patient use. Unsupported hardware stays manual/unavailable.
6. If rollback is needed, rebuild with `NEXT_PUBLIC_SPACE_PILOT_3D_ENABLED=false`. Keep additive rules and the new history reader so existing version-3 records remain readable; do not delete or reinterpret histories. End active sessions safely through existing controls before changing runtime versions.

Status: all critical software requirements pass. Batch deployment and physical hardware validation remain pending.

SPACE PILOT 3D NINE-STAGE UPGRADE READY — Awaiting batch deployment and physical hardware validation.
