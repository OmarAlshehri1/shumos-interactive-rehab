import { STAGES_PER_DIFFICULTY } from "@/lib/game";

/**
 * Balloon Quest history exists in TWO shapes under the same `balloon-quest`
 * game id: the original five-stages-per-difficulty game, and the redesigned
 * three-stages-per-difficulty game ("bq3"). The history node's security rules
 * reject unknown top-level fields, so the version travels on each stage result
 * (`engine: "bq3"`), which the rules leave free-form. Anything without the
 * marker is the legacy five-stage game and is NEVER reinterpreted as three-stage.
 */
export const BQ3_STAGES_PER_DIFFICULTY = 3;

export function isBalloonQuest3DSession(session: { stageResults?: readonly object[] | null }): boolean {
  return !!session.stageResults?.some((r) => (r as { engine?: unknown } | null)?.engine === "bq3");
}

/** Stages per difficulty for a stored Balloon Quest session (3 for the new game, 5 for legacy records). */
export function balloonQuestStagesPerDifficulty(session: { stageResults?: readonly object[] | null }): number {
  return isBalloonQuest3DSession(session) ? BQ3_STAGES_PER_DIFFICULTY : STAGES_PER_DIFFICULTY;
}
