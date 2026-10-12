# Pearl Voyage 3D (قارب اللؤلؤ) — Final Report

Canonical ID `pearl-voyage-3d` · Projection WALL · Engine tag `pv3` · Feature flag `NEXT_PUBLIC_PEARL_VOYAGE_3D`

Nothing was committed, pushed, deployed or published. No Firebase rules were published. All Firebase testing used local emulators on dedicated ports (19700/19799, plus short-lived 19010/19020), demo projects only; `.env.local` values were overridden by process environment and never read for Firebase.

## Status: P1–P14

| Phase | Status | Evidence |
|---|---|---|
| P1 Platform inspection and architecture | Done | Reuses `liveSession`, `lib/liveGame/*`, controller lease, publisher, `HistorySaver`, staff auth. Separate modules: engine, boat/fish/markers/renderer, input, Control, Display, serialization, history. |
| P2 Premium tropical ocean | Done (art reviewed on real renders) | `evidence/screenshots/env*.png`, `enc-*.png` |
| P3 Boat and accessible steering | Done | lofted hull, helm with turning wheel, canopy, rails, outboard, waterline foam, wake; third-person camera, no shake |
| P4 Discovery markers | Done | golden ring, beam, ripples, sparkles, direction arrow, route pearls |
| P5 Fish encounters | Done | 11 original species, GPU swim-bend, leap/splash/celebration |
| P6 Hold-and-release | Done | 4 hold modes, threshold, direction, duration, tap rate-limit, progress never lost, no failure |
| P7 Collection | Done | ocean-journal gallery with 3D fish portraits; no score/competition |
| P8 3 levels x 3 stages | Done | 29 encounters, all nine completed by touch |
| P9 Therapist manual control | Done | iPad touch Control drives the real engine |
| P10 Wheel/pedal adapters | Done in software; **hardware unverified** | configurable axes, dead zone, centre, inversion, freshness, disconnect pause, manual takeover |
| P11 Shumos integration, history, rules | Done | one registry entry, shared history/rules, nothing published |
| P12 Audio and game feel | Done in software; **not listened to on real speakers** | synthesized waves, splash, chimes, pentatonic music, optional browser Arabic speech |
| P13 Testing and visual validation | Done (see caveats) | below |
| P14 Release candidate | See final status | |

## Architecture

`lib/pearlvoyage3d/`
- `stages.ts` — world data shared by engine and renderer (islands, reefs, markers, species).
- `engine.ts` — pure deterministic reducer: boat physics, soft island/world-edge avoidance, arrival, encounter, hold, celebrate, collection, skip/repeat/restart, participation tracking. No timers/penalties/failure.
- `live.ts` — `pv3` payload in the shared `liveSession` record, strict validator, reload recovery (always paused and still).
- `history.ts` — versioned (`resultVersion 1`, `engine pv3`) factual history.
- `input.ts` — wheel/pedal/Gamepad mapping and sampling. `useSession.ts` — Control runtime (lease, 150 ms coalesced publish, heartbeat, takeover, save-once history).
- `renderer.ts` + `render/*` — Three.js world; `audio.ts`, `copy.ts`.

Display is read-only (`PearlVoyageDisplayModule`). Control is authoritative. No new Firebase tree.

## Visual architecture

- **Sky**: analytic gradient dome, the same colours the water reflects and the fog fades to (no horizon seam); PMREM environment from the same dome; instanced cumulus clouds (one draw call).
- **Ocean**: polar-grid mesh (dense near camera) with a custom shader: three-wave displacement shared with the boat (it rides the visible surface), analytic normals plus fine ripples, fresnel sky reflection, sun glitter, shore/reef-driven depth colour (turquoise to sand), caustics, crests, marker glow and boat halo. Seabed plane for translucent shallows. `toneMapped:false` so authored colours are exact.
- **Islands**: shaped polar terrain with beaches, grass and rock colouring; curved palms with serrated arched fronds and coconuts; rocks, bushes, starfish; shoreline foam rings. Landmarks per level: pier and rowboat (Pearl Beach), lighthouse (Coral Bay), karst pillars (Golden Archipelago). Distant mountain ridges and far islands.
- **Reefs**: branching, brain, table and fan corals, anemones, kelp that sways in a vertex shader; instanced schools of small fish; gulls.
- **Three environments** differ in sun, sky, water palette, fog, wave energy, landmarks and reef density (Pearl Beach bright lagoon; Coral Bay dense colourful reefs; Golden Archipelago low golden sun with glitter path).
- **Boat**: lofted hull (cream topsides, teal sheer stripe, antifouling bottom), wood deck planks, cushioned seats, helm console with wheel that turns with steering, striped canopy, rails, life ring, outboard with spinning propeller, pennant, lantern, gold pearl ornament, waterline foam and wake.
- **Fish**: orange-stripe, royal-blue, butterfly, puffer, parrot, angel, dart (lofted bodies with per-species patterns and fins), golden ray (flapping wings), turquoise seahorse, friendly dolphin, calm turtle (flapping flippers). Portraits are rendered offscreen for the journal.
- **Graphics tiers**: high/medium/low change pixel ratio, ocean mesh density, decor, schools, gulls and particles. Reduced motion removes leaps, slows waves and camera, cuts particles.

