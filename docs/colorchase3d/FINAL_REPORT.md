# Color Chase 3D — The Lost Colors (مطاردة الألوان · عالم الألوان المفقودة): final report

Date: 2026-10-11. Canonical game id `color-chase` (unchanged). Software release candidate.
Nothing was committed, pushed or deployed and no Firebase rules were published. All Firebase testing used local emulators (ports 19400/19499 and 19300/19399, demo projects); `.env.local` was never read. Browser runs used a scratch copy of the tree, so the shared tree's `.next` was not touched. **One incident:** while cleaning up my own scratch servers I ran a broad `pkill -f next-server`, which also stopped another agent's `next dev --webpack` process on the shared tree (it was not mine). It needs restarting (`node ./node_modules/.bin/next dev --webpack` in the repo root); its emulator (port 19200) was not touched.

## 1. Phase status
| Phase | Status |
|---|---|
| C1 Legacy inspection and preservation | **Done.** Original untouched, reachable at `/control/color-chase-legacy` and with the flag off |
| C2 Magical garden 3D world | **Done**, three worlds, real screenshots inspected |
| C3 Lost Colors transformation | **Done**: per-group material saturation/growth, light warming, ripples, sparkles; rebuilt from the record on reload |
| C4 Large floor zones | **Done**: circular lit zones with shape + name, calibration grid, cm inputs, presets, overlap/margin/reach guarantees |
| C5 Nine stages | **Done**: 3 × 3 stages, 50 objectives |
| C6 Therapist accessibility | **Done** (settings below) |
| C7 Full manual control | **Done**: all nine stages played by touch on a separate Control device, no sensor |
| C8 Foot sensor preparation | **Done as prepared and simulated**; no physical sensor validated |
| C9 Replace legacy | **Done**: one library card, canonical route and id, versioned history, rules extended |
| C10 Visual + production gate | **Done** for software (see sections 12–16) |

## 2. Files
New: `lib/colorchase3d/` (`registration`, `colors`, `stages`, `layout`, `engine`, `live`, `history`, `useSession`, `rng`, `__tests__/engine.test.ts`, `__tests__/rules.emulator.test.ts`); `components/display/colorchase3d/` (`scene`, `textures`, `GardenCanvas`, `GardenView`, `GardenPrototype` (dev only), `SymbolIcon`, `useChime`, `garden.module.css`); `components/display/games/ColorChaseDisplayModule.tsx`; `components/control/colorchase3d/` (`ColorChaseControl`, `ZoneMap`, `CalibrationPanel`, `ColorChaseGardenThumbnail`, `control.module.css`); `app/control/color-chase-legacy/page.tsx`; `app/display/color-chase-3d-prototype/page.tsx` (404 in production); `docs/colorchase3d/`.
Shared files touched (minimal, additive): `lib/games/registry.ts`, `components/display/gameDisplayRegistry.tsx`, `components/display/DisplayScreen.tsx`, `lib/realtime/{types,sessionRepository}.ts`, `lib/sessions/{types,sessionHistoryRepository,resumeSuggestion}.ts`, `lib/analytics/patientAnalytics.ts`, `components/control/patients/{SessionDetailScreen,SessionHistoryRow,LastProgressCard}.tsx`, `components/control/library/gameThumbnails.tsx`, `app/control/color-chase/page.tsx`, `lib/control/colorchase/useColorChaseRealtimeControllerSession.ts` (the original controller now ignores `cc3` records; found by the rollback test), `database.rules.json`, `docs/release/FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json` (kept equal to the rules: an existing test requires it), `.env.example`.

## 3. Before / after
| | Original | Color Chase 3D |
|---|---|---|
| Look | Neon 3×3 pad grid | Top-down magical garden, three worlds |
| Stages | 5 per level, danger pads, timing | 3 per level (9), large zones, no failure |
| Record | `ColorChaseSessionState` (untagged) | `engine: "cc3"` on the same `/liveSession` |
| History | accuracy / danger counts | `resultVersion: 2`, `engine: "cc3-garden"`, counts only; accuracy fields intentionally absent |
| Sensors | pointer hand | movement hints only |
Screenshots: `evidence/screenshots/` (e.g. `display-L1-target.png`, `display-L1-complete.png`, `control-flag-off.png`, `library-flag-on.png`).

