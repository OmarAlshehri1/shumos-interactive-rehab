# Turn & Go 3D — تحدي الدوران · Final report

Branch `feature/turn-and-go-3d` (worktree `../shumos-turn-and-go`, based on `e6aa5fd`). Game id `turn-and-go-3d`, engine tag `tg3`.
**Nothing is pushed, deployed or published. Firebase rules are patched in the repo files only (not in the console).**

Status legend used below: **Implemented** (code exists) · **Browser-tested** (real Chrome, real GPU on this Mac, local Firebase emulators) · **Simulated** (simulated foot source) · **Hardware-validated** (none) · **Incomplete**.

## 1. Architecture (one canonical game, no new infrastructure)

* Publishes into the existing `/liveSession` through `lib/liveGame/*` (controller lease, window ownership, heartbeat, takeover, recovery) exactly like Rhythm Steps / Safe Hex Arena. No new Firebase tree, project, launcher or Bluetooth code.
* `lib/turngo3d/` — `courses.ts` (pure geometry), `config.ts`, `stages.ts`, `engine.ts` (pure reducer), `live.ts` (record + validator + recovery), `history.ts` (save-once record), `captions.ts` (Arabic guidance, turn direction), `projectionProfile.ts`, `useSession.ts`.
* Display: `components/display/turngo3d/` (Three.js scene, particles, audio, HUD) + `games/TurnGoDisplayModule.tsx` registered in `gameDisplayRegistry.tsx`. Control: `components/control/turngo3d/` (course map editor, settings, step controls). Routes `/control/turn-and-go-3d`, `/display/turn-and-go-3d`, dev-only `/dev/turn-and-go-preview`.
* Library: registry entry (FLOOR, FOOT, tags «حركة القدمين والمشي», «التوازن والثبات»; typed `activitySkills: ['feet','balance']` for the integrated tree), thumbnail from real gameplay (`public/library-thumbnails/turn-and-go-3d.webp`, provenance recorded), vector fallback card.
* History: one record per run (`sessionId-r{run}`), `resultVersion 1`, `engine tg3`, patient analytics + session detail/row branches. No score, accuracy or speed fields (rules forbid them).
* Feature flag `NEXT_PUBLIC_TURN_AND_GO_3D` (dev: on unless `false`; production: opt-in). Rollback = unset it.
* Reuse: shared `lib/audio/primitives` + `lib/audio/speech`, `lib/safehexarena3d/sensorInput` (foot hint detector + simulator), `lib/footsteps3d/rng`.

## 2. Gameplay

Therapist-driven: the child physically walks; the game shows the route, arrows, stars and stop markers; **the therapist confirms every star** (confirm / assisted / skip / repeat / back). A star is awarded only through an explicit command and only for the active checkpoint, so it can never be awarded twice (outcomes live in one per-stage list; counts are derived from it). 3‑2‑1 countdown, then confirmations open.

* Guidance (all drawn, not only text): flowing chevrons along the active segment, a big floor arrow at the child's last position, a ground beacon (green go / amber wait / red stop / blue countdown), a stop/go lamp panel, a preview of the next turn, and an Arabic pill (امشِ للأمام / انعطف يمينًا / انعطف يسارًا / قف مكانك / انتظر …) with a drawn icon. Left/right are computed from the child's heading (direction of the previous segment), not from the screen, so mirroring and rotation never flip the meaning.
* Stop markers: confirm arrival → timed hold (default 3 s, 2–10 s) driven by the running game clock (freezes on pause/safety/lost connection), bead progress ring, then the star is collected. Therapist can end it early (assisted) or cancel/repeat.
* Gentle error feedback: «خرج عن المسار» / «لمس مخروطًا» are therapist reports → soft ring pulse + soft tone + (once per stage) «لا بأس، لنعد إلى المسار». They never change progress and never subtract anything. The system never detects cone contact.
* Dynamic events (stages 5–9): friendly character «wait», gate that opens after a stop, traffic-light wait, arrow switch (the next star moves to a safe alternate, the old path is taped off), path block, alternate star. **They start only immediately after a therapist-confirmed star, while the child stands still**, last 2–8 s, can be ended early (`تابع الآن`) and disabled entirely; an event whose alternate would be unsafe is downgraded to a plain wait. Difficulty rises through route complexity only: no speed, running, jumping or timers.

## 3. Nine-stage matrix (generated from the code, default settings)

