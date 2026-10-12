# Shumos clinical dashboard and therapy visits — implementation report

Implemented locally in the existing application on 12 October 2026. No commit, push, deployment, patient migration, or Production Firebase rule publication was performed. This is a substantial tested upgrade with the integration limitations listed below; it is not completion of every item in the master brief.

## Implemented

- `/control` has a compact Arabic RTL clinical dashboard. The duplicated game-card library and floating duplicate audio warning are removed. The complete canonical library remains `/control/activities`.
- Readiness cards show Display/audio first, two existing hand BLE runtimes, foot configuration limitations, local Gamepad assignments, and wheel/pedal information. Actual Display heartbeats and Display-authored AudioContext observations expire after 45 seconds. Hand readings distinguish a connected device from an old sample. No hardware readiness is inferred from a game’s input capability.
- The quick action enters the library directly, clears permanent patient association and uses the anonymous greeting “صديقي”. The existing `/control/quick-session` wizard remains available unchanged.
- `/control/visits` supports searching authorized active patients, the canonical `AddPatientSheet` creation flow, or an ephemeral guest name. Setup includes an editable therapist display name, title, initial notes, 30/45/60/custom duration; 45 minutes is the default. Auth UID, not entered name, authorizes writes.
- The Control layout owns a persistent visit bar and timestamp-based timer. Saved visits reconstruct from Firebase; guest visits reconstruct from sessionStorage. Remaining time becomes red overtime, without ending a game or sending any Display command. Extension, pause/resume and one Control-only gentle alert are supported. If its AudioContext is unavailable, the persistent visual warning remains.
- A break requires the native game to be ready, finished or actually paused in a supported state shape. The visit never pauses/restarts/resumes a game automatically. Resume only resumes visit timing.
- Workflow entry no longer deletes `liveSession`. Shared pending publication notifications block switching while writes await acknowledgement. Unfinished games and finished patient games without confirmed immutable history block navigation. A different game cannot mount over a recoverable unfinished game. Browser-back recovery provides a return-to-activity action. Native finish/end and retry controls remain the authoritative game lifecycle.
- For supported tab-stamped game records, the visit links the exact acknowledged history key, including engines with `-r{run}` result IDs. It verifies patient, game, start time, auth owner and tab ownership. Gameplay history is never re-saved by the visit layer. An immutable claim prevents assigning a result to another visit. Failed clinical saves retain the prior state and editable draft rather than claiming optimistic success.
- Shared evaluations have separate unrated/0–5 therapist judgment, assistance, completion status and notes. Existing gameplay stars are shown when the result format exposes them. The UI explicitly describes the rating as an unvalidated professional judgment, separate from game scoring.
- Therapist-confirmed exercise blocks include title, goal, repetitions, hold duration, assistance, completion and notes. Exercise evaluation remains editable. No sensor-based pressure/weight-bearing verification is invented.
- End-of-visit review includes planned/elapsed/overtime timing, activities, notes, optional overall rating and a blocker for an unfinished/unconfirmed game. Saved visits appear in the existing patient profile. Owner-authorized evaluation edits retain revision, editor UID and last edit time. All historical individual game results remain readable in the existing section.
- Central typed activity-skill metadata appears on library cards. New registry entries can declare optional `activitySkills`; no category is inferred from sensor membership.
- `/control/calibration` provides WALL/FLOOR grid, safe inset, target size/spacing, rotation, optional tape-measured dimensions, fullscreen projection, local save/load and JSON export/import. Profiles are reusable on another computer by import. Established game geometry is unchanged.
- Clinical dialogs support keyboard focus containment and Escape cancellation. The visit bar reserves screen space instead of covering fixed game controls.

## Data model and security

Existing `liveSession`, private patient binding, controller lease, native engines, history revivers and `/sessions/{patientId}/{sessionId}` remain in place.

| Addition | Purpose | Access and durability |
| --- | --- | --- |
| `therapyVisits/{patientId}/{visitId}` | Identity, title, clinician name, initial/final notes, timestamp timing, accumulated pauses, break timeline, revision and clinical activity entries | Existing active-staff patient read permissions; creation/edits restricted to the owning auth UID. Immutable identity, validated fields and revision increments. No deletion through application rules. |
| `activeTherapyVisits/{uid}` | Recover the saved active visit; reject a second simultaneous saved visit for this staff account | Only that active staff UID may read/write the pointer; a new pointer requires the previous visit to have ended. Creation is an atomic multi-location update with the visit. |
| `visitResultClaims/{patientId}/{sessionId}` | Permanent, immutable association of an existing saved result to one visit | Staff-only reads. One creation by the result’s author for a visit they own; cannot overwrite, remove or reassign. |
| `shumos.control.guestVisit.v1` in sessionStorage | Guest name, timing, exercise entries and evaluations in this Control tab | No Firebase visit/patient/history write. Survives refresh; cleared at finish or tab closure. Owner UID/tab checked on restoration. |
| `shumos.projection.profiles.v1` in localStorage | Reusable nonclinical projection profiles | Local to the browser, schema validated on import; portable JSON export/import. |

