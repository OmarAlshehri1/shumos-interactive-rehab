# Follow the Footsteps 3D — The Enchanted Forest (اتبع الخطوات): final report

Date: 2026-10-11. Canonical game id `follow-the-footsteps` (unchanged). Software release candidate.
Nothing was committed, pushed or deployed, and no Firebase rules were published. All Firebase testing used local emulators on dedicated ports (19300 / 19399); the real `.env.local` was never read. Browser runs used a scratch copy of the tree (with deletions mirrored), so the shared tree's `.next`, Codex's servers and emulators were not touched.

## 1. Phase status

| Phase | Status |
|---|---|
| F1 Legacy inspection and preservation | **Done.** Original left untouched and reachable (flag off, or internally at `/control/follow-the-footsteps-legacy`) |
| F2 Enchanted Forest world | **Done**, three worlds, checked in real screenshots |
| F3 Magical stepping stones | **Done**: idle / target / success / completed / paused states |
| F4 Nine-stage gameplay | **Done**: 3 levels × 3 stages, 54 steps, safe path generator |
| F5 Full therapist manual control | **Done**, nine stages played by touch on a separate Control device |
| F6 Foot-sensor preparation | **Done as prepared and simulated**; no physical sensor validated |
| F7 Replace legacy in Shumos | **Done**: one library card, canonical route and id, versioned history |
| F8 Validation and visual gate | **Done** for software. Real screenshots and a real gameplay video inspected |
| F9 Release preparation | **Done.** Merged rules, flag, rollback and batch steps below |

## 2. Original versus new
| | Original | Enchanted Forest 3D |
|---|---|---|
| Theme | Cosmic / space | Enchanted forest, three worlds |
| Stages | 5 per level (15), footprint path with checkpoints and obstacles | 3 per level (9), large stepping stones |
| View | 2D | Stable top-down floor projection (opt-in cinematic preview) |
| Record | `FootstepsSessionState` (untagged) | `engine: "fp3"` on the same `/liveSession` |
| History | Five-stage record, no `resultVersion` | `resultVersion: 2`, `engine: "fp3-forest"` |
| Sensors | Pointer-hand layer | Movement hints only; therapist confirms every step |

Both live side by side: a session's own tag selects the Display module (`FootstepsDisplayModule`), and the feature flag selects the Control route.

