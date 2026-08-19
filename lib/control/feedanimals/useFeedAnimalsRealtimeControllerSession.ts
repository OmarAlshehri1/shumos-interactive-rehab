"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  advanceFeedAnimalsMonkey as engineAdvanceMonkey,
  advanceFeedAnimalsStage as engineAdvanceStage,
  applyFeedAnimalsGameTransition,
  confirmFoodSelection as engineConfirmFoodSelection,
  createFeedAnimalsSession,
  currentRound,
  Difficulty,
  endFeedAnimalsSession as engineEndSession,
  type FeedAnimalsSessionState,
  FoodSize,
  GameState,
  getStageDecisionTarget,
  jumpToFeedAnimalsStage as engineJumpToStage,
  MovementPattern,
  pauseFeedAnimalsSession as enginePauseSession,
  ReachHeight,
  ReachSide,
  restartFeedAnimalsStage as engineRestartStage,
  resumeFeedAnimalsSession as engineResumeSession,
  skipFeedAnimalsStage as engineSkipStage,
  switchFeedAnimalsDifficulty as engineSwitchDifficulty,
  type StageNumber,
} from "@/lib/feedanimals";
import { TICK_DURATION_MS, TICKS } from "@/components/display/scenes/CountdownScene";
import { FEED_THE_ANIMALS_GAME_ID } from "@/lib/games/registry";
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
import type { ConnectionStatus, ControllerLeaseRecord, LiveInteraction, LiveSessionRecord, PresenceRecord } from "@/lib/realtime/types";
import { usePatientContext } from "@/lib/patients/PatientSessionContext";
import { useSessionWorkflow } from "@/components/control/session/SessionWorkflowContext";
import { applyEarlyEndReason, type EarlyEndSelection } from "@/lib/sessions/workflowMetadata";
import { buildStoredFeedAnimalsSession } from "@/lib/sessions/buildStoredFeedAnimalsSession";
import { saveSessionHistoryOnce } from "@/lib/sessions/sessionHistoryRepository";
import type { FeedAnimalsDifficultyDecision, FeedAnimalsDraftConfig } from "./useLocalFeedAnimalsControllerSession";
import { FEED_ANIMALS_DIFFICULTY_DEFAULTS } from "./smartDefaults";
import { getFeedAnimalsStagePreset } from "./stagePreset";

const MAX_NAME_LENGTH = 30;
const INSTRUCTION_VIEW_MS = 3500;
/** Same safety-fallback role as every other game's COUNTDOWN_SAFETY_TIMEOUT_MS — CountdownScene is reused unchanged for this game too. */
const COUNTDOWN_SAFETY_TIMEOUT_MS = TICKS.length * TICK_DURATION_MS;
const LEASE_HEARTBEAT_MS = 15000;
const LEASE_STALE_MS = 45000;

function freshDraft(): FeedAnimalsDraftConfig {
  return { childFirstName: "", difficulty: Difficulty.EASY, startingStage: 1, ...FEED_ANIMALS_DIFFICULTY_DEFAULTS[Difficulty.EASY] };
}

function derivePhase(session: FeedAnimalsSessionState | null): "SETUP" | "READY" | "LIVE" | "SUMMARY" {
  if (!session) return "SETUP";
  if (session.gameState === GameState.SESSION_COMPLETE) return "SUMMARY";
  if (session.gameState === GameState.WELCOME) return "READY";
  return "LIVE";
}

/** Same wake-aware delay helper as every other game's realtime hooks — a plain setTimeout can be throttled while the therapist's tab/screen is backgrounded during a multi-second countdown wait. */
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
 * MULTI-GAME PLATFORM — Feed the Animals' own realtime controller adapter,
 * mirroring the other three games' architecture field-for-field (same
 * lease/presence/offline-safety/failed-write-resync/timed-instructions-
 * countdown-playing-sequence guarantees, and the SAME cross-game-revision-
 * conflict fix confirmSetup below already bakes in from day one). Kept as
 * its OWN file rather than a generic hook — the four adapters share a shape
 * by convention, not by a forced abstraction.
 */
