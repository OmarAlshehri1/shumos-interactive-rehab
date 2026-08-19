import { ColorChaseStageStatus, type ColorChaseSessionState } from "@/lib/colorchase";
import type { GameId } from "@/lib/games/registry";
import { StageStatus } from "@/lib/game";
import type { StoredColorChaseSession } from "./types";
import { workflowFieldsForStorage } from "./workflowMetadata";

export function buildStoredColorChaseSession(params: {
  session: ColorChaseSessionState;
  patientId: string;
  createdByUid: string;
  gameId: Extract<GameId, "color-chase">;
  therapistName?: string | null;
}): StoredColorChaseSession {
  const { session, patientId, createdByUid, gameId, therapistName } = params;
  if (!session.summary) throw new Error("buildStoredColorChaseSession requires a completed session");
  const summary = session.summary;
  const last = summary.stageResults.at(-1);
  return {
    sessionId: summary.sessionId, patientId, gameId, startedAt: session.createdAt,
    completedAt: session.endedAt ?? Date.parse(summary.completedAt), createdByUid,
    ...workflowFieldsForStorage(session.workflow, therapistName),
    startingDifficulty: summary.startingDifficulty, startingStage: session.config.startingStage,
    endingDifficulty: last?.difficulty ?? summary.startingDifficulty,
    endingStage: last?.stageNumber ?? session.config.startingStage,
    completedStageCount: summary.stageResults.filter((r) => r.status === ColorChaseStageStatus.COMPLETED).length,
    skippedStageCount: summary.stageResults.filter((r) => r.status === ColorChaseStageStatus.SKIPPED).length,
    totalTargetsPresented: summary.totalTargetsPresented, totalCorrect: summary.totalCorrect,
    totalIncorrect: summary.totalIncorrect, totalDangerPresses: summary.totalDangerPresses,
    accuracy: summary.accuracy, durationMs: summary.totalDurationMs,
    averageResponseTimeMs: summary.averageResponseTimeMs, bestStage: summary.bestStage,
    stageResults: summary.stageResults.map((r) => ({
      ...r,
      status: r.status === ColorChaseStageStatus.COMPLETED ? StageStatus.COMPLETED : StageStatus.SKIPPED,
    })),
  };
}
