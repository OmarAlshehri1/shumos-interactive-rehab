# Space Pilot 3D — local release candidate

Date: 2026-10-09. This report covers the user's additional authorization to finish R3 and prepare a local library replacement. No deployment, push, live Firebase rule change, patient-history migration or hardware-validation claim is authorized or performed.

## Implementation and integration

The R3 implementation retains Aurora, the R2 world-flight corridor and chase camera. Golden rings use swept oriented-plane passage with the existing spacecraft capsule dimensions. EASY, MEDIUM assisted altitude and ADVANCED are independent of difficulty. Three missions, ring scoring, configurable cosmetic upgrades, fiery hazards, Arabic instruction cards and explicit session recovery are implemented. Details are in [PHASE_R3_REPORT.md](PHASE_R3_REPORT.md).

The existing `space-pilot` game ID and `/control/space-pilot` library address remain. In development, the address now renders the new local Control, whose child-screen link opens `/display/space-pilot#room=…`. The normal staff gate still wraps Control. The library describes the ring game and states that its local results are not saved to patient history. Its thumbnail identifies the new ring activity.

The previous Control implementation remains available at `/control/space-pilot-legacy`. This task does not change the standard `/display` route or existing Firebase game dispatcher, including their interpretation of historical/live `space-pilot` star sessions. A 3D child screen must be opened from its Control so that it receives the correct local room; it uses the same browser/origin, not a cross-device Firebase connection.

`NEXT_PUBLIC_SPACE_PILOT_3D_ENABLED` is a build-time selector:

- Unset: development uses 3D; production uses legacy.
- `false`: canonical navigation uses legacy, including in development.
- `true`: explicitly opts a build into 3D after release approval.

The existing `*-3d-prototype` routes stay development-only. No environment file was changed to enable release. The selector changes only the Space Pilot library metadata, thumbnail, canonical Control choice, dedicated Display availability and local cloud-pointer exclusion. Other games retain their routes and behavior.

## Firebase, history and input compatibility

Inspection found that legacy Space Pilot uses the shared live-session repository, staff realtime controller adapter, legacy serialization, and `buildStoredSpacePilotSession`/`saveSessionHistoryOnce`. Its history records contain star-specific fields such as `totalStarsCollected` and `collectionRate`; they are not ring records.

The 3D release candidate therefore retains its separate version-4 local channel/checkpoint and Control-owned simulation. It makes no gameplay/history Firebase writes and does not invoke the legacy history builder. The canonical 3D Control also excludes the existing cloud pointer publisher, while preserving the same local RIGHT_HAND publisher and sensor runtime. Rollback/other-game routes retain their original cloud publishing behavior.

Actual legacy star results are round-tripped through the existing reviver and history builder in regression tests; their counts remain star counts, without ring fields. Old session messages/checkpoints do not become ring sessions. No patient history is migrated or overwritten. Resuming an old patient session in 3D is not supported; use the preserved legacy route for that workflow. Selected patient context does not cause a local ring summary to be saved as a clinical record.

No Firebase rule, schema or shared synchronization change is needed for this local release scope. Future cross-device synchronization or persistent ring history would require a separately reviewed implementation discriminator/schema, serializers, repository adapters, access tests and migration policy. Those changes have not been applied.

## Validation status

R3 software validation passed. Full regression: **114 test files / 1,523 tests passed** (`validation/rc-tests.txt`), including existing games and authorization coverage. Standalone TypeScript passed; both production builds also completed TypeScript successfully. Lint exited successfully with zero errors and eight unused-variable warnings in unrelated Balloon Quest validation scripts; see `validation/rc-lint.txt`. No Space Pilot lint warning was reported.

Both default and explicitly enabled production builds passed (`validation/rc-build-default.txt`, `validation/rc-build-enabled.txt`). Local HTTP checks confirmed legacy is the production default, opt-in exposes the canonical 3D pair, rollback remains available in both, and prototype routes remain unavailable (`validation/rc-production-{default,enabled}.json`). An initial build failed while concurrent Balloon Quest work widened a shared Display difficulty type. The shared correction was already present on reinspection; this task did not edit that code. The subsequent builds passed.

