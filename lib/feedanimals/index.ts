export * from "./types";
export {
  DIFFICULTY_ORDER,
  FEED_ANIMALS_DIFFICULTY_RULES,
  getAdjacentDifficulty,
  getFeedAnimalsStageBlueprint,
  STAGES_PER_DIFFICULTY,
  type FeedAnimalsStageBlueprint,
} from "./difficultyRules";
export { getStageDecisionTarget } from "@/lib/game";
export {
  ANIMAL_FOOD_MAP,
  ANIMAL_ORDER,
  FOOD_ORDER,
  MIN_FOOD_SIZE,
  MAX_FOOD_SIZE,
  generateFeedStage,
  type GenerateFeedStageParams,
  type GeneratedFeedStage,
} from "./feedGenerator";
export {
  averageResponseTime,
  buildFeedAnimalsSessionSummary,
  feedAnimalsDifficultiesPlayed,
  calculateAccuracy,
  calculateCompletionRate,
  finalizeFeedAnimalsStageResult,
} from "./scoring";
export {
  advanceFeedAnimalsMonkey,
  advanceFeedAnimalsStage,
  applyFeedAnimalsGameTransition,
  confirmFoodSelection,
  createFeedAnimalsSession,
  currentRound,
  endFeedAnimalsSession,
  jumpToFeedAnimalsStage,
  pauseFeedAnimalsSession,
  restartFeedAnimalsStage,
  resumeFeedAnimalsSession,
  skipFeedAnimalsStage,
  switchFeedAnimalsDifficulty,
  type FeedAnimalsActionResult,
  type FeedAnimalsSessionState,
  type FeedAnimalsStageRuntime,
  type CreateFeedAnimalsSessionParams,
} from "./session";
export {
  feedAnimalsObstacleRequiresJump,
  getFeedAnimalsPathLeg,
  getFeedAnimalsPathStage,
  sampleFeedAnimalsMonkeyPosition,
  sampleFeedAnimalsPathFraction,
  sampleFeedAnimalsPathPosition,
  STAGE_1_EASY_PATH,
  type FeedAnimalsObstacleKind,
  type FeedAnimalsPathLeg,
  type FeedAnimalsPathObstacle,
  type FeedAnimalsPathSample,
  type FeedAnimalsPathStageDefinition,
  type FeedAnimalsWaterFeature,
} from "./pathStages";
