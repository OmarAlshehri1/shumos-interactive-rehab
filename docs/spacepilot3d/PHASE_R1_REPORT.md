# Phase R1 — world flight, chase camera and existing RIGHT_HAND integration

Date: 2026-10-09. Experimental software implementation; physical WT901/projector validation and user visual acceptance remain pending. No R2 work, production registration, commit, push or deployment was performed.

## What changed and why

Reviewed the Phase 08 report, input adapters, simulation/collision code, Control authority, Display renderer, and the supplied 14.22-second recording (1918×920, 60 fps). The recording showed a ship fixed at Z=0, a largely stationary backdrop, and encounters moving down a narrow lane. The supplied spacecraft image remains the visual direction: readable white/blue hull, cyan exhaust, gold collectibles, dark layered space and recognizable rocks.

R1 replaces the active paired simulation with genuine forward world travel. Ship Z now decreases continuously; encounters and landmarks retain their world positions. Steering changes velocity and heading, and the chase camera follows that heading. The retained licensed textured spacecraft, engine/upgrades and Arabic therapist/child UI are used in the new world.

The removed assumptions were: fixed ship Z; moving encounter Z; pickup reconstructed from world X/9.6 and Y/5.6; collision capsules translated without orientation; a nearly fixed camera; effects located at Z=0; and browser/test timing based on the old short approach. Historical standalone `gameplay.ts`/`simulation.ts` remain unchanged; paired Control instantiates `WorldGameplaySimulation` through a clear migration boundary.

## Flight model and exact sensor mapping

Coordinates: +X right, +Y up, -Z course-forward. Physics advances at fixed 1/120-second steps from accepted Control input. Initial position and orientation are zero. Missions continue from the preceding world pose; only Restart resets the world origin. There is no Display-side flight prediction or scoring.

For final normalized pointer `(x,y)`:

1. Horizontal axis `a = 2(x - 0.5)`; vertical axis `b = 2(0.5 - y)`.
2. Static mapping `f(v)=0` for `abs(v)<=0.06`; otherwise `clamp(sign(v)*(abs(v)-0.06)/0.94*sensitivity,-1,1)`.
3. Target yaw `0.6*f(a)` radians; target pitch `0.3*f(b)` radians. Thus heading is bounded to ±34.4° and climb/descent to ±17.2°. Holding a tilt sets a heading; it does not accumulate rotation.
4. Physical yaw changes by at most the selected turn rate × step; pitch uses 70% of that rate. Translation integrates the midpoint heading, with forward vector `(sin(yaw)*cos(pitch), sin(pitch), -cos(yaw)*cos(pitch))`.
5. Near the horizontal/vertical envelope, outward target angles taper over the final 12/6 units. Position is bounded. Neutral returns the course to -Z while preserving lateral displacement, rather than pulling the ship back to the center.

The neutral zone is ±0.03 in normalized pointer coordinates. This is an instantaneous game mapping, not temporal smoothing. The accepted normalized pointer is stored immediately; the existing sensor adapter, BLE driver, calibration, motion filtering, auto-centering, roles and `shumos-sensor-pointer` transport are unchanged. Camera damping never writes input or ship pose.

Keyboard and RIGHT_HAND feed the same authority and flight model. The existing keyboard pointer simulator still uses arrows/WASD. C returns its held pointer to neutral. In sensor mode keyboard steering remains disabled. Pickup/recovery aligns to the **last accepted steering coordinate**, independently of the ship's world position. Restart aligns at (0.5,0.5).

| Setting | LOW | MEDIUM | HIGH | Therapist range before Start |
|---|---:|---:|---:|---|
| Base forward speed, world units/s | 22.5 | 30 | 40 | Difficulty preset |
| Max yaw rate, degrees/s | 30 | 45 | 60 | 15–75 |
| Encounter interval, seconds | 7 | 6 | 5 | 4–10 |
| Sensitivity | 1× | 1× | 1× | 0.5–2× |
| Horizontal half-width / vertical limit | 48 / 22 | 48 / 22 | 48 / 22 | 32–64 / 12–28 |

Mission speed factors remain 1, 1.12 and 1.24. Changing difficulty restores its flight defaults. Settings lock once the session leaves Ready and during countdown. These controls never modify underlying sensor calibration.

## Camera, world and visual review

The chase rig follows 10 units behind and 5 above the ship, with a small 1-unit side offset. It looks 18 units ahead with a downward composition offset, keeping the spacecraft near the lower center. Yaw/pitch follow actual accepted orientation; world-up stays stable and bank does not roll the camera. Normal FOV is 50°, with independent 0.16-second visual damping. Reduced camera motion uses 54°, 0.45-second damping and 35% pitch response. It is independent of reduced effects and initially respects the OS motion preference. Paused gameplay freezes camera follow progression.

