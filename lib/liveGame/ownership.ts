/**
 * Platform-level Control ownership for games that publish into the shared `/liveSession` record.
 *
 * The controller LEASE (`controllerLease`) says which staff account may drive the clinic's Control.
 * This module adds the per-WINDOW layer on top, used by every cross-device game that is not one of the
 * original six: which browser window published the session, whether that window is still alive, how a
 * reloaded window recognises its own earlier session, and how a second window takes a session over.
 *
 * Pure functions plus one sessionStorage helper. No Firebase, no React, no game knowledge.
 */

/** A Control that has not written for this long is considered gone. */
export const OWNER_STALE_MS = 15_000;
/** Control rewrites its record at least this often while a session exists (liveness for reloaded/second windows). */
export const HEARTBEAT_MS = 4_000;
/** Older records are never recovered. */
export const RECOVERY_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const TAB_ID_KEY = "shumos.liveGame.controlTabId";

/**
 * Identifies this browser tab across reloads. sessionStorage survives a reload but is not shared with a
 * new tab, so "same id" means "the window that published the session is the one that is reloading".
 */
export function controlTabId(): string {
  try {
    const existing = window.sessionStorage.getItem(TAB_ID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    window.sessionStorage.setItem(TAB_ID_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** The ownership facts every game stamps into its `liveSession.session` block. */
export interface LiveControlMeta {
  /** Staff uid of the publishing Control. */
  ownerId: string;
  controlTabId?: string;
  /** Wall clock of the Control's last write. */
  heartbeatAt?: number;
  /** Set by a window that adopted this session from another window: names the window that must stand down. */
  takeoverFrom?: string;
}

export type RecoveryDecision<S> =
  | { kind: "none" }
  | { kind: "recover"; snapshot: S; why: "same-window" | "owner-gone" | "takeover"; /** The window that published the adopted session, when a different one. */ fromTabId: string | null }
  /** `takeoverAllowed` is false when the other window's session belongs to a different patient than the one selected here. */
  | { kind: "blocked"; why: "other-window-active"; takeoverAllowed: boolean };

export interface RecoveryInput<S extends { sessionId: string }> {
  recordSessionId: string;
  recordPatientId: string | null;
  meta: LiveControlMeta;
  /** The game's own validated snapshot of the stored session, or null when absent/invalid. */
  snapshot: S | null;
  uid: string;
  patientId: string | null;
  tabId: string;
  /** Wall clock, ms. */
  now: number;
  /** The therapist explicitly chose to take over a window that still looks alive. */
  force?: boolean;
}

/**
 * Decides whether a freshly loaded Control adopts the stored session.
 *  - only the same account's own session is ever adopted, and only for the same patient (walk-in matches walk-in);
 *  - the game's snapshot must validate and match the record's session id, and be younger than 12 h;
 *  - same window => recover at once; another window that is still writing => blocked unless forced;
 *    another window that stopped writing => recovered.
 */
export function decideRecovery<S extends { sessionId: string }>(i: RecoveryInput<S>): RecoveryDecision<S> {
  const { meta, snapshot } = i;
  if (meta.ownerId !== i.uid) return { kind: "none" };
  if (!snapshot || snapshot.sessionId !== i.recordSessionId) return { kind: "none" };
  const beat = typeof meta.heartbeatAt === "number" ? meta.heartbeatAt : 0;
  if (!(i.now - beat < RECOVERY_MAX_AGE_MS)) return { kind: "none" };
  const samePatient = (i.recordPatientId ?? null) === (i.patientId ?? null);
  if (meta.controlTabId === i.tabId) return samePatient ? { kind: "recover", snapshot, why: "same-window", fromTabId: null } : { kind: "none" };
  const fromTabId = meta.controlTabId ?? null;
  if (i.now - beat >= OWNER_STALE_MS) return samePatient ? { kind: "recover", snapshot, why: "owner-gone", fromTabId } : { kind: "none" };
  // Another window of the same account is still writing: a fresh session must never silently overwrite it, whatever patient is selected here.
  if (i.force && samePatient) return { kind: "recover", snapshot, why: "takeover", fromTabId };
  return { kind: "blocked", why: "other-window-active", takeoverAllowed: samePatient };
}

/** True when a stored record names THIS window as the one that was taken over (never merely a different window id). */
export function isTakenOver(meta: Pick<LiveControlMeta, "takeoverFrom"> | null | undefined, tabId: string): boolean {
  return !!meta && typeof meta.takeoverFrom === "string" && meta.takeoverFrom === tabId;
}

/** Does the Display still hear a Control? Compares only local receipt times, so device clock skew is irrelevant. */
export class ControlFreshness {
  private lastBeat: number | null = null;
  private seenAt = -Infinity;
  constructor(private readonly staleMs = OWNER_STALE_MS) {}
  /** Feed every record the Display receives; `heartbeatAt` changes with every Control write. */
  observe(heartbeatAt: number | undefined, nowMs: number): void {
    if (heartbeatAt !== this.lastBeat) {
      this.lastBeat = heartbeatAt ?? null;
      this.seenAt = nowMs;
    }
  }
  alive(nowMs: number): boolean {
    return nowMs - this.seenAt < this.staleMs;
  }
}