`entries` contain result references and clinical evaluation, not copied game histories. The authoritative result-to-visit association is the immutable claim index. Repository updates preserve game reference identity and refuse deletion; a deliberately crafted owner write could remove a presentation entry, but cannot delete/reassign its authoritative claim or immutable game result. No append-only clinical annotation audit trail is implemented; current revision/editor/time are retained.

New rules are additive in [database.rules.json](../../database.rules.json). The reviewed-console export at [FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json](../release/FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json) is kept identical because the repository’s regression checks require it. Neither file was published. Public Display state receives no visit ID, patient ID, clinical notes, duration, rating or therapist metadata from this upgrade.

Saved writes await Firebase acknowledgement. Revision transactions use `applyLocally: false`; competing/stale writers fail instead of overwriting a newer visit. The UI permits active visit mutation only in its initiating Control tab. Rules authenticate the staff account, not a browser tab; tab isolation is an application-level concurrency safeguard.

## Validation

| Check | Result | What it establishes |
| --- | --- | --- |
| TypeScript | Passed using isolated validation configuration | No application type errors; stale default `.next` validators for previously removed routes were excluded. |
| ESLint on changed application files | Passed | No lint errors or warnings in the changed clinical code. |
| Full Vitest suite | **2,010 passed; 104 skipped**, 167 passing files and 14 skipped | Existing engine/history/privacy/registry regression coverage plus the clinical tests. Skipped emulator/optional suites are not claimed tested. |
| New focused clinical tests | **25 passed** | Accelerated 30/45/60/custom timing, pause/resume, overtime, extension, finish, reload serialization, result-key matching, cross-patient/run protection, invalid data, readiness freshness, projection schema, acknowledged writes, stale revisions, immutable claim conflicts, failed publish/retry. |
| Isolated Firebase security tests | **6 passed** | Atomic visit creation, one active visit per staff, denied anonymous reads, owner-only writes, immutable identity, invalid/missing references, cross-patient references, invalid rating/notes, immutable claims, revision protection, completion. |
| Production Next.js build | Passed; 58 routes generated | Compile, TypeScript, page generation and route integration. No deployment. |
| Clinical browser run | **19 checks passed; no uncaught page errors** | Home/library separation, direct quick entry, guest flow, exercise confirmation/edit, pause/reload, saved patient recovery, extension, finish/history, canonical new-patient creation/visit association, 60/custom setup, local calibration reload, iPad overflow, separate Display connection. |
| Native Balloon Quest browser integration | **8 checks passed; no uncaught page errors** | Native start, blocked active navigation, native pause before break, partial completion, confirmed save/reference link, separate clinical evaluation, library transition after save, completed visit preserving game history. |
| Audio browser run | Passed; no uncaught page errors | Remote request reached Display and it reported an actual running AudioContext. Display start/unlock gesture was exercised separately. This Chromium session allowed the remote attempt; other browsers can still require direct Display interaction. Readiness covers the shared Display AudioManager; custom game audio contexts may need their own native unlock. No physical speaker audibility claim. |

Evidence is in [validation](validation/), [browser-results.json](browser-results.json), [game-browser-results.json](game-browser-results.json), and [audio-browser-results.json](audio-browser-results.json). Automated browser drivers are in [qa](qa/). Demo accounts, names and notes in screenshots are synthetic.

Production-build success is not being used to imply complete game-by-game integration or physical validation. No real 45–60-minute endurance session was performed. No physical BLE, foot sensor, handheld/Joy-Con, wheel, pedals, projector optics or speakers were tested in this task.

## Screenshots

- [Desktop dashboard](screenshots/dashboard-desktop.png)
- [iPad dashboard](screenshots/dashboard-ipad.png) and [session-entry area](screenshots/dashboard-ipad-session-entry.png)
- [Display connected](screenshots/dashboard-display-connected.png) and [Display audio ready](screenshots/dashboard-audio-ready.png)
- [Guest visit and exercise review](screenshots/guest-visit-review.png)
- [Native game clinical evaluation](screenshots/game-clinical-evaluation.png)
- [Patient visit review](screenshots/patient-visit-history.png)
- [Projector calibration](screenshots/projector-calibration.png)

## Incomplete work and integration limits

