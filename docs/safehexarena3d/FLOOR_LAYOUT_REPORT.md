# Safe Hex Arena 3D: floor layout and physical tile size

Date: 2026-10-10. Software only. Nothing was committed, pushed or deployed, and no rules were published. No new Firebase tree, session or platform: the layout is part of the existing `hex3` record.

## What changed
1. **Geometry fitted to the floor.** A layout is now built from row lengths and chosen by `getLayout(tiles, aspect)` as the shape with the largest hexagons for the projector image ratio (for example 5+4 for 9 tiles and 5+6+5 for 16 on 16:9). Adjacency comes from real centre distances. Only shapes that stay safe when any single tile is warned are offered (checked in code and tests). The orthographic top-down camera is fitted from the actual grid bounds, the aspect ratio, the margin and the scale (`fitFor`): no CSS scaling.
2. **Default margin 6 % to 3 %** (still 0–15 % adjustable; scale 70–110 %). Arena is centred and never leaves the margin (tested at every ratio, margin and scale).
3. **Presets** (therapist selects, locked while a stage is running):
   - STANDARD: the approved 9 / 12 / 16 tiles per level (default, unchanged stage rules).
   - EXTRA_LARGE: an explicit accessibility adaptation with **fewer, larger** zones, 6 / 9 / 12 tiles. Rounds, warned-tile counts and every other rule are unchanged; warned tiles never exceed half the layout. The panel labels it as an adaptation.
   - COMPACT: **more** zones, 12 / 16 / 20 tiles.
   Layout-affecting settings (preset, projector ratio, floor size) change only in `ready` or `stage-complete`, so a tile index never changes meaning mid-round. History rows record the tile count.
4. **Calibration panel** (Control): projector image ratio (16:9, 16:10, 4:3, 21:9), projected floor width and height in cm, "I measured and calibrated" checkbox, coverage readout, and the **estimated** tile width (flat-to-flat and point-to-point), safe spacing and arena size. It flags a floor shape that does not match the image ratio (tiles would be stretched).
5. Control hex map and Display derive the same layout from the same shared state, so identity and positions stay synchronized (measured: 0.0000 error).

## Before / after (16:9 projector image)
Before: fixed 3×3 / 4×3 / 4×4 grids at a 6 % margin. After: aspect-fitted shapes at a 3 % margin. "Tile height" is one hexagon's point-to-point height as a share of the screen height (a direct measure of tile size).

| Stage | Shape before → after | Longest side used | Arena area / whole screen | Arena area / usable area | Tile height | Tile size |
|---|---|---|---|---|---|---|
| Easy, 9 tiles | 3+3+3 → 5+4 | 88 % → 94 % | 53 % → 63 % | 68 % → 72 % | 35.2 % → 38.6 % | +10 % |
| Medium, 12 tiles | 4+4+4 → 4+4+4 | 88 % → 94 % | 68 % → 77 % | 88 % → 88 % | 35.2 % → 37.6 % | +7 % |
| Advanced, 16 tiles | 4+4+4+4 → 5+6+5 | 88 % → 94 % | 52 % → 76 % | 67 % → 86 % | 27.1 % → 32.2 % | +19 % |
| EXTRA_LARGE, 6 tiles | (new) 3+3 | 94 % | 86 % | 97 % | 53.7 % | +53 % vs the old 9-tile grid |
| COMPACT, 20 tiles | (new) 5+5+5+5 | 94 % | 73 % | 82 % | 28.9 % | similar to the old Advanced |

Honest reading: with hexagons you cannot tile a rectangle exactly, so "usable area" coverage is 72–97 %, depending on the tile count and ratio. **9 tiles on 16:9 is 72 %**, the limit of nine hexagons on a wide floor (two rows of 5 + 4, limited by width). The way to a larger tile there is the EXTRA_LARGE preset (97 %). On 4:3 and 16:10 the numbers are 76–97 %. The browser measured the same: Easy 94 % wide, Medium 94 % high, Advanced 94 % wide, centred, inside the margin (`evidence/results/layout-coverage-measured.json`). Tile size always grows when the tile count falls, except 9 vs 12 on 16:10 and 4:3, which are the same three-row grid.

## Estimated physical size (example: 320 × 180 cm projected floor, 16:9)
| | Tile (flat-to-flat) | Safe spacing |
|---|---|---|
| Easy 9 (5+4) | ≈ 56 cm | ≈ 4.2 cm |
| Medium 12 (4+4+4) | ≈ 55 cm | ≈ 4.1 cm |
| Advanced 16 (5+6+5) | ≈ 47 cm | ≈ 3.5 cm |
| EXTRA_LARGE 6 | ≈ 78 cm | ≈ 5.9 cm |
| COMPACT 20 | ≈ 42 cm | ≈ 3.1 cm |

These come from the entered numbers only. In the browser, the Advanced estimate (47 cm, 3.5 cm gap) matched what the Display actually rendered on a 320 cm-wide image (46.6 cm, 3.51 cm). **Physical tile dimensions are NOT verified.** The panel says so until the projector is measured and calibrated, and says even a therapist-confirmed calibration is an estimate the system cannot verify. A 400 × 300 floor on a 16:9 image is flagged as stretched.

## Tests
- Geometry/layout unit tests (58 Safe Hex tests in total, all passing): 6/9/12/16/20 tiles × six screen ratios (unique centres, no overlap, symmetric hex adjacency, determinism); fit inside margins for every preset, stage level, ratio, margin 0/3/8/15 and scale 70/100/110; limiting side exactly filled; enlarged beats the old grids; the generator's safety contract for every preset × stage × round × seed × child tile × two ratios; all nine stages playable on all three presets; layout lock between stages; calibration sanitising and estimate maths.
- Real browsers (separate Control and Display processes, production build): layout suite 25/25 (Easy/Medium/Advanced, EXTRA_LARGE with a full stage played, COMPACT, 4:3 re-fit, calibration, stable camera); final integration 23/23; nine stages 81/81 (map == Display at 82/82 checks); robustness 24/24.
- Gates on the final tree: `tsc` 0 errors, ESLint 0 errors/warnings, full Vitest **144 files, 1,851 tests passed**, Safe Hex emulator rules 9/9, production build with `NEXT_PUBLIC_SAFE_HEX_ARENA_3D=true` succeeds.

## Evidence
`docs/safehexarena3d/evidence/layout/`: enlarged Easy/Medium/Advanced Displays, EXTRA_LARGE, COMPACT, 4:3, calibrated Advanced, therapist calibration panel, the library card, the non-staff denial. Raw results in `evidence/results/`.

## Remaining hardware limits
No projector, floor or sensor was involved. Real tile dimensions, projector keystone and stretch, brightness, and the physical fit of the larger zones for each child still need measurement on site. Sensors remain simulated movement hints; the therapist still confirms every tile.
