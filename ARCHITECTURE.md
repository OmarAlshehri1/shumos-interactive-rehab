# Shumos Interactive Rehab — Architecture

Pediatric rehabilitation platform. One Next.js app, two synchronized
interfaces: `/display` (projector, child-facing) and `/control` (iPad,
therapist-facing). This document is a living reference — later tasks will
extend it, not replace it.

## Folder structure

```
app/
  display/          route: projector experience
  control/           route: therapist interface
  api/tts/            server-only Munsit proxy (route.ts) — holds MUNSIT_API_KEY, never sent to the client
components/
  display/            UI specific to the projector screen
    scenes/              one component per GameState screen
    balloon/             balloon SVG art + pop/shake/idle choreography
    environment/         persistent sky/hills/clouds background
  control/            UI specific to the therapist screen
  shared/             UI shared by both (e.g. status indicators)
lib/
  game/               the Balloon Quest engine (framework-agnostic, protected — see below)
    types.ts            domain types (GameState, Balloon, SessionConfig, ...)
    rng.ts               seeded deterministic RNG
    difficultyRules.ts    per-difficulty/stage generation parameters
    stageGenerator.ts     procedural balloon layout generation
    scoring.ts             accuracy, stage results, session summary
    stateMachine.ts         GameState transition rules
    session.ts               session/stage orchestration (pure actions)
    __tests__/                 vitest unit tests
  demo/               TASK 3 LOCAL DEMO ONLY — see below
  audio/              procedural sound + Arabic voice (browser-only, see below)
    types.ts            channel volume config, VoicePriority
    primitives.ts         shared Web Audio building blocks (tones, noise)
    effects.ts              pop/chime/oops/celebration synthesis
    ambience.ts               looping nature soundscape
    speech.ts                  SpeechSynthesis VoiceProvider — the fallback voice
    munsitProvider.ts           Munsit "Lama" VoiceProvider — the primary voice (calls app/api/tts, never Munsit directly)
    fallbackProvider.ts          composes primary + fallback into one VoiceProvider
    voiceQueue.ts                 priority gatekeeper (high/normal/low) in front of any VoiceProvider
    voiceLines.ts                  Arabic phrase builders (childName is always a parameter)
    AudioManager.ts                  event -> sound dispatch, channels, ducking, mute, prefetch
    useAudioManager.ts                 React hook owning one manager per session
```

`lib/game/` has no import from React, Next.js, Firebase, or any UI or audio
library — verify this holds before adding to it. As of Task 3 it is treated
as protected infrastructure: later tasks only read from it (via the
`@/lib/game` barrel), they don't modify it.

`lib/demo/useLocalDemoSession.ts` is a temporary adapter: it holds a
`SessionState` in React state and drives it with `lib/game`'s pure action
functions, since Firebase and `/control` don't exist yet to drive it for
real. It's isolated on purpose — a future Firebase-driven adapter replaces
this one file with the same shape (a SessionState plus actions), and
nothing in `components/display/` or `lib/game/` should need to change when
that happens.

`lib/audio/` (Task 4) turns `components/display/events.ts`'s `DisplayEvent`
stream into sound — every scene calls `onEvent()`, `AudioManager` decides
what that should sound like, and nothing else in the codebase touches Web
Audio or SpeechSynthesis directly. Unlike `lib/game/`, this layer is
inherently browser-only (`"use client"`), but it never imports from
`lib/demo/` or Firebase — it only knows about `DisplayEvent`, so a future
Firebase-driven adapter can fire the exact same events without this layer
changing. `lib/audio/voiceLines.ts` and `AudioManager.ts` import shared
Arabic copy from `components/display/copy.ts` / `colorPalette.ts` (a
deliberate `lib -> components` exception, since both are equally
"presentation," just spoken vs. written) — see the Task 4 report for the
reasoning.

**Voice provider chain (Task 4.2):** `AudioManager` never calls a
`VoiceProvider` directly — it goes through `VoiceQueue` (priority rules)
wrapping `fallbackProvider` (try primary, retry on fallback if it reports
`onError`) wrapping `munsitProvider` (primary: Munsit's "Lama" voice, via
`app/api/tts`) and `speech.ts` (fallback: browser SpeechSynthesis). Every
link in that chain implements the same small `VoiceProvider` interface
(`isAvailable` / `speak` / `cancel` / optional `prefetch`), so swapping,
reordering, or adding another provider later never touches `AudioManager`'s
call sites, `VoiceQueue`, or any scene component. `MUNSIT_API_KEY` is read
only inside `app/api/tts/route.ts` — a Next.js Route Handler, which only
ever runs server-side — and is never referenced from any `"use client"`
file; `munsitProvider.ts` only ever calls our own same-origin `/api/tts`.

## Why this separation

The game engine (state machine, stage/session logic) must keep working, and
stay testable, even if Firebase, sound, or animation break or aren't
present. Concretely:

- `lib/game/` never imports from `components/`, Firebase, or an audio
  library.
- `components/display/` and `components/control/` render state; they don't
  own it.
- Realtime sync (Firebase) will be an adapter that reads/writes the same
  domain types — not a data model of its own.

## Product principles

These guide every future task on this project.

**Child display** — playful interaction, beautiful motion, encouraging
feedback, premium pediatric visuals, friendly sounds. Never stressful or
punitive.

**Therapist control** — speed, clarity, large touch targets, minimal
cognitive load, immediate feedback, full control over the session.

**Clinical boundary** — this is a therapist-controlled prototype. It does
not diagnose patients, claim to use AI, measure clinical range of motion
automatically, perform gait analysis, or replace therapist judgment. Future
camera/depth-sensor integration may extend the platform, but that is out of
scope until explicitly tasked.

## Balloon Quest state machine

```
WELCOME → SETUP → INSTRUCTIONS → COUNTDOWN → PLAYING → STAGE_COMPLETE → SESSION_COMPLETE
                                                              ↺ INSTRUCTIONS (if another stage remains)
```

Defined as `GameState` in `lib/game/types.ts`; transition rules enforced in
`lib/game/stateMachine.ts` and orchestrated by `lib/game/session.ts`. Every
transition not explicitly listed is rejected rather than thrown, so a
future UI can check `result.success` instead of wrapping calls in
try/catch. One stage never leaks state into another — every session
action is a pure function that returns a new `SessionState`.

## Firebase

Realtime Database has been provisioned
(`shumos-interactive-rehab-default-rtdb.asia-southeast1.firebasedatabase.app`)
but is **not** integrated yet. No Firebase package is installed, no client
is initialized, no rules are modified. That is a future, isolated task.
