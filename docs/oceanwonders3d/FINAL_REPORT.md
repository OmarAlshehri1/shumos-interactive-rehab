# Ocean Wonders 3D — عالم المحيط · Final report

Branch `feature/ocean-wonders-3d`, worktree `../shumos-ocean-wonders`, based on `1bcdbc4` (the Achievement City commit, which already contains the Interactive Rewards category). Game id `ocean-wonders-3d`, engine tag `ow3`, category `INTERACTIVE_REWARDS`.

**Nothing is pushed, deployed or published. Rules are patched in repository files only. No env var changed.**

Legend: IMPLEMENTED · BROWSER TESTED (real Chrome, real GPU, local emulators, two Chrome processes) · SIMULATED · PHYSICAL HARDWARE UNVERIFIED · NOT IMPLEMENTED

## Concurrency
Main's uncommitted YouTube/security work and Codex's Achievement Forest worktree (`/private/tmp/shumos-achievement-forest`) were not read into, modified, stashed or reset. Because the reward category/engine only exist on the City branch, this branch is built **on top of City** (reusing its category, `categorySections`, filter, thumbnails pipeline). Merge City first.

## Architecture (IMPLEMENTED)
Same pattern as City: `lib/oceanwonders/` (pure reducer, milestones, live codec, history, gamepad edge detector, Control runtime) publishing into the shared `/liveSession` via `lib/liveGame/*`; history through `saveSessionHistoryOnce`; visit linking through the generic claims. Display `components/display/oceanwonders3d/` (three.js, no new dependency); Control `components/control/oceanwonders3d/`. No new Firebase tree, Display URL, auth, audio engine or polling loop. All art is procedural (geometry, canvas textures, GLSL, WebAudio) — no third-party assets.

## Three levels (BROWSER TESTED)
Exactly three levels, no stage field, no stage selector (E2E asserts three cards, no stage UI). One ocean: palette and camera framing are continuous in `F = level + progress`, so nothing resets. Milestones: Coral Garden 10, Kingdom of the Deep 11, Legendary Ocean 11, mapped onto any target 3–30 by integer arithmetic with partial growth. Direct selection of level 2/3 renders earlier levels as completed scenery and records nothing (E2E: no history; saved record contains only the played level).

## 3D art
Seabed with sand texture, caustics shader on every material, light shafts, sky dome, marine snow, bubbles, sparkles, growth rings. Flora: staghorn/brain/bubble/tube/table/fan corals, anemones, seagrass, kelp, feather dusters, shells, starfish, urchins, rocks. Fauna: 9 fish species in GPU-animated instanced schools (orbit/formation/path), turtle, dolphins, octopus, jellyfish, humpback-style whale. Structures: stone arches, glowing cave, fantasy shipwreck (ribs, torn swaying sails, lanterns, chest), coral palace (towers, domes, windows, gate), Pearl Spire landmark with orbiting rings, glowing plants, giant clams with pearls. Growth: parts grow/rise/pop out of the seabed, bubbles + sparkles + ring on completion, finished builds merge into a few draw calls, confirmations queue and fast-forward, nothing re-animates on reload. Finale: palace lit, light beams, fish formation, whale crossing, motes/bubbles, gentle camera pull-back; no flashes.

## Controls, controller, history, visit, library
Manual: confirm, assisted, undo (open confirmations of current level only), skip, pause/resume, restart (confirm), safe end, results, notes; 300 ms debounce. Controller: shared-convention edge detector (one press = one, no repeat on hold, held-at-connect ignored, stale rejected, disconnect → manual fallback) — **SIMULATED only** with an injected `navigator.getGamepads`. History: one `sessionId-r{run}` record, counts only, no score/accuracy (rules forbid), saved once. Visit link: **rules-tested**; the visit-workspace UI was not browser-driven. Library: reuses the `INTERACTIVE_REWARDS` category; library now has 21 games; device filters unchanged (7/13/6/3).

