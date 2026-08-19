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
  isEncounterStage,
  isStarOnlyStage,
  moveSpacePilotRocketLane as engineMoveRocketLane,
  pauseSpacePilotSession as enginePauseSession,
  resolveSpacePilotEncounterArrival,
  resolveSpacePilotStarArrival,
  restartSpacePilotLevel as engineRestartLevel,
  switchSpacePilotDifficulty as engineSwitchDifficulty,
  resumeSpacePilotSession as engineResumeSession,
  starArrivalOffsetMs,
  type SpacePilotSessionState,
} from "@/lib/spacepilot";
import { useSessionWorkflow } from "@/components/control/session/SessionWorkflowContext";
import { applyEarlyEndReason, type EarlyEndSelection } from "@/lib/sessions/workflowMetadata";

export interface SpacePilotDraftConfig {
  childFirstName: string;
  difficulty: Difficulty;
}

/** Deliberately coarser than lib/spacepilot's GameState — same convention as every other game's ControllerPhase. */
export type SpacePilotControllerPhase = "SETUP" | "READY" | "LIVE" | "SUMMARY";

const MAX_NAME_LENGTH = 30;

function freshDraft(): SpacePilotDraftConfig {
  return { childFirstName: "", difficulty: Difficulty.EASY };
}

function derivePhase(session: SpacePilotSessionState | null): SpacePilotControllerPhase {
  if (!session) return "SETUP";
  if (session.gameState === GameState.SESSION_COMPLETE) return "SUMMARY";
  if (session.gameState === GameState.WELCOME) return "READY";
  return "LIVE";
}

/** The moment (elapsed ms since `startedAt`) object `index` reaches the rocket's collection zone — EASY uses its own fixed schedule, MEDIUM/ADVANCED use their difficulty-specific one. */
function arrivalOffsetMs(difficulty: Difficulty, index: number): number {
  return difficulty === Difficulty.EASY ? starArrivalOffsetMs(index) : encounterArrivalOffsetMs(difficulty, index);
}

/**
 * Local (no-Firebase) dev adapter for Space Pilot — same role as every
 * other game's local controller hook, kept only for developing/testing
 * /control/space-pilot in isolation. A real clinic deployment always has
 * Firebase configured and uses useSpacePilotRealtimeControllerSession.
 *
 * UNLIKE every other game's local adapter, this one DOES run its own timer:
 * Space Pilot's core mechanic is an object arriving at a scheduled MOMENT
 * (task's "the rocket flies through space in real time"), not a therapist
 * tap — see lib/spacepilot/session.ts's resolveSpacePilotStarArrival /
 * resolveSpacePilotEncounterArrival. A single effect re-schedules exactly
 * one setTimeout for the next unresolved star/encounter every time
 * `session` changes, which naturally self-corrects instead of needing a
 * manually-tracked chain — fine for a single-tab dev adapter with no
 * network latency to guard against.
 */
export function useLocalSpacePilotControllerSession() {
  const sessionWorkflow = useSessionWorkflow();
  const [draft, setDraft] = useState<SpacePilotDraftConfig>(freshDraft);
  const [session, setSession] = useState<SpacePilotSessionState | null>(null);
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const phase = derivePhase(session);

  useEffect(() => {
    if (!session || session.gameState !== GameState.PLAYING) return;
    const stage = session.currentStage;
    if (stage.pausedAt !== null || stage.startedAt === null) return;

    if (isStarOnlyStage(stage)) {
      const starIndex = stage.currentStarIndex;
      if (starIndex >= stage.stars.length) return;
      const dueAt = stage.startedAt + arrivalOffsetMs(session.currentDifficulty, starIndex) + stage.totalPausedMs;
      const delay = Math.max(0, dueAt - Date.now());
      const timer = setTimeout(() => {
        const current = sessionRef.current;
        if (!current) return;
        const result = resolveSpacePilotStarArrival(current, starIndex, Date.now());
        if (result.success) setSession(result.state);
      }, delay);
      return () => clearTimeout(timer);
    }

    if (isEncounterStage(stage)) {
      const encounterIndex = stage.currentEncounterIndex;
      if (encounterIndex >= stage.encounters.length) return;
      const dueAt = stage.startedAt + arrivalOffsetMs(session.currentDifficulty, encounterIndex) + stage.totalPausedMs;
      const delay = Math.max(0, dueAt - Date.now());
      const timer = setTimeout(() => {
        const current = sessionRef.current;
        if (!current) return;
        const result = resolveSpacePilotEncounterArrival(current, encounterIndex, Date.now());
        if (result.success) setSession(result.state);
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [session]);

  const setChildName = useCallback((value: string) => {
    setDraft((d) => ({ ...d, childFirstName: value.slice(0, MAX_NAME_LENGTH) }));
  }, []);

  const setDifficulty = useCallback((value: Difficulty) => {
    setDraft((d) => ({ ...d, difficulty: value }));
  }, []);

  const confirmSetup = useCallback(() => {
    const childFirstName = draft.childFirstName.trim();
    if (!childFirstName) return;
    setSession(createSpacePilotSession({ childFirstName, difficulty: draft.difficulty, workflow: sessionWorkflow.metadata }));
  }, [draft, sessionWorkflow.metadata]);

  const editSetup = useCallback(() => {
    setSession(null);
  }, []);

  const startLiveSession = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.gameState !== GameState.WELCOME) return;
    const now = Date.now();
    let result = applySpacePilotGameTransition(s, GameState.SETUP, now);
    result = applySpacePilotGameTransition(result.state, GameState.START_ZONE, now);
    setSession(result.state);
  }, []);

  const confirmChildReady = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.gameState !== GameState.START_ZONE) return;
    const now = Date.now();
    let result = applySpacePilotGameTransition(s, GameState.INSTRUCTIONS, now);
    result = applySpacePilotGameTransition(result.state, GameState.COUNTDOWN, now);
    result = applySpacePilotGameTransition(result.state, GameState.PLAYING, now);
    setSession(result.state);
  }, []);

  const moveRocketLane = useCallback((direction: "UP" | "DOWN") => {
    const s = sessionRef.current;
    if (!s) return;
    setSession(engineMoveRocketLane(s, direction).state);
  }, []);

  const fireWeapon = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    setSession(engineFireWeapon(s, Date.now()).state);
  }, []);

  const pauseOrResume = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.gameState !== GameState.PLAYING) return;
    const stage = s.currentStage;
    const result = stage.pausedAt !== null ? engineResumeSession(s, Date.now()) : enginePauseSession(s, Date.now());
    setSession(result.state);
  }, []);

  const restartLevel = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    setSession(engineRestartLevel(s, Date.now()).state);
  }, []);

  const changeLiveDifficulty = useCallback((difficulty: Difficulty) => {
    const s = sessionRef.current;
    if (!s) return;
    setSession(engineSwitchDifficulty(s, difficulty).state);
  }, []);

  const endSessionEarly = useCallback((selection: EarlyEndSelection) => {
    const s = sessionRef.current;
    if (!s) return;
    setSession(engineEndSession(applyEarlyEndReason(s, selection.reason, selection.customReason), Date.now()).state);
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
  };
}
