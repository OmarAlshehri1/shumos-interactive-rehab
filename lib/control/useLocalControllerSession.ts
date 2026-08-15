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
import { DIFFICULTY_DEFAULTS } from "./smartDefaults";

/** The therapist's post-STAGE_COMPLETE decision — see components/control/live/StageCompleteOverlay.tsx. */
export type DifficultyDecision = "continue" | "easier" | "harder";

export interface DraftConfig {
  childFirstName: string;
  difficulty: Difficulty;
  targetSize: TargetSize;
  targetSpacing: TargetSpacing;
  playArea: PlayArea;
  /** TASK 12: manually chosen on the setup screen — "this child reached Medium 3 last time." Resets to 1 whenever difficulty changes. See SessionConfig.startingStage. */
  startingStage: StageNumber;
}

/** The therapist-facing workflow stage. Deliberately coarser than lib/game's GameState — see report. */
export type ControllerPhase = "SETUP" | "READY" | "LIVE" | "SUMMARY";

const MAX_NAME_LENGTH = 30;

function freshDraft(): DraftConfig {
  return { childFirstName: "", difficulty: Difficulty.EASY, startingStage: 1, ...DIFFICULTY_DEFAULTS[Difficulty.EASY] };
}

function derivePhase(session: SessionState | null): ControllerPhase {
  if (!session) return "SETUP";
  if (session.gameState === GameState.SESSION_COMPLETE) return "SUMMARY";
  if (session.gameState === GameState.WELCOME) return "READY";
  return "LIVE"; // internal SETUP/INSTRUCTIONS/COUNTDOWN/PLAYING/STAGE_COMPLETE all render as one LIVE screen
}

/**
 * TASK 5 LOCAL CONTROLLER ADAPTER.
 *
 * Firebase and /display synchronization don't exist yet (Task 6), so this
 * hook owns its own SessionState in React state — same approved lib/game
 * engine, same "call a pure action function, setSession the result" pattern
 * as lib/demo/useLocalDemoSession.ts uses for /display. /control and
 * /display each run a fully independent local session in Task 5; nothing
 * here talks to the other, and nothing here touches localStorage,
 * BroadcastChannel, or any other cross-tab channel — that's explicitly out
 * of scope until Task 6.
 *
 * When realtime sync arrives, this file is what gets replaced by a
 * Firebase-driven adapter with the same shape (phase/draft/session +
 * actions) — nothing in components/control/ should need to change, and
 * nothing in lib/game/ was touched to build this.
 */
