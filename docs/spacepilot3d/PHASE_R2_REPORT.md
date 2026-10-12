# Phase R2 — guided corridor, objective assistance and Aurora graphics

Date: 2026-10-09. Experimental Space Pilot 3D only. Physical WT901/projector validation and user visual acceptance remain pending; R3 has not started.

## Implemented experience

Reviewed the actual R1 recording (`videos/r1-flight.mp4`) and the supplied spacecraft reference. R1 had real world travel, but allowed long excursions from objectives, offered little recovery guidance, used a visibly stylized hull, and had flat-looking planets. R2 retains that simulation and authority architecture, adding a guided mission corridor and an original detailed spacecraft asset.

The ship still moves continuously through fixed world encounters. Camera motion, parallax, collisions, scoring, missions and sensor control are live 3D gameplay. None of the screenshots or videos is generated artwork, a static background masquerading as gameplay, or a renderer-only demonstration.

## Navigation model

Coordinates remain +X right, +Y up, -Z forward, with fixed 1/120-second physical steps. Heading and world-space displacement are separate constraints:

- Horizontal target heading is bounded to a therapist-selected 20–60° per side relative to the selected course; the absolute maximum is a **120° total envelope**.
- Corridor half-width is independently configurable from 32–64 world units; vertical limits are 12–28 units. These are prototype world distances, not clinical measurement units.
- The course can be straight or a gentle deterministic curve: center X = `12*sin((-Z)*2π/1600)`, with its tangent defining the intended heading. Course choice is explicit in Control. Neutral follows that selected course while preserving lateral displacement; it never steers toward a collectible.
- Outward movement enters a soft boundary zone. The remaining clearance decays analytically with travel rather than clipping the ship to a wall. The integration cannot cross the boundary, and inward steering retains full available response. There is no bounce, penalty, camera shake or teleport at an edge.
- Near a boundary the rendered ship orientation reflects effective motion, so the camera does not keep looking outward while the ship is progressing safely forward. Heading cannot accumulate endlessly from a held hand tilt.

The existing normalized RIGHT_HAND pointer remains the input. Axis mapping is instantaneous: horizontal `2*(x-.5)`, vertical `2*(.5-y)`; magnitude ≤0.06 maps to neutral, otherwise the remainder is rescaled over 0.94, multiplied by game sensitivity and bounded. Horizontal output multiplies the selected heading range, vertical output multiplies 0.3 radians. Physical turn-rate limits constrain the craft; there is no additional temporal sensor filter. Pitch rate is 70% of yaw rate. The raw accepted normalized coordinates remain available immediately for pickup/recovery.

Keyboard arrows/WASD and RIGHT_HAND use the same flight model; C returns keyboard steering to neutral. No new BLE connection, calibration, filter, automatic centering, role assignment or pointer transport was introduced.

## Therapist settings

Arabic Control exposes descriptive choices for steering range, corridor width, vertical range, sensitivity, turning speed, encounter spacing, course, objective guidance and reduced camera motion. Choices use labels such as gentle, balanced and wide rather than raw simulation units. Heading's widest choice explicitly explains 60° per side. Settings lock outside Ready and throughout countdown; difficulty restores safe preset defaults.

| Preset | Heading each side | Corridor half-width / height | Yaw rate | Interval | Base speed |
|---|---:|---:|---:|---:|---:|
| LOW | 35° | 32 / 12 | 30°/s | 5 s | 22.5 units/s |
| MEDIUM | 45° | 40 / 16 | 45°/s | 5 s | 30 units/s |
| HIGH | 60° | 48 / 20 | 60°/s | 4 s | 40 units/s |

Sensitivity remains adjustable 0.5–2×; turning speed 15–75°/s; interval 4–10 seconds. Reduced effects remain separate from camera reduction. No setting changes the underlying WT901 calibration. Slower optional intervals remain available when a therapist wants more time.

## Optional objective guidance

