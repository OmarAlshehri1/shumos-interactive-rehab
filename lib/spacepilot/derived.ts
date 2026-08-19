import { Difficulty } from "@/lib/game";
import { totalStarsInSequence } from "./encounters";
import { isEncounterStage, isStarOnlyStage, TOTAL_STARS, type SpacePilotAnyStageRuntime } from "./session";
import { EncounterType, StarLane, type SpaceEncounter } from "./types";

/**
 * Cross-cutting read-only accessors shared by every control/display
 * component that needs to render "how many stars / what's the current
 * object / how far along is this stage" WITHOUT re-deriving the
 * STAR_ONLY-vs-ENCOUNTER branch itself at every call site. Every function
 * here is a pure projection of SpacePilotAnyStageRuntime — none of them
 * mutate or decide gameplay (that's exclusively session.ts's job).
 */

export function totalStarsFor(difficulty: Difficulty): number {
  return difficulty === Difficulty.EASY ? TOTAL_STARS : totalStarsInSequence(difficulty);
}

export function stageStarsCollected(stage: SpacePilotAnyStageRuntime): number {
  return isStarOnlyStage(stage) ? stage.collectedCount : stage.collectedStars;
}

/** Same number as stageStarsCollected — the rocket's upgrade level is always exactly how many stars have been collected so far in the CURRENT stage (task's "Upgrade resets to 0" on restart, 1:1 with collected stars). */
export function stageUpgradeLevel(stage: SpacePilotAnyStageRuntime): number {
  return stageStarsCollected(stage);
}

export function stageCurrentIndex(stage: SpacePilotAnyStageRuntime): number {
  return isStarOnlyStage(stage) ? stage.currentStarIndex : stage.currentEncounterIndex;
}

export function stageTotalCount(stage: SpacePilotAnyStageRuntime): number {
  return isStarOnlyStage(stage) ? stage.stars.length : stage.encounters.length;
}

export function stageAsteroidsCleared(stage: SpacePilotAnyStageRuntime): number | null {
  return isEncounterStage(stage) ? stage.asteroidsCleared : null;
}

export function stageAsteroidsAvoided(stage: SpacePilotAnyStageRuntime): number | null {
  return isEncounterStage(stage) ? stage.asteroidsAvoided : null;
}

/** The encounter the therapist/child should currently be reacting to (MEDIUM/ADVANCED only) — null once the stage has resolved every encounter, or on EASY (which has no FIRE/asteroid/alien concept). */
export function stageIncomingEncounter(stage: SpacePilotAnyStageRuntime): SpaceEncounter | null {
  if (!isEncounterStage(stage)) return null;
  return stage.currentEncounterIndex < stage.encounters.length ? stage.encounters[stage.currentEncounterIndex] : null;
}

/** EASY's incoming star lane, in the same shape as stageIncomingEncounter's `.lane` — lets a therapist-facing "incoming: LANE" chip stay a single code path across all three difficulties. */
export function stageIncomingLane(stage: SpacePilotAnyStageRuntime): StarLane | null {
  if (isStarOnlyStage(stage)) {
    return stage.currentStarIndex < stage.stars.length ? stage.stars[stage.currentStarIndex].lane : null;
  }
  const encounter = stageIncomingEncounter(stage);
  return encounter?.lane ?? null;
}

export function stageIncomingType(stage: SpacePilotAnyStageRuntime): EncounterType {
  const encounter = stageIncomingEncounter(stage);
  return encounter?.type ?? EncounterType.STAR;
}
