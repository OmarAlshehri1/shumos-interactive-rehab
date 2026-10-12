# Build Quest 3D — Final report

**BUILD QUEST 3D LOCAL RELEASE CANDIDATE READY — Physical hardware validation and deployment approval pending.**

2026-10-10. The isolated local game is fully playable and software-validated. Shared game-library registration remains deferred under the task's explicit dirty-shared-file exception. It is not a production release, and it is not registered in the existing shared library yet.

## Delivered game

Arabic: **عالم البناء**. English: **Build Quest 3D**. ID: `build-quest-3d`.

A real Three.js toy construction workshop: textured composite/wood workbench, soft directional shadows, room reflections, rounded colorful pieces, recessed matching sockets, ghost assemblies, a stable angled camera and a 16:9 play surface. Source pieces are on the right, construction on the left. Models are procedural original geometry, not generated pictures or video. No music, camera shake, collapse physics, flashing, countdown or time-based failure.

| Level | Stage | Pieces | Completion |
| --- | --- | ---: | --- |
| 1 | First Shapes / أشكالي الأولى | 2 | Square and circle snap into fitted sockets |
| 1 | Three Shapes / ثلاثة أشكال | 3 | Square, circle and flat triangle |
| 1 | Four Shapes / أربعة أشكال | 4 | Adds a rectangle |
| 2 | House / ابنِ بيتًا | 4 | Base, walls, roof; gentle illumination |
| 2 | Car / ابنِ سيارة | 4 | Body, two visible wheels, cabin; short movement |
| 2 | Robot / ابنِ روبوتًا | 4 | Body, head, arms; gentle wave |
| 3 | Tower / ابنِ برجًا | 3 | Ordered stack; completion glow |
| 3 | Bridge / ابنِ جسرًا | 3 | Two supports and deck; small toy vehicle crosses |
| 3 | Castle / ابنِ قلعة | 5 | Base, wall, towers and flag; subtle illumination |

Exactly 3 levels × 3 stages, 32 globally unique stage-namespaced piece IDs. Prerequisites prevent placing upper construction pieces before their foundations. Mistakes never deduct progress. Completed structures stay visible until the therapist advances.

Therapist controls include difficulty/stage, input mode, independent high/medium/low assistance, dwell (250–3000 ms), contact tolerance, render quality, start/pause/resume/restart/skip/end, and summary statistics. Child presentation uses concise Arabic feedback, large objects/hit regions and progress. Reduced motion disables movement rewards and interpolation. WebGL failure receives a readable error. Formal therapist/child accessibility and clinical usability reviews remain pending.

## Inputs and authority

- **RIGHT_HAND:** consumes the existing final normalized `shumos-sensor-pointer` transport. No driver, calibration, motion filter, automatic centering, role assignment or protocol changes, and no new BLE connection. Dwell selects; movement into the matching region snaps automatically. Stale input is held after 250 ms. Invisibility/large discontinuities disengage tracking; recovery requires pointer pickup. Upstream does not mark recenter events, so small unmarked recenter changes cannot be distinguished explicitly from ordinary motion; physical validation is required.
- **Mouse/keyboard:** click or dwell selects; pointer movement places. Arrows/WASD move the pointer; Space/Enter selects/releases. A keyboard window must be focused, as with normal browser keyboard input.
- **Prepared controller:** bounded stick axes, a dead zone and a rising-edge button feed the same engine. Browser Gamepad simulation passes. Actual handheld/Joy-Con compatibility and motion-controller mapping remain unverified.

Pure gameplay owns accepted selection/placement and session actions. Rendering never scores. Only Control accepts outcomes; Display sends guarded pointer intent and renders validated snapshots. Unique event IDs, globally unique piece IDs, session/run/stage/revision guards, ordered client sequences and freshness checks prevent stale/duplicate outcomes. Web Locks enforce one Control per session. Display silence holds safely. Reload restores accepted local state paused, increments the run guard and requires therapist resume. No patient identifiers/history or Firebase writes are added; accepted progress and summaries use local browser storage.

Local synchronization requires two windows of the same browser on one origin. Separate computers are unsupported by this experimental channel. Sensor hardware still belongs to the inherited Control runtime.

## Validation

| Check | Final result | Evidence |
| --- | --- | --- |
| Full Vitest | 1,659 passed; 4 existing skips; 125 files passed, 1 skipped | [Log](validation/full-vitest-final.txt) |
| Build Quest focused tests | 29 passed | [Log](validation/identity-tests.txt) |
| Full TypeScript | Passed | [Log](validation/full-typecheck-final.txt) |
| Build Quest scoped TypeScript | Passed; additional evidence, not a replacement full gate | [Log](validation/focused-typecheck-final.txt) |
| Full lint / focused lint | Passed | [Full](validation/full-lint-final.txt), [Focused](validation/focused-lint-final.txt) |
| Production build | Passed in credential-free snapshot with required uncommitted baseline and final Build Quest code | [Log](validation/production-build-final.txt) |
| Production direct-route protection | Both new routes return 404; game does not mount | [Results](validation/production-gates.json) |
| Nine stages by real mouse | Passed in 2 native Chrome windows with normal background throttling | [Results](validation/q4-windows.json) |
| Nine stages by sensor transport simulation | Passed, plus loss/pickup, pause/resume, keyboard and simulated Gamepad | [Results](validation/q3-browser.json) |
| Synchronization/reload/cleanup/library navigation | Passed | [Results](validation/q4-browser.json) |
| Browser errors / Firebase requests in final passing runs | 0 / 0 | Browser JSON above |
| Pre-existing-file protection | 1,120 original files retain identical content hashes | [Scope check](validation/existing-files-check.json) |

