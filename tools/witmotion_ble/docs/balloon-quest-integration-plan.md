# Balloon Quest integration plan (PLAN ONLY — nothing wired tonight)

This documents exactly which existing canonical action RIGHT_HAND_RAISE
should eventually drive, and exactly which production files a future,
explicitly-approved task would touch. **No production file listed below has
been modified.** Nothing here is wired up yet — `lib/physicalInput` (see
`../../../lib/physicalInput/`) is a standalone, unimported architecture
module tonight.

## The pipeline

```
WT901BLECL
  -> PhysicalInputManager (lib/physicalInput/PhysicalInputManager.ts)
  -> RIGHT_HAND role
  -> RIGHT_HAND_RAISE semantic event
  -> lib/game/session.ts's selectBalloon(state, targetBalloonId, timestamp)
  -> existing scoring/realtime/display/history (already wired — unchanged)
```

## Why `selectBalloon` is the right existing canonical action

Balloon Quest's whole child-facing interaction is a single canonical
action: `selectBalloon(state: SessionState, balloonId: string, timestamp:
number): ActionResult` in
[`lib/game/session.ts:353`](../../../lib/game/session.ts). Correct: pops the
target balloon, records reaction time, and auto-advances to
`STAGE_COMPLETE` once every target is popped. Incorrect: increments
`incorrectCount`. Already-popped: a safe no-op. Nothing else in the engine
scores a stage.

Today, that action is invoked **by the therapist**, not the child: the
child sees balloons on `/display` (read-only —
`components/display/scenes/PlayingScene.tsx`'s own `onSelectBalloon` prop is
literally a no-op there — see its comment "a tap happens on /control, not
here"), and the therapist taps the correct balloon on
`components/control/live/LiveSessionScreen.tsx`'s `BalloonMap`, which calls
`onSelectBalloon(balloonId)` (line 89) →
`lib/control/useRealtimeControllerSession.ts`'s `selectBalloon` callback
(line 746) → the engine function above.

A physical RIGHT_HAND_RAISE is a stand-in for exactly that therapist tap —
the child raising their hand is the intentional signal that would otherwise
require the therapist to notice and tap on their behalf. It does not need a
new engine action; it needs to call the *same* `selectBalloon`, with the
*current target balloon's id* (`stage.balloons.find(b => b.isTarget &&
!b.isPopped)`), from the controller side, only while
`session.gameState === GameState.PLAYING`.

## Exact files a future task would touch (not touched tonight)

1. **`lib/control/useRealtimeControllerSession.ts`** (around its existing
   `selectBalloon` callback, line 746) — the natural place to also accept a
   semantic-event-driven selection, since it already owns the
   engine-mutation + Firebase-sync path `onSelectBalloon` uses.
2. **A new hook**, e.g. `lib/control/usePhysicalInputBridge.ts` — subscribes
   to `PhysicalInputManager.onEvent`, filters for `role: RIGHT_HAND,
   gesture: "RIGHT_HAND_RAISE"`, resolves the current target balloon id from
   `session.currentStage.balloons`, and calls the controller's
   `selectBalloon`. This keeps `lib/physicalInput` decoupled from game
   semantics (per tonight's "keep Bluetooth/protocol implementation
   isolated from semantic game actions" requirement) — the bridge is the
   one place that knows both vocabularies.
3. **`components/control/live/LiveSessionScreen.tsx`** — would mount the
   bridge hook (or receive it via a prop from `ControlScreen.tsx`, matching
   how `onSelectBalloon` already flows in), likely gated behind a
   per-session "physical input enabled for this child" flag so every
   existing therapist-tap session is completely unaffected by default.
4. **`components/control/ControlScreen.tsx`** — wires the new hook's output
   the same way it already wires `controller.selectBalloon` into
   `LiveSessionScreen` (line 277).
5. Any per-session config surface deciding *whether* RIGHT_HAND_RAISE
   drives this session at all (likely alongside the existing
   `SessionGoal`/`sessionGoal` concept in `lib/sessions/types.ts` and
   `database.rules.json`'s `liveSession.session.config`) — not designed
   yet; a therapist must always be able to fall back to tapping.

## Explicitly NOT decided yet (needs its own approved task)

- Whether the WT901BLECL BLE connection itself happens in-browser (Web
  Bluetooth) or through a local bridge process feeding events over a
  WebSocket/Firebase channel to `/control` — `lib/physicalInput/InputSource`
  is written so either is a plain `InputSource` implementation, but which
  one is a real product/security decision, not made here.
- What happens when more than one target balloon exists on screen at once
  (rare today, but the engine allows multiple `isTarget` balloons per
  stage) — "the current target" is ambiguous in that case and needs a
  product decision (nearest? first spawned? all of them?).
- Any UI affordance showing the child a physical raise was registered,
  distinct from `PlayingScene`'s existing tap-feedback animations.

## What this plan does NOT require touching tonight

`lib/game/session.ts`, `lib/control/useRealtimeControllerSession.ts`,
`components/control/live/LiveSessionScreen.tsx`, and
`components/control/ControlScreen.tsx` are all unmodified. Balloon Quest
behaves exactly as before this plan was written.
