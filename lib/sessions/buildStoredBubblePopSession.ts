import { StageStatus } from "@/lib/game";
import type { BubblePopSessionState } from "@/lib/bubblepop";
import { BubblePopStageStatus } from "@/lib/bubblepop";
import type { GameId } from "@/lib/games/registry";
import type { StoredBubblePopSession, StoredBubblePopStageResult } from "./types";
import { workflowFieldsForStorage } from "./workflowMetadata";

export interface BuildStoredBubblePopSessionParams {
  /** Must be a genuinely finished session — `gameState === SESSION_COMPLETE` with a non-null `summary`. */
  session: BubblePopSessionState;
  patientId: string;
  createdByUid: string;
  gameId: Extract<GameId, "bubble-pop-wall">;
  therapistName?: string | null;
}

/** BubblePopStageStatus and lib/game's StageStatus are the same two string values (COMPLETED/SKIPPED) — this is the one place that fact is relied on to store history under the platform's shared StageStatus type. */
function toStageStatus(status: BubblePopStageStatus): StageStatus {
  return status === BubblePopStageStatus.COMPLETED ? StageStatus.COMPLETED : StageStatus.SKIPPED;
}

/**
 * MULTI-GAME HISTORY — the ONE place a live BubblePopSessionState becomes a
 * permanent StoredBubblePopSession, mirroring the other two games' build
 * functions exactly. Every metric is copied straight from the canonical
 * `session.summary` — nothing here recomputes completion rate, accuracy,
 * duration, or response timing with a different formula.
 */
export function buildStoredBubblePopSession(params: BuildStoredBubblePopSessionParams): StoredBubblePopSession {
  const { session, patientId, createdByUid, gameId, therapistName } = params;
  const summary = session.summary;
  if (!summary) {
    throw new Error("buildStoredBubblePopSession requires a completed session with a summary");
  }

  const stageResults: StoredBubblePopStageResult[] = summary.stageResults.map((result) => ({
    difficulty: result.difficulty,
    stageNumber: result.stageNumber,
    status: toStageStatus(result.status),
    targetsPresented: result.targetsPresented,
    targetsCompleted: result.targetsCompleted,
    incorrectCount: result.incorrectCount,
    durationMs: result.durationMs,
    averageResponseTimeMs: result.averageResponseTimeMs,
  }));

  const lastResult = summary.stageResults[summary.stageResults.length - 1] ?? null;
  const endingDifficulty = lastResult ? lastResult.difficulty : session.config.difficulty;
  const endingStage = lastResult ? lastResult.stageNumber : session.config.startingStage;

  const completedStageCount = summary.stageResults.filter((r) => r.status === BubblePopStageStatus.COMPLETED).length;
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
    totalTargetsPresented: summary.totalTargetsPresented,
    totalTargetsCompleted: summary.totalTargetsCompleted,
    totalIncorrect: summary.totalIncorrect,
    completionRate: summary.completionRate,
    accuracy: summary.accuracy,
    durationMs: summary.totalDurationMs,
    averageResponseTimeMs: summary.averageResponseTimeMs,
    bestStage: summary.bestStage,

    stageResults,
  };
}