Browser automation completed all three missions in all nine combinations, with matching Control/Display summaries, all rings collected and all hazards avoided. This demonstrates reachable deterministic routes with scripted guidance, not a guarantee that an untrained child will achieve perfect scores. HIGH browser runs selected full guidance; default guidance and geometry are covered by unit tests. Keyboard movement, centering, pause/restart, simulated RIGHT_HAND input, input loss and explicit recovery, instructions, settings locking, scoring and upgrades were exercised. Browser graphics checks verified reduced effects, reload/remount, model-load failure/recovery and WebGL context-loss/recovery. No page errors or gameplay Firebase requests were observed in these local runs.

The integrated run entered through the actual library, opened canonical Control/Display, completed ADVANCED/HIGH and followed the legacy rollback link. Gameplay runs used the existing Firebase-unconfigured local demo environment; no authentication implementation was changed or faked. A separate normal-configured browser check verifies signed-out access remains behind the existing staff gate. An activated staff-account end-to-end run remains pending; no real credentials were entered.

| Mode | Difficulty | Missions | Rings | Avoided hazards | Contacts | Points |
|---|---|---:|---:|---:|---:|---:|
| EASY | LOW | 3 | 15/15 | 3 | 0 | 1500 |
| EASY | MEDIUM | 3 | 13/13 | 5 | 0 | 1300 |
| EASY | HIGH | 3 | 11/11 | 7 | 0 | 1100 |
| MEDIUM | LOW | 3 | 15/15 | 3 | 0 | 1500 |
| MEDIUM | MEDIUM | 3 | 13/13 | 5 | 0 | 1300 |
| MEDIUM | HIGH | 3 | 11/11 | 7 | 0 | 1100 |
| ADVANCED | LOW | 3 | 15/15 | 3 | 0 | 1500 |
| ADVANCED | MEDIUM | 3 | 13/13 | 5 | 0 | 1300 |
| ADVANCED | HIGH | 3 | 11/11 | 7 | 0 | 1100 |

### Integrated performance

Actual separate Chrome windows on Apple M1/Metal, viewport 1376×768, device pixel ratio 2. Browser background exemptions were disabled and focus verified. Each settled sample covers 240 frames after warm-up; these are short local measurements, not an endurance or target-projector benchmark.

| Graphics | Focused window | FPS | Mean ms | p95 ms | Max ms |
|---|---|---:|---:|---:|---:|
| low | Display (Control unfocused) | 60.00 | 16.67 | 17.10 | 17.70 |
| low | Control (Display unfocused) | 60.00 | 16.67 | 17.60 | 17.80 |
| medium | Display (Control unfocused) | 60.00 | 16.67 | 17.60 | 17.80 |
| medium | Control (Display unfocused) | 60.00 | 16.67 | 17.60 | 17.90 |
| high | Display (Control unfocused) | 60.00 | 16.67 | 17.60 | 18.90 |
| high | Control (Display unfocused) | 60.00 | 16.67 | 17.50 | 17.90 |

No safety interruption occurred in the six settled samples. Input-channel receipt latency: mean 0.80 ms, p95 1.50 ms, maximum 46.20 ms; presentation-channel receipt: mean 1.60 ms, p95 2.70 ms, maximum 134 ms. These are synthetic local transport timings, not physical sensor-to-photon latency. Remount warm-up samples were slower (approximately 55–56 FPS, worst frame 167.7 ms); they are retained in the raw report rather than hidden in settled averages. See [performance evidence](validation/r3-performance.json).


## Actual visual evidence

All captures show actual real-time Three.js gameplay; no generated image substitutes for a scene. Representative evidence:

- [Arabic instructions](screenshots/r3-instructions.png)
- [Neutral flight and camera composition](screenshots/r3-flight-neutral.png)
- [Open ring before collection](screenshots/r3-flight-opening.png)
- [Ring passage](screenshots/r3-flight-passage.png)
- [Tier 2](screenshots/r3-flight-tier2.png) and [tier 3](screenshots/r3-flight-tier3.png)
- [Fiery asteroid avoidance](screenshots/r3-flight-fiery-avoidance.png)
- [Actual gameplay recording, 45 seconds, MP4](videos/r3-flight.mp4) and [original WebM](videos/r3-flight.webm)

The recording includes ring approach/passage, upgrades and fiery avoidance, with six rings collected and no contact. Nine final-summary captures are named `screenshots/r3-{easy,medium,advanced}-{low,medium,high}-summary.png`. Exact capture and validation paths are listed in [ARTIFACT_MANIFEST.md](ARTIFACT_MANIFEST.md).

