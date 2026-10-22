import type { LiveSessionRecord } from "@/lib/realtime/types";
import { isUnstartedActivity } from "@/lib/therapyVisits/gameSafety";
import { OWNER_STALE_MS } from "@/lib/liveGame/ownership";

/** Only setup/finished presentation can expire. Unfinished progress is never hidden or discarded. */
export function previewExpiresAt(record: LiveSessionRecord | null): number | null {
  if (!record || (!isUnstartedActivity(record) && record.session.gameState !== "SESSION_COMPLETE")) return null;
  // updatedAt is server-authored. Ownership repair changes controllerUid/revision,
  // never this timestamp, and therefore cannot revive an abandoned preview.
  return typeof record.updatedAt === "number" ? record.updatedAt + OWNER_STALE_MS : null;
}

export function displaySession(record: LiveSessionRecord | null, serverNow: number): LiveSessionRecord | null {
  const expiry = previewExpiresAt(record);
  return expiry !== null && expiry <= serverNow ? null : record;
}

/** Rendering gate only: keep setup and between-stage preparation off the child renderer.
 * Never clear/rewrite the stored session; unfinished progress remains recoverable. */
export function displayMayRenderGame(session: LiveSessionRecord["session"], gameId: LiveSessionRecord["gameId"]) {
  if ("engine" in session && session.gameState === "START_ZONE") return false;
  return !isUnstartedActivity({ session, gameId } as LiveSessionRecord);
}

/** In-progress record whose Control stopped writing: an interrupted session, not live play. */
export function isInterruptedProgress(record: LiveSessionRecord | null, serverNow: number): boolean {
  if (!record || typeof record.updatedAt !== "number") return false;
  if (isUnstartedActivity(record) || record.session.gameState === "SESSION_COMPLETE") return false;
  return serverNow - record.updatedAt >= OWNER_STALE_MS;
}

/**
 * Display-only presentation hold. A Display that loads onto an interrupted session stays on the Shumos idle screen
 * until Control writes that session again (the therapist explicitly returned to it). Nothing is cleared or rewritten,
 * and a session first seen live is never held, so a mid-game reconnect cannot hide gameplay.
 */
export class InterruptedSessionHold {
  private sessionId: string | null = null;
  private updatedAt: unknown = null;
  private released = true;
  /** True when this record must not be rendered yet. */
  holds(record: LiveSessionRecord | null, serverNow: number): boolean {
    if (!record) { this.sessionId = null; return false; }
    if (this.sessionId !== record.sessionId) {
      this.sessionId = record.sessionId;
      this.updatedAt = record.updatedAt;
      this.released = !isInterruptedProgress(record, serverNow);
    } else if (!this.released && record.updatedAt !== this.updatedAt) this.released = true;
    return !this.released;
  }
  reset(): void { this.sessionId = null; this.released = true; }
}
