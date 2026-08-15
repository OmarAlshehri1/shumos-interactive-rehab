"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GameState,
  advanceToStage as engineAdvanceToStage,
  applyGameTransition,
  createSession,
  endSession as engineEndSession,
  pauseSession as enginePauseSession,
  restartStage as engineRestartStage,
  resumeSession as engineResumeSession,
  selectBalloon as engineSelectBalloon,
  skipStage as engineSkipStage,
  type SessionState,
  type StageNumber,
} from "@/lib/game";
import { DEV_SESSION_PARAMS } from "./devSessionParams";

/**
 * TASK 3 LOCAL DEMO ONLY.
 *
 * Firebase and /control don't exist yet, so nothing can drive /display's
 * session for real. This hook is the stand-in: it owns a SessionState in
 * React state, calls the approved lib/game engine's pure action functions
 * to advance it, and adds a small set of keyboard shortcuts so the full
 * WELCOME -> ... -> SESSION_COMPLETE sequence can be inspected without a
 * therapist iPad.
 *
 * When realtime sync arrives, this whole file is what gets replaced by a
 * Firebase-driven adapter with the same shape (a SessionState plus actions)
 * — nothing in components/display/ should need to change, and nothing in
 * lib/game/ was touched to build this.
 *
 * Keyboard shortcuts (this demo only, never shown on the projected output):
 *   Space / Enter — advance (WELCOME -> START_ZONE, START_ZONE -> INSTRUCTIONS
 *                   [stands in for the therapist's "الطفل جاهز" tap — Task 8.2],
 *                   INSTRUCTIONS -> COUNTDOWN, skip the STAGE_COMPLETE celebration
 *                   wait [which itself now lands back on START_ZONE], restart
 *                   after SESSION_COMPLETE)
 *   R             — restart the current stage (while PLAYING)
 *   S             — skip the current stage (while PLAYING)
 *   P             — pause/resume (while PLAYING)
 *   E             — end the session early
 */
export function useLocalDemoSession() {
  const [session, setSession] = useState<SessionState>(() => createSession(DEV_SESSION_PARAMS));
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const selectBalloon = useCallback((balloonId: string) => {
    const result = engineSelectBalloon(sessionRef.current, balloonId, Date.now());
    setSession(result.state);
  }, []);

  /** TASK 8.2: WELCOME -> SETUP -> START_ZONE now, not straight to INSTRUCTIONS — see confirmChildReady below for the next step. */
  const enterStartZone = useCallback(() => {
    const s = sessionRef.current;
    const now = Date.now();
    if (s.gameState === GameState.WELCOME) {
      const afterSetup = applyGameTransition(s, GameState.SETUP, now);
      const afterStartZone = applyGameTransition(afterSetup.state, GameState.START_ZONE, now);
      setSession(afterStartZone.state);
    }
  }, []);

  /** TASK 8.2: the only way out of START_ZONE — stands in for the therapist's "الطفل جاهز" tap in this single-device keyboard demo. */
  const confirmChildReady = useCallback(() => {
    const s = sessionRef.current;
    if (s.gameState !== GameState.START_ZONE) return;
    const result = applyGameTransition(s, GameState.INSTRUCTIONS, Date.now());
    setSession(result.state);
  }, []);

  const enterCountdown = useCallback(() => {
    const result = applyGameTransition(sessionRef.current, GameState.COUNTDOWN, Date.now());
    setSession(result.state);
  }, []);

  const enterPlaying = useCallback(() => {
    const result = applyGameTransition(sessionRef.current, GameState.PLAYING, Date.now());
    setSession(result.state);
  }, []);

  /** TASK 11: this single-device keyboard demo only ever "continues" (same difficulty, next stage number) — the easier/harder decision is a therapist-facing /control affordance, not part of this dev demo's keyboard shortcuts. */
  const advanceAfterStageComplete = useCallback(() => {
    const s = sessionRef.current;
    const target = { difficulty: s.currentDifficulty, stageNumber: (s.currentStage.stageNumber + 1) as StageNumber };
    const result = engineAdvanceToStage(s, target);
    setSession(result.state);
  }, []);

  const restartStage = useCallback(() => {
    const result = engineRestartStage(sessionRef.current, Date.now());
    setSession(result.state);
  }, []);

  const skipStage = useCallback(() => {
    const result = engineSkipStage(sessionRef.current, Date.now());
    setSession(result.state);
  }, []);

  const pauseOrResume = useCallback(() => {
    const s = sessionRef.current;
    const stage = s.currentStage;
    const result = stage.pausedAt !== null ? engineResumeSession(s, Date.now()) : enginePauseSession(s, Date.now());
    setSession(result.state);
  }, []);

  const endSession = useCallback(() => {
    const result = engineEndSession(sessionRef.current, Date.now());
    setSession(result.state);
  }, []);

  const resetDemo = useCallback(() => {
    setSession(createSession(DEV_SESSION_PARAMS));
  }, []);

  /** Context-aware "move forward" for the states that need a manual nudge in this demo. */
  const advance = useCallback(() => {
    const s = sessionRef.current;
    switch (s.gameState) {
      case GameState.WELCOME:
        enterStartZone();
        return;
      case GameState.START_ZONE:
        confirmChildReady();
        return;
      case GameState.INSTRUCTIONS:
        enterCountdown();
        return;
      case GameState.STAGE_COMPLETE:
        advanceAfterStageComplete();
        return;
      case GameState.SESSION_COMPLETE:
        resetDemo();
        return;
      default:
      // COUNTDOWN and PLAYING advance on their own (timer / balloon selection).
    }
  }, [advanceAfterStageComplete, confirmChildReady, enterCountdown, enterStartZone, resetDemo]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat) return;
      switch (event.key) {
        case " ":
        case "Enter":
          event.preventDefault();
          advance();
          break;
        case "r":
        case "R":
          restartStage();
          break;
        case "s":
        case "S":
          skipStage();
          break;
        case "p":
        case "P":
          pauseOrResume();
          break;
        case "e":
        case "E":
          endSession();
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [advance, endSession, pauseOrResume, restartStage, skipStage]);

  return {
    session,
    selectBalloon,
    advance,
    enterPlaying,
    advanceAfterStageComplete,
    restartStage,
    skipStage,
    pauseOrResume,
    endSession,
    resetDemo,
  };
}
