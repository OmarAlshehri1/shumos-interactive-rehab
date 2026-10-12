# Phase 08 — Arabic presentation and experimental visual refinement

Validation date: **9 October 2026**. **Software refinement and validation passed.** Final results are recorded below. Physical WT901/projector testing and production integration remain separate, unapproved work.

## What changed

The existing licensed spacecraft and real-time Three.js scene were refined in place. The ship has a larger lower-center presence, a fixed oblique chase angle, shorter blue metallic engine housings, stronger environment reflections, and longer bounded exhaust. The camera follows accepted positions directly with fixed offsets; it adds no steering filter, camera shake, predictive movement, or additional authority. Existing tier 2 engine collars and tier 3 wing extensions/fins are easier to distinguish at the larger scale.

The sky now has three star layers and a more visible, restrained procedural nebula. Planet surface variation has finer detail and slow rotation. Rocky asteroids have denser irregular geometry and revised surface grain/normal shading; fiery asteroids retain a solid rock silhouette with brighter emissive cracks and pooled flame sprites. Five-point gold stars use revised metallic shading and a restrained halo. Four existing particle pools still handle accepted collection/impact events. No gameplay screenshots, reference images, static gameplay background, volumetric renderer, music, or new external asset package were introduced.

The child Display uses Arabic, RTL layout, the existing bundled Arabic font, larger typography, an uncluttered mission heading, stars/points/tier and progress. Newly accepted collection, collision and upgrade outcomes produce brief Arabic messages. Collision feedback says **لا بأس، نكمل الرحلة**. Ready, pause, connection loss, mission completion, session completion and graphics failure all have Arabic presentation. Reconnect/reload does not announce historical results as new rewards. The alignment guide appears only when needed for sensor pickup or a stopped session, rather than during normal tracking.

Technical IDs, raw lifecycle tokens and the always-visible graphics selector have been removed from the child presentation. The Next development launcher is hidden only on this experimental child screen. Machine-readable test/telemetry attributes remain available to validation tools.

The therapist interface retains the existing layout and actions with Arabic labels for difficulty, input, start/pause/resume, restart/end, mission progression, hand alignment, statistics and summaries. A cancellable three-second **therapist-local** preparation countdown precedes the existing Start command. Simulation time remains zero during this countdown. It cancels if readiness/revision/run changes, Control becomes hidden, the therapist cancels, or the component unmounts. The existing revision/run guards and readiness checks still decide whether Start is accepted. Display waits for the therapist: there is deliberately no second independently synchronized countdown or new session message.

## Comfort and graphics settings

Normal child link: **فتح شاشة الطفل**. To prepare graphics/comfort settings, expand **إعدادات العرض والراحة** and use **فتح العرض مع إعدادات المعالج**. This adds `?settings=1` before the existing room hash and exposes a collapsible Arabic panel. Choose economical/balanced/high quality, or enable **تقليل المؤثرات والحركة**, then hide the panel. Close unused Display windows; if multiple remain, choose the intended primary while stopped.

Reduced effects automatically follow `prefers-reduced-motion` and can be overridden in that Display instance. They remove exhaust trails, flame particles and expanding outcome particles, and stop decorative planet/encounter rotation. Static engine glow, golden star silhouettes, fiery crack shading, Arabic feedback and accepted ship movement remain. There is no rapid flashing, shake or sound. Quality and reduced-effects choices are local to a Display instance; manual choices are not persisted across reloads. Quality presets retain DPR caps 0.8 / 1.25 / 1.75 and adaptive resolution under sustained slow frames.

## Preserved boundaries

Control remains the sole owner of the existing `GameplaySimulation`. No gameplay/collision/mission/sensor/keyboard mapping, BLE/calibration/hand-assignment, session-contract/transport/authority/replica/runtime/storage, production route, game registry, Firebase rule/schema, patient-history, authentication or staff-authorization source was changed in Phase 08. Collision proxies and movement bounds are unchanged. GPU quality and accessibility settings cannot change collision outcomes, scoring, or sensor sampling.

