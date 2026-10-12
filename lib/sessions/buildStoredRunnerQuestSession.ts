import { Difficulty, StageStatus, type StageNumber } from "@/lib/game";
import type { SessionSummary } from "@/lib/runnerquest3d/types";
import { RUNNER_QUEST_RESULT_VERSION, type StoredRunnerQuestSession, type StoredRunnerQuestStageResult } from "./types";
import { workflowFieldsForStorage, type SessionWorkflowMetadata } from "./workflowMetadata";

export interface BuildStoredRunnerQuestParams {
  summary: SessionSummary;
  sessionId: string;
  runId: number;
  /** Index (0-8) of the stage the session was planned to start at. */
  startIndex: number;
  startedAt: number;
  completedAt: number;
  patientId: string;
  createdByUid: string;
  inputSource: string;
  therapistName?: string | null;
  workflow?: SessionWorkflowMetadata;
}

const difficultyOf = (index: number): Difficulty => [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.ADVANCED][Math.floor(index / 3)];
const stageOf = (index: number): StageNumber => ((index % 3) + 1) as StageNumber;

/** Immutable history keys are per session id; a second RUN of the same session gets its own key. */
export const runnerHistoryRecordId = (sessionId: string, runId: number): string => (runId > 0 ? `${sessionId}-r${runId}` : sessionId);

/**
 * The ONE place a finished Runner Quest session becomes a permanent history record. Stored under its OWN
 * game id with its OWN versioned shape (`resultVersion`, `engine: "rq3"` on every stage row); no value is
 * copied into another game's fields and no accuracy is derived (the game has no wrong answers).
 */
export function buildStoredRunnerQuestSession(p: BuildStoredRunnerQuestParams): StoredRunnerQuestSession {
  const { summary } = p;
  const stageResults: StoredRunnerQuestStageResult[] = summary.stages.map((r) => ({
    engine: "rq3",
    difficulty: difficultyOf(r.index), stageNumber: stageOf(r.index),
    status: r.status === "completed" ? StageStatus.COMPLETED : StageStatus.SKIPPED,
    stars: r.stars, holds: r.holds, assists: r.assists, obstaclesResolved: r.obstaclesResolved, obstaclesTotal: r.obstaclesTotal, durationMs: r.activeMs,
    projection: r.projection, objectivesSkipped: r.objectivesSkipped,
  }));
  const last = summary.stages[summary.stages.length - 1] ?? null;
  const endIndex = last ? last.index : p.startIndex;
  return {
    sessionId: runnerHistoryRecordId(p.sessionId, p.runId),
    patientId: p.patientId,
    gameId: "runner-quest-3d",
    resultVersion: RUNNER_QUEST_RESULT_VERSION,
    startedAt: p.startedAt,
    completedAt: Math.max(p.completedAt, p.startedAt),
    createdByUid: p.createdByUid,
    ...workflowFieldsForStorage(p.workflow, p.therapistName),
    startingDifficulty: difficultyOf(p.startIndex), startingStage: stageOf(p.startIndex),
    endingDifficulty: difficultyOf(endIndex), endingStage: stageOf(endIndex),
    completedStageCount: summary.completedStages, skippedStageCount: summary.skippedStages,
    totalStars: summary.totalStars, totalHolds: summary.totalHolds, totalAssists: summary.totalAssists,
    totalObstaclesPresented: summary.stages.reduce((a, r) => a + r.obstaclesTotal, 0),
    totalObstaclesResolved: summary.stages.reduce((a, r) => a + r.obstaclesResolved, 0),
    inputSource: p.inputSource,
    durationMs: summary.activeMs,
    bestStage: null,
    stageResults,
  };
}
