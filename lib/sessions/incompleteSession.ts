import { GameState } from "@/lib/game";
import type { LiveSessionRecord } from "@/lib/realtime/types";

export function incompleteSessionForPatient(record: LiveSessionRecord | null, patientId: string): LiveSessionRecord | null {
  if (!record || record.patientId !== patientId || record.session.gameState === GameState.SESSION_COMPLETE) return null;
  return record;
}
