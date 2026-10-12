# Phase R3 — Golden rings and accessible flight

Date: 2026-10-09. R3 gameplay scope; the subsequently authorized local library replacement is documented in [FINAL_INTEGRATION_REPORT.md](FINAL_INTEGRATION_REPORT.md). Physical WT901/projector validation and production approval remain separate requirements.

## Ring gameplay

Golden checkpoint rings replace collectible stars throughout the active Control/Display experience. They are real Three.js torus meshes with metallic gold materials, an open center, a restrained annular glow and rotation about their plane normal. Fixed world placement, genuine forward travel, the Aurora model, R2 camera, corridor and heading limits remain. No image substitutes for gameplay geometry.

A pass awards 100 points once. A failed crossing resolves as a missed ring, without a collision penalty. Golden pooled particles and brief Arabic feedback accompany successful passes. Rings are not awarded through proximity to the hull or a wing. Difficulty, mode and opening tolerance are fixed for a run; speed does not automatically increase between missions.

## Accessible flight modes

Flight mode is independent of LOW/MEDIUM/HIGH difficulty and the existing keyboard/RIGHT_HAND input-source selector. EASY is the initial recommended mode.

| Mode | Required child movement | Altitude behavior | Speed modifier | Opening base radius |
|---|---|---|---:|---:|
| EASY | Left/right | Fixed safe level Y=0; vertical input ignored | 0.75× | 4.4 |
| MEDIUM | Left/right | Bounded automatic alignment toward the next pending ring | 1× | 3.9 |
| ADVANCED | Left/right and up/down | Direct R2 two-axis flight; no altitude assistance | 1× | 3.5 |

MEDIUM assistance is therapist-selected at 0.5, 1.5 (default) or 3 world units/second. The desired climb rate is the altitude error divided by time-to-plane, bounded by that setting. It uses the existing physical pitch-rate response, not teleportation or an added input filter. Assistance returns to neutral pitch when the next pending encounter is a hazard; it never steers horizontally. The child sees a small Arabic indication that altitude assistance is enabled. EASY/assisted hazard advice offers a horizontal clearance route, not an unreachable climb command.

The accepted normalized hand coordinates are retained for the existing pickup/recovery protections even when the game ignores vertical motion. BLE, calibration, sensor roles, filtering, centering, publisher transport and freshness thresholds are unchanged. Keyboard and simulated RIGHT_HAND take the same mode-aware authoritative flight path.

## Difficulty and encounter placement

| Difficulty | ADVANCED/MEDIUM speed | EASY speed | Default interval | Default opening allowance | Rings / hazards per full session |
|---|---:|---:|---:|---:|---:|
| LOW | 22.5 | 16.875 | 5 s; EASY at least 6 s | 0.8 | 15 / 3 |
| MEDIUM | 30 | 22.5 | 5 s; EASY at least 6 s | 0.5 | 13 / 5 |
| HIGH | 40 | 30 | 4 s; EASY at least 6 s | 0.25 | 11 / 7 |

Distances/speeds are prototype world units, not clinical measures. The opening allowance is configurable from 0 to 1 and visibly enlarges the aperture. It never adds an invisible collection area outside the ring. Actual opening radius is the mode's base plus this allowance; Aurora's collision envelope is unchanged.

Each mission retains six encounters, with lower difficulties replacing selected hazards with rings. All sessions therefore have 18 outcomes, but ring denominators are 15, 13 or 11 rather than a hardcoded 11. Accuracy remains completed/presented rings, with no percentage before the first presentation. Final summaries expose presented, completed and missed rings, avoided hazards, contacts and points.

The three themes remain Flight Training, Asteroid Field and Fiery Passage. Encounters use fixed deterministic world coordinates, conservative steering-budget placement and R2's arrival-offset anchoring between missions. Approach distance remains at least 90 units or four seconds of travel; visibility begins within 260 units. Rings and hazards have separate depth planes. EASY rings remain at Y=0, with wider apertures and fewer fiery variants; MEDIUM/ADVANCED rings vary in height. Hazard routes remain open horizontally, with vertical alternatives in ADVANCED. LOW/MEDIUM default to full visual guidance; HIGH defaults to ring guidance, with all guidance choices still therapist-configurable.

## Geometric ring detection

`lib/spacepilot3d/rings.ts` implements a swept, oriented plane crossing. For the spacecraft reference positions before/after a fixed physical step, signed distances to the ring plane must change from positive to nonpositive. The crossing fraction interpolates position and spacecraft orientation at the plane. The reference then must fit the permitted opening after accounting for all existing hull, wing and pod capsules.

