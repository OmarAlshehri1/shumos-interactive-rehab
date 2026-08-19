import { BubbleSize, Difficulty, ReachHeight, ReachSide, TargetMode } from "@/lib/bubblepop";

export interface BubblePopDifficultyDefaults {
  bubbleSize: BubbleSize;
  reachHeight: ReachHeight;
  reachSide: ReachSide;
  targetMode: TargetMode;
}

/**
 * Sensible setup-screen starting point for each difficulty — pure setup UX
 * convenience, not part of the approved stage-blueprint ramp
 * (lib/bubblepop/difficultyRules.ts still owns the actual field-size/
 * target-count math). Matches the product rule directly: EASY defaults to
 * large bubbles, a full/generous reach zone, and color-only targets (low
 * cognitive load); MEDIUM keeps color-only but narrows toward one side to
 * introduce directional exploration; ADVANCED introduces color+shape
 * discrimination with smaller bubbles across the full wall. The therapist
 * can override any of these; picking a different difficulty re-applies its
 * own defaults from scratch, same convention as the other two games.
 */
export const BUBBLE_POP_DIFFICULTY_DEFAULTS: Record<Difficulty, BubblePopDifficultyDefaults> = {
  [Difficulty.EASY]: { bubbleSize: BubbleSize.LARGE, reachHeight: ReachHeight.FULL, reachSide: ReachSide.FULL, targetMode: TargetMode.COLOR_ONLY },
  [Difficulty.MEDIUM]: { bubbleSize: BubbleSize.MEDIUM, reachHeight: ReachHeight.FULL, reachSide: ReachSide.FULL, targetMode: TargetMode.COLOR_ONLY },
  [Difficulty.ADVANCED]: { bubbleSize: BubbleSize.SMALL, reachHeight: ReachHeight.FULL, reachSide: ReachSide.FULL, targetMode: TargetMode.COLOR_AND_SHAPE },
};
