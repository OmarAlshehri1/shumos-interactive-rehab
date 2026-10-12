import { isSessionState, type ExperimentalSessionState, type SessionSummary } from "./sessionContract";

export const EXPERIMENTAL_ROOM_KEY = "shumos.experimental.space-pilot-3d.room.v4";
export const EXPERIMENTAL_CHECKPOINT_KEY = "shumos.experimental.space-pilot-3d.checkpoint.v4";
export function recoveredSummary(raw: string | null): SessionSummary | null {
  try {
    const state: unknown = raw ? JSON.parse(raw) : null;
    if (!isSessionState(state) || state.lifecycle === "ready") return null;
    return { ...(state.curriculumId?{curriculumId:state.curriculumId,stageResults:state.stageResults,startingStageIndex:state.startingStageIndex,stageRepeats:state.stageRepeats}:{}), ...state.stats, sessionId: state.sessionId, runId: state.runId, elapsedSeconds: state.elapsedSeconds, reason: state.lifecycle === "ended" ? "therapist-ended" : state.lifecycle === "completed" ? "completed" : "control-reloaded" };
  } catch { return null; }
}
export function saveCheckpoint(storage: Pick<Storage, "setItem">, state: ExperimentalSessionState): boolean {
  try { storage.setItem(EXPERIMENTAL_CHECKPOINT_KEY, JSON.stringify(state)); return true; } catch { return false; }
}