export function useFeedAnimalsRealtimeControllerSession() {
  const auth = useStaffAuth();
  const uid = auth.uid;
  const patientContext = usePatientContext();
  const sessionWorkflow = useSessionWorkflow();
  const db = getStaffDb();

  const [draft, setDraft] = useState<FeedAnimalsDraftConfig>(freshDraft);
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
  /** Same double-confirm protection as every other game's confirm-in-flight ref — liveRecordRef.current updates synchronously (optimistically) inside publish(), before the Firebase round-trip resolves, so two food-choice taps close together could otherwise each compute a legitimate-looking (and inconsistent) result. Blocks a second confirm while one is still in flight. */
  const confirmFoodInFlightRef = useRef(false);
  /** SAFARI ANIMAL ADVENTURE PROTOTYPE — same in-flight guard shape as confirmFoodInFlightRef above, applied to the path mechanic's own LEFT/RIGHT action. */
  const advanceMonkeyInFlightRef = useRef(false);

  useEffect(() => {
    if (auth.phase !== "authorized") return;
    const unsubscribeSession = subscribeToLiveSession(db, (record) => {
      // MULTI-GAME PLATFORM: this controller only ever exists at
      // /control/feed-the-animals — a canonical record whose gameId belongs
      // to a DIFFERENT game must never be treated as "our" session; the
      // therapist sees a fresh SETUP here, not another game's state.
      setLiveRecord(record && record.gameId === FEED_THE_ANIMALS_GAME_ID ? record : null);
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
      () =>
        void refreshControllerLease(db).catch((error: unknown) => console.error("[realtime] refreshControllerLease heartbeat failed:", error)),
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

  const session = (liveRecord?.session as FeedAnimalsSessionState | undefined) ?? null;
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

    const record = buildStoredFeedAnimalsSession({ session, patientId, createdByUid: uid, therapistName: auth.displayName, gameId: FEED_THE_ANIMALS_GAME_ID });
    void saveSessionHistoryOnce(patientId, record).catch((error: unknown) => {
      console.error(`[realtime] feed the animals session history save failed for ${sessionId}:`, error);
      savedSessionIdsRef.current.delete(sessionId);
    });
  }, [session, liveRecord, auth.phase, auth.displayName, uid]);

  const displayConnected = displayPresence?.connected === true;
  const displayFullscreen = displayConnected && displayPresence?.fullscreen === true;

  const setChildName = useCallback((value: string) => {
    setDraft((d) => ({ ...d, childFirstName: value.slice(0, MAX_NAME_LENGTH) }));
  }, []);
  const setDifficulty = useCallback((difficulty: Difficulty) => {
    setDraft((d) => ({ ...d, difficulty, startingStage: 1, ...FEED_ANIMALS_DIFFICULTY_DEFAULTS[difficulty] }));
  }, []);
  const setStartingStage = useCallback((startingStage: StageNumber) => {
    setDraft((d) => ({ ...d, startingStage }));
  }, []);
  const setFoodSize = useCallback((foodSize: FoodSize) => {
    setDraft((d) => ({ ...d, foodSize }));
  }, []);
  const setReachHeight = useCallback((reachHeight: ReachHeight) => {
    setDraft((d) => ({ ...d, reachHeight }));
  }, []);
  const setReachSide = useCallback((reachSide: ReachSide) => {
    setDraft((d) => ({ ...d, reachSide }));
  }, []);
  const setMovementPattern = useCallback((movementPattern: MovementPattern) => {
    setDraft((d) => ({ ...d, movementPattern }));
  }, []);

  const resyncFromCanonical = useCallback(
    async (myToken: number) => {
      if (myToken !== sequenceTokenRef.current) return;
      try {
        const canonical = await fetchLiveSession(db);
        if (myToken !== sequenceTokenRef.current) return;
        const isOurs = canonical && canonical.gameId === FEED_THE_ANIMALS_GAME_ID ? canonical : null;
        liveRecordRef.current = isOurs;
        setLiveRecord(isOurs);
        setSyncRestoredAt(Date.now());
      } catch (fetchError) {
        console.error("[realtime] feed the animals resync-from-canonical fetch failed:", fetchError);
      }
    },
    [db],
  );

  const publish = useCallback(
    async (sessionId: string, nextSession: FeedAnimalsSessionState, myToken: number, interaction?: LiveInteraction | null): Promise<number | null> => {
      if (myToken !== sequenceTokenRef.current) return null;
      const nextRevision = (liveRecordRef.current?.revision ?? 0) + 1;
      const celebrationReplay = liveRecordRef.current?.celebrationReplay ?? null;
      const patientId = liveRecordRef.current?.patientId ?? null;
      liveRecordRef.current = {
        gameId: FEED_THE_ANIMALS_GAME_ID,
        sessionId,
        revision: nextRevision,
        session: nextSession,
        lastInteraction: interaction ?? null,
        celebrationReplay,
        patientId,
        updatedAt: Date.now(),
      };
      setUnconfirmedActionCount((n) => n + 1);
      try {
        await publishSession(db, {
          gameId: FEED_THE_ANIMALS_GAME_ID,
          sessionId,
          revision: nextRevision,
          session: nextSession,
          lastInteraction: interaction ?? null,
          patientId,
        });
        return nextRevision;
      } catch (error) {
        console.error(`[realtime] feed the animals publishSession failed for revision ${nextRevision} (${nextSession.gameState}):`, error);
        await resyncFromCanonical(myToken);
        return null;
      } finally {
        setUnconfirmedActionCount((n) => Math.max(0, n - 1));
      }
    },
    [db, resyncFromCanonical],
  );

  // RELIABILITY FIX — stranded-in-INSTRUCTIONS/COUNTDOWN watchdog: same fix
  // proven in Bubble Pop Wall's and Follow the Footsteps' own realtime
  // controller hooks, from day one (task section 53). The INSTRUCTIONS ->
  // COUNTDOWN -> PLAYING advance (runInstructionsToPlaying below) lives only
  // as an in-memory promise chain inside whichever control tab called
  // confirmChildReady — nothing durable in Firebase represents "a transition
  // is in flight." If that tab is reloaded or closed mid-chain, no other
  // client ever resumes it — the display faithfully shows the stranded
  // state and the therapist is stuck. On the FIRST session snapshot a
  // newly-mounted, mutate-capable control tab receives, if it finds the
  // session already sitting in INSTRUCTIONS or COUNTDOWN, nobody was
  // actively driving it — bounce back to START_ZONE, which is always a
  // valid transition from either state and is this game's normal recovery
  // hub, so the therapist just re-taps "الطفل جاهز ✓" to continue.
  const hasCheckedStrandedRef = useRef(false);
  useEffect(() => {
    if (hasCheckedStrandedRef.current || !hasLoadedInitialSession || !canMutate) return;
    hasCheckedStrandedRef.current = true;
    const record = liveRecordRef.current;
    const strandedSession = record?.session as FeedAnimalsSessionState | undefined;
    if (!record || !strandedSession) return;
    if (strandedSession.gameState !== GameState.INSTRUCTIONS && strandedSession.gameState !== GameState.COUNTDOWN) return;
    const myToken = ++sequenceTokenRef.current;
    const recovered = applyFeedAnimalsGameTransition(strandedSession, GameState.START_ZONE, Date.now());
    if (!recovered.success) return;
    void publish(record.sessionId, recovered.state, myToken);
  }, [hasLoadedInitialSession, canMutate, publish]);

  const runInstructionsToPlaying = useCallback(
    async (sessionId: string, instructionsState: FeedAnimalsSessionState, myToken: number) => {
      if (!canMutateRef.current) return;
      const instructionsRevision = await publish(sessionId, instructionsState, myToken);
      if (instructionsRevision === null) return;

      await delayWakeAware(INSTRUCTION_VIEW_MS);
      if (myToken !== sequenceTokenRef.current || !canMutateRef.current) return;
      const countdownResult = applyFeedAnimalsGameTransition(instructionsState, GameState.COUNTDOWN, Date.now());
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
      const playingResult = applyFeedAnimalsGameTransition(countdownResult.state, GameState.PLAYING, Date.now());
      if (!playingResult.success) return;
      await publish(sessionId, playingResult.state, myToken);
    },
    [publish, db],
  );

  const confirmSetup = useCallback(async () => {
    if (!canMutate || !hasLoadedInitialSession) return;
    const childFirstName = draft.childFirstName.trim();
    if (!childFirstName) return;
    const myToken = ++sequenceTokenRef.current;
    // THERAPIST SETUP SIMPLIFICATION — resolve the final config from the
    // same preset source the Stage Cards previewed (task section 15).
    const preset = getFeedAnimalsStagePreset(draft.difficulty, draft.startingStage);
    const newSessionState = createFeedAnimalsSession({ ...preset.config, childFirstName, workflow: sessionWorkflow.metadata });
    const patientId = patientContext.selectedPatient?.patientId ?? null;

    // RELIABILITY FIX — cross-game revision conflict: liveSession is a
    // single global node shared by every game, and its write rule requires
    // a strictly increasing revision. A hardcoded revision: 1 here is only
    // safe when no record exists at all — if a DIFFERENT game's session was
    // left dangling, that record is still at some revision > 1, and this
    // publish would fail PERMISSION_DENIED with no visible feedback to the
    // therapist. Reading the true canonical revision first — regardless of
    // which game it belongs to — keeps the CAS check honest.
    let baseRevision = 0;
    try {
      const canonical = await fetchLiveSession(db);
      if (myToken !== sequenceTokenRef.current) return;
      baseRevision = canonical?.revision ?? 0;
    } catch (error) {
      console.error("[realtime] feed the animals confirmSetup canonical revision fetch failed:", error);
    }
    const nextRevision = baseRevision + 1;

    liveRecordRef.current = {
      gameId: FEED_THE_ANIMALS_GAME_ID,
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
      gameId: FEED_THE_ANIMALS_GAME_ID,
      sessionId: newSessionState.sessionId,
      revision: nextRevision,
      session: newSessionState,
      lastInteraction: null,
      celebrationReplay: null,
      patientId,
    })
      .catch(async (error: unknown) => {
        console.error("[realtime] feed the animals confirmSetup publish failed:", error);
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
    const s = record.session as FeedAnimalsSessionState;
    let result = applyFeedAnimalsGameTransition(s, GameState.SETUP, now);
    result = applyFeedAnimalsGameTransition(result.state, GameState.START_ZONE, now);
    if (!result.success) return;
    void publish(record.sessionId, result.state, myToken);
  }, [canMutate, publish]);

  const confirmChildReady = useCallback(() => {
    const record = liveRecordRef.current;
    if (!canMutate || !record || record.session.gameState !== GameState.START_ZONE) return;
    const myToken = ++sequenceTokenRef.current;
    const now = Date.now();
    const result = applyFeedAnimalsGameTransition(record.session as FeedAnimalsSessionState, GameState.INSTRUCTIONS, now);
    if (!result.success) return;
    void runInstructionsToPlaying(record.sessionId, result.state, myToken);
  }, [canMutate, runInstructionsToPlaying]);

  /**
   * Confirms the therapist's tap for `foodChoiceId` — the CORE gameplay
   * action (task section 25/26). Publishes a `lastInteraction` alongside
   * the session so /display can wiggle the right food on an INCORRECT tap
   * (only the aggregate incorrectCount changes on the session itself, same
   * "no persistent per-choice field to diff" story as Bubble Pop Wall's
   * confirmBubbleSelection — see lib/realtime/types.ts's LiveInteraction
   * doc comment, reused here as-is: its `balloonId` field doubles as the
   * generic "target element id" for any game using this signal, not
   * literally balloon-specific).
   */
  const confirmFoodSelection = useCallback(
    (foodChoiceId: string) => {
      if (confirmFoodInFlightRef.current) return;
      const record = liveRecordRef.current;
      if (!canMutate || !record || record.session.gameState !== GameState.PLAYING) return;
      const myToken = sequenceTokenRef.current;
      const before = record.session as FeedAnimalsSessionState;
      const round = currentRound(before.currentStage);
      const chosenChoice = round?.choices.find((c) => c.id === foodChoiceId);
      const wasCorrect = round !== null && chosenChoice !== undefined && chosenChoice.food === round.correctFood;
      const result = engineConfirmFoodSelection(before, foodChoiceId, Date.now());
      if (!result.success) return;
      const interaction: LiveInteraction = {
        id: `${(record.revision ?? 0) + 1}-${foodChoiceId}`,
        type: wasCorrect ? "CORRECT" : "INCORRECT",
        balloonId: foodChoiceId,
        revision: (record.revision ?? 0) + 1,
        timestamp: Date.now(),
      };
      confirmFoodInFlightRef.current = true;
      void publish(record.sessionId, result.state, myToken, interaction).finally(() => {
        confirmFoodInFlightRef.current = false;
      });
    },
    [canMutate, publish],
  );

  /**
   * SAFARI ANIMAL ADVENTURE PROTOTYPE — the therapist's LEFT/RIGHT tap for a
   * "path" stage, the direct equivalent of confirmFoodSelection above. No
   * LiveInteraction is published for this — unlike a food choice, a
   * direction press is never "correct/incorrect" (a boundary press is just
   * a clamped no-op), and the display already detects every real move by
   * diffing stage.pathProgressStep itself (see
   * FeedAnimalsPathPlayingScene.tsx), so there's nothing this signal would
   * add.
   */
  const advanceMonkey = useCallback(
    (direction: "left" | "right" | "jump") => {
      if (advanceMonkeyInFlightRef.current) return;
      const record = liveRecordRef.current;
      if (!canMutate || !record || record.session.gameState !== GameState.PLAYING) return;
      const myToken = sequenceTokenRef.current;
      const result = engineAdvanceMonkey(record.session as FeedAnimalsSessionState, direction, Date.now());
      if (!result.success) return;
      advanceMonkeyInFlightRef.current = true;
      void publish(record.sessionId, result.state, myToken).finally(() => {
        advanceMonkeyInFlightRef.current = false;
      });
    },
    [canMutate, publish],
  );

  const pauseOrResume = useCallback(() => {
    const record = liveRecordRef.current;
    if (!canMutate || !record || record.session.gameState !== GameState.PLAYING) return;
    const s = record.session as FeedAnimalsSessionState;
    const result = s.currentStage.pausedAt !== null ? engineResumeSession(s, Date.now()) : enginePauseSession(s, Date.now());
    void publish(record.sessionId, result.state, sequenceTokenRef.current);
  }, [canMutate, publish]);

  const restartStage = useCallback(() => {
    const record = liveRecordRef.current;
    if (!canMutate || !record) return;
    const result = engineRestartStage(record.session as FeedAnimalsSessionState, Date.now());
    void publish(record.sessionId, result.state, sequenceTokenRef.current);
  }, [canMutate, publish]);

  const skipStage = useCallback(() => {
    const record = liveRecordRef.current;
    if (!canMutate || !record) return;
    const result = engineSkipStage(record.session as FeedAnimalsSessionState, Date.now());
    void publish(record.sessionId, result.state, sequenceTokenRef.current);
  }, [canMutate, publish]);

  const endSessionEarly = useCallback((selection: EarlyEndSelection) => {
    const record = liveRecordRef.current;
    if (!canMutate || !record) return;
    sequenceTokenRef.current += 1;
    const result = engineEndSession(applyEarlyEndReason(record.session as FeedAnimalsSessionState, selection.reason, selection.customReason), Date.now());
    void publish(record.sessionId, result.state, sequenceTokenRef.current);
  }, [canMutate, publish]);

  const advanceStage = useCallback(
    (decision: FeedAnimalsDifficultyDecision) => {
      const record = liveRecordRef.current;
      if (!canMutate || !record || record.session.gameState !== GameState.STAGE_COMPLETE) return;
      const current = record.session as FeedAnimalsSessionState;
      const target = getStageDecisionTarget(current.currentDifficulty, current.currentStage.stageNumber, decision);
      if (!target) return;
      const { difficulty: targetDifficulty, stageNumber: targetStageNumber } = target;
      // THERAPIST SETUP SIMPLIFICATION (task section 53) — see
      // lib/control/feedanimals/useLocalFeedAnimalsControllerSession.ts's
      // advanceStage for why this is only resolved on an actual difficulty
      // change.
      const presetFields = targetDifficulty === current.currentDifficulty ? undefined : FEED_ANIMALS_DIFFICULTY_DEFAULTS[targetDifficulty];
      const myToken = ++sequenceTokenRef.current;
      const advanced = engineAdvanceStage(current, { difficulty: targetDifficulty, stageNumber: targetStageNumber }, presetFields);
      void publish(record.sessionId, advanced.state, myToken);
    },
    [canMutate, publish],
  );

  const jumpToStage = useCallback(
    (stageNumber: StageNumber) => {
      const record = liveRecordRef.current;
      if (!canMutate || !record) return;
      const myToken = ++sequenceTokenRef.current;
      const result = engineJumpToStage(record.session as FeedAnimalsSessionState, stageNumber, Date.now());
      void publish(record.sessionId, result.state, myToken);
    },
    [canMutate, publish],
  );

  const changeLiveDifficulty = useCallback((difficulty: Difficulty) => {
    const record = liveRecordRef.current;
    if (!canMutate || !record) return;
    const myToken = ++sequenceTokenRef.current;
    const result = engineSwitchDifficulty(record.session as FeedAnimalsSessionState, difficulty, Date.now(), FEED_ANIMALS_DIFFICULTY_DEFAULTS[difficulty]);
    if (result.success) void publish(record.sessionId, result.state, myToken);
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
      gameId: FEED_THE_ANIMALS_GAME_ID,
      sessionId: record.sessionId,
      revision: nextRevision,
      session: record.session,
      lastInteraction: record.lastInteraction,
      celebrationReplay,
      patientId: record.patientId,
    })
      .catch(async (error: unknown) => {
        console.error("[realtime] feed the animals replayCelebration publish failed:", error);
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
    setStartingStage,
    setFoodSize,
    setReachHeight,
    setReachSide,
    setMovementPattern,
    confirmSetup,
    editSetup,
    startLiveSession,
    confirmFoodSelection,
    advanceMonkey,
    pauseOrResume,
    restartStage,
    skipStage,
    endSessionEarly,
    advanceStage,
    jumpToStage,
    changeLiveDifficulty,
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
