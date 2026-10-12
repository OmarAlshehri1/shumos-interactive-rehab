# Body Sequence 3D (تحدي الجسم الذكي) — final report

Branch `feature/body-sequence-3d` (worktree `../shumos-body-sequence`), base `e6aa5fd`. Game id `body-sequence-3d`, engine tag `bs3`. Not pushed, not deployed, Firebase rules NOT published.

## Architecture
Native to the shared platform: Control publishes one `/liveSession` record (`bs3.payload`, lease-fenced, heartbeat), Display is read-only via the display registry, history is saved once via `saveSessionHistoryOnce`. No new backend, Bluetooth or speech engine.
- `lib/bodysequence3d/`: `sequence.ts` (deterministic step/round builder, all 5 modes), `stages.ts` (9 stages), `engine.ts` (pure reducer), `config.ts`, `live.ts`, `history.ts`, `captions.ts`, `layout.ts`, `useSession.ts`, `projectionProfile.ts` (mirror of the shared calibration profile reader), `registration.ts` (feature flag `NEXT_PUBLIC_BODY_SEQUENCE_3D`).
- `components/display/bodysequence3d/`: three.js scene (orthographic 18° tilt), reward machines, textures, particles, audio, HUD view, dev preview harness.
- `components/control/bodysequence3d/`: Arabic Control, Settings, LaneMap, thumbnail fallback.
- Shared files touched (small, additive): registry, capabilities, realtime types/repository, session types/history repository, AudioManager (silent-prefetch cases), patientAnalytics, display registry, library thumbnails, patient history row/detail, `database.rules.json` + console copy (via `docs/bodysequence3d/rules-patch.py`), 3 library tests (13→14 games).

## Nine-stage matrix (L1 = exactly 2 lanes; L2/L3 = 3 lanes max; never 4)
| # | Stage | Lanes | Mode(s) | Rounds × len |
|---|---|---|---|---|
|1|First Steps|2|follow, one at a time|4×2|
|2|Left and Right|2|alternate|4×4|
|3|Remember Two|2|remember (preview, replay)|4×2|
|4|Three Directions|3|follow|4×2|
|5|One Foot Stays|3|hold-and-move (timed hold)|4 (2,2,3,3)|
|6|Three-Movement Sequence|3|follow, numbered order, optional hints, return-to-neutral|4×3|
|7|Move and Stop|3|stop-and-continue (optional short holds)|4×3|
|8|Remember and Perform|3|remember, optional hint assist, return step|4×3|
|9|Final Challenge|3|alternate, remember, hold-and-move, stop-go, remember+return|5|

## Sequence engine
Steps carry id, foot, lane, move type, order, hold, anchor, outcome (pending/confirmed/assisted/skipped). Only the active step can be confirmed; confirming another is an incorrect attempt (order cue). Supports replay, repeat, back, assisted, skip, incorrect, endPreview, pause/resume/safety, restart stage (fresh sequences), reload recovery (safety-paused), save-once history. Animation never completes a movement.

## Therapist controls (all manual, no sensors needed)
Start/pause/resume, level/stage, allowed feet (both/R/L), per-foot allowed lanes (no crossing by default), lane size/spacing, child-edge orientation + left/right swap, hold on/off + duration, hints, confirm/assisted/incorrect/repeat/replay/back/skip/end preview, skip/restart stage, restart, end, results, sound/voice/reduced motion/effects/contrast/quality, shared projection profile reader.

## Visuals
Dark brushed-steel floor, glass pads with neon borders, drawn left/right footprint glyphs (mirror shapes, arrows from the child's side, Arabic labels), cyan/magenta/violet lighting, glass wall with neon seams, crystal clusters, drifting motes, reward machines (robot / towers / crystals / core) that power up per completed sequence, energy column, confetti on stage completion. Effects stay in the margins; pads are 0.05 high (no hole/cliff illusion). Reduced-effects mode drops shadows/environment/particles.

## Tests (all local; emulators only)
- Unit: 33 engine/live/history tests + 3 library tests; full suite 2013 passed (13 files skipped without emulators).
- Rules emulator (RTDB 19610 / Auth 19709): 10/10 (lease fencing, revisions, no patient id on public record, history create-only, tamper/score/4-lane rejection, other games unaffected).
- Cross-device browser E2E (two Chrome profiles, iPad-sized Control + 1080p Display): 65/65 — all nine stages by touch, memory preview/replay/hints, hold, stop-go, lane counts, orientation, reload recovery, safety, partial + full history save-once. Evidence: `docs/bodysequence3d/evidence/`.
- tsc and eslint clean; `next build` OK with the flag on.

## Sensor limitations
WT901 cannot give lane, pressure or weight bearing. Only the shared simulated movement hint exists: it flags movement during a hold and never confirms anything. Hardware: PHYSICAL HARDWARE UNVERIFIED.

## Status
- IMPLEMENTED + BROWSER TESTED: everything above.
- SIMULATED: foot sensors.
- PHYSICAL HARDWARE UNVERIFIED: BLE feet, real projector alignment/lane distances, audio by ear, real-child use.
- NOT IMPLEMENTED: parent therapy-visit linking (module absent at baseline), measured FPS profiling (metrics recorded only as dev data; no FPS claim), automatic lane detection (deliberately).

## Known issues
- Library thumbnail was captured from the dev harness and shows the Next dev badge bottom-left; recapture from a production build before release.
- Unlit/lit reward cells look pale; visual polish pass recommended on real projector.
- Instruction pill text stays upright for the screen even when the child stands at another edge (floor glyphs rotate correctly).

## Merge considerations
- Add `'bs3'` to the `suffixed` list in `lib/therapyVisits/gameSafety.ts` and replace `projectionProfile.ts` with the shared `lib/projection` reader when those land.
- Rules: run `rules-patch.py` AFTER Turn & Go's patch (shared field names `repeats` are OR-extended); the `settings` node must be merged manually if another game defines it.
- Library tests expect 14 games; adjust if Rhythm Steps/Turn & Go merge.
- Tracked `tsconfig.json` was reverted (Next dev rewrites it).
- Ports used: 3731/3732, RTDB 19610, Auth 19709.
