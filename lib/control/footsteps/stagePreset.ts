import {
  Difficulty,
  generateFootstepsPath,
  getFootstepsStageBlueprint,
  type FootstepsSessionConfig,
  type FootstepsStageBlueprint,
  type GeneratedFootstepsPath,
  type StageNumber,
} from "@/lib/footsteps";
import { FOOTSTEPS_DIFFICULTY_DEFAULTS } from "./smartDefaults";

/**
 * THERAPIST SETUP SIMPLIFICATION — mirrors lib/control/stagePreset.ts's
 * STAGE_PREVIEW_SEED exactly: a fixed seed so every Stage Card preview (and
 * the Ready screen's reuse of it) renders the exact same path on every
 * render, never a random one. Real sessions still get a real random seed
 * from createFootstepsSession — this constant is preview-only.
 */
export const FOOTSTEPS_STAGE_PREVIEW_SEED = "footsteps-stage-preview";

export interface FootstepsStagePreset {
  /** Full FootstepsSessionConfig shape (minus a real childFirstName) — the single source of truth for both preview and confirmSetup. */
  config: FootstepsSessionConfig;
  blueprint: FootstepsStageBlueprint;
  path: GeneratedFootstepsPath;
}

/**
 * Resolves a (difficulty, stage) pair to the exact preset the engine will
 * use: the difficulty's smart-default technical fields
 * (FOOTSTEPS_DIFFICULTY_DEFAULTS) plus the stage's real blueprint-driven
 * route (generateFootstepsPath, the same function createFootstepsSession
 * calls). Nothing here is new generation logic — it only combines two things
 * that already existed and already were the source of truth, so a Stage
 * Card preview and the actual session it starts can never drift. Mirrors
 * lib/control/stagePreset.ts's getStagePreset exactly.
 */
export function getFootstepsStagePreset(difficulty: Difficulty, stageNumber: StageNumber): FootstepsStagePreset {
  const config: FootstepsSessionConfig = {
    childFirstName: "",
    difficulty,
    startingStage: stageNumber,
    ...FOOTSTEPS_DIFFICULTY_DEFAULTS[difficulty],
  };
  const blueprint = getFootstepsStageBlueprint(difficulty, stageNumber);
  const path = generateFootstepsPath({ seed: FOOTSTEPS_STAGE_PREVIEW_SEED, difficulty, stageNumber, config });
  return { config, blueprint, path };
}
