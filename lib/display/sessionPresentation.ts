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