export function useLocalControllerSession() {
  const [draft, setDraft] = useState<DraftConfig>(freshDraft);
  const [session, setSession] = useState<SessionState | null>(null);
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const phase = derivePhase(session);

  const setChildName = useCallback((value: string) => {
    setDraft((d) => ({ ...d, childFirstName: value.slice(0, MAX_NAME_LENGTH) }));
  }, []);

  const setDifficulty = useCallback((difficulty: Difficulty) => {
    // Re-applies that difficulty's smart defaults from scratch — see lib/control/smartDefaults.ts.
    // TASK 12: also resets startingStage to 1 — a stage-5 pick under the previous difficulty shouldn't silently carry over to a different one.
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

  const confirmSetup = useCallback(() => {
    const childFirstName = draft.childFirstName.trim();
    if (!childFirstName) return;
    setSession(createSession({ ...draft, childFirstName }));
  }, [draft]);

  /** Back to SETUP from READY. Keeps the therapist's entered values — "edit", not "discard". */
  const editSetup = useCallback(() => {
    setSession(null);
  }, []);

  /**
   * TASK 8.2: WELCOME -> SETUP -> START_ZONE only, then stops — the
   * therapist must confirm the child is standing in the Start Zone
   * (confirmChildReady below) before anything else happens, exactly like
   * the realtime adapter. No camera/floor sensor exists, so nothing here
   * can skip this confirmation.
   */
  const startLiveSession = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.gameState !== GameState.WELCOME) return;
    const now = Date.now();
    let result = applyGameTransition(s, GameState.SETUP, now);
    result = applyGameTransition(result.state, GameState.START_ZONE, now);
    setSession(result.state);
  }, []);

  /**
   * TASK 8.2: the therapist's "الطفل جاهز" confirmation — the only way out
   * of START_ZONE. /control has no separate instructions/countdown screen
   * of its own (those are child-facing beats that belong to /display), so
   * this still collapses START_ZONE -> ... -> PLAYING in one hop, same
   * "/control has no child-facing beats" reasoning as before Task 8.2 —
   * see report.
   */
  const confirmChildReady = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.gameState !== GameState.START_ZONE) return;
    const now = Date.now();
    let result = applyGameTransition(s, GameState.INSTRUCTIONS, now);
    result = applyGameTransition(result.state, GameState.COUNTDOWN, now);
    result = applyGameTransition(result.state, GameState.PLAYING, now);
    setSession(result.state);
  }, []);

  /**
   * Resolves a therapist tap. Returns whether it was a correct target
   * (computed from the pre-tap balloon's isTarget before dispatching to the
   * engine) so the UI can give the therapist immediate touch feedback;
   * returns null for a no-op tap (already popped / unknown id / not
   * currently PLAYING).
   */
  const selectBalloon = useCallback((balloonId: string): boolean | null => {
    const s = sessionRef.current;
    if (!s || s.gameState !== GameState.PLAYING) return null;
    const stage = s.currentStage;
    const balloon = stage.balloons.find((b: { id: string }) => b.id === balloonId);
    if (!balloon || balloon.isPopped) return null;
    const wasCorrect = balloon.isTarget;
    const result = engineSelectBalloon(s, balloonId, Date.now());
    setSession(result.state);
    return wasCorrect;
  }, []);

  const pauseOrResume = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.gameState !== GameState.PLAYING) return;
    const stage = s.currentStage;
    const result = stage.pausedAt !== null ? engineResumeSession(s, Date.now()) : enginePauseSession(s, Date.now());
    setSession(result.state);
  }, []);

  const restartStage = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    setSession(engineRestartStage(s, Date.now()).state);
  }, []);

  const skipStage = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    setSession(engineSkipStage(s, Date.now()).state);
  }, []);

  const endSessionEarly = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    setSession(engineEndSession(s, Date.now()).state);
  }, []);

  /**
   * TASK 11: the therapist's post-STAGE_COMPLETE decision — "continue" (same
   * difficulty, next stage number), or step to the adjacent easier/harder
   * difficulty at the SAME stage number (see lib/game/session.ts's
   * advanceToStage doc comment). Always lands on START_ZONE (return-to-start),
   * never straight back into PLAYING — confirmChildReady is what continues
   * it from there.
   */
  const advanceStage = useCallback((decision: DifficultyDecision) => {
    const s = sessionRef.current;
    if (!s || s.gameState !== GameState.STAGE_COMPLETE) return;
    const targetDifficulty = decision === "continue" ? s.currentDifficulty : getAdjacentDifficulty(s.currentDifficulty, decision);
    if (!targetDifficulty) return;
    const targetStageNumber = decision === "continue" ? ((s.currentStage.stageNumber + 1) as StageNumber) : s.currentStage.stageNumber;
    const advanced = engineAdvanceToStage(s, { difficulty: targetDifficulty, stageNumber: targetStageNumber });
    setSession(advanced.state);
  }, []);

  /** TASK 11: the therapist stage strip's forward jump — see components/control/live/StageStrip.tsx. */
  const jumpToStage = useCallback((stageNumber: StageNumber) => {
    const s = sessionRef.current;
    if (!s) return;
    setSession(engineJumpToStage(s, stageNumber, Date.now()).state);
  }, []);

  /** Full reset: clears the session AND the draft, so no field from the previous child survives. See session-isolation verification in the report. */
  const newSession = useCallback(() => {
    setSession(null);
    setDraft(freshDraft());
  }, []);

  /**
   * TASK 9: a no-op here on purpose — this local adapter exists only for
   * testing /control in isolation with no Firebase and no /display
   * counterpart to actually replay anything to (see this file's own class
   * doc comment). The realtime adapter's replayCelebration is the real
   * implementation.
   */
  const replayCelebration = useCallback(() => {}, []);

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
    confirmChildReady,
    replayCelebration,
  };
}
