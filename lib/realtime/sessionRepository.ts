import {
  get,
  onDisconnect,
  onValue,
  ref,
  remove,
  serverTimestamp,
  update,
  type Unsubscribe,
} from "firebase/database";
import type { SessionState } from "@/lib/game";
import { getRealtimeDb } from "./firebaseClient";
import { reviveSessionState } from "./serialization";
import type {
  CelebrationReplaySignal,
  ConnectionStatus,
  ControllerLeaseRecord,
  LiveInteraction,
  LiveSessionRecord,
  PresenceRecord,
} from "./types";

/**
 * The ONLY file (besides firebaseClient.ts) that imports firebase/database.
 * Everything above this layer (the controller/display adapters) speaks in
 * plain domain terms — publish a session, subscribe to the live session,
 * claim a lease — and has no idea Firebase exists underneath. Swapping the
 * realtime backend later means rewriting this one file, not the adapters or
 * any UI component. See the Task 6 report's "Realtime repository
 * architecture" section.
 */

const LIVE_SESSION_PATH = "liveSession";
const CONTROLLER_LEASE_PATH = "controllerLease";
const CONTROLLER_PRESENCE_PATH = "presence/controller";
const DISPLAY_PRESENCE_PATH = "presence/display";

// ---------------------------------------------------------------------------
// Live session
// ---------------------------------------------------------------------------

export interface PublishSessionInput {
  sessionId: string;
  revision: number;
  session: SessionState;
  lastInteraction: LiveInteraction | null;
  /** TASK 9: omit to leave whatever's already there untouched (the common case — every ordinary action); pass explicitly only from replayCelebration(). */
  celebrationReplay?: CelebrationReplaySignal | null;
}

/**
 * Publishes the new canonical session in one atomic multi-location update —
 * sessionId/revision/session/lastInteraction always change together, so no
 * subscriber can ever observe a torn write (e.g. new session with stale
 * revision, or vice versa). celebrationReplay rides along in the same
 * update purely so it shares this call's revision bump (see
 * database.rules.json — any write under liveSession must increase
 * `revision`, and celebrationReplay is presentation state, not something
 * that deserves its own parallel write path).
 */
export async function publishSession(input: PublishSessionInput): Promise<void> {
  const db = getRealtimeDb();
  const payload: Record<string, unknown> = {
    sessionId: input.sessionId,
    revision: input.revision,
    session: input.session,
    // Firebase's update() throws outright on `undefined` (unlike `null`,
    // which is a valid "delete this field" value) — coerce defensively here
    // so a caller can never accidentally break every subsequent write by
    // passing through an undefined it read back from RTDB. See
    // subscribeToLiveSession below for why that's a real, not hypothetical, risk.
    lastInteraction: input.lastInteraction ?? null,
    updatedAt: serverTimestamp(),
  };
  if (input.celebrationReplay !== undefined) payload.celebrationReplay = input.celebrationReplay;
  await update(ref(db, LIVE_SESSION_PATH), payload);
}

/** Therapist tapped "جلسة جديدة" (or there is nothing to clean up yet): removes the whole node, taking the child's name and every stage result with it. */
export async function clearLiveSession(): Promise<void> {
  const db = getRealtimeDb();
  await remove(ref(db, LIVE_SESSION_PATH));
}

