import {
  Difficulty,
  generateStage,
  getStageBlueprint,
  type GeneratedStage,
  type SessionConfig,
  type StageBlueprint,
  type StageNumber,
} from "@/lib/game";
import { DIFFICULTY_DEFAULTS } from "./smartDefaults";

/**
 * THERAPIST SETUP SIMPLIFICATION — fixed seed so every Stage Card preview
 * (and the Ready screen's reuse of it) renders the exact same layout on
 * every render, never a random one. Actual sessions still get a real random
 * seed from createSession — this constant is preview-only.
 */
export const STAGE_PREVIEW_SEED = "stage-preview";

export interface StagePreset {
  /** Full SessionConfig shape (minus a real childFirstName) — the single source of truth for both preview and confirmSetup. */
  config: SessionConfig;
  blueprint: StageBlueprint;
  stage: GeneratedStage;
}

/**
 * Resolves a (difficulty, stage) pair to the exact preset the engine will
 * use: the difficulty's smart-default technical fields (DIFFICULTY_DEFAULTS
 * — previously only applied to the setup draft) plus the stage's real
 * blueprint-driven layout (generateStage, the same function createSession
 * calls). Nothing here is new generation logic — it only combines two
 * things that already existed and already were the source of truth, so a
 * Stage Card preview and the actual session it starts can never drift.
 */
export function getStagePreset(difficulty: Difficulty, stageNumber: StageNumber): StagePreset {
  const config: SessionConfig = {
    childFirstName: "",
    difficulty,
    startingStage: stageNumber,
    ...DIFFICULTY_DEFAULTS[difficulty],
  };
  const blueprint = getStageBlueprint(difficulty, stageNumber);
  const stage = generateStage({ seed: STAGE_PREVIEW_SEED, difficulty, stageNumber, config });
  return { config, blueprint, stage };
}
