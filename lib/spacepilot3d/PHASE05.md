# Phase 05 — Control/Display integration

Status: **COMPLETE** — software gate passed; physical hardware remains untested.

## Architecture

The therapist's experimental Control owns one instance of the existing
`GameplaySimulation`, under a browser Web Lock scoped to its room. Its RAF
scheduler supplies final normalized input and monotonic elapsed time. The
simulation alone resolves collisions, accepts outcomes, awards points, advances
missions and unlocks tiers. Display neither predicts outcomes nor runs another
gameplay simulation. It copies accepted presentation frames into the existing
Three.js scene and plays each newly accepted feedback event once.

The Control route is `/control/space-pilot-3d-prototype`. It inherits the existing
staff gate and shared sensor provider. The Display link is generated as
`/display/space-pilot-3d-prototype#room=<room-id>`. Both routes are development-only,
render Next.js not-found responses in production and are absent from the production game registry. Display returns HTTP 404. Control streams HTTP 200 with `NEXT_HTTP_ERROR_FALLBACK;404` and not-found content under its inherited layout; no experimental Control component or controls are included. The existing layout/auth behavior was preserved.

The single targeted shared-layout change wraps `SensorPointerDisplaySync` in
`PrototypeLocalOnlyBoundary`: the existing Firebase pointer publisher is omitted
only for experimental Control. The local pointer publisher, sensor runtime,
calibration, existing auth gate and every other route retain their existing path.

## Contract and authority

`ExperimentalSessionState` version 1 carries room, owner, session, run and mission
IDs; session revision; monotonic accepted-event sequence; input epoch; lifecycle;
difficulty; input mode; accepted outcomes; statistics; summary; selected Display;
subscriber IDs; and sensor status. Each accepted outcome includes its session/run/
mission/object identities, sequence, simulation time and visual contact position.
Event sequence never rewinds within a session, including when a run restarts.

The separate `shumos-experimental-space-pilot-3d-v1:<room>` channel carries:

- `state`: durable revision and accepted outcomes, on meaningful changes.
- `frame`: ephemeral ship/object poses and simulation time, at most 30 Hz normally.
- `input`: active Display keyboard samples with sequence, input epoch and echoed
  Control frame ID; never a claimed collision or score.
- `probe`/`sync`: fresh nonce exchange, at most 10 Hz per Display. Sync carries a
  complete state/frame for recovery without command or effect replay.
- `ack`: rendered-frame acknowledgment, readiness, visibility and a monotonic
  sequence. Only locally-issued recent frame IDs are accepted by Control.
- `leave`/`closed`: best-effort immediate lifecycle notifications, backed by expiry.

Display is read-only for lifecycle actions. Start, Pause, Resume, Restart, End,
mission launch, difficulty and input selection are direct Control commands guarded
by current revision and run. Incoming outcome/action claims cannot award anything.
Display validates state, run, owner, revision, frame sequence and accepted-event
identities. Duplicate/out-of-order packets cannot rewind it or replay effects.
A new owner invalidates outstanding old-owner handshakes.

## Input and timing

RIGHT_HAND uses the exact existing `RightHandFlightInput` and pointer subscription
in Control. There is no BLE driver change, new filter or calibration. Display shows
the accepted ship pose and the raw alignment pointer carried in accepted frames.
Keyboard uses the existing keyboard adapter in the selected Display. It forwards
normalized samples and clears held keys on blur. Additional Displays cannot steer.

There is no dependency on synchronized window clocks for session messages.
Control validates echoed frame IDs against its own send times; Display validates
nonce round trips against its own send times. The inherited sensor protocol's
`sentAtMs` checks remain unchanged; a wall-clock disruption causes loss/pickup and
suspension rather than simulation catch-up.

The freshness budget is 250 ms. On input loss, lack of active rendered Display,
hidden Control, renderer failure, reverse monotonic time or a longer scheduler
gap, Control suspends before further stepping. Display freezes if its fresh
round-trip lease expires. Resume requires explicit therapist action, a fresh
Display acknowledgment and sensor alignment when selected. There is a bounded
initial keyboard-packet grace period during which gameplay time stays frozen.

Input mode changes and Restart pause the run and invalidate buffered input.
Collision sweep history is invalidated across pickup and lifecycle boundaries.
Display applies canonical positions directly, with no speculative scoring or
additional hand smoothing. Communication latency is therefore visible as the
bounded transport delay; performance is not claimed to equal a zero-hop render.

## Recovery and persistence

Display reload creates a new subscriber, requests a fresh snapshot and suppresses
historical feedback. A lost primary Display suspends the game; a fresh replacement
can become primary while stopped. Multiple viewers share the same authority.
Changing the selected Display requires a stopped session.

Control owns a tab-local room ID and a versioned `sessionStorage` checkpoint.
Checkpoints are written on state changes, not each frame. They contain no patient
identity. Reloading Control creates new owner/session identities and a ready game;
the prior checkpoint is shown as an interrupted or completed summary. It is never
rehydrated as an active simulation. Storage failure leaves an explicit UI notice.
Only the latest run checkpoint is retained; this is not a clinical history system.
Ended sessions reject all commands and cannot continue scoring.

## Verification

