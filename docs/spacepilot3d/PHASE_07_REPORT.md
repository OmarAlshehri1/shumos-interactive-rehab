# Phase 07 — Software validation

Status: **COMPLETE for experimental software validation**. Physical WT901, projector and child/therapist usability sign-off remain pending. No production readiness or clinical effectiveness is claimed.

## Automated checks

| Check | Result |
|---|---|
| Full Vitest suite | **105 suites / 1,337 tests passed**, no failures |
| TypeScript | `npx tsc --noEmit` passed |
| Lint | `npm run lint` passed |
| Production build | `npm run build` passed |
| Model integrity | Self-contained GLB, valid binary lengths/buffer views/indexed meshes/embedded PNG, no external dependencies |
| GPU lifecycle tests | Disposal is idempotent; fetch aborted; late model disposed; failed model cannot become ready; shaders warm before readiness |
| Protected-source audit | See final report manifest; gameplay, collisions, missions, sensor adapter, BLE/calibration, production rules/auth/registry unchanged from Phase 05 baseline |

Session tests cover stale run/revision/epoch rejection, duplicate accepted events, old-owner handshakes, reordered ACK readiness, monotonic clock discontinuities, scheduler/input/display loss, authority-only scoring, source changes, replacement subscribers, all missions, summaries and local storage recovery. The runtime regression reproduces ACK receipt after the RAF frame-start timestamp. Existing keyboard and RIGHT_HAND adapter tests remain unchanged and pass.

## Actually executed browser scenarios

Native Chrome 155 on macOS, independent OS windows, experimental Control and Display running together:

- Full HIGH, LOW and MEDIUM three-mission runs after the graphics upgrade. Each collected **11 stars / 1,100 points**, resolved 18 encounters and recorded **two deliberate collisions**. Control/Display totals matched after every encounter. Tier 2 and tier 3 thresholds were reached.
- Keyboard steering, first collection, restart, stale old-run messages, End and summary; sensor-simulated RIGHT_HAND movement over the unchanged local pointer channel.
- Pause/resume; Display reload after collection without score/effect duplication; Control reload creates a new session and reports the prior summary/interruption.
- Sensor stream stopped during LOW/MEDIUM play; authority suspended, results stayed frozen, reconnection required alignment and explicit Resume.
- Duplicate transport deliveries, secondary Display unable to steer, subscriber close and Control close.
- Foreground/unfocused visible Control, actual minimize/restore of both windows, inbound/outbound message suppression and a deliberately blocked Control main thread. No catch-up scoring after interruptions.
- Duplicate-room Control ownership queues behind a Web Lock, transfers after close, and five rapid development reloads leave exactly one owner. StrictMode cleanup does not create a duplicate runtime.
- Real `WEBGL_lose_context` extension: Control suspended, results froze, Display showed reload, reload plus explicit Resume recovered.
- Model HTTP 404: visible error, Resume disabled, removing the fault and reloading restored readiness.
- Three repeated Display reloads returned stable resource counts; repeated session restarts did not add scene resources.
- No unexpected Firebase requests or page/shader errors in the final integrated performance/recovery run. Gameplay browser runs used the existing local demo mode via a process-only environment override; normal configured staff authentication was separately verified and restored.

Browser execution does not constitute physical BLE testing. The CDP freeze command alone was unreliable in this environment; combined freeze/outbound-loss coverage is reported as link-loss coverage, not as a proven standalone browser freeze. Full event-order permutations, negative-clock inputs and malformed protocol values are unit tests, not all individually replayed in real windows.

## Integrated performance measurements

Apple M1 via ANGLE Metal, Chrome 155, 1376×768 CSS viewport, emulated device pixel ratio 2, both windows visible. Playwright focus emulation and its background-throttling override flags were disabled. Actual `document.hasFocus()` values were asserted: Control false / Display true, then Control true / Display false. Authority remained running in every sample.

Each row is the latest **240 actual frame intervals** after 6–6.5 seconds of settling. These are real paired-session samples, not a standalone renderer benchmark or a guarantee for other hardware.

