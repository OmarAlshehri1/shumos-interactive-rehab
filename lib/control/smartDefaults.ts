import { Difficulty, PlayArea, TargetSize, TargetSpacing } from "@/lib/game";

export interface DifficultyDefaults {
  targetSize: TargetSize;
  targetSpacing: TargetSpacing;
  playArea: PlayArea;
}

/**
 * Sensible setup-screen starting point for each difficulty, applied
 * automatically when the therapist picks one — pure setup UX convenience,
 * not part of the approved Task 2 difficulty ramp (lib/game/difficultyRules.ts
 * is untouched and still owns the actual balloon counts/colors/sizing math).
 * The therapist can override any of these afterward; picking a different
 * difficulty re-applies its own defaults from scratch.
 */
export const DIFFICULTY_DEFAULTS: Record<Difficulty, DifficultyDefaults> = {
  [Difficulty.EASY]: { targetSize: TargetSize.LARGE, targetSpacing: TargetSpacing.CLOSE, playArea: PlayArea.FULL },
  [Difficulty.MEDIUM]: { targetSize: TargetSize.MEDIUM, targetSpacing: TargetSpacing.MEDIUM, playArea: PlayArea.FULL },
  [Difficulty.ADVANCED]: { targetSize: TargetSize.SMALL, targetSpacing: TargetSpacing.WIDE, playArea: PlayArea.FULL },
};
