"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { attachBrowserLoop } from "@/lib/balloonquest/controlMount";
import { ControlRuntime, type ControlView } from "@/lib/balloonquest/controlRuntime";
import { LivePublisher } from "@/lib/balloonquest/live";
import { evaluateRecovery, HEARTBEAT_MS, serializeSession } from "@/lib/balloonquest/recovery";
import { controlTabId, isTakenOver } from "@/lib/liveGame/ownership";
import { useLiveGameController } from "@/lib/liveGame/useLiveGameController";
import type { Session } from "@/lib/balloonquest/types";
import { hashSeed } from "@/lib/balloonquest/rng";
import type { TherapistSettings } from "@/lib/balloonquest/types";
import { BALLOON_QUEST_GAME_ID } from "@/lib/games/registry";
import { clearLiveSession, fetchLiveSession, publishSession, subscribeToLiveSession } from "@/lib/realtime/sessionRepository";
import { buildStoredBalloonQuest3DSession } from "@/lib/sessions/buildStoredBalloonQuest3DSession";
import { saveSessionHistoryOnce } from "@/lib/sessions/sessionHistoryRepository";
import { withEarlyEndReason, type EarlyEndSelection, type SessionWorkflowMetadata } from "@/lib/sessions/workflowMetadata";

/** Production default: the therapist drives the session from the preview unless a sensor mode is chosen. */
export const PRODUCTION_DEFAULT_SETTINGS: Partial<TherapistSettings> = { inputMode: "therapist" };

/**
 * Production controller for the redesigned Balloon Quest. Same platform
 * plumbing as every other game (staff auth, single-controller lease,
 * connection + display presence, `/liveSession`, per-patient history), around
 * the DOM-free ControlRuntime that owns simulation time, hit-testing and scoring.
 */
