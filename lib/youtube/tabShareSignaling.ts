import { get, onValue, ref, runTransaction, type Database } from "firebase/database";
import { TAB_SHARE_PATH, SHARE_TTL_MS, parseShare, type TabShare } from "./tabShareModel";

export async function serverOffset(db: Database): Promise<number> {
  return new Promise((resolve, reject) => onValue(ref(db, ".info/serverTimeOffset"), s => {
    const value = s.val(); if (typeof value === "number" && Number.isFinite(value)) resolve(value); else reject(Error("clock-unavailable"));
  }, reject, { onlyOnce: true }));
}
export function subscribeShare(db: Database, value: (share: TabShare | null) => void, error: () => void) {
  return onValue(ref(db, TAB_SHARE_PATH), s => value(parseShare(s.val())), error);
}
export async function removeShare(db: Database, sessionId: string): Promise<void> {
  const target = ref(db, TAB_SHARE_PATH);
  const retain = onValue(target, () => {}, () => {});
  try {
    await get(target);
    await runTransaction(target, raw => raw?.sessionId === sessionId ? null : undefined, { applyLocally: false });
  } finally { retain(); }
}
export async function renewShare(db: Database, sessionId: string, expiresAt: number, hidden?: boolean): Promise<void> {
  const result = await runTransaction(ref(db, TAB_SHARE_PATH), raw => raw?.sessionId === sessionId
    ? { ...raw, expiresAt, ...(hidden === undefined ? {} : { hidden }) } : undefined, { applyLocally: false });
  if (!result.committed) throw Error("sharing-session-changed");
}
export function shareExpiry(now: number): number { return now + SHARE_TTL_MS; }
