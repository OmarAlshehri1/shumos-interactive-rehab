# Space Pilot 3D cross-device integration

Validation date: 2026-10-10. Software release candidate; physical iPad, projector and WT901 acceptance remains pending. No commit, push, Vercel deployment, live rules publication or live patient changes were performed. All Firebase test traffic used loopback demo emulators and fake patient/staff records.

## Therapist controls and preserved gameplay

The canonical Control screen now provides large touch targets for UP, DOWN, LEFT, RIGHT, diagonals and neutral. Holding a direction continuously steers the original flight simulation. Independent pointers combine directions; release, cancellation, lost capture, blur, hidden tabs and lost connectivity clear manual steering. The control surface prevents scrolling, text selection and context menus. Start, pause, resume, restart, next mission and end retain the existing lifecycle. Start has a local three-second preparation countdown.

Manual gameplay requires no sensor. EASY ignores vertical input; MEDIUM retains assisted altitude; ADVANCED accepts both axes. Existing sensitivity, reduced camera motion, reduced effects, guidance, golden rings, fiery asteroids, three missions, non-punitive collisions, no timed failure and cosmetic upgrades are preserved. Rendering, camera, encounter generation, scoring and collision implementation were reused rather than rebuilt.

| Flight mode | LOW | MEDIUM | HIGH |
| --- | --- | --- | --- |
| EASY, horizontal only | Verified | Verified | Verified |
| MEDIUM, assisted altitude | Verified | Verified | Verified |
| ADVANCED, two axes | Verified | Verified | Verified |

All nine combinations have pure simulation tests completing every ring and avoiding every hazard across all three missions, including actual directional pulse input. Independent browser contexts also verify each combination's touch steering and release. A complete EASY/LOW browser flight uses therapist directional buttons to collect 15 rings, avoid all three asteroids, resolve 18 unique encounters and reach upgrade tier 3 with score 1500. LOW/MEDIUM/HIGH retain 15/13/11 rings and 3/5/7 hazards respectively.

## Firebase authority and recovery

This integration reuses the platform's named staff/display Firebase clients, staff access gate, anonymous child Display authentication, connection status, immutable history repository, and Build Quest-style transactions, leases and accepted snapshots. Space Pilot retains its existing v4 gameplay/pointer contract inside a schema-1 bounded room envelope; it does not replace other games' transports.

Control owns simulation, collisions, missions, scores and accepted results. `spacePilot3d/rooms/<UUID>` is leased for 12 seconds to a unique mount token, staff UID and epoch. Compare-and-swap transactions fence stale ownership, epoch and revision. Copied tabs cannot share a token. Reclaimed accepted checkpoints restore flight geometry, encounter outcomes and counters in a stopped state requiring therapist resume. Run identities fence restarts. Encounter identities preserve exactly-once resolution.

Control ticks locally at 60 Hz; running snapshots are capped at 10 Hz, stopped snapshots at 1 Hz, with a 32,768-character serialized payload bound. No scene objects or raw WT901 data are streamed. Display renders accepted state and interpolates positions without extrapolating or deciding gameplay. It only writes its own bounded presence/acknowledgement every 400 ms. Missing presence or cloud freshness suspends progress; Display freezes after three seconds without accepted updates. Reconnect and reload preserve accepted progress and require safe resume.

`/display` selects the newest authorized active Space Pilot room relative to existing legacy/Build Quest selections. The explicit child URL is `/display/space-pilot?session=<UUID>`. Both devices must use the same reachable application origin and configured Firebase project; BroadcastChannel is only used for local sensor acquisition and unconfigured development/prototype sessions.

## Manual and RIGHT_HAND coexistence

The therapist may select MANUAL or RIGHT_HAND. The internal `keyboard` value remains the original manual contract identity; touch controls are the production steering interface. A held manual direction temporarily takes priority in sensor mode. An explicit takeover button keeps manual control active even at neutral and when the sensor is absent. Releasing takeover rearms the original fresh-sample/pickup protection at the current ship position before sensor steering resumes. Sensor loss suspends steering without discarding progress; manual takeover permits immediate safe continuation.

For iPad Control with a separate supported sensor laptop, choose the remote RIGHT_HAND source, open `/control/space-pilot/sensor-source?session=<UUID>` on that laptop and sign in with the same staff account as the owning Control. Use the existing sensor setup to connect/calibrate RIGHT_HAND, then return to the source page and keep it visible. The source listens to the unchanged local filtered pointer channel and forwards normalized x/y/visibility at at most 10 Hz. Server timestamp age plus source sample age prevents stale input despite device clock differences. Room/run/input epoch, publisher token and sequence fence old or competing sources. The ordinary child Display remains read-only for steering.

BLE drivers, calibration, motion filters, recentering, role assignments and the existing local pointer protocol were not modified. Physical BLE remains subject to the platform's existing supported-browser requirements.

## Ring history and legacy compatibility

Patient binding is private, immutable and established once per room. Eligible patient sessions save accepted completed or ended results using `saveSessionHistoryOnce`, under the same canonical `space-pilot` identity with `resultVersion: 2` and `engine: sp3-rings`. Rules bind score, ring counts, missions, upgrades, mode and timestamps to the owned accepted room and deny overwrites, deletion and fabricated results. Retry uses the same session key. Walk-in rooms have an immutable empty patient binding and do not write patient history.

