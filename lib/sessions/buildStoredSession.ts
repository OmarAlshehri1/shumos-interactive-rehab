import { StageStatus, type SessionState } from "@/lib/game";
import type { GameId } from "@/lib/games/registry";
import type { StoredSession, StoredStageResult } from "./types";
import { workflowFieldsForStorage } from "./workflowMetadata";

export interface BuildStoredSessionParams {
  /** Must be a genuinely finished session — `gameState === SESSION_COMPLETE` with a non-null `summary` (see lib/game/session.ts's endSession). */
  session: SessionState;
  patientId: string;
  createdByUid: string;
  gameId: Extract<GameId, "balloon-quest">;
  therapistName?: string | null;
}

/**
 * SESSION HISTORY TASK — the ONE place a live `SessionState` becomes a
 * permanent `StoredSession`. Pure and Firebase-free (easy to unit test in
 * isolation — see lib/sessions/__tests__/buildStoredSession.test.ts) so the
 * persistence layer (sessionHistoryRepository.ts) only has to worry about
 * "write this exactly once," never about what the numbers mean.
 *
 * Every metric is copied straight from the canonical `session.summary`
 * (built by lib/game/scoring.ts's buildSessionSummary) — nothing here
 * recomputes accuracy, duration, or reaction time with a different formula.
 */
export function buildStoredSession(params: BuildStoredSessionParams): StoredSession {
  const { session, patientId, createdByUid, gameId, therapistName } = params;
  const summary = session.summary;
  if (!summary) {
    throw new Error("buildStoredSession requires a completed session with a summary");
  }

  const stageResults: StoredStageResult[] = summary.stageResults.map((result) => ({
    difficulty: result.difficulty,
    stageNumber: result.stageNumber,
    status: result.status,
    correct: result.correctCount,
    incorrect: result.incorrectCount,
    accuracy: result.accuracy,
    durationMs: result.durationMs,
    averageReactionTimeMs: result.averageReactionTimeMs,
  }));

  // The last stage the session actually reached — see StoredSession.endingDifficulty's
  // doc comment. Falls back to where the session STARTED when no stage was
  // ever entered (e.g. ended during WELCOME/SETUP/START_ZONE before stage 1
  // ever began) — nothing progressed, so "ending" is just "starting."
  const lastResult = summary.stageResults[summary.stageResults.length - 1] ?? null;
  const endingDifficulty = lastResult ? lastResult.difficulty : session.config.difficulty;
  const endingStage = lastResult ? lastResult.stageNumber : session.config.startingStage;

  const completedStageCount = summary.stageResults.filter((r) => r.status === StageStatus.COMPLETED).length;
  const skippedStageCount = summary.stageResults.length - completedStageCount;

  return {
    sessionId: summary.sessionId,
    patientId,
    gameId,
    startedAt: session.createdAt,
    completedAt: session.endedAt ?? Date.parse(summary.completedAt),
    createdByUid,
    ...workflowFieldsForStorage(session.workflow, therapistName),

    startingDifficulty: session.config.difficulty,
    startingStage: session.config.startingStage,
    endingDifficulty,
    endingStage,

    completedStageCount,
    skippedStageCount,
    totalCorrect: summary.totalCorrect,
    totalIncorrect: summary.totalIncorrect,
    accuracy: summary.overallAccuracy,
    durationMs: summary.totalDurationMs,
    averageReactionTimeMs: summary.averageReactionTimeMs,
    bestStage: summary.bestStage,

    stageResults,
  };
}
