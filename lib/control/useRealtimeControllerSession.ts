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
import { BALLOON_QUEST_GAME_ID } from "@/lib/games/registry";
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
import { buildStoredSession } from "@/lib/sessions/buildStoredSession";
import { saveSessionHistoryOnce } from "@/lib/sessions/sessionHistoryRepository";
import type { ControllerPhase, DifficultyDecision, DraftConfig } from "./useLocalControllerSession";
import { DIFFICULTY_DEFAULTS } from "./smartDefaults";

const MAX_NAME_LENGTH = 30;
const INSTRUCTION_VIEW_MS = 3500;
/**
 * BUG FIX ROUND 2 (client report — "ابدأ" stall persisted after tightening
 * this timer's duration): tuning the blind-wait duration was the wrong
 * class of fix. The REAL cause is architectural — two independent
 * countdown authorities: /display paces its own 3-2-1-ابدأ! against real
 * Mariam playback (see CountdownScene's TICK_DURATION_MS doc comment),
 * while THIS device blindly slept a fixed duration before publishing
 * PLAYING, with no idea whether the display's real countdown had actually
 * finished. No fixed duration can ever match that correctly — either it's
 * too short (cuts the countdown off early) or too long (the "ابدأ" stall
 * this bug report is about), and which one happens varies with real
 * network/TTS latency per tick, which is why "sometimes."
 *
 * THE FIX: runInstructionsToPlaying below now WAITS for /display to report
 * (via waitForDisplayCountdownComplete — a presence/display signal, see
 * sessionRepository.ts) that ITS OWN countdown for this exact
 * (sessionId, revision) has genuinely finished, and publishes PLAYING the
 * instant that arrives — "the child-facing countdown finishes naturally,
 * then canonical state becomes PLAYING immediately," per spec. This
 * constant is now ONLY a safety fallback for a lost/delayed signal (display
 * disconnected, browser never fired the speech-end callback, etc.) — sized
 * back to the full worst-case ceiling (every tick's SAFETY_TIMEOUT, see
 * CountdownScene's TICK_DURATION_MS) since it's no longer the normal path
 * and no longer needs to be tight.
 */
const COUNTDOWN_SAFETY_TIMEOUT_MS = TICKS.length * TICK_DURATION_MS;
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