Unversioned legacy star results retain their original type and interpretation. New rows/detail/analytics display ring labels separately, keep legacy stars intact and exclude misleading mixed star/ring trends. Unsupported future result versions are not silently parsed as legacy results. No history migration or deletion is included.

## Registration, flag and rollback

The existing `space-pilot` identity and `/control/space-pilot` canonical route are retained with exactly one library card. The approved build-time flag is `NEXT_PUBLIC_SPACE_PILOT_3D_ENABLED=true`. In production/test, an unset flag defaults to legacy; development defaults to 3D. Explicit `false` selects legacy in every environment. Production must have the existing valid Firebase configuration; unconfigured development uses local transport and clearly states that patient history is not saved.

Rollback: set `NEXT_PUBLIC_SPACE_PILOT_3D_ENABLED=false`, rebuild and deploy the reviewed application. Canonical game selection returns to the preserved legacy Control/Display behavior; `/control/space-pilot-legacy` remains available. Retain additive Firebase rules and all ring/star history; do not delete rooms or migrate results. Public environment variables are compiled into the application, so changing the flag requires a new build. Automated registration tests cover enabled/disabled branches and unchanged other-game metadata.

## Files created for this integration

- `lib/spacepilot3d/cloudState.ts`
- `lib/spacepilot3d/firebaseControlRuntime.ts`
- `lib/spacepilot3d/firebaseDisplayRuntime.ts`
- `lib/spacepilot3d/history.ts`
- `lib/spacepilot3d/sensorRelay.ts`
- `lib/realtime/spacePilotRepository.ts`
- `lib/spacepilot3d/__tests__/crossDevice.test.ts`
- `lib/spacepilot3d/__tests__/sensorRelay.test.ts`
- `lib/spacepilot3d/__tests__/rules.emulator.test.ts`
- `components/control/spacepilot3d/ManualFlightControls.tsx`
- `components/control/spacepilot3d/SpacePilotSensorSource.tsx`
- `components/display/spacepilot3d/SpacePilotDisplayRouter.tsx`
- `app/control/space-pilot/sensor-source/page.tsx`
- `docs/spacepilot3d/DATABASE_RULES_FOR_FIREBASE_CONSOLE.json`
- `docs/spacepilot3d/CROSS_DEVICE_INTEGRATION_REPORT.md`
- `docs/spacepilot3d/validation/cross-device.mjs`
- `docs/spacepilot3d/validation/load-emulator-rules.mjs`
- Evidence artifacts listed below, plus `screenshots/cross-device-complete.png`.

## Existing files modified for this integration

Some prior Space Pilot files were already untracked when work began; they are listed here as existing work, not newly invented gameplay.

- `lib/spacepilot3d/sessionAuthority.ts`
- `lib/spacepilot3d/sessionContract.ts`
- `lib/spacepilot3d/controlSessionRuntime.ts`
- `lib/spacepilot3d/releasePolicy.ts`
- `lib/spacepilot3d/__tests__/releaseIntegration.test.ts`
- `lib/spacepilot3d/README.md`
- `components/control/spacepilot3d/SpacePilot3DControl.tsx`
- `components/display/spacepilot3d/SpacePilot3DSessionDisplay.tsx`
- `app/display/space-pilot/page.tsx`
- `app/display/page.tsx`
- `lib/games/registry.ts`
- `lib/sessions/types.ts`
- `lib/sessions/sessionHistoryRepository.ts`
- `lib/analytics/patientAnalytics.ts`
- `components/control/patients/SessionDetailScreen.tsx`
- `components/control/patients/SessionHistoryRow.tsx`
- `database.rules.json`

Unrelated pre-existing/concurrent Runner Quest, Balloon Quest, Build Quest, sensor and platform changes were retained. Shared edits were targeted and the rules were merged with the current file. No reset, stash, clean or discard was used. The final batch review must still review all agents' shared changes together.

## Automated verification and evidence

- TypeScript: `npx tsc --noEmit` passed; `validation/typecheck.txt` (empty output is success).
- Lint: `npm run lint` passed without warnings; `validation/lint.txt`.
- Focused default Space Pilot tests: 194 passed, six opt-in emulator tests skipped in this default-only run; `validation/focused-tests.txt`. Those six are included in the full emulator run below.
- Full Vitest with all four game emulator switches enabled: **1,755 tests in 138 files passed, zero skipped**; `validation/full-tests-emulators.txt`.
- Production build: `npm run build -- --webpack` passed with explicit enabled flag and fake emulator-only Firebase configuration; `validation/production-build.txt`.
- Integrated production browser workflow: see `validation/cross-device.json`, `validation/browser.txt` and the screenshot. This is desktop Chrome with native Metal rendering, independent touch Control/anonymous Display contexts and a separate authenticated remote source context, not physical iPad/projector validation.

Integration source hashes are retained in `validation/source-sha256.json` to identify the validated files. `git diff --check` passed.

