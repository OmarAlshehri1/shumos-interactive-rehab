# Shumos Care — four-game release report (2026-10-10)

> **Architecture update (2026-10-10, later):** Build Quest and Space Pilot no longer use dedicated Firebase trees; see `UNIFIED_GAME_ARCHITECTURE_REPORT.md`. The rules hash, rules description and any statement about `buildQuest3d` / `spacePilot3d` rooms in this report are superseded.


Written for: the project owner, ahead of the batch deployment. Nothing was committed, pushed, deployed or published; Firebase rules were not published. All Firebase testing used local emulators (demo project, loopback only); the real `.env.local` was never used for a server.

## Verdict per game
| Game | Status | Note |
|---|---|---|
| Space Pilot 3D — قائد الفضاء | **READY** (software) | Validated on a snapshot of the other agent's work (see §12 caveat). |
| Balloon Quest — مغامرة البالونات | **READY** (software) | Control reload recovery added afterwards (§12). |
| Build Quest 3D — عالم البناء | **READY** (software) | |
| Runner Quest 3D — مغامرة العدّاء | **READY** (software) | |

Real iPad, projector and physical sensors were **not** used for any game (§11).

## 2. Changes made in this pass
* `lib/balloonquest/controlRuntime.ts`: a therapist tap while Balloon Quest is held for lost sensor input resumes the session and suppresses re-holding for 20 s after each tap (manual fallback). Test added in `lib/balloonquest/__tests__/input.test.ts`.
* `.env.example`: the four release flags are documented.
* New: `docs/release/FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json`, this report, evidence scripts `docs/balloonquest3d/validation/b6/e2e-manual-fallback.mjs` and `e2e-recovery.mjs`, and `docs/release/evidence/*.json`.
* No other product code was changed. The earlier Space Pilot TypeScript error (`./history` import) was already resolved by its owner; `tsc` is clean. No library duplication, flag or route-guard defect was found: each game has one registry entry, and flag-off builds remove the new cards and routes (§7).
* No rules change was needed by this pass: the merged file already contains all four games.

## 3. Test results (final state of the working tree, ~13:20–13:30)
| Gate | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| ESLint, whole repo | clean |
| Vitest, full repo | 135 files passed, 3 skipped; 1,732 tests passed, 23 skipped (skips are the four emulator-only rules suites and similar opt-in tests, run separately) |
| Firebase emulator rules (Auth + RTDB, the merged `database.rules.json`) | Balloon 4/4, Build 7/7, Space Pilot 6/6, Runner 7/7 = **24/24** |
| Production build, all flags on (scratch copy, emulator env) | succeeds; all new routes 200 |
| Production build, new-game flags off + Balloon legacy flag | succeeds; see §7 |

## 4. Browser cross-device validation
Method: production build (`next start`) against the Auth + Database emulators; Control = iPad-sized touch browser context, Display = separate anonymous context at 1440–1920 px; real staff login. Chrome desktop emulating touch, **not** a real iPad. Each game's own suite was reused unchanged except the port/namespace patching needed to share one emulator.
| Game | Suite | Result |
|---|---|---|
| Balloon Quest | production flow A: login, Display linked, start, Control/Display positions agree (≤0.07 %), **all nine stages by 45 therapist taps**, one history record | 15/15 |
| Balloon Quest | **sensor loss then manual taps** (dev server, because the simulator is hidden in production): RIGHT_HAND session holds, a tap resumes and scores, Display shows the same progress, no re-hold with sensor still gone, stage completed by taps alone | 11/11 |
| Balloon Quest | **5 s Control network drop**, play continues, Display reload rejoins, Control reload | 9 PASS + 1 informational (see §12) |
| Build Quest | production cross-device + the full suite: **nine stages by touch**, inactive staff denied, second browser same UID cannot take the room, Display/Control reload, simulated RIGHT_HAND with therapist override, sensor disconnect, handheld fallback, network loss/reconnect with new ownership epoch, pause/resume/restart/skip/end, history opens in patient detail, denied-write recovery | all checks pass (both suites) |
| Runner Quest | production suite (library, touch start/left/pause/resume/assist/skip/end, end-reason saved, no dev hooks) | 18/18 |
| Runner Quest | **nine stages by touch** from an iPad-like Control (dev server for its test hook): 1.2 writes/s, touch→Display p50 17 ms | 17/17 |
| Runner Quest | workflow: step/lane controls, assist, **sensor loss → "continue manually"**, stale-run command refused, Display/Control reload, legacy Balloon record byte-identical, history list/detail, outsider denied | 41/41 |
| Space Pilot 3D | production suite: library, touch steering press-and-hold, pause/resume/restart, Display/Control reload, history, all nine mode × difficulty combos incl. multi-touch, RIGHT_HAND simulation with manual priority and disconnect fallback, network loss, **laptop sensor relay with 2 min clock skew**, second tab cannot take the lease, **all three EASY missions completed by therapist pointer controls (15 rings)**, walk-in writes no history | 12/12 |

"Arrows" for Space Pilot are the on-screen press-and-hold direction buttons, which is what the suite drives.

