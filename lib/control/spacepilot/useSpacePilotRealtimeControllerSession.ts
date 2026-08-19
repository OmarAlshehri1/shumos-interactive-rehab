"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applySpacePilotGameTransition,
  createSpacePilotSession,
  Difficulty,
  encounterArrivalOffsetMs,
  endSpacePilotSession as engineEndSession,
  fireSpacePilotWeapon as engineFireWeapon,
  GameState,
  isStarOnlyStage,
  moveSpacePilotRocketLane as engineMoveRocketLane,
  pauseSpacePilotSession as enginePauseSession,
  resolveSpacePilotEncounterArrival,
  resolveSpacePilotStarArrival,
  restartSpacePilotLevel as engineRestartLevel,
  switchSpacePilotDifficulty as engineSwitchDifficulty,
  resumeSpacePilotSession as engineResumeSession,
  starArrivalOffsetMs,
  totalEncountersFor,
  type SpacePilotSessionState,
} from "@/lib/spacepilot";
import { TICK_DURATION_MS, TICKS } from "@/components/display/scenes/CountdownScene";
import { SPACE_PILOT_GAME_ID } from "@/lib/games/registry";
import { getStaffDb } from "@/lib/realtime/firebaseClient";
import { useStaffAuth } from "@/lib/realtime/useStaffAuth";
import {
  claimControllerLease,
  clearLiveSession,
  fetchLiveSession,
  publishSession,
  refreshControllerLease,
  registerControllerPresence,
  subscribeToConnectionStatus,
  subscribeToControllerLease,
  subscribeToDisplayPresence,
  subscribeToLiveSession,
  waitForDisplayCountdownComplete,
} from "@/lib/realtime/sessionRepository";
import type { ConnectionStatus, ControllerLeaseRecord, LiveSessionRecord, PresenceRecord } from "@/lib/realtime/types";
import { usePatientContext } from "@/lib/patients/PatientSessionContext";
import { useSessionWorkflow } from "@/components/control/session/SessionWorkflowContext";
import { applyEarlyEndReason, type EarlyEndSelection } from "@/lib/sessions/workflowMetadata";
import { buildStoredSpacePilotSession } from "@/lib/sessions/buildStoredSpacePilotSession";
import { saveSessionHistoryOnce } from "@/lib/sessions/sessionHistoryRepository";
import type { SpacePilotControllerPhase, SpacePilotDraftConfig } from "./useLocalSpacePilotControllerSession";

const MAX_NAME_LENGTH = 30;
const INSTRUCTION_VIEW_MS = 3500;
/** Same safety-fallback role as every other game's COUNTDOWN_SAFETY_TIMEOUT_MS — CountdownScene is reused unchanged for this game too. */
const COUNTDOWN_SAFETY_TIMEOUT_MS = TICKS.length * TICK_DURATION_MS;
const LEASE_HEARTBEAT_MS = 15000;
const LEASE_STALE_MS = 45000;
/** How often the star-sequence chain re-checks whether its target moment has arrived — tight enough that a collected/missed star reads as simultaneous with the display's own real-time flight animation, without polling so fast it's wasteful. */
const STAR_POLL_CHUNK_MS = 300;

function freshDraft(): SpacePilotDraftConfig {
  return { childFirstName: "", difficulty: Difficulty.EASY };
}

/** The moment (elapsed ms since `startedAt`) object `index` reaches the rocket's collection zone — EASY uses its own fixed schedule, MEDIUM/ADVANCED use their difficulty-specific one. */
function arrivalOffsetMs(difficulty: Difficulty, index: number): number {
  return difficulty === Difficulty.EASY ? starArrivalOffsetMs(index) : encounterArrivalOffsetMs(difficulty, index);
}

function derivePhase(session: SpacePilotSessionState | null): SpacePilotControllerPhase {
  if (!session) return "SETUP";
  if (session.gameState === GameState.SESSION_COMPLETE) return "SUMMARY";
  if (session.gameState === GameState.WELCOME) return "READY";
  return "LIVE";
}

/** Same wake-aware delay helper as every other game's realtime hook — a plain setTimeout can be throttled while the therapist's tab/screen is backgrounded. */
function delayWakeAware(ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      setTimeout(resolve, ms);
      return;
    }
    const deadline = Date.now() + ms;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(timer);
      resolve();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() >= deadline) finish();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setTimeout(finish, ms);
  });
}

