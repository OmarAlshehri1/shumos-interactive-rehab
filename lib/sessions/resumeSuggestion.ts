import { Difficulty, getAdjacentDifficulty, STAGES_PER_DIFFICULTY, StageStatus, type StageNumber } from "@/lib/game";
import { BQ3_STAGES_PER_DIFFICULTY } from "./balloonQuestVersion";

/**
 * MULTI-GAME PLATFORM — the minimal shape suggestResumePoint actually needs.
 * Both StoredSession (Balloon Quest) and StoredFootstepsSession (Follow the
 * Footsteps — see ./types) satisfy this structurally without any cast: the
 * resume algorithm below only ever reads startingDifficulty/startingStage
 * and each stage result's status/difficulty/stageNumber, none of which are
 * game-specific. Widening the parameter type here (rather than duplicating
 * this whole function per game) is exactly the kind of shared, safely-generic
 * abstraction the platform is meant to grow.
 */
export interface StoredSessionLike {
  startingDifficulty: Difficulty;
  startingStage: StageNumber;
  stageResults: readonly { status: StageStatus; difficulty: Difficulty; stageNumber: StageNumber; engine?: "bq3" | "dome3" | "fp3" | "cc3" }[];
}

export type ResumeReason =
  /** No stage was ever entered in the reference session — resume exactly where it started. */
  | "session-start"
  /** The last stage was ended early/jumped past — resume that same stage, not the next one. */
  | "resume-skipped"
  /** The last stage was completed and the same difficulty has another stage after it. */
  | "next-stage"
  /** The last stage was difficulty's final stage (5), completed — offered the next harder difficulty's stage 1. */
  | "next-difficulty"
  /** Already at ADVANCED's final stage, completed — nowhere harder to suggest. */
  | "repeat-final-stage";

export interface ResumeSuggestion {
  difficulty: Difficulty;
  startingStage: StageNumber;
  reason: ResumeReason;
}

/**
 * SESSION HISTORY TASK — "متابعة من آخر تقدم" — resume-from-last-progress
 * algorithm (task section 8). Pure and Firebase-free (see
 * lib/sessions/__tests__/resumeSuggestion.test.ts). Reuses lib/game's own
 * canonical STAGES_PER_DIFFICULTY / getAdjacentDifficulty — never invents a
 * new progression rule.
 *
 * Algorithm, in order:
 *  1. No stage ever entered in `mostRecentSession` -> resume at that
 *     session's own starting point (nothing to "continue" from).
 *  2. Last stage SKIPPED (therapist jumped past it or ended it early) ->
 *     resume that SAME stage, not the next one — it was never actually
 *     finished.
 *  3. Last stage COMPLETED, and it wasn't the difficulty's final (5th)
 *     stage -> suggest the next stage number, same difficulty.
 *  4. Last stage COMPLETED and it WAS stage 5 -> suggest the next harder
 *     difficulty's stage 1 (e.g. Medium 5 -> Advanced 1). This is only ever
 *     a SUGGESTION the therapist can change on the setup screen before
 *     starting — never an automatic claim the child is ready to progress.
 *  5. Already ADVANCED stage 5, completed -> no harder tier exists; suggest
 *     repeating that same stage.
 *
 * The caller is responsible for picking `mostRecentSession` — normally the
 * most recent StoredSession for the specific game being resumed (see
 * PatientProfileScreen, which filters by gameId before calling this).
 */
export function suggestResumePoint(mostRecentSession: StoredSessionLike): ResumeSuggestion {
  const lastResult = mostRecentSession.stageResults[mostRecentSession.stageResults.length - 1] ?? null;

  if (!lastResult) {
    return { difficulty: mostRecentSession.startingDifficulty, startingStage: mostRecentSession.startingStage, reason: "session-start" };
  }

  if (lastResult.status === StageStatus.SKIPPED) {
    return { difficulty: lastResult.difficulty, startingStage: lastResult.stageNumber, reason: "resume-skipped" };
  }

  // Balloon Quest 3D records have three stages per difficulty; legacy records have five and are never reinterpreted.
  const stagesPerDifficulty = (lastResult.engine === "bq3" || lastResult.engine === "dome3" || lastResult.engine === "fp3" || lastResult.engine === "cc3") ? BQ3_STAGES_PER_DIFFICULTY : STAGES_PER_DIFFICULTY;
  if (lastResult.stageNumber < stagesPerDifficulty) {
    return { difficulty: lastResult.difficulty, startingStage: (lastResult.stageNumber + 1) as StageNumber, reason: "next-stage" };
  }

  const harder = getAdjacentDifficulty(lastResult.difficulty, "harder");
  if (harder) {
    return { difficulty: harder, startingStage: 1, reason: "next-difficulty" };
  }

  return { difficulty: lastResult.difficulty, startingStage: lastResult.stageNumber, reason: "repeat-final-stage" };
}