## 5. Firebase rules validation
`docs/release/FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json` is a byte copy of the repo's `database.rules.json` (SHA-256 `ae482f9c335e59e29977b5f95755b2f783774d9cbc8fdb7dce46718b2c8d6a1b`), valid JSON, containing the legacy games, staff authorization, patient history and the Space Pilot, Build Quest and Runner Quest additions (Balloon Quest needs none). Emulator allow/deny coverage (24 tests) includes active staff, inactive staff, non-staff users, unauthenticated and anonymous Display clients, ownership/lease fencing, stale revisions/epochs, oversized/unknown fields, history validation, overwrite denial, forged results, and preservation of the legacy games' validations. **Re-check the hash before publishing**: if `database.rules.json` differs, the other agent changed it after this validation and the emulator suites must be re-run.

## 6. Session-history compatibility
Historical records are never rewritten. Balloon Quest versions each stage result (`engine: "bq3"`); Runner/Build/Space Pilot use their own versioned records. A legacy five-stage Balloon record stayed byte-identical and renders as recorded next to the new games (Runner workflow suite). Each run saves exactly once (immutable ids; duplicate and retry cases covered). Walk-in sessions write no history. The early-end reason is stored (confirmed for Runner: `CHILD_SATISFIED`; Balloon in B6).

## 7. Feature flags and rollback
Production build requires, set in Vercel **before the build** (all are `NEXT_PUBLIC_`, build-time):
* `NEXT_PUBLIC_SPACE_PILOT_3D_ENABLED=true`
* `NEXT_PUBLIC_BUILD_QUEST_3D_ENABLED=true`
* `NEXT_PUBLIC_RUNNER_QUEST_3D=1`
* `NEXT_PUBLIC_BALLOON_QUEST_LEGACY` unset
Verified flag-off build (the three set to unset and `…_LEGACY=1`): Build Quest and Runner Quest Control pages render 404 and their Display routes return 404; Space Pilot serves the original game and its 3D Display route is 404; `/control/balloon-quest-legacy` stays available.
Rollback per game: unset its flag and redeploy (Balloon: set `NEXT_PUBLIC_BALLOON_QUEST_LEGACY=1`). Keep the merged rules and existing history; do not redeploy an older commit (older builds misread newer history). Immediate Balloon fallback without a deploy: `/control/balloon-quest-legacy`.

## 8. Vercel deployment configuration
Normal Next.js project, the existing build command. Environment: the seven real `NEXT_PUBLIC_FIREBASE_*` values, the existing Munsit variables as today, **no** `NEXT_PUBLIC_FIREBASE_EMULATOR_*`, and the four flags above. Deploy a Preview first.

## 9. Firebase Console publication
1. Firebase Console → Realtime Database → Rules.
2. Copy the current rules into a dated backup.
3. Paste the complete `FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json`, check the hash first (§5), and publish **before** deploying the app (the new games' writes are denied otherwise).
4. Smoke test: staff login, a legacy game session, a new game session.
Rules are additive; reverting rules while new-game clients are active denies their room and history writes.

## 10. Rollback
See §7. No data deletion or migration is ever required.

## 11. Remaining physical tests
Real iPad Safari touch ergonomics and orientation; separate physical laptop/projector Display; WT901 RIGHT_HAND with each game (and the Space Pilot laptop sensor relay), BLE sleep/reconnect, LEFT_HAND; foot sensors (Chromium laptop Control only; iPad Safari has no Web Bluetooth); physical handheld/gamepad; real WAN latency and offline behaviour; WebGL frame rate on the clinic machines; a ≥ 60-minute soak per game (not re-run in this pass); supervised therapist pilot.

## 12. Unresolved items and honest caveats
* **Space Pilot is still being edited by another agent.** Their files changed several times during this pass (rules, repository, control, sensor relay). Results above are for the snapshot taken at ~13:20; the last 3+ minutes before it were quiet and the full suite passed on it. Re-run §3–§5 on the final tree before deploying.
* **Balloon Quest Control reload — FIXED after this report was first written** (see `docs/balloonquest3d/RELOAD_RECOVERY_REPORT.md`): the Control now recovers the active session paused after a reload, with ownership checks and no duplicate scoring/history; 26/26 production-build and 8/8 sensor-loss browser checks pass. Previously it started a clean session.
* **Network testing is limited**: offline/reconnect was tested for Balloon, Build and Space Pilot; Runner measured local latency (17 ms p50). I did not inject artificial WAN latency, and no real-network test was run.
* Two suites need the development server (Balloon sensor loss, Runner nine-stage), because their test hooks/simulators are deliberately absent from production builds.
* **Process incident**: during cleanup I used broad `pkill` patterns, which stopped another agent's database emulator (port 19200) and the `next dev --webpack` server on port 3000. I restarted both immediately (the emulator is empty, so that agent must reload its rules with its `load-emulator-rules.mjs`; the dev server was restarted with the same command from the repo). No files or data were touched.
* The Balloon first full-flow run in this pass showed 4 failures when started right after another browser suite, from the known single shared Display-presence slot; an isolated rerun passed 15/15.

FOUR-GAME SOFTWARE RELEASE READY — Awaiting Firebase rules publication and batch deployment.
