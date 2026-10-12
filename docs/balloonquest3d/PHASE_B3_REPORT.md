# Balloon Quest 3D — Phase B3 report: gameplay engine

**Status: COMPLETE** (all critical acceptance criteria passed; evidence below).

Scope: an isolated, deterministic gameplay engine, a therapist Control interface and a child Display, joined by a dedicated experimental channel. Nothing in production, in Firebase, in the shared game rules or in the sensor stack was modified.

## 1. Where it lives

| Area | Path |
|---|---|
| Engine (pure, no React/DOM/Firebase) | `lib/balloonquest/{types,rng,stages,geometry,spawner,session}.ts` |
| Colours / Arabic copy | `lib/balloonquest/{colors,arabic}.ts` |
| Control runtime (authority) | `lib/balloonquest/controlRuntime.ts` |
| Versioned protocol + Display replica | `lib/balloonquest/{protocol,replica}.ts` |
| Browser wiring (Web Locks, BroadcastChannel, rAF) | `lib/balloonquest/{controlMount,displayMount}.ts` |
| Input layer (used by B4) | `lib/balloonquest/input/*` |
| Therapist UI | `components/control/balloonquest3d/*` |
| Child UI | `components/display/balloonquest3d/game/*` (re-uses the approved B2 art in `.../preview/`) |
| Routes (development only, no registry entry) | `/control/balloon-quest-3d-prototype`, `/display/balloon-quest-3d-prototype` |
| Tests | `lib/balloonquest/__tests__/` (79 tests) |

`lib/game/*` (the original engine, shared by four other games) is untouched; the five-stage tables stay where they are.

## 2. The nine stages

| # | Level / stage | Motion | Goal (correct picks) | Colours | Balloons in play | Width (cqh) | Full trip (s) |
|---|---|---|---|---|---|---|---|
| 1 | Easy 1 | stationary | 3 | 3 (red, blue, yellow) | 5 | 22 | – |
| 2 | Easy 2 | stationary | 4 | 3 | 6 | 21.5 | – |
| 3 | Easy 3 | stationary | 5 | 3 | 6 | 21 | – |
| 4 | Medium 1 | rising | 4 | 5 (red, blue, green, yellow, purple) | 6 | 17.5 | 42 |
| 5 | Medium 2 | rising | 5 | 5 | 7 | 17 | 40 |
| 6 | Medium 3 | rising | 6 | 5 | 7 | 17 | 38 |
| 7 | Advanced 1 | rising | 5 | 7 (black, white, green, blue, yellow, red, purple) | 7 | 15 | 33 |
| 8 | Advanced 2 | rising | 6 | 7 | 8 | 14.5 | 31 |
| 9 | Advanced 3 | rising | 7 | 7 | 8 | 14.5 | 29 |

Progression is gentle: stage 2 asks for one more selection, stage 3 for one more again with slightly more density. Within a level no goal rises by more than two. A test asserts this. All of it is a count of correct selections; **there is no timer and no failure state anywhere in the engine.**

Therapist settings (size 0.85–1.3×, speed 0.6–1.4×, ±2 balloons, 2–7 colours within per-level bounds, contact tolerance 0–0.5, wall/floor, reduced motion, input mode, scope, auto-advance) are clamped by `sanitizeSettings` into a safe envelope; the effective speed never drops below an 18 s trip. Size, speed, count, colours, layout and reduced motion take effect when the next stage (or a restart) is built, so they can never break the no-overlap guarantee mid-flight. Contact tolerance and input mode apply at once.

## 3. How the rules from the brief are enforced

* **Easy: stationary, selected balloons vanish, replenish only elsewhere.** A popped balloon is removed. The replacement goes into a *different free slot*. Static layouts always hold `activeCount + 2` non-overlapping slots; if a therapist size or the floor layout is too big for that, the engine shrinks the balloons in 4 % steps until it fits (`fitStaticSpec`). *This was found by a test:* a floor layout of tall Easy balloons only fitted four slots, which would have forced a reuse of the popped position.
* **Medium / Advanced: continuous rise from below.** Balloons spawn with their top edge at 112 % of the stage height (fully below the visible area), rise at one constant speed per stage, and retire when fully above. Replacements arrive later from below. Popped balloons never return. Tests run ten-minute simulations with and without interaction.
* **No overlap, ever.** Every balloon of a stage shares one speed, so the spacing validated at spawn time cannot close up later. The spawn x-position is rejected if it would be within a balloon-width (+ gap) of any balloon whose vertical extent is near the spawn point. Tested for every stage, including floor layout, over long simulations.
* **Target always available.** At least `min(2, remaining)` target balloons are kept "useful" (rising: not yet 60 % through their trip). If not, the next spawn is forced to the target colour with a short urgent timer. Tested: with *no* interaction for five minutes the target is never missing for more than 5 s; the browser run showed the same.
* **Wrong colour.** The balloon stays; nothing is deducted; progress and lifecycle are unchanged; a `wrongCueCount` increments and the Display plays a gentle sway (no flash, no shake). A touch that lingers cannot be counted again within 800 ms of simulation time. The therapist sees the count labelled "للمعلومة فقط، لا تُخصم" (information only, not deducted).
* **Exactly-once scoring.** A selection is accepted only if the session is *playing*, the balloon exists, is not already popping and is on stage, and the optional input-event id has not been seen. Tested for repeated balloon ids, repeated event ids, paused / suspended / ready sessions and off-stage balloons.
* **Pause / resume / hold.** The simulation clock advances only while *playing*. Pause and every automatic hold freeze it exactly (asserted bit-for-bit in the browser on both windows).
* **Determinism.** Spawning runs on a fixed 100 ms housekeeping grid driven by the simulation clock, so 16 ms and 33 ms frame rates produce identical balloons (id, colour, x, spawn time). Positions are a pure function of the clock.

