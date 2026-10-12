# Balloon Quest — Control reload recovery (2026-10-10)

Written for: the project owner. Closes the one open item in `docs/release/FOUR_GAME_RELEASE_REPORT.md` §12. Nothing was committed, pushed, deployed, and no rules were changed or published.

## Behaviour now
Reloading (or losing and reopening) the therapist Control no longer starts a new session. The Control reads the session back from the existing live record, validates it, and adopts it **paused**. The therapist must press «استئناف» (or «المرحلة التالية» if it was between stages). Stage, level, goal progress, target colour, balloon identities, accepted selections and input-event ids are preserved; a finished session comes back as its summary.

## How it works
* The Control's full authoritative `Session` is written into the existing live record as one JSON string (`liveSession/session/bq3.snapshot`), together with every state message, so it always matches what the Display shows. `liveSession/session` is already free-form in the rules, so **no rules change** (the browser runs used the unchanged `database.rules.json`). Typical record 5 KB (snapshot ≈ 3 KB idle, unit-tested below 40 KB while playing); written on state changes plus a 1 Hz clock while playing and a 4 s heartbeat when idle.
* On start, a Control (only when it is the lease owner) fetches the record and decides (`evaluateRecovery`): recover only its **own account's** session of the **same patient** (walk-in matches walk-in), of this game and engine, valid, younger than 12 h, matching the record's session id.
* **Ownership**: each tab has an id in sessionStorage (survives a reload, not a new tab). Same tab ⇒ recover at once. A different window whose heartbeat is fresh (< 15 s) ⇒ **blocked** with an Arabic notice and an explicit «استعادة الجلسة هنا» button; a window that stopped writing ⇒ recovered. A window that was taken over (the new owner marks `takeoverFrom` = its id) stands down: it stops publishing and does **not** end, save or clear the session.
* Adoption (`ControlRuntime.adopt`): playing, sensor-lost and automatic holds all become one plain pause with a higher revision; sensor pipeline reset; stage-complete does not auto-advance; terminal states are kept. The Display needs no change: the new owner has a newer start time, so the existing replica ordering adopts it and rejects late messages from the dead Control.
* **Duplicates**: the seen-input-event list and popped balloons travel in the snapshot, so a repeated event or balloon is refused after recovery. History uses the existing immutable per-run id, so re-saving a completed session returns «already saved»; recovery itself never writes history.
* **Damaged snapshots** (truncated, tampered, inconsistent, wrong version, too large) are ignored and the Control starts normally.

## Files
Created: `lib/balloonquest/recovery.ts`, `lib/balloonquest/__tests__/recovery.test.ts`, `docs/balloonquest3d/validation/b6/e2e-reload-recovery.mjs`, `e2e-sensor-reload.mjs`, this report.
Modified (Balloon Quest only): `lib/balloonquest/{session,controlRuntime,live}.ts`, `lib/control/balloonquest3d/useBalloonQuest3DRealtimeControl.ts`, `components/control/balloonquest3d/BalloonQuestControl.tsx` (recovery / blocked / stood-down notices), `docs/release/FOUR_GAME_RELEASE_REPORT.md` (§12 updated), `docs/balloonquest3d/validation/b6/e2e-manual-fallback.mjs` (unused variable removed).
Not touched: Space Pilot, Build Quest, Runner Quest, sensor drivers/calibration, `database.rules.json`, shared repositories.

## Validation
| Gate | Result |
|---|---|
| New unit tests (`recovery.test.ts`) | 17 pass: round trip incl. RTDB stripping, 13 rejection cases, paused-with-progress, no scoring/movement while paused, duplicate event/balloon refused, playing/sensor-lost/paused → plain pause, stage-complete waits, completed/ended restored, Display follows and rejects stale messages, decision matrix (same window / other live window / forced / stale / other account / patient / game / engine / damaged / too old / walk-in), publisher fields and heartbeat, older records still revive |
| Balloon Quest tests | 111 pass + 4 emulator-only |
| Full Vitest | 136 files / 1,749 tests passed, 23 skipped |
| `tsc --noEmit` | 0 errors |
| ESLint, whole repo | clean |
| Browser, **production build**, Control + Display in separate windows, Firebase emulators | **26/26** (`e2e-reload-recovery.mjs`) |
| Browser, development server (sensor simulator), same setup | **8/8** (`e2e-sensor-reload.mjs`) |

Browser scenarios, all with the Display in a separate window:
* **Reload during moving balloons** (Medium, rising): same session, paused, same goal 2/4, same target colour and level/stage, 6/6 balloon ids unchanged and identical on the Display; live revision only moved forward; nothing moved or scored for 3.5 s; a tap while paused did not score; explicit resume continued; exactly one more selection scored (2→3); no history written by recovery.
* **Reload while paused**: recovered paused with the same progress.
* **Reload after completion** (a full level by 12 taps): completed summary restored, no new session, history stayed at exactly 2 records (the recovered ended session saved once, the completed one once).
* **Second window**: a second tab of the same account is blocked (not silently taking over) while the first keeps playing; after «استعادة الجلسة هنا» it holds the session paused with its progress; the first window shows the stood-down notice; only the second publishes; no history written by the hand-over; the new owner resumes and the Display follows.
* **Sensor loss then reload** (simulated RIGHT_HAND): held automatically with progress 1, reload → plain pause with the same progress and sensor mode, Display paused; resume works without the sensor; manual taps carry on (progress 2) and play is not re-held 5 s later.
Earlier validated and unchanged: manual balloon map, sensor-loss manual fallback, 9-stage flow, legacy history compatibility (those suites were not re-run in full this pass).

## Limits
* Recovery restores the state as of the last published change. A selection made in the final milliseconds before the reload may not have reached Firebase yet; it is then not on the Display either, and cannot be double counted.
* Not recovered: a different patient selected after the reload (a fresh session starts), a record older than 12 h, a Control signed in as a different account, or a session of another game.
* A therapist who closes the tab (instead of reloading) can recover from a new tab after about 15 s; before that the new tab asks for the explicit take-over.
* The in-app «back» navigation still ends and saves the session (unchanged, intended).
* Same simulated-device limits as before: Chrome desktop, not a real iPad; network drop and reload covered, no real WAN testing. Dev-server note: a hard hand-over race between two windows writing in the same instant was not stress-tested beyond the scenario above.
* Re-check the release report's pre-deploy gates (§3–§5) on the final tree before the batch; Space Pilot was still being edited by another agent.
