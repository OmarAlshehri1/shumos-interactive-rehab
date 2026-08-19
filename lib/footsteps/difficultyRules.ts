import { DIFFICULTY_ORDER, getAdjacentDifficulty, STAGES_PER_DIFFICULTY } from "@/lib/game";
import { Difficulty, type StageNumber } from "./types";

export { DIFFICULTY_ORDER, getAdjacentDifficulty, STAGES_PER_DIFFICULTY };

/**
 * The parameters that define one stage's difficulty — deliberately NOT
 * speed. Per the product rule "Advanced does not mean faster... difficulty
 * comes from movement planning, path complexity, number of steps,
 * directional variation, NOT speed": `stepCount` is the number of footprints
 * the child follows. How much the route wanders left/right lives entirely in
 * each stage's own JourneyPlan (lib/footsteps/journeyPlans.ts) now — a real
 * per-stage authored SHAPE, not a single blind difficulty-wide bound. Nothing
 * here ever shortens the time the child is given; the therapist controls
 * pace via Pause and by simply waiting before confirming each step.
 */
export interface FootstepsStageBlueprint {
  stepCount: number;
}

/**
 * Five stages per difficulty, the same gentle-ramp philosophy as Balloon
 * Quest's DIFFICULTY_RULES (see lib/game/difficultyRules.ts): each stage
 * increases stepCount a little over the last, never a sudden jump. Step
 * counts follow the task's suggested pediatric philosophy: EASY 4/5/6/7/8,
 * MEDIUM 6/7/8/9/10, ADVANCED 8/9/10/11/12.
 */
export const FOOTSTEPS_DIFFICULTY_RULES: Record<
  Difficulty,
  readonly [FootstepsStageBlueprint, FootstepsStageBlueprint, FootstepsStageBlueprint, FootstepsStageBlueprint, FootstepsStageBlueprint]
> = {
  [Difficulty.EASY]: [{ stepCount: 4 }, { stepCount: 5 }, { stepCount: 6 }, { stepCount: 7 }, { stepCount: 8 }],
  [Difficulty.MEDIUM]: [{ stepCount: 6 }, { stepCount: 7 }, { stepCount: 8 }, { stepCount: 9 }, { stepCount: 10 }],
  [Difficulty.ADVANCED]: [{ stepCount: 8 }, { stepCount: 9 }, { stepCount: 10 }, { stepCount: 11 }, { stepCount: 12 }],
};

export function getFootstepsStageBlueprint(difficulty: Difficulty, stageNumber: StageNumber): FootstepsStageBlueprint {
  return FOOTSTEPS_DIFFICULTY_RULES[difficulty][stageNumber - 1];
}