function parseLiveSessionValue(raw: unknown): LiveSessionRecord | null {
  const value = raw as LiveSessionRecord | null;
  if (!value || typeof value.revision !== "number" || !value.session) return null;
  // See lib/realtime/serialization.ts: RTDB drops empty arrays and null
  // scalars on read-back, so the raw snapshot is never handed to callers
  // as-is — it's reconstructed into the exact shape SessionState promises.
  // lastInteraction is the same story at the top level: publishSession's
  // own `lastInteraction: null` (the common case — most actions don't
  // produce one) comes back as `undefined`, not `null`, once round-tripped.
  //
  // TASK 12: reviveSessionState assumes its input is genuinely well-formed
  // (per the CURRENT SessionState shape) and throws on a structurally
  // incompatible one — the exact failure mode a stale pre-Task-11 record
  // (still shaped as `stages[]`/`currentStageIndex` instead of
  // `currentStage`/`currentDifficulty`) hits, crashing this callback with no
  // error boundary to catch it and permanently freezing whichever tab
  // subscribed first (see the Task 12 report's root-cause section). This
  // function's own doc comment already promises "never throws on malformed/
  // partial data" — the try/catch below is what actually keeps that promise
  // for a shape this malformed, not just a missing field.
  try {
    return {
      ...value,
      session: reviveSessionState(value.session),
      lastInteraction: value.lastInteraction ?? null,
      celebrationReplay: value.celebrationReplay ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Subscribes to the one live session. Fires `null` when no session exists
 * (fresh install, or right after clearLiveSession) — callers render the
 * waiting state for that. Never throws on malformed/partial data; treats it
 * as "no session" defensively since a half-written node should never be
 * presented as real.
 *
 * Pairs the persistent onValue() listener with a one-shot get() fired at
 * the same time. This isn't redundant: under React StrictMode's dev-only
 * mount -> cleanup -> remount cycle, the first (throwaway) subscription's
 * pending initial snapshot can race with its own teardown, and the
 * surviving (second) listener can end up never receiving an initial
 * dispatch — observed directly (Task 7 QA: a fresh /control open against
 * an existing live session intermittently rendered the empty SETUP screen
 * instead of recovering it, with no console error). get() is a one-shot
 * promise, not a persistent registration, so it isn't subject to that
 * listener-teardown race, and guarantees the caller always ends up with
 * the current value. If onValue's own initial dispatch also lands, the
 * second delivery is harmless — identical data re-render, or (for
 * revision-guarded callers like the display) rejected as a non-progressing
 * duplicate revision.
 */
export function subscribeToLiveSession(callback: (record: LiveSessionRecord | null) => void): Unsubscribe {
  return subscribeWithInitialGet(LIVE_SESSION_PATH, parseLiveSessionValue, callback);
}

/**
 * Pairs a persistent onValue() listener with a one-shot get() fired at the
 * same time, for any single-value path — the general form of the fix
 * documented above subscribeToLiveSession. Every plain "subscribe to one
 * path" function in this file goes through this, not just the live
 * session: the same lost-initial-dispatch race hit subscribeToControllerLease
 * during Task 7 QA (a second controller's lease check silently defaulted to
 * "unclaimed" and would have let it mutate an active session — see report).
 */
function subscribeWithInitialGet<T>(path: string, parse: (raw: unknown) => T, callback: (value: T) => void): Unsubscribe {
  const db = getRealtimeDb();
  const valueRef = ref(db, path);

  void get(valueRef)
    .then((snapshot) => callback(parse(snapshot.val())))
    .catch(() => {
      // onValue below will report the real error/state; a failed opportunistic get() isn't itself user-facing.
    });

  return onValue(valueRef, (snapshot) => callback(parse(snapshot.val())));
}

// ---------------------------------------------------------------------------
// Controller lease (see lib/control/useRealtimeControllerSession.ts for the
// cooperative ownership model this supports)
// ---------------------------------------------------------------------------

export async function claimControllerLease(ownerId: string): Promise<void> {
  const db = getRealtimeDb();
  const leaseRef = ref(db, CONTROLLER_LEASE_PATH);
  // Released automatically if this tab/device disconnects without an explicit handoff.
  await onDisconnect(leaseRef).remove();
  await update(leaseRef, { ownerId, claimedAt: Date.now(), updatedAt: serverTimestamp() });
}

/** Periodic heartbeat so a stale lease (crashed tab that never fired onDisconnect) can be told apart from a live one — see report. */
export async function refreshControllerLease(): Promise<void> {
  const db = getRealtimeDb();
  await update(ref(db, CONTROLLER_LEASE_PATH), { updatedAt: serverTimestamp() });
}

export async function releaseControllerLease(): Promise<void> {
  const db = getRealtimeDb();
  await remove(ref(db, CONTROLLER_LEASE_PATH));
}

export function subscribeToControllerLease(callback: (lease: ControllerLeaseRecord | null) => void): Unsubscribe {
  return subscribeWithInitialGet(CONTROLLER_LEASE_PATH, (raw) => (raw as ControllerLeaseRecord | null) ?? null, callback);
}

// ---------------------------------------------------------------------------
// Presence — idiomatic RTDB pattern: onDisconnect() lets the SERVER flip
// `connected` to false the instant the socket actually drops, which is far
// more reliable than a client-side heartbeat/timeout guess.
// ---------------------------------------------------------------------------

function registerPresence(path: string): Unsubscribe {
  const db = getRealtimeDb();
  const presenceRef = ref(db, path);
  const connectedRef = ref(db, ".info/connected");

  return onValue(connectedRef, (snapshot) => {
    if (snapshot.val() !== true) return;
    // Re-registered every time this client (re)connects — required because
    // onDisconnect handlers do not survive a reconnect, only a single
    // connection's lifetime.
    void onDisconnect(presenceRef).set({ connected: false, updatedAt: serverTimestamp() });
    void update(presenceRef, { connected: true, updatedAt: serverTimestamp() });
  });
}

export function registerControllerPresence(): Unsubscribe {
  return registerPresence(CONTROLLER_PRESENCE_PATH);
}

export function registerDisplayPresence(): Unsubscribe {
  return registerPresence(DISPLAY_PRESENCE_PATH);
}

/**
 * TASK 9 PART 4: best-effort status report so the therapist can see the
 * projector's fullscreen state without walking over to check — see
 * lib/display/useFullscreen.ts. A plain merge update, not a full
 * onDisconnect-managed presence record: this is a secondary flag on the
 * SAME presence/display node registerDisplayPresence() already owns, not a
 * new path. Never awaited by any caller that can't afford to wait on it —
 * fullscreen status is informational only.
 */
export async function reportDisplayFullscreen(isFullscreen: boolean): Promise<void> {
  const db = getRealtimeDb();
  await update(ref(db, DISPLAY_PRESENCE_PATH), { fullscreen: isFullscreen });
}

export function subscribeToDisplayPresence(callback: (presence: PresenceRecord | null) => void): Unsubscribe {
  return subscribeWithInitialGet(DISPLAY_PRESENCE_PATH, (raw) => (raw as PresenceRecord | null) ?? null, callback);
}

export function subscribeToControllerPresence(callback: (presence: PresenceRecord | null) => void): Unsubscribe {
  return subscribeWithInitialGet(CONTROLLER_PRESENCE_PATH, (raw) => (raw as PresenceRecord | null) ?? null, callback);
}

// ---------------------------------------------------------------------------
// This client's own connection status, from RTDB's special `.info/connected`.
// ---------------------------------------------------------------------------

export function subscribeToConnectionStatus(callback: (status: ConnectionStatus) => void): Unsubscribe {
  const db = getRealtimeDb();
  callback("connecting");
  return onValue(ref(db, ".info/connected"), (snapshot) => {
    callback(snapshot.val() === true ? "connected" : "disconnected");
  });
}
