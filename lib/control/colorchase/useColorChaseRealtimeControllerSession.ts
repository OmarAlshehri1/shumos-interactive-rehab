"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TICKS, TICK_DURATION_MS } from "@/components/display/scenes/CountdownScene";
import {
  advanceColorChaseStage,
  applyColorChaseTransition,
  confirmColorChasePad as engineConfirmPad,
  createColorChaseSession,
  Difficulty,
  endColorChaseSession,
  GameState,
  jumpToColorChaseStage,
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
import { COLOR_CHASE_GAME_ID } from "@/lib/games/registry";
import { isCc3Live } from "@/lib/colorchase3d/live";

/** A live record tagged `engine: "cc3"` belongs to Color Chase 3D: the original controller (rollback path) must never adopt it. */
const isOriginal = (r: { gameId?: string | null; session?: unknown } | null | undefined) => r?.gameId === COLOR_CHASE_GAME_ID && !isCc3Live(r.session);
import { usePatientContext } from "@/lib/patients/PatientSessionContext";
import { useSessionWorkflow } from "@/components/control/session/SessionWorkflowContext";
import { getStaffDb } from "@/lib/realtime/firebaseClient";
import {
  claimControllerLease, clearLiveSession, fetchLiveSession, publishSession, refreshControllerLease, registerControllerPresence,
  subscribeToConnectionStatus, subscribeToControllerLease, subscribeToDisplayPresence, subscribeToLiveSession, waitForDisplayCountdownComplete,
} from "@/lib/realtime/sessionRepository";
import type { ConnectionStatus, ControllerLeaseRecord, LiveInteraction, LiveSessionRecord, PresenceRecord } from "@/lib/realtime/types";
import { useStaffAuth } from "@/lib/realtime/useStaffAuth";
import { buildStoredColorChaseSession } from "@/lib/sessions/buildStoredColorChaseSession";
import { saveSessionHistoryOnce } from "@/lib/sessions/sessionHistoryRepository";
import { applyEarlyEndReason, type EarlyEndSelection } from "@/lib/sessions/workflowMetadata";
import { deriveColorChaseControllerPhase, type ColorChaseDifficultyDecision, type ColorChaseDraftConfig } from "./useLocalColorChaseControllerSession";

const INSTRUCTION_MS = 3500;
const COUNTDOWN_TIMEOUT_MS = TICKS.length * TICK_DURATION_MS;
const freshDraft = (): ColorChaseDraftConfig => ({ childFirstName: "", difficulty: Difficulty.EASY, startingStage: 1 });
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function useColorChaseRealtimeControllerSession() {
  const auth = useStaffAuth();
  const db = getStaffDb();
  const patient = usePatientContext();
  const sessionWorkflow = useSessionWorkflow();
  const [draft, setDraft] = useState(freshDraft);
  const [record, setRecord] = useState<LiveSessionRecord | null>(null);
  const recordRef = useRef<LiveSessionRecord | null>(null);
  const [hasLoadedInitialSession, setLoaded] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [displayPresence, setDisplayPresence] = useState<PresenceRecord | null>(null);
  const [lease, setLease] = useState<ControllerLeaseRecord | null>(null);
  const [leaseKnown, setLeaseKnown] = useState(false);
  const [takeoverBlocked, setTakeoverBlocked] = useState(false);
  const [syncRestoredAt, setSyncRestoredAt] = useState<number | null>(null);
  const tokenRef = useRef(0);
  const inputInFlight = useRef(false);

  useEffect(() => { recordRef.current = record; }, [record]);
  useEffect(() => {
    if (auth.phase !== "authorized") return;
    const live = subscribeToLiveSession(db, (next) => { const ours = isOriginal(next) ? next : null; recordRef.current = ours; setRecord(ours); setLoaded(true); });
    const connection = subscribeToConnectionStatus(db, setConnectionStatus);
    const display = subscribeToDisplayPresence(db, setDisplayPresence);
    const leaseSubscription = subscribeToControllerLease(db, (next) => { setLease(next); setLeaseKnown(true); });
    const presence = registerControllerPresence(db);
    return () => { live(); connection(); display(); leaseSubscription(); presence(); };
  }, [auth.phase, db]);

  const uid = auth.uid;
  const isOwner = uid !== null && leaseKnown && (lease === null || lease.ownerId === uid);
  const canMutate = isOwner && connectionStatus === "connected";
  const canMutateRef = useRef(canMutate);
  useEffect(() => { canMutateRef.current = canMutate; }, [canMutate]);
  useEffect(() => {
    if (!leaseKnown || !uid || lease?.ownerId === uid) return;
    if (!lease || (typeof lease.updatedAt === "number" && Date.now() - lease.updatedAt > 45000)) void claimControllerLease(db, uid).catch(() => {});
  }, [db, lease, leaseKnown, uid]);
  useEffect(() => {
    if (!uid || lease?.ownerId !== uid) return;
    const timer = setInterval(() => void refreshControllerLease(db).catch(() => {}), 15000);
    return () => clearInterval(timer);
  }, [db, lease, uid]);

  const resync = useCallback(async (token: number) => {
    const canonical = await fetchLiveSession(db).catch(() => null);
    if (token !== tokenRef.current) return;
    const ours = isOriginal(canonical) ? canonical : null;
    recordRef.current = ours; setRecord(ours); setSyncRestoredAt(Date.now());
  }, [db]);

  const publish = useCallback(async (next: ColorChaseSessionState, token: number, interaction: LiveInteraction | null = null) => {
    if (token !== tokenRef.current) return null;
    const current = recordRef.current;
    if (!current) return null;
    const revision = current.revision + 1;
    const optimistic: LiveSessionRecord = { ...current, revision, session: next, lastInteraction: interaction, updatedAt: Date.now() };
    recordRef.current = optimistic; setRecord(optimistic);
    try {
      await publishSession(db, { gameId: COLOR_CHASE_GAME_ID, sessionId: current.sessionId, revision, session: next, lastInteraction: interaction, patientId: current.patientId });
      return revision;
    } catch {
      await resync(token);
      return null;
    }
  }, [db, resync]);

  const recoveredStrandedRef = useRef(false);
  useEffect(() => {
    if (recoveredStrandedRef.current || !hasLoadedInitialSession || !canMutate) return;
    recoveredStrandedRef.current = true;
    const current = recordRef.current;
    if (!current) return;
    const state = current.session as ColorChaseSessionState;
    if (state.gameState !== GameState.INSTRUCTIONS && state.gameState !== GameState.COUNTDOWN) return;
    const recovered = applyColorChaseTransition(state, GameState.START_ZONE, Date.now());
    if (recovered.success) void publish(recovered.state, ++tokenRef.current);
  }, [canMutate, hasLoadedInitialSession, publish]);

  const session = (record?.session as ColorChaseSessionState | undefined) ?? null;
  const saved = useRef(new Set<string>());
  useEffect(() => {
    if (!session?.summary || session.gameState !== GameState.SESSION_COMPLETE || !record?.patientId || !uid || saved.current.has(session.sessionId)) return;
    saved.current.add(session.sessionId);
    const stored = buildStoredColorChaseSession({ session, patientId: record.patientId, createdByUid: uid, therapistName: auth.displayName, gameId: COLOR_CHASE_GAME_ID });
    void saveSessionHistoryOnce(record.patientId, stored).catch(() => saved.current.delete(session.sessionId));
  }, [auth.displayName, record?.patientId, session, uid]);

  const setChildName = useCallback((childFirstName: string) => setDraft((d) => ({ ...d, childFirstName: childFirstName.slice(0, 30) })), []);
  const setDifficulty = useCallback((difficulty: Difficulty) => setDraft((d) => ({ ...d, difficulty, startingStage: 1 })), []);
  const setStartingStage = useCallback((startingStage: StageNumber) => setDraft((d) => ({ ...d, startingStage })), []);
  const confirmSetup = useCallback(async () => {
    const childFirstName = draft.childFirstName.trim();
    if (!childFirstName || !canMutate || !hasLoadedInitialSession) return;
    const token = ++tokenRef.current;
    const next = createColorChaseSession({ childFirstName, difficulty: draft.difficulty, startingStage: draft.startingStage, workflow: sessionWorkflow.metadata });
    const canonical = await fetchLiveSession(db).catch(() => null);
    if (token !== tokenRef.current) return;
    const nextRecord: LiveSessionRecord = {
      gameId: COLOR_CHASE_GAME_ID, sessionId: next.sessionId, revision: (canonical?.revision ?? 0) + 1, session: next,
      lastInteraction: null, celebrationReplay: null, patientId: patient.selectedPatient?.patientId ?? null, updatedAt: Date.now(),
    };
    recordRef.current = nextRecord; setRecord(nextRecord);
    try {
      await publishSession(db, { gameId: COLOR_CHASE_GAME_ID, sessionId: next.sessionId, revision: nextRecord.revision, session: next, lastInteraction: null, celebrationReplay: null, patientId: nextRecord.patientId });
    } catch { await resync(token); }
  }, [canMutate, db, draft, hasLoadedInitialSession, patient.selectedPatient, resync, sessionWorkflow.metadata]);

  const startLiveSession = useCallback(() => {
    const current = recordRef.current; if (!canMutate || !current) return;
    let next = applyColorChaseTransition(current.session as ColorChaseSessionState, GameState.SETUP, Date.now()).state;
    next = applyColorChaseTransition(next, GameState.START_ZONE, Date.now()).state;
    void publish(next, ++tokenRef.current);
  }, [canMutate, publish]);
  const confirmChildReady = useCallback(() => {
    const current = recordRef.current; if (!canMutate || !current) return;
    const token = ++tokenRef.current;
    const instructions = applyColorChaseTransition(current.session as ColorChaseSessionState, GameState.INSTRUCTIONS, Date.now()).state;
    void (async () => {
      if (await publish(instructions, token) === null) return;
      await delay(INSTRUCTION_MS); if (token !== tokenRef.current || !canMutateRef.current) return;
      const countdown = applyColorChaseTransition(instructions, GameState.COUNTDOWN, Date.now()).state;
      const revision = await publish(countdown, token); if (revision === null) return;
      const signal = waitForDisplayCountdownComplete(db, current.sessionId, revision);
      try { await Promise.race([signal.promise, delay(COUNTDOWN_TIMEOUT_MS)]); } finally { signal.cancel(); }
      if (token !== tokenRef.current || !canMutateRef.current) return;
      await publish(applyColorChaseTransition(countdown, GameState.PLAYING, Date.now()).state, token);
    })();
  }, [canMutate, db, publish]);

  const confirmPad = useCallback((padId: PadId) => {
    if (inputInFlight.current) return;
    const current = recordRef.current; if (!canMutate || !current) return;
    const timestamp = Date.now();
    const result = engineConfirmPad(current.session as ColorChaseSessionState, { padId, inputId: crypto.randomUUID(), timestamp });
    if (!result.success || result.outcome === "duplicate") return;
    const interaction: LiveInteraction = { id: `${current.revision + 1}-${padId}-${timestamp}`, type: result.outcome === "correct" ? "CORRECT" : "INCORRECT", balloonId: padId, revision: current.revision + 1, timestamp };
    inputInFlight.current = true;
    void publish(result.state, tokenRef.current, interaction).finally(() => { inputInFlight.current = false; });
  }, [canMutate, publish]);

  const mutate = useCallback((fn: (state: ColorChaseSessionState) => ColorChaseSessionState, newSequence = false) => {
    const current = recordRef.current; if (!canMutate || !current) return;
    void publish(fn(current.session as ColorChaseSessionState), newSequence ? ++tokenRef.current : tokenRef.current);
  }, [canMutate, publish]);
  const pauseOrResume = useCallback(() => mutate((s) => (s.currentStage.pausedAt === null ? pauseColorChaseSession(s, Date.now()) : resumeColorChaseSession(s, Date.now())).state), [mutate]);
  const restartStage = useCallback(() => mutate((s) => restartColorChaseStage(s, Date.now()).state, true), [mutate]);
  const skipStage = useCallback(() => mutate((s) => skipColorChaseStage(s, Date.now()).state, true), [mutate]);
  const endSessionEarly = useCallback((selection: EarlyEndSelection) => mutate((s) => endColorChaseSession(applyEarlyEndReason(s, selection.reason, selection.customReason), Date.now()).state, true), [mutate]);
  const jumpToStage = useCallback((stage: StageNumber) => mutate((s) => jumpToColorChaseStage(s, stage, Date.now()).state, true), [mutate]);
  const changeLiveDifficulty = useCallback((difficulty: Difficulty) => mutate((s) => switchColorChaseDifficulty(s, difficulty, Date.now()).state, true), [mutate]);
  const advanceStage = useCallback((decision: ColorChaseDifficultyDecision) => mutate((s) => {
    const target = getStageDecisionTarget(s.currentDifficulty, s.currentStage.stageNumber, decision);
    return target ? advanceColorChaseStage(s, target).state : endColorChaseSession(s, Date.now()).state;
  }, true), [mutate]);
  const clear = useCallback((keepPatient: boolean) => {
    if (!canMutate) return; tokenRef.current += 1; recordRef.current = null; setRecord(null); setDraft(freshDraft()); sessionWorkflow.reset(); void clearLiveSession(db); if (!keepPatient) patient.clearPatient();
  }, [canMutate, db, patient, sessionWorkflow]);

  const editSetup = useCallback(() => {
    if (!canMutate) return;
    tokenRef.current += 1;
    recordRef.current = null;
    setRecord(null);
    void clearLiveSession(db);
  }, [canMutate, db]);

  return {
    therapistName: auth.displayName,
    phase: deriveColorChaseControllerPhase(session), draft, session, setChildName, setDifficulty, setStartingStage, confirmSetup,
    editSetup, startLiveSession, confirmChildReady, confirmPad, pauseOrResume, restartStage, skipStage,
    endSessionEarly, advanceStage, jumpToStage, changeLiveDifficulty, newSession: () => clear(false), startAnotherSessionForSamePatient: () => clear(true), replayCelebration: () => {},
    sessionPatientId: record?.patientId ?? null, connectionStatus, displayConnected: displayPresence?.connected === true,
    displayFullscreen: displayPresence?.connected === true && displayPresence.fullscreen === true, isOwner, canMutate,
    claimOwnership: () => { if (uid) void claimControllerLease(db, uid).then(() => setTakeoverBlocked(false)).catch(() => setTakeoverBlocked(true)); },
    takeoverBlocked, hasLoadedInitialSession, syncRestoredAt, authPhase: auth.phase,
  };
}
