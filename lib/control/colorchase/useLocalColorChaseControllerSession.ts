"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  advanceColorChaseStage,
  applyColorChaseTransition,
  confirmColorChasePad,
  createColorChaseSession,
  Difficulty,
  endColorChaseSession,
  GameState,
  getColorChaseStagePlan,
  jumpToColorChaseStage,
  PAD_IDS,
  pauseColorChaseSession,
  restartColorChaseStage,
  resumeColorChaseSession,
  skipColorChaseStage,
  switchColorChaseDifficulty,
  type ColorChaseSessionState,
  type PadId,
  type StageNumber,
} from "@/lib/colorchase";
import { getStageDecisionTarget } from "@/lib/game";
import { useSessionWorkflow } from "@/components/control/session/SessionWorkflowContext";
import { applyEarlyEndReason, type EarlyEndSelection } from "@/lib/sessions/workflowMetadata";

export type ColorChaseControllerPhase = "SETUP" | "READY" | "LIVE" | "SUMMARY";
export type ColorChaseDifficultyDecision = "continue" | "easier" | "harder";
export interface ColorChaseDraftConfig { childFirstName: string; difficulty: Difficulty; startingStage: StageNumber }

const freshDraft = (): ColorChaseDraftConfig => ({ childFirstName: "", difficulty: Difficulty.EASY, startingStage: 1 });
export const deriveColorChaseControllerPhase = (session: ColorChaseSessionState | null): ColorChaseControllerPhase =>
  !session ? "SETUP" : session.gameState === GameState.SESSION_COMPLETE ? "SUMMARY" : session.gameState === GameState.WELCOME ? "READY" : "LIVE";

export function useLocalColorChaseControllerSession() {
  const sessionWorkflow = useSessionWorkflow();
  const [draft, setDraft] = useState(freshDraft);
  const [session, setSession] = useState<ColorChaseSessionState | null>(null);
  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const updateCurrent = useCallback((fn: (state: ColorChaseSessionState) => ColorChaseSessionState) => {
    const current = sessionRef.current;
    if (current) setSession(fn(current));
  }, []);
  const setChildName = useCallback((childFirstName: string) => setDraft((d) => ({ ...d, childFirstName: childFirstName.slice(0, 30) })), []);
  const setDifficulty = useCallback((difficulty: Difficulty) => setDraft((d) => ({ ...d, difficulty, startingStage: 1 })), []);
  const setStartingStage = useCallback((startingStage: StageNumber) => setDraft((d) => ({ ...d, startingStage })), []);
  const confirmSetup = useCallback(() => {
    const name = draft.childFirstName.trim();
    if (name) setSession(createColorChaseSession({ childFirstName: name, difficulty: draft.difficulty, startingStage: draft.startingStage, workflow: sessionWorkflow.metadata }));
  }, [draft, sessionWorkflow.metadata]);
  const startLiveSession = useCallback(() => updateCurrent((s) => {
    let next = applyColorChaseTransition(s, GameState.SETUP, Date.now()).state;
    next = applyColorChaseTransition(next, GameState.START_ZONE, Date.now()).state;
    return next;
  }), [updateCurrent]);
  const confirmChildReady = useCallback(() => updateCurrent((s) => {
    let next = applyColorChaseTransition(s, GameState.INSTRUCTIONS, Date.now()).state;
    next = applyColorChaseTransition(next, GameState.COUNTDOWN, Date.now()).state;
    return applyColorChaseTransition(next, GameState.PLAYING, Date.now()).state;
  }), [updateCurrent]);
  const confirmPad = useCallback((padId: PadId) => updateCurrent((s) => confirmColorChasePad(s, { padId, inputId: crypto.randomUUID(), timestamp: Date.now() }).state), [updateCurrent]);
  const pauseOrResume = useCallback(() => updateCurrent((s) => (s.currentStage.pausedAt === null ? pauseColorChaseSession(s, Date.now()) : resumeColorChaseSession(s, Date.now())).state), [updateCurrent]);
  const restartStage = useCallback(() => updateCurrent((s) => restartColorChaseStage(s, Date.now()).state), [updateCurrent]);
  const skipStage = useCallback(() => updateCurrent((s) => skipColorChaseStage(s, Date.now()).state), [updateCurrent]);
  const endSessionEarly = useCallback((selection: EarlyEndSelection) => updateCurrent((s) => endColorChaseSession(applyEarlyEndReason(s, selection.reason, selection.customReason), Date.now()).state), [updateCurrent]);
  const jumpToStage = useCallback((stage: StageNumber) => updateCurrent((s) => jumpToColorChaseStage(s, stage, Date.now()).state), [updateCurrent]);
  const changeLiveDifficulty = useCallback((difficulty: Difficulty) => updateCurrent((s) => switchColorChaseDifficulty(s, difficulty, Date.now()).state), [updateCurrent]);
  const advanceStage = useCallback((decision: ColorChaseDifficultyDecision) => updateCurrent((s) => {
    const target = getStageDecisionTarget(s.currentDifficulty, s.currentStage.stageNumber, decision);
    return target ? advanceColorChaseStage(s, target).state : endColorChaseSession(s, Date.now()).state;
  }), [updateCurrent]);

  return {
    therapistName: null,
    phase: deriveColorChaseControllerPhase(session), draft, session, setChildName, setDifficulty, setStartingStage, confirmSetup,
    editSetup: () => setSession(null), startLiveSession, confirmChildReady, confirmPad, pauseOrResume, restartStage, skipStage,
    endSessionEarly, jumpToStage, changeLiveDifficulty, advanceStage, newSession: () => { setSession(null); setDraft(freshDraft()); sessionWorkflow.reset(); }, replayCelebration: () => {},
    padIds: PAD_IDS, stagePlan: session ? getColorChaseStagePlan(session.currentDifficulty, session.currentStage.stageNumber) : null,
  };
}