The original commercially usable Quaternius Bob GLB and its embedded texture are unchanged; provenance remains in [ASSET_LICENSES.md](ASSET_LICENSES.md). The reference image was used for comparison only. All existing uncommitted work was preserved. No dependency was added, and nothing was committed, pushed, registered or deployed.

A SHA-256 comparison against the working tree at the start of Phase 08 is saved in `validation/phase08-change-manifest.json`. This is a comparison with the user's actual starting files, including uncommitted work, rather than an assumption that HEAD was clean.

## Files

Modified implementation:

- `lib/spacepilot3d/graphics.ts` — camera, model presentation, materials, environment, reduced effects.
- `lib/spacepilot3d/renderer.ts` — local reduced-effects setter and telemetry flag.
- `components/display/spacepilot3d/SpacePilot3DSessionDisplay.tsx` — Arabic child presentation, accepted-event feedback, settings and comfort preferences.
- `components/display/spacepilot3d/prototype.module.css` — isolated RTL child layout, responsive text, restrained fades and reduced-motion styles.
- `components/control/spacepilot3d/SpacePilot3DControl.tsx` — Arabic therapist presentation and guarded local countdown.
- `lib/spacepilot3d/__tests__/graphicsLifecycle.test.ts` — retained lifecycle checks plus reduced-effects and movement-envelope camera checks.

Created `lib/spacepilot3d/arabic.ts` for presentation-only mission/lifecycle/sensor/suspension translations and number formatting. Updated [PHYSICAL_VALIDATION_CHECKLIST.md](PHYSICAL_VALIDATION_CHECKLIST.md). Added this report, Phase 08 browser scripts, logs, measurement JSON and unretouched screenshots under `validation/` and `screenshots/`. Older phase evidence is retained.

## Software validation

| Required check | Result / evidence |
|---|---|
| TypeScript | `npx tsc --noEmit` passed; [log](validation/phase08-typecheck.txt) |
| Lint | `npm run lint` passed without warnings; [log](validation/phase08-lint.txt). Newly added production/auth evidence scripts also passed targeted ESLint. |
| Full Vitest | **105 suites / 1,339 tests passed**; [log](validation/phase08-tests.txt). Existing tests retained; two additional graphics tests cover reduced-effects preservation and camera visibility across movement bounds. |
| Production build | `npm run build` passed; [log](validation/phase08-build.txt) |
| Full browser workflow | Passed; [script](validation/phase08-browser.mjs), [log](validation/phase08-browser.txt) |
| Every difficulty | LOW, MEDIUM and HIGH: all three missions, **11 stars / 1,100 points / 18 resolved encounters / 2 intentional impacts / tier 3**, with matching Control/Display totals; [script](validation/phase08-difficulties.mjs), [log](validation/phase08-difficulties.txt) |
| Final visual session | Fresh MEDIUM full session plus a separate mid-mission impact run passed; settled messages, tier views, child completion and summary captured; [script](validation/phase08-visual-review.mjs), [log](validation/phase08-visual-review.txt) |
| Quality/accessibility/recovery | All quality presets, real focus arrangements, reduced-motion preference and manual override, actual WebGL loss, model 404, explicit reload/resume and three remounts passed; [log](validation/phase08-performance.txt) |
| Production exclusion | Display HTTP **404**; Control HTTP **200 with streamed `NEXT_HTTP_ERROR_FALLBACK;404`**, as before. Neither response includes the experimental component or Start label. [Checks](validation/phase08-production.json) |
| Configured staff gate | Normal development configuration restored on port 3000. Signed-out Control shows **تسجيل الدخول** and no experimental controls. No credentials entered or account changed. [Checks](validation/phase08-auth-gate.json) |
| Protected source | Exactly seven existing files changed (six implementation/test files and the physical checklist); **677 other baseline files unchanged**, zero unexpected modifications/deletions. [Manifest](validation/phase08-change-manifest.json) |

