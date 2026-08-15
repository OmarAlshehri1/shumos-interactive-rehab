"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Difficulty,
  GameState,
  PlayArea,
  TargetSize,
  TargetSpacing,
  advanceToStage as engineAdvanceToStage,
  applyGameTransition,
  createSession,
  endSession as engineEndSession,
  getAdjacentDifficulty,
  jumpToStage as engineJumpToStage,
  pauseSession as enginePauseSession,
  restartStage as engineRestartStage,
  resumeSession as engineResumeSession,
  selectBalloon as engineSelectBalloon,
  skipStage as engineSkipStage,
  type SessionState,
  type StageNumber,
} from "@/lib/game";
import { TICK_DURATION_MS, TICKS } from "@/components/display/scenes/CountdownScene";
import { useFirebaseAuth } from "@/lib/realtime/useFirebaseAuth";
import {
  claimControllerLease,
  clearLiveSession,
  publishSession,
  refreshControllerLease,
  registerControllerPresence,
  subscribeToConnectionStatus,
  subscribeToControllerLease,
  subscribeToDisplayPresence,
  subscribeToLiveSession,
} from "@/lib/realtime/sessionRepository";
import type { ConnectionStatus, ControllerLeaseRecord, LiveInteraction, LiveSessionRecord, PresenceRecord } from "@/lib/realtime/types";
import type { ControllerPhase, DifficultyDecision, DraftConfig } from "./useLocalControllerSession";
import { DIFFICULTY_DEFAULTS } from "./smartDefaults";

const MAX_NAME_LENGTH = 30;
const INSTRUCTION_VIEW_MS = 3500;
const COUNTDOWN_TOTAL_MS = TICKS.length * TICK_DURATION_MS;
const LEASE_HEARTBEAT_MS = 15000;
const LEASE_STALE_MS = 45000;

function freshDraft(): DraftConfig {
  return { childFirstName: "", difficulty: Difficulty.EASY, startingStage: 1, ...DIFFICULTY_DEFAULTS[Difficulty.EASY] };
}

