import { DIFFICULTY_ORDER, getAdjacentDifficulty, STAGES_PER_DIFFICULTY } from "@/lib/game";
import { Difficulty, type StageNumber } from "./types";

export { DIFFICULTY_ORDER, getAdjacentDifficulty, STAGES_PER_DIFFICULTY };

/**
 * The parameters that define one stage's difficulty, before the therapist's
 * BubbleSize/ReachHeight/ReachSide/TargetMode preferences are applied.
 * Positions are never hardcoded here — only counts/variety/base size/spacing
 * — the actual layout is generated procedurally in bubbleGenerator.ts.
 *
 * `bubbleCount` is how many bubbles are visible on the wall at once (task
 * section 21's "bubble field size"); `targetCount` is how many of them get
 * sequentially requested this stage (task section 20's "target counts") —
 * always <= bubbleCount, the remainder stay as permanent visual decoys for
 * the whole stage. Advanced does NOT mean faster: nothing here ever
 * shortens the time the child is given — difficulty comes from field size,
 * target-sequence length, color/shape variety, and spatial spread only.
 */
export interface BubblePopStageBlueprint {
  bubbleCount: number;
  targetCount: number;
  /** How many of BUBBLE_COLOR_ORDER are in play for this stage. */
  colorCount: number;
  /** How many of BUBBLE_SHAPE_ORDER are in play when TargetMode is COLOR_AND_SHAPE — irrelevant (every bubble is CIRCLE) under COLOR_ONLY. */
  shapeCount: number;
  /** Bubble diameter, normalized to the wall's shorter side, before the BubbleSize multiplier. */
  baseSize: number;
  /** Minimum extra gap between bubble edges, normalized, before spacing relaxation in placement. */
  baseSpacing: number;
}

/**
 * Five stages per difficulty, the same gentle-ramp philosophy as the other
 * two games: each stage increases bubbleCount/targetCount/colorCount a
 * little over the last, never a sudden jump. Field sizes and target counts
 * follow the task's suggested pediatric philosophy exactly:
 *   Easy field 4-7, targets 2-3-3-4-4
 *   Medium field 6-10, targets 3-3-4-4-5
 *   Advanced field 8-12, targets 3-4-4-5-5
 */
export const BUBBLE_POP_DIFFICULTY_RULES: Record<
  Difficulty,
  readonly [BubblePopStageBlueprint, BubblePopStageBlueprint, BubblePopStageBlueprint, BubblePopStageBlueprint, BubblePopStageBlueprint]
> = {
  [Difficulty.EASY]: [
    { bubbleCount: 4, targetCount: 2, colorCount: 3, shapeCount: 1, baseSize: 0.2, baseSpacing: 0.13 },
    { bubbleCount: 5, targetCount: 3, colorCount: 4, shapeCount: 1, baseSize: 0.19, baseSpacing: 0.125 },
    { bubbleCount: 6, targetCount: 3, colorCount: 4, shapeCount: 2, baseSize: 0.18, baseSpacing: 0.12 },
    { bubbleCount: 6, targetCount: 4, colorCount: 5, shapeCount: 2, baseSize: 0.17, baseSpacing: 0.115 },
    { bubbleCount: 7, targetCount: 4, colorCount: 5, shapeCount: 2, baseSize: 0.16, baseSpacing: 0.11 },
  ],
  [Difficulty.MEDIUM]: [
    { bubbleCount: 6, targetCount: 3, colorCount: 4, shapeCount: 2, baseSize: 0.155, baseSpacing: 0.105 },
    { bubbleCount: 7, targetCount: 3, colorCount: 5, shapeCount: 2, baseSize: 0.15, baseSpacing: 0.1 },
    { bubbleCount: 8, targetCount: 4, colorCount: 5, shapeCount: 3, baseSize: 0.145, baseSpacing: 0.095 },
    { bubbleCount: 9, targetCount: 4, colorCount: 6, shapeCount: 3, baseSize: 0.14, baseSpacing: 0.09 },
    { bubbleCount: 10, targetCount: 5, colorCount: 6, shapeCount: 3, baseSize: 0.135, baseSpacing: 0.085 },
  ],
  [Difficulty.ADVANCED]: [
    { bubbleCount: 8, targetCount: 3, colorCount: 5, shapeCount: 3, baseSize: 0.13, baseSpacing: 0.08 },
    { bubbleCount: 9, targetCount: 4, colorCount: 5, shapeCount: 3, baseSize: 0.125, baseSpacing: 0.0775 },
    { bubbleCount: 10, targetCount: 4, colorCount: 6, shapeCount: 4, baseSize: 0.12, baseSpacing: 0.075 },
    { bubbleCount: 11, targetCount: 5, colorCount: 6, shapeCount: 4, baseSize: 0.115, baseSpacing: 0.0725 },
    { bubbleCount: 12, targetCount: 5, colorCount: 6, shapeCount: 4, baseSize: 0.11, baseSpacing: 0.07 },
  ],
};

export function getBubblePopStageBlueprint(difficulty: Difficulty, stageNumber: StageNumber): BubblePopStageBlueprint {
  return BUBBLE_POP_DIFFICULTY_RULES[difficulty][stageNumber - 1];
}
