# Safe Hex Arena 3D (الأرض الآمنة) — final report

Date: 2026-10-10. Game id `safe-hex-arena-3d`. Nothing was committed, pushed or deployed, and no Firebase rules were published.
All Firebase testing used local emulators on dedicated ports (19300 / 19399); the real `.env.local` was never read.
Browser runs were done in a scratch copy of the tree, so the shared tree's `.next`, Codex's dev servers and emulators were not touched.

## 1. Phase status

| Phase | Status | Evidence |
|---|---|---|
| H1 Inspection and floor-sensor feasibility | **Done.** Capability matrix below; no absolute-tile claim anywhere | `lib/safehexarena3d/sensorInput.ts`, tests |
| H2 Premium 3D arena and floor projection | **Done** (software). Not measured on a real projector | screenshots, 60 fps |
| H3 Nine-stage engine | **Done** | 47 unit tests, 41 rounds played in browser |
| H4 Manual therapist control and cross-device | **Done** | 81/81 nine-stage browser run |
| H5 Foot sensor adapters | **Done as prepared and simulated.** No physical sensor validated | detector tests, sim in browser |
| H6 Platform integration | **Done** (shared `/liveSession`, library, history, rules) | registry test, browser, emulator |
| H7 Validation | **Done** for software | section 9 |

## 2. Files

New, game-specific (nothing else of another game is modified by them):
- `lib/safehexarena3d/`: `registration.ts`, `geometry.ts`, `stages.ts`, `engine.ts`, `sensorInput.ts`, `live.ts`, `history.ts`, `useSession.ts`, `__tests__/` (engine, sensorInput, crossDevice, libraryIntegration, rules.emulator)
- `components/display/safehexarena3d/`: `scene.ts`, `HexCanvas.tsx`, `HexView.tsx`, `useCue.ts`, `hex.module.css`
- `components/display/games/SafeHexDisplayModule.tsx`
- `components/control/safehexarena3d/`: `HexControl.tsx`, `HexMap.tsx`, `HexThumbnail.tsx`, `control.module.css`
- `app/control/safe-hex-arena-3d/page.tsx`, `app/display/safe-hex-arena-3d/page.tsx`
- `docs/safehexarena3d/` (this report, `validation/*.mjs`, `evidence/`, `DATABASE_RULES_MERGED_FOR_FIREBASE_CONSOLE.json`)

Shared files edited. Every edit is a small, additive, anchored patch, and the other agent's changes were preserved:
- `lib/games/registry.ts`: import, `GameId` union member, one flag-gated registry entry
- `lib/realtime/types.ts`, `lib/realtime/sessionRepository.ts`: record type and one reviver branch
- `lib/sessions/types.ts`, `lib/sessions/sessionHistoryRepository.ts`: history type and one reviver branch
- `components/display/gameDisplayRegistry.tsx`, `components/control/library/gameThumbnails.tsx`: one entry each
- `lib/audio/AudioManager.ts`: two switch cases (silent game), `lib/audio/__tests__/prefetchLines.test.ts`: one type member
- `lib/analytics/patientAnalytics.ts`, `components/control/patients/SessionHistoryRow.tsx`, `SessionDetailScreen.tsx`: history display for the new record
- `database.rules.json`, `.env.example`

## 3. Visual design
Original design (the reference image was used only as a mood reference). Real extruded, bevelled hexagon tiles (`ExtrudeGeometry`, 4 bevel segments), a hemisphere plus one shadow-casting directional light, soft shadows onto a dark base plate, and a refined single blue for every safe tile. Each state also carries a pattern or icon, so colour is never the only cue:
- SAFE: blue, inner ring and dot.
- WARNING: amber, hazard stripes and a "!" triangle. The amber ramps in gradually over the first 40% of the warning, and there is no flashing, only a ±7% slow glow that reduced-motion turns off.
- INACTIVE: dim, translucent, dashed outline and a bar. Same height, no hole, no falling.
- RESTORING: slow return to blue.
- A white ring with footprints marks the therapist-confirmed tile.

No texture downloads (three small canvases drawn once). 38–66 draw calls, about 2–4k triangles.

**Floor projection mode (default):** orthographic, straight-down camera, so a projected hexagon has the true proportions of the physical one. The camera never moves during play. Safe margin 0–15%, grid scale 70–110%, optional calibration grid (true cell outlines, centre cross), and reload-safe settings. **Cinematic** perspective is a separate opt-in preview. The browser test shows the Display tile positions equal the therapist map positions (max normalised error 0.0000).

Accessibility: high contrast, reduced motion, intensity 50–100%, optional soft sine cues (peak gain 0.05, off by default), no required reading (symbols, large tiles), therapist-adjustable pace.

## 4. Nine-stage gameplay
3 levels × 3 stages, deterministic definitions in `stages.ts`; rounds and warned tiles: L1 9 tiles, 3/3/4 rounds, 1/1/≤2 warned; L2 12 tiles, 4/5/5 rounds, 2/2/≤3; L3 16 tiles, 5/6/6 rounds, ≤3/≤3/≤4 (41 rounds). Seeded generator guarantees, tested for every stage × round × 15 seeds × every child tile × both targeting modes:
at least one safe tile; every warned tile touches a safe tile (a one-tile step always exists, no forced jump, no trap); the safe region stays connected; no change after warning starts; same input gives the same set. The child's tile is never guessed: when unknown, the set is pure seeded; when the therapist has confirmed it, it is (optionally) included to practise a one-tile step.

