import type { PresenceRecord } from "@/lib/realtime/types";
export const AUDIO_ACK_TIMEOUT_MS = 8000;
export interface AudioRequest { id: string; at: number; failed?: boolean }
export function audioRequestState(presence: PresenceRecord | null | undefined, request: AudioRequest | null, connected: boolean, now: number) {
  const fresh = connected && presence?.connected && typeof presence.updatedAt === "number" && now - presence.updatedAt < 45000 && now >= presence.updatedAt - 5000;
  const status = presence?.audioStatus;
  const matching = !request || status?.commandId === request.id;
  if (fresh && matching && status?.state === "ready" && status.contextState === "running" && typeof status.updatedAt === "number" && now - status.updatedAt < 45000) return "ready";
  if (request?.failed) return "failed";
  if (request && fresh && matching && status?.state === "blocked") return "blocked";
  if (request) return now - request.at >= AUDIO_ACK_TIMEOUT_MS ? "failed" : "pending";
  return "not-ready";
}
