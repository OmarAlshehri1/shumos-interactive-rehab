import { Difficulty, PathStyle, PathWidth, StepLength } from "@/lib/footsteps";

export interface FootstepsDifficultyDefaults {
  stepLength: StepLength;
  pathStyle: PathStyle;
  pathWidth: PathWidth;
}

/**
 * Sensible setup-screen starting point for each difficulty — pure setup UX
 * convenience, not part of the approved stage-blueprint ramp
 * (lib/footsteps/difficultyRules.ts still owns the actual step-count/
 * lateral-variation math). Matches the product rule directly: EASY defaults
 * to a mostly-forward path (simpler planning), MEDIUM to gentle left/right
 * alternation, ADVANCED to a varied, wider corridor (richer directional
 * changes) — never a faster pace, which no field here controls. The
 * therapist can override any of these; picking a different difficulty
 * re-applies its own defaults from scratch, same convention as Balloon
 * Quest's DIFFICULTY_DEFAULTS.
 */
export const FOOTSTEPS_DIFFICULTY_DEFAULTS: Record<Difficulty, FootstepsDifficultyDefaults> = {
  [Difficulty.EASY]: { stepLength: StepLength.MEDIUM, pathStyle: PathStyle.STRAIGHT, pathWidth: PathWidth.NARROW },
  [Difficulty.MEDIUM]: { stepLength: StepLength.MEDIUM, pathStyle: PathStyle.LEFT_RIGHT, pathWidth: PathWidth.MEDIUM },
  [Difficulty.ADVANCED]: { stepLength: StepLength.MEDIUM, pathStyle: PathStyle.VARIED, pathWidth: PathWidth.WIDE },
};
