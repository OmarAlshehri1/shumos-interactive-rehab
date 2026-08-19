"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  advanceFootstepsStage as engineAdvanceStage,
  applyFootstepsGameTransition,
  confirmCurrentFootstep as engineConfirmCurrentFootstep,
  createFootstepsSession,
  Difficulty,
  endFootstepsSession as engineEndSession,
  type FootstepsSessionState,
  GameState,
  getStageDecisionTarget,
  jumpToFootstepsStage as engineJumpToStage,
  pauseFootstepsSession as enginePauseSession,
  PathStyle,
  PathWidth,
  restartFootstepsStage as engineRestartStage,
  resumeFootstepsSession as engineResumeSession,
  skipFootstepsStage as engineSkipStage,
  switchFootstepsDifficulty as engineSwitchDifficulty,
  type StageNumber,
  StepLength,
} from "@/lib/footsteps";
import { FOOTSTEPS_DIFFICULTY_DEFAULTS } from "./smartDefaults";
import { getFootstepsStagePreset } from "./stagePreset";
import { useSessionWorkflow } from "@/components/control/session/SessionWorkflowContext";
import { applyEarlyEndReason, type EarlyEndSelection } from "@/lib/sessions/workflowMetadata";

/** The therapist's post-STAGE_COMPLETE decision — same shape as Balloon Quest's DifficultyDecision. */
export type FootstepsDifficultyDecision = "continue" | "easier" | "harder";

export interface FootstepsDraftConfig {
  childFirstName: string;
  difficulty: Difficulty;
  stepLength: StepLength;
  pathStyle: PathStyle;
  pathWidth: PathWidth;
  startingStage: StageNumber;
}

/** Deliberately coarser than lib/footsteps' GameState — same convention as Balloon Quest's ControllerPhase. */
export type FootstepsControllerPhase = "SETUP" | "READY" | "LIVE" | "SUMMARY";

const MAX_NAME_LENGTH = 30;

function freshDraft(): FootstepsDraftConfig {
  return { childFirstName: "", difficulty: Difficulty.EASY, startingStage: 1, ...FOOTSTEPS_DIFFICULTY_DEFAULTS[Difficulty.EASY] };
}

function derivePhase(session: FootstepsSessionState | null): FootstepsControllerPhase {
  if (!session) return "SETUP";
  if (session.gameState === GameState.SESSION_COMPLETE) return "SUMMARY";
  if (session.gameState === GameState.WELCOME) return "READY";
  return "LIVE";
}

/**
 * Local (no-Firebase) dev adapter for Follow the Footsteps — same role as
 * lib/control/useLocalControllerSession.ts, kept only for developing/testing
 * /control/follow-the-footsteps in isolation. A real clinic deployment
 * always has Firebase configured and uses useFollowTheFootstepsRealtimeSession.
 */
