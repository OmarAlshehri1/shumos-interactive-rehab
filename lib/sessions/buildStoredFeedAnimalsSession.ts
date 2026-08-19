import { StageStatus } from "@/lib/game";
import type { FeedAnimalsSessionState } from "@/lib/feedanimals";
import { FeedAnimalsStageStatus } from "@/lib/feedanimals";
import type { GameId } from "@/lib/games/registry";
import type { StoredFeedAnimalsSession, StoredFeedAnimalsStageResult } from "./types";
import { workflowFieldsForStorage } from "./workflowMetadata";

export interface BuildStoredFeedAnimalsSessionParams {
  /** Must be a genuinely finished session — `gameState === SESSION_COMPLETE` with a non-null `summary`. */
  session: FeedAnimalsSessionState;
  patientId: string;
  createdByUid: string;
  gameId: Extract<GameId, "feed-the-animals">;
  therapistName?: string | null;
}

/** FeedAnimalsStageStatus and lib/game's StageStatus are the same two string values (COMPLETED/SKIPPED) — this is the one place that fact is relied on to store history under the platform's shared StageStatus type. */
function toStageStatus(status: FeedAnimalsStageStatus): StageStatus {
  return status === FeedAnimalsStageStatus.COMPLETED ? StageStatus.COMPLETED : StageStatus.SKIPPED;
}

/**
 * MULTI-GAME HISTORY — the ONE place a live FeedAnimalsSessionState becomes
 * a permanent StoredFeedAnimalsSession, mirroring the other three games'
 * build functions exactly. Every metric is copied straight from the
 * canonical `session.summary` — nothing here recomputes completion rate,
 * accuracy, duration, or response timing with a different formula.
 */
export function buildStoredFeedAnimalsSession(params: BuildStoredFeedAnimalsSessionParams): StoredFeedAnimalsSession {
  const { session, patientId, createdByUid, gameId, therapistName } = params;
  const summary = session.summary;
  if (!summary) {
    throw new Error("buildStoredFeedAnimalsSession requires a completed session with a summary");
  }

  const stageResults: StoredFeedAnimalsStageResult[] = summary.stageResults.map((result) => ({
    difficulty: result.difficulty,
    stageNumber: result.stageNumber,
    status: toStageStatus(result.status),
    roundsPresented: result.roundsPresented,
    roundsCompleted: result.roundsCompleted,
    incorrectCount: result.incorrectCount,
    durationMs: result.durationMs,
    averageResponseTimeMs: result.averageResponseTimeMs,
  }));

  const lastResult = summary.stageResults[summary.stageResults.length - 1] ?? null;
  const endingDifficulty = lastResult ? lastResult.difficulty : session.config.difficulty;
  const endingStage = lastResult ? lastResult.stageNumber : session.config.startingStage;

  const completedStageCount = summary.stageResults.filter((r) => r.status === FeedAnimalsStageStatus.COMPLETED).length;
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
    totalRoundsPresented: summary.totalRoundsPresented,
    totalRoundsCompleted: summary.totalRoundsCompleted,
    totalIncorrect: summary.totalIncorrect,
    completionRate: summary.completionRate,
    accuracy: summary.accuracy,
    durationMs: summary.totalDurationMs,
    averageResponseTimeMs: summary.averageResponseTimeMs,
    bestStage: summary.bestStage,

    stageResults,
  };
}
