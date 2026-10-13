# Achievement City 3D — مدينة الإنجازات · Final report

Branch `feature/achievement-city-3d` (worktree `../shumos-achievement-city`), based on the committed `fb869e3` of `main`. Game id `achievement-city-3d`, engine tag `ac3`, library category `INTERACTIVE_REWARDS` (ألعاب التحفيز التفاعلي).

**Nothing is pushed, deployed or published. Firebase rules are patched in the repository files only; the console was never touched. No environment variable was changed.**

Legend: **IMPLEMENTED** (code) · **BROWSER TESTED** (real Chrome, real GPU on this Mac, local Firebase emulators, two separate Chrome processes) · **SIMULATED** · **PHYSICAL HARDWARE UNVERIFIED** · **NOT IMPLEMENTED**.

---

## 1. Concurrency safety (what was and was not touched)

* `main` had uncommitted YouTube / security / Control-UX work (`app/display/page.tsx`, `ControlNav.tsx`, `GameSafetyProvider.tsx`, `sessionRepository.ts`, `database.rules.json`, `app/api/*`, `lib/youtube/*` …). **None of it was read into, modified, stashed, reset or cleaned.** The worktree was created from the committed `fb869e3`; the sibling worktrees (body-sequence, foot-maze, rhythm-steps, turn-and-go) were not touched.
* No `git reset/clean/stash/cherry-pick/merge` was used. `node_modules` in the worktree is an APFS clone (`cp -c`) of the main one (Turbopack rejects a symlinked `node_modules`).
* Every shared file edit is small and listed in §13 so it can be re-applied on top of whatever Codex / YouTube work lands first.

## 2. Architecture (one canonical game, no new infrastructure)

* Publishes into the existing `/liveSession` through `lib/liveGame/*` (lease, ownership, heartbeat, takeover, recovery) exactly like Body Sequence / Turn & Go. History through the existing `saveSessionHistoryOnce` + `HistorySaver`. Parent therapy visits link through the existing generic `visitResultClaims` / `therapyVisits` rules. No new Firebase tree, project, auth, Display URL, launcher, calibration system or Bluetooth stack.
* `lib/achievementcity/` — `engine.ts` (pure reducer), `milestones.ts` (three levels, milestone mapping), `config.ts`, `live.ts` (versioned payload codec/validator/recovery), `history.ts`, `gamepad.ts` (button edge detector), `useSession.ts` (Control runtime), `registration.ts` (flag `NEXT_PUBLIC_ACHIEVEMENT_CITY_3D`: dev on unless `false`, production opt-in).
* Display `components/display/achievementcity3d/` (Three.js, no new dependency: `three` is already in `package.json`; post-processing comes from `three/examples/jsm`): `terrain.ts`, `env.ts` (sky + day/night), `kit.ts` (materials, facades, `Build` class), `builders1/2/3.ts` (the 32 milestone builders), `towers.ts`, `roads.ts`, `forest.ts`, `life.ts`, `fx.ts`, `scene.ts`, `audio.ts`, `AchievementCityView/Canvas.tsx`, `DevPreview.tsx`.
* Control `components/control/achievementcity3d/` (light Shumos design). Routes `/control/achievement-city-3d`, `/display/achievement-city-3d`, dev-only `/dev/achievement-city-preview`.
* **Assets / licensing:** everything is generated in code (geometry, canvas textures, GLSL, WebAudio synth). No third-party model, texture, font or audio file → nothing to license or attribute.

## 3. Exactly three levels — no stages

* `LEVELS` has 3 entries; the state has no `stage` field (unit-tested); the setup screen has three cards and no stage/nine-stage selector (browser-tested: no `[data-stage-choice]`, no «المرحلة N» text). The live record mirrors the level into the shared `currentStage` only so shared consumers keep working.
* A level is a list of construction milestones, not stages: village **10**, city **11**, grand city **11** (names in `milestones.ts`).
* **Mapping to any target (3–30):** completed = ⌊M·done/target⌋ (integer arithmetic); the next milestone shows partial construction (capped at 90 % until it completes). Target 6 on the 10-building village completes several buildings per confirmation; target 15 gives a visible construction step on every confirmation (unit-tested for 3/6/10/15/30).
* **One continuous world.** Level 2 and 3 render the earlier levels as a completed *visual baseline*. Direct selection of level 2/3 builds the baseline and records **nothing** (browser-tested: no history, and the saved record has only the played level).