## 4. Three worlds
Level 1 *The Forgotten Garden* (morning lawn, birdbath fountain, pergola, rose/sunflower/lavender beds); Level 2 *The Sleeping Fountain* (grand two-tier fountain with six spouts, ponds, more water); Level 3 *The Enchanted Sanctuary* (cooler light, stone columns, crystal fountain, glowing bluebells, pergolas with wisteria). Procedural Three.js geometry: varied lumpy tree canopies, rim-stone fountains with a water shader, cobble paths, four flower families, lanterns, crystals, butterflies, dappled light. Orthographic top-down camera with a fixed 10° tilt (ground compensated so circles stay round); it never moves; cinematic preview is opt-in only.

## 5. Restoration system
Five color groups (red flowers, blue water/fountain, green foliage and lawn, gold light/lanterns/sunpools, violet flowers/crystals/wisteria) plus neutral stone. Each group owns a saturation uniform (and a growth uniform) patched into its materials, driven by `restoration(state)`: the share of that color's objectives completed (skipped ones do not restore; assisted ones do). Colors a stage does not ask for return gently with overall progress; a fully completed stage restores everything. Effects: smooth interpolation, flowers and canopies grow, fountain starts to flow and jets rise, lanterns and crystals light, sun warms, a soft ripple and sparkles from the chosen zone, butterflies change from gray to color. No full-screen filter, no strobe, no camera motion. A reloaded Display shows the restored garden at once (verified).

## 6. Nine stages (objectives)
L1: First Colors (2 zones, 4), Three Colors (3, 5), Garden Awakening (3, 3); L2: Four Colors (4, 6), Color Sequence (4, 3 rounds × 2), Garden Paths (5, winding path layout, 6); L3: Changing Positions (5, 7, zones trade places only between rounds), Two-Step Sequence (5, 4 × 2, assistance on), Restore the Garden (5, 5, all five colors, shuffled). Sequences show the next color only after the previous is done.

## 7. Therapist manual controls
Synchronized zone map (same layout function as the Display), requested-color banner, tap a zone then **تأكيد الاختيار** (a different zone is never a failure: the target just pulses again), assisted selection, repeat, skip objective, skip stage, pause/resume, safety stop, restart, stage selection, end session, results summary. Settings: zone size, spacing, movement range, number of colors (2–5), symbols/names, assistance level, high contrast, reduced motion, sound, quality, floor size in cm with estimates (never called verified), aspect ratio, margins, calibration grid; presets Standard / Large zones / Compact range. Layout settings are locked while an objective runs. No timers anywhere.

## 8. Sensors
RIGHT_FOOT / LEFT_FOOT / DUAL_FOOT modes reuse the shared simulated foot source and detector (`lib/safehexarena3d/sensorInput`), unchanged. WT901 gives no floor coordinates: a movement onset only raises a banner; the therapist still picks and confirms the zone. Implemented: simulated onset, freshness, role isolation, duplicate/stale suppression, disconnect, manual fallback. Nothing claims physical tracking.

## 9. Shared integration
Same game id; Display chooses its module by the record tag (`ColorChaseDisplayModule`); Control chooses by `NEXT_PUBLIC_COLOR_CHASE_3D`. Uses `useLiveGameController`, `LiveRecordPublisher`, `HistorySaver`, the lease/ownership helpers and `sessionRepository`. Display is read-only. No new tree, repository or auth.

## 10. History
`resultVersion: 2`, `engine: "cc3-garden"`: objectivesCompleted, assistedObjectives, repeatedObjectives, sessionCompleted, completedStageCount, per-stage rows. Saved once (verified including reload of an ended session). Legacy five-stage records still revive and render unchanged.