export function useBalloonQuest3DRealtimeControl() {
  const { auth, db, uid, patient, connectionStatus, displayConnected, isOwner, claimOwnership, takeoverBlocked, getLive } = useLiveGameController();
  const [view, setView] = useState<ControlView | null>(null);
  const [runtime, setRuntime] = useState<ControlRuntime | null>(null);
  const [childName, setChildName] = useState("");
  /** A session found in the live record was adopted (paused) after this Control was reloaded. */
  const [recovered, setRecovered] = useState(false);
  /** An unfinished session belongs to another Control window that still looks alive. */
  const [recoveryBlocked, setRecoveryBlocked] = useState(false);
  const [takeoverAllowed, setTakeoverAllowed] = useState(true);
  const [forceRecover, setForceRecover] = useState(false);
  /** Another window took this session over: this one must stop publishing without ending or saving it. */
  const [superseded, setSuperseded] = useState(false);
  const supersededRef = useRef(false);
  const tabIdRef = useRef<string>("");

  const publisherRef = useRef<LivePublisher | null>(null);
  const endWorkflow = useRef<SessionWorkflowMetadata | undefined>(undefined);
  const savedSessions = useRef(new Set<string>());

  // ---- runtime + publisher: created once the therapist is an authorized lease owner ----
  const canRun = auth.phase === "authorized" && isOwner && !superseded;
  /** Saves a finished session to the patient's history exactly once (no-op without a selected patient). */
  const saveHistory = useCallback((s: Session) => {
    const { patientId, uid: who, therapistName } = getLive();
    const key = `${s.sessionId}:${s.runId}`; // each run of a session is its own history record
    if (!s.summary || !patientId || !who || savedSessions.current.has(key)) return;
    savedSessions.current.add(key);
    const record = buildStoredBalloonQuest3DSession({
      summary: s.summary, startIndex: s.startIndex, startedAt: s.sessionEpoch, completedAt: Date.now(), patientId, createdByUid: who, therapistName, workflow: endWorkflow.current,
    });
    void saveSessionHistoryOnce(patientId, record).catch(() => savedSessions.current.delete(key));
  }, [getLive]);
  useEffect(() => {
    if (!canRun || !uid) return;
    const publisher = new LivePublisher({
      write: async ({ sessionId, revision, session }) => {
        await publishSession(db, { gameId: BALLOON_QUEST_GAME_ID, sessionId, revision, session, lastInteraction: null, patientId: getLive().patientId });
      },
      fetchBaseRevision: async () => (await fetchLiveSession(db))?.revision ?? 0,
      now: () => Date.now(),
    });
    publisherRef.current = publisher;
    if (!tabIdRef.current) tabIdRef.current = controlTabId();
    const tabId = tabIdRef.current;
    publisher.setTabId(tabId);
    let stopLoop: (() => void) | null = null;
    let rt: ControlRuntime | null = null;
    let cancelled = false;
    void (async () => {
      // Re-base on whatever is stored (the revision rule demands a strictly increasing value across games and sessions).
      const stored = await fetchLiveSession(db).catch(() => null);
      if (cancelled) return;
      publisher.setBaseRevision(stored?.revision ?? 0);
      // An unfinished session of this account and patient: adopt it (paused) instead of starting over.
      const decision = evaluateRecovery({
        record: stored && stored.session && "bq3" in stored.session ? { gameId: stored.gameId, sessionId: stored.sessionId, patientId: stored.patientId, session: stored.session as never } : null,
        uid, patientId: getLive().patientId, tabId, now: Date.now(), force: forceRecover,
      });
      if (decision.kind === "blocked") {
        setTakeoverAllowed(decision.takeoverAllowed);
        setRecoveryBlocked(true);
        return;
      }
      setRecoveryBlocked(false);
      rt = new ControlRuntime({
        now: () => performance.now(),
        wall: () => Date.now(),
        send: (m) => {
          if (m.type === "state" && rt) {
            publisher.setSessionMeta(rt.session.seed, rt.session.sessionEpoch);
            publisher.setSnapshot(serializeSession(rt.session));
          }
          publisher.push(m);
        },
        ownerId: uid,
        newId: () => crypto.randomUUID(),
        seed: hashSeed(crypto.randomUUID()),
        settings: PRODUCTION_DEFAULT_SETTINGS,
        externalDisplayReady: () => getLive().ready,
        onView: setView,
      });
      if (decision.kind === "recover") {
        publisher.setTakeoverFrom(decision.fromTabId);
        rt.adopt(decision.session);
        setChildName(decision.childName);
        setRecovered(true);
      }
      stopLoop = attachBrowserLoop(rt);
      setRuntime(rt);
      setView(rt.view());
    })();
    return () => {
      cancelled = true;
      stopLoop?.();
      publisher.dispose();
      publisherRef.current = null;
      if (supersededRef.current) {
        // Another window owns the session now: stand down without ending it, saving it or clearing the shared record.
        rt?.dispose();
        setRuntime(null);
        return;
      }
      const finished = rt && (rt.session.lifecycle === "ready" || rt.session.lifecycle === "completed" || rt.session.lifecycle === "ended");
      if (rt && !finished) rt.command({ type: "end" }); // leaving mid-session ends it; the partial summary is saved here because the UI effect below is gone by now
      if (rt) saveHistory(rt.session);
      rt?.dispose();
      setRuntime(null);
      if (rt) void clearLiveSession(db).catch(() => {});
    };
  }, [canRun, db, uid, saveHistory, forceRecover, getLive]);

  // Liveness for a reloaded or second window: the record is rewritten at least every HEARTBEAT_MS while a session exists.
  useEffect(() => {
    if (!runtime) return;
    const timer = setInterval(() => publisherRef.current?.touch(HEARTBEAT_MS), 1000);
    return () => clearInterval(timer);
  }, [runtime]);

  // Another window adopting this window's session (same session id, different window id) supersedes it.
  useEffect(() => {
    if (!runtime || auth.phase !== "authorized") return;
    return subscribeToLiveSession(db, (record) => {
      const b = record && record.session && "bq3" in record.session ? (record.session as { bq3: { takeoverFrom?: string } }).bq3 : null;
      // Only an explicit hand-over naming THIS window stands it down (never merely a different window id).
      if (!record || !isTakenOver(b, tabIdRef.current)) return;
      if (record.sessionId !== runtime.session.sessionId) return;
      supersededRef.current = true;
      setSuperseded(true);
    });
  }, [auth.phase, db, runtime]);

  // Publishing starts once the child's name is known; clearing it takes the record down again.
  const nameValid = childName.trim().length > 0;
  useEffect(() => {
    publisherRef.current?.setChildName(childName);
    publisherRef.current?.setEnabled(nameValid && canRun);
  }, [childName, nameValid, canRun, runtime]);
  useEffect(() => {
    if (runtime && !nameValid && view?.session.lifecycle === "ready") void clearLiveSession(db).catch(() => {});
  }, [db, nameValid, runtime, view?.session.lifecycle]);

  // Prefill the name from the selected patient (or the walk-in name), once per patient — never over a typed name.
  const prefilledFor = useRef<string | null>(null);
  useEffect(() => {
    const key = patient.selectedPatient?.patientId ?? (patient.walkInName ? `walk:${patient.walkInName}` : null);
    if (!key || prefilledFor.current === key) return;
    prefilledFor.current = key;
    queueMicrotask(() => setChildName((current) => (current.trim().length === 0 ? (patient.selectedPatient?.firstName ?? patient.walkInName ?? "").slice(0, 30) : current)));
    // A resume suggestion only ever comes from three-stage history; ignore anything outside the 3-stage model.
    const r = patient.selectedPatient?.resumeSuggestion;
    if (runtime && r && r.startingStage <= 3) runtime.command({ type: "start-at", difficulty: r.difficulty as "EASY" | "MEDIUM" | "ADVANCED", stage: r.startingStage as 1 | 2 | 3 });
  }, [patient.selectedPatient, patient.walkInName, runtime]);

  // ---- per-patient history: saved exactly once when a session completes or is ended ----
  useEffect(() => {
    if (view?.session.summary) saveHistory(view.session);
  }, [view?.session, saveHistory]);

  const endWithReason = useCallback((selection: EarlyEndSelection) => {
    endWorkflow.current = withEarlyEndReason(undefined, selection.reason, selection.customReason);
    runtime?.command({ type: "end" });
  }, [runtime]);


  return {
    authPhase: auth.phase,
    runtime,
    view,
    childName,
    setChildName: (n: string) => setChildName(n.slice(0, 30)),
    connectionStatus,
    displayConnected,
    isOwner,
    claimOwnership,
    takeoverBlocked,
    recovered: recovered && !superseded,
    recoveryBlocked,
    takeoverAllowed,
    superseded,
    takeOverSession: () => setForceRecover(true),
    endWithReason,
    hasPatient: !!patient.selectedPatient,
  };
}