The child sees one restrained marker for the next relevant encounter. Star guidance marks a collectible; full guidance also suggests a clearance route above or below an asteroid, on the available side nearest the ship. A small edge chevron indicates a target outside the comfortable view. The marker stays below the HUD and above the spacecraft, with its label below the target. Avoidance cues exclude the projected asteroid silhouette plus the marker/label footprint; a displaced chevron still points toward the actual clearance route and explicitly says to pass above or below. If a close hazard fills the entire comfortable marker area, the cue hides instead of covering it. It disappears when disabled or gameplay stops.

Guidance is computed only from accepted poses/objects. It never modifies input, spacecraft position, object placement, collision outcomes or scores. Star-only and completely disabled modes are available. A player can still choose another route or miss a target; this is assistance, not autopilot.

## Encounter placement and pacing

The three themes and six encounters per mission remain. Stars and hazards occupy varied X/Y positions in the corridor; their world positions stay fixed after mission creation. First approach remains at least 90 units or four seconds of travel. Objects become visible within 260 units, with no sudden near-player spawning. At most six encounter slots exist, and the normal view contains only the upcoming subset.

Spread accounts for heading, sensitivity, turning budget, spacing and corridor size. Default intervals are shorter than R1's 7/6/5 seconds, reducing empty travel while preserving open avoidance routes. Asteroids are separated in depth; the layout never creates a blocking wall.

An added edge-case test exposed unreachable first stars when a player finished the preceding mission at a wide corridor edge with a small steering range. The fix anchors the next region near the actual arrival offset, then gradually offers objectives toward the configured course. This changes **placement**, never automatic ship steering. Both edge cases now collect all 11 stars and avoid all seven hazards with 20° range, 0.5× sensitivity and slow turning.

Collision proxies remain the existing compound hull/wing/pod capsules, swept through world translation and orientation. No collision proxy or scoring tolerance was replaced to make a screenshot look successful. Proxy contact is geometric and continuous; it is not exact triangle-mesh collision. Exactly-once outcomes, 100 points/star, cosmetic upgrades at three/seven stars, non-punitive collisions, mission transitions and summaries remain.

## Camera and game feel

The R1 chase rig now sits nine units behind, 5.7 above and 1.4 to the side, looking 20 units ahead with a framing offset. The closer, higher view shows the canopy and panels while keeping the craft near the lower center. Camera heading follows actual effective travel direction and stays within the selected course envelope. World-up stays fixed; bank never rolls the camera. No shake, motion blur or zoom effects were added.

Normal follow retains a 50° FOV and independent 0.16-second visual damping. Reduced motion uses 54°, 0.45-second damping and 35% pitch response. Control can require reduced camera motion before a run; Display retains its separate comfort option. Pause freezes follow progression. Sensor response is independent of all camera damping.

The scene retains cyan exhaust, pooled collection/impact effects, visible upgrade tiers and Arabic feedback. Avoided obstacles now receive a gentle safe-passage message. No background music, audio dependency or frightening effects were added.

## Graphics, assets and licenses

**Aurora replaces Bob in the active renderer.** It is an original project-authored GLB: 12,548 triangles, six merged material meshes, 908,760 bytes. Source is reproducible at `assets/create-aurora.mjs`; the shipped model is `public/spacepilot3d/models/aurora.glb`. Its shaped chamfered fuselage, swept beveled wings, service panels, smoked clear-coated canopy, engine profiles, cooling grids, seams, fasteners and luminous inlays are actual mesh geometry. PBR materials distinguish ceramic alloy, anodized titanium, graphite, steel, canopy glass and lights. Engine cores and existing tier attachments remain separate runtime effects.

Asset research checked a simple CC0 pack and a more detailed CC0 model requiring a logged-in download. Neither was imported. Creating Aurora provided a clear geometry improvement without reusing the low-detail hull or importing unverified texture dependencies. The original asset has no additional third-party asset license requirement; Three.js authoring/runtime tools use the existing MIT dependency. Full provenance and source links are in [ASSET_LICENSES.md](ASSET_LICENSES.md). Bob and historical evidence remain preserved.

Environment improvements include layered terrain/ocean/cloud/ice shading with a restrained day/night transition; a banded gas giant; rough moon material; seamless procedural navy/purple nebula; fixed layered stars/dust; and the existing world landmarks. Planets and decorative formations stay outside the playable corridor. Rocky hazards have irregular, cratered geometry and multiscale surface variation; fiery cracks and bounded flame pools remain distinct. Gold stars use a more metallic finish and bevel detail with restrained glow. No external texture downloads or heavy volumetric effects were added.

