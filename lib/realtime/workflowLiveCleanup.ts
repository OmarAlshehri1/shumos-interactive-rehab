import { get, ref, runTransaction, type Database } from "firebase/database";

/** A workflow page may release its own modern session, never another Control window's session. */
export function canClearWorkflowSession(raw: unknown, tabId: string): boolean {
  if (!raw || typeof raw !== "object" || !tabId) return false;
  const record = raw as { session?: { engine?: string; gameState?: string; [key: string]: unknown } };
  const session = record.session;
  if (!session) return false;
  const stamp = session.engine ? session[session.engine] as { controlTabId?: unknown } | undefined : undefined;
  if (typeof stamp?.controlTabId === "string") return stamp.controlTabId === tabId;
  // An unfinished older record has no window identity: preserve it for recovery.
  return session.gameState === "SESSION_COMPLETE";
}

export async function clearWorkflowLiveSession(db: Database, tabId: string): Promise<void> {
  const liveRef = ref(db, "liveSession");
  // Prime the transaction with an authoritative read rather than an empty local cache.
  await get(liveRef);
  let removedSessionId: string | null = null;
  const result = await runTransaction(liveRef, raw => {
    removedSessionId = null;
    if (!canClearWorkflowSession(raw, tabId)) return undefined;
    removedSessionId = typeof raw.sessionId === "string" ? raw.sessionId : null;
    return null;
  }, { applyLocally: false });
  if (!result.committed || !removedSessionId) return;
  const privateRef = ref(db, "liveSessionPrivate");
  await get(privateRef);
  // A new session may have started while cleanup was in flight. Keep its patient binding.
  await runTransaction(privateRef, raw => raw?.sessionId === removedSessionId ? null : undefined, { applyLocally: false });
}
