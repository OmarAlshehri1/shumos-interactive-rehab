import type { BalloonColor, StageNumber } from "@/lib/game";

/**
 * Semantic event boundary between the display experience and anything that
 * wants to react to it — currently the Task 4 audio layer, later possibly
 * Firebase/analytics. Scenes fire these at the moment each event visually
 * happens (e.g. "balloon_pop" fires when the pop animation starts, not when
 * the engine records the selection), so subscribers stay in sync with the
 * screen without needing to re-derive timing themselves.
 *
 * Naming matches Task 4's semantic event list (WELCOME, INSTRUCTION,
 * COUNTDOWN_3/2/1, START, BALLOON_POP, CORRECT, INCORRECT, STAGE_COMPLETE,
 * SESSION_COMPLETE, AMBIENCE_START/STOP) rather than Task 3's original flat
 * "countdown"/"pop" names, so a subscriber can switch on `type` directly.
 */
export type DisplayEvent =
  | { type: "welcome"; timestamp: number; childName: string }
  /** TASK 8.2: fired once when the Start Zone scene appears — isFirstStage distinguishes "before Stage 1" from "returning between stages" wording. */
  | { type: "start_zone"; timestamp: number; isFirstStage: boolean }
  | { type: "instruction"; timestamp: number; targetColor: BalloonColor; stageNumber: StageNumber }
  | { type: "countdown_3"; timestamp: number }
  | { type: "countdown_2"; timestamp: number }
  | { type: "countdown_1"; timestamp: number }
  | { type: "start"; timestamp: number }
  | { type: "balloon_pop"; timestamp: number }
  | { type: "correct"; timestamp: number; correctCount: number; totalTargets: number }
  | { type: "incorrect"; timestamp: number }
  | { type: "stage_complete"; timestamp: number; childName: string; stageNumber: StageNumber }
  | { type: "session_complete"; timestamp: number; childName: string }
  | { type: "ambience_start"; timestamp: number }
  | { type: "ambience_stop"; timestamp: number };

export type DisplayEventType = DisplayEvent["type"];

export type DisplayEventListener = (event: DisplayEvent) => void;

export const noopDisplayEventListener: DisplayEventListener = () => {};