Executed browser coverage includes actual keyboard steering, simulated RIGHT_HAND over the existing pointer channel, collection, rocky/fiery impacts, both upgrades, all missions/difficulties, pause/resume, restart, End/summary, Control/Display reload, duplicate and old-run delivery, multiple Displays, sensor dropout/reconnection, Control close, message loss, blocked Control scheduling and actual window minimize/restore. Results remain frozen during interruptions; recovery requires the existing explicit therapist actions. Countdown cancellation and hidden-Control cancellation were also exercised while simulation time remained zero. The mid-mission collision capture verifies the gentle Arabic feedback independently of mission-completion messages.

No page/shader errors or Firebase requests were observed in the completed experimental browser checks. The CDP freeze command combined with outbound-message suppression is recorded as **link-loss coverage**, not independent proof of OS freezing; actual minimize/restore was tested separately. GPU disposal/late-fetch handling remains covered by unit tests, and real repeated Display reloads returned stable resource counts. No sensor freshness threshold or safety check was relaxed.

The full browser workflow preceded the final rock-albedo adjustment; the subsequent all-difficulty run exercised that final material. A final presentation-only adjustment hid the sensor alignment guide after session completion; the final visual session, performance/recovery run, full unit suite, typecheck, lint and build include it.

Browser gameplay uses the application's existing local demo configuration through a process-only empty Firebase API key on the test development server. No authentication source or `.env.local` was changed, and no existing account was activated or granted privileges. Network observation checks experimental sessions for Firebase requests. Configured authentication is checked separately; simulated tests are not evidence of live staff provisioning or physical BLE operation.

## Integrated performance

Apple M1 / ANGLE Metal, Chrome 155, 1376 × 768 CSS pixels, emulated device pixel ratio 2. Playwright focus emulation and background-throttling override flags were disabled. Actual `document.hasFocus()` values were asserted in both windows. Authority remained running in every steady sample. Each row is the latest 240 measured frame intervals after 6–6.5 seconds of settling.

| Quality | Focus | DPR | FPS | Mean ms | p95 ms | Max ms | Draw calls |
|---|---|---:|---:|---:|---:|---:|---:|
| low | Display (Control unfocused) | 0.80 | 59.97 | 16.67 | 18.20 | 18.70 | 30 |
| low | Control (Display unfocused) | 0.80 | 60.00 | 16.67 | 18.10 | 18.70 | 30 |
| medium | Display (Control unfocused) | 1.25 | 60.00 | 16.67 | 18.30 | 18.90 | 40 |
| medium | Control (Display unfocused) | 1.25 | 60.01 | 16.66 | 17.90 | 18.60 | 39 |
| high | Display (Control unfocused) | 1.75 | 60.00 | 16.67 | 18.40 | 19.00 | 40 |
| high | Control (Display unfocused) | 1.75 | 60.00 | 16.67 | 18.10 | 18.60 | 39 |

Steady first-mission samples used **14 geometries, 4 textures and 10 programs**, with 7,984–9,970 triangles. Three Display reloads returned **13 geometries / 4 textures / 10 programs** in the paused view. Initial model fetch/parse/shader readiness measured **245.3 ms**; warm reloads measured **158.4–165.2 ms**. Their initial rolling windows included **42.0–42.3 ms** maximum frame intervals, distinct from settled FPS. No steadily growing resource count was observed across those reloads or the preset-test restarts.

Full gameplay telemetry additionally sampled all 18 outcomes for LOW, MEDIUM and HIGH at DPR 1, including fiery encounters, collection effects and tier 3. Across those snapshots, rolling FPS ranged **59.02–60.01**, p95 was at most **17.6 ms**, and the largest included frame interval was **66.7 ms**. Draw-call snapshots ranged **39–59**. Geometry counts grew as additional pooled variants/upgrades were first rendered, reaching **24**, while textures stayed at **4**. These are periodic rolling samples, not exhaustive per-frame peak capture. Raw evidence: [phase08-gameplay-metrics.json](validation/phase08-gameplay-metrics.json).

Reduced effects applied automatically from an emulated device preference and could be manually disabled. Its sampled paused scene used **24 draw calls**, retaining 4 textures and all static hazard cues. The accessibility preference changes presentation only; it was not used to make the main performance results pass.

