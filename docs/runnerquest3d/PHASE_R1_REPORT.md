# Runner Quest 3D — Phase R1 report (architecture, isolation, 3D foundation)

**Status: COMPLETE** (software; no physical hardware involved)

## Isolation
* The working tree already holds ~90 uncommitted entries from other work (Space Pilot 3D, Balloon Quest 3D B6, Build Quest). A clean worktree from `HEAD` would drop those required dependencies (`lib/physicalInput`, etc.), so **no worktree was used**. Instead Runner Quest lives **only in new files** and **no existing file was modified** in R1 (shared-file integration is deferred to R5 and re-checked there).
* Nothing was committed, stashed, reset, cleaned or discarded.
* A dev server on `:3000` belongs to another agent and was never touched. All browser runs use a rsync'd **scratch copy** (own `node_modules` clone, **no `.env.local`**, so no real Firebase config is ever loaded) on port 3210.

## Architecture (new files)
| Area | Path |
|---|---|
| Gameplay simulation (pure) | `lib/runnerquest3d/session.ts`, `stages.ts`, `types.ts` |
| Seeded encounter generation + reachability validator | `lib/runnerquest3d/encounters.ts`, `rng.ts` |
| Input (hub, foot recognizer, simulated feet) | `lib/runnerquest3d/input/*` |
| Session authority + Control/Display transport | `controlRuntime.ts`, `controlMount.ts`, `displayMount.ts`, `protocol.ts`, `replica.ts` |
| Arabic strings | `arabic.ts` |
| Rendering (Three.js) | `components/display/runnerquest3d/scene/*` |
| Display UI / HUD | `components/display/runnerquest3d/*` |
| Therapist UI | `components/control/runnerquest3d/*` |
| Routes (development only) | `app/control/runner-quest-3d-prototype`, `app/display/runner-quest-3d-prototype` |

Control owns all gameplay outcomes. The Display only renders `DisplayState` and extrapolates distance from a clock message; it never awards progress. No Firebase, no per-frame writes (BroadcastChannel only).

## 3D foundation
* `three@0.186.1` already in `package.json` (no new dependency). **No external model/texture assets**: the runner is a procedural articulated character (torso, head, hair, headband, backpack, scarf, upper/lower arms, thighs/shins/shoes) so there is nothing to license or fail to load. All textures are generated on a canvas at runtime.
* Third-person follow camera: behind (+7.6 m) and above (3.7 m), gentle lateral damping, small speed-dependent FOV (disabled under reduced motion), no shake, no spin.
* Animation states: run cycle (speed-scaled), lean/lateral bank, step-over hop (derived from authoritative distance), celebration, idle/pause breathing.
* Environment: cobble path with three tinted lane regions and dashed dividers, fenced edges, instanced trees/bushes/flowers/rocks (per-cell seeded), hills, clouds, windmill landmark, pollen particles, bridge landmarks, fog, shadows.
* One `Own` registry tracks every geometry/material/texture; `RunnerScene.dispose()` releases them, disposes instanced meshes, the renderer and force-loses the context. The canvas is created inside the effect (a force-lost canvas cannot be reused after a StrictMode remount — this was a real bug found and fixed).

## Validation (real Chrome, Apple M1 GPU, dev build)
| Check | Result |
|---|---|
| World renders, character + camera visible | ✔ `screenshots/r1-ready.png`, `r1-run-center.png` |
| Forward motion | ✔ 3.05 m/s measured at 3.0 m/s setting (`results/r1.json`) |
| Directional movement (real `ArrowLeft`/`ArrowRight` key events) | ✔ lane −1 then +1; `r1-run-left.png`, `r1-run-right.png` |
| Assets load reliably | ✔ nothing to fetch; scene init ≈ 11–15 ms |
| Console errors | ✔ 0 |
| Performance (1600×900, high, shadows on) | ✔ 60 fps, frame max 17 ms, ~255 draw calls, ~59k triangles, 93 geometries, 11 textures |
| Resource cleanup | ✔ 30 mount/unmount cycles: geometries 255→255, materials 194→194, textures 10→10, **no "too many WebGL contexts" warning** (`results/remount.json`) |

Evidence scripts: `docs/runnerquest3d/validation/` (`r1.mjs`, `remount.mjs`, `cdplib.mjs`).

## Known R1 limitations
* Measurements are dev-build, headless Chrome on an M1 GPU — not the target projector/Windows machine.
* Visual polish continues in R2.
