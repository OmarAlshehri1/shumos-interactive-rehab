import { get, onValue, ref, set, type Unsubscribe } from "firebase/database";
import { getStaffDb } from "@/lib/realtime/firebaseClient";
import type { StoredSession } from "./types";

/**
 * SESSION HISTORY TASK — the dedicated Firebase data layer for permanent
 * per-patient session history, at `/sessions/{patientId}/{sessionId}` (see
 * database.rules.json). Same "UI/controller never touches firebase/database
 * directly" architecture as lib/patients/patientRepository.ts and
 * lib/realtime/sessionRepository.ts.
 */

const SESSIONS_PATH = "sessions";

/**
 * RTDB drops `null` scalars and empty arrays entirely on write (same
 * behavior lib/realtime/serialization.ts documents for SessionState) — a
 * StoredStageResult with `durationMs: null` round-trips as a MISSING key,
 * not a `null` value, and a session with zero stageResults round-trips with
 * no `stageResults` key at all. This restores the exact StoredSession shape
 * callers expect.
 */
function reviveStoredSession(raw: unknown): StoredSession | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<StoredSession> & { stageResults?: unknown };
  const rawStageResults = value.stageResults;
  const stageResultsArray = Array.isArray(rawStageResults)
    ? rawStageResults
    : rawStageResults && typeof rawStageResults === "object"
      ? Object.values(rawStageResults)
      : [];

  return {
    ...(value as StoredSession),
    averageReactionTimeMs: value.averageReactionTimeMs ?? null,
    bestStage: value.bestStage ?? null,
    stageResults: stageResultsArray.map((result) => {
      const r = result as Partial<StoredSession["stageResults"][number]>;
      return {
        ...r,
        accuracy: r.accuracy ?? null,
        durationMs: r.durationMs ?? null,
        averageReactionTimeMs: r.averageReactionTimeMs ?? null,
      } as StoredSession["stageResults"][number];
    }),
  };
}

/**
 * Live-subscribes to every stored session for one patient, newest-first
 * (see the task's "SESSION HISTORY LIST... newest-first"). The clinic sees
 * ~10-15 patients/month with a handful of sessions each at this stage — the
 * whole per-patient node is small, so no pagination is needed yet.
 */
export function subscribeToPatientSessions(patientId: string, callback: (sessions: StoredSession[]) => void): Unsubscribe {
  const db = getStaffDb();
  return onValue(ref(db, `${SESSIONS_PATH}/${patientId}`), (snapshot) => {
    const value = (snapshot.val() as Record<string, unknown> | null) ?? {};
    const sessions = Object.values(value)
      .map(reviveStoredSession)
      .filter((s): s is StoredSession => s !== null)
      .sort((a, b) => b.completedAt - a.completedAt);
    callback(sessions);
  });
}

export async function getSessionHistoryRecord(patientId: string, sessionId: string): Promise<StoredSession | null> {
  const db = getStaffDb();
  const snapshot = await get(ref(db, `${SESSIONS_PATH}/${patientId}/${sessionId}`));
  return reviveStoredSession(snapshot.val());
}

export type SaveSessionHistoryResult = "saved" | "already-saved";

/**
 * SESSION HISTORY TASK — "a completed patient session must be persisted
 * EXACTLY ONCE" (task section 4). Two layers, deliberately redundant:
 *
 *  1. Client-side: a `get()` existence check before ever attempting to
 *     write — the common-case fast path that avoids a noisy failed write
 *     on every redundant call (React re-render, Firebase reconnect,
 *     celebration replay, a second "End Session" tap — see the caller,
 *     useRealtimeControllerSession.ts, which also keeps its own in-memory
 *     "already attempted this sessionId" guard on TOP of this).
 *  2. Server-side (the AUTHORITATIVE guarantee, not just an optimization):
 *     database.rules.json's `.write` rule for this exact path is
 *     `!data.exists()` — the same permanent-claim pattern
 *     patientRepository.ts's patientNumbers index uses. Even if two writers
 *     somehow both pass the existence check above (a genuine race —
 *     another controller tab taking over the lease mid-save, for
 *     instance), only the FIRST write the server actually receives can
 *     ever succeed; every other one is rejected. A record, once saved, can
 *     never be silently duplicated or overwritten — see the task's
 *     "immutable session records."
 *
 * Specifically a rules REJECTION (`error.code === "PERMISSION_DENIED"`) on
 * the `set()` call is treated as "someone else's write already won this
 * exact path" (this function is only ever called from an already-authorized
 * staff session, so a permission-denied rejection here has no other honest
 * explanation) — returned as `"already-saved"`, not thrown, so a caller
 * never has to distinguish "raced and lost" from "genuinely failed" for its
 * own retry logic. Any OTHER failure (offline, timeout, a genuinely
 * unexpected error) is rethrown, not swallowed — the caller
 * (useRealtimeControllerSession.ts) depends on that rejection to remove this
 * sessionId from its own dedup guard so a real failure gets retried instead
 * of being silently treated as "done" while nothing was actually persisted.
 */
export async function saveSessionHistoryOnce(patientId: string, record: StoredSession): Promise<SaveSessionHistoryResult> {
  const db = getStaffDb();
  const path = `${SESSIONS_PATH}/${patientId}/${record.sessionId}`;

  const existing = await get(ref(db, path));
  if (existing.exists()) return "already-saved";

  try {
    await set(ref(db, path), record);
    return "saved";
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "PERMISSION_DENIED") return "already-saved";
    throw error;
  }
}