Same-machine message-delivery instrumentation: Control frames **1.55 ms mean / 2.40 ms p95 / 99.10 ms maximum** across 1,143 samples; keyboard input **0.53 ms mean / 0.90 ms p95 / 9.40 ms maximum** across 889 samples. These inclusive samples include startup/transition scheduling and are not physical hand-to-screen latency. The session's monotonic local safety clocks and 250 ms freshness budget are unchanged.

Raw integrated evidence: [phase08-performance.json](validation/phase08-performance.json), [script](validation/phase08-performance.mjs), [log](validation/phase08-performance.txt).

Measurements are taken with Control and Display in separate Chrome OS windows on the same machine. They are not a standalone renderer benchmark. GPU memory byte usage is not exposed by Three.js renderer telemetry; resource counts are reported as counts, not invented byte measurements. Local load times are warm-environment observations, not cold-network guarantees. Short restart/reload tests do not prove absence of a long-duration leak. Actual WT901-to-projector latency, Windows performance and projector resolution/frame pacing remain unmeasured.

## Actual gameplay screenshots

| Requested view | Unretouched capture |
|---|---|
| Start screen | [phase08-start.png](screenshots/phase08-start.png) |
| Mission 1 gameplay | [phase08-medium-m1-encounter1.png](screenshots/phase08-medium-m1-encounter1.png) |
| Rocky asteroid / open avoidance path | [phase08-low-m1-encounter3.png](screenshots/phase08-low-m1-encounter3.png) |
| Fiery asteroid | [phase08-medium-m3-encounter2.png](screenshots/phase08-medium-m3-encounter2.png) |
| Star collection | [phase08-collection.png](screenshots/phase08-collection.png) |
| Tier 2 / upgrade feedback | [phase08-tier2.png](screenshots/phase08-tier2.png) |
| Tier 3 spacecraft | [phase08-tier3.png](screenshots/phase08-tier3.png) |
| Mission completion | [phase08-mission-complete.png](screenshots/phase08-mission-complete.png) |
| Therapist Control | [phase08-control-setup.png](screenshots/phase08-control-setup.png), [phase08-control.png](screenshots/phase08-control.png) |
| Final summary | [phase08-summary.png](screenshots/phase08-summary.png) |
| Child session completion | [phase08-flight-complete.png](screenshots/phase08-flight-complete.png) |
| Gentle collision feedback | [phase08-collision-feedback.png](screenshots/phase08-collision-feedback.png) |

All paths are relative to this report; their absolute directory is `/Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/docs/spacepilot3d/screenshots/`.

These are actual browser captures of real-time 3D meshes, shaders and pooled effects. Nothing was retouched or generated from the reference. A fresh complete MEDIUM session was used for settled message and summary captures after inspecting earlier images. Some earlier captures caught fade-in messages before full opacity or included blank space outside the composited viewport; the representative index uses settled captures and a directly captured summary region.

## Reference comparison and gameplay-quality review

| Aspect | Improvement over the supplied current screenshot | Remaining difference from `IMG_1448.JPG` |
|---|---|---|
| Composition | Larger spacecraft, fixed oblique behind/above view, more visible cockpit/wings, clear approach space | Reference has an art-directed hero pose. The gameplay camera must remain predictable over the movement range. |
| Hull/materials | Licensed textured hull, shorter blue engine pods, adjusted metal/roughness and reflection balance | Bob is still a 938-triangle stylized source with a diffuse texture; its narrow nose/rear fins differ from the reference's broad aerodynamic hull. A purpose-built medium-detail spacecraft with authored normal/roughness maps is the main remaining asset work. |
| Engines/tiers | Blue glow, longer exhaust; tier 2 collars and tier 3 wings/fins are distinct | Exhaust uses bounded additive sprites, not continuous volumetric plumes. Engine geometry and paneling remain simpler. |
| Environment | Layered stars, restrained visible navy cloud structure, finer lit planet with subtle motion | Planet and nebula remain procedural; the reference has more natural cloud and surface detail. An authored planetary material could improve this without increasing sensor work. |
| Rocks/fire | More irregular geometry, surface grain, stronger crack distinction, pooled flame motion | Still procedural stylized rocks, with less convincing cratering and large-scale surface structure than the reference. Authored rock meshes and normal maps would help. |
| Golden stars | Recognizable five-point 3D silhouette, gold shading and glow; accepted collection feedback | Specular detail/glow are simpler than the reference. Legibility was prioritized over stronger bloom. |
| Interface | Arabic RTL, clear hierarchy, minimal child HUD, gentle rewards/completion; therapist-only settings | Child/therapist usability and projection readability still require observation with the intended users. |

