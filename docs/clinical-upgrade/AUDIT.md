# Clinical upgrade source audit — 2026-10-12

Inspected the current working snapshot before edits, on `main` (e6aa5fd). The sole live conversation agent is this task. Git reports a separate Rhythm Steps worktree and extensive pre-existing Castle Legends, sensor, library, history, audio, and release changes. Process inspection is sandbox restricted. No handover PDF or baseline screenshot was attached/found in the workspace. An isolated checkout would omit important uncommitted integrations, so edits here are additive and focused; no reset, stash, commit, push, or deployment.

## Integration points

- Home renders the entire registry again, two Display/audio indicators, saved-patient access and the quick wizard. Canonical library is `/control/activities`.
- Quick wizard currently requires a first name and projection surface. Preserve its route; add direct anonymous library entry from Home without creating patients.
- `PatientSessionProvider` persists minimal patient context in sessionStorage; `AddPatientSheet` uses canonical patient creation/unique number validation. All active staff currently share patient permissions (rules at `patients`/`sessions`).
- `liveSessionPrivate` attaches patient binding for staff; public game state must never receive visit metadata. Control owns a shared lease plus modern per-tab ownership stamp.
- Game engines and save formats differ: several use `sessionId-r{run}`, some use plain IDs. `HistorySaver` retries; history repository confirms persisted records and rules keep records immutable. Guest/walk-in games deliberately do not save patient history.
- `ResetLiveDisplayOnMount` clears even an unfinished modern same-tab game. This reproduces the loss condition at source/test level. Route guards and conservative cleanup must preserve unsaved games. Native game completion controls remain authoritative; do not synthesize game results.
- Existing detailed results include many game-specific counters and notes. Keep revivers/storage and offer visit-level clinical evaluation independently of gameplay stars.
- Display audio reports its own context state; a remote request cannot guarantee browser unlock. Presence currently updates on connection only, so introduce a real Display heartbeat before using freshness.
- Shared sensor provider exposes two hand BLE runtimes, pointer sample timestamps and centered state. No shared foot relay/foot assignment runtime is exposed. Gamepad mappings exist within driving games and are local to that browser. No tested full Joy-Con support.
- Existing projection logic is game-specific. A shared, local calibration profile/grid can be added without changing established game geometry; global consumption is a separate integration.

## Additive design

Staff-only `therapyVisits/{patientId}/{visitId}` contains immutable identity, revisioned timing state, clinical evaluation/exercises, and immutable references to confirmed `/sessions` records. Auth UID owns writes; therapist display name is presentation only. Browser tab identifies the active visit writer. No guest database path; guest visits remain in this tab's sessionStorage and disappear on tab closure. Firebase acknowledgement is required before claiming patient writes saved. Existing production rules deny the new path until reviewed rules are explicitly published.

Timing uses epoch start, accumulated pause duration, pause instant and end instant; intervals only repaint. Overtime never sends a game or Display command. A break is allowed only after the native game is paused/finished; resume never automatically resumes a game. New game navigation is guarded until native finish and confirmed history, with recovery back to the canonical game. No independent game architecture.