The isolated app copy excluded `.env*`, reused installed dependencies and served on loopback port 3178. Existing build fonts required network access; Firebase traffic remained local. Database emulator port 19200 and Auth emulator port 19099 use demo namespaces. The complete merged rules were loaded into isolated Space Pilot/Build Quest/Runner Quest/Balloon Quest namespaces. Existing other-game emulator tests only had loopback ports redirected in the temporary copy, preserving their source tests and separate namespaces.

Emulator checks cover active/inactive/anonymous authorization, leased ownership takeover, stale revisions, bounded snapshots, restricted anonymous presence, source ownership/role/token/sequence/freshness, active route selection, immutable ring history, forged counters, patient binding and legacy star compatibility. Rules include all previous branches and approved local Build Quest changes; the Console deliverable is byte-identical to the final root rules file. Security was not bypassed for app clients; emulator admin access only seeds fake fixtures and inspects results.

The browser workflow covers touch hold/release/cancel, all nine combinations, native simultaneous multi-touch, pause/resume/restart/end, both reloads, local sensor simulation, manual override and pickup, sensor disconnect/fallback, offline recovery, remote RIGHT_HAND relay with a two-minute source clock offset, competing Control rejection, complete three-mission scoring/upgrades/history and empty-binding walk-in behavior. It records uncaught page errors and external Firebase requests and requires both lists empty.

## Performance and remaining hardware acceptance

The final browser workflow passed all 12 checks with zero uncaught page errors and zero external Firebase requests. The full flight took 111.045 seconds. The largest sampled snapshot was 7,684 characters, within the 32,768 bound; 1,041 polls sampled 5,224,112 payload characters (polls may repeat an accepted revision). Accepted final revision was 971. At completion, the Display measured 60 FPS across the latest 240 frames, mean 16.67 ms, p95 16.80 ms and max 17.60 ms at DPR 1 / medium quality, with 41 draw calls, 69,552 triangles, 32 geometries, three textures and 17 shader programs; assets loaded in 118 ms.

Final browser measurements are recorded in `validation/cross-device.json`: completed flight duration, sampled snapshot count/bytes, largest payload, accepted revision and renderer frame/geometry/draw-call metrics. Snapshot measurements are sampled serialized payload character counts, not network-wire totals. Rendering performance applies to the tested desktop Chrome/Metal environment only. It is not an iPad, projector or slow-network benchmark.

Before clinical rollout, physically verify:

1. Actual iPad Safari: simultaneous touch, pointer release/cancel, orientation changes, focus loss, sleep/wake, reachable HTTPS origin and manual completion.
2. Actual laptop/projector: resolution/DPR, fullscreen, brightness/contrast, readable Arabic HUD, rendering load and sustained frame pacing.
3. Actual calibrated RIGHT_HAND WT901 on the supported laptop: BLE connection, pickup, recenter workflow, sensor loss, reconnect, manual takeover/release and source page visibility. Existing calibration and filters must remain unchanged.
4. Real clinic Wi-Fi: latency/jitter, dropped link, lease recovery, Control and Display reload, and history retry with a designated test patient.
5. Recheck reduced effects/camera motion and sensitivity with the intended hardware and therapist.

## Exact batch review and deployment order

No deployment is authorized by this report. After batch approval:

1. Review this report, the complete current batch diff, feature flags and all agents' changes. Re-run merged-rule emulators/full tests/build if shared files changed after this validation. Verify `database.rules.json` and `docs/spacepilot3d/DATABASE_RULES_FOR_FIREBASE_CONSOLE.json` match exactly. Include both in the reviewed batch commit; push only after approval.
2. Review the destination Firebase project identity and existing production rules. Reconcile any live rules added since this local snapshot before replacing the Console contents. Preserve all other supported games and staff policies.
3. **Publish reviewed merged rules first, while the existing app is still served.** In Firebase Console, select the approved production project → Build → Realtime Database → the existing database → Rules. Open `docs/spacepilot3d/DATABASE_RULES_FOR_FIREBASE_CONSOLE.json`, select and copy the entire JSON document, replace the editor with that complete document, review the diff and publish. Do not paste a fragment or Markdown. This step is manual and requires batch approval; it was not performed here.
4. **Deploy the reviewed application second.** In the approved Vercel project retain existing production Firebase values and other games' flags; set `NEXT_PUBLIC_SPACE_PILOT_3D_ENABLED=true`. Do not use the fake test values, demo URLs or `NEXT_PUBLIC_FIREBASE_EMULATOR_HOST`, `NEXT_PUBLIC_FIREBASE_EMULATOR_PORT`, `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT`. Build and deploy the approved batch over HTTPS.
5. On the same deployed origin, sign in as active therapist, select a designated test patient or walk-in, open the single Space Pilot card and normal child `/display` on the other device. Verify manual flight, accepted scores, end/history, reload recovery and no legacy-star reinterpretation. For remote sensor mode use the source URL from Control and the same staff account. Complete physical acceptance above before patient use.
6. If acceptance fails, apply the flag rollback and rebuild; preserve all patient history and additive rules. Do not publish an older partial rules file over other agents' approved changes.