function derivePhase(session: SessionState | null): ControllerPhase {
  if (!session) return "SETUP";
  if (session.gameState === GameState.SESSION_COMPLETE) return "SUMMARY";
  if (session.gameState === GameState.WELCOME) return "READY";
  return "LIVE";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * TASK 6/8 REALTIME CONTROLLER ADAPTER.
 *
 * Same external shape as lib/control/useLocalControllerSession.ts (phase /
 * draft / session / actions) PLUS realtime-only fields (connectionStatus,
 * displayConnected, lease, authStatus). components/control/ControlScreen.tsx
 * picks between the two hooks explicitly (see lib/realtime/firebaseClient.ts's
 * isRealtimeEnabled()) — nothing in components/control/** needed to change
 * its core rendering logic, only add a few realtime-only UI bits.
 *
 * AUTHORITY MODEL: this hook is the ONLY thing in the whole app that ever
 * calls publishSession(). /display (lib/display/useRealtimeDisplaySession.ts)
 * only ever subscribes and renders. Every mutation here follows the same
 * shape: read the latest known revision, run the approved lib/game action,
 * publish the result at revision+1.
 *
 * TASK 8 — AUTH GATING: nothing here touches RTDB until useFirebaseAuth()
 * resolves to "authenticated". Firebase Client -> Auth Bootstrap
 * (lib/realtime/authClient.ts) -> here — see the report's "Auth
 * architecture" section. The controller lease's ownerId is the
 * authenticated UID, not an arbitrary client-generated token, and Security
 * Rules now enforce that a non-stale lease can only be refreshed/released
 * by its own UID (see database.rules.json) — a genuinely different
 * property from Task 7's purely cooperative lease.
 *
 * TASK 8 — OFFLINE SAFETY: every mutating action additionally requires
 * connectionStatus === "connected". A therapist whose iPad is offline
 * cannot generate a queue of balloon taps that silently replay once
 * connectivity returns — see the report's "Offline-action behavior"
 * section for why this was judged safer than Firebase's default
 * optimistic-while-offline behavior for a physical, projector-driven game.
 *
 * TIMED SCENE SEQUENCING: unlike the local adapter (which collapses
 * WELCOME -> PLAYING in one hop because there is no projector to pace for),
 * this hook publishes INSTRUCTIONS, then COUNTDOWN, then PLAYING as three
 * separate, timed publishes — so /display's approved InstructionsScene and
 * CountdownScene (with their own voice lines and 3-2-1 animation) actually
 * play out for the child, instead of being skipped over. COUNTDOWN_TOTAL_MS
 * is TICKS.length * CountdownScene's TICK_DURATION_MS.
 *
 * TASK 8.2 — START_ZONE GATE: this timed sequence (runInstructionsToPlaying)
 * no longer starts automatically after WELCOME or STAGE_COMPLETE. Both now
 * stop at START_ZONE and wait — there is no camera/floor sensor, so only an
 * explicit therapist tap (confirmChildReady, "الطفل جاهز") can start it.
 * See lib/game/stateMachine.ts for the state machine change and the Task
 * 8.2 report for the full therapist workflow.
 *
 * TASK 8.1: CountdownScene's countdown is now paced against Lama's actual
 * audio playback on the display device, not a fixed timer — this hook has
 * no way to know when that real playback finishes (it runs on a different
 * device, and no completion round-trip exists between them without a
 * Firebase schema change, which was out of scope for Task 8.1). So
 * TICK_DURATION_MS here is deliberately CountdownScene's SAFETY-TIMEOUT
 * ceiling (the longest any one tick can possibly take), making
 * COUNTDOWN_TOTAL_MS a generous upper bound that's always >= the display's
 * real (audio-paced, usually shorter) countdown duration — this timer can
 * fire late relative to the display, never early. See the Task 8.1 report's
 * "Countdown pacing implementation" section.
 */
export function useRealtimeControllerSession() {
  const auth = useFirebaseAuth();
  const uid = auth.uid;

  const [draft, setDraft] = useState<DraftConfig>(freshDraft);
  const [liveRecord, setLiveRecord] = useState<LiveSessionRecord | null>(null);
  // True once we've heard from Firebase at least once (with a real session,
  // or a confirmed "no session"). Distinguishes "definitely nothing to
  // recover" from "haven't heard back yet" — without this, a therapist who
  // types a name and taps ابدأ الجلسة within the first moment or two after
  // a slow/cold connection could create a second session on top of one
  // still in progress.
  const [hasLoadedInitialSession, setHasLoadedInitialSession] = useState(false);
  const liveRecordRef = useRef<LiveSessionRecord | null>(null);
  useEffect(() => {
    liveRecordRef.current = liveRecord;
  }, [liveRecord]);

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [displayPresence, setDisplayPresence] = useState<PresenceRecord | null>(null);
  const [lease, setLease] = useState<ControllerLeaseRecord | null>(null);
  const [leaseKnown, setLeaseKnown] = useState(false);
  // Set briefly when an explicit takeover attempt is rejected by Security
  // Rules — the target lease belongs to a UID that's still actively
  // heartbeating (not stale), so the rules correctly refuse it. Distinct
  // from a normal cooperative "someone else owns it" state.
  const [takeoverBlocked, setTakeoverBlocked] = useState(false);
  // How many publishSession() calls are currently awaiting server
  // confirmation — "local intent" vs "confirmed realtime synchronization"
  // (see report). Normally 0 or briefly 1 (sub-second round trip); only
  // meaningfully nonzero if connectivity drops mid-publish.
  const [unconfirmedActionCount, setUnconfirmedActionCount] = useState(0);

  // Bumped by any mutating action; a still-running timed sequence (see
  // runInstructionsToPlaying below) checks this before each of its later
  // publishes and aborts silently if something else has superseded it
  // (e.g. the therapist ended the session mid-countdown-wait).
  const sequenceTokenRef = useRef(0);

  useEffect(() => {
    if (auth.status !== "authenticated") return;
    const unsubscribeSession = subscribeToLiveSession((record) => {
      setLiveRecord(record);
      setHasLoadedInitialSession(true);
    });
    const unsubscribeConnection = subscribeToConnectionStatus(setConnectionStatus);
    const unsubscribeDisplayPresence = subscribeToDisplayPresence(setDisplayPresence);
    const unsubscribeLease = subscribeToControllerLease((record) => {
      setLease(record);
      setLeaseKnown(true);
    });
    const unregisterPresence = registerControllerPresence();
    return () => {
      unsubscribeSession();
      unsubscribeConnection();
      unsubscribeDisplayPresence();
      unsubscribeLease();
      unregisterPresence();
    };
  }, [auth.status]);

  // Auto-claim an unowned lease, and reclaim one that's gone stale (a
  // previous controller that never cleanly disconnected). A lease actively
  // held by a DIFFERENT uid is left alone — the therapist must tap the
  // explicit takeover button (claimOwnership) for that case, and even then
  // Security Rules only allow it once the existing lease is stale (see
  // database.rules.json) — matching the common real case (the previous
  // controller's tab actually closed, freeing the lease via onDisconnect)
  // rather than forcibly evicting a still-connected one.
  useEffect(() => {
    if (!leaseKnown || !uid) return;
    if (lease && lease.ownerId === uid) return;
    const isStale = lease !== null && typeof lease.updatedAt === "number" && Date.now() - lease.updatedAt > LEASE_STALE_MS;
    if (lease === null || isStale) {
      void claimControllerLease(uid).catch(() => {});
    }
  }, [lease, leaseKnown, uid]);

  // Heartbeat while this client holds the lease.
  useEffect(() => {
    if (!uid || lease?.ownerId !== uid) return;
    const interval = setInterval(() => void refreshControllerLease(), LEASE_HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [lease, uid]);

  const isOwner = uid !== null && (lease === null || lease.ownerId === uid);
  // The real, all-up gate every mutating action requires: recognized as
  // owner AND the socket is actually up right now. See the report's
  // "Offline-action behavior" section — this is deliberately stricter than
  // Task 7's isOwner-only gate.
  const canMutate = isOwner && connectionStatus === "connected";

  const claimOwnership = useCallback(() => {
    if (!uid) return;
    claimControllerLease(uid)
      .then(() => setTakeoverBlocked(false))
      .catch(() => setTakeoverBlocked(true));
  }, [uid]);

  const session = liveRecord?.session ?? null;
  const phase = derivePhase(session);
  const displayConnected = displayPresence?.connected === true;
  // TASK 9 PART 4: best-effort only — see reportDisplayFullscreen's doc comment. Meaningless (and ignored by the UI) while the display isn't even connected.
  const displayFullscreen = displayConnected && displayPresence?.fullscreen === true;

  const setChildName = useCallback((value: string) => {
    setDraft((d) => ({ ...d, childFirstName: value.slice(0, MAX_NAME_LENGTH) }));
  }, []);
  const setDifficulty = useCallback((difficulty: Difficulty) => {
    // TASK 12: resets startingStage to 1 — a stage-5 pick under the previous difficulty shouldn't silently carry over to a different one.
    setDraft((d) => ({ ...d, difficulty, startingStage: 1, ...DIFFICULTY_DEFAULTS[difficulty] }));
  }, []);
  /** TASK 12: the setup screen's "مرحلة البداية" picker — manual only, see DraftConfig.startingStage. */
  const setStartingStage = useCallback((startingStage: StageNumber) => {
    setDraft((d) => ({ ...d, startingStage }));
  }, []);
  const setTargetSize = useCallback((targetSize: TargetSize) => {
    setDraft((d) => ({ ...d, targetSize }));
  }, []);
  const setTargetSpacing = useCallback((targetSpacing: TargetSpacing) => {
    setDraft((d) => ({ ...d, targetSpacing }));
  }, []);
  const setPlayArea = useCallback((playArea: PlayArea) => {
    setDraft((d) => ({ ...d, playArea }));
  }, []);

  /**
   * Publishes at latestRevision+1, tagged with the sequence token active
   * when the caller started, so a superseded in-flight step becomes a
   * no-op. Updates liveRecordRef SYNCHRONOUSLY, before awaiting the network
   * round-trip — a rapid second action (e.g. two balloon taps in quick
   * succession) reads this ref synchronously too, so it always computes its
   * engine diff against THIS action's result, never a stale pre-tap
   * snapshot that would otherwise silently drop the first tap's effect.
   * Tracks unconfirmedActionCount around the actual network call — this is
   * the "local intent vs confirmed synchronization" distinction from the
   * Task 8 report, surfaced to the UI as a simple counter, not a queue.
   */
  const publish = useCallback(
    async (sessionId: string, nextSession: SessionState, lastInteraction: LiveInteraction | null, myToken: number) => {
      if (myToken !== sequenceTokenRef.current) return;
      const nextRevision = (liveRecordRef.current?.revision ?? 0) + 1;
      // TASK 9: ordinary actions never touch celebrationReplay — carry the
      // last-known value forward locally, and simply omit it from the
      // actual publishSession() call below so the server-side merge leaves
      // whatever's really there untouched (see publishSession's doc comment).
      const celebrationReplay = liveRecordRef.current?.celebrationReplay ?? null;
      liveRecordRef.current = { sessionId, revision: nextRevision, session: nextSession, lastInteraction, celebrationReplay, updatedAt: Date.now() };
      setUnconfirmedActionCount((n) => n + 1);
      try {
        await publishSession({ sessionId, revision: nextRevision, session: nextSession, lastInteraction });
      } catch (error) {
        console.error(`[realtime] publishSession failed for revision ${nextRevision} (${nextSession.gameState}):`, error);
      } finally {
        setUnconfirmedActionCount((n) => Math.max(0, n - 1));
      }
    },
    [],
  );

  const runInstructionsToPlaying = useCallback(
    async (sessionId: string, instructionsState: SessionState, myToken: number) => {
      await publish(sessionId, instructionsState, null, myToken);

      await delay(INSTRUCTION_VIEW_MS);
      if (myToken !== sequenceTokenRef.current) return;
      const countdownResult = applyGameTransition(instructionsState, GameState.COUNTDOWN, Date.now());
      if (!countdownResult.success) return;
      await publish(sessionId, countdownResult.state, null, myToken);

      await delay(COUNTDOWN_TOTAL_MS);
      if (myToken !== sequenceTokenRef.current) return;
      const playingResult = applyGameTransition(countdownResult.state, GameState.PLAYING, Date.now());
      if (!playingResult.success) return;
      await publish(sessionId, playingResult.state, null, myToken);
    },
    [publish],
  );

  const confirmSetup = useCallback(() => {
    // Refuse to act until we've heard from Firebase at least once — acting
    // on an unconfirmed "no session" could silently overwrite a session
    // still in progress. Also refuses while offline (see canMutate).
    if (!canMutate || !hasLoadedInitialSession) return;
    const childFirstName = draft.childFirstName.trim();
    if (!childFirstName) return;
    sequenceTokenRef.current += 1;
    const newSession = createSession({ ...draft, childFirstName });
    // Fresh session: revision restarts at 1, set synchronously (see publish() for why). celebrationReplay explicitly cleared — a brand-new session never inherits a stale replay token.
    liveRecordRef.current = {
      sessionId: newSession.sessionId,
      revision: 1,
      session: newSession,
      lastInteraction: null,
      celebrationReplay: null,
      updatedAt: Date.now(),
    };
    setUnconfirmedActionCount((n) => n + 1);
    void publishSession({ sessionId: newSession.sessionId, revision: 1, session: newSession, lastInteraction: null, celebrationReplay: null })
      .catch((error: unknown) => {
        console.error("[realtime] confirmSetup publish failed:", error);
      })
      .finally(() => setUnconfirmedActionCount((n) => Math.max(0, n - 1)));
  }, [draft, canMutate, hasLoadedInitialSession]);

  /** Back to SETUP — clears the whole live session rather than just a local field, so no half-configured session lingers in Firebase for /display to see. */
  const editSetup = useCallback(() => {
    if (!canMutate) return;
    sequenceTokenRef.current += 1;
    void clearLiveSession();
  }, [canMutate]);

  /**
   * TASK 8.2: WELCOME -> SETUP -> START_ZONE only, then STOPS — unlike
   * before Task 8.2, this no longer chains straight into
   * runInstructionsToPlaying. /display shows the Start Zone and Lama asks
   * the child to stand in it; nothing else happens until the therapist
   * physically confirms and taps "الطفل جاهز" (confirmChildReady below).
   * There is no camera/floor sensor, so this state can only ever be exited
   * by that explicit therapist action — never a timer, never automatically.
   */
  const startLiveSession = useCallback(() => {
    const record = liveRecordRef.current;
    if (!canMutate || !record || record.session.gameState !== GameState.WELCOME) return;
    const myToken = ++sequenceTokenRef.current;
    const now = Date.now();
    let result = applyGameTransition(record.session, GameState.SETUP, now);
    result = applyGameTransition(result.state, GameState.START_ZONE, now);
    if (!result.success) return;
    void publish(record.sessionId, result.state, null, myToken);
  }, [canMutate, publish]);

  /**
   * TASK 8.2: the therapist's "الطفل جاهز" confirmation — the ONLY way out
   * of START_ZONE (see lib/game/stateMachine.ts). Valid both before stage 1
   * and returning between every stage. From here on the sequence is
   * identical to the pre-Task-8.2 flow: publish INSTRUCTIONS, wait, publish
   * COUNTDOWN, wait, publish PLAYING — runInstructionsToPlaying already
   * does exactly that.
   */
  const confirmChildReady = useCallback(() => {
    const record = liveRecordRef.current;
    if (!canMutate || !record || record.session.gameState !== GameState.START_ZONE) return;
    const myToken = ++sequenceTokenRef.current;
    const now = Date.now();
    const result = applyGameTransition(record.session, GameState.INSTRUCTIONS, now);
    if (!result.success) return;
    void runInstructionsToPlaying(record.sessionId, result.state, myToken);
  }, [canMutate, runInstructionsToPlaying]);

  const selectBalloon = useCallback(
    (balloonId: string): boolean | null => {
      const record = liveRecordRef.current;
      if (!canMutate || !record || record.session.gameState !== GameState.PLAYING) return null;
      const stage = record.session.currentStage;
      const balloon = stage.balloons.find((b: { id: string }) => b.id === balloonId);
      if (!balloon || balloon.isPopped) return null;
      const wasCorrect = balloon.isTarget;
      const myToken = sequenceTokenRef.current;
      const result = engineSelectBalloon(record.session, balloonId, Date.now());
      const interaction: LiveInteraction = {
        id: `${(record.revision ?? 0) + 1}-${balloonId}`,
        type: wasCorrect ? "CORRECT" : "INCORRECT",
        balloonId,
        revision: (record.revision ?? 0) + 1,
        timestamp: Date.now(),
      };
      void publish(record.sessionId, result.state, interaction, myToken);
      return wasCorrect;
    },
    [canMutate, publish],
  );

  const pauseOrResume = useCallback(() => {
    const record = liveRecordRef.current;
    if (!canMutate || !record || record.session.gameState !== GameState.PLAYING) return;
    const stage = record.session.currentStage;
    const result = stage.pausedAt !== null ? engineResumeSession(record.session, Date.now()) : enginePauseSession(record.session, Date.now());
    void publish(record.sessionId, result.state, record.lastInteraction, sequenceTokenRef.current);
  }, [canMutate, publish]);

  const restartStage = useCallback(() => {
    const record = liveRecordRef.current;
    if (!canMutate || !record) return;
    const result = engineRestartStage(record.session, Date.now());
    void publish(record.sessionId, result.state, null, sequenceTokenRef.current);
  }, [canMutate, publish]);

  const skipStage = useCallback(() => {
    const record = liveRecordRef.current;
    if (!canMutate || !record) return;
    const result = engineSkipStage(record.session, Date.now());
    void publish(record.sessionId, result.state, null, sequenceTokenRef.current);
  }, [canMutate, publish]);

  const endSessionEarly = useCallback(() => {
    const record = liveRecordRef.current;
    if (!canMutate || !record) return;
    sequenceTokenRef.current += 1; // abort any in-flight instructions->countdown->playing sequence
    const result = engineEndSession(record.session, Date.now());
    void publish(record.sessionId, result.state, null, sequenceTokenRef.current);
  }, [canMutate, publish]);

  /**
   * TASK 11: the therapist's post-STAGE_COMPLETE decision — "continue" (same
   * difficulty, next stage number) or step to the adjacent easier/harder
   * difficulty at the SAME stage number (see lib/game/session.ts's
   * advanceToStage doc comment, and components/control/live/StageCompleteOverlay.tsx
   * for the three buttons this drives). Always lands on START_ZONE, never
   * straight to INSTRUCTIONS — getting from START_ZONE to PLAYING is
   * confirmChildReady's job.
   */
  const advanceStage = useCallback(
    (decision: DifficultyDecision) => {
      const record = liveRecordRef.current;
      if (!canMutate || !record || record.session.gameState !== GameState.STAGE_COMPLETE) return;
      const current = record.session;
      const targetDifficulty = decision === "continue" ? current.currentDifficulty : getAdjacentDifficulty(current.currentDifficulty, decision);
      if (!targetDifficulty) return;
      const targetStageNumber = decision === "continue" ? ((current.currentStage.stageNumber + 1) as StageNumber) : current.currentStage.stageNumber;
      const myToken = ++sequenceTokenRef.current;
      const advanced = engineAdvanceToStage(current, { difficulty: targetDifficulty, stageNumber: targetStageNumber });
      void publish(record.sessionId, advanced.state, null, myToken);
    },
    [canMutate, publish],
  );

  /** TASK 11: the therapist stage strip's forward jump — see components/control/live/StageStrip.tsx. Shows a confirmation before calling this; this function itself just applies it. */
  const jumpToStage = useCallback(
    (stageNumber: StageNumber) => {
      const record = liveRecordRef.current;
      if (!canMutate || !record) return;
      const myToken = ++sequenceTokenRef.current;
      const result = engineJumpToStage(record.session, stageNumber, Date.now());
      void publish(record.sessionId, result.state, null, myToken);
    },
    [canMutate, publish],
  );

  /** Full reset: clears Firebase (so /display returns to its waiting state) and the local draft (so no field from the previous child survives). */
  const newSession = useCallback(() => {
    if (!canMutate) return;
    sequenceTokenRef.current += 1;
    liveRecordRef.current = null;
    void clearLiveSession();
    setDraft(freshDraft());
  }, [canMutate]);

  /**
   * TASK 9 — "إعادة الاحتفال": publishes the SAME session (gameState stays
   * SESSION_COMPLETE, summary untouched) with a fresh celebrationReplay
   * token. Deliberately does NOT bump sequenceTokenRef — this isn't a new
   * action superseding anything, it's a side signal alongside the terminal
   * state, valid only once SESSION_COMPLETE (nothing to replay before
   * then). See lib/realtime/displayGuard.ts for how /display tells a new
   * token apart from an echo, and lib/realtime/types.ts's
   * CelebrationReplaySignal doc comment for why this never touches score.
   */
  const replayCelebration = useCallback(() => {
    const record = liveRecordRef.current;
    if (!canMutate || !record || record.session.gameState !== GameState.SESSION_COMPLETE) return;
    const nextRevision = record.revision + 1;
    const token = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const celebrationReplay = { token, timestamp: Date.now() };
    liveRecordRef.current = { ...record, revision: nextRevision, celebrationReplay, updatedAt: Date.now() };
    setUnconfirmedActionCount((n) => n + 1);
    void publishSession({
      sessionId: record.sessionId,
      revision: nextRevision,
      session: record.session,
      lastInteraction: record.lastInteraction,
      celebrationReplay,
    })
      .catch((error: unknown) => {
        console.error("[realtime] replayCelebration publish failed:", error);
      })
      .finally(() => setUnconfirmedActionCount((n) => Math.max(0, n - 1)));
  }, [canMutate]);

  return {
    phase,
    draft,
    session,
    setChildName,
    setDifficulty,
    setStartingStage,
    setTargetSize,
    setTargetSpacing,
    setPlayArea,
    confirmSetup,
    editSetup,
    startLiveSession,
    selectBalloon,
    pauseOrResume,
    restartStage,
    skipStage,
    endSessionEarly,
    advanceStage,
    jumpToStage,
    newSession,
    // Task 8.2 addition:
    confirmChildReady,
    // Task 9 addition:
    replayCelebration,
    // Realtime-only additions:
    connectionStatus,
    displayConnected,
    displayFullscreen,
    isOwner,
    canMutate,
    claimOwnership,
    takeoverBlocked,
    hasLoadedInitialSession,
    unconfirmedActionCount,
    // Task 8 additions:
    authStatus: auth.status,
  };
}
