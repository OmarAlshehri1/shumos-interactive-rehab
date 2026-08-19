import type { SpacePilotSessionState } from "@/lib/spacepilot";
import type { GameId } from "@/lib/games/registry";
import type { StoredSpacePilotSession } from "./types";
import { workflowFieldsForStorage } from "./workflowMetadata";

export interface BuildStoredSpacePilotSessionParams {
  /** Must be a genuinely finished session — `gameState === SESSION_COMPLETE` with a non-null `summary`. */
  session: SpacePilotSessionState;
  patientId: string;
  createdByUid: string;
  gameId: Extract<GameId, "space-pilot">;
  therapistName?: string | null;
}

/**
 * MULTI-GAME HISTORY — the ONE place a live SpacePilotSessionState becomes a
 * permanent StoredSpacePilotSession, mirroring the other four games' build
 * functions exactly. Every metric is copied straight from the canonical
 * `session.summary` — nothing here recomputes collectionRate with a
 * different formula. startingDifficulty/endingDifficulty are always the
 * SAME value (session.currentDifficulty) — this game never changes
 * difficulty mid-session, it's fixed at setup — and startingStage/
 * endingStage are always 1 (each difficulty is exactly one stage, see
 * lib/spacepilot/session.ts's doc comment). completedStageCount is 1 only
 * when the stage was genuinely completed (every star/asteroid/alien
 * resolved, `currentStage.completedAt` set), never when the therapist
 * ended the session early mid-flight.
 */
export function buildStoredSpacePilotSession(params: BuildStoredSpacePilotSessionParams): StoredSpacePilotSession {
  const { session, patientId, createdByUid, gameId, therapistName } = params;
  const summary = session.summary;
  if (!summary) {
    throw new Error("buildStoredSpacePilotSession requires a completed session with a summary");
  }

  const wasCompleted = session.currentStage.completedAt !== null;

  return {
    sessionId: summary.sessionId,
    patientId,
    gameId,
    startedAt: session.createdAt,
    completedAt: session.endedAt ?? Date.parse(summary.completedAt),
    createdByUid,
    ...workflowFieldsForStorage(session.workflow, therapistName),

    startingDifficulty: summary.difficulty,
    startingStage: 1,
    endingDifficulty: summary.difficulty,
    endingStage: 1,

    completedStageCount: wasCompleted ? 1 : 0,
    skippedStageCount: wasCompleted ? 0 : 1,
    totalStarsPresented: summary.starsPresented,
    totalStarsCollected: summary.starsCollected,
    collectionRate: summary.collectionRate,
    finalUpgradeLevel: summary.finalUpgradeLevel,
    asteroidsCleared: summary.asteroidsCleared,
    asteroidsAvoided: summary.asteroidsAvoided,
    durationMs: summary.totalDurationMs,
    bestStage: null,
  };
}
