"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  advanceBubblePopStage as engineAdvanceStage,
  applyBubblePopGameTransition,
  type BubbleColor,
  type BubblePopSessionState,
  BubbleSize,
  confirmBubblePopColor as engineConfirmBubblePopColor,
  createBubblePopSession,
  Difficulty,
  endBubblePopSession as engineEndSession,
  GameState,
  getStageDecisionTarget,
  jumpToBubblePopStage as engineJumpToStage,
  pauseBubblePopSession as enginePauseSession,
  ReachHeight,
  ReachSide,
  type BubbleShape,
  restartBubblePopStage as engineRestartStage,
  resumeBubblePopSession as engineResumeSession,
  skipBubblePopStage as engineSkipStage,
  switchBubblePopDifficulty as engineSwitchDifficulty,
  type StageNumber,
  TargetMode,
} from "@/lib/bubblepop";
import { BUBBLE_POP_DIFFICULTY_DEFAULTS } from "./smartDefaults";
import { getBubblePopStagePreset } from "./stagePreset";
import { useSessionWorkflow } from "@/components/control/session/SessionWorkflowContext";
import { applyEarlyEndReason, type EarlyEndSelection } from "@/lib/sessions/workflowMetadata";

/** The therapist's post-STAGE_COMPLETE decision — same shape as the other two games' DifficultyDecision. */
export type BubblePopDifficultyDecision = "continue" | "easier" | "harder";

export interface BubblePopDraftConfig {
  childFirstName: string;
  difficulty: Difficulty;
  bubbleSize: BubbleSize;
  reachHeight: ReachHeight;
  reachSide: ReachSide;
  targetMode: TargetMode;
  startingStage: StageNumber;
}

/** Deliberately coarser than lib/bubblepop's GameState — same convention as the other two games' ControllerPhase. */
export type BubblePopControllerPhase = "SETUP" | "READY" | "LIVE" | "SUMMARY";

const MAX_NAME_LENGTH = 30;

function freshDraft(): BubblePopDraftConfig {
  return { childFirstName: "", difficulty: Difficulty.EASY, startingStage: 1, ...BUBBLE_POP_DIFFICULTY_DEFAULTS[Difficulty.EASY] };
}

function derivePhase(session: BubblePopSessionState | null): BubblePopControllerPhase {
  if (!session) return "SETUP";
  if (session.gameState === GameState.SESSION_COMPLETE) return "SUMMARY";
  if (session.gameState === GameState.WELCOME) return "READY";
  return "LIVE";
}

/**
 * Local (no-Firebase) dev adapter for Bubble Pop Wall — same role as the
 * other two games' local controller hooks, kept only for developing/testing
 * /control/bubble-pop-wall in isolation. A real clinic deployment always has
 * Firebase configured and uses useBubblePopRealtimeControllerSession.
 */