## Nine stages

| # | Environment | Stage | Fish |
|---|---|---|---|
| 1-3 | Pearl Beach | First Discovery / Two Friends / Near the Reef | 1, 2, 3 |
| 4-6 | Coral Bay | Wide Lagoon / Little Island (longer holds) / Around the Reefs | 3, 3, 4 |
| 7-9 | Golden Archipelago | Two Golden Islands / Varied Friends (hold multipliers 0.7-1.35) / The Grand Voyage | 4, 4, 5 |

A unit test proves no straight leg crosses an island (this caught a real design bug during e2e: stage 5's island sat on the route and the first run needed 240 s; moved, rerun 68 s).

## Manual therapist controls (all driving the real engine)

Hold buttons and slider for steering (multi-touch: steering and throttle together), throttle, brake, auto-navigation, steering-assist slider, auto-hold, full therapist assist, reposition, hold button, encounter selection, repeat, skip encounter, skip stage, restart stage, stage selection, start/pause/resume/stop, end, new session; live minimap; settings for control source, participation mode, hold mode/direction/duration/threshold/taps, speed cap, arrival radius (large markers), steering range, sensitivity, dead zone, pedal threshold, reduced motion, high contrast, sound/music/voice/volume, graphics quality.

## Hardware adapters (P10) — not hardware-verified

Wheel only / pedal only / wheel+pedal / manual; mapping per axis (index, centre, min/max, rest/pressed, dead zone, inversion), button mapping, freshness window, disconnect pauses safely, therapist manual takeover at any time, standard-Gamepad preset. Sampling happens only on the Control device; there is no cross-device hardware relay and no new Firebase tree. No physical wheel or pedal was available: compatibility is not claimed.

## Shared integration and rules

New rules clauses follow the Fire Rescue pattern (shared `liveSession`, `pv3` key, lease-owner publish, tab takeover rules, strict payload shape/size) and a strict `pearl-voyage-3d` history branch. Existing expressions were wrapped, not rewritten. `DATABASE_RULES_MERGED_FOR_FIREBASE_CONSOLE.json` is the full merged file for the batch deployment (not published). Note: `database.rules.json` also contains other agents' uncommitted changes; deploy only as a merged batch.

History stores: stages completed/skipped, fish discovered, assisted/independent/skipped/repeated encounters, participation mode, completion. No score, accuracy or clinical outcome. Assisted means any manual, automatic or steering-assist help; defaults count as assisted, so independent counts are conservative.

## Tests

- Focused: 54 Pearl tests (29 engine, 15 platform/codec/history/input, 10 emulator rules), all passing.
- Full Vitest (Pearl rules emulator on): **153 files passed, 12 skipped; 1,921 tests passed, 83 skipped, 0 failed.**
- Full ESLint: **0 errors, 0 warnings.**
- `tsc --noEmit`: only the two stale `.next/types` references to the retired Feed the Animals pages (pre-existing; not Pearl).
- Emulator rules: Pearl 10/10; platform-wide suite (all legacy and 3D games) and Fire Rescue suite 20/20 against the edited rules.
- Production builds: flag on (route and card present) and flag off (card absent, preview 404, route renders the not-found page). Both succeeded.

## Browser tests (real Chromium, production build, separate Control and Display contexts sharing only the emulator)

- All nine stages completed by real multi-touch on an iPad-sized Control, 29 fish, 9/9 gallery screens on the Display, history saved exactly once (records=1, `participationMode MANUAL`, 29 assisted), reload did not duplicate it, zero console/page errors. 23 of 24 checks passed; the one miss is a start-up transient: 1 of 201 sync samples caught the Display still on "ready" about 0.6 s after Start while it was cold-compiling shaders at 23 fps.
- Feature session, 18/18: auto-navigation with no touch; command-to-display latency p50 88 ms, p95 295 ms (includes tap dispatch); reload recovery (paused, safe, progress kept) and Display survival; skip, repeat, encounter selection, restart, skip stage, stage select; missing wheel pauses safely and manual fallback resumes; reduced motion + high contrast + sound; quality medium/low/high; history saved once with honest counts (skipped 3, repeats 2, `MIXED`); a signed-in non-staff account cannot open the control.
- Method note: an early run stalled because my CDP touch helper could not lift a single finger; the fix is in the test helper (and a harmless try/catch around `setPointerCapture` in Control). Later runs used a production build because other agents' concurrent edits hot-reloaded the dev server mid-run.

## Performance (this Mac, headless Chromium with Metal, not a projector)

| | High | Low |
|---|---|---|
| FPS | 60 median (min 23 only during shader warm-up) | 52-60 |
| Draw calls | 43 (Pearl Beach) to 93 (Golden, 5 islands) | 51-64 |
| Triangles | 129k-231k | 100k-130k |
| JS heap over the nine-stage run | 15-56 MB, returned to 17 MB, no growth | — |
| Firebase writes | about 6.1 per second while playing (cap 6.7), heartbeat when idle | |

Resource cleanup: renderer, geometries, materials, textures, environment target, particles and fish models are disposed on unmount and on stage or quality change; the context is released. No physical-hardware performance claim is made.

## Evidence

`docs/pearlvoyage3d/evidence/`: `screenshots/` (3 environments, 4 species encounters, reduced-motion + high contrast, low quality, journal, library card, iPad Control, per-stage Control and Display, quality tiers), `video/gameplay-features-session.webm` (Display, 11.5 MB), `logs/`. Scripts in `validation/`.

## Files

New: `lib/pearlvoyage3d/**` (engine, stages, live, history, input, useSession, renderer, audio, copy, `render/*`, 3 test files), `components/control/pearlvoyage3d/**`, `components/display/pearlvoyage3d/**`, `components/display/games/PearlVoyageDisplayModule.tsx`, `app/control/pearl-voyage-3d/page.tsx`, `app/dev/pearl-voyage-preview/**` (dev-only harness, 404 in production unless `NEXT_PUBLIC_PEARL_VOYAGE_PREVIEW=true`), `public/pearl-voyage/thumbnail.jpg`, `docs/pearlvoyage3d/**`.

Shared files with narrow Pearl additions (they also contain other agents' uncommitted work): `lib/games/registry.ts`, `components/display/gameDisplayRegistry.tsx`, `components/control/library/gameThumbnails.tsx`, `components/control/library/presentation.ts`, `lib/realtime/types.ts`, `lib/realtime/sessionRepository.ts`, `lib/sessions/types.ts`, `lib/sessions/sessionHistoryRepository.ts`, `lib/sessions/historicalGames.ts`, `lib/analytics/patientAnalytics.ts`, `lib/audio/AudioManager.ts`, `lib/audio/__tests__/prefetchLines.test.ts`, `components/control/patients/SessionHistoryRow.tsx`, `components/control/patients/SessionDetailScreen.tsx`, `.env.example`, `database.rules.json`.

Cross-agent note: another agent added a `useLibraryLaunchAdapter(...)` call to `PearlVoyageControl.tsx`. It sent a `configure` command that does not exist in this engine; I changed only that call to `{type:'config', patch:{control}}`. Re-verify that adapter before batch deployment.

## Remaining limitations

1. No physical steering wheel, pedals, iPad or projector testing. Wheel/pedal compatibility, real input latency and projector readability are unverified.
2. Audio is synthesized and was never listened to; browser speech (`ar-SA`) depends on the device's voices and is off by default.
3. Production builds were made from a snapshot of the tree with type errors ignored in the snapshot only, because other agents' Control files had in-progress type errors at that time. The tree now type-checks (only the stale `.next` references remain), but the build was not repeated without that setting.
4. Flag-off route returns the app's not-found page with HTTP 200 (streaming), the same as Fire Rescue.
5. The fish are original procedural models; art quality is judged from screenshots by me, not by a clinician or designer.
6. The boat is seen from behind in normal play; the hull is best seen during encounters.

## Feature flag and rollback

`NEXT_PUBLIC_PEARL_VOYAGE_3D=true` enables it in production (development defaults on). Unset or `false`: the library card and `/control/pearl-voyage-3d` are removed. History already saved remains readable. Rollback = unset the flag and redeploy; rules additions are inert without the flag.

## Batch deployment checklist

1. Merge other agents' pending work; re-run tsc, ESLint, full Vitest and all emulator suites on the merged tree.
2. Review `database.rules.json` (merged) against the console rules; publish rules before the app (the app needs `pv3`).
3. Set `NEXT_PUBLIC_PEARL_VOYAGE_3D=true`; build; confirm card and route.
4. On site: iPad Control + laptop Display; run one stage manually; verify history record.
5. Bench-test the actual wheel and pedals through the mapping panel; confirm disconnect pauses safely.
6. Check sound levels and projector readability; choose graphics tier.
7. Keep the flag off until steps 4-6 pass.
