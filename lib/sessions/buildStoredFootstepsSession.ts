import { StageStatus } from "@/lib/game";
import type { FootstepsSessionState } from "@/lib/footsteps";
import { FootstepsStageStatus } from "@/lib/footsteps";
import type { GameId } from "@/lib/games/registry";
import type { StoredFootstepsSession, StoredFootstepsStageResult } from "./types";
import { workflowFieldsForStorage } from "./workflowMetadata";

export interface BuildStoredFootstepsSessionParams {
  /** Must be a genuinely finished session — `gameState === SESSION_COMPLETE` with a non-null `summary` (see lib/footsteps/session.ts's endFootstepsSession). */
  session: FootstepsSessionState;
  patientId: string;
  createdByUid: string;
  gameId: Extract<GameId, "follow-the-footsteps">;
  therapistName?: string | null;
}

/** FootstepsStageStatus and lib/game's StageStatus are the same two string values (COMPLETED/SKIPPED) — this is the one place that fact is relied on to store history under the platform's shared StageStatus type. */
function toStageStatus(status: FootstepsStageStatus): StageStatus {
  return status === FootstepsStageStatus.COMPLETED ? StageStatus.COMPLETED : StageStatus.SKIPPED;
}

/**
 * MULTI-GAME HISTORY — the ONE place a live FootstepsSessionState becomes a
 * permanent StoredFootstepsSession, mirroring lib/sessions/buildStoredSession.ts's
 * role for Balloon Quest exactly. Every metric is copied straight from the
 * canonical `session.summary` (built by lib/footsteps/scoring.ts's
 * buildFootstepsSessionSummary) — nothing here recomputes completion rate,
 * duration, or step timing with a different formula.
 */
export function buildStoredFootstepsSession(params: BuildStoredFootstepsSessionParams): StoredFootstepsSession {
  const { session, patientId, createdByUid, gameId, therapistName } = params;
  const summary = session.summary;
  if (!summary) {
    throw new Error("buildStoredFootstepsSession requires a completed session with a summary");
  }

  const stageResults: StoredFootstepsStageResult[] = summary.stageResults.map((result) => ({
    difficulty: result.difficulty,
    stageNumber: result.stageNumber,
    status: toStageStatus(result.status),
    stepsPresented: result.stepsPresented,
    stepsCompleted: result.stepsCompleted,
    durationMs: result.durationMs,
    averageStepTimeMs: result.averageStepTimeMs,
  }));

  const lastResult = summary.stageResults[summary.stageResults.length - 1] ?? null;
  const endingDifficulty = lastResult ? lastResult.difficulty : session.config.difficulty;
  const endingStage = lastResult ? lastResult.stageNumber : session.config.startingStage;

  const completedStageCount = summary.stageResults.filter((r) => r.status === FootstepsStageStatus.COMPLETED).length;
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
    totalStepsPresented: summary.totalStepsPresented,
    totalStepsCompleted: summary.totalStepsCompleted,
    completionRate: summary.completionRate,
    durationMs: summary.totalDurationMs,
    averageStepTimeMs: summary.averageStepTimeMs,
    bestStage: summary.bestStage,

    stageResults,
  };
}
