"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameState } from "@/lib/game";

/**
 * Safety ceilings only. Normal release comes from the game scene's actual
 * final-effect completion callback; these bounds prevent a broken animation
 * callback from trapping the child in Playing forever.
 */
export const FINAL_ACTION_FAILSAFE_MS = {
  balloonQuest: 1_300,
  footsteps: 1_250,
  bubblePop: 1_800,
  spacePilot: 1_600,
  colorChase: 1_150,
} as const;

export function shouldBeginFinalActionHandoff(previous: GameState, current: GameState): boolean {
  return previous === GameState.PLAYING && current === GameState.STAGE_COMPLETE;
}

/**
 * Keeps the Playing scene mounted for the first STAGE_COMPLETE render so it
 * receives the final canonical target update and can run its local effect.
 * Stage Complete appears only after `finishFinalAction` or the bounded
 * game-specific failsafe. Canonical scoring/state are never delayed.
 */
export function useStageCompletionPresentation(gameState: GameState, stageKey: string, failsafeMs: number) {
  const previousStateRef = useRef(gameState);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [heldStageKey, setHeldStageKey] = useState<string | null>(null);

  // This ref intentionally tracks the immediately preceding committed canonical state;
  // reading it here is what prevents even one Stage Complete paint from obscuring the final action.
  // eslint-disable-next-line react-hooks/refs
  const beginsNow = shouldBeginFinalActionHandoff(previousStateRef.current, gameState);
  const holdingFinalAction = gameState === GameState.STAGE_COMPLETE && (beginsNow || heldStageKey === stageKey);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const finishFinalAction = useCallback(() => {
    clearTimer();
    setHeldStageKey((current) => (current === stageKey ? null : current));
  }, [clearTimer, stageKey]);

  useEffect(() => {
    previousStateRef.current = gameState;

    if (beginsNow) {
      // Preserve the render-time hold across the follow-up render caused by this effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHeldStageKey(stageKey);
      clearTimer();
      timeoutRef.current = setTimeout(() => setHeldStageKey((current) => (current === stageKey ? null : current)), failsafeMs);
      return;
    }

    if (gameState !== GameState.STAGE_COMPLETE) {
      clearTimer();
      setHeldStageKey(null);
    }
  }, [beginsNow, clearTimer, failsafeMs, gameState, stageKey]);

  useEffect(() => clearTimer, [clearTimer]);

  return { holdingFinalAction, finishFinalAction };
}