Earlier concurrent Runner Quest lint/type errors and a lint file-deletion race were observed while that other game was changing. Their owner resolved them; final full checks pass. Build Quest did not edit that code or weaken tests. The final build uses an isolated snapshot to avoid writing generated artifacts into the shared working tree.

Fixes discovered by browser validation included a development authority-lock race, a React effect-remount WebGL context-loss issue, a keyboard/controller pickup race, and early native-history mutation before Next router initialization. Session URL creation now uses the documented server redirect and awaited search parameters. Installed Next.js routing, client-component and redirect guides were read before those changes.

## Measured performance

Final two-window stage samples: **57.3–60.0 FPS**, with startup/geometry warmup visible in the first stages. Stable high-quality Display sample: **59.99 FPS**, mean frame time **16.67 ms**, p95 **17.80 ms**, maximum **18.70 ms** over the rolling sample. Control also remained near 60 FPS.

High quality: **58 draw calls, 26,426 triangles, 34 geometries, 5 textures** in the measured shape scene. Low quality: **32 calls, 13,411 triangles, 32 geometries, 3 textures**, approximately **60.06 FPS**. The fallback disables shadows and reduces antialiasing/pixel ratio. Other stages have different counts; per-stage JSON records them.

Pointer-request to next matching Display-frame estimate: **122 samples**, median **59 ms**, p95 **208 ms**, max **278 ms**. This automation measurement includes transport/React frame scheduling and scenario transitions; it is not physical WT901, projector or clinical latency.

Repeated stage swaps returned to the same geometry counts (33/34 in the tested stages) and stable texture count, with no increasing resource trend. Navigation closed every opened Build Quest channel (2/2 across development effect remounts). RAF, ResizeObserver, keyboard subscriptions, channels, geometry, materials, environment, wood texture, shadow targets and renderer are disposed on cleanup. No hardware-independent 60-FPS guarantee is made.

## Actual gameplay evidence

- [Shape matching](screenshots/final-shape-matching.png)
- [Three shapes](screenshots/final-three-shapes-complete.png), [Four shapes](screenshots/final-four-shapes-complete.png)
- [House](screenshots/final-house-complete.png)
- [Car](screenshots/final-car-complete.png)
- [Robot](screenshots/final-robot-complete.png)
- [Tower](screenshots/final-tower-complete.png)
- [Bridge](screenshots/final-bridge-complete.png)
- [Castle](screenshots/final-castle-complete.png)
- [Final summary](screenshots/final-summary-windows.png)
- [Real gameplay video](video/buildquest-gameplay.webm)

Screenshots and video are real browser rendering. Earlier Q1/Q2 evidence and raw video captures are retained. The initial Q1 screenshot used software WebGL; final runs use hardware Chrome rendering. Next's native development indicator may appear in screenshots; no game developer diagnostics are shown on the child HUD.

## Files and dependencies

20 new source files; no pre-existing file edits. Exact list: [change manifest](validation/change-manifest.json).

- `lib/buildquest3d/`: stage manifest/projection, pure simulation, Three.js renderer, RIGHT_HAND/controller/keyboard adapters, session protocol/runtime, registration proposal, isolated launcher and 4 focused test files.
- `components/control/buildquest3d/`: therapist screen and ready library thumbnail.
- `components/display/buildquest3d/`: child screen, lifecycle-managed canvas and scoped styles.
- `app/control/build-quest-3d/page.tsx`, `app/display/build-quest-3d/page.tsx`: guarded explicit routes.
- `docs/buildquest3d/`: Q1–Q4 reports, integration conflict/proposal, README, validation scripts/logs/JSON, screenshots and video.

Existing installed dependencies: Three.js 0.186.1 (MIT), @types/three 0.186.0 (MIT), React 19.2.8 (MIT), Next.js 16.3.1 (MIT). Vitest/TypeScript/ESLint and existing Playwright cache were used for validation. No dependency/package-lock change or package installation. No externally sourced model, texture, music or AI image/video assets. Procedural art is original; inherited project fonts remain unchanged.

## Local integration and production requirements

Routes: `/control/build-quest-3d` and `/display/build-quest-3d?session=...`. [Local review instructions](README.md) include the live isolated preview and `lib/buildquest3d/run-local.sh`, which preserves current uncommitted source/assets while excluding credentials/generated output and clearing cloud credentials.

The actual registry, thumbnail map, production Display registry and Control layout were already dirty. No concurrent work was overwritten. The inherited Control layout's cloud pointer publisher excludes Space Pilot only; extending its generic boundary safely is required before using Build Quest on a cloud-configured app. Therefore both new routes are development/local-only and return 404 when the database URL is configured. Staff authentication remains inherited and unchanged.

[The shared integration conflict](LOCAL_INTEGRATION_CONFLICT.md) names the affected files and provides a concrete registration/boundary proposal. The metadata and thumbnail are already implemented. The task explicitly allows this shared-file-conflict deferral; it is the remaining local-library integration step, not a completed registration. No production Firebase rules, schema or patient history were changed. Persistent patient history would need a separate approved proposal.

Before production: resolve shared ownership and integrate the registry/generic local boundary; validate physical WT901/reconnect/recenter behavior, actual handheld compatibility, real projector/laptop performance, therapist/child accessibility and usability; rerun final gates on an agreed stable snapshot; approve any persistence/release work explicitly. No commit, stash, reset, clean, push or deployment was performed.

Rollback: set `NEXT_PUBLIC_BUILD_QUEST_3D_ENABLED=false` and restart the local server. Both new direct routes become unavailable; existing games are unaffected. Production already excludes these routes regardless of flag.