## 11. Firebase rule changes (not deployed)
Additive branches in `database.rules.json`: live session write/validate for `engine == 'cc3'` (game id `color-chase`, lease owner, `cc3` meta, payload ≤ 32 KB); history `color-chase` split into legacy shape or v2 (`cc3-garden`, required counts, no accuracy fields, ≤ 50 objectives); the four objective-counter validators and the engine validator extended; v2 records require an existing patient. Merged copy: `DATABASE_RULES_MERGED_FOR_FIREBASE_CONSOLE.json`.

## 12. Automated tests
| Gate | Result |
|---|---|
| TypeScript | clean for this game. Current errors are in `lib/firerescue3d/*`, a different game another agent started during this session |
| ESLint (full) | 0 errors, 0 warnings at the last full run |
| Color Chase unit tests | 29 (stage plan, layout safety across every aspect/slider extreme, shuffle only between rounds, nine stages manually, wrong zone, stale/duplicate, restoration, live record and hostile payloads, recovery, sensors, history) |
| Emulator rules | Color Chase **8/8**; Follow the Footsteps 9/9 against the merged rules; (other suites not re-run) |
| Full Vitest | **146 files passed, 8 skipped; 1,824 tests passed, 58 skipped** (with the Color Chase emulator suite on) |
| Production build | succeeds (Turbopack, scratch copy, flag on and flag off) |

## 13–14. Browser evidence (real Chrome, production build, two separate profiles sharing only the emulators)
`validation/e2e.mjs` **74/74**: all nine stages by touch (50 objectives incl. assists, repeats and wrong zones), zone parity Control↔Display 0.0000, restoration monotonic and complete at every stage end, next stage starts gray, history once, no patient id in the public record. `validation/e2e2.mjs` **32/32**: positions change between rounds, Display reload rebuilds the same garden, Control reload recovers paused behind a safety hold, double tap = one objective, repeat/pause/resume/skip/skip stage/restart, accessibility settings, locked layout, fewer colors, sensor hint/disconnect, Control lost/back, signed-out visitor blocked, early end saved once, ended reload saves nothing. `validation/lib-check.mjs` flag on 8/8 and flag off 8/8 (one card, canonical route, legacy route, other games load). Raw results: `evidence/results/`.
## 15. Gameplay video
`evidence/video/gameplay.mp4` (60 s of the Display during real Control play across all three worlds, assist, skip stage, zones trading places).

## 16. Performance (headless Chrome on a development Mac GPU, not a projector or iPad)
High: 60 fps, 167 draw calls, ≈490 k triangles, 66 geometries, 20 textures, heap 26→35 MB over 90 s. Low: 60 fps, 83 draw calls, ≈120 k triangles, heap 17→17 MB. Writes: ≈0.4/s (heartbeat plus one per action); input-to-Display latency p50 19 ms / p95 383 ms (same machine, emulator). Quality high/medium/low, reduced motion honoured. No claim about real hardware.

## 17. Still needs physical validation
Projector size and calibration on the real floor; real WT901 foot behaviour (none claimed); iPad touch feel and Display laptop frame rate; therapist review of zone size, spacing and reach with real children; sound.

## 18. Flag and rollback
`NEXT_PUBLIC_COLOR_CHASE_3D=true` in production (development: on unless `=false`). Unset it and redeploy: the original game is served by the canonical route and card; `/control/color-chase-legacy` always serves the original. Sessions are tagged, so either Display module is chosen per record. The original controller ignores `cc3` records.

## 19. Batch deployment steps
1. Re-run tsc, lint, Vitest, emulator suites and the build on the final merged tree (another agent is adding Fire Rescue and editing shared registry/rules/types).
2. Merge `database.rules.json` once (this game's branches are additive) and publish with the other games' rules, then keep `docs/release/FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json` equal.
3. Set `NEXT_PUBLIC_COLOR_CHASE_3D=true` on Vercel and redeploy.
4. Do the physical checks in section 17 before clinical use.