1. **Not a universal automatic game finisher.** Switching instructs the therapist to use the existing native end/save controls; it does not synthesize partial results or inject a generic end command into all engines. Save protection is implemented for shared Firebase publications. Local BroadcastChannel-only demo adapters do not expose equivalent global gameplay/save state.
2. **Not all adapters link automatically to a parent visit.** Automatic linking requires the existing modern `controlTabId` stamp. Older engine variants and Runner Quest records that do not carry this stamp are intentionally not associated based merely on time or patient name. Their independent history still works. Each needs a tested ownership/completion adapter before claiming parent-visit integration. Balloon Quest was browser-tested; the other native games received automated regression coverage, not individual full clinical browser runs.
3. **Guest gameplay metrics are incomplete.** Guest visits retain activity references, clinical evaluation, exercises and timing ephemerally. Full guest game metrics/stars are not captured for later review after switching because the canonical history layer intentionally skips permanent guest history. No fake patient ID was introduced to work around this.
4. **Analytics simplification is partial.** Visit review/evaluation offers a compact clinical summary with a link to existing details. Existing standalone analytics and detailed game result screens were preserved, including legacy metrics/revivers. A broader advanced-details disclosure refactor and comparable-session trend UI are not implemented. Games linked to visits remain visible in the existing all-game history section; it is clearly labeled rather than hiding old data.
5. **Calibration is a foundation.** The grid consumes the reusable profile. Native games do not yet consume it globally. There is no remote Firebase calibration relay to `/display`, no automatic optical correction, no verified centimeter mapping, and no cross-device profile sync beyond JSON export/import.
6. **Hardware coverage is deliberately limited.** The hand cards use existing BLE runtimes. There is no new shared foot connection/calibration runtime, remote hardware relay, tested Joy-Con adapter or common wheel calibration. Local Gamepad selection in readiness is informational; native driving games retain their own axis mapping/calibration. Sensors attached to another computer cannot be accessed from the therapist’s iPad through this dashboard.
7. **Recovery beyond the initiating tab is limited.** A saved active visit can be read from another same-account tab, but edits are blocked there. A new authenticated tab-takeover workflow is not implemented. A guest tab that closes loses its guest visit as intended. An append-only clinical edit audit and separate exercise title/count editor after saving are also not implemented (exercise evaluation/notes are editable).
8. **Testing limits.** Timer expiry/overtime and failed saves were accelerated or simulated in focused tests; actual expiry-tone audibility, lengthy endurance, physical iPad/Safari Bluetooth, physical equipment and real projector calibration were not validated. The browser tests use desktop Chromium with iPad viewport emulation. The two browser suites that share the one Display presence were run serially for final evidence.

## Completion criteria mapping

| Master criteria | Status |
| --- | --- |
| 1–4: homepage, unified readiness, Display/audio, device cards | Implemented; unsupported/unconfigured hardware states explicit. Browser-tested for Display/audio. |
| 5–8: full visit entry, existing/new/guest, quick entry, duration | Implemented and browser-tested. Legacy quick wizard retained. |
| 9–12: persisted timer, overtime, Control alert, bar | Implemented. Reload/pause/extension browser-tested; expiry/overtime accelerated in tests; sound not physically verified. |
| 13–14: switching and linked results | Implemented for shared publication safety and tab-stamped results; native Balloon Quest tested. Universal finalization/older adapters incomplete. |
| 15–19: evaluation, exercises, finish, visit/individual history | Implemented and browser-tested. Guest gameplay metrics and append-only annotation auditing incomplete. |
| 20: simpler clinically relevant analytics | Visit summary implemented; wider standalone analytics refactor/comparable trends incomplete. |
| 21: skill tags | Central typed metadata implemented; descriptive categories, not efficacy claims. |
| 22: calibration | Shared reusable local profile/grid foundation; game consumption and remote synchronization incomplete. |
| 23–25: safe Firebase, shared architecture, no unauthorized deployment | Additive rules locally tested; existing game architecture retained; nothing published. |

## Production release requirements

1. Review the additive rules and immutable claim/index design with the application owner. Explicit authorization is required before publishing rules or deploying code.
2. Merge/review the existing concurrent Castle Legends and Rhythm Steps work independently. This task did not integrate the separate Rhythm Steps branch or claim its completeness. Castle Legends’ existing uncommitted registry/history work was retained; its Production rules support still needs its own review.
3. Publish the reviewed rules only after authorization, then release the application with the existing staff/patient Firebase configuration. There are no destructive migrations. Existing Firebase deployments currently deny the new paths; therapy setup deliberately remains blocked when active-visit recovery cannot be verified. Quick entry and existing individual game workflows remain available.
4. Verify a synthetic saved patient and guest in staging, then run the adapter, long-session and physical hardware validations listed above before claiming full clinical rollout.

## Workspace and files

No unrelated work was committed or reverted. The initial workspace was already substantially dirty and contained important uncommitted integrations. A separate Rhythm Steps worktree exists. Changes were kept additive in this snapshot rather than creating a clean worktree that would omit those dependencies. No merge conflict was encountered; process inspection was sandbox-restricted. Only this conversation’s own preview/emulator processes were started/stopped.

[files-changed.json](files-changed.json) lists this task’s application, rule, test and evidence files. It does not attribute pre-existing unrelated modifications to this task. [AUDIT.md](AUDIT.md) records the pre-implementation integration audit.
