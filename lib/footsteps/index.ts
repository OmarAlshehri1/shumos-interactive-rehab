export * from "./types";
export { START_ZONE, distanceToStartZone, circleOverlapsStartZone, START_ZONE_BALLOON_MARGIN, type NormalizedRect } from "@/lib/game";
export {
  DIFFICULTY_ORDER,
  FOOTSTEPS_DIFFICULTY_RULES,
  getAdjacentDifficulty,
  getFootstepsStageBlueprint,
  STAGES_PER_DIFFICULTY,
  type FootstepsStageBlueprint,
} from "./difficultyRules";
export { getStageDecisionTarget } from "@/lib/game";
export {
  generateFootstepsPath,
  type GenerateFootstepsPathParams,
  type GeneratedFootstepsPath,
} from "./pathGenerator";
export {
  FOOTSTEPS_JOURNEY_PLANS,
  journeyPlanFor,
  type JourneyObstaclePlan,
  type JourneyPlan,
  type JourneyShapeId,
} from "./journeyPlans";
export {
  averageStepTime,
  buildFootstepsSessionSummary,
  calculateCompletionRate,
  finalizeFootstepsStageResult,
  footstepsDifficultiesPlayed,
} from "./scoring";
export {
  advanceFootstepsStage,
  applyFootstepsGameTransition,
  confirmCurrentFootstep,
  createFootstepsSession,
  endFootstepsSession,
  jumpToFootstepsStage,
  pauseFootstepsSession,
  restartFootstepsStage,
  resumeFootstepsSession,
  skipFootstepsStage,
  switchFootstepsDifficulty,
  type CreateFootstepsSessionParams,
  type FootstepsActionResult,
  type FootstepsSessionState,
  type FootstepsStageRuntime,
} from "./session";