| Quality | Focus arrangement | Render DPR | FPS | Mean ms | p95 ms | Maximum ms | Draw calls |
|---|---|---:|---:|---:|---:|---:|---:|
| low | Display (Control unfocused) | 0.80 | 60.00 | 16.67 | 16.80 | 17.60 | 33 |
| low | Control (Display unfocused) | 0.80 | 60.00 | 16.67 | 16.80 | 17.50 | 34 |
| medium | Display (Control unfocused) | 1.25 | 60.00 | 16.67 | 17.40 | 17.70 | 43 |
| medium | Control (Display unfocused) | 1.25 | 59.99 | 16.67 | 17.60 | 17.80 | 44 |
| high | Display (Control unfocused) | 1.75 | 60.00 | 16.67 | 17.10 | 17.70 | 43 |
| high | Control (Display unfocused) | 1.75 | 60.00 | 16.67 | 17.40 | 17.70 | 44 |

Steady samples used 13 geometries, 4 textures and 10 compiled programs; approximately 9,868–11,360 triangles were drawn in the sampled first-mission views. Counts depend on visible encounters and effects. GPU memory **bytes** are not exposed by this browser API; geometry/texture/program counts are reported, not invented byte measurements. Fiery/collection peak draw-call counts were not separately benchmarked.

Model fetch/parse/shader-ready duration in the final run: **229.0 ms**. Three subsequent Display reloads measured 152.4–157.7 ms; these are local warm-environment measurements. Their first-second maximum frame intervals were 42.0–49.4 ms, distinct from steady-state performance. Each reload returned 12 active geometries / 4 textures / 10 programs in the paused view. No growing count was observed; this short run is not a long-duration leak proof.

Transport instrumentation used `performance.timeOrigin + performance.now()` in both same-machine windows, independently of safety logic:

- Control frame delivery: 992 samples, mean **1.09 ms**, p95 **1.50 ms**, maximum **91.40 ms**.
- Display keyboard input delivery: 875 samples, mean **0.61 ms**, p95 **0.60 ms**, maximum **36.90 ms**.

These are message delivery times, not end-to-end hand-to-projector latency; frame scheduling, sampling, BLE and physical projection add latency. The adaptive resolution threshold was not forced on this normally performing M1; lower quality settings were actually exercised. The earlier software-renderer trial paused safely and is not a passing performance result.

## Failures found and resolution

- False lease expiry from mixed RAF/message timestamps: callback-entry clocks now consistent; regression and full browser sessions pass.
- Premature renderer readiness: acknowledgment follows completed rendering; model/shader warmup precedes readiness.
- Initial visual issues: bulky rejected hull, background plane clipping, noisy bright rocks; corrected in the final scene.
- Test harness issues: ambiguous Next route-announcer alert selector, initial emulated focus, and first focus-transition ambiguity. Selectors/focus setup were corrected, assertions retained, final run passed. Failed focus samples were not used as final evidence.
- Sandbox-only production build stall: the same required build passed with local subprocess access.
- One medium mission-3 screenshot omitted static composited HUD/planet content. The LOW mission-3 capture is complete and is the representative image; the anomalous capture is retained. Authoritative results and DOM assertions matched. Recheck visual stability on the actual projector/browser during physical validation.

## Screenshots and visual review

- [Tier 1 with collectible](screenshots/phase07-medium-m1-encounter1.png)
- [Rock avoidance](screenshots/phase07-low-m1-encounter3.png)
- [Tier 2, paused at three stars](screenshots/phase07-tier2.png)
- [Tier 3 with fiery asteroid](screenshots/phase07-low-m3-encounter2.png)
- [Full session summary](screenshots/phase06-summary.png)
- [Phase 05 placeholder baseline](screenshots/phase05-display.png)

All are unretouched actual browser captures. The detailed reference comparison is in [Phase 06](PHASE_06_REPORT.md). The licensed model and live materials/effects substantially improve the prototype, while the low-poly hull, procedural planet/rocks and sprite exhaust still differ visibly from the reference's realism.

## Remaining validation and production assessment

Use [PHYSICAL_VALIDATION_CHECKLIST.md](PHYSICAL_VALIDATION_CHECKLIST.md) for real RIGHT_HAND connection, mapping, diagonals/small movements, held positions, recenter, dropout/reconnection, responsiveness, projector quality, long-session stability and therapist workflow. None is claimed as physically passed.

The implementation remains a same-browser, same-origin, development-only local experiment. It is not registered as a production game, does not save clinical history and does not establish multi-device/cloud authority. Built Display returns HTTP 404. Built Control streams not-found content with HTTP 200 under the existing layout; its response contains no experimental Control component or Start button. Existing authentication and layout behavior were preserved.

No critical software failure remains in the executed checks. No commit, push or deployment occurred. Phase 08 is not started.
