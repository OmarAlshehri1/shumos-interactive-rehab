import { DIFFICULTY_ORDER, getAdjacentDifficulty, STAGES_PER_DIFFICULTY } from "@/lib/game";
import { Difficulty, type StageNumber } from "./types";

export { DIFFICULTY_ORDER, getAdjacentDifficulty, STAGES_PER_DIFFICULTY };

/**
 * The parameters that define one stage's difficulty, before the therapist's
 * FoodSize/ReachHeight/ReachSide/MovementPattern preferences are applied.
 * Positions are never hardcoded here — only counts/variety/base size/spacing
 * — the actual layout is generated procedurally in feedGenerator.ts.
 *
 * `roundCount` is exactly task section 20's suggested round counts
 * (EASY 3/3/4/4/5, MEDIUM 4/4/5/5/6, ADVANCED 5/5/6/6/7). `choiceCount` is
 * task section 18's smart defaults (EASY 2, MEDIUM 3, ADVANCED 4).
 * `animalPoolSize` is how many distinct animals this stage draws rounds
 * from (task section 19's "animal variety" progression knob). ADVANCED
 * DOES NOT MEAN FASTER — nothing here ever shortens the time the child is
 * given; difficulty comes from round count, choice count, animal variety,
 * and spatial spread only.
 */
export interface FeedAnimalsStageBlueprint {
  roundCount: number;
  choiceCount: number;
  animalPoolSize: number;
  /** Food diameter, normalized to the wall's shorter side, before the FoodSize multiplier. */
  baseSize: number;
  /** Minimum extra gap between food-choice edges, normalized, before spacing relaxation in placement. */
  baseSpacing: number;
}

/**
 * Five stages per difficulty, the same gentle-ramp philosophy as every
 * other game: each stage increases round count / animal variety a little
 * over the last, never a sudden jump.
 */
export const FEED_ANIMALS_DIFFICULTY_RULES: Record<
  Difficulty,
  readonly [FeedAnimalsStageBlueprint, FeedAnimalsStageBlueprint, FeedAnimalsStageBlueprint, FeedAnimalsStageBlueprint, FeedAnimalsStageBlueprint]
> = {
  [Difficulty.EASY]: [
    { roundCount: 3, choiceCount: 2, animalPoolSize: 2, baseSize: 0.2, baseSpacing: 0.16 },
    { roundCount: 3, choiceCount: 2, animalPoolSize: 2, baseSize: 0.2, baseSpacing: 0.16 },
    { roundCount: 4, choiceCount: 2, animalPoolSize: 3, baseSize: 0.19, baseSpacing: 0.15 },
    { roundCount: 4, choiceCount: 2, animalPoolSize: 3, baseSize: 0.19, baseSpacing: 0.15 },
    { roundCount: 5, choiceCount: 2, animalPoolSize: 3, baseSize: 0.18, baseSpacing: 0.14 },
  ],
  [Difficulty.MEDIUM]: [
    { roundCount: 4, choiceCount: 3, animalPoolSize: 3, baseSize: 0.165, baseSpacing: 0.12 },
    { roundCount: 4, choiceCount: 3, animalPoolSize: 3, baseSize: 0.165, baseSpacing: 0.12 },
    { roundCount: 5, choiceCount: 3, animalPoolSize: 4, baseSize: 0.155, baseSpacing: 0.11 },
    { roundCount: 5, choiceCount: 3, animalPoolSize: 4, baseSize: 0.155, baseSpacing: 0.11 },
    { roundCount: 6, choiceCount: 3, animalPoolSize: 4, baseSize: 0.145, baseSpacing: 0.1 },
  ],
  [Difficulty.ADVANCED]: [
    { roundCount: 5, choiceCount: 4, animalPoolSize: 4, baseSize: 0.135, baseSpacing: 0.09 },
    { roundCount: 5, choiceCount: 4, animalPoolSize: 4, baseSize: 0.135, baseSpacing: 0.09 },
    { roundCount: 6, choiceCount: 4, animalPoolSize: 5, baseSize: 0.125, baseSpacing: 0.085 },
    { roundCount: 6, choiceCount: 4, animalPoolSize: 5, baseSize: 0.125, baseSpacing: 0.085 },
    { roundCount: 7, choiceCount: 4, animalPoolSize: 5, baseSize: 0.115, baseSpacing: 0.08 },
  ],
};

export function getFeedAnimalsStageBlueprint(difficulty: Difficulty, stageNumber: StageNumber): FeedAnimalsStageBlueprint {
  return FEED_ANIMALS_DIFFICULTY_RULES[difficulty][stageNumber - 1];
}