Timing: prep 4 s, warning 5 s default, all adjustable (warning 2–30 s, +3 s extend, pause, automatic timing off, manual "hide tiles"). `inactive` never ends by itself. There is no failure and no game over. Measured automatic cycle in the browser: warning 4.8–5.1 s.

Scoring is counts only: rounds presented / completed, therapist-confirmed transitions, assisted transitions, stages completed or skipped.

## 5. Therapist manual control
Everything works from an iPad with no sensor: touch hexagon map using the same geometry as the Display (numbered tiles, state colour plus icon, child marker, dashed green hints for safe neighbours of a warned tile). Select a tile, then act — nothing changes on tap alone: "هنا يقف الطفل" (set or correct the tile), confirm safe transition, assisted transition, repeat, skip round, skip stage, start warning, extend, hide, pause/resume, restart, end. A fixed, always-visible **safety button** freezes the current layout, blocks automatic advancement, keeps progress, and requires an explicit "resume after safety". Lost connection auto-applies the same hold on Control, and the Display falls back to an all-safe arena with a waiting card (judged on local receipt time, 15 s). Verified: frozen for 9 s (> warning time), survives a Control reload, never self-resumes.

## 6. Sensors: support and limits
Honest capability matrix (also `CAPABILITY_MATRIX` in code):

| Mode | Manual tile confirmation | Movement onset / rest / freshness | Absolute tile | Physical hardware |
|---|---|---|---|---|
| MANUAL | yes | n/a | no | n/a |
| RIGHT_FOOT | yes | simulated only | **no** | pending validation |
| LEFT_FOOT | yes | simulated only | **no** | pending validation |
| DUAL_FOOT | yes | simulated only | **no** | pending validation |

The projector gives a picture, not tracking, and one WT901 gives motion and orientation, not a 2D floor position. A foot sensor therefore yields only a movement hint (conservative thresholds: onset ≥0.35 for ≥150 ms, rest ≤0.12 for ≥700 ms, stale after 1.5 s). The hint shows the therapist a banner, **never moves the child's tile and never counts as a safe transition**. Hand or unassigned devices are ignored, and duplicate/stale samples and events are rejected. Losing a sensor leaves play intact. No BLE driver or calibration was touched. The physical sources are not wired: only the simulator exists today.

## 7. Shared architecture
Uses `/liveSession`, `/controllerLease`, presence, `lib/liveGame` (controller hook, publisher, ownership/recovery, history saver, control-alive), the staff auth, and the existing create-only `sessions` history. Control is authoritative and the Display is presentation-only. The record is `engine: "hex3"` with one JSON payload (≈1–2 KB, validated on both ends). There is no game-specific Firebase tree, no new protocol, no new auth. The record carries no patient id. Reload recovery: same window recovers paused with a safety hold; a second live window is blocked; a stale one is adopted.

## 8. Firebase rule changes (not deployed)
Only the game id and one history branch, no new top-level node:
1. `liveSession` write: for `safe-hex-arena-3d`, the writer must hold the controller lease and own the record (`session.hex3.ownerId == auth.uid`).
2. `liveSession.gameId` and history `gameId` enums: add the id.
3. `liveSession.session` validate: `engine == 'hex3'`, `engineVersion == 1`, `hex3` has `ownerId, payload, controlTabId, heartbeatAt`, payload ≤ 32768.
4. History write: the patient must exist.
5. History validate: required `resultVersion == 1`, `totalRoundsPresented`, `totalRoundsCompleted`, `totalSafeTransitions`, `totalAssists`.
6. New field `totalSafeTransitions`, gated to this game: `safe + assists == completed ≤ presented ≤ 41`.

Complete merged file: `docs/safehexarena3d/DATABASE_RULES_MERGED_FOR_FIREBASE_CONSOLE.json`, SHA-256 `71c2b14d336899ddcc7c9c7fa8e6811fc4bfaa06ac1a47da3855ab0c1a9e0913` (identical to `database.rules.json` at the time of writing; this file also contains the Mirror Quest rules Codex added, so re-check the hash before publishing).

## 9. Tests
| Gate | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| ESLint, whole repo | 0 errors, 0 warnings |
| Vitest, full repo | **144 files passed, 6 skipped; 1,840 tests passed, 47 skipped** (skipped = opt-in emulator suites, run below) |
| Safe Hex Arena unit tests | 47 (engine 20, sensor detector 7, cross-device/recovery/history 14, library registration 6) + 9 emulator |
| Firebase emulator rules, final merged rules | Safe Hex 9/9; other suites re-run against the merged rules: platform 12, Runner 7, Mirror 5, Build 6, Space Pilot 5, Balloon 4 = **48/48** |
| Production build, all flags on | succeeds; both new routes present |
| Production build, flag off | succeeds; Display route 404, Control renders not-found, card absent (unit-tested), other games unaffected |