Four fixed landmarks provide depth: an azure planet (-180,-70,-500), nearby moon (-112,-45,-550), ringed planet (230,-100,-1550), and distant planet (-250,-400,-3400). There are 72 instanced decorative rocks in irregular sparse clusters outside the maximum navigable X envelope, three fixed star-point layers, and sparse world dust. A fixed procedural nebula enclosure surrounds the course. Nothing rotates a background image to simulate steering. The camera moves through real 3D geometry; the Display is not an image-based gameplay simulation.

Screenshot review caught a clipping edge from the first planar nebula. It was replaced with a fixed inward-facing 18,000-unit sphere centered at (0,0,-4500), with a 30,000-unit camera far plane. Final screenshots/video and performance measurements use that correction. Geometry, materials, effects and instancing remain bounded and are disposed on renderer teardown.

The actual captures demonstrate larger foreground changes, passing landmarks, distinct viewpoints during turns/climb/descent, a visible spacecraft and bright five-point collectible silhouettes. Stars grow naturally with approach. Asteroids have long approach distances and open routes above/below them; the native browser runs successfully used both routes. Existing cyan engine/wing upgrade tiers remain distinguishable, with accepted Arabic collection/upgrade/impact feedback. No directional virtual controls or background music were added.

Compared with the reference, the hull is still the existing stylized CC0 Bob model with added pods/wings, rather than the reference's finely panelled cinematic spacecraft. Rock surfaces and planets remain procedural and less photorealistic; lighting and exhaust are simpler, and the chase angle deliberately prioritizes steering readability. The fixed course has substantially more depth and parallax, but is not an unrestricted open-world simulator. User/child enjoyment and motion comfort require supervised review; automated steering establishes mechanical feasibility, not clinical suitability.

## Encounters and geometric collisions

Each mission still contains six deterministic encounters. Positions spread horizontally and vertically around the mission start region and stay fixed thereafter. Spread scales conservatively with sensitivity, turn rate, interval and movement limits, preserving reachable routes at constrained settings. Initial approach is at least 90 units or four seconds of travel, whichever is greater. Encounters become presented at 260 units; later spacing places them farther along the course. Off-center stars require deliberate steering. One obstacle per encounter leaves alternative routes; no blocking walls or dense sudden spawns were introduced.

The ship's existing compound capsule proxy now transforms with world translation, yaw, pitch and bank. Relative motion sweeps through the capsules, with angular subdivision and a tiny conservative arc allowance. This covers translation and rotating wing contact without treating the whole ship as an oversized sphere. It is continuous proxy geometry, not triangle-mesh contact. Star accessibility tolerance and bounded rocky/fiery sphere proxies remain intentional. Once an object passes safely behind the ship it resolves as missed/avoided, exactly once.

Three missions, 11 stars, seven obstacles, 100 points/star, upgrades at three/seven stars, gentle collisions, accuracy denominators, summaries and therapist lifecycle controls remain. No point deductions or forced sudden maneuvers were added.

## Authority and safety

Only Control advances world physics, resolves collisions or awards points. Display applies accepted world poses, objects, outcomes and revisions. The experimental contract/channel/checkpoints are version 2: `shumos-experimental-space-pilot-3d-v2:<room>`. Frames contain world position/orientation plus held normalized steering; accepted effects include world Z. Old v1 messages/checkpoints cannot be mistaken for R1 data. Close older prototype windows and reopen the pair after upgrading.

Existing owner/session/run/revision/input-epoch and primary-Display guards remain. One Control RAF scheduler and one Display render loop remain; frame/sample transport stays capped at 30 Hz, with no per-frame React state and no Firebase gameplay movement writes. The existing 250 ms freshness/acknowledgment/scheduling protections are unchanged. Hidden, disconnected or stale input pauses the authority; recovery requires alignment where applicable and explicit therapist Resume. No catch-up physics or collision sweep across sensor recenter jumps is performed.

The inherited normalized pointer protocol lacks publisher/recenter epochs. Its existing >0.45 jump heuristic cannot identify every small recenter; use Re-engage before the existing recenter operation and keep one sensor publisher. This limitation was not concealed or worked around by changing the protected transport.

## Verification

