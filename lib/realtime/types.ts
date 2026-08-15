import type { SessionState } from "@/lib/game";

/**
 * Firebase Realtime Database schema (see report for the full rationale).
 * We support exactly ONE active clinic demo session at a time — no
 * multi-room infrastructure, no session history. All of this is plain JSON
 * (lib/game's SessionState already is: no Dates/Maps/functions), so it maps
 * directly onto RTDB without a serialization layer.
 *
 *   /liveSession        -- the one canonical session, or absent entirely
 *   /controllerLease     -- which controller device is currently authoritative
 *   /presence/controller -- is a /control tab currently connected
 *   /presence/display    -- is a /display tab currently connected
 */

export type InteractionType = "CORRECT" | "INCORRECT";

/**
 * A short-lived signal for a transient visual/audio effect that ISN'T
 * already derivable by diffing `session` (see report: correct-pop and
 * restart are diffable from `balloon.isPopped`; an incorrect tap on an
 * already-not-popped balloon is not, since only the aggregate
 * `incorrectCount` changes). Each interaction gets a unique `id` so a
 * display that reconnects — or simply re-renders — can tell "already
 * played this" from "brand new" and never replay a stale effect.
 */
export interface LiveInteraction {
  id: string;
  type: InteractionType;
  balloonId: string;
  revision: number;
  timestamp: number;
}

/**
 * TASK 9 — "إعادة الاحتفال": a presentation-only signal, deliberately NOT
 * part of `session`/GameState. Publishing a new token replays the
 * SESSION_COMPLETE celebration on /display (voice line + celebration audio
 * + entrance animation) without touching score, summary, or the state
 * machine — see lib/control/useRealtimeControllerSession.ts's
 * replayCelebration() and lib/realtime/displayGuard.ts for how a new token
 * is told apart from a stale echo.
 */
export interface CelebrationReplaySignal {
  token: string;
  timestamp: number;
}

export interface LiveSessionRecord {
  sessionId: string;
  revision: number;
  updatedAt: number | object; // object while a ServerValue.TIMESTAMP sentinel is in flight
  session: SessionState;
  lastInteraction: LiveInteraction | null;
  celebrationReplay: CelebrationReplaySignal | null;
}

export interface ControllerLeaseRecord {
  ownerId: string;
  claimedAt: number;
  updatedAt: number | object;
}

export interface PresenceRecord {
  connected: boolean;
  updatedAt: number | object;
  /** TASK 9 PART 4: whether /display currently believes it's in browser fullscreen — best-effort, only ever set by the display tab itself. Absent on older/pre-Task-9 records, and always absent for /control's own presence record (only /display reports this). */
  fullscreen?: boolean;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected";