Compared with the supplied reference: Aurora provides a detailed licensed spacecraft and readable blue engines, with a closer moving chase camera and actual depth travel. Open gold rings are intentionally larger and easier to read than the reference's collectible star. Irregular asteroids and orange fiery variants remain recognizable, with separate approach planes and clear guided avoidance. Tier attachments and engine details visibly change. Background stars remain visible without competing with targets. Planet/rock surfaces, atmospheric lighting and exhaust remain more procedural and less cinematic than the reference; textured rock assets, richer restrained engine trails and a further material/lighting pass would close that gap, subject to target-machine performance and accessibility review. Enjoyment, comfort and unaided comprehension require supervised child/therapist review; automated perfect routes do not establish those outcomes.


## Rollback

For one session, stop/end the 3D session, close its child window, and use **النسخة السابقة** in Control or open `/control/space-pilot-legacy`. Open the legacy child Display using its original workflow. Existing legacy engine, components, runtime, serialization and history implementation remain present.

For a whole build, set `NEXT_PUBLIC_SPACE_PILOT_3D_ENABLED=false` and rebuild/restart. A public Next.js environment variable is compiled into the build; changing it only on an already-built server does not reliably switch client behavior. Close stale v4 windows. Do not clear or migrate Firebase history or overwrite the prior deployment when testing rollback locally.

## Approval and publication steps

1. Review the screenshots/video, local library behavior, rollback and local-only history limitation. Complete supervised physical WT901, projector and target-machine validation; do not assume browser simulation proves them.
2. Obtain explicit approval for a local-only release, or separately approve and implement the missing persistence/cross-device integration if required operationally.
3. After release approval, configure `NEXT_PUBLIC_SPACE_PILOT_3D_ENABLED=true` for the intended deployment environment. Preserve the project's existing Firebase credentials, staff authorization and rules. No security relaxation is needed.
4. From the project root run `npm test`, `npx tsc --noEmit`, `npm run lint`, then `NEXT_PUBLIC_SPACE_PILOT_3D_ENABLED=true npm run build`. Review the resulting preview using an existing activated staff account, including permission denial and sign-out behavior.
5. In the intended existing Vercel project, set the flag for the approved deployment environment, publish the reviewed local changes through the separately approved source-control workflow, then build that exact revision (redeploying an older revision will not include these uncommitted changes) with the normal Next.js build (`npm run build`), verify its preview with an activated staff account, then promote it only after explicit production deployment authorization. This checkout has no local `.vercel` project link, so the target project must be selected/verified at that step rather than guessed. Retain the prior deployment and the `false` build as rollback options. Verify normal library navigation, both windows, session safety and no unintended gameplay/history writes after release.

These are instructions for a later authorized release; no remote deployment, push or live setting change has been made here.

## Limitations and remaining physical work

The release candidate is a local same-browser session, not a replacement for the legacy Firebase history workflow. Staff authentication is preserved. Signed-out browser denial and the existing authorization tests are checked; an end-to-end run under an activated real account requires the user's existing authenticated session. Physical sensor response, projector legibility, child comfort/understanding, clinical benefit, target Windows behavior and long-duration thermal performance remain unverified. See [PHYSICAL_VALIDATION_CHECKLIST.md](PHYSICAL_VALIDATION_CHECKLIST.md).

## File inventory and preservation audit

[rc-change-manifest.json](validation/rc-change-manifest.json) lists every new/modified Space Pilot file with SHA256 hashes, comparing against the 918-file pre-R3 baseline rather than HEAD. It separately lists concurrent shared-workspace changes; those are not attributed to this task. Protected sensor/calibration/filtering/auth/rules and legacy-engine files were compared against the baseline. Existing uncommitted work was preserved; no reset, commit, push or deployment occurred.

Concurrent Balloon Quest work modified shared Display/controller/realtime/history/analytics files and added its own routes/components/tests/docs during this task. Consequently the whole shared tree cannot be described as untouched outside Space Pilot. This task did not edit those files or begin that game. The exact externally changed paths and hashes are retained in the manifest. The full regression suite includes the concurrently present work; builds additionally validate its shared type correction.


**SPACE PILOT 3D LOCAL RELEASE CANDIDATE READY — Awaiting physical validation and deployment approval.**
