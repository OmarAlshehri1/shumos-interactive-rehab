# Balloon Quest 3D — Phase B5 report: validation and release preparation

**Status: COMPLETE (software).** All software gates pass. Nothing in this report is a physical-hardware or projector measurement; those are listed as still required in section 8.

## 1. Full software gates

| Gate | Result |
|---|---|
| TypeScript, whole repository (`tsc --noEmit`) | **0 errors** |
| ESLint, whole repository (`eslint .`) | **exit 0, no findings** |
| Balloon Quest tests (`vitest run lib/balloonquest components/display/balloonquest3d`) | **98 passed in 5 files** (79 engine/runtime/input + 19 from the approved B2 preview's config and spawner) |
| Full repository tests (`vitest run`) | **113 files, 1,515 tests passed** (includes every other game and the other agent's uncommitted work) |
| Production build (`next build`, in a scratch copy so the running dev server's `.next` was untouched) | **succeeds** |
| Production route behaviour (`next start`, real browser) | `/display/balloon-quest-3d-prototype` and `/display/balloon-quest-visual-preview` → **404 page**. `/control/balloon-quest-3d-prototype` → behind the existing staff login; the page calls `notFound()` so the Control UI is never rendered (same behaviour as the existing Space Pilot 3D prototype, whose route also answers HTTP 200 with a login/404 body because the shared layout streams first). Existing `/control/balloon-quest`, `/display`, `/` unaffected. |
| Changes to existing files | **none.** `git diff` of tracked files is byte-identical to the start of the task; `git status` for all non-Balloon-Quest paths is identical. No dependency added (`package.json` / lockfile untouched). |
| Reads of shared production code | exactly two, both read-only: `ContactActivationGate` (`lib/physicalInput`) and `useDualSensorRuntime` (`SensorRuntimeProvider`). No Firebase import anywhere in the new code. |

Tests were not weakened. Where a test or browser check found a real defect, the code was fixed (section 3 of the B3 report). Where a browser check was *itself* wrong or meaningless, that is recorded openly in `validation/README.md` rather than hidden.

## 2. Browser Control/Display workflow (two real Chrome windows)

Evidence: `validation/results/*.json`, scripts in `validation/`, screenshots and video listed in section 7.

**Full nine-stage session (all three levels, wall layout)** — a bot moved a simulated RIGHT_HAND pointer through the real input hub; every selection went through hit-testing, never through a shortcut:

| Stage | Wall-clock time | | Stage | Wall-clock time |
|---|---|---|---|---|
| Easy 1 | 6 s | | Medium 3 | 18 s |
| Easy 2 | 6 s | | Advanced 1 | 14 s |
| Easy 3 | 6 s | | Advanced 2 | 14 s |
| Medium 1 | 10 s | | Advanced 3 | 19 s |
| Medium 2 | 18 s | | **Session** | **9 / 9 completed; 45 correct (= 3+4+5+4+5+6+5+6+7); 14 wrong-colour touches, none penalised; skipped 0; restarts 0** |

(The bot plays quickly; the game itself has no time limit.)

Workflow suite (`e2e2` 34/35 first run, `e2e3` 9/9, see the honest note below):

| Check | Result |
|---|---|
| Contact fidelity: just outside / just inside the *drawn* balloon | PASS / PASS |
| Control vs Display balloon positions while rising | PASS — max difference **0.06 %** of stage height over 84 samples |
| Pause freezes both windows; authoritative transforms bit-identical after 3 s | PASS (Control, Display) |
| Resume continues smoothly (≈ 3.7 % of height per second, no jump) | PASS |
| Display shows calm text only while paused / held (no technical text) | PASS |
| Restart (progress reset, same stage; Display follows) | PASS |
| Skip ×3 completes the level; summary says "متخطاة ٣", never "failed" | PASS |
| End session; Display shows "شكرًا لك" | PASS |
| FLOOR/Easy: near edge clear (lowest point 88.9 %), x-margins respected | PASS |
| FLOOR/Medium: balloons stay in the 14 % safe lanes (x 20.8–80.6 %); goal bar moves to the top band | PASS |
| Reduced motion: stationary layout, sway disabled on the Display | PASS |
| Simulated LEFT_HAND (left-hand mode), LEFT_HAND (both-hands mode), RIGHT_FOOT, LEFT_FOOT, HANDHELD each select a target | PASS ×5 (simulation) |
| **Real keyboard events** (arrows + Space) select a target | PASS |
| Input loss: held automatically; authoritative transforms frozen on both windows; auto-resume on recovery | PASS |
| Display window closed → play held ("display-unavailable"); reopened → resumes and re-syncs | PASS |
| Display reload mid-stage → session recovered (7 → 7 balloons) | PASS |
| Control reload → clean ready session, Display follows the new owner, interrupted-session hint shown | PASS |
| Second Control window waits (single authority via Web Locks) | PASS |
| Wrong colour: balloon stays, gentle sway on Control *and* Display, progress/lifecycle unchanged | PASS ×4 |
| External network hosts contacted by Control or Display | **none observed** |

**Honest notes.** (1) `e2e2`'s "nothing moves while input is lost" failed once because it measured `getBoundingClientRect()` (which includes the cosmetic CSS sway rotation); `e2e3` re-checks it on the authoritative inline transforms — bit-identical, PASS. (2) `e2e2`'s "source not enabled for the mode" check is not meaningful (the simulator keeps earlier simulated sources streaming) and passes trivially; the real coverage is in the unit tests. (3) **Message loss** was verified in unit tests (dropped state message → clock revision gap → re-sync; lagging acknowledgement → resend) but **not** in the browser, because a browser cannot drop `BroadcastChannel` messages on demand. (4) "No unintended Firebase writes": the new code cannot write (no Firebase import), and the dev server ran in local mode (the staff gate was bypassed, i.e. realtime disabled) with no external requests observed — **but** the shared layout's pre-existing `SensorPointerDisplaySync` would mirror a connected RIGHT_HAND pointer to Firebase when realtime is enabled; see section 6.

## 3. Child experience review (from the real screenshots and video)
* Arabic is correct and RTL; one instruction ("المس البالون الأزرق" with a matching mini balloon), three numbered stage markers (✓ for finished), a segmented goal bar with a number — nothing relies on colour alone, and optional shape symbols exist.
* No timers, scores, mistake counters, diagnostics or reasons appear on the child screen; holds say only "لحظة من فضلك…" / "استراحة قصيرة".
* Black and white balloons stay clearly visible against the sky (halo / outline); Advanced uses exactly black, white, green, blue, yellow, red, purple.
* Floor layout keeps the near edge clear; wall layout keeps the approved B2 look. No leaves, birds or "stand here" marker.
* Not reviewed: how the child *feels* about it, readability at real projector distance, and clinical suitability — those need a supervised session.

## 4. Performance (both windows visible, 4-minute Advanced soak, headless Chrome, **development build, software rendering, simulated pointer**)

| Metric | Display | Control (with live preview) |
|---|---|---|
| Frames measured | 14,502 | 14,345 |
| Average frame rate | **60.0 fps** | **59.3 fps** |
| Median / p95 / p99 frame time | 16.7 / 16.7 / 16.8 ms | 16.7 / 16.8 / 33.3 ms |
| Frames over 33 ms / over 50 ms | **0 / 0** | 19 / 0 |
| Worst frame | 33 ms | 34 ms |

| Latency, simulated pointer event → balloon pop visible (68–71 selections) | mean | p50 | p95 | max |
|---|---|---|---|---|
| in the **Display** window | 4.5 ms | 4.4 ms | 5.2 ms | 6.1 ms |
| in the Control preview | 9.3 ms | 9.1 ms | 10.7 ms | 11.2 ms |

Measured with `MutationObserver` + `performance.timeOrigin` on both pages (same machine clock). It covers the Control frame loop, hit-testing, the channel and the React render — **not** sensor latency, BLE, or a projector's display lag.

| Complexity / stability | Display | Control |
|---|---|---|
| DOM nodes (min–max over the soak) | 226–258 (≤ 8 balloons, 14 SVGs) | 368–396 |
| Heap, 4-min soak (garbage-collection sawtooth) | 13.5–21 MB | 19.5–30 MB |
| Heap, forced GC before each sample, **10-min soak** (22 samples) | 11.8 → 14.5 MB in the first 2.5 min (warm-up), then 14.4 → 15.2 MB over the next 7.5 min (**≈ +0.1 MB/min**) | 17.2 → 20.0 MB in the first 2 min, then 19.7 → 20.3 MB (**≈ +0.07 MB/min**) |
| DOM nodes over the 10-min soak | 229–266 (bounded; follows the 7–9 balloons in play) | 363–404 (bounded) |
| Channel traffic | ≈ 4 messages/s (clock heartbeats + state changes); no positions | — |

Design choices behind these numbers: movement is written to the DOM from the clock in one `requestAnimationFrame` loop (no per-frame React state); each balloon is a handful of SVG shapes using shared gradients (no filters or blur); the sway/bob is a CSS transform; React re-renders only on spawn / retire / pop / progress.

**10-minute soak (171 selections, 36,084 Display frames):** Display 60.0 fps, 3 frames over 33 ms, worst 50 ms; Control 59.6 fps, 45 frames over 33 ms (1 over 50 ms, worst 67 ms); pointer → Display pop latency mean 4.8 ms, p95 6.7 ms, max 13.9 ms (n = 162).

**Reading the heap numbers honestly:** after warm-up there is a small residual upward drift. Ten minutes of data cannot tell a slow leak from caching, and at ≈ 0.1 MB/min it would be ≈ 6 MB per hour — harmless for a supervised session but **a ≥ 60-minute forced-GC soak should be run before release**. The DOM is bounded, so DOM growth is ruled out.

Not measured: a production build, a real projector, an ordinary low-power clinic laptop, or sessions beyond 10 minutes.

## 5. Browser reload, resilience and cleanup
Display reload recovers the live session; Control reload starts a clean session and the Display adopts the newer owner; the Display's heartbeat/timeout logic holds the game when the Display disappears and resumes when it returns; timers, channels, animation frames and key listeners are released on dispose (`pagehide` also closes the channel and sends a `closed` message). The forced-GC 10-minute soak shows a bounded DOM and a small post-warm-up heap drift (see section 4); no cleanup failure was observed, but a longer soak is recommended.

## 6. Production integration proposal (nothing applied)

**Decision first.** The experiment's transport is a same-browser `BroadcastChannel`. The production game talks Control → Firebase → Display and supports a separate Display computer. Replacing the original game therefore needs a networked transport; that choice drives most of the work below.

1. **Routes.** Keep both experimental routes as a QA harness. For release, either (a) render `BalloonQuest3DControl` from `app/control/balloon-quest/page.tsx` and mount `BalloonQuest3DDisplay` for the `balloon-quest` entry of `components/display/gameDisplayRegistry.tsx`, or (b) add a new route/registry entry and retire the old one later (safer; see rollback).
2. **Game registry** (`lib/games/registry.ts`, shared and currently modified by other work): add a `GameId` `balloon-quest-3d` (or a `version` field on `balloon-quest`), `surfaceType` selectable WALL/FLOOR, `sensorCompatible: true`. `BALLOON_QUEST_GAME_ID`-style constant for the new id.
3. **Transport.** Option A (recommended): publish the *same* messages (`state` + 4 Hz `clock`) over the existing `/liveSession` record — `session` becomes the `DisplayState`, plus a `clock` child updated at ≤ 4 Hz. The Display extrapolation already tolerates this rate. That is ≈ 4 writes/s, comparable to the existing controller-pointer mirror (~30 Hz). Option B: keep BroadcastChannel and declare "same-machine only" for this game, with a Firebase fallback later.
4. **Firebase rules / schema** (`database.rules.json`) — **unavoidable changes** for Option A: whitelist the new `gameId` in `liveSession/gameId` and in `sessions/$id/gameId`; the `liveSession/session` validator is permissive (`$other` allowed), so no change is needed there; the **history** node rejects unknown fields (`"$other": false`), so any new stored field needs an explicit validator. Everything is additive; no existing rule is loosened.
5. **Session history compatibility.** Existing validators allow `startingStage` / `endingStage` 1–5, so stages 1–3 are valid; the existing `balloon-quest` history shape (`completedStageCount`, `skippedStageCount`, `totalCorrect`, `totalIncorrect`, `stageResults`) maps naturally. Map `wrongContacts` → `totalIncorrect` *only if* clinicians accept that wrong-colour touches are informational; otherwise store a new field and extend the validator. Add `buildStoredBalloonQuest3DSession` beside `buildStoredSession` (the original stays).
6. **Old five-stage sessions.** Do **not** migrate. Keep them readable under `gameId: balloon-quest`; show them with a "legacy (5 stages)" label. `lib/analytics/patientAnalytics.ts`, `lib/sessions/resumeSuggestion.ts` and the history UI assume 5 stages per difficulty (`STAGES_PER_DIFFICULTY`) — they need a per-game stage count, and the resume suggestion must never map a legacy "Medium 4" onto a 3-stage game.
7. **Layout-level pointer mirror.** Add the new Control route to `PrototypeLocalOnlyBoundary` (or, better, replace its hard-coded Space Pilot path with a small list) so a connected RIGHT_HAND is not mirrored to Firebase for a game that does not need it. Currently only Space Pilot 3D's path is exempt.
8. **Patient / therapist metadata.** The experiment carries none. Reuse `SessionWorkflowProvider`, patient context, `EarlyEndSelection`, therapist note flow from the original controller when integrating.
9. **Feature flag and rollback.** Gate the registry route by an environment flag (`NEXT_PUBLIC_BALLOON_QUEST_3D=1`). Rollback = unset the flag; the old game and its code are untouched. Rules changes are additive, so rolling back leaves harmless unused permissions. Data written under the new `gameId` stays readable.
10. **Release steps.** (a) approval of this plan, (b) hardware validation (below), (c) rules change in staging, (d) wire registry/route behind the flag, (e) clinic pilot with the flag on for one site, (f) review, (g) remove the flag. Each step is reversible until (g).

## 7. Evidence locations
* Screenshots (real, from the browser runs): `docs/balloonquest3d/screenshots/gameplay-*.png`; B2 visual-preview images `b2r-*.png`.
* Video (61 s, real gameplay of the child Display, Medium level): `docs/balloonquest3d/video/balloon-quest-3d-gameplay.mp4`.
* Machine-readable results, scripts and gate summaries: `docs/balloonquest3d/validation/` (see its README).

## 8. Hardware validation checklist (all still to do)
- [ ] RIGHT_HAND WT901: play all nine stages with a real child-sized range of motion; confirm contact radius/tolerance values per child; confirm pause-on-disconnect (switch the sensor off mid-stage) and auto-resume.
- [ ] LEFT_HAND WT901 (after the project's own LEFT_HAND validation): same, and both-hands mode with two sensors connected at once.
- [ ] Recenter during play: no phantom selection.
- [ ] Wall installation: projector keystone, safe margins, text size at the real viewing distance, brightness of black/white balloons in the room's light.
- [ ] Floor installation: confirm the assumed orientation (bottom edge = nearest the child), the clear near band, and target size for stepping.
- [ ] Foot sensors: **a positioning method must be designed first** (an IMU alone gives no floor position); then validate the adapter and `FloorOrientation`.
- [ ] Handheld controllers: confirm what the device exposes to a browser (pointer? motion? buttons?), then build a hardware-specific adapter satisfying the requirements in the B4 report.
- [ ] A ≥ 60-minute forced-GC soak (and a normal-length supervised session) on the production build to confirm the small post-warm-up heap drift is not a leak.
- [ ] Control and Display on the real clinic machine(s): frame rate on the real GPU, projector latency, two windows on two screens in one browser profile.
- [ ] Supervised pilot with a therapist: instruction wording, stage progression, goal sizes, whether the gentle sway cue is enough feedback for a wrong-colour touch, and whether clinicians want wrong-colour touches reported as 'incorrect selections' with an accuracy figure (the original game does) or only as an informational count (this design).
- [ ] Accessibility review with clinicians: reduced-motion preference, colour-vision (shape cues), seating/standing postures, children who need longer than the default contact tolerance.

## 9. Known issues
* BroadcastChannel transport = same browser/machine (see 6).
* Control tab reload loses the live session (a hint is shown).
* Hit radius is a circle on the balloon body; very large tolerance values can make neighbouring balloons' hit areas overlap (the nearest centre wins).
* Static Easy balloons are shrunk automatically when a combination of size/count/floor cannot fit spare slots (documented, deterministic).
* Wrong-colour touches: as in the original game the balloon stays and nothing is deducted; unlike the original, this design shows a gentle sway (no "try again" voice line, no shake) and reports the count as informational ("لمسات ببالونات بلون آخر") with **no accuracy percentage**. The original reports `incorrectCount` and accuracy; the integration plan (item 5) must decide how to map this.
* Pre-existing, outside this work: the shared layout's pointer-to-Firebase mirror (section 6, item 7).

PHASE B5: COMPLETE (software). Hardware validation and production approval outstanding.
