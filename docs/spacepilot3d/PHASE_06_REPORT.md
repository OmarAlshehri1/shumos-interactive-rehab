# Phase 06 — Space Pilot graphics upgrade

Status: **COMPLETE for the experimental software upgrade**, with the visual differences below explicitly remaining. This is a substantial playable upgrade over the Phase 02/05 placeholder, not a claim of matching the reference's rendered fidelity.

## Implemented scene

The spacecraft is Quaternius's licensed **Bob** model from Ultimate Spaceships Pack, packaged as a 2.8 MB self-contained GLB with its original embedded diffuse texture. Its 938-triangle hull includes cockpit, wings, panel lines and surface markings. White/silver hull and runtime blue paint use PBR materials and an environment reflection map. Paired ribbed engine housings, blue glows and bounded exhaust sprites supplement the licensed hull. Tier 2 adds illuminated engine collars and longer exhaust; tier 3 adds wing extensions, bright accents and fins. No upgrade changes colliders or sensitivity.

Irregular reusable asteroid meshes use procedural rock grain and normal variation. Fiery variants have emissive vein patterns and six pooled flame sprites per encounter. Gold stars have a beveled five-point silhouette, metallic shading and a restrained halo. Four reusable feedback pools provide collection and impact bursts. The navy environment uses two sparse star layers, procedural nebula shading and a lit procedural planet with an atmospheric rim. No full-screen gameplay image or user reference image is used.

The elevated third-person camera keeps the ship near the lower center and preserves forward visibility. It translates with a fixed fraction of the accepted ship pose, without shake, roll, delayed steering or a second input filter. Model size is fitted to the existing gameplay envelope; the authoritative capsule proxies and every gameplay rule remain unchanged.

## Loading and rendering

- One Three.js animation loop. Display reads accepted Control poses; no Display simulation or scoring.
- Local GLB loading with failure handling. Start requires a completed rendered frame after the model and encounter shaders are ready.
- All encounter materials warm before readiness, avoiding first-star/fire shader compilation during a session.
- Low/medium/high resolution caps: 0.8 / 1.25 / 1.75 device pixel ratio. Sustained slow frames reduce resolution down to 0.6; quality changes never alter input or gameplay.
- Low quality reduces exhaust/fire sprites and disables the atmospheric rim and faint star layer. No postprocessing bloom or volumetric fire.
- Geometry, material, texture, environment target, animation loop and resize observer cleanup. Fetch abort and late-load disposal prevent remount leaks.
- Renderer telemetry exposes rolling actual frame intervals, draw calls, triangles, resource counts and loading duration for Phase 07 measurements. No per-frame React updates.

## Validation

- Full real two-window HIGH difficulty run after the graphics replacement: 3 missions, 11 stars, 1,100 points, 2 deliberate impacts, tier 3; Control and Display matched throughout.
- Browser regression passed keyboard control, duplicate and stale-run packets, restart, pause/resume, End, both reloads, minimize/restore, focus changes, temporary message loss, multiple Displays and Control close. No page errors or Firebase requests in that run.
- Phase 06 targeted suite: 9 files / 81 tests passed. Subsequent Phase 07 adds disposal and asset failure tests and reruns the complete suite.
- Actual asset integrity test parses the shipped GLB and validates buffers, indexed mesh data, embedded PNG, and absence of external texture/buffer dependencies.
- During visual review, the initially evaluated Insurgent hull was rejected as too bulky. Bob was selected for its winged silhouette. A nebula plane edge and overbright rock material were corrected. Runtime snapshots and final Phase 07 captures represent those corrections.

## Gameplay-quality review

The five-point gold silhouette remains recognizable at approach distance and bright against the dark sky. Rocks are irregular, rotate slowly and grow with perspective. Approaches remain bounded by the existing 70-unit visibility range; all scripted avoidance paths and two intentional impacts were exercised at HIGH difficulty. The clear central flight space and sparse sky avoid obscuring targets. LOW/MEDIUM full sessions and input-loss recovery are recorded in Phase 07.

The three tiers change engines first, then wings/fins, without requiring a virtual steering pad. Keyboard remains a development simulation; the RIGHT_HAND run used the real existing normalized-pointer channel. The small alignment guide only supports safe sensor pickup. This is an engineering and visual playability review, not a child usability study or a clinical assessment of enjoyment.

## Comparison with IMG_1448.JPG

| Aspect | Actual result | Remaining difference/work |
|---|---|---|
| Camera | Stable behind/above view, ship lower center, clear forward approaches | Reference has a more oblique hero composition and a larger ship. Keep actual steering views stable before considering more cinematic framing. |
| Spacecraft | Licensed textured winged hull, cockpit/panel markings, white/silver and blue PBR surfaces | Low-poly source, simpler hull curvature and engine construction than reference. A custom medium-detail aircraft hull with separate normal/roughness maps would close this gap. |
| Lighting/materials | Directional key/rim, environment reflections, readable metallic ship | No ray-traced shadows or high-resolution authored PBR maps; more stylized highlights. |
| Asteroids | Live irregular textured/shaded rocks, orange emissive veins, pooled fire | Procedural grain and veins are less natural than a scanned cratered rock with authored normal maps. |
| Collectible | Gold beveled 3D five-point star, halo and collection burst | Restrained glow, simpler specular detail than the reference. Silhouette prioritized. |
| Engines | Twin blue glows, segmented housings, moving exhaust sprites; tier upgrades | Sprite exhaust is less fluid than the reference's volumetric plume. No expensive volumetric simulation. |
| Background | Dark navy, subtle procedural cloud band, sparse stars and a shaded planet | Planet/cloud detail is visibly procedural, not a photographic planetary surface. |
| Overall | Substantial model/material/environment upgrade, fully live gameplay | Still a stylized browser prototype. The reference's premium realism is **not fully achieved**. |

Asset acquisition and licenses are in [ASSET_LICENSES.md](ASSET_LICENSES.md). Final representative screenshots and integrated measurements are indexed in the Phase 07 and final reports. No Phase 08 work, production registration, BLE/calibration change, Firebase rule/schema change, commit, push or deployment was performed.