Covered by tests: nine stages and round counts, safe-tile generation and reachability, warning/inactive transitions, pause/resume, safety override, manual confirmation, assisted transitions, sensor simulation, disconnect, manual fallback, duplicate/stale rejection, Display and Control reload, history save-once (and walk-in, retry), staff authorization (non-lease staff, non-staff, anonymous rejected), tampered payload/history rejection, legacy-game compatibility.

Browser (two separate Chrome profiles/processes, iPad touch emulation for Control, 1920×1080 Display; production build):
- **Nine stages by touch: 81/81.** The therapist map equalled the Display tile-for-tile at all 82 checks; stage layouts of 9/12/16 tiles correct; history saved exactly once with 9 stages, 41 rounds, 23 confirmed and 18 assisted; no patient id on the public record; no uncaught exceptions.
- **Robustness: 24/24** (also 24/24 on the dev server): layout parity, safety hold, Control reload, Display reload, Control disappearing (Display safe state) and returning, second window blocked, simulated foot hint, sensor loss, manual fallback, high contrast, reduced motion, calibration grid, cinematic preview, library, Balloon Quest and Color Chase still launch.

## 10. Performance (measured on a development laptop under heavy load from other agents; local emulator)
- Display: 60 fps on every sample, 36–38 draw calls (9 tiles), 66 (16 tiles).
- Soak, 240 s of automatic cycling (26 cycles): fps 60 throughout; GPU geometries constant at 4; JS heap flat at 32–37 MB; 0.47 writes/s.
- Nine-stage run: 171 shared-record writes in 181 s = 0.94/s (≈ 0.5–2 KB each).
- Control tap → Display phase change: p50 87 ms, p95 147 ms, max 217 ms. This is same-machine and emulator, so **not a network measurement**.
- Not measured: a real projector, a real network, iPad hardware, WT901 sensors.

## 11. Screenshots and video
`docs/safehexarena3d/evidence/screenshots/` (24 images): library card, Easy/Medium/Advanced Display layouts in warning, inactive and stage-complete states, therapist map in warning/inactive/stage-complete, safety hold (Display and Control), Control lost, session ended, high-contrast plus calibration grid, cinematic preview. Raw results: `evidence/results/*.json`. **No video was captured.** The library-card image predates a small thumbnail re-framing.

## 12. Remaining hardware tests
Real projector on the floor (keystone, brightness in a bright room, tile size versus physical hexagons); iPad Safari touch ergonomics; WT901 foot sensors (validated movement onset/rest signal per foot, then decide what, if anything, may be inferred); audio cues on the Display laptop (browser may keep audio suspended without a gesture); real-network latency.

## 13. Known issues and limits
- No real tile tracking exists; an "exact tile" claim would require validated tracking hardware. Therapist confirmation is mandatory.
- Foot sensors are simulation only; physical entries in the mode list are disabled and labelled pending validation.
- Safety hold keeps the current (possibly warned) layout visible, as specified; only a lost Control produces the all-safe arena.
- The Display's "Control gone" threshold is the shared 15 s; Control itself freezes immediately.
- The next stage starts "ready" (one extra tap by design). The second-window case shows a blocked message but offers no take-over button (same as Mirror Quest).
- Walk-in sessions are not saved (platform convention). Empty sessions are not saved.
- `window.__hexArena.project` is a small projection helper exposed on the Display for layout tests.
- The test cross-device runs used the emulator; both browsers were on one machine.
- Shared files are being edited concurrently by Codex (registry, rules, types); re-run the gates after both sets of changes are merged.

## 14. Feature flag and rollback
`NEXT_PUBLIC_SAFE_HEX_ARENA_3D=true` enables it in production (development: on unless `false`). Unset it and redeploy to remove the card and routes (verified). Do not revert the rules while the new client is live. Nothing is stored outside the shared records, and old clients ignore the new game id.

## 15. Batch deployment requirements
1. Publish the complete merged rules file (section 8) **before** the application deploy, because the client writes `safe-hex-arena-3d` / `engine: "hex3"` records that the current rules reject.
2. Set `NEXT_PUBLIC_SAFE_HEX_ARENA_3D=true` on Vercel (no emulator variables).
3. Re-run tsc, lint, Vitest, emulator suites and the production build on the final merged tree (Mirror Quest changes the same shared files).
4. Physical checks in section 12.

## Update: enlarged floor layout, presets and calibration
Done after the first release candidate; see `FLOOR_LAYOUT_REPORT.md`. Summary: aspect-fitted layouts (about 94 % of the limiting screen side, default margin 3 %), STANDARD / EXTRA_LARGE (6/9/12, an explicit accessibility adaptation) / COMPACT (12/16/20) presets that change only between stages, and a calibration panel with estimated physical tile size and spacing (never claimed verified). No rules change was needed (history stage rows gained an optional `tiles`). Sections 3, 4 and 9 above describe the earlier fixed grids and counts; the rules SHA in section 8 is unchanged.