The software visual review checked stars at approach distance, growing/rotating asteroid silhouettes, open avoidance routes, the three tiers, readable Arabic, safe stopped states, and operation without virtual directional controls. Browser sessions used both keyboard and the existing normalized RIGHT_HAND channel. This is an engineering gameplay review, not evidence of child enjoyment or clinical effectiveness. The result is noticeably refined, but **does not perfectly match the reference's visual realism**. More photographic assets, volumetric effects or denser geometry were not substituted for responsive input and reliable sessions.

## Exact local launch steps

1. From the repository, run `npm run dev -- --hostname 127.0.0.1` with the normal project configuration.
2. Open `http://127.0.0.1:3000/control/space-pilot-3d-prototype`. Sign in with an already authorized active staff account. The existing authorization process is unchanged; creating a Firebase Authentication account alone does not provision staff access.
3. For physical testing, connect RIGHT_HAND through the existing sensor setup workflow first, then navigate to the prototype in the same Control tab. Otherwise select **محاكاة بلوحة المفاتيح** for a software demonstration.
4. Choose **الصعوبة**. Start supervised physical work at **سهل · رحلة هادئة**. Choose **طريقة التحكم**. The therapist remains responsible for appropriate difficulty and movement requirements.
5. Click **فتح شاشة الطفل** and move that window to the second screen/projector. Use the same browser profile and origin; keep both windows visible. Do not open the bare Display URL without its generated room hash.
6. For the sensor, align the gold and blue markers before starting/resuming. For keyboard mode, click the Display canvas and use arrows or W/A/S/D.
7. In Control, choose **بدء الجلسة** and allow the preparation countdown. Use **إيقاف مؤقت**, **متابعة**, **إعادة الرحلة**, **بدء المهمة…**, and **إنهاء الجلسة** as needed. Input loss freezes play and requires alignment/readiness plus explicit Resume.
8. Review **ملخص الجلسة** in Control. This tab-local experimental summary is not saved to patient history. Reloading Control creates a new ready session and shows the prior summary; it does not resume the old simulation.

Browser reproduction scripts are under `validation/phase08-*.mjs`. They need an installed Playwright package (or `PLAYWRIGHT_MODULE` pointing to its `index.mjs`), the local Chrome executable path recorded in the scripts, and the existing demo-mode test development server. They never simulate authority by assigning score/outcome objects; the simulated sensor publishes normalized input through the existing channel.

## Physical validation and production work still required

All physical checks remain **NOT EXECUTED**. Use [PHYSICAL_VALIDATION_CHECKLIST.md](PHYSICAL_VALIDATION_CHECKLIST.md) for actual RIGHT_HAND connection/directions, small movements, diagonals, held position, recenter, dropout/reconnection, pause/resume, full movement-range framing, projector legibility, target-machine frame pacing, therapist workflow and at least 30 minutes of repeated sessions. Test normal/reduced effects and retain observations about comfort and usability. No clinical efficacy is claimed.

Production integration still requires explicit approval, successful hardware/user review, approved game registration, a reviewed persistence/history adapter, cross-device ownership/security design if needed, security-rule/emulator testing, and deployment/release review. This prototype still relies on same-browser BroadcastChannel/Web Locks and stores summaries only in the Control tab. Production build route exclusion and existing staff authorization remain in place. No other game or further phase was started.

**PHASE 08 SOFTWARE REFINEMENT COMPLETE — Awaiting physical sensor/projector testing and user approval for production integration.**
