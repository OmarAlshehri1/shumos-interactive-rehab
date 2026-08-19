import {
  Difficulty,
  generateFeedStage,
  getFeedAnimalsStageBlueprint,
  type FeedAnimalsSessionConfig,
  type FeedAnimalsStageBlueprint,
  type GeneratedFeedStage,
  type StageNumber,
} from "@/lib/feedanimals";
import { FEED_ANIMALS_DIFFICULTY_DEFAULTS } from "./smartDefaults";

/**
 * THERAPIST SETUP SIMPLIFICATION — fixed seed so every Stage Card preview
 * (and the Ready screen's reuse of it) renders the exact same layout on
 * every render, never a random one. Actual sessions still get a real random
 * seed from createFeedAnimalsSession — this constant is preview-only.
 */
export const FEED_ANIMALS_STAGE_PREVIEW_SEED = "stage-preview";

export interface FeedAnimalsStagePreset {
  /** Full FeedAnimalsSessionConfig shape (minus a real childFirstName) — the single source of truth for both preview and confirmSetup. */
  config: FeedAnimalsSessionConfig;
  blueprint: FeedAnimalsStageBlueprint;
  stage: GeneratedFeedStage;
}

/**
 * Resolves a (difficulty, stage) pair to the exact preset the engine will
 * use: the difficulty's smart-default technical fields
 * (FEED_ANIMALS_DIFFICULTY_DEFAULTS — previously only applied to the setup
 * draft) plus the stage's real blueprint-driven round sequence
 * (generateFeedStage, the same function createFeedAnimalsSession calls).
 * Nothing here is new generation logic — it only combines two things that
 * already existed and already were the source of truth, so a Stage Card
 * preview and the actual session it starts can never drift.
 */
export function getFeedAnimalsStagePreset(difficulty: Difficulty, stageNumber: StageNumber): FeedAnimalsStagePreset {
  const config: FeedAnimalsSessionConfig = {
    childFirstName: "",
    difficulty,
    startingStage: stageNumber,
    ...FEED_ANIMALS_DIFFICULTY_DEFAULTS[difficulty],
  };
  const blueprint = getFeedAnimalsStageBlueprint(difficulty, stageNumber);
  const stage = generateFeedStage({ seed: FEED_ANIMALS_STAGE_PREVIEW_SEED, difficulty, stageNumber, config });
  return { config, blueprint, stage };
}
