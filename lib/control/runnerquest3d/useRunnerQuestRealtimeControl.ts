"use client";

import { useGameSwitchFinalizer } from "@/components/control/visits/useGameSwitchFinalizer";
import { useCallback, useEffect, useRef, useState } from "react";
import { attachBrowserLoop } from "@/lib/runnerquest3d/controlMount";
import { ControlRuntime, type ControlView } from "@/lib/runnerquest3d/controlRuntime";
import { RunnerLivePublisher } from "@/lib/runnerquest3d/live";
import { hashSeed } from "@/lib/runnerquest3d/rng";
import type { Session, TherapistSettings } from "@/lib/runnerquest3d/types";
import { RUNNER_QUEST_3D_GAME_ID } from "@/lib/games/registry";
import { useLiveGameController } from "@/lib/liveGame/useLiveGameController";
import { clearOwnedLiveSession, fetchLiveSession, publishSession } from "@/lib/realtime/sessionRepository";
import { buildStoredRunnerQuestSession } from "@/lib/sessions/buildStoredRunnerQuestSession";
import { saveSessionHistoryOnce } from "@/lib/sessions/sessionHistoryRepository";
import { withEarlyEndReason, type EarlyEndSelection, type SessionWorkflowMetadata } from "@/lib/sessions/workflowMetadata";

/** Production default: the therapist drives the runner from touch controls; no sensor is needed. */
export const PRODUCTION_DEFAULT_SETTINGS: Partial<TherapistSettings> = { inputSource: "MANUAL" };

/**
 * Production (cross-device) controller for Runner Quest 3D: the same platform plumbing as every other game
 * (staff auth, single-controller lease, connection + display presence, `/liveSession`, per-patient history)
 * around the DOM-free ControlRuntime, which stays the single authority for movement, outcomes and scoring.
 * The Display on another device only reads the live record.
 */