- Full Vitest: **103 suites / 1,333 tests passed**. Includes 26 new session/runtime tests and all existing production tests.
- TypeScript, lint and production build passed. The sandboxed Turbopack attempt stalled and was stopped; the same build passed with normal local subprocess access. Both built routes were checked directly: Display HTTP 404; Control streamed not-found content (HTTP 200), with no experimental controls.
- Native Chrome, real separate windows: complete HIGH difficulty sensor-simulated run, three missions, 11 stars, 1,100 points, two deliberate impacts, tier 3; Control and Display matched throughout.
- Actual browser checks passed: keyboard motion, pause/resume, restart, End summary, old-run replay, duplicate deliveries, Display reload after collection, Control reload with prior summary, foreground/unfocused visible Control, inbound and outbound link loss, scheduler stall, minimize/restore of both windows, secondary Display unable to steer, subscriber close, Control close, and channel cleanup. No page errors or Firebase network requests in the recovery run.
- Exclusive ownership: duplicate room in a second Control waits behind one Web Lock; closing first transfers ownership; five rapid reloads under development StrictMode leave exactly one held lock and no queued owner.
- Configured staff authentication still shows the existing signed-out gate. Browser gameplay used the existing local demo behavior via a process-only empty Firebase API key; no auth source or `.env.local` edits.
- Chrome's CDP freeze command alone did not reliably suppress communication in this environment. The recovery test combines it with explicit outbound message loss; this proves link-loss handling, **not independent proof of OS freezing**. Actual minimize/restore was tested separately.
- Physical WT901/projector validation has not been performed.

### Bugs diagnosed and fixed

1. React development cleanup/remount raced `ifAvailable` Web Lock acquisition. A cancellable queued request now waits for prior cleanup; disposed requests cannot create a runtime.
2. Acknowledgments used `performance.now()` at receipt while Control and Display lease checks used RAF's earlier frame-start timestamp. Trace captured an ACK at 8775.300000004 ms followed by RAF timestamp 8775.3 ms: a false reverse-clock expiry. Both loops now sample callback-entry `performance.now()`; regression test exercises this ordering. True reverse-time and 250 ms expiry checks remain intact.
3. Display originally advertised readiness before its first render. Readiness/heartbeat now follows a completed render, so shader startup does not enable Start prematurely.
4. ACK sequence, input epoch and recent locally-issued frame checks prevent delayed readiness from restoring an invalid Display. New-owner snapshots invalidate pending old-owner handshakes.
5. Initial keyboard pickup now has a bounded 250 ms hold with no simulated time advance; missing input then suspends.

### Evidence

- `screenshots/phase05-display.png`: actual tier-3 mission scene, deliberately paused for capture.
- `screenshots/phase05-control.png`: matching Control state.
- `screenshots/phase05-summary.png`: final summary.
- `validation/phase05-browser.mjs`: repeatable full browser workflow (requires local Playwright/Chrome paths).
- `validation/phase05-ownership.mjs`: browser ownership/reload checks.
- `validation/phase05-tests.txt`: full test output.

The earlier SwiftShader browser run safely suspended and did not pass. Native GPU execution passed the full session after clock/readiness fixes; no timeout or safety budget was relaxed. This phase makes no renderer performance claim.

## Proposed eventual production integration — not applied

Production rules, schemas, registry and patient history were not changed. A future
approved cloud integration should use separate versioned paths, for example:

```text
/experimental/spacePilot3d/v1/leases/{roomId}
  ownerUid, ownerId, sessionId, leaseRevision, expiresAt
/experimental/spacePilot3d/v1/sessions/{sessionId}
  version, ownerUid, ownerId, runId, revision, eventSequence, lifecycle,
  difficulty, inputMode, missionId, stats, outcomes, summary
/experimental/spacePilot3d/v1/display/{roomId}
  sanitized accepted session projection (no patient/staff data)
/experimental/spacePilot3d/v1/results/{sessionId}/{runId}
  immutable final summary, accepted event watermark, completion reason
```

Rules would require active staff for ownership and session writes, match the
authenticated UID to `ownerUid`, validate the lease and increasing revision/run/
event sequence, and reject further result mutation after finalization. Display
would use the existing separate anonymous Display identity with read access only
to an explicitly paired sanitized projection. Final results should use a
transaction/idempotency key of `(sessionId, runId)` and server-validated completion.
Continuous transforms and hand samples should remain on the local path.

Migration proposal: introduce default-deny versioned paths behind an opt-in flag;
add emulator tests for staff revocation, ownership races, duplicate finalization,
cross-session reads and anonymous write denial; verify old production clients
continue using their unchanged schema; then approve a separate registry/history
adapter. No migration/backfill of existing sessions is required. Patient-history
linking needs separate approved consent/access and schema decisions. Local Web
Locks/BroadcastChannel alone cannot establish authority across different devices.

## Phase 06 preparation — historical handoff

Keep the authoritative simulation and contract stable while replacing placeholder
assets. Specify model axes (-Z forward, +Y up), unit scale, origin, engine/wing
attachment points, three visual tiers, material/texture budgets and explicit proxy
colliders. Validate new models against the existing capsule dimensions, collection
tolerance and route tests. Retain pooling and context-loss disposal checks. Plan
physical RIGHT_HAND, projector and target-machine testing before claiming latency
or background-rendering performance. This was the Phase 05 handoff plan; the subsequent completed implementation and reference comparison are recorded in `docs/spacepilot3d/PHASE_06_REPORT.md`.