/**
 * MULTI-GAME PLATFORM — Space Pilot's own realtime controller adapter,
 * mirroring every other game's architecture (lease/presence/offline-safety/
 * failed-write-resync/timed-instructions-countdown-playing sequence).
 *
 * THE ONE GENUINELY NEW PIECE (no other game has this): star collection is
 * resolved by a real-time SCHEDULE, not a therapist tap — see
 * lib/spacepilot/session.ts's starArrivalOffsetMs. runStarSequence below is
 * this hook's own timed chain (same "controller drives a timed sequence"
 * convention runInstructionsToPlaying already establishes for
 * INSTRUCTIONS -> COUNTDOWN -> PLAYING), polling in short STAR_POLL_CHUNK_MS
 * bursts — rather than one blind long setTimeout per star — specifically so
 * it can notice a pause mid-wait and hold there instead of firing while
 * frozen, and so a page reload can resume mid-level: `waitForStarResolution`
 * always recomputes its target moment from CANONICAL `stage.startedAt` +
 * `stage.totalPausedMs`, never from an in-memory clock, so whichever
 * mutate-capable tab is actually mounted always converges on the same
 * schedule. Guarded the same way as every other timed chain here
 * (`myToken`/`canMutateRef`) so a stale/backgrounded/reloaded tab can never
 * double-resolve a star two tabs both think is "current."
 */