## 4. Therapist controls (all BROWSER TESTED)

Setup: exercise name (free text, examples only), target stepper + presets 6/10/15/20, projection (wall), input mode (on-screen / controller), three level cards with real captures, compact extra-options section (sound, music, voice, camera drift, reduced motion/effects, contrast, minimal HUD, quality, wall projection profile + safe inset).
Play: **تأكيد إنجاز** (≥ 132 px tall, full width), **تأكيد بمساعدة**, **تراجع**, **تخطّي تمرين**, pause/resume, safety stop, restart (confirmation), safe end (confirmation), results, therapist notes, next level / finish. Every valid press increments once; presses < 300 ms apart are one (counted as `ignored`, never recorded). Undo pops only the most recent open confirmation of the current level, also un-completes a just-completed level, never works after the session ended, and never reaches into a previous level.

## 5. Controller (therapist-held) — SIMULATED only

No shared button-edge adapter existed (shared Gamepad code is axis/steering oriented: `pearlvoyage3d/input.ts`, `capabilities.ts`). `gamepad.ts` follows the same conventions (standard Gamepad API, therapist-configurable button, freshness gate, sampled in the game's single session loop — no second polling engine). One physical press = one confirmation; hold never repeats; a button already held when the pad appears/reconnects never fires; stale reports are rejected; 300 ms debounce; disconnect is reported and the on-screen button keeps working; a "learn button" flow assigns the button (stored in `localStorage`). Unit-tested (8 tests) and browser-tested by injecting a fake `navigator.getGamepads` into the real Control page. **No physical controller, Joy-Con or Bluetooth device was used; compatibility is not claimed.** A press means "the therapist confirms", never that movement was detected.

## 6. 3D art and animation

* Stylized procedural diorama: noise terrain with hills, far mountains, river, beaches, island coast; custom water shader (baked depth map → turquoise shallows / deep blue, ripples, sun glint, shore foam); gradient sky with sun, stars and drifting low-poly clouds; ~900 background trees (instanced, swaying) and wildflower meadows; ACES tone mapping, soft shadows, optional bloom.
* **Level 1:** cottages (3 variants), village path with lamps, farm (3 crop fields, barn, silo, hay, rotating windmill), trees/flowers, market stalls, playground (slide, swings, seesaw, merry-go-round), fountain with jets, more houses, festival bunting/lanterns/entrance arch with Arabic sign.
* **Level 2:** road network with kerbs and lamps, apartment blocks, school with clock tower and court, hospital with helipad/ambulance, mall with parking, public park with pond/gazebo, red arch bridge assembling segment by segment, seaport (quay, cranes, containers, warehouse), residential district, airport (runway, lights, terminal, tower, hangars), city hall + clock tower with a real canvas clock. Ambient: cars on lane loops (incl. across the bridge), pedestrians, cargo ships, a river tug, airplanes taking off and landing, birds.
* **Level 3:** skyscrapers (slab/stepped/round/crown/twin), observation landmark tower, stadium, elevated metro with a station and moving train, expanded port + cruise ship, large parks and street trees, cable-stayed bridge, 14 more towers (skyline), airport concourse/jet bridges/radar, waterfront boardwalk with a lighthouse and sweeping beam, sailboats, night illumination (windows glow from a shared night value, lamps, string lights, uplights). Time of day moves from morning (L1) to golden hour (L2) to blue-hour dusk (L3).
* **Construction animation:** every milestone is a `Build` of timed parts (foundations rise, walls rise, roofs drop in, details pop, roads extend by draw range, trees grow, cranes/arches/cables assemble), with dust, a golden ring + sparkles on completion, a toast naming what was built, and a camera lean toward the construction. Targets drive the animation (never events), so: reload never re-animates or duplicates; undo plays the build in reverse; several confirmations queue and automatically fast-forward (×2/×4/×8 when 3/7/13 builds are pending) — the therapist never waits to confirm the next exercise. Finished builds are merged per material (≈ 10 → 3 draw calls each).
* Celebrations: level-complete banner + gentle fireworks/confetti (additive soft sprites, no full-screen flashes); finale adds a slow camera pull-back and sweep. Reduced motion/effects settings exist.

## 7. Audio — not listened to by a human

Shared `lib/audio/primitives` synth + the shared speech provider; no audio files. Soft ambient pad, construction taps/whoosh, confirm chime, milestone ding, level jingle, finale fanfare. Spoken only: the opening line («كل ما تنجز تمرينك، بنبني جزءًا جديدًا من مدينتك!»), one halfway line (target ≥ 6), level completion, final — never after every achievement. Respects Display audio readiness (shows a tap-to-enable hint), mute, and per-game sound/voice/volume. Only call counts were checked; Arabic voice availability depends on the Display browser.

## 8. History and parent visit

One record per run (`sessionId-r{run}`, `resultVersion 1`, engine `ac3`): exercise title, starting/ending level, target, confirmed, assisted, skipped, undo count, levels completed, COMPLETED/PARTIAL, therapist notes, input source, controller-confirmation count, elapsed + active time, per-level rows (1..3). **No score / accuracy / speed** (rules forbid them). Compatibility fields `startingDifficulty/endingDifficulty/startingStage/endingStage/completedStageCount/skippedStageCount` mirror the level for shared analytics; the UI never shows them as stages. Patient history row, session detail, last-progress card and visit workspace have Arabic level-based branches. Save-once: browser-tested (exactly one record after waiting; partial run saves one more). Visit linking: **rules-tested** (saved result → immutable claim → visit entry; unsaved/foreign refused) and the shared guard (`gameSafety`, engine tag `ac3`) unit-tested; the visit-workspace *UI* flow was not driven in a browser.

## 9. New category

`ألعاب التحفيز التفاعلي` (sparkles icon) is a new filter and a separate section in the All view (after the four device sections); its dedicated filter shows only Achievement City; membership lives in `ACTIVITY_CATEGORY_GAMES` (extensible, nothing else implemented). Achievement City is in **no** device filter (hand 7 / foot 13 / joystick 6 / driving 3 unchanged). Library shows 20 games.

## 10. Tests executed (all on this Mac)

| Check | Result |
|---|---|
| Unit: `vitest run` (whole repo) | **192 files pass, 2321 tests** (+36 new for this game: engine, milestones, mapping, undo, debounce, gamepad, codec, history, library, builders ↔ milestones) |
| Firebase rules emulator (`validate-rules.py`, all games) | **20/20 files, 149 tests**, incl. this game's **11**: lease fencing, stale revisions, payload bounds, no patient id on public record, create-only history, tamper/score/unknown-field/ghost-patient/4th-level-row rejection, other games unaffected, parent-visit link + immutable claim |
| Cross-device browser E2E (`validation/e2e.mjs`, iPad-sized Control + 1920×1080 Display, separate Chrome processes) | **61/61** |
| `tsc --noEmit` | clean |
| `eslint` | 0 errors (7 pre-existing warnings in other games' scripts) |
| `next build` (flag on) | OK, `/control/achievement-city-3d` and `/display/achievement-city-3d` built |

E2E covers: three cards/no stages, direct level selection baselines, target/exercise sync, start, one confirmation = one count on both devices, building appears then finishes, triple click = 1, assisted, undo, skip, pause/resume, restart + nothing saved, gamepad (none/connected/press/hold/bounce/second press/disconnect/fallback/already-held), level completion, village fully built, Control reload recovery (never auto-resumes, exact counts, no re-animation), level 2→3, finale, all 32 milestones built and merged, finish, save-once history (+ field content), direct level-3 partial run saves only level 3, library category (All view, filter, 20 games, other filters unchanged), no uncaught exceptions.

## 11. Performance (measured, this Mac, real GPU, headless Chrome 1920×1080, `validation/perf.mjs`)

| Scene | fps | CPU ms/frame in `draw` | draw calls* | triangles |
|---|---|---|---|---|
| L1 empty | 60 | 1.3 | 14 | 211k |
| L1 complete | 60 | 2.4 | 201 | 231k |
| L2 complete | 60 | 3.2 | 772 | 427k |
| L3 complete (finale + fireworks) | 60 | 5.3 | 1080 | 466k |
| L3 complete, 4K | 33 | 5.8 | 1080 | 466k |
| L3 complete, quality = low | 60 | 3.4 | 542 | 160k |
| L3 complete, quality = high (bloom + 4096 shadows) | 27 | 5.9 | – | – |

\*includes the shadow pass. The shadow map refreshes every other frame (that change took L3 from ~47 → 60 fps). `balanced` (default) has no bloom; `high` is not recommended without testing on the real Display PC. GPU time is not measured. **Not profiled on a projector PC or a weak GPU.** Geometry of merged builds is kept (hidden) so undo can reverse a build: ~3200 geometry objects at the end of level 3 (memory, not draw cost).

## 12. Known limitations / NOT verified

* **PHYSICAL HARDWARE UNVERIFIED:** physical controller/Joy-Con/Bluetooth, projector, real wall surface, real child, real audio by ear, Safari/iPad Display, weak-GPU Display.
* **Not browser-driven:** the therapy-visit workspace UI (rules + unit level only); cross-browser (only Chrome).
* Art is stylized procedural, not photoreal; stadium, cars (no headlights), pedestrians (tiny) and aircraft are simple models.
* The undo window is the current level's open confirmations (it cannot reach back into a previous level once the next level started).
* `unprofiled`: the Arabic text on the festival arch and clock canvases depends on the Display machine's fonts.
* **Rules size:** minified `database.rules.json` is 280,542 B (baseline 273,484 B, +7,058 B). Verify the Firebase console accepts it before publishing (the baseline was already of this magnitude).
* The shared Display dev-overlay (bottom-right debug text in screenshots) is the existing `DisplayScreen` diagnostics, not part of this game.

## 13. Shared-file integration requirements (merge notes)

Preferred approach: **do not text-merge `database.rules.json`** — apply `python3 docs/achievementcity3d/rules-patch.py` on the final merged rules (idempotent, wraps existing expressions, updates both `database.rules.json` and the console copy), then re-run `validate-rules.py` and re-check hashes. Current patched SHA-256 of `database.rules.json` = console copy: `ea13678fec28e8ca927bc545975ad5e367c3cbc205896ed5e98722532725a3bf` (will differ after a merge with YouTube's rules).

Small edits in shared files (each is an additive line or branch):
`lib/games/registry.ts` (GameId, import, entry) · `lib/games/library/capabilities.ts` (`TARGET_PROJECTION`, `ACTIVITY_CATEGORY_GAMES`) · `lib/games/library/filters.ts` · `components/control/library/{presentation.ts,GameLibraryScreen.tsx,InteractionIcon.tsx,gameThumbnails.tsx,realGameThumbnails.ts}` · `lib/games/setup/introduction.ts` · `lib/realtime/{types.ts,sessionRepository.ts}` (**also touched by the uncommitted YouTube work** — re-apply the single `achievement-city-3d` branch in `parseLiveSessionValue`) · `lib/sessions/{types.ts,sessionHistoryRepository.ts,historicalGames.ts}` · `lib/analytics/patientAnalytics.ts` · `lib/audio/AudioManager.ts` (+ its prefetch test type) · `lib/therapyVisits/gameSafety.ts` (`"ac3"` in `suffixed`) · `components/display/gameDisplayRegistry.tsx` · patient/visit screens `LastProgressCard.tsx`, `SessionDetailScreen.tsx` (**likely overlaps Codex's session-history work**), `SessionHistoryRow.tsx`, `visits/VisitWorkspace.tsx` · tests whose counts moved 19→20: `presentation.test.ts`, `thumbnails.test.ts`, `unifiedGames.test.ts` · `docs/release/library-evidence/thumbnail-provenance.json` (+ source png).
Assets: `public/library-thumbnails/achievement-city-3d.webp`, `public/control-stage-previews/achievement-city/{1,2,3}.webp`.
Rollback: unset `NEXT_PUBLIC_ACHIEVEMENT_CITY_3D` (production is opt-in) and redeploy; history already saved keeps its Arabic name via `historicalGames.ts`.

## 14. Reproduce

`validation/emulators.sh` (RTDB 19760 / Auth 19769, project `demo-ac-rules`, Java 21) · `validation/dev-emu.sh dev` (app on 3743) · `node validation/e2e.mjs ../evidence` · `AC_RULES_EMULATOR=1 npx vitest run lib/achievementcity/__tests__/rules.emulator.test.ts` · `validation/shots.mjs` / `perf.mjs` / `bake-check.mjs` against the dev preview on 3742 (`AC_GPU=1` for the real GPU). Screenshots: `docs/achievementcity3d/screenshots` (11 numbered captures + level-card sources) and `docs/achievementcity3d/evidence/shots` (E2E captures of Control and Display).
