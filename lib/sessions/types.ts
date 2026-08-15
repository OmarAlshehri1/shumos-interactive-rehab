import type { Difficulty, StageNumber, StageStatus } from "@/lib/game";
import type { GameId } from "@/lib/games/registry";

/**
 * SESSION HISTORY TASK — the permanent, per-patient record of one completed
 * Balloon Quest (or future game) session. Deliberately a TRIMMED-DOWN
 * reflection of the canonical `SessionSummary`/`StageResult` (see
 * lib/game/types.ts) — every number here is copied from those, never
 * recomputed with a new formula (see the task's "DO NOT independently
 * invent new scoring formulas"). Lives at `/sessions/{patientId}/{sessionId}`
 * — see database.rules.json — deliberately separate from the live,
 * transient `/liveSession` (lib/realtime/types.ts).
 *
 * Deliberately does NOT carry the patient's firstName/patientNumber — that
 * identity already lives at `/patients/{patientId}` (see the task's "DO NOT
 * STORE DUPLICATED CHILD IDENTITY").
 */
export interface StoredStageResult {
  difficulty: Difficulty;
  stageNumber: StageNumber;
  status: StageStatus;
  correct: number;
  incorrect: number;
  accuracy: number | null;
  durationMs: number | null;
  averageReactionTimeMs: number | null;
}

export interface StoredSession {
  sessionId: string;
  patientId: string;
  gameId: GameId;
  startedAt: number;
  completedAt: number;
  createdByUid: string;

  startingDifficulty: Difficulty;
  startingStage: StageNumber;
  /** The difficulty/stage of the LAST stage the session actually reached (from the last entry of `stageResults`) — see lib/sessions/buildStoredSession.ts. Falls back to startingDifficulty/startingStage when no stage was ever entered. */
  endingDifficulty: Difficulty;
  endingStage: StageNumber;

  completedStageCount: number;
  skippedStageCount: number;
  totalCorrect: number;
  totalIncorrect: number;
  /** Session-wide accuracy — same formula as StoredStageResult.accuracy, applied to totals (see lib/game/scoring.ts's calculateAccuracy). */
  accuracy: number;
  durationMs: number;
  averageReactionTimeMs: number | null;
  bestStage: { difficulty: Difficulty; stageNumber: StageNumber } | null;

  stageResults: StoredStageResult[];
}
