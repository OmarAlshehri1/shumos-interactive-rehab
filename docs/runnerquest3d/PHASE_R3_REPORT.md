# Runner Quest 3D — Phase R3 report (three difficulties × three stages)

**Status: COMPLETE** (software, keyboard source; foot input is covered in R4)

## The nine stages (`lib/runnerquest3d/stages.ts`)
| # | Difficulty | Stage | Content (generated from a seed) | Foot lift |
|---|---|---|---|---|
| 1 | Easy | الخطوات الأولى | 6 single-lane rocks/logs, 2 checkpoints | none |
| 2 | Easy | اختر المسار | 6 gates: one glowing safe lane, two fenced | none |
| 3 | Easy | تجنّب بلطف | 8 single-lane side obstacles | none |
| 4 | Medium | أول حاجز | 5 full-width low hurdles, one at a time, gap ≥ 28 m | yes |
| 5 | Medium | الاتجاه والخطوة | 8 alternating side obstacles / hurdles, gap ≥ 26 m | yes |
| 6 | Medium | درب العوائق | 10 hurdles + side obstacles, gap ≥ 23 m | yes |
| 7 | Advanced | مسارات متغيّرة | 9 gates / side / markers + checkpoints | none |
| 8 | Advanced | عوائق متنوعة | 10 predictable side–hurdle–hurdle–side sequences | yes |
| 9 | Advanced | المغامرة الأخيرة | 12 mixed (gate, hurdle, side, marker) + festival destination | yes |

Advanced adds **variety, never speed**: the default speed is the same 2.4 m/s everywhere and every stage keeps gaps ≥ 21 m (and a 38 m first approach).

## Stage rules (all enforced in the pure engine and unit-tested)
* **No time-based failure, no fail state.** A 10-minute idle run stays `playing` with the runner holding 1.6 m short of the obstacle; 20 s of idling was also verified in the browser.
* **Non-punitive misses**: the runner never collides. An unresolved obstacle → brake and hold (counted once as a "pause", no star loss). Retry = simply act; therapist can **assist** past it, **restart** the stage (same seed, same obstacles) or **skip**.
* **Deterministic**: encounters come from `hash(stage, seed, spacing)`; identical on Control and Display, never transmitted.
* **No automatic difficulty change**: after a stage the session waits in `stage-complete` for the therapist's "المرحلة التالية".
* **Reachability** validated for 60 seeds × 3 spacings × 9 stages: every obstacle has a free lane or is a steppable hurdle, gaps ≥ 7 m min / ≥ 14 m target, no full-width solid obstacles.
* **Therapist controls**: pause / resume / restart stage / skip / end / assist / start-at-stage with "single stage" or "to the end".

## Therapist settings (Arabic, `RunnerQuest3DControl`)
Input source · stage/difficulty (3×3 grid) · forward speed (1.0–4.5 m/s, presets) · movement sensitivity · obstacle spacing (×0.8–×1.6, applied from the next stage/restart) · foot-lift requirement · action tolerance (step window 5 / 7 / 9.5 m) · pause-before-obstacle · reduced motion. No sensor calibration is touched.

## Validation
* **Unit tests**: `lib/runnerquest3d/__tests__/engine.test.ts`, `stages.test.ts` (40 tests): stage briefs, determinism, reachability, hold/assist/skip/restart/end, settings effects, "a correct bot completes each stage at 1, 2.4 and 4.5 m/s", nine-stage session with therapist advancement and summary.
* **Real browser, two windows, full nine-stage session** (`validation/e2e-full.mjs`, results in `results/e2e-full.json`): Control and Display in separate Chrome windows, real `ArrowLeft/ArrowRight/Space` key events (59), **9/9 stages completed, 88 stars, 0 Control/Display lifecycle mismatches, 0 console errors, 7.2 min**, Display held 60 fps with 213 draw calls / 80k triangles at the end. Screenshots: `screenshots/r3-stage-*-complete-display.png`, `r3-session-summary-*.png`.
* The bot acts ≥ 6 m before each obstacle, so this run never needed a hold; the hold/slow-child path is validated separately in `e2e-r4.mjs` (idle child) — see R4.

## Notes
* A stage's star count is not a score to beat: markers only add a bonus star, nothing ever subtracts.
* Settings that change the encounter layout (spacing) deliberately do not alter a stage in progress.