export function useRunnerQuestRealtimeControl() {
  const { auth, db, uid, patient, connectionStatus, displayConnected, isOwner, claimOwnership, takeoverBlocked, getLive } = useLiveGameController();
  const [view, setView] = useState<ControlView | null>(null);
  const [runtime, setRuntime] = useState<ControlRuntime | null>(null);
  const [childName, setChildName] = useState("");
  const [publishError, setPublishError] = useState(false);

  const publisherRef = useRef<RunnerLivePublisher | null>(null);
  const endWorkflow = useRef<SessionWorkflowMetadata | undefined>(undefined);
  const savedSessions = useRef(new Set<string>());
  const canRun = auth.phase === "authorized" && isOwner;

  /** Saves a finished session to the patient's history exactly once (no-op without a selected patient). */
  const saveHistory = useCallback((s: Session) => {
    const { patientId, uid: who, therapistName } = getLive();
    const key = `${s.sessionId}:${s.runId}`;
    if (!s.summary || !patientId || !who || savedSessions.current.has(key)) return;
    savedSessions.current.add(key);
    const record = buildStoredRunnerQuestSession({
      summary: s.summary, sessionId: s.sessionId, runId: s.runId, startIndex: s.startIndex, startedAt: s.sessionEpoch, completedAt: Date.now(),
      patientId, createdByUid: who, therapistName, inputSource: s.settings.inputSource, workflow: endWorkflow.current,
    });
    void saveSessionHistoryOnce(patientId, record).catch((error: unknown) => {
      savedSessions.current.delete(key); // allow a retry on the next summary update
      console.warn("[runner-quest] saving the session history failed", error);
    });
  }, [getLive]);

  useEffect(() => {
    if (!canRun || !uid) return;
    const publisher = new RunnerLivePublisher({
      write: async ({ sessionId, revision, session }) => {
        await publishSession(db, { gameId: RUNNER_QUEST_3D_GAME_ID, sessionId, revision, session, lastInteraction: null, patientId: getLive().patientId });
        setPublishError(false);
      },
      fetchBaseRevision: async () => (await fetchLiveSession(db))?.revision ?? 0,
      now: () => Date.now(),
      onError: () => setPublishError(true),
    });
    publisherRef.current = publisher;
    let stopLoop: (() => void) | null = null;
    let rt: ControlRuntime | null = null;
    let cancelled = false;
    void (async () => {
      // Re-base on whatever is stored: the platform rule demands a strictly increasing revision across sessions.
      const base = (await fetchLiveSession(db).catch(() => null))?.revision ?? 0;
      if (cancelled) return;
      publisher.setBaseRevision(base);
      rt = new ControlRuntime({
        now: () => performance.now(), wall: () => Date.now(),
        send: (m) => { if (m.type === "state" && rt) publisher.setSessionMeta(rt.session.seed, rt.session.sessionEpoch); publisher.push(m); },
        ownerId: uid, newId: () => crypto.randomUUID(), seed: hashSeed(crypto.randomUUID()), settings: PRODUCTION_DEFAULT_SETTINGS,
        externalDisplayReady: () => getLive().ready,
        onView: setView,
      });
      stopLoop = attachBrowserLoop(rt);
      if (process.env.NODE_ENV === "development") (window as unknown as { __RQ3D_RT?: ControlRuntime }).__RQ3D_RT = rt; // validation hook, development only
      setRuntime(rt);
      setView(rt.view());
    })();
    return () => {
      cancelled = true;
      stopLoop?.();
      publisher.dispose();
      publisherRef.current = null;
      const finished = rt && (rt.session.lifecycle === "ready" || rt.session.lifecycle === "completed" || rt.session.lifecycle === "ended");
      if (rt && !finished) rt.command({ type: "end" }); // leaving mid-session ends it; the partial summary is saved here
      if (rt) saveHistory(rt.session);
      rt?.dispose();
      setRuntime(null);
      if (rt) void clearOwnedLiveSession(db, rt.session.sessionId).catch(() => {});
    };
  }, [canRun, db, uid, saveHistory, getLive]);

  // Publishing starts once the child's name is known; clearing it takes the record down again.
  const nameValid = childName.trim().length > 0;
  useEffect(() => {
    publisherRef.current?.setChildName(childName);
    publisherRef.current?.setEnabled(nameValid && canRun);
  }, [childName, nameValid, canRun, runtime]);
  useEffect(() => {
    if (runtime && !nameValid && view?.session.lifecycle === "ready") void clearOwnedLiveSession(db, runtime.session.sessionId).catch(() => {});
  }, [db, nameValid, runtime, view?.session.lifecycle]);

  // Prefill the name from the selected patient (or walk-in), once per patient, never over a typed name.
  const prefilledFor = useRef<string | null>(null);
  useEffect(() => {
    const key = patient.selectedPatient?.patientId ?? (patient.walkInName ? `walk:${patient.walkInName}` : null);
    if (!key || prefilledFor.current === key) return;
    prefilledFor.current = key;
    queueMicrotask(() => setChildName((cur) => (cur.trim().length === 0 ? (patient.selectedPatient?.firstName ?? patient.walkInName ?? "").slice(0, 30) : cur)));
  }, [patient.selectedPatient, patient.walkInName]);

  // History: saved exactly once when a session completes or is ended.
  // The runtime mutates its session in place, so depend on the summary VALUE (null -> object), not on the session reference.
  const summary = view?.session.summary ?? null;
  useEffect(() => { if (summary && view) saveHistory(view.session); }, [summary, view, saveHistory]);

  const endWithReason = useCallback((selection: EarlyEndSelection) => {
    endWorkflow.current = withEarlyEndReason(undefined, selection.reason, selection.customReason);
    runtime?.command({ type: "end" });
  }, [runtime]);

  useGameSwitchFinalizer(RUNNER_QUEST_3D_GAME_ID, runtime?.session.sessionId, canRun && connectionStatus === "connected" && !!runtime, () => endWithReason({ reason: "CHANGE_ACTIVITY", customReason: "" }));

  return {
    authPhase: auth.phase, runtime, view, childName, setChildName: (n: string) => setChildName(n.slice(0, 30)),
    connectionStatus, displayConnected, isOwner, claimOwnership, takeoverBlocked, endWithReason, publishError, hasPatient: !!patient.selectedPatient,
  };
}
