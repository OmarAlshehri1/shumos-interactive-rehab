"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  advanceFeedAnimalsMonkey as engineAdvanceMonkey,
  advanceFeedAnimalsStage as engineAdvanceStage,
  applyFeedAnimalsGameTransition,
  confirmFoodSelection as engineConfirmFoodSelection,
  createFeedAnimalsSession,
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
import { FEED_ANIMALS_DIFFICULTY_DEFAULTS } from "./smartDefaults";
import { getFeedAnimalsStagePreset } from "./stagePreset";
import { useSessionWorkflow } from "@/components/control/session/SessionWorkflowContext";
import { applyEarlyEndReason, type EarlyEndSelection } from "@/lib/sessions/workflowMetadata";

/** The therapist's post-STAGE_COMPLETE decision — same shape as every other game's DifficultyDecision. */
export type FeedAnimalsDifficultyDecision = "continue" | "easier" | "harder";

export interface FeedAnimalsDraftConfig {
  childFirstName: string;
  difficulty: Difficulty;
  foodSize: FoodSize;
  reachHeight: ReachHeight;
  reachSide: ReachSide;
  movementPattern: MovementPattern;
  startingStage: StageNumber;
}

/** Deliberately coarser than lib/feedanimals's GameState — same convention as every other game's ControllerPhase. */
export type FeedAnimalsControllerPhase = "SETUP" | "READY" | "LIVE" | "SUMMARY";

const MAX_NAME_LENGTH = 30;

function freshDraft(): FeedAnimalsDraftConfig {
  return { childFirstName: "", difficulty: Difficulty.EASY, startingStage: 1, ...FEED_ANIMALS_DIFFICULTY_DEFAULTS[Difficulty.EASY] };
}

function derivePhase(session: FeedAnimalsSessionState | null): FeedAnimalsControllerPhase {
  if (!session) return "SETUP";
  if (session.gameState === GameState.SESSION_COMPLETE) return "SUMMARY";
  if (session.gameState === GameState.WELCOME) return "READY";
  return "LIVE";
}

/**
 * Local (no-Firebase) dev adapter for Feed the Animals — same role as every
 * other game's local controller hooks, kept only for developing/testing
 * /control/feed-the-animals in isolation. A real clinic deployment always
 * has Firebase configured and uses useFeedAnimalsRealtimeControllerSession.
 */
export function useLocalFeedAnimalsControllerSession() {
  const sessionWorkflow = useSessionWorkflow();
  const [draft, setDraft] = useState<FeedAnimalsDraftConfig>(freshDraft);
  const [session, setSession] = useState<FeedAnimalsSessionState | null>(null);
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const phase = derivePhase(session);

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

  const confirmSetup = useCallback(() => {
    const childFirstName = draft.childFirstName.trim();
    if (!childFirstName) return;
    // THERAPIST SETUP SIMPLIFICATION — resolve the final config from the
    // same preset source the Stage Cards previewed, rather than trusting
    // the draft's copied fields, so preview and actual session can never
    // drift (task section 15).
    const preset = getFeedAnimalsStagePreset(draft.difficulty, draft.startingStage);
    setSession(createFeedAnimalsSession({ ...preset.config, childFirstName, workflow: sessionWorkflow.metadata }));
  }, [draft, sessionWorkflow.metadata]);

  const editSetup = useCallback(() => {
    setSession(null);
  }, []);

  const startLiveSession = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.gameState !== GameState.WELCOME) return;
    const now = Date.now();
    let result = applyFeedAnimalsGameTransition(s, GameState.SETUP, now);
    result = applyFeedAnimalsGameTransition(result.state, GameState.START_ZONE, now);
    setSession(result.state);
  }, []);

  const confirmChildReady = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.gameState !== GameState.START_ZONE) return;
    const now = Date.now();
    let result = applyFeedAnimalsGameTransition(s, GameState.INSTRUCTIONS, now);
    result = applyFeedAnimalsGameTransition(result.state, GameState.COUNTDOWN, now);
    result = applyFeedAnimalsGameTransition(result.state, GameState.PLAYING, now);
    setSession(result.state);
  }, []);

  /** Confirms the therapist's tap for `foodChoiceId` — see lib/feedanimals/session.ts's confirmFoodSelection for the correct/incorrect resolution. */
  const confirmFoodSelection = useCallback((foodChoiceId: string) => {
    const s = sessionRef.current;
    if (!s || s.gameState !== GameState.PLAYING) return;
    setSession(engineConfirmFoodSelection(s, foodChoiceId, Date.now()).state);
  }, []);

  /** SAFARI ANIMAL ADVENTURE — the therapist's LEFT/RIGHT/JUMP tap for a "path" stage. See lib/feedanimals/session.ts's advanceFeedAnimalsMonkey. */
  const advanceMonkey = useCallback((direction: "left" | "right" | "jump") => {
    const s = sessionRef.current;
    if (!s || s.gameState !== GameState.PLAYING) return;
    setSession(engineAdvanceMonkey(s, direction, Date.now()).state);
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

  const advanceStage = useCallback((decision: FeedAnimalsDifficultyDecision) => {
    const s = sessionRef.current;
    if (!s || s.gameState !== GameState.STAGE_COMPLETE) return;
    const target = getStageDecisionTarget(s.currentDifficulty, s.currentStage.stageNumber, decision);
    if (!target) return;
    const { difficulty: targetDifficulty, stageNumber: targetStageNumber } = target;
    // THERAPIST SETUP SIMPLIFICATION (task section 53) — on an actual
    // difficulty change, resolve that difficulty's real preset technical
    // fields instead of letting the engine reuse whatever was chosen once
    // at setup. A same-difficulty "continue" needs no preset lookup.
    const presetFields = targetDifficulty === s.currentDifficulty ? undefined : FEED_ANIMALS_DIFFICULTY_DEFAULTS[targetDifficulty];
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
    setSession(engineSwitchDifficulty(s, difficulty, Date.now(), FEED_ANIMALS_DIFFICULTY_DEFAULTS[difficulty]).state);
  }, []);

  const newSession = useCallback(() => {
    setSession(null);
    setDraft(freshDraft());
    sessionWorkflow.reset();
  }, [sessionWorkflow]);

  /** No-op here — see every other game's matching local-adapter comment; the realtime adapter is the real implementation. */
  const replayCelebration = useCallback(() => {}, []);

  return {
    therapistName: null,
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
  };
}
