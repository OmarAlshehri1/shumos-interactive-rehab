import { getAuth } from "firebase/auth";
import { type Database, get, ref, runTransaction } from "firebase/database";
import { fetchLiveSession } from "./sessionRepository";
import { getSessionHistoryRecord } from "@/lib/sessions/sessionHistoryRepository";
import { confirmedLiveResult, historyKeyForLive } from "@/lib/therapyVisits/gameSafety";
import type { LiveSessionRecord } from "./types";

/** A recovery shortcut must never turn a foreign session into a fresh game. */
export function canResumeSession(db: Database, record: LiveSessionRecord): boolean {
  const uid = getAuth(db.app).currentUser?.uid;
  const session = record.session as unknown as Record<string, unknown>;
  const meta = typeof session.engine === "string" ? session[session.engine] as { ownerId?: unknown } | undefined : undefined;
  const canonical = (record as LiveSessionRecord & { controllerUid?: unknown }).controllerUid;
  return !!uid && (canonical === uid || (canonical == null && meta?.ownerId === uid));
}

/** Explicit therapist action only. Remove the completed presentation, never history or private bindings. */
export async function dismissCompletedSession(db: Database, sessionId: string, revision: number): Promise<boolean> {
  const uid = getAuth(db.app).currentUser?.uid;
  const record = await fetchLiveSession(db);
  if (!uid || !record || record.sessionId !== sessionId || record.revision !== revision || record.session.gameState !== "SESSION_COMPLETE") return false;
  if (record.patientId) {
    const key = historyKeyForLive(record);
    if (!key || !confirmedLiveResult(record, await getSessionHistoryRecord(record.patientId, key))) return false;
  }
  const liveRef = ref(db, "liveSession");
  await get(liveRef);
  const result = await runTransaction(liveRef, raw => {
    if (getAuth(db.app).currentUser?.uid !== uid) return;
    if (raw === null) return null; // Compare/retry at the server when the local cache is initially empty.
    if (raw?.controllerUid !== uid || raw.sessionId !== sessionId || raw.revision !== revision || raw.session?.gameState !== "SESSION_COMPLETE") return;
    return null;
  }, { applyLocally: false });
  return result.committed;
}