## 3. Visual design (original procedural art, nothing downloaded)
Checked in `evidence/screenshots/` and `evidence/video/gameplay.mp4`.
- **Ground and light:** tileable painted grass (blades plus soft colour drift) with colour patches, warm sun with soft shadows (intensity 0.5, so a shadow never darkens a stone enough to hurt readability), dappled-leaf light drifting slowly, ACES colour grading per world.
- **River:** a flowing shallow river (custom shader: flowing noise, highlight streaks, foam at the banks) over a sandy bed with instanced pebbles, shoreline rocks and reeds. It is flat decoration: nothing is deep, nothing falls, no jump is ever needed.
- **Forest:** lumpy, leafy canopies (instanced, three variants, tinted per tree, trunks visible under the 12° tilt), bushes, ~230 / 120 / 80 small flowers, placed around the border and kept out of every stone's neighbourhood.
- **Life:** butterflies with painted two-lobe wings on lazy loops, drifting pollen (garden, riverside) and golden fireflies (twilight), glowing bulbs in the twilight world.
- **Worlds:** Level 1 sunny enchanted garden with a brook; Level 2 lush riverside forest with a broad river under the path; Level 3 magical twilight forest with restrained golden and cyan glow. Level 3 is cooler but kept bright: every target stays easy to see, and no extra distraction is added with difficulty.
- **Stones (F3):** each is a smooth domed mesh with an irregular outline, rounded shoulders, painted rock texture with lichen and cracks, small moss, a contact shadow. Idle: calm. **Target:** warm gold tint (the stone's own texture stays visible), a gold border that follows the stone's own outline, a soft halo outside the rim, dark-amber footprints (a left, a right or a pair, pointing toward the next stone). Exactly one stone is strongly lit; an optional faint ring shows the next one. **Success:** a gentle golden bloom, two expanding rings, a brief rise of light particles, a soft chime (sine, peak gain 0.06). The next target lights after a short beat (0.7 s) so it never competes with the celebration. **Paused:** pulses and effects hold still, the target stays identifiable. Reduced motion removes the rings and particles, freezes butterflies and pollen, and slows the water. Never a flash.
- **Floor safety (F8.4):** orthographic camera, a fixed 12° tilt with the ground compensated (stretched by 1/cos so ground shapes keep their true proportions); it never moves (verified), no deep-hole illusion, no characters on the child Display, safe margins (default 4%, 0–15%).

## 4. Nine-stage gameplay
Every stage is a short sequence of large stones; the therapist confirms each step; nothing is timed and nothing fails.

| Level | Stage | Pattern | Steps |
|---|---|---|---|
| 1 | 1 | One large target at a time, short hops | 4 |
| 1 | 2 | Simple straight sequence | 5 |
| 1 | 3 | Gentle left / right changes | 5 |
| 2 | 1 | Alternating right and left foot cues | 6 |
| 2 | 2 | Gentle curved path | 6 |
| 2 | 3 | Straight, with optional rest pauses after steps 3 and 5 | 7 |
| 3 | 1 | Longer path with varied directions | 7 |
| 3 | 2 | Two-step memory: each pair is shown, then stepped (visual assistance optional) | 6 (3 pairs) |
| 3 | 3 | Combined: straight, curve, zigzag | 8 |

Therapist-adjustable (when paused or between stages; locked while a step runs): stone size 70–120%, distance between stones 60–100%, total movement range 50–100%, safe margin, projector ratio, preview of the next stone, memory assistance and preview time, rest pauses, graphics preset. Skip step, skip stage, repeat cue, assisted step, pause, resume and restart are always available.

**Safe path generation** (tested for every stage × four projector ratios × margins 0/4/15 × stone sizes × spacings × reaches × seeds): every stone circle inside the usable area; no overlap and at least a 10% gap relative to the nearest centre distance; the longest step never exceeds 40% of the floor height; consecutive stones never merge; deterministic (a reload gives the identical path); a hostile payload that would place a stone off the floor is rejected on both devices.
**Honest size note:** on a 320 × 180 cm projected floor the default stones are about 36–65 cm across (largest early, smaller on longer paths, because the floor width is the limit). The therapist can shorten the path range or project onto a larger area.

## 5. Manual therapist control
A touch-friendly Control (RTL Arabic): synchronized stone map (numbered, state-coloured, foot cue labelled), current target and step, the foot cue, start / pause / resume / restart / repeat / confirm / assisted / skip step / skip stage / next / end, memory preview controls, results summary, an always-reachable floating **safety hold**, and a calibration panel (projector ratio; projected floor width and height in cm; **estimated** stone diameter, step distance, gap and path size; a "stretched" warning when the floor shape does not match the image). One confirmation triggers the right stone's success animation on the Display.
A confirm command names the exact stage and step it confirms, so a stale or duplicate command can never confirm a different step (exactly-once, unit-tested and browser-checked). Safety hold and reload recovery: paused, progress kept, explicit resume.

## 6. Sensors: support and limits
Prepared and **simulated only**: RIGHT_FOOT, LEFT_FOOT, DUAL_FOOT, using the shared foot-movement detector (conservative onset, rest, freshness and loss; role isolation, hands ignored; duplicate and stale events rejected). A WT901 gives motion and orientation, not an absolute foot position on the projected floor, so it **cannot** tell which stone the child stands on. A movement hint only shows the therapist a banner; it never confirms a step, moves anything or counts as a result. Losing a sensor leaves manual play intact. No BLE driver or calibration was touched, and no physical sensor has been validated.

## 7. Firebase integration (shared platform only)
Same `/liveSession`, `/controllerLease`, presence, `lib/liveGame` (controller hook, publisher, recovery, history saver, control-alive), staff authentication and `sessions` history. One tagged record (`engine: "fp3"`, one JSON payload of about 1–2 KB, validated on both ends); no new tree, no new protocol. Control is authoritative; the Display only renders. Reload recovery: same window recovers paused with a safety hold; a second live window is blocked; a stale one is adopted. Control gone: the Display falls back to a calm forest with nothing highlighted and a waiting card.

## 8. History compatibility
New record (counts only, therapist-confirmed): `resultVersion: 2`, `engine: "fp3-forest"`, the original field names (so the existing history readers work), plus `totalAssists`, `inputSource`, per-stage rows `{engine:'fp3', stepsPresented, stepsCompleted, assists}`. Original five-stage records have neither marker and are routed to their original reviver, unchanged (tested). A malformed 3D record is rejected rather than read as an original one. A restart is a new record (`-r1`). Saved once (verified across Control and Display reloads); walk-ins are not saved; empty sessions are not saved. The resume suggestion now treats `fp3` as three stages per level (it would otherwise suggest a non-existent "stage 4").
**Not verified:** how the existing session-history *detail* screen renders the new record visually (it reads field-compatible data and compiles; I did not screenshot it).

## 9. Files
New (game-specific): `lib/footsteps3d/` (`registration`, `world`, `stages`, `engine`, `live`, `history`, `useSession`, `rng`, `__tests__/`: engine, crossDevice, libraryIntegration, displayModule, resume, rules.emulator); `components/display/footsteps3d/` (`scene`, `textures`, `FootCanvas`, `FootView`, `useChime`, `foot.module.css`); `components/display/games/FootstepsDisplayModule.tsx`; `components/control/footsteps3d/` (`FootControl`, `StoneMap`, `CalibrationPanel`, `FootstepsForestThumbnail`, `control.module.css`); `app/control/follow-the-footsteps-legacy/page.tsx`; `docs/footsteps3d/`.
Shared files, minimal anchored edits (Codex's concurrent changes preserved): `lib/games/registry.ts`, `lib/realtime/types.ts`, `lib/realtime/sessionRepository.ts`, `lib/sessions/types.ts`, `lib/sessions/sessionHistoryRepository.ts`, `lib/sessions/resumeSuggestion.ts`, `components/display/gameDisplayRegistry.tsx`, `components/display/DisplayScreen.tsx` (three small hooks: no voice prefetch, silent audio profile, no cosmic background for fp3), `components/control/library/gameThumbnails.tsx`, `app/control/follow-the-footsteps/page.tsx` (flag switch), `.env.example`, `database.rules.json`.

## 10. Firebase rule changes (not deployed)
No new top-level node. (1) `liveSession` write for an `fp3` record requires the controller lease and `session.fp3.ownerId == auth.uid`; (2) the `fp3` session block shape and 32 KB payload bound; (3) the `follow-the-footsteps` history branch accepts either the original shape or `resultVersion 2` + `engine 'fp3-forest'` + `totalAssists`, `completionRate`, `inputSource`; (4) the `engine` field accepts `fp3-forest` for this game at version 2; (5) `totalAssists ≤ totalStepsCompleted` for version 2; (6) version-2 history requires the patient to exist. Original records are still accepted (tested).
Complete merged file: `docs/footsteps3d/DATABASE_RULES_MERGED_FOR_FIREBASE_CONSOLE.json`, SHA-256 `cf8ae5770bdfc4424db48ac8fef7deae9d9c8711e5868e50c9b62e5ff8f5ff16`. It contains everyone's additions as of writing (Codex is still editing this file: re-check the hash before publishing).

## 11. Tests
| Gate | Result |
|---|---|
| `tsc --noEmit` | 0 errors in source. (Stale `.next/types` in the shared tree reference route folders Codex is deleting; they are Codex's dev-server output, not source) |
| ESLint, whole repo | 0 errors, 0 warnings |
| Vitest, full repo | **144 files passed, 8 skipped; 1,787 tests passed, 58 skipped** (skipped = opt-in emulator suites) |
| Follow the Footsteps unit tests | 52 (engine, path safety across all settings, exactly-once, rest and memory, sensor hints, live record and hostile payloads, recovery, history routing, library, display routing, resume) + 9 emulator |
| Emulator rules, final shared rules | Follow the Footsteps **9/9**. Other suites: Balloon 4, Mirror 5, platform 12, Runner 7, Space Pilot 5 pass |
| Production build, flag on | succeeds; routes present |
| Production build, flag off | succeeds; the library shows one original card and the canonical route serves the original Control (browser-verified) |

**Suites that did not pass and are not mine:** Codex's Wonder Dome rules suite fails (verified: it fails identically with all my rule edits mechanically reversed), and the Build Quest "all existing games" check fails on `feed-the-animals`, which Codex has removed from the registry and rules. Both belong to their in-progress work.

Browser, production build, separate Control (iPad-sized touch) and Display (1920×1080) processes:
- **Nine stages by touch: 55/55** (all 54 steps, rests, memory previews, assisted steps; the therapist map equals the Display at all 54 steps with a measured stone-position error of 0.0000; history saved once).
- **Robustness: 31/31** (safety hold frozen for 6 s and across a Control reload, Display reload, Control disappearing and returning, blocked second window, simulated hint / loss / manual fallback, layout settings locked while running, calibration estimate vs rendered stone width: 62 cm estimated, 62.4 cm rendered, stretched-floor warning, stable camera, cinematic opt-in, three graphics presets, reduced motion, other games and the original sensor-play route).
- **Final integration: 28/28** (exactly one card, canonical route, separate Display, start / confirm / assist / repeat / pause / resume / skip / skip stage / restart / end, reload recovery, history once and the restarted run, no patient id on the public record, non-staff and signed-out visitors denied, rollback route, Mirror Quest, Safe Hex Arena, Balloon Quest, Color Chase).
- **Flag-off rollback: 2/2.**

## 12. Performance (development laptop, local emulator, production build unless noted)
- 60 fps in every steady sample. Draw calls 74–106 (4–8 stones at High), 30 (Low), 66 (Medium); triangles about 49k (Low), 98k (Medium), 189k (High).
- **Soak, 201 s (development server) with 94 confirmed steps across 16 scene rebuilds:** GPU geometries 22–37 with no growth, textures 13–18, JS heap 34–64 MB with no upward trend, 0.66 shared-record writes/s; frame rate dipped to about 51 at a scene rebuild once.
- **Stage-change hitch:** a scene rebuild blocks the main thread for up to about 260 ms (18 long tasks in 200 s), always behind the stage-complete or ready card, never mid-step.
- Nine-stage run: 71 writes in 24 s while confirming every ~0.4 s (the steady rate is about 0.7/s).
- Control tap → Display accepts the step: p50 131 ms, p95 147 ms. This includes the test harness's own tap dispatch (≈ 100 ms) and is same-machine, **not a network measurement**.
- Not measured: a real projector, a real network, iPad hardware, WT901 sensors.

## 13. Evidence
`docs/footsteps3d/evidence/`: 29 screenshots (all three worlds in target / success / stage-complete, memory preview, rest, safety hold, Control lost, calibration grid, cinematic preview, Low / Medium / High, reduced motion with high contrast, therapist calibration panel, the library card, the flag-off original card and Control), **a 51-second gameplay video** (`video/gameplay.mp4`, 1280×720; real browser frames captured at about 9 fps and stitched, so it shows the sequence, not 60 fps motion) and its contact sheet, and raw result JSON for every suite and the soak.

## 14. Remaining hardware and unverified items
Real projector on the floor (keystone, brightness in a bright room, true stone sizes: **physical dimensions are not verified**); iPad Safari touch ergonomics; WT901 foot sensors (what, if anything, may be inferred); the chime on the Display laptop (a browser keeps sound off until a click or key press on that page, for example the Display's own enable-sound tap); real-network latency; the session-history detail screen's look for a new record; the 12° tilt shifts a stone's top by about 1 cm relative to its footprint on the floor.

## 15. Feature flag and rollback
`NEXT_PUBLIC_FOOTSTEPS_3D=true` enables it in production (development: on unless `false`). Unset it and redeploy to serve the original game's card, Control and Display (verified). While the flag is on, the original Control remains at the internal route `/control/follow-the-footsteps-legacy` (no card), and any untagged session still renders with the original Display. No history migration is needed either way. Do not revert the rules while the new client is live.

## 16. Batch deployment steps
1. Publish the complete merged rules file (section 10) **before** the application deploy: the client writes `engine: "fp3"` records and `resultVersion 2` history that the current rules reject. Re-check its hash first.
2. Set `NEXT_PUBLIC_FOOTSTEPS_3D=true` on Vercel (no emulator variables).
3. Re-run tsc, lint, Vitest, the emulator suites and the production build on the final merged tree (Codex is editing the registry, rules and types, and is removing Feed the Animals).
4. Physical checks in section 14.