## 4. Control/Display architecture (and why)

* **Observed precedent.** The Space Pilot 3D prototype uses a dedicated `BroadcastChannel`, Web Locks for a single Control owner, a dev-only route behind the existing staff gate, and a Display-side replica. I followed the same pattern with its own channel prefix (`shumos-experimental-balloon-quest-3d-v1:`). Production channels (`/liveSession`, `shumos-sensor-pointer`) are neither read for state nor written.
* **Control owns everything authoritative**: simulation time, balloon identities and positions, accepted selections, scoring, stage progression, lifecycle.
* **Positions are never sent.** The Display receives (a) a small state message whenever the balloon *set* or progress changes, and (b) a clock heartbeat every 250 ms. It extrapolates the simulation clock and computes each balloon's position with the same function as Control's hit-testing. Measured message volume over 60 s of unattended Advanced play (a 16 ms frame loop, 3,750 frames): **246 messages — 227 clock heartbeats and 19 state changes, about 4 per second**. Balloon positions are in none of them (a test asserts the volume stays below 400 and that state messages carry no `y` coordinates).
* **Versioned and ordered.** Every message carries `v:1` and an identity (`ownerId`, `ownerStartedAt`, `sessionEpoch`, `runId`) plus `revision`. The replica orders by `[ownerStartedAt, sessionEpoch, runId, revision]` and rejects stale owners, stale sessions, old runs and out-of-order or duplicate revisions; clock heartbeats must have increasing sequence numbers. A heartbeat that is ahead of the last state triggers a re-sync probe (message-loss recovery). The Control also resends state when an acknowledgement shows a Display is behind. Messages are strictly validated (`parseMessage`); malformed or out-of-range ones are dropped.
* **Holds.** Play is held automatically when the Display stops acknowledging or hides its tab (auto-resume), when the Control tab is hidden or the browser stalls for more than 300 ms (therapist resumes), and when sensor input is lost (B4).
* **Blocker check (brief, section 8).** An independent Control/Display workflow *was* achievable without touching any shared production file, so there is no blocker. One limitation is documented below.

## 5. Acceptance results

| Criterion | Result | Evidence |
|---|---|---|
| All nine stages complete in order | PASS | unit test (`playAll`) + a real browser session: 9 stages, 45 correct picks (3+4+5+4+5+6+5+6+7) |
| Continuous respawning, retire off the top | PASS | unit simulations; browser 60 s runs |
| No time-based failure | PASS | 10 simulated minutes without selection on Easy, Medium and Advanced: still *playing*, goal 0 |
| Target availability | PASS | worst gap < 5 s with and without interaction |
| Correct / wrong colour behaviour | PASS | unit + browser (wrong balloon stays, sways, no penalty, Display shows the same cue) |
| Exactly-once scoring | PASS | unit tests (repeat balloon / event id / blocked states) |
| Pause / resume / restart / skip / end | PASS | unit + browser (skips recorded as *skipped*, never failed) |
| Deterministic motion | PASS | unit |
| Control/Display consistency | PASS | unit (zero and 40 ms latency) and browser: max |Δy| 0.06 % of stage height over 84 samples |
| Overlap prevention | PASS | unit, all stages, wall and floor |
| Session completion & summary | PASS | unit + browser summary screen |

Tests: `npx vitest run lib/balloonquest` → **79 passed** (session 27, runtime/protocol 19, input 33).

### Defects the validation caught (all fixed)
1. **Static balloons drawn too high** (found only by the browser run): the renderer applied a vertical `translate(-50%)` to a position the engine already defines as the *top edge*, so drawn balloons sat ≈ 0.75 balloon-widths above where Control hit-tested. The bot's pointer was exactly on the drawn balloon yet never scored. Fixed; two "just outside / just inside the drawn balloon" browser checks now guard it.
2. **Floor Easy layout had no spare slot** (found by a test): see section 3.
3. A jittered slot could sit a hair outside the floor safe area (found by a test): candidates are now clamped.

## 6. Known limitations (B3)
* The transport is `BroadcastChannel`: Control and Display must be windows of the **same browser profile on the same machine** (the common clinic setup, and the same limitation the Space Pilot 3D prototype and the local pointer fast path have). A separate Display computer needs a networked transport — see the B5 integration proposal.
* Reloading the Control tab starts a fresh session (a hint reports the interrupted one). Session persistence/resume is not implemented.
* No patient identity, history or Firebase writes exist in this experiment, by design.
* Hit-testing uses the balloon's body circle (radius 0.5 × width plus the therapist tolerance). The sway animation is cosmetic and not part of hit-testing (≤ 0.5 cqw).

PHASE B3: COMPLETE.
