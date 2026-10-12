# Balloon Quest 3D — validation evidence

Everything here was produced by driving **real Chrome windows over the DevTools protocol** against the development server. Nothing is mocked or illustrated. Scripts are included so every run can be repeated.

Requirements: Chrome, Node ≥ 22 (global `WebSocket`/`fetch`), the Next dev server on `http://localhost:3000`. Run `node <script> <outputDir>`.

| Script | What it does | Result file |
|---|---|---|
| `cdplib.mjs` | Minimal DevTools-protocol helper (launch, tabs, eval, screenshot, input). | – |
| `e2e.mjs` | Opens a Display window and a Control window. Proves the drawn balloon equals the engine balloon (contact just outside / just inside), then plays a complete **nine-stage** session with a bot that moves a *simulated RIGHT_HAND* pointer through the real hub, including occasional wrong-colour touches. | `results/e2e-results.json`, `results/e2e-stagelog.json` |
| `e2e2.mjs` | Workflow suite: Control/Display positional agreement, pause/resume, restart, skip, end, floor layout, reduced motion, simulated left hand / both hands / feet / handheld, **real keyboard key events**, input loss and recovery, Display closed/reopened, Display reload, Control reload, second Control window, external-network observation. | `results/e2e2-results.json` |
| `e2e3.mjs` | Authoritative-freeze checks (inline transforms must be bit-identical during pause and input loss) and the wrong-colour cue in both windows. | `results/e2e3-results.json` |
| `perf.mjs` | 4-minute Advanced soak with both windows visible: frame times (rAF), pointer→pop latency measured with `MutationObserver` + `performance.timeOrigin` clocks on both pages, DOM size, heap. | `results/perf-report.json` |
| `soak.mjs` | Same as `perf.mjs` with a forced garbage collection before every sample, for leak detection. | `results/soak-report.json` |
| `video.mjs` | Records the child Display with the browser screencast while a bot plays from Medium. | `video/` |

## Honest notes
* `e2e2.mjs` check *"a simulated source that is not enabled for the mode cannot start/score"* is **not meaningful** (the simulator pad keeps every previously used simulated source streaming, so the mode legitimately had live input). It passes trivially; the real coverage is the unit test `ignores pointers from sources that are not enabled for this mode` and `InputHub.rejections().disabled`.
* `e2e2.mjs` check *"nothing moves while input is lost"* **failed in its first run** because it compared `getBoundingClientRect()` values, which include the cosmetic CSS sway rotation. `e2e3.mjs` replaces it by comparing the authoritative inline `translateY` transforms, which are bit-identical (PASS). Both outcomes are recorded.
* The measurements come from headless Chrome (software rendering) on the development build with a simulated pointer. They are **not** measurements of a physical projector, a real sensor, or a production build.
* `e2e.mjs` run 1 (not kept) exposed the static-balloon placement defect described in `PHASE_B3_REPORT.md`; the results here are from the run after the fix.
