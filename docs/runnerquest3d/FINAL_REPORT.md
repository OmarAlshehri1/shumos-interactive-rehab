# Runner Quest 3D (مغامرة العدّاء) — Final report

**Result: RUNNER QUEST 3D LOCAL RELEASE CANDIDATE READY — Physical foot-sensor and projector validation pending.**

| Phase | Status |
|---|---|
| R1 Architecture, isolation, 3D foundation | **COMPLETE** |
| R2 Premium world, obstacles, game feel | **COMPLETE** |
| R3 Three difficulties × three stages | **COMPLETE** |
| R4 Foot-sensor input, Control/Display | **COMPLETE (software, simulated sensors only)** — hardware not validated |
| R5 Full testing & local integration | **COMPLETE for testing**; library integration **TESTED but its application to shared files is DEFERRED** (documented blocker: a concurrent agent is editing those files) |

Nothing was committed, pushed or deployed.

## 1. Implemented gameplay
A third-person 3D running adventure for supervised rehab. The child's runner moves forward through a park along **three lanes**; the child moves **left/right** and **lifts a foot** (or presses keys in simulation) to pass obstacles. There is **no timer, no fail state, no collision**: if the way is blocked the runner brakes and waits 1.6 m short of the obstacle until the child acts (or the therapist assists). Stars are only ever added. The therapist chooses the stage; the next stage starts only when they press "المرحلة التالية". Control owns all outcomes; the Display renders them.

## 2. The nine stages
Easy: الخطوات الأولى (rocks), اختر المسار (glowing gate), تجنّب بلطف (more rocks/logs). Medium: أول حاجز (one full-width hurdle at a time), الاتجاه والخطوة (side + step), درب العوائق (trail). Advanced: مسارات متغيّرة (gates/markers/checkpoints), عوائق متنوعة (predictable side–hurdle–hurdle–side), المغامرة الأخيرة (everything + festival destination). Details and rules: `PHASE_R3_REPORT.md`.

## 3. 3D graphics and assets
Three.js 0.186.1 (already a dependency). **No external models, textures or fonts were added**; the runner is a procedural articulated character (run, lean, step-over hop, celebrate, idle) and all textures are generated on a canvas, so there is nothing to license. Park environment with nine palettes, instanced trees/bushes/flowers/rocks, fences, bridges over streams, hills, clouds, windmill, soft pollen, shadows, a plaza/fountain destination and a lantern pavilion for the finale. Quality presets high/medium/low with auto-downgrade; reduced-motion mode. No music or audio.

## 4. Input architecture
`input/hub.ts` is the single gate: each session picks `KEYBOARD`, `RIGHT_FOOT`, `LEFT_FOOT` or `DUAL_FOOT`; everything else (hands, handheld, wrong foot, keyboard in foot modes) is dropped and counted. `input/footRecognizer.ts` turns normalised WT901-shaped `MotionSample`s into debounced `TILT_LEFT / TILT_RIGHT / LIFT` relative to a learned rest pose (no height is measured; thresholds, axes and signs are configuration). `input/simulatedFoot.ts` generates simulated sensor streams. A real adapter only has to call `ControlRuntime.ingestFoot(role, sample)`. See `PHASE_R4_REPORT.md`.

## 5. Files
**Created (all new; ≈4,800 lines of TS/TSX/CSS + 87 tests):** `lib/runnerquest3d/**` (engine, encounters, input, protocol, runtime, mounts, availability, registration, Arabic, tests), `components/display/runnerquest3d/**` (scene, HUD, canvas, display, remount harness), `components/control/runnerquest3d/**` (therapist UI, thumbnail), routes `app/{control,display}/runner-quest-3d/` (flag-gated) and `app/{control,display}/runner-quest-3d-prototype/` (development only), and `docs/runnerquest3d/**` (reports, evidence, validation scripts, patch).
**Modified: none.** `git status` still lists exactly the 36 modified tracked files that existed before this work, none touched by it. `docs/runnerquest3d/LOCAL_INTEGRATION.patch` (2 shared files) is staged, not applied.

## 6. Dependencies and licences
No dependency added, `package.json`/lock untouched. Uses `three` (MIT), `next`, `react` (already present). Fonts come from the existing display layout (Baloo Bhaijaan 2, SIL OFL via `next/font`). No third-party art; nothing from Subway Surfers or any proprietary game is used — only the generic third-person endless-runner viewpoint.

## 7. Automated test results
`tsc` 0 errors · `eslint .` 0 problems · Runner Quest 87 tests · full repo **1667 passed / 4 skipped** (pre-existing emulator skips), 126 files · production `next build` succeeds (scratch copy, flag on and off). Details: `PHASE_R5_REPORT.md`, `results/`.