Resource counts are bounded: six encounters, 72 instanced decorative rocks, existing particle pools and shared geometry/materials. The loader still gates readiness, compiles materials, aborts pending loads and disposes loaded/model/environment resources. Quality presets and adaptive resolution remain active.

## Authority, safety and protection

Control remains the only simulation/scoring authority. Display renders accepted state and presentation-only guidance. The expanded navigation contract is safely versioned to **v3**, including channel and local checkpoint keys. Close older prototype windows and reopen the pair; v1/v2 state cannot silently continue an R2 run.

Owner/session/run/revision/input-epoch guards, primary-Display selection, exactly-once events, the existing 250 ms input/acknowledgment/scheduling protections, explicit recovery, one Control RAF and one Display animation loop remain. Pickup compares held normalized steering, not world position. No per-frame React state or Firebase gameplay writes were introduced.

The inherited pointer protocol still lacks publisher/recenter epochs; its existing jump heuristic is not perfect recenter detection. Continue using Re-engage before the existing recenter control and one active sensor publisher. Physical responsiveness has not been inferred from browser message timing.

## Validation results

The full Vitest suite passed: **107 files, 1,388 tests**. TypeScript `--noEmit`, ESLint and the production build passed. Logs are in `validation/r2-tests.txt`, `r2-typecheck.txt`, `r2-lint.txt` and `r2-build.txt`.

New focused tests cover heading limits, both boundaries at slow/fast turn rates, vertical travel, inward recovery, neutral straight/curved course behavior, camera limits, optional guidance, projected hazard exclusion, reachability at minimal steering settings, edge arrivals and deterministic 30/60/120/144 Hz trajectories. Existing collision, input, session, lifecycle and graphics tests remain in place; v1/v2 snapshots are rejected after the v3 change.

Actual browser validation used separate Control and Display OS windows. HIGH, MEDIUM and LOW each completed all three missions with 11 stars / 1,100 points / 18 outcomes, tier 3 and two deliberately exercised collisions. The simulation reachability tests separately complete all stars with zero collisions. Browser runs verified pause/resume, restart, mission transitions, locked therapist settings, keyboard centering, simulated RIGHT_HAND pickup/dropout/recenter-like jumps and explicit recovery, reloads, stale/duplicate state rejection, countdown cancellation, secondary Display ownership, minimized/frozen windows and Control closure. No page/shader errors or experimental Firebase gameplay requests were observed.

The guided-flight recording holds both steering extremes in a narrow corridor, checks the 60° heading bound, and deliberately returns from a rightward excursion to collect the next target. It also verifies guidance off, curved course, and Control-required reduced camera motion. Fixed landmark world coordinates and changing screen projections verify actual travel/parallax. Model-load failure and WebGL context-loss recovery passed, and three remounts retained 23 geometries, three textures and 16 programs.

Production HTTP validation confirms Display returns 404 and Control produces Next's streamed not-found response (HTTP 200 shell); neither includes experimental components or session actions. The restored normally configured development server shows the existing staff sign-in gate with no experimental actions while signed out. No credentials were entered and no hydration warning was observed. Evidence: `validation/r2-production.json` and `r2-auth-gate.json`.

### Integrated performance

Measured on Apple M1 / ANGLE Metal, Chrome 155, 1376×768 viewport, device DPR 2. Both windows were open and their actual focus flags were asserted, with browser background exemptions disabled. Each sample summarizes 240 frames after a 6.5-second settling period; these are short integrated measurements, not endurance results.

| Quality | Focused window | FPS | p95 / max frame time (ms) | Render DPR | Draw calls / triangles |
|---|---|---:|---:|---:|---:|
| Low | Display; Control unfocused | 59.98 | 17.6 / 18.2 | 0.8 | 32 / 81,502 |
| Low | Control; Display unfocused | 59.99 | 17.2 / 17.7 | 0.8 | 31 / 76,510 |
| Medium | Display; Control unfocused | 59.99 | 17.4 / 18.3 | 1.25 | 42 / 84,494 |
| Medium | Control; Display unfocused | 60.00 | 17.4 / 17.8 | 1.25 | 40 / 76,526 |
| High | Display; Control unfocused | 60.00 | 17.4 / 17.9 | 1.75 | 42 / 84,494 |
| High | Control; Display unfocused | 59.98 | 17.5 / 17.8 | 1.75 | 40 / 76,526 |