/**
 * BUG FIX (client report — "sometimes clicking the screen makes it
 * continue"): a plain setTimeout can be throttled or fully suspended by the
 * browser/OS while this tab is backgrounded or the therapist's device
 * screen locks — exactly what standing by, not touching the iPad, during a
 * multi-second countdown wait invites. A suspended timer only resumes once
 * the tab wakes, which happens to line up exactly with "the therapist taps
 * the screen." This still can't stop the OS from suspending a locked tab
 * (nothing in JS can), but it means the FIRST thing that happens on waking
 * is an immediate check against wall-clock elapsed time — not waiting for a
 * fresh, possibly-also-throttled timer to catch up on top of that.
 */
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
 * STAFF AUTHENTICATION FOUNDATION: nothing here touches RTDB until
 * useStaffAuth() resolves to "authorized" (a real Firebase email/password
 * account AND an active /staff record — see useStaffAuth.ts). Firebase
 * Client -> Staff Auth Bootstrap (lib/realtime/staffAuthClient.ts) -> here.
 * components/control/auth/StaffAuthGate.tsx (wired in at the /control
 * layout level) already guarantees this hook never even MOUNTS before that
 * — the gating below is deliberately kept anyway so this hook stays
 * correct in isolation. The controller lease's ownerId is the
 * authenticated staff UID (stable across that person's own sessions, not a
 * fresh anonymous id per tab), and Security Rules enforce that a non-stale
 * lease can only be refreshed/released by its own UID, AND that only an
 * active staff UID may write it at all (see database.rules.json).
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
 * is TICKS.length * TICK_TYPICAL_MS (see that constant's doc comment).
 *
 * TASK 8.2 — START_ZONE GATE: this timed sequence (runInstructionsToPlaying)
 * no longer starts automatically after WELCOME or STAGE_COMPLETE. Both now
 * stop at START_ZONE and wait — there is no camera/floor sensor, so only an
 * explicit therapist tap (confirmChildReady, "الطفل جاهز") can start it.
 * See lib/game/stateMachine.ts for the state machine change and the Task
 * 8.2 report for the full therapist workflow.
 *
 * TASK 8.1 (revised — see TICK_TYPICAL_MS): CountdownScene's countdown is
 * paced against Mariam's actual audio playback on the display device, not a
 * fixed timer — this hook has no way to know when that real playback
 * finishes (it runs on a different device, and no completion round-trip
 * exists between them without a Firebase schema change, out of scope here).
 * COUNTDOWN_TOTAL_MS is now a realistic-typical estimate of the display's
 * real countdown duration, not the old worst-case-ceiling-times-4 — it can
 * still occasionally fire a little before a genuinely slow tick's audio has
 * finished (an accepted, bounded trade-off — see TICK_TYPICAL_MS), which is
 * far better for the child than the guaranteed multi-second freeze on
 * "ابدأ!" the old worst-case bound produced every single time.
 */
export function useRealtimeControllerSession() {
  const auth = useStaffAuth();
  const uid = auth.uid;
  const patientContext = usePatientContext();
  // AUTH ISOLATION HARDENING: this hook is /control's realtime adapter, so
  // every Firebase call it makes goes through the STAFF app's Database
  // connection (see firebaseClient.ts's getStaffDb() doc comment) — a
  // module-level singleton, referentially stable across renders, safe to
  // read on every render and pass into useCallback/useEffect dep arrays.
  const db = getStaffDb();

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
  // RELIABILITY FIX — FAILED-WRITE RESYNC: timestamp of the most recent
  // time a mutating write actually failed and local state was resynced
  // from Firebase's true canonical value (see publish()/confirmSetup()/
  // replayCelebration() below) — null until the first one, ever. Purely
  // informational: ConnectionBadge shows a brief, unobtrusive "تمت استعادة
  // الحالة" notice off of this, then reverts to the normal connection
  // label on its own. Never a raw error, never a modal.
  const [syncRestoredAt, setSyncRestoredAt] = useState<number | null>(null);

  // Bumped by any mutating action; a still-running timed sequence (see
  // runInstructionsToPlaying below) checks this before each of its later
  // publishes and aborts silently if something else has superseded it
  // (e.g. the therapist ended the session mid-countdown-wait).
  const sequenceTokenRef = useRef(0);

  useEffect(() => {
    if (auth.phase !== "authorized") return;
    const unsubscribeSession = subscribeToLiveSession(db, (record) => {
      setLiveRecord(record);
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
      // RELIABILITY FIX: losing this race (another device claimed it first,
      // or a momentary reconnect-window PERMISSION_DENIED) is an expected,
      // non-fatal outcome — this must never throw — but it was previously
      // silently swallowed with zero visibility. Logged now, still a no-op.
      void claimControllerLease(db, uid).catch((error: unknown) => console.error("[realtime] claimControllerLease failed:", error));
    }
  }, [lease, leaseKnown, uid, db]);

  // Heartbeat while this client holds the lease.
  useEffect(() => {
    if (!uid || lease?.ownerId !== uid) return;
    const interval = setInterval(
      () =>
        void refreshControllerLease(db).catch((error: unknown) => console.error("[realtime] refreshControllerLease heartbeat failed:", error)),
      LEASE_HEARTBEAT_MS,
    );
    return () => clearInterval(interval);
  }, [lease, uid, db]);

  // RELIABILITY FIX — `lease` starts `null` and stays `null` until the
  // subscription's first callback fires, which is indistinguishable from a
  // genuinely-unowned lease unless this also checks `leaseKnown` (same flag
  // the auto-claim effect above already gates on for exactly this reason).
  // Without it, a fresh controller mount briefly computed isOwner (and
  // therefore canMutate) as true even while another device already held a
  // valid, non-stale lease — Security Rules never enforce lease ownership on
  // `liveSession` itself (only on `controllerLease`), so a write issued in
  // that window would actually succeed server-side, not just render wrong.
  const isOwner = uid !== null && leaseKnown && (lease === null || lease.ownerId === uid);
  // The real, all-up gate every mutating action requires: recognized as
  // owner AND the socket is actually up right now. See the report's
  // "Offline-action behavior" section — this is deliberately stricter than
  // Task 7's isOwner-only gate.
  const canMutate = isOwner && connectionStatus === "connected";
  // RELIABILITY FIX — see runInstructionsToPlaying below: that sequence
  // spans several real seconds (INSTRUCTION_VIEW_MS + the countdown wait),
  // during which `canMutate` is a plain render-time `const` a long-running
  // async closure can't see update — this ref is what lets it re-check the
  // LATEST connectivity/ownership state at each step instead of only the
  // snapshot from when the sequence started.
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

  const session = liveRecord?.session ?? null;
  const phase = derivePhase(session);

  // SESSION HISTORY TASK — persists a completed session under its patient
  // EXACTLY ONCE (task section 4). `liveRecord.patientId` (not the live,
  // reactive patientContext) is the source of truth for which patient this
  // SPECIFIC session belongs to — it was pinned once at confirmSetup() and
  // carried forward unchanged by every publish() since (see
  // LiveSessionRecord.patientId's doc comment), so this is immune to the
  // therapist clearing/changing patient context mid-session. `null` means a
  // walk-in/manual session — never saved, per the task's "DO NOT
  // accidentally create permanent patient history."
  //
  // savedSessionIdsRef is a same-mount optimization only (skips a redundant
  // network round trip when this effect re-fires — a re-render, a Firebase
  // reconnect, a celebration replay, StrictMode's dev double-invoke). The
  // REAL exactly-once guarantee is server-side: saveSessionHistoryOnce's
  // `!data.exists()` Security Rule (database.rules.json) makes a second
  // write for the same sessionId impossible even across a page refresh or a
  // second controller tab taking over — see that function's doc comment.
  const savedSessionIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!session || session.gameState !== GameState.SESSION_COMPLETE || !session.summary) return;
    if (auth.phase !== "authorized" || !uid) return;
    const patientId = liveRecord?.patientId ?? null;
    if (!patientId) return; // walk-in/manual session — never saved

    const sessionId = session.sessionId;
    if (savedSessionIdsRef.current.has(sessionId)) return;
    savedSessionIdsRef.current.add(sessionId);

    const record = buildStoredSession({ session, patientId, createdByUid: uid, gameId: BALLOON_QUEST_GAME_ID });
    void saveSessionHistoryOnce(patientId, record).catch((error: unknown) => {
      console.error(`[realtime] session history save failed for ${sessionId}:`, error);
      savedSessionIdsRef.current.delete(sessionId); // allow a retry on the next relevant re-render
    });
  }, [session, liveRecord, auth.phase, uid]);

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
   * RELIABILITY FIX — FAILED-WRITE RESYNC. A rejected/failed publishSession()
   * call means the server never accepted the local optimistic update this
   * hook had already applied to liveRecordRef/liveRecord — but unlike a
   * SUCCESSFUL write, a failure never produces a new onValue delivery
   * either (nothing on the server actually changed), so nothing would
   * otherwise correct the now-false local state: CONTROL could keep
   * showing a score bump, a stage advance, or a pause the projector never
   * received and never will. This re-fetches Firebase's actual current
   * value (fetchLiveSession — a one-shot get(), not a stale closure/ref)
   * and replaces local state with it outright — never a partial patch,
   * never a revision decrement computed locally, so this can't produce a
   * revision that collides with or rolls back the server's own counter.
   *
   * Guarded by `myToken` on BOTH sides of the fetch: if a NEWER action
   * already superseded this one (bumped sequenceTokenRef) either before or
   * during the fetch, this is a no-op — that newer action already applied
   * its own optimistic state and owns its own success/failure handling, so
   * an in-flight resync from an OLDER failure must never stomp it. This is
   * what keeps the fix from ever fighting a fast follow-up action or
   * flickering between two different "truths."
   */
  const resyncFromCanonical = useCallback(
    async (myToken: number) => {
      if (myToken !== sequenceTokenRef.current) return;
      try {
        const canonical = await fetchLiveSession(db);
        if (myToken !== sequenceTokenRef.current) return; // superseded while the fetch itself was in flight
        liveRecordRef.current = canonical;
        setLiveRecord(canonical);
        setSyncRestoredAt(Date.now());
      } catch (fetchError) {
        // Best-effort: if even the resync fetch fails (still offline), local
        // state stays as-is — the next successful onValue delivery, once
        // connectivity actually returns, is still the ultimate source of
        // truth. Logged, not swallowed silently.
        console.error("[realtime] resync-from-canonical fetch failed:", fetchError);
      }
    },
    [db],
  );

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
   *
   * Returns the revision it published at, or `null` if it either bailed
   * out early (already superseded) OR the write genuinely failed — see
   * resyncFromCanonical above. Callers that chain off this return value
   * (runInstructionsToPlaying's countdown/playing steps) already treat
   * `null` as "stop, don't continue the sequence" — previously this
   * returned nextRevision even after a caught failure, which is exactly
   * how a failed COUNTDOWN publish could still go on to wait for a display
   * signal for a revision the display never actually received, then
   * publish PLAYING right after, compounding the divergence.
   */
  const publish = useCallback(
    async (sessionId: string, nextSession: SessionState, lastInteraction: LiveInteraction | null, myToken: number): Promise<number | null> => {
      if (myToken !== sequenceTokenRef.current) return null;
      const nextRevision = (liveRecordRef.current?.revision ?? 0) + 1;
      // TASK 9: ordinary actions never touch celebrationReplay — carry the
      // last-known value forward locally, and simply omit it from the
      // actual publishSession() call below so the server-side merge leaves
      // whatever's really there untouched (see publishSession's doc comment).
      const celebrationReplay = liveRecordRef.current?.celebrationReplay ?? null;
      // SESSION HISTORY TASK: carried forward unchanged from whatever
      // confirmSetup() stamped this session with at creation — see
      // LiveSessionRecord.patientId's doc comment. Every ordinary action
      // (a balloon tap, a stage advance, ...) must republish the SAME
      // patientId, never recompute it from the live patientContext.
      const patientId = liveRecordRef.current?.patientId ?? null;
      liveRecordRef.current = {
        gameId: BALLOON_QUEST_GAME_ID,
        sessionId,
        revision: nextRevision,
        session: nextSession,
        lastInteraction,
        celebrationReplay,
        patientId,
        updatedAt: Date.now(),
      };
      setUnconfirmedActionCount((n) => n + 1);
      try {
        await publishSession(db, { gameId: BALLOON_QUEST_GAME_ID, sessionId, revision: nextRevision, session: nextSession, lastInteraction, patientId });
        return nextRevision;
      } catch (error) {
        console.error(`[realtime] publishSession failed for revision ${nextRevision} (${nextSession.gameState}):`, error);
        await resyncFromCanonical(myToken);
        return null;
      } finally {
        setUnconfirmedActionCount((n) => Math.max(0, n - 1));
      }
    },
    [db, resyncFromCanonical],
  );

  /**
   * RELIABILITY FIX — this sequence spans several REAL seconds
   * (INSTRUCTION_VIEW_MS, then the countdown wait), which is exactly the
   * kind of window `delayWakeAware` already documents as vulnerable to the
   * device's screen locking or the tab being backgrounded. Unlike every
   * OTHER mutating action in this hook (selectBalloon, pauseOrResume,
   * restartStage, skipStage, ...), which all re-check `canMutate`
   * immediately before their own single publish, this multi-step sequence
   * previously checked ownership/connectivity ONCE, in confirmChildReady,
   * before the sequence even started — then blindly published three more
   * times over many seconds with no re-check. If the device was backgrounded
   * for that window (see the report's "Database is closing/hidden"
   * investigation for confirmed evidence this happens in practice) and the
   * realtime connection dropped, the PLAYING publish could fire against a
   * connection this client already knows is stale, exactly matching the
   * observed `PERMISSION_DENIED` failure mode. Each step now re-checks
   * `canMutateRef.current` (a ref, not the render-time `canMutate` const, so
   * it reflects state as of THIS moment, not whenever the sequence began)
   * and bails out cleanly rather than attempting a write it already knows
   * is unsafe.
   */
  const runInstructionsToPlaying = useCallback(
    async (sessionId: string, instructionsState: SessionState, myToken: number) => {
      if (!canMutateRef.current) return;
      // RELIABILITY FIX: a failed INSTRUCTIONS publish (null) must abort the
      // whole sequence too — continuing on to COUNTDOWN would build the next
      // state on top of a step /display never actually received.
      const instructionsRevision = await publish(sessionId, instructionsState, null, myToken);
      if (instructionsRevision === null) return;

      await delayWakeAware(INSTRUCTION_VIEW_MS);
      if (myToken !== sequenceTokenRef.current || !canMutateRef.current) return;
      const countdownResult = applyGameTransition(instructionsState, GameState.COUNTDOWN, Date.now());
      if (!countdownResult.success) return;
      const countdownRevision = await publish(sessionId, countdownResult.state, null, myToken);
      // null covers BOTH "superseded before this even published" and "the
      // write genuinely failed" (see publish()'s resyncFromCanonical) —
      // either way there is no real COUNTDOWN revision on the server for
      // /display to have seen, so waiting for its completion signal or
      // publishing PLAYING next would only compound the divergence.
      if (countdownRevision === null) return;

      // BUG FIX: wait for /display's own real "ابدأ" completion signal for
      // THIS exact (sessionId, countdownRevision) — falling back to the
      // safety timeout only if it never arrives (display disconnected, lost
      // packet, browser never fired the speech-end callback). See
      // COUNTDOWN_SAFETY_TIMEOUT_MS's doc comment.
      const countdownSignal = waitForDisplayCountdownComplete(db, sessionId, countdownRevision);
      try {
        await Promise.race([countdownSignal.promise, delayWakeAware(COUNTDOWN_SAFETY_TIMEOUT_MS)]);
      } finally {
        countdownSignal.cancel();
      }
      if (myToken !== sequenceTokenRef.current || !canMutateRef.current) return;
      const playingResult = applyGameTransition(countdownResult.state, GameState.PLAYING, Date.now());
      if (!playingResult.success) return;
      await publish(sessionId, playingResult.state, null, myToken);
    },
    [publish, db],
  );

  const confirmSetup = useCallback(() => {
    // Refuse to act until we've heard from Firebase at least once — acting
    // on an unconfirmed "no session" could silently overwrite a session
    // still in progress. Also refuses while offline (see canMutate).
    if (!canMutate || !hasLoadedInitialSession) return;
    const childFirstName = draft.childFirstName.trim();
    if (!childFirstName) return;
    const myToken = ++sequenceTokenRef.current;
    const newSession = createSession({ ...draft, childFirstName });
    // SESSION HISTORY TASK: stamped ONCE, here, at session creation — the
    // saved patient active in this tab RIGHT NOW (or null for a genuine
    // walk-in/manual session), never re-read later. See
    // LiveSessionRecord.patientId's doc comment for why every later
    // publish() carries this same value forward instead of re-deriving it.
    const patientId = patientContext.selectedPatient?.patientId ?? null;
    // Fresh session: revision restarts at 1, set synchronously (see publish() for why). celebrationReplay explicitly cleared — a brand-new session never inherits a stale replay token.
    // MULTI-GAME PLATFORM: this controller only ever exists at /control/balloon-quest
    // (see the Game Library task) — stamping gameId here, once, is what lets
    // /display's game resolver know which child-facing module to mount, with
    // no extra "pick the game again" step for the therapist (see task #9).
    liveRecordRef.current = {
      gameId: BALLOON_QUEST_GAME_ID,
      sessionId: newSession.sessionId,
      revision: 1,
      session: newSession,
      lastInteraction: null,
      celebrationReplay: null,
      patientId,
      updatedAt: Date.now(),
    };
    setUnconfirmedActionCount((n) => n + 1);
    void publishSession(db, {
      gameId: BALLOON_QUEST_GAME_ID,
      sessionId: newSession.sessionId,
      revision: 1,
      session: newSession,
      lastInteraction: null,
      celebrationReplay: null,
      patientId,
    })
      .catch(async (error: unknown) => {
        console.error("[realtime] confirmSetup publish failed:", error);
        // RELIABILITY FIX: same resync-from-canonical as publish() — a
        // failed session-creation write must not leave the controller
        // showing a brand-new session /display never received.
        await resyncFromCanonical(myToken);
      })
      .finally(() => setUnconfirmedActionCount((n) => Math.max(0, n - 1)));
  }, [draft, canMutate, hasLoadedInitialSession, patientContext.selectedPatient, db, resyncFromCanonical]);

  /** Back to SETUP — clears the whole live session rather than just a local field, so no half-configured session lingers in Firebase for /display to see. */
  const editSetup = useCallback(() => {
    if (!canMutate) return;
    sequenceTokenRef.current += 1;
    void clearLiveSession(db);
  }, [canMutate, db]);

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

  /**
   * Full reset: clears Firebase (so /display returns to its waiting state)
   * and the local draft (so no field from the previous child survives).
   *
   * SESSION HISTORY TASK — "the previous patient must not accidentally
   * receive another child's results" (task section 6): also clears the
   * patient context here. This is the ONLY way back from a finished
   * session (SESSION_COMPLETE/SUMMARY) to a fresh SETUP screen (see
   * ControlScreen.tsx's SessionSummaryScreen -> onNewSession), so it's the
   * one place that guarantees a next session — walk-in or a different
   * saved patient — never silently inherits a stale patientId. The
   * session that JUST ended already has its own patientId permanently
   * pinned on its liveSession record (see confirmSetup/publish), so
   * clearing the context here can never affect what already got saved.
   */
  const newSession = useCallback(() => {
    if (!canMutate) return;
    sequenceTokenRef.current += 1;
    liveRecordRef.current = null;
    void clearLiveSession(db);
    setDraft(freshDraft());
    patientContext.clearPatient();
  }, [canMutate, patientContext, db]);

  /**
   * CONTROL UX POLISH TASK — "جلسة أخرى لنفس المريض" (task section 14): the
   * SAME full reset as newSession() (clears the finished liveSession,
   * resets the local draft) EXCEPT it deliberately does NOT clear the
   * patient context — see task section 15: "Do NOT clear patient context
   * BEFORE the therapist chooses their next action if doing so would break
   * ... جلسة أخرى لنفس المريض... Do not risk duplicate session saves." The
   * session that just ended already has its own patientId permanently
   * pinned on ITS OWN liveSession record (stamped once at confirmSetup,
   * long since saved to /sessions by the time the therapist is looking at
   * the summary — see the exactly-once save effect below), so leaving the
   * context alone here can never cause a duplicate save or misattribute
   * anything: the NEXT session confirmSetup() creates simply reads
   * whatever patientContext.selectedPatient still holds at that point,
   * exactly like starting fresh from the Patient Profile would.
   */
  const startAnotherSessionForSamePatient = useCallback(() => {
    if (!canMutate) return;
    sequenceTokenRef.current += 1;
    liveRecordRef.current = null;
    void clearLiveSession(db);
    setDraft(freshDraft());
  }, [canMutate, db]);

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
    const myToken = sequenceTokenRef.current;
    const nextRevision = record.revision + 1;
    const token = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const celebrationReplay = { token, timestamp: Date.now() };
    liveRecordRef.current = { ...record, revision: nextRevision, celebrationReplay, updatedAt: Date.now() };
    setUnconfirmedActionCount((n) => n + 1);
    void publishSession(db, {
      gameId: BALLOON_QUEST_GAME_ID,
      sessionId: record.sessionId,
      revision: nextRevision,
      session: record.session,
      lastInteraction: record.lastInteraction,
      celebrationReplay,
      patientId: record.patientId,
    })
      .catch(async (error: unknown) => {
        console.error("[realtime] replayCelebration publish failed:", error);
        // RELIABILITY FIX: same resync-from-canonical pattern — a failed
        // celebration-replay write is presentation-only, but it still
        // bumped the local revision optimistically, so it still needs to
        // resync rather than leave a phantom revision behind.
        await resyncFromCanonical(myToken);
      })
      .finally(() => setUnconfirmedActionCount((n) => Math.max(0, n - 1)));
  }, [canMutate, db, resyncFromCanonical]);

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
    // CONTROL UX POLISH TASK additions — see startAnotherSessionForSamePatient's
    // doc comment. sessionPatientId is the CURRENT liveSession's own pinned
    // patientId (null for a walk-in) — SessionSummaryScreen uses this, not
    // the live patientContext, to decide which next-action set to show.
    startAnotherSessionForSamePatient,
    sessionPatientId: liveRecord?.patientId ?? null,
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
    // RELIABILITY FIX — FAILED-WRITE RESYNC: see resyncFromCanonical's doc
    // comment. ConnectionBadge shows a brief "تمت استعادة الحالة" notice
    // off of this, then reverts on its own.
    syncRestoredAt,
    // STAFF AUTHENTICATION FOUNDATION: StaffAuthGate (see app/control/layout.tsx)
    // already guarantees this is "authorized" by the time this hook is even
    // mounted — ControlScreen.tsx keeps a brief fallback anyway, for the
    // rare single-tick window before this hook's OWN useStaffAuth() call
    // catches up (see this hook's doc comment).
    authPhase: auth.phase,
  };
}