## 8. Browser validation (real Chrome, two windows)
Full nine-stage session 9/9 (88 stars, 0 mismatches, 0 errors); workflow suite 47/47 (all four sources with isolation, sensor loss and gated recovery, pause/restart/skip/advance/end, Display reload/close/reopen, hidden window, second Control blocked, Control reload, idle child, therapist assist, reduced motion); production-build smoke 9/9 with a network audit (localhost only).

## 9. Performance (Apple M1, headless Chrome 155, 1080p, Control + Display together)
60.0 fps, p99 16.8 ms, **0 frames > 33 ms** on high and medium (one 50 ms spike once on low), 244 draw calls, ~79k triangles; production build also 60.0 fps; input channel p50 2.4 ms / p95 5.1 ms; GPU resources and heap flat across 30 remounts and 36 stage transitions. **Not measured on the target Windows machine/projector.**

## 10. Screenshots and video (`docs/runnerquest3d/`)
`screenshots/`: r1-* (foundation, lane movement), r2-* (hop, checkpoint, marker, gate, themes, destination), r3-* (stage-complete screens, hold with hint, session summaries), r4-* (simulated foot, summary), r5-* (library card, production play, quality presets, reduced motion). `video/runner-quest-gameplay.mp4`: 78 s of real Display capture during a bot-played Medium stage (real key events, real Chrome). All images are real browser captures, none generated.

## 11. Known limitations
* Local only: Control and Display must be windows of the **same browser profile on the same computer**; no Firebase session, **not saved to patient history**, no cloud Display.
* The runner is procedural (not a licensed glTF model); character art is deliberately simple from the back-view camera.
* No audio at all (no music by design; no effects yet).
* Tested only in Chrome on macOS; Safari/Firefox/Windows untested. Needs WebGL2 and Web Locks.
* Foot-lift detection is a configurable **orientation-change** detector, not a height measurement; thresholds/axes are unvalidated defaults.
* `window.__RQ3D*` test hooks and the HUD diagnostics exist **only in development**.
* Settings are not persisted between sessions.
* Colour-blind and low-vision review of the lane tints and hints has not been done.

## 12. Hardware testing requirements (before any clinical use)
1. **WT901 on real feet** (right, left, both): confirm which axes carry tilt and lift for the chosen mounting (ankle/shoe, seated and standing); confirm left-foot sign mirroring; tune `tiltDeg`, `liftDeg`, dwell/refractory; verify rest-pose settling and recenter UX; check false positives at rest and during normal walking/fidgeting.
2. **BLE behaviour**: latency and jitter, packet loss, disconnect/reconnect (the game suspends and requires a settled foot), two sensors streaming at once.
3. **Wire an adapter**: a real `PhysicalInputManager`/`Wt901BleInputSource` role stream must feed `ingestFoot(role, sample)`; the shared sensor provider is outside this module and was not changed.
4. **Projector/Windows laptop**: frame rate, resolution/DPR, GPU/driver, power plan, long soak (≥ 30 min), thermal throttling, second-screen window placement.
5. **Clinical review**: speeds, spacing, wording of hints, whether a lift/tilt is a safe, achievable action for the intended children (seated vs standing), and the pause/assist policy.

## 13. Local library integration status
Routes `/control/runner-quest-3d` + `/display/runner-quest-3d`, the flag, manifest and thumbnail are in place and were verified in a production build of a patched scratch copy (card appears, opens, plays; flag off ⇒ everything disappears; other games untouched). **The 2-file patch is not applied to the shared registry/thumbnail files** because another agent is working in them — see `LOCAL_INTEGRATION_PATCH.md`. To apply: `git apply docs/runnerquest3d/LOCAL_INTEGRATION.patch` (check passes today).

## 14. Rollback
* Library/production: unset `NEXT_PUBLIC_RUNNER_QUEST_3D` (or `=0` in dev) and rebuild — card and both routes vanish; no other game is affected. Without applying the patch nothing in the library changes at all.
* Full removal: delete the new folders above and `docs/runnerquest3d`; nothing else references them (shared files were never edited).

## 15. Remaining production deployment work
Apply the integration patch when the shared files are quiet; run the hardware checklist; decide whether a Firebase transport (Control and Display on different devices) and patient-history recording are wanted — neither exists; approve and build with `NEXT_PUBLIC_RUNNER_QUEST_3D=1`; optionally add a licensed character model and audio; add colour-vision and clinical review; re-run `validation/prod.mjs` and the full suite on the deployment build.

## How to run it locally
Isolated validation copy (no credentials), as done here: rsync the repo to a scratch folder without `.env.local`, `next dev -p 3210`, open `/control/runner-quest-3d-prototype` and (second window, same profile) `/display/runner-quest-3d-prototype`. Single-window keyboard preview: `/display/runner-quest-3d-prototype?preview=1&stage=0` (Enter starts; ← → move; Space steps). Evidence scripts and how they were run: `validation/`.
