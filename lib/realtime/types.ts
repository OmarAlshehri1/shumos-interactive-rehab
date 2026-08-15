import type { SessionState } from "@/lib/game";
import type { GameId } from "@/lib/games/registry";

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
  /**
   * MULTI-GAME PLATFORM: which registered game (lib/games/registry.ts) this
   * canonical session belongs to — /display's game resolver (see
   * components/display/gameDisplayRegistry.tsx) uses this to decide which
   * child-facing display module to mount, falling back to the Shumos
   * waiting world otherwise. `null` for a session that predates this field,
   * or whose value isn't a currently-registered game id (see
   * sessionRepository.ts's parseLiveSessionValue) — NEVER assumed to be
   * "balloon-quest" by default, so an old/malformed record fails safely to
   * the waiting world instead of guessing.
   */
  gameId: GameId | null;
  sessionId: string;
  revision: number;
  updatedAt: number | object; // object while a ServerValue.TIMESTAMP sentinel is in flight
  session: SessionState;
  lastInteraction: LiveInteraction | null;
  celebrationReplay: CelebrationReplaySignal | null;
  /**
   * SESSION HISTORY TASK — the saved patient this canonical session belongs
   * to, or `null` for a walk-in/manual session with no saved patient
   * selected. Stamped once at session creation (useRealtimeControllerSession.ts's
   * confirmSetup) and carried forward unchanged by every later publish —
   * see publish()'s doc comment. Deliberately just the opaque Firebase key,
   * never `patientNumber`/`firstName` — see the report's "Live session
   * privacy" section for why this one field is safe to carry on a record
   * /display can already read in full, while the rest of a patient's
   * identity/profile never touches `liveSession` at all. Reading this back
   * out at SESSION_COMPLETE (rather than trusting whatever the CURRENT
   * PatientSessionContext happens to hold) is what makes the session ->
   * patient association immune to the therapist changing/clearing patient
   * context mid-session, and immune to a second controller tab taking over
   * the lease without ever having that context locally.
   */
  patientId: string | null;
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
  /**
   * BUG FIX — "ابدأ" stall: reported by /display the instant ITS OWN
   * CountdownScene genuinely finishes (real Mariam-paced completion, not a
   * guess) for a specific (sessionId, revision) — see sessionRepository.ts's
   * reportCountdownComplete/waitForDisplayCountdownComplete and
   * useRealtimeControllerSession.ts's runInstructionsToPlaying, which waits
   * on this instead of blindly sleeping a fixed duration. `revision` is the
   * COUNTDOWN-state publish's own revision number — globally unique and
   * monotonic per session, so a stale signal from an earlier stage can never
   * be mistaken for the current one. Only ever set by the display tab, same
   * as `fullscreen` above; absent on older records.
   */
  countdownComplete?: { sessionId: string; revision: number } | null;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected";
