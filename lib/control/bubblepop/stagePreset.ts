import {
  Difficulty,
  generateBubbleField,
  getBubblePopStageBlueprint,
  type BubblePopSessionConfig,
  type BubblePopStageBlueprint,
  type GeneratedBubbleField,
  type StageNumber,
} from "@/lib/bubblepop";
import { BUBBLE_POP_DIFFICULTY_DEFAULTS } from "./smartDefaults";

/**
 * THERAPIST SETUP SIMPLIFICATION — fixed seed so every Stage Card preview
 * (and the Ready screen's reuse of it) renders the exact same wall layout on
 * every render, never a random one. Actual sessions still get a real random
 * seed from createBubblePopSession — this constant is preview-only. Mirrors
 * lib/control/stagePreset.ts's STAGE_PREVIEW_SEED exactly.
 */
export const BUBBLE_POP_STAGE_PREVIEW_SEED = "bubble-pop-stage-preview";

export interface BubblePopStagePreset {
  /** Full BubblePopSessionConfig shape (minus a real childFirstName) — the single source of truth for both preview and confirmSetup. */
  config: BubblePopSessionConfig;
  blueprint: BubblePopStageBlueprint;
  stage: GeneratedBubbleField;
}

/**
 * Resolves a (difficulty, stage) pair to the exact preset the engine will
 * use: the difficulty's smart-default technical fields
 * (BUBBLE_POP_DIFFICULTY_DEFAULTS — previously only applied to the setup
 * draft) plus the stage's real blueprint-driven bubble field
 * (generateBubbleField, the same function createBubblePopSession calls).
 * Nothing here is new generation logic — it only combines two things that
 * already existed and already were the source of truth, so a Stage Card
 * preview and the actual session it starts can never drift. Mirrors
 * lib/control/stagePreset.ts's getStagePreset exactly.
 */
export function getBubblePopStagePreset(difficulty: Difficulty, stageNumber: StageNumber): BubblePopStagePreset {
  const config: BubblePopSessionConfig = {
    childFirstName: "",
    difficulty,
    startingStage: stageNumber,
    ...BUBBLE_POP_DIFFICULTY_DEFAULTS[difficulty],
  };
  const blueprint = getBubblePopStageBlueprint(difficulty, stageNumber);
  const stage = generateBubbleField({ seed: BUBBLE_POP_STAGE_PREVIEW_SEED, difficulty, stageNumber, config });
  return { config, blueprint, stage };
}