export function useLocalBubblePopControllerSession() {
  const sessionWorkflow = useSessionWorkflow();
  const [draft, setDraft] = useState<BubblePopDraftConfig>(freshDraft);
  const [session, setSession] = useState<BubblePopSessionState | null>(null);
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const phase = derivePhase(session);

  const setChildName = useCallback((value: string) => {
    setDraft((d) => ({ ...d, childFirstName: value.slice(0, MAX_NAME_LENGTH) }));
  }, []);

  const setDifficulty = useCallback((difficulty: Difficulty) => {
    setDraft((d) => ({ ...d, difficulty, startingStage: 1, ...BUBBLE_POP_DIFFICULTY_DEFAULTS[difficulty] }));
  }, []);

  const setStartingStage = useCallback((startingStage: StageNumber) => {
    setDraft((d) => ({ ...d, startingStage }));
  }, []);

  const setBubbleSize = useCallback((bubbleSize: BubbleSize) => {
    setDraft((d) => ({ ...d, bubbleSize }));
  }, []);

  const setReachHeight = useCallback((reachHeight: ReachHeight) => {
    setDraft((d) => ({ ...d, reachHeight }));
  }, []);

  const setReachSide = useCallback((reachSide: ReachSide) => {
    setDraft((d) => ({ ...d, reachSide }));
  }, []);

  const setTargetMode = useCallback((targetMode: TargetMode) => {
    setDraft((d) => ({ ...d, targetMode }));
  }, []);

  const confirmSetup = useCallback(() => {
    const childFirstName = draft.childFirstName.trim();
    if (!childFirstName) return;
    // THERAPIST SETUP SIMPLIFICATION — resolve the final config from the
    // same preset source the Stage Cards previewed, rather than trusting
    // the draft's copied fields, so preview and actual session can never
    // drift (task section 15).
    const preset = getBubblePopStagePreset(draft.difficulty, draft.startingStage);
    setSession(createBubblePopSession({ ...preset.config, childFirstName, workflow: sessionWorkflow.metadata }));
  }, [draft, sessionWorkflow.metadata]);

  const editSetup = useCallback(() => {
    setSession(null);
  }, []);

  const startLiveSession = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.gameState !== GameState.WELCOME) return;
    const now = Date.now();
    let result = applyBubblePopGameTransition(s, GameState.SETUP, now);
    result = applyBubblePopGameTransition(result.state, GameState.START_ZONE, now);
    setSession(result.state);
  }, []);

  const confirmChildReady = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.gameState !== GameState.START_ZONE) return;
    const now = Date.now();
    let result = applyBubblePopGameTransition(s, GameState.INSTRUCTIONS, now);
    result = applyBubblePopGameTransition(result.state, GameState.COUNTDOWN, now);
    result = applyBubblePopGameTransition(result.state, GameState.PLAYING, now);
    setSession(result.state);
  }, []);

  /** Confirms the therapist's tap for station `color`[, `shape`] — see lib/bubblepop/session.ts's confirmBubblePopColor for the correct/incorrect resolution. */
  const confirmBubblePopColor = useCallback((color: BubbleColor, shape?: BubbleShape) => {
    const s = sessionRef.current;
    if (!s || s.gameState !== GameState.PLAYING) return;
    setSession(engineConfirmBubblePopColor(s, color, Date.now(), shape).state);
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

  const advanceStage = useCallback((decision: BubblePopDifficultyDecision) => {
    const s = sessionRef.current;
    if (!s || s.gameState !== GameState.STAGE_COMPLETE) return;
    const target = getStageDecisionTarget(s.currentDifficulty, s.currentStage.stageNumber, decision);
    if (!target) return;
    const { difficulty: targetDifficulty, stageNumber: targetStageNumber } = target;
    // THERAPIST SETUP SIMPLIFICATION (task section 53) — on an actual
    // difficulty change, resolve that difficulty's real preset technical
    // fields instead of letting the engine reuse whatever was chosen once
    // at setup. A same-difficulty "continue" needs no preset lookup.
    const presetFields = targetDifficulty === s.currentDifficulty ? undefined : BUBBLE_POP_DIFFICULTY_DEFAULTS[targetDifficulty];
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
    setSession(engineSwitchDifficulty(s, difficulty, Date.now(), BUBBLE_POP_DIFFICULTY_DEFAULTS[difficulty]).state);
  }, []);

  const newSession = useCallback(() => {
    setSession(null);
    setDraft(freshDraft());
    sessionWorkflow.reset();
  }, [sessionWorkflow]);

  /** No-op here — see the other two games' matching local-adapter comment; the realtime adapter is the real implementation. */
  const replayCelebration = useCallback(() => {}, []);

  return {
    therapistName: null,
    phase,
    draft,
    session,
    setChildName,
    setDifficulty,
    setStartingStage,
    setBubbleSize,
    setReachHeight,
    setReachSide,
    setTargetMode,
    confirmSetup,
    editSetup,
    startLiveSession,
    confirmBubblePopColor,
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
