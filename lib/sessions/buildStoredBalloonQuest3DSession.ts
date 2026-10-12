import { Difficulty, StageStatus, type StageNumber } from "@/lib/game";
import type { SessionSummary } from "@/lib/balloonquest/types";
import type { StoredSession, StoredStageResult } from "./types";
import { workflowFieldsForStorage, type SessionWorkflowMetadata } from "./workflowMetadata";

export interface BuildStoredBalloonQuest3DParams {
  summary: SessionSummary;
  /** Index (0-8) of the stage the session was planned to start at. */
  startIndex: number;
  /** Wall-clock epoch the session was created. */
  startedAt: number;
  completedAt: number;
  patientId: string;
  createdByUid: string;
  therapistName?: string | null;
  workflow?: SessionWorkflowMetadata;
}

const legacyDifficulty = (index: number): Difficulty => [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.ADVANCED][Math.floor(index / 3)];
const stageOfIndex = (index: number): StageNumber => ((index % 3) + 1) as StageNumber;

/**
 * The ONE place a finished Balloon Quest 3D session becomes a permanent history
 * record. It is stored under the existing `balloon-quest` game id and the
 * existing field set (so the unchanged security rules accept it), with every
 * stage result tagged `engine: "bq3"`:
 *  - `incorrect` holds wrong-colour touches, which in this game are
 *    informational and never penalised, so `accuracy` and reaction time are
 *    deliberately stored as unavailable (null), not as a derived percentage;
 *  - stage numbers are 1-3 of a three-stage level.
 */
/**
 * History records are immutable and keyed by session id, while a therapist can start another RUN of the
 * same session (same session id, run id 2, 3, ...). Later runs get their own key so each is stored once.
 */
export const historyRecordId = (summary: Pick<SessionSummary, "sessionId" | "runId">): string => (summary.runId > 1 ? `${summary.sessionId}-r${summary.runId}` : summary.sessionId);

export function buildStoredBalloonQuest3DSession(p: BuildStoredBalloonQuest3DParams): StoredSession {
  const { summary } = p;
  const stageResults: StoredStageResult[] = summary.stages.map((r) => ({
    engine: "bq3",
    difficulty: legacyDifficulty(r.index),
    stageNumber: stageOfIndex(r.index),
    status: r.status === "completed" ? StageStatus.COMPLETED : StageStatus.SKIPPED,
    correct: r.correct,
    incorrect: r.wrongContacts,
    accuracy: null,
    durationMs: r.activeMs,
    averageReactionTimeMs: null,
  }));
  const last = summary.stages[summary.stages.length - 1] ?? null;
  const endIndex = last ? last.index : p.startIndex;
  return {
    sessionId: historyRecordId(summary),
    patientId: p.patientId,
    gameId: "balloon-quest",
    startedAt: p.startedAt,
    completedAt: Math.max(p.completedAt, p.startedAt),
    createdByUid: p.createdByUid,
    ...workflowFieldsForStorage(p.workflow, p.therapistName),
    startingDifficulty: legacyDifficulty(p.startIndex),
    startingStage: stageOfIndex(p.startIndex),
    endingDifficulty: legacyDifficulty(endIndex),
    endingStage: stageOfIndex(endIndex),
    completedStageCount: summary.completedStages,
    skippedStageCount: summary.skippedStages,
    totalCorrect: summary.totalCorrect,
    totalIncorrect: summary.totalWrongContacts,
    accuracy: null,
    durationMs: summary.activeMs,
    averageReactionTimeMs: null,
    bestStage: null,
    stageResults,
  };
}
