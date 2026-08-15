import { GameState } from "./types";

/**
 * Explicit allowed transitions. Anything not listed here is rejected. There
 * is deliberately no backward navigation (e.g. SETUP -> WELCOME) and no
 * shortcut skipping COUNTDOWN or INSTRUCTIONS — those are UI/product
 * decisions for a future task, not the engine's to assume.
 *
 * STAGE_COMPLETE only ever advances to START_ZONE now (TASK 11 — see
 * below): SESSION_COMPLETE is reached only via the therapist's explicit
 * "إنهاء الجلسة" (lib/game/session.ts's endSession), which constructs it
 * directly rather than going through this table, since it must be reachable
 * from any in-progress state, not just STAGE_COMPLETE.
 *
 * TASK 8.2: START_ZONE sits before INSTRUCTIONS both the first time (from
 * SETUP) and every subsequent time (from STAGE_COMPLETE) — the child must be
 * confirmed back at their starting position before any new stage's
 * instruction/countdown/play sequence begins. The only way out of
 * START_ZONE is the therapist's explicit ready confirmation (an ordinary
 * applyGameTransition call to INSTRUCTIONS) — there is no timer and no
 * sensor, matching the "no fake detection" requirement.
 *
 * TASK 11 — INSTRUCTIONS/COUNTDOWN/PLAYING -> START_ZONE: a therapist may
 * skip the current stage or jump forward to a later one (lib/game/session.ts's
 * jumpToStage) any time during a stage's instructions/countdown/play, not
 * only after it naturally completes — same "must return through Start Zone"
 * rule applies (see Task 11 report's "Start Zone integration" section), so
 * this always lands on START_ZONE, never straight into the next stage's
 * INSTRUCTIONS.
 */
const ALLOWED_TRANSITIONS: Record<GameState, readonly GameState[]> = {
  [GameState.WELCOME]: [GameState.SETUP],
  [GameState.SETUP]: [GameState.START_ZONE],
  [GameState.START_ZONE]: [GameState.INSTRUCTIONS],
  [GameState.INSTRUCTIONS]: [GameState.COUNTDOWN, GameState.START_ZONE],
  [GameState.COUNTDOWN]: [GameState.PLAYING, GameState.START_ZONE],
  [GameState.PLAYING]: [GameState.STAGE_COMPLETE, GameState.START_ZONE],
  [GameState.STAGE_COMPLETE]: [GameState.START_ZONE],
  [GameState.SESSION_COMPLETE]: [],
};

export function isValidTransition(from: GameState, to: GameState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export type TransitionResult =
  | { success: true; state: GameState }
  | { success: false; state: GameState; reason: string };

/** Pure, side-effect-free transition check. Invalid transitions are rejected, never thrown. */
export function transition(from: GameState, to: GameState): TransitionResult {
  if (isValidTransition(from, to)) {
    return { success: true, state: to };
  }
  return {
    success: false,
    state: from,
    reason: `Invalid transition: ${from} -> ${to}`,
  };
}