No safety interruptions occurred during these samples. Frame-message transport: 1,164 samples, mean 1.89 ms, p95 2.90 ms, max 107.90 ms. Keyboard input-message transport: 937 samples, mean 0.72 ms, p95 1.10 ms, max 11.20 ms. These measure browser transport, **not physical WT901 latency**. Reload warm-up samples include 69–74 ms maximum frames and approximately 57 FPS, separate from settled gameplay. Full data: [r2-performance.json](validation/r2-performance.json).

R1 measured approximately 60 FPS with p95 17.1–17.5 ms, 47,506–51,628 triangles and 34–46 draw calls. R2 raises peak sampled geometry by roughly 64%, with 31–42 draw calls and no material settled FPS regression on this machine; the largest p95 increase is about 0.5 ms. Windows/projector performance and longer thermal/endurance behavior are unverified. The final DOM-only avoidance-marker clearance correction was validated by the full automated suite and a repeated actual flight recording; the performance samples above precede that correction.

### Visual/gameplay review

Reviewed the actual centered-flight, collection, avoidance, boundary and upgrade captures against R1 and the reference. The new hull shows its canopy, vents, panel surfaces and engine housings more clearly; blue exhaust remains visible against the darker sky. Gold five-point silhouettes remain identifiable at approach distance. Rocks approach in depth with open vertical/lateral routes, and missions complete using keyboard or simulated hand input without virtual directional buttons. Tier attachments remain visibly distinct. The chase camera deliberately emphasizes the forward route; it is less oblique and less cinematic than the reference. Planets, rocks and exhaust still need artist-level surface/lighting work to approach that image.

The last screenshot review found a clamped avoidance cue overlapping a distant asteroid. The final correction reserves the projected hazard and label footprint, moves the cue outside it, and uses explicit above/below text. Collection/avoidance and the recording were repeated after this fix. These developer reviews establish readable mechanics; supervised child/teen comprehension and enjoyment still require observation.

## Screenshots and recordings

Actual paired-window captures are under `screenshots/`. Start with [centered flight](screenshots/r2-flight-neutral.png), [asteroid avoidance](screenshots/r2-flight-avoidance.png), [right boundary](screenshots/r2-right-boundary.png) and [recovery collection](screenshots/r2-guided-recovery-collection.png):

- `r2-flight-neutral.png`: centered forward flight, Aurora and environment.
- `r2-left-boundary.png`, `r2-right-boundary.png`: restrained motion near both corridor edges.
- `r2-objective-guidance.png`, `r2-guided-recovery-collection.png`: objective guidance and collection after returning from an excursion.
- `r2-flight-collection.png`, `r2-flight-intentional-collection.png`, `r2-flight-avoidance.png`.
- `r2-flight-left.png`, `r2-flight-right.png`, `r2-flight-climbing.png`, `r2-flight-descending.png`.
- `r2-curved-course-reduced-motion.png`, `r2-control-setup.png`, `r2-tier2.png`, `r2-tier3.png`, `r2-summary.png`, `r2-low-summary.png`, `r2-medium-summary.png`.

Review videos: [flight, collection and avoidance](videos/r2-flight.mp4) and [corridor bounds and objective recovery](videos/r2-guided-flight.mp4). Originals: `videos/r2-flight.webm` and `videos/r2-guided-flight.webm`. They record actual gameplay, including camera and world motion, not scripted image playback. The browser recording frame rate is separate from measured renderer FPS.

## Remaining differences and required physical review

The new model and surface detail visibly improve on R1, but do not reproduce the reference's cinematic fidelity. The craft is still a compact authored survey/fighter design; fine artist-painted wear, complex rock texture maps, atmospheric scattering and film-quality exhaust remain outside this phase. Procedural planet/nebula patterns can still look synthetic. The environment is a guided finite course rather than an unrestricted exploration game.