| Stage | Name | Course | Cones | Stars | Stops | Events | Environment / star effect |
|---|---|---|---|---|---|---|---|
| 1.1 | الحديقة المشمسة / Sunny Garden | straight | 0 | 2 | 0 | — | garden / sparkle |
| 1.2 | ملعب الألوان / Colorful Playground | one | 1 | 3 | 0 | — | playground / confetti |
| 1.3 | ممر الزهور / Flower Walkway | two | 2 | 4 | 0 | — | flowers / petals |
| 2.1 | الشاطئ الذهبي / Golden Beach | curve | 2 | 5 | 0 | — | beach / bubbles |
| 2.2 | حديقة المهرجان / Festival Park | sShape | 3 | 6 | 0 | switch | festival park / fireworks |
| 2.3 | الغابة الودودة / Friendly Forest | stopgo | 3 | 6 | 2 | character, gate | forest / fireflies |
| 3.1 | الحديقة المضيئة / Luminous Garden | turns | 2 | 6 | 2 (optional, ≤2 s) | block, light | luminous night / lanterns |
| 3.2 | المدينة المصغّرة / Miniature Town | town | 3 | 6 | 0 | character, switch, block | town / bells |
| 3.3 | مهرجان شمّوس / Shumos Festival | festival | 4 | 8 | 2 | light, gate, switch, block, character | finale / grand |

Each stage has its own procedurally built environment, lighting, corridor material and star‑collect effect; only the current one is built (rebuilt on layout change, disposed on stage change).

## 4. Real cone setup

* Layout choices: stage default, straight, 1, 2, 3, 4 cones, simple slalom (5), S‑shape, curve. Orientation: 4 directions + mirror. Width, spacing (×0.7–1.3), star density (fewer / normal / more, which adds mid‑segment stars).
* **Manual fit**: in the setup preview the therapist drags cones, stars, start and finish on the Control map (or nudges with arrow keys); stars anchored to a cone travel with it. Edits are stored in the base frame, so rotating/mirroring afterwards keeps them; a layout change clears them. Setup preview on the Display shows numbered rings for each cone, the safety rings and the route before starting. Optional ring‑only mode draws a footprint instead of a cone image, so nothing is projected onto the real cone.
* Safety: every star is kept ≥0.95 course units from every cone (pushed away if the therapist moves a cone onto it), inside the safe inset, and the drawn corridor narrows so it never covers a cone; an optional star squeezed against a cone by a tight orientation is dropped. Warnings are shown to the therapist. **Real cones cast shadows in the projection; the margin is the only mitigation — no occlusion modelling exists.**
* Units are abstract "course units" (16×9). Centimetre hints appear only when a measured shared projection profile is chosen. The game **never claims** the projected picture matches the physical cones, and does not detect real cone position or contact.

## 5. Projector calibration

The shared calibration module (`lib/projection/calibration.ts`, localStorage profiles) is **not on this branch's base** (it exists only as uncommitted work in the main tree). `projectionProfile.ts` therefore mirrors its key/shape read‑only: the therapist can pick a saved FLOOR profile; its rotation, safe inset and measured size are copied into the game config (so they reach the Display on the other device). Replace the mirror with the shared import at merge. It is a software layout setting, not an alignment proof.

## 6. Therapist controls (all manual‑completable without sensors)

Start / pause / resume / safety stop / next / skip stage / restart stage / restart run / end (with confirmations), level+stage grid, layout, orientation, mirror, width, spacing, star density, cone style, stop duration, stops on/off, dynamic events on/off, event wait length, confirm, assisted, repeat, back one star, skip, end hold early, route deviation, cone touch, continue now, reset manual moves, sound/music/voice/volume, reduced motion, reduced effects, high contrast, minimal HUD, quality.

## 7. Sensors (foot)

Foot input reuses the existing hint detector. It can only say "a foot started/stopped moving" and only matters during a stop or an event wait, where it shows a banner to the therapist. It never collects a star, ends a hold or moves the route. **Only the simulated source was run. No physical sensor and no real BLE path was tested.** The library launch adapter exposes MANUAL only (same as the other FOOT games).

## 8. Visual design

Procedural Three.js (no downloaded assets): orthographic near‑top‑down camera with a 10° tilt (no parallax lean, no cliffs, flat floor), PBR materials, shadows, painted canvas ground/path textures, instanced vegetation with wind sway, flowers, butterflies, palms/trees, sea with moving foam, string lights, bunting, balloons, buildings with lit windows, lanterns and glow sprites, drawn cones (lathe body, reflective band), bevelled gold stars with halos and rays, stop octagons with a hand, finish checker gate, pooled particle bursts per theme, fireworks/confetti celebrations. HUD pill chooses the least‑used screen edge so it does not cover the route.
Screenshots: `docs/turngo3d/screenshots/final-s1…s9.png` (1920×1080, real gameplay), `ctl-ready.png` (Control), `docs/turngo3d/evidence/shots/*` (cross‑device run: setup, go, pause, stage complete, event character/gate/switch, stop hold, safety, final).

## 9. Tests (what was actually run)