- `npm test`: **106 suites / 1,368 tests passed** (full repository, including production regressions).
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npm run build`: passed with the normal project configuration.
- Normal configured development-server check passed: signed-out staff gate visible, no experimental actions exposed, no credentials entered, and no hydration warnings on that reload. A development hydration warning appeared during earlier iterative hot reload; it did not reproduce in the final configured check.
- Production HTTP checks passed: experimental Display returned 404; Control returned its inherited streamed not-found response (HTTP 200 with the 404 fallback), with neither experimental component nor Start action present. No route registration was changed.

- Experimental suite: 115 tests in 11 files passed, including forward/neutral/4-axis flight, bounded headings, camera/parallax, world placement, reachable stars, two avoidance routes, rotated/swept geometry, all presets, constrained accessibility combinations, exact scoring/upgrades, pause/restart/recenter, protocol guards and equivalent keyboard/sensor trajectories. Identical input histories and complete run outcomes are checked at 30/60/120/144 Hz.
- Headed High-preset browser session: all three missions, 11 stars, 1,100 points, 18 resolved encounters, tier 3 and two deliberately tested collisions. Control/Display totals matched. Duplicate messages, old-run inputs, countdown cancellation, display reload, control reload, focus changes, actual minimization/restoration, message loss, a 500 ms scheduler stall, secondary Display restrictions and Control close passed.
- Directional browser review: real forward Z travel and left/right/climb/descent velocity assertions, invariant landmark world coordinates with changed screen projections, intentional off-center collection and asteroid avoidance. Final unedited screenshots and a 46.4-second real gameplay video were saved.
- Headed LOW and MEDIUM browser sessions also completed all three missions with 11 stars, 1,100 points, 18 outcomes, tier 3, five avoided obstacles and two intentional collisions each. These runs used the lower avoidance route, tested all five Ready-only flight settings, verified settings lock while running, then injected both RIGHT_HAND dropout and a >0.45 recenter-like jump. Poses froze during suspension; alignment and explicit Resume recovered without hidden progress. Final world Z was approximately -2,936 (LOW) and -3,415 (MEDIUM).
- Context loss and missing-model recovery passed, along with reduced-effects/reduced-camera settings and repeated Display remounts. Missing graphics prevent play until reloaded; recovery never silently resumes gameplay.
- Browser sensor messages were simulated final RIGHT_HAND coordinates over the unchanged local channel. No physical sensor, BLE latency, Windows GPU, projector, or supervised child trial was represented as tested.

## Integrated performance

Native headed Chrome 155, Apple M1/ANGLE Metal, 8 logical cores; viewport 1376×768 with device pixel ratio 2. Control and Display occupied separate OS windows. Browser background timer/rendering exemptions were disabled and actual focus flags asserted. Each sample followed 6.5 seconds of integrated flight; metrics cover the latest 240 frames. These are short steady-state measurements, not a 30-minute hardware endurance certification.

| Quality | Focused window | Render DPR | FPS | p95 frame ms | Max frame ms | Draw calls |
|---|---|---:|---:|---:|---:|---:|
| Low | Display; Control unfocused | 0.8 | 60.00 | 17.1 | 18.1 | 36 |
| Low | Control; Display unfocused | 0.8 | 60.00 | 17.2 | 17.6 | 34 |
| Medium | Display; Control unfocused | 1.25 | 60.00 | 17.5 | 18.1 | 46 |
| Medium | Control; Display unfocused | 1.25 | 60.00 | 17.4 | 18.7 | 43 |
| High | Display; Control unfocused | 1.75 | 60.00 | 17.5 | 18.1 | 46 |
| High | Control; Display unfocused | 1.75 | 60.01 | 17.1 | 17.6 | 43 |

Final measured intervals had no safety interruptions. One earlier attempt suspended during an unfocused-Control interval; the failure log is retained as `validation/r1-performance-interruption.txt`. The final harness records interruptions and verifies a frozen pose before explicit recovery rather than extending safety deadlines. Do not interpret the final stable samples as proof that browser scheduling can never interrupt play.

Final transport measurements: accepted frame latency mean 1.75 ms / p95 2.40 ms / max 146.10 ms (1,188 samples); keyboard sample transport mean 0.72 ms / p95 0.80 ms / max 29.10 ms (934 samples). These are same-machine browser message timings, not end-to-end physical sensor latency. Measured scenes used roughly 47,506–51,628 triangles. Three repeated remounts each returned to 20 geometries, four textures and 14 programs in the captured paused scene. Zero page/shader errors and zero Firebase gameplay requests were observed in the demo-mode validation.

## Review artifacts

All paths below are relative to `docs/spacepilot3d/`:

- [Real flight video](videos/r1-flight.mp4): H.264 MP4, 1376×768, 25 fps recording; [original VP8 capture](videos/r1-flight.webm) retained. Renderer FPS is measured separately above.
- [Neutral](screenshots/r1-flight-neutral.png), [left](screenshots/r1-flight-left.png), [right](screenshots/r1-flight-right.png), [climbing](screenshots/r1-flight-climbing.png), [descending](screenshots/r1-flight-descending.png).
- [Collection](screenshots/r1-flight-collection.png), [intentional off-center collection](screenshots/r1-flight-intentional-collection.png), [avoidance](screenshots/r1-flight-avoidance.png).
- [Low summary](screenshots/r1-low-summary.png) and [Medium summary](screenshots/r1-medium-summary.png).
- High-session evidence: `screenshots/r1-tier2.png`, `r1-tier3.png`, `r1-control.png`, `r1-summary.png`, and `r1-m*-encounter*.png`. These earlier full-session captures precede only the final nebula enclosure correction; use the `r1-flight-*` series for final graphics review.
- Runnable harnesses and raw evidence: `validation/r1-browser.mjs/.txt`, `r1-flight-review.mjs/.txt/.json`, `r1-performance.mjs/.txt/.json`, `r1-presets.mjs/.txt/.json`, `r1-production.mjs/.json`, `r1-auth-gate.mjs/.json`.

Browser harnesses accept `PLAYWRIGHT_MODULE` pointing to the locally installed Playwright module. The video harness additionally requires its compatible FFmpeg executable; validation used the installed system FFmpeg through a temporary `/private/tmp/shumos-playwright` registry directory. No application dependency or global browser installation was changed.

## Remaining limits and proposed R2 scope (not started)

- Physical RIGHT_HAND responsiveness, comfortable ranges, projector readability, a longer endurance run and supervised user enjoyment require the [physical checklist](PHYSICAL_VALIDATION_CHECKLIST.md).
- Flight is a wide bounded forward course, not 360° free flight. Six encounters per mission remain deterministic templates, with accessible spread; later work could introduce tested seeded route families and richer landmark regions.
- Existing assets remain more stylized than the reference. Better planet surfaces, rock texture detail and artist-authored regions could improve visual quality after reviewing the flight model.
- Review comfortable chase distance, banking and reduced-motion behavior on real projection before further effects. Preserve sensor response and safety over appearance.
- R2 or production integration requires a new explicit request. No production route, auth, rule/schema, patient-history or sensor-runtime change is part of R1.


## Exact source changes and preservation

New modules:

- `lib/spacepilot3d/worldFlight.ts` — pure bounded heading/translation and settings.
- `lib/spacepilot3d/worldGameplay.ts` — authoritative world encounters and mission progression.
- `lib/spacepilot3d/worldCollision.ts` — translation/orientation capsule sweeps.
- `lib/spacepilot3d/worldCamera.ts` — independent visual chase rig.
- `lib/spacepilot3d/__tests__/worldFlight.test.ts` — flight, camera, collision and route feasibility regressions.

Modified source:

- `lib/spacepilot3d/sessionAuthority.ts`
- `lib/spacepilot3d/sessionContract.ts`
- `lib/spacepilot3d/sessionStorage.ts`
- `lib/spacepilot3d/sessionReplica.ts`
- `lib/spacepilot3d/controlSessionRuntime.ts`
- `lib/spacepilot3d/displaySessionRuntime.ts`
- `lib/spacepilot3d/presentation.ts`
- `lib/spacepilot3d/graphics.ts`
- `lib/spacepilot3d/renderer.ts`
- `lib/spacepilot3d/arabic.ts`
- `components/control/spacepilot3d/SpacePilot3DControl.tsx`
- `components/display/spacepilot3d/SpacePilot3DSessionDisplay.tsx`
- `lib/spacepilot3d/__tests__/session.test.ts`
- `lib/spacepilot3d/__tests__/runtime.test.ts`
- `lib/spacepilot3d/__tests__/graphicsLifecycle.test.ts`

Modified documentation: `lib/spacepilot3d/README.md`, `docs/spacepilot3d/PHYSICAL_VALIDATION_CHECKLIST.md`, and `docs/spacepilot3d/ARTIFACT_MANIFEST.md`. This report and the R1 validation/screenshot/video artifacts are new. The complete path/hash inventory is [r1-change-manifest.json](validation/r1-change-manifest.json).

The pre-edit SHA-256 baseline covered 741 existing non-ignored files. The audit compares against that working tree, not HEAD, preserving earlier uncommitted work. It found no deletion and no change outside the experimental library/components/documentation. In particular, `sensorInput.ts`, `keyboardInput.ts`, upstream WT901/BLE/calibration/transport, production games, auth, rules/schema, route files and package manifests remain unchanged. Existing safety tests were retained; version fixtures and first-encounter timing were updated for the new world contract, with new discontinuity/pose assertions added.

For local review, use the normal configured server at `http://127.0.0.1:3000/control/space-pilot-3d-prototype`, sign in through the existing staff gate, then open the child Display from Control. Gameplay browser checks used the project's existing unconfigured local demo mode through a temporary process environment; no environment file, auth check or security rule was edited. The test process was stopped and the normal configured server restored. Physical validation remains pending as documented above.