The soft corridor intentionally reduces outward motion before the mathematical edge, so a player may not reach the exact edge coordinate during a short mission. Heading range is a maximum, not a promise of sustaining ±60° against a nearby boundary. Ignoring guidance can still result in missed stars; no automatic collection or forced steering hides that outcome.

Physical WT901 latency/comfort, projector readability, target Windows hardware, longer endurance testing and supervised child/teen understanding/enjoyment remain pending. Use the updated [physical validation checklist](PHYSICAL_VALIDATION_CHECKLIST.md). Software tests establish behavior, not clinical effectiveness.

Potential R3 work, only after explicit approval: supervised tuning of guidance/pacing and hand ranges; artist-authored planet/rock surface maps; additional tested encounter families/landmark regions; and longer target-machine performance validation. No R3 implementation, production registration, auth/rule/schema change, patient-history write, commit, push or deployment was performed.

## Exact files and preservation audit

Modified existing files (relative to repository root):

- `components/control/spacepilot3d/SpacePilot3DControl.tsx`
- `components/display/spacepilot3d/SpacePilot3DSessionDisplay.tsx`
- `components/display/spacepilot3d/prototype.module.css`
- `docs/spacepilot3d/ASSET_LICENSES.md`
- `docs/spacepilot3d/PHYSICAL_VALIDATION_CHECKLIST.md`
- `lib/spacepilot3d/README.md`
- `lib/spacepilot3d/__tests__/graphicsLifecycle.test.ts`
- `lib/spacepilot3d/__tests__/runtime.test.ts`
- `lib/spacepilot3d/__tests__/session.test.ts`
- `lib/spacepilot3d/__tests__/worldFlight.test.ts`
- `lib/spacepilot3d/controlSessionRuntime.ts`
- `lib/spacepilot3d/displaySessionRuntime.ts`
- `lib/spacepilot3d/graphics.ts`
- `lib/spacepilot3d/presentation.ts`
- `lib/spacepilot3d/renderer.ts`
- `lib/spacepilot3d/sessionAuthority.ts`
- `lib/spacepilot3d/sessionContract.ts`
- `lib/spacepilot3d/sessionReplica.ts`
- `lib/spacepilot3d/sessionStorage.ts`
- `lib/spacepilot3d/worldCamera.ts`
- `lib/spacepilot3d/worldFlight.ts`
- `lib/spacepilot3d/worldGameplay.ts`
- `docs/spacepilot3d/ARTIFACT_MANIFEST.md`

New implementation/asset files:

- `lib/spacepilot3d/objectiveGuidance.ts`
- `lib/spacepilot3d/__tests__/guidedFlight.test.ts`
- `public/spacepilot3d/models/aurora.glb`
- `docs/spacepilot3d/assets/create-aurora.mjs`
- `docs/spacepilot3d/assets/aurora-build.json`

This report and the `r2-*` validation scripts, logs, JSON evidence, screenshots and recordings are new. The complete path/hash inventory is [r2-change-manifest.json](validation/r2-change-manifest.json). Comparison uses a pre-R2 working-tree baseline of 793 existing files, preserving earlier uncommitted work rather than comparing only against HEAD. The hash audit found 23 modified existing files, 770 unchanged existing files and no missing files. All changed baseline files are in the experimental directories. The baseline omitted 64 pre-existing untracked files under `tools/witmotion_ble`; their creation and modification timestamps precede R2 and no tool operation edited them, but they do not have before/after hash coverage. They are explicitly listed separately in the audit.

The protected WT901 driver/calibration/filter/transport, `sensorInput.ts`, `keyboardInput.ts`, original collision proxies, production games, auth, Firebase rules/schema/history, route files, game registry and package manifests remain unchanged. No files were reset, discarded, committed, pushed or deployed.

For local review, use the normal configured development server at `http://127.0.0.1:3000/control/space-pilot-3d-prototype`, sign in through the existing staff gate, and open Display from Control. Browser gameplay validation uses the already-existing unconfigured local demo mode via a process-only environment override; no authentication source or environment file is edited. The normal configured server is restored after validation.