| Check | Result |
|---|---|
| Unit: geometry, engine, live/recovery, history, library, geometry kit | `lib/turngo3d` 50 + kit 19 + library 2 pass |
| Full vitest suite | 2034 passed, 3 failed under heavy machine load (two timeouts in `sessionRepository`, one in Space Pilot); those two files re-run alone: **51/51 pass** |
| Rules emulator (own ports 19510/19609, project demo-tg-rules) | **10/10**: lease ownership, stale/duplicate revisions, malformed engine, oversized payload, no patient id on the public record, other games still accepted, create‑only history, tampered / score‑bearing / incomplete history rejected |
| Cross‑device E2E (two Chrome processes, emulators) | **final full run on the committed code: 59/59** (`evidence/e2e-results-final.json`): setup drag/rotate/mirror/layout/density, the nine stages by touch, holds, every event kind, deviations, repeat/back, skip stage, reload recovery (Control + Display), safety, save‑once history (2 records), no score fields, no uncaught exceptions. An earlier full run (54/59, `evidence/e2e-results.json`) exposed a cone‑drag robustness gap (`setPointerCapture` on a synthetic pointer) and test‑script key errors; both were fixed before the final run. |
| `tsc --noEmit` | clean (only the Next‑generated `LayoutProps` notice that exists without my change) |
| ESLint on every file I added or changed | clean |
| Production build (`next build`, own dist dir, flag on) | compiled successfully, 56 static pages generated |

Browser‑tested (not just unit): Control↔Display synchronisation, setup drag/rotate/mirror/density, countdown, pause freeze, assisted finish, hold timing, event waits, deviation cues, back/skip/repeat, no‑sensor completion of all nine stages, reload recovery, safety stop, history saved once.

## 10. Performance (measured on this Mac's GPU, Chrome headless metal, 1920×1080, pixel ratio 1, balanced quality)

Draw calls 63–171 (stage 8, individual buildings, highest), triangles 12k–207k, frame CPU 0.8–3.1 ms, 60 fps in all stages except one sample of 35.6 fps in stage 5 taken while the full test suite was running concurrently. Stage 9: high 163 calls / low 69 / reduced‑effects 70 calls (59–60 fps). **No measurement on projector hardware or a low‑end PC exists.** Low/balanced/high quality, reduced effects, reduced motion, high contrast are implemented; textures are cached, scenes and course objects are disposed on change.

## 11. Known limitations / incomplete

* No physical projector, no real foot sensor, no real cone-contact or position detection, no audio listening test (synthesised sounds + browser speech; the browser's Arabic voice quality varies; no paid TTS is used). Speech was verified only by unit/dev logic and the `data-audio` probe, not by ear.
* Alignment between projection and physical cones is by eye; units are not centimetres unless a measured profile is chosen.
* Rules are patched in the repo (`database.rules.json` and the console copy, identical, sha256 starts `e1731488…` before later edits — re‑hash at merge) but **not published**; `docs/turngo3d/rules-patch.py` reproduces the change.
* Stage 8 uses individual meshes for buildings (171 calls); instancing would lower it.
* Cone drag was exercised with synthetic pointer events in the browser, not with a real finger on an iPad.
* The 3 s countdown is fixed; the intro sentence is spoken during it on the first stage of a run.

## 12. Concurrent‑work / merge notes

* Built in an isolated worktree from the clean commit; the main tree (224 modified files, Castle Legends, visits, calibration, UI cleanup) was not touched. Rhythm Steps lives on its own branch/worktree.
* Shared files touched (small, additive): `lib/games/registry.ts`, `lib/games/library/capabilities.ts`, `components/display/gameDisplayRegistry.tsx`, `lib/realtime/{types,sessionRepository}.ts`, `lib/sessions/{types,sessionHistoryRepository}.ts`, `lib/analytics/patientAnalytics.ts`, `lib/audio/AudioManager.ts` (+ its prefetch test), library `gameThumbnails`/`realGameThumbnails`/tests (counts 13→14, FOOT section 7→8, assumes Rhythm Steps is not yet merged — if both merge, counts become 15 / FOOT 9), `database.rules.json` + console copy, thumbnail provenance, patient history screens.
* **When merging with the visit system** add `'tg3'` to the `suffixed` engine list in `lib/therapyVisits/gameSafety.ts` (history key is `${sessionId}-r${run}`; Rhythm Steps `rs3` needs the same).
* When merging with the shared calibration/skill‑tag modules: swap `projectionProfile.ts` for the shared import; `activitySkills` is already provided.
* `tsconfig.json`/`next-env.d.ts` were rewritten by `next dev` in the worktree; they are not part of the change (restore before committing).
* Test hygiene: dev servers/build dirs `.next-tg*`, ports 3631/3632/19510/19609, Chrome profiles under `/tmp`; kill by port only.
