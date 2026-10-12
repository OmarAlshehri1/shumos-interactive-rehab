import { Difficulty, StageStatus, type StageNumber } from "@/lib/game";
import type { StoredSessionWorkflowFields } from "@/lib/sessions/workflowMetadata";
import { STAGES } from "./stages";
import { decodeAcceptedState, type BuildQuestLiveSession } from "./cloudState";

export interface StoredBuildQuestStageResult {
  engine: "build3"; stageId: string; difficulty: Difficulty; stageNumber: StageNumber;
  status: StageStatus; piecesPlaced: number; durationMs: null;
}
export interface StoredBuildQuestSession extends StoredSessionWorkflowFields {
  gameId: "build-quest-3d"; resultVersion: 1; sessionId: string; patientId: string; createdByUid: string;
  startedAt: number; completedAt: number; durationMs: number;
  startingDifficulty: Difficulty; startingStage: StageNumber; endingDifficulty: Difficulty; endingStage: StageNumber;
  completedStageCount: number; skippedStageCount: number; totalPiecesPlaced: number;
  bestStage: { difficulty: Difficulty; stageNumber: StageNumber } | null;
  stageResults: StoredBuildQuestStageResult[];
}
export const difficultyForBuildStage = (index: number): Difficulty => [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.ADVANCED][Math.floor(index / 3)];
export const numberForBuildStage = (index: number): StageNumber => (index % 3 + 1) as StageNumber;
export function buildStoredBuildQuestSession(r: BuildQuestLiveSession, patientId: string, startingStage: number, ownerUid: string): StoredBuildQuestSession {
  const s = decodeAcceptedState(r);
  if (!s || s.status !== "ended" || !patientId || !Number.isInteger(startingStage) || !STAGES[startingStage]) throw new Error("An accepted ended session and patient binding are required");
  const stageResults = STAGES.flatMap((stage, index): StoredBuildQuestStageResult[] => {
    const completed = s.completed.includes(stage.id), skipped = s.skipped.includes(stage.id);
    if (!completed && !skipped) return [];
    return [{ engine: "build3", stageId: stage.id, difficulty: difficultyForBuildStage(index), stageNumber: numberForBuildStage(index),
      status: completed ? StageStatus.COMPLETED : StageStatus.SKIPPED,
      piecesPlaced: new Set(s.events.filter(e => e.stageId === stage.id).map(e => e.pieceId)).size, durationMs: null }];
  });
  const best = stageResults.filter(x => x.status === StageStatus.COMPLETED).at(-1);
  const startedAt = r.build3.startedAt || r.createdAt, completedAt = r.build3.endedAt;
  return { gameId: "build-quest-3d", resultVersion: 1, sessionId: s.session, patientId, createdByUid: ownerUid,
    startedAt, completedAt, durationMs: Math.max(0, completedAt - startedAt), startingDifficulty: difficultyForBuildStage(startingStage),
    startingStage: numberForBuildStage(startingStage), endingDifficulty: difficultyForBuildStage(s.stage), endingStage: numberForBuildStage(s.stage),
    completedStageCount: s.completed.length, skippedStageCount: s.skipped.length, totalPiecesPlaced: s.events.length,
    bestStage: best ? { difficulty: best.difficulty, stageNumber: best.stageNumber } : null, stageResults };
}
/** Explicit version discriminator: old records are never guessed from their fields. */
export function reviveBuildQuestHistory(raw: unknown): StoredBuildQuestSession | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as StoredBuildQuestSession;
  if (r.gameId !== "build-quest-3d" || r.resultVersion !== 1 || !r.patientId || !r.sessionId || !r.createdByUid ||
      ![r.startedAt, r.completedAt, r.durationMs, r.totalPiecesPlaced, r.completedStageCount, r.skippedStageCount].every(x => Number.isFinite(x) && x >= 0) ||
      r.completedAt < r.startedAt || r.totalPiecesPlaced > 1000 || r.completedStageCount > 9 || r.skippedStageCount > 9 ||
      ![r.startingDifficulty, r.endingDifficulty].every(x => Object.values(Difficulty).includes(x)) ||
      ![r.startingStage, r.endingStage].every(x => [1,2,3].includes(x))) return null;
  const rows: StoredBuildQuestStageResult[] = Array.isArray(r.stageResults) ? r.stageResults : Object.values(r.stageResults ?? {});
  if (rows.length > 9 || rows.some(x => x.engine !== "build3" || !STAGES.some(s => s.id === x.stageId) || !Number.isInteger(x.piecesPlaced) || x.piecesPlaced < 0 || x.piecesPlaced > 10)) return null;
  return { ...r, bestStage: r.bestStage ?? null, stageResults: rows.map(x => ({ ...x, durationMs: null })) };
}