## Tests executed
| Check | Result |
|---|---|
| `vitest run` (whole repo) | 2356 passed, 1 timeout in an unrelated import-heavy test that I then fixed by lazy-loading the 3D canvas; re-run passes. Final full re-run: see below |
| Rules emulator, Ocean (11) and City (11), each on a clean emulator | 11/11 and 11/11 (Ocean layers over City without regression) |
| Cross-device E2E (`validation/e2e.mjs`) | **61/61** (last two consecutive runs). An earlier run had 1 timing-sensitive failure in the controller double-press check under heavy machine load; it passed on re-run and the harness was tightened |
| `tsc --noEmit` | clean (after Next type generation) |
| eslint | 0 errors, 7 warnings (unused vars) |
| `next build` (both reward flags on) | OK; routes built |

## Performance (this Mac, headless Chrome 1920×1080, DEV server, shared with other agents)
60 fps through Level 2; Level 3 complete ≈ 40–54 fps (≈1.1M triangles, ~200 draw calls). CPU in `draw` 1–2.6 ms. Startup stall removed by on-demand generation (first frame 1.3 ms). Not profiled on a projector PC or weak GPU; `quality: low` exists but was not measured; production-build fps not separately measured.

## Known limitations / not verified
- PHYSICAL HARDWARE UNVERIFIED: controller/Joy-Con/Bluetooth, projector, real wall, real child, audio by ear (audio only call-counted), Safari/iPad Display, weak GPU.
- Stylised procedural art, not photoreal; whale is blocky; fish/dolphin models are simple.
- Visit-workspace UI not driven in a browser. Chrome only.
- Rules size: minified `database.rules.json` is ≈288 KB (City ≈280 KB, baseline ≈273 KB) — **verify the Firebase console accepts it** before publishing.
- Dev-only quirk seen once during hot-reload: a capture with the camera near the reef; not reproducible on rebuilds (camera position is now exposed in canvas metrics).

## Merge requirements
Merge City (and Forest) first. **Do not text-merge `database.rules.json`**: run `python3 docs/achievementcity3d/rules-patch.py` then `python3 docs/oceanwonders3d/rules-patch.py` on the final merged rules (each idempotent; Ocean wraps City's clauses), then re-validate. Shared files touched (additive): `lib/games/registry.ts`, `lib/games/library/capabilities.ts` (add `ocean-wonders-3d` to `ACTIVITY_CATEGORY_GAMES.INTERACTIVE_REWARDS` and `TARGET_PROJECTION`), `components/control/library/{gameThumbnails.tsx,realGameThumbnails.ts}`, `lib/games/setup/introduction.ts`, `lib/realtime/{types.ts,sessionRepository.ts}` (overlaps YouTube work), `lib/sessions/{types.ts,sessionHistoryRepository.ts,historicalGames.ts}`, `lib/analytics/patientAnalytics.ts`, `lib/audio/AudioManager.ts`, `lib/therapyVisits/gameSafety.ts` (`"ow3"`), `components/display/gameDisplayRegistry.tsx`, patient/visit screens (`LastProgressCard`, `SessionDetailScreen`, `SessionHistoryRow`, `VisitWorkspace` — overlap Codex session-history work), tests whose counts moved (now 21 here; 22 when all three land): `presentation.test.ts`, `thumbnails.test.ts`, `unifiedGames.test.ts`, City's `libraryIntegration.test.ts`. Rollback: unset `NEXT_PUBLIC_OCEAN_WONDERS_3D` (production is opt-in).

## Reproduce
`validation/emulators.sh` (RTDB 19860/Auth 19869) · `validation/dev-emu.sh dev` (app 3861) · `node validation/e2e.mjs ../evidence` · rules: `OW_NS=demo-ow-rules-default-rtdb OW_RULES_EMULATOR=1 OW_DB_PORT=19860 OW_AUTH_PORT=19869 npx vitest run lib/oceanwonders/__tests__/rules.emulator.test.ts` (restart the emulator between suites) · screenshots `validation/shots.mjs` (dev preview on 3860). Screenshots: `docs/oceanwonders3d/screenshots` (10 numbered + 3 cards), E2E captures in `docs/oceanwonders3d/evidence/shots`.
