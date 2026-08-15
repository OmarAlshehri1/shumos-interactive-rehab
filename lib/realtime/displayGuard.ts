import type { LiveSessionRecord } from "./types";

/**
 * Pure decision logic for lib/display/useRealtimeDisplaySession.ts, kept
 * framework-free and unit-testable on its own (mirrors how lib/game stays
 * pure and separate from its React hooks) — this is the exact logic the
 * Task 6 spec calls "critical": ignore stale/out-of-order revisions, and
 * never replay an interaction effect that's already been shown.
 */
export interface DisplayGuardState {
  sessionId: string | null;
  lastRevision: number;
  lastInteractionId: string | null;
  /** TASK 9: last-seen "إعادة الاحتفال" token, so a reconnect/re-render never replays a celebration that already played. */
  lastCelebrationReplayToken: string | null;
}

export function createInitialGuardState(): DisplayGuardState {
  return { sessionId: null, lastRevision: -1, lastInteractionId: null, lastCelebrationReplayToken: null };
}

export interface GuardResult {
  state: DisplayGuardState;
  /** false when this record is a stale/out-of-order echo and must be ignored entirely. */
  accept: boolean;
  /** Set only when a genuinely new INCORRECT interaction arrived — the display should shake this balloon once. */
  newIncorrectBalloonId: string | null;
  /** TASK 9: the new token when the therapist just tapped "إعادة الاحتفال" — null otherwise (including on the very first record of a session, so a fresh session never auto-replays). */
  newCelebrationReplayToken: string | null;
}

/**
 * Advances the guard given the next value received from
 * subscribeToLiveSession. A different sessionId always resets the
 * baseline (a legitimately fresh session, not a stale echo of the old
 * one) — including the very first record ever seen. Within the same
 * session, a revision that isn't strictly greater than the last accepted
 * one is dropped, so a delayed network packet can never visually revert
 * the game.
 */
export function applyLiveRecord(state: DisplayGuardState, record: LiveSessionRecord | null): GuardResult {
  if (!record) {
    return { state: createInitialGuardState(), accept: true, newIncorrectBalloonId: null, newCelebrationReplayToken: null };
  }

  let working = state;
  if (record.sessionId !== state.sessionId) {
    // A fresh session's own already-present lastInteraction/celebrationReplay
    // (if any — e.g. a display reconnecting mid-session) must not replay
    // either — seed the baseline with them, not with null.
    working = {
      sessionId: record.sessionId,
      lastRevision: -1,
      lastInteractionId: record.lastInteraction?.id ?? null,
      lastCelebrationReplayToken: record.celebrationReplay?.token ?? null,
    };
  }

  if (record.revision <= working.lastRevision) {
    return { state: working, accept: false, newIncorrectBalloonId: null, newCelebrationReplayToken: null };
  }

  let lastInteractionId = working.lastInteractionId;
  let newIncorrectBalloonId: string | null = null;
  const interaction = record.lastInteraction;
  if (interaction && interaction.id !== working.lastInteractionId) {
    lastInteractionId = interaction.id;
    if (interaction.type === "INCORRECT") newIncorrectBalloonId = interaction.balloonId;
  }

  let lastCelebrationReplayToken = working.lastCelebrationReplayToken;
  let newCelebrationReplayToken: string | null = null;
  const replay = record.celebrationReplay;
  if (replay && replay.token !== working.lastCelebrationReplayToken) {
    lastCelebrationReplayToken = replay.token;
    newCelebrationReplayToken = replay.token;
  }

  return {
    state: { sessionId: working.sessionId, lastRevision: record.revision, lastInteractionId, lastCelebrationReplayToken },
    accept: true,
    newIncorrectBalloonId,
    newCelebrationReplayToken,
  };
}
