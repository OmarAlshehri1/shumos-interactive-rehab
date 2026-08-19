import { Difficulty, FoodSize, MovementPattern, ReachHeight, ReachSide } from "@/lib/feedanimals";

export interface FeedAnimalsDifficultyDefaults {
  foodSize: FoodSize;
  reachHeight: ReachHeight;
  reachSide: ReachSide;
  movementPattern: MovementPattern;
}

/**
 * Sensible setup-screen starting point for each difficulty (task section
 * 18) — pure setup UX convenience, not part of the approved stage-blueprint
 * ramp (lib/feedanimals/difficultyRules.ts still owns the actual round-
 * count/choice-count math). EASY defaults to large food, a full/generous
 * reach zone, and CENTRAL positions (low cognitive load, strong visual
 * clarity); MEDIUM keeps a full reach zone but VARIES positions across it
 * for more spatial exploration; ADVANCED introduces smaller food and the
 * CROSS movement pattern's controlled broader reaching. The therapist can
 * override any of these; picking a different difficulty re-applies its own
 * defaults from scratch, same convention as every other game.
 */
export const FEED_ANIMALS_DIFFICULTY_DEFAULTS: Record<Difficulty, FeedAnimalsDifficultyDefaults> = {
  [Difficulty.EASY]: { foodSize: FoodSize.LARGE, reachHeight: ReachHeight.FULL, reachSide: ReachSide.FULL, movementPattern: MovementPattern.CENTRAL },
  [Difficulty.MEDIUM]: { foodSize: FoodSize.MEDIUM, reachHeight: ReachHeight.FULL, reachSide: ReachSide.FULL, movementPattern: MovementPattern.VARIED },
  [Difficulty.ADVANCED]: { foodSize: FoodSize.SMALL, reachHeight: ReachHeight.FULL, reachSide: ReachSide.FULL, movementPattern: MovementPattern.CROSS },
};