export function useLocalFootstepsControllerSession() {
  const sessionWorkflow = useSessionWorkflow();
  const [draft, setDraft] = useState<FootstepsDraftConfig>(freshDraft);
  const [session, setSession] = useState<FootstepsSessionState | null>(null);
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const phase = derivePhase(session);

  const setChildName = useCallback((value: string) => {
    setDraft((d) => ({ ...d, childFirstName: value.slice(0, MAX_NAME_LENGTH) }));
  }, []);

  const setDifficulty = useCallback((difficulty: Difficulty) => {
    setDraft((d) => ({ ...d, difficulty, startingStage: 1, ...FOOTSTEPS_DIFFICULTY_DEFAULTS[difficulty] }));
  }, []);

  const setStartingStage = useCallback((startingStage: StageNumber) => {
    setDraft((d) => ({ ...d, startingStage }));
  }, []);

  const setStepLength = useCallback((stepLength: StepLength) => {
    setDraft((d) => ({ ...d, stepLength }));
  }, []);

  const setPathStyle = useCallback((pathStyle: PathStyle) => {
    setDraft((d) => ({ ...d, pathStyle }));
  }, []);

  const setPathWidth = useCallback((pathWidth: PathWidth) => {
    setDraft((d) => ({ ...d, pathWidth }));
  }, []);

  const confirmSetup = useCallback(() => {
    const childFirstName = draft.childFirstName.trim();
    if (!childFirstName) return;
    // THERAPIST SETUP SIMPLIFICATION — resolve the final config from the
    // same preset source the Stage Cards previewed, rather than trusting
    // the draft's copied fields, so preview and actual session can never
    // drift (task section 15).
    const preset = getFootstepsStagePreset(draft.difficulty, draft.startingStage);
    setSession(createFootstepsSession({ ...preset.config, childFirstName, workflow: sessionWorkflow.metadata }));
  }, [draft, sessionWorkflow.metadata]);

  const editSetup = useCallback(() => {
    setSession(null);
  }, []);

  const startLiveSession = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.gameState !== GameState.WELCOME) return;
    const now = Date.now();
    let result = applyFootstepsGameTransition(s, GameState.SETUP, now);
    result = applyFootstepsGameTransition(result.state, GameState.START_ZONE, now);
    setSession(result.state);
  }, []);

  const confirmChildReady = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.gameState !== GameState.START_ZONE) return;
    const now = Date.now();
    let result = applyFootstepsGameTransition(s, GameState.INSTRUCTIONS, now);
    result = applyFootstepsGameTransition(result.state, GameState.COUNTDOWN, now);
    result = applyFootstepsGameTransition(result.state, GameState.PLAYING, now);
    setSession(result.state);
  }, []);

  /** Confirms the CURRENT footprint only — see lib/footsteps/session.ts's confirmCurrentFootstep. There is no correct/incorrect distinction (NO NEGATIVE SCORING), so this returns nothing to react to beyond the updated session. */
  const confirmCurrentFootstep = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.gameState !== GameState.PLAYING) return;
    setSession(engineConfirmCurrentFootstep(s, Date.now()).state);
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

  const endSessionEarly = useCallback((selection: EarlyEndSelection) => {
    const s = sessionRef.current;
    if (!s) return;
    setSession(engineEndSession(applyEarlyEndReason(s, selection.reason, selection.customReason), Date.now()).state);
  }, []);

  const advanceStage = useCallback((decision: FootstepsDifficultyDecision) => {
    const s = sessionRef.current;
    if (!s || s.gameState !== GameState.STAGE_COMPLETE) return;
    const target = getStageDecisionTarget(s.currentDifficulty, s.currentStage.stageNumber, decision);
    if (!target) return;
    const { difficulty: targetDifficulty, stageNumber: targetStageNumber } = target;
    // THERAPIST SETUP SIMPLIFICATION (task section 53) — on an actual
    // difficulty change, resolve that difficulty's real preset technical
    // fields instead of letting the engine reuse whatever was chosen once
    // at setup. A same-difficulty "continue" needs no preset lookup.
    const presetFields = targetDifficulty === s.currentDifficulty ? undefined : FOOTSTEPS_DIFFICULTY_DEFAULTS[targetDifficulty];
    const advanced = engineAdvanceStage(s, { difficulty: targetDifficulty, stageNumber: targetStageNumber }, presetFields);
    setSession(advanced.state);
  }, []);

  const jumpToStage = useCallback((stageNumber: StageNumber) => {
    const s = sessionRef.current;
    if (!s) return;
    setSession(engineJumpToStage(s, stageNumber, Date.now()).state);
  }, []);

  const changeLiveDifficulty = useCallback((difficulty: Difficulty) => {
    const s = sessionRef.current;
    if (!s) return;
    setSession(engineSwitchDifficulty(s, difficulty, Date.now(), FOOTSTEPS_DIFFICULTY_DEFAULTS[difficulty]).state);
  }, []);

  const newSession = useCallback(() => {
    setSession(null);
    setDraft(freshDraft());
    sessionWorkflow.reset();
  }, [sessionWorkflow]);

  /** No-op here — see Balloon Quest's matching local-adapter comment; the realtime adapter is the real implementation. */
  const replayCelebration = useCallback(() => {}, []);

  return {
    therapistName: null,
    phase,
    draft,
    session,
    setChildName,
    setDifficulty,
    setStartingStage,
    setStepLength,
    setPathStyle,
    setPathWidth,
    confirmSetup,
    editSetup,
    startLiveSession,
    confirmCurrentFootstep,
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
  };
}