Each capsule endpoint is transformed with the renderer's YXZ orientation, projected into the ring plane, and checked against `innerRadius - capsule.radius`. This is a conservative full projected-envelope fit, not exact triangle/torus contact. It can reject a visually marginal angled pass; it cannot award a nearby wing touch as a successful passage. Reverse/parallel travel and an already-on-plane reference do not generate another crossing. High-speed segments cannot tunnel past the plane. Pending/outcome guards and Control ownership enforce exactly-once scoring; missed objectives also resolve once.

The visual ring normal is the same normal used by collision detection. Decorative rotation is within that plane, so it never changes the permitted opening. Ring geometry and metadata travel only in accepted presentation frames.

## Upgrades, effects and instructions

Aurora retains three cosmetic tiers: standard hull, enhanced engine details, then enhanced wings/details. Default milestones remain three and seven completed rings. Control also offers two/five and five/ten; normalized settings support bounded milestones with tier 3 strictly after tier 2. Upgrades use a gentle approximately 1.1-second attachment reveal, disabled by reduced effects. They do not alter collision capsules, speed or sensor sensitivity.

Fiery variants retain irregular rock geometry, orange emissive cracks and bounded animated flame sprites. Their flame coloring was softened toward orange. Reduced effects hides the flame/particle movement; there is no bloom, background music, frightening explosion or screen shake. Collision feedback remains non-punitive.

Before launch, Display presents two Arabic cards with lightweight ring/rock illustrations:

- **مرّ عبر الحلقات الذهبية لتطوير مركبتك!**
- **ابتعد عن النيازك وأكمل رحلتك!**

Control can continue/skip, show the cards again, or start the existing three-second launch countdown. Starting dismisses the cards. Instructions do not advance simulation time or score and require no child-screen interaction. Mode, assistance, tolerance, milestones, difficulty and navigation settings lock during countdown and outside Ready. Only the existing safe input-source switching path remains available during a session.

## Authority, compatibility and assets

The experimental session/channel/checkpoint contract is **v4**. It includes accessibility settings, instruction visibility, ring metadata and ring-based counters; versions 1–3 are rejected. Close older prototype windows and reopen the pair. Control remains the sole simulation/collision/scoring authority; Display renders accepted state and visual guidance only. Session, owner, run, revision and epoch guards remain; loss recovery remains explicit.

No new third-party asset or package was introduced. Rings and illustrations are original procedural geometry/CSS; the existing Three.js MIT dependency and Aurora provenance remain documented in [ASSET_LICENSES.md](ASSET_LICENSES.md). Historical unpaired lane-preview tests remain as regression coverage; the active paired experience uses the new world ring-plane implementation exclusively.

## Validation

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


## Evidence

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


## Remaining issues and production gate

Physical RIGHT_HAND responsiveness, hand pickup comfort with ignored vertical motion, assisted-altitude comfort, child/teen comprehension, target projector readability, Windows GPU performance and longer endurance/thermal behavior require supervised validation. Synthetic publisher/keyboard results do not establish physical sensor latency or clinical benefit.

R2's visual limitations remain: procedural planetary/rock surfaces and lightweight exhaust do not reproduce the reference's cinematic rendering. The new rings prioritize a clear aperture and readable approach. The capsule-projection passage rule is intentionally conservative, and supervised play should inform tolerance choices. Mode-specific assistance remains game behavior, not a calibration change.

Before any production integration: complete and record the physical validation checklist for all selected modes/difficulties; obtain therapist/user acceptance of ring size, pacing, assistance and upgrade milestones; run longer tests on the target hardware/projector; review the production route/registry/auth/session/history integration design separately; and obtain explicit approval for that scope. The later user brief separately authorized local library integration and a release candidate. No other game, commit, push or deployment was started; see the integration report for the release boundary.

## Files and preservation

A pre-R3 SHA256 baseline covers 918 existing files, including previously uncommitted work and the pre-existing sensor tools. The final [change manifest](validation/rc-change-manifest.json) lists exact new/modified files and protected-file comparisons, separately identifying concurrent external work. The later integration authorization permits the canonical Space Pilot route and library metadata changes listed in the integration report. Legacy engine/history, other games, WT901 drivers/calibration/filtering, sensor roles, production pointer transport, auth and Firebase rules/schema remain protected.
