# Runner Quest 3D — Phase R5 report (full testing & local integration)

**Status: COMPLETE for software validation. Library integration: TESTED, application to the shared files DEFERRED (documented blocker). Hardware/projector: NOT TESTED.**

## Automated validation (final tree, run at the end)
| Gate | Result |
|---|---|
| `tsc --noEmit` (whole repo) | **0 errors** (`results/tsc-full.txt` empty) |
| `eslint .` (whole repo, includes `docs/`) | **0 errors, 0 warnings** after the last fix |
| Runner Quest tests | **87 tests / 5 files** (engine, stages, input, runtime, integration) |
| Full repository `vitest run` | **1667 passed, 4 skipped (pre-existing emulator tests), 126 files passed, 1 skipped**; no existing test modified (`results/vitest-full.txt`) |
| Production build (`next build`, scratch copy incl. integration patch) | **succeeds**, flag on and flag off |

## Browser validation (real Chrome 155, macOS, Apple M1 GPU, two windows)
| Suite | Result |
|---|---|
| `e2e-full.mjs`: **complete nine-stage session**, keyboard, 59 real key events, Control + Display | **9/9 stages, 88 stars, 0 lifecycle mismatches, 0 errors, 7.2 min** |
| `e2e-r4.mjs`: workflow suite (sources, isolation, loss/recovery, pause/restart/skip/advance/end, reduced motion, Display reload/close/reopen, hidden window, 2nd Control, Control reload, idle child, therapist assist) | **47/47** |
| `prod.mjs`: **production build**, library card → Control, Display route | **9/9** |
| Network audit during the production run | all requests to `127.0.0.1`; **none to Firebase/Google**; the new modules also contain no Firebase/realtime/patient-history imports (unit test) |

## Performance (Control + Display together, 1920×1080, bot-played Advanced stage 3, dev build)
| Preset | Avg FPS | p95 / p99 / max frame | >33 ms frames | Draw calls | Triangles | Geometries / textures (GPU) |
|---|---|---|---|---|---|---|
| high | 60.0 | 16.7 / 16.8 / 16.8 ms | 0 | 244 | 78.8k | 260 / 14 |
| medium | 60.0 | 16.8 / 16.8 / 16.8 ms | 0 | 244 | 69.8k | 261 / 14 |
| low | 60.0 | 16.7 / 16.8 / 50.1 ms | 1 | 200 | 51.4k | 273 / 11 |

* **Production build**, 28 s of play: 60.0 fps, p99 16.8 ms, max 16.8 ms, 0 frames > 33 ms.
* **Asset loading:** nothing to download (procedural geometry, canvas textures); scene creation 11–15 ms.
* **Input transport (Control `key()` → Display DOM change), 120 inputs:** p50 2.4 ms, p95 5.1 ms, max 6.0 ms. This is the channel only; it excludes the next rendered frame (≤ 16.7 ms).
* **Stability:** 30 full mount/unmount cycles and 36 stage transitions/restarts (4 sessions × 9 stages): renderer-reported geometries 132→132, textures 10→10, tracked resources flat, JS heap (after forced GC) +0.5 MB; no "too many WebGL contexts" warning.
* **Presets** (same camera, `results/quality-presets.json`, screenshots `r5-quality-*.png`): high = 2048 shadow map; medium = 1024; low = no shadows, 0.85 DPR, fewer scenery cells and no particles. An automatic downgrade drops one preset if the average frame exceeds 27 ms for ~1.5 s. (Headless DPR is 1, so the DPR caps above 1 were not exercised.)
* **Not claimed:** performance on the target Windows laptop/projector. These numbers are an M1 with a hardware GPU.

## Defects found and fixed in R5
* `forceContextLoss` on a reused `<canvas>` broke React StrictMode remounts → canvas is created per mount (R1).
* A rest pose learned while the foot was still moving let a warm-up gesture become the baseline → warm-up now needs a continuous still window.
* Resuming after sensor loss was allowed before the foot re-settled → refused until `isReady()`.
* Bridge geometry/materials were leaking in the tracking registry (+1 geometry/material per stage) → released on rebuild (found by `restarts.mjs`).
* Test-only: a stale "second Control window" legitimately took the Web Lock; idle-child assertions assumed an unseeded first obstacle.

## Library integration
See `LOCAL_INTEGRATION_PATCH.md`. Routes, flag, manifest and thumbnail are in; the 2-file patch to the shared registry/thumbnail map is verified (`git apply --check` passes; tsc/build/browser pass on a patched scratch copy) but **not applied** because another agent is editing this tree. The library card text states that foot sensors are still being validated; the Control screen labels every foot mode "simulated".

## Protected items
No change to Space Pilot, Balloon Quest, Build Quest or other games; no BLE driver, calibration, Firebase rules, patient-history or auth change; nothing committed, pushed or deployed. `git status` still shows exactly the 36 pre-existing modified tracked files (none modified by this work).