export function useSpacePilotRealtimeControllerSession() {
  const auth = useStaffAuth();
  const uid = auth.uid;
  const patientContext = usePatientContext();
  const sessionWorkflow = useSessionWorkflow();
  const db = getStaffDb();

  const [draft, setDraft] = useState<SpacePilotDraftConfig>(freshDraft);
  const [liveRecord, setLiveRecord] = useState<LiveSessionRecord | null>(null);
  const [hasLoadedInitialSession, setHasLoadedInitialSession] = useState(false);
  const liveRecordRef = useRef<LiveSessionRecord | null>(null);
  useEffect(() => {
    liveRecordRef.current = liveRecord;
  }, [liveRecord]);

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [displayPresence, setDisplayPresence] = useState<PresenceRecord | null>(null);
  const [lease, setLease] = useState<ControllerLeaseRecord | null>(null);
  const [leaseKnown, setLeaseKnown] = useState(false);
  const [takeoverBlocked, setTakeoverBlocked] = useState(false);
  const [unconfirmedActionCount, setUnconfirmedActionCount] = useState(0);
  const [syncRestoredAt, setSyncRestoredAt] = useState<number | null>(null);

  const sequenceTokenRef = useRef(0);
  /** Same double-confirm protection as every other game's *InFlightRef — liveRecordRef.current updates synchronously (optimistically) inside publish(), before the Firebase round-trip resolves, so two lane presses close enough together could otherwise each compute a legitimate-looking (and inconsistent) result. */
  const moveInFlightRef = useRef(false);
  const fireInFlightRef = useRef(false);

  useEffect(() => {
    if (auth.phase !== "authorized") return;
    const unsubscribeSession = subscribeToLiveSession(db, (record) => {
      // MULTI-GAME PLATFORM: this controller only ever exists at
      // /control/space-pilot — a canonical record whose gameId belongs to a
      // DIFFERENT game must never be treated as "our" session.
      setLiveRecord(record && record.gameId === SPACE_PILOT_GAME_ID ? record : null);
      setHasLoadedInitialSession(true);
    });
    const unsubscribeConnection = subscribeToConnectionStatus(db, setConnectionStatus);
    const unsubscribeDisplayPresence = subscribeToDisplayPresence(db, setDisplayPresence);
    const unsubscribeLease = subscribeToControllerLease(db, (record) => {
      setLease(record);
      setLeaseKnown(true);
    });
    const unregisterPresence = registerControllerPresence(db);
    return () => {
      unsubscribeSession();
      unsubscribeConnection();
      unsubscribeDisplayPresence();
      unsubscribeLease();
      unregisterPresence();
    };
  }, [auth.phase, db]);

  useEffect(() => {
    if (!leaseKnown || !uid) return;
    if (lease && lease.ownerId === uid) return;
    const isStale = lease !== null && typeof lease.updatedAt === "number" && Date.now() - lease.updatedAt > LEASE_STALE_MS;
    if (lease === null || isStale) {
      void claimControllerLease(db, uid).catch((error: unknown) => console.error("[realtime] claimControllerLease failed:", error));
    }
  }, [lease, leaseKnown, uid, db]);

  useEffect(() => {
    if (!uid || lease?.ownerId !== uid) return;
    const interval = setInterval(
      () => void refreshControllerLease(db).catch((error: unknown) => console.error("[realtime] refreshControllerLease heartbeat failed:", error)),
      LEASE_HEARTBEAT_MS,
    );
    return () => clearInterval(interval);
  }, [lease, uid, db]);

  const isOwner = uid !== null && leaseKnown && (lease === null || lease.ownerId === uid);
  const canMutate = isOwner && connectionStatus === "connected";
  const canMutateRef = useRef(canMutate);
  useEffect(() => {
    canMutateRef.current = canMutate;
  }, [canMutate]);

  const claimOwnership = useCallback(() => {
    if (!uid) return;
    claimControllerLease(db, uid)
      .then(() => setTakeoverBlocked(false))
      .catch(() => setTakeoverBlocked(true));
  }, [uid, db]);

  const session = (liveRecord?.session as SpacePilotSessionState | undefined) ?? null;
  const phase = derivePhase(session);

  const savedSessionIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!session || session.gameState !== GameState.SESSION_COMPLETE || !session.summary) return;
    if (auth.phase !== "authorized" || !uid) return;
    const patientId = liveRecord?.patientId ?? null;
    if (!patientId) return;

    const sessionId = session.sessionId;
    if (savedSessionIdsRef.current.has(sessionId)) return;
    savedSessionIdsRef.current.add(sessionId);

    const record = buildStoredSpacePilotSession({ session, patientId, createdByUid: uid, therapistName: auth.displayName, gameId: SPACE_PILOT_GAME_ID });
    void saveSessionHistoryOnce(patientId, record).catch((error: unknown) => {
      console.error(`[realtime] space pilot session history save failed for ${sessionId}:`, error);
      savedSessionIdsRef.current.delete(sessionId);
    });
  }, [session, liveRecord, auth.phase, auth.displayName, uid]);

  const displayConnected = displayPresence?.connected === true;
  const displayFullscreen = displayConnected && displayPresence?.fullscreen === true;

  const setChildName = useCallback((value: string) => {
    setDraft((d) => ({ ...d, childFirstName: value.slice(0, MAX_NAME_LENGTH) }));
  }, []);

  const setDifficulty = useCallback((value: Difficulty) => {
    setDraft((d) => ({ ...d, difficulty: value }));
  }, []);

  const resyncFromCanonical = useCallback(
    async (myToken: number) => {
      if (myToken !== sequenceTokenRef.current) return;
      try {
        const canonical = await fetchLiveSession(db);
        if (myToken !== sequenceTokenRef.current) return;
        const isOurs = canonical && canonical.gameId === SPACE_PILOT_GAME_ID ? canonical : null;
        liveRecordRef.current = isOurs;
        setLiveRecord(isOurs);
        setSyncRestoredAt(Date.now());
      } catch (fetchError) {
        console.error("[realtime] space pilot resync-from-canonical fetch failed:", fetchError);
      }
    },
    [db],
  );

  const publish = useCallback(
    async (sessionId: string, nextSession: SpacePilotSessionState, myToken: number): Promise<number | null> => {
      if (myToken !== sequenceTokenRef.current) return null;
      const nextRevision = (liveRecordRef.current?.revision ?? 0) + 1;
      const celebrationReplay = liveRecordRef.current?.celebrationReplay ?? null;
      const patientId = liveRecordRef.current?.patientId ?? null;
      liveRecordRef.current = {
        gameId: SPACE_PILOT_GAME_ID,
        sessionId,
        revision: nextRevision,
        session: nextSession,
        lastInteraction: null,
        celebrationReplay,
        patientId,
        updatedAt: Date.now(),
      };
      setUnconfirmedActionCount((n) => n + 1);
      try {
        await publishSession(db, {
          gameId: SPACE_PILOT_GAME_ID,
          sessionId,
          revision: nextRevision,
          session: nextSession,
          lastInteraction: null,
          patientId,
        });
        return nextRevision;
      } catch (error) {
        console.error(`[realtime] space pilot publishSession failed for revision ${nextRevision} (${nextSession.gameState}):`, error);
        await resyncFromCanonical(myToken);
        return null;
      } finally {
        setUnconfirmedActionCount((n) => Math.max(0, n - 1));
      }
    },
    [db, resyncFromCanonical],
  );

  // RELIABILITY FIX — stranded-in-INSTRUCTIONS/COUNTDOWN watchdog: same fix
  // as every other game's realtime hook — see
  // useBubblePopRealtimeControllerSession.ts's matching comment for the full
  // story of why a freshly-mounted, mutate-capable tab that finds the
  // session already sitting in INSTRUCTIONS or COUNTDOWN bounces it back to
  // START_ZONE rather than trusting a promise chain that died with a
  // previous tab.
  const hasCheckedStrandedRef = useRef(false);
  useEffect(() => {
    if (hasCheckedStrandedRef.current || !hasLoadedInitialSession || !canMutate) return;
    hasCheckedStrandedRef.current = true;
    const record = liveRecordRef.current;
    const strandedSession = record?.session as SpacePilotSessionState | undefined;
    if (!record || !strandedSession) return;
    if (strandedSession.gameState !== GameState.INSTRUCTIONS && strandedSession.gameState !== GameState.COUNTDOWN) return;
    const myToken = ++sequenceTokenRef.current;
    const recovered = applySpacePilotGameTransition(strandedSession, GameState.START_ZONE, Date.now());
    if (!recovered.success) return;
    void publish(record.sessionId, recovered.state, myToken);
  }, [hasLoadedInitialSession, canMutate, publish]);

  /**
   * Waits until object `index` is actually due (recomputed from CANONICAL
   * timing every poll, so a pause or a reload never desyncs it), then
   * resolves it and publishes. Returns without publishing if superseded
   * (stale token, lost ownership, level no longer PLAYING, or this
   * star/encounter was already resolved by someone else — e.g. a restart,
   * or (MEDIUM/ADVANCED only) a FIRE press that resolved an asteroid early
   * happened mid-wait). Works for both EASY's star-only stage and
   * MEDIUM/ADVANCED's encounter stage — `stage.kind` picks the right
   * resolver and the right arrival schedule.
   */
  const waitForStarResolution = useCallback(
    async (sessionId: string, index: number, myToken: number): Promise<void> => {
      for (;;) {
        if (myToken !== sequenceTokenRef.current || !canMutateRef.current) return;
        const record = liveRecordRef.current;
        const s = record?.session as SpacePilotSessionState | undefined;
        if (!record || !s || s.gameState !== GameState.PLAYING) return;
        const stage = s.currentStage;
        const currentIndex = isStarOnlyStage(stage) ? stage.currentStarIndex : stage.currentEncounterIndex;
        if (currentIndex !== index) return; // already resolved (FIRE, restart, or someone else) — nothing left for this call to do
        if (stage.startedAt === null) return;

        if (stage.pausedAt !== null) {
          await delayWakeAware(STAR_POLL_CHUNK_MS);
          continue;
        }

        const dueAt = stage.startedAt + arrivalOffsetMs(s.currentDifficulty, index) + stage.totalPausedMs;
        const remaining = dueAt - Date.now();
        if (remaining > 50) {
          await delayWakeAware(Math.min(remaining, STAR_POLL_CHUNK_MS));
          continue;
        }

        const result = isStarOnlyStage(stage) ? resolveSpacePilotStarArrival(s, index, Date.now()) : resolveSpacePilotEncounterArrival(s, index, Date.now());
        if (!result.success) return;
        await publish(sessionId, result.state, myToken);
        return;
      }
    },
    [publish],
  );

  const runStarSequence = useCallback(
    async (sessionId: string, myToken: number, startIndex: number, difficulty: Difficulty) => {
      const total = totalEncountersFor(difficulty);
      for (let i = startIndex; i < total; i++) {
        await waitForStarResolution(sessionId, i, myToken);
        if (myToken !== sequenceTokenRef.current || !canMutateRef.current) return;
        const record = liveRecordRef.current;
        const s = record?.session as SpacePilotSessionState | undefined;
        if (!s || s.gameState !== GameState.PLAYING) return; // level complete, or the session moved on/ended
      }
    },
    [waitForStarResolution],
  );

  // RELIABILITY FIX — stranded-in-PLAYING resume: the star sequence only
  // ever lives as an in-memory chain inside whichever tab called
  // confirmChildReady (see runInstructionsToPlaying below) — if that tab
  // reloads or closes mid-level, nothing durable represents "a chain is
  // driving this." On the FIRST session snapshot a newly-mounted,
  // mutate-capable tab receives, if it finds the level already PLAYING with
  // stars still left to resolve, no other tab's chain is still running (a
  // live one in THIS tab would still be in flight, not freshly mounted) —
  // resume the chain from the canonical currentStarIndex; waitForStarResolution
  // recomputes real due-time from canonical startedAt/totalPausedMs, so this
  // picks up exactly where the level actually is, never re-fires an
  // already-resolved star.
  const hasCheckedStrandedPlayingRef = useRef(false);
  useEffect(() => {
    if (hasCheckedStrandedPlayingRef.current || !hasLoadedInitialSession || !canMutate) return;
    hasCheckedStrandedPlayingRef.current = true;
    const record = liveRecordRef.current;
    const strandedSession = record?.session as SpacePilotSessionState | undefined;
    if (!record || !strandedSession) return;
    if (strandedSession.gameState !== GameState.PLAYING) return;
    const strandedStage = strandedSession.currentStage;
    const startIndex = isStarOnlyStage(strandedStage) ? strandedStage.currentStarIndex : strandedStage.currentEncounterIndex;
    if (startIndex >= totalEncountersFor(strandedSession.currentDifficulty)) return;
    const myToken = sequenceTokenRef.current;
    void runStarSequence(record.sessionId, myToken, startIndex, strandedSession.currentDifficulty);
  }, [hasLoadedInitialSession, canMutate, runStarSequence]);

  const runInstructionsToPlaying = useCallback(
    async (sessionId: string, instructionsState: SpacePilotSessionState, myToken: number) => {
      if (!canMutateRef.current) return;
      const instructionsRevision = await publish(sessionId, instructionsState, myToken);
      if (instructionsRevision === null) return;

      await delayWakeAware(INSTRUCTION_VIEW_MS);
      if (myToken !== sequenceTokenRef.current || !canMutateRef.current) return;
      const countdownResult = applySpacePilotGameTransition(instructionsState, GameState.COUNTDOWN, Date.now());
      if (!countdownResult.success) return;
      const countdownRevision = await publish(sessionId, countdownResult.state, myToken);
      if (countdownRevision === null) return;

      const countdownSignal = waitForDisplayCountdownComplete(db, sessionId, countdownRevision);
      try {
        await Promise.race([countdownSignal.promise, delayWakeAware(COUNTDOWN_SAFETY_TIMEOUT_MS)]);
      } finally {
        countdownSignal.cancel();
      }
      if (myToken !== sequenceTokenRef.current || !canMutateRef.current) return;
      const playingResult = applySpacePilotGameTransition(countdownResult.state, GameState.PLAYING, Date.now());
      if (!playingResult.success) return;
      const playingRevision = await publish(sessionId, playingResult.state, myToken);
      if (playingRevision === null) return;
      void runStarSequence(sessionId, myToken, 0, playingResult.state.currentDifficulty);
    },
    [publish, db, runStarSequence],
  );

  const confirmSetup = useCallback(async () => {
    if (!canMutate || !hasLoadedInitialSession) return;
    const childFirstName = draft.childFirstName.trim();
    if (!childFirstName) return;
    const myToken = ++sequenceTokenRef.current;
    const newSessionState = createSpacePilotSession({ childFirstName, difficulty: draft.difficulty, workflow: sessionWorkflow.metadata });
    const patientId = patientContext.selectedPatient?.patientId ?? null;

    // RELIABILITY FIX — cross-game revision conflict: same fix as every
    // other game's confirmSetup — read the true canonical revision first,
    // regardless of which game it belongs to, since liveSession is a single
    // shared node.
    let baseRevision = 0;
    try {
      const canonical = await fetchLiveSession(db);
      if (myToken !== sequenceTokenRef.current) return;
      baseRevision = canonical?.revision ?? 0;
    } catch (error) {
      console.error("[realtime] space pilot confirmSetup canonical revision fetch failed:", error);
    }
    const nextRevision = baseRevision + 1;

    liveRecordRef.current = {
      gameId: SPACE_PILOT_GAME_ID,
      sessionId: newSessionState.sessionId,
      revision: nextRevision,
      session: newSessionState,
      lastInteraction: null,
      celebrationReplay: null,
      patientId,
      updatedAt: Date.now(),
    };
    setUnconfirmedActionCount((n) => n + 1);
    void publishSession(db, {
      gameId: SPACE_PILOT_GAME_ID,
      sessionId: newSessionState.sessionId,
      revision: nextRevision,
      session: newSessionState,
      lastInteraction: null,
      celebrationReplay: null,
      patientId,
    })
      .catch(async (error: unknown) => {
        console.error("[realtime] space pilot confirmSetup publish failed:", error);
        await resyncFromCanonical(myToken);
      })
      .finally(() => setUnconfirmedActionCount((n) => Math.max(0, n - 1)));
  }, [draft, canMutate, hasLoadedInitialSession, patientContext.selectedPatient, db, resyncFromCanonical, sessionWorkflow.metadata]);

  const editSetup = useCallback(() => {
    if (!canMutate) return;
    sequenceTokenRef.current += 1;
    void clearLiveSession(db);
  }, [canMutate, db]);

  const startLiveSession = useCallback(() => {
    const record = liveRecordRef.current;
    if (!canMutate || !record || record.session.gameState !== GameState.WELCOME) return;
    const myToken = ++sequenceTokenRef.current;
    const now = Date.now();
    const s = record.session as SpacePilotSessionState;
    let result = applySpacePilotGameTransition(s, GameState.SETUP, now);
    result = applySpacePilotGameTransition(result.state, GameState.START_ZONE, now);
    if (!result.success) return;
    void publish(record.sessionId, result.state, myToken);
  }, [canMutate, publish]);

  const confirmChildReady = useCallback(() => {
    const record = liveRecordRef.current;
    if (!canMutate || !record || record.session.gameState !== GameState.START_ZONE) return;
    const myToken = ++sequenceTokenRef.current;
    const now = Date.now();
    const result = applySpacePilotGameTransition(record.session as SpacePilotSessionState, GameState.INSTRUCTIONS, now);
    if (!result.success) return;
    void runInstructionsToPlaying(record.sessionId, result.state, myToken);
  }, [canMutate, runInstructionsToPlaying]);

  /** The therapist's mirrored UP/DOWN press (task's "Therapist controls may mirror UP/DOWN for QA/authority" — same controller-authoritative model every other wall game already follows, see StationBar.tsx). */
  const moveRocketLane = useCallback(
    (direction: "UP" | "DOWN") => {
      if (moveInFlightRef.current) return;
      const record = liveRecordRef.current;
      if (!canMutate || !record || record.session.gameState !== GameState.PLAYING) return;
      const myToken = sequenceTokenRef.current;
      const result = engineMoveRocketLane(record.session as SpacePilotSessionState, direction);
      if (!result.success) return;
      moveInFlightRef.current = true;
      void publish(record.sessionId, result.state, myToken).finally(() => {
        moveInFlightRef.current = false;
      });
    },
    [canMutate, publish],
  );

  /** The therapist's mirrored FIRE press — MEDIUM/ADVANCED only, same controller-authoritative model as moveRocketLane above. */
  const fireWeapon = useCallback(() => {
    if (fireInFlightRef.current) return;
    const record = liveRecordRef.current;
    if (!canMutate || !record || record.session.gameState !== GameState.PLAYING) return;
    const myToken = sequenceTokenRef.current;
    const result = engineFireWeapon(record.session as SpacePilotSessionState, Date.now());
    if (!result.success) return;
    fireInFlightRef.current = true;
    void publish(record.sessionId, result.state, myToken).finally(() => {
      fireInFlightRef.current = false;
    });
  }, [canMutate, publish]);

  const pauseOrResume = useCallback(() => {
    const record = liveRecordRef.current;
    if (!canMutate || !record || record.session.gameState !== GameState.PLAYING) return;
    const s = record.session as SpacePilotSessionState;
    const result = s.currentStage.pausedAt !== null ? engineResumeSession(s, Date.now()) : enginePauseSession(s, Date.now());
    void publish(record.sessionId, result.state, sequenceTokenRef.current);
  }, [canMutate, publish]);

  const restartLevel = useCallback(() => {
    const record = liveRecordRef.current;
    if (!canMutate || !record) return;
    const myToken = ++sequenceTokenRef.current;
    const result = engineRestartLevel(record.session as SpacePilotSessionState, Date.now());
    if (!result.success) return;
    void publish(record.sessionId, result.state, myToken).then((revision) => {
      if (revision !== null) void runStarSequence(record.sessionId, myToken, 0, result.state.currentDifficulty);
    });
  }, [canMutate, publish, runStarSequence]);

  const changeLiveDifficulty = useCallback((difficulty: Difficulty) => {
    const record = liveRecordRef.current;
    if (!canMutate || !record) return;
    const myToken = ++sequenceTokenRef.current;
    const result = engineSwitchDifficulty(record.session as SpacePilotSessionState, difficulty);
    if (result.success) void publish(record.sessionId, result.state, myToken);
  }, [canMutate, publish]);

  const endSessionEarly = useCallback((selection: EarlyEndSelection) => {
    const record = liveRecordRef.current;
    if (!canMutate || !record) return;
    sequenceTokenRef.current += 1;
    const result = engineEndSession(applyEarlyEndReason(record.session as SpacePilotSessionState, selection.reason, selection.customReason), Date.now());
    void publish(record.sessionId, result.state, sequenceTokenRef.current);
  }, [canMutate, publish]);

  const newSession = useCallback(() => {
    if (!canMutate) return;
    sequenceTokenRef.current += 1;
    liveRecordRef.current = null;
    void clearLiveSession(db);
    setDraft(freshDraft());
    sessionWorkflow.reset();
    patientContext.clearPatient();
  }, [canMutate, patientContext, sessionWorkflow, db]);

  const startAnotherSessionForSamePatient = useCallback(() => {
    if (!canMutate) return;
    sequenceTokenRef.current += 1;
    liveRecordRef.current = null;
    void clearLiveSession(db);
    setDraft(freshDraft());
    sessionWorkflow.reset();
  }, [canMutate, sessionWorkflow, db]);

  const replayCelebration = useCallback(() => {
    const record = liveRecordRef.current;
    if (!canMutate || !record || record.session.gameState !== GameState.SESSION_COMPLETE) return;
    const myToken = sequenceTokenRef.current;
    const nextRevision = record.revision + 1;
    const token = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const celebrationReplay = { token, timestamp: Date.now() };
    liveRecordRef.current = { ...record, revision: nextRevision, celebrationReplay, updatedAt: Date.now() };
    setUnconfirmedActionCount((n) => n + 1);
    void publishSession(db, {
      gameId: SPACE_PILOT_GAME_ID,
      sessionId: record.sessionId,
      revision: nextRevision,
      session: record.session,
      lastInteraction: record.lastInteraction,
      celebrationReplay,
      patientId: record.patientId,
    })
      .catch(async (error: unknown) => {
        console.error("[realtime] space pilot replayCelebration publish failed:", error);
        await resyncFromCanonical(myToken);
      })
      .finally(() => setUnconfirmedActionCount((n) => Math.max(0, n - 1)));
  }, [canMutate, db, resyncFromCanonical]);

  return {
    therapistName: auth.displayName,
    phase,
    draft,
    session,
    setChildName,
    setDifficulty,
    confirmSetup,
    editSetup,
    startLiveSession,
    moveRocketLane,
    fireWeapon,
    pauseOrResume,
    restartLevel,
    changeLiveDifficulty,
    endSessionEarly,
    newSession,
    confirmChildReady,
    replayCelebration,
    startAnotherSessionForSamePatient,
    sessionPatientId: liveRecord?.patientId ?? null,
    connectionStatus,
    displayConnected,
    displayFullscreen,
    isOwner,
    canMutate,
    claimOwnership,
    takeoverBlocked,
    hasLoadedInitialSession,
    unconfirmedActionCount,
    syncRestoredAt,
    authPhase: auth.phase,
  };
}
