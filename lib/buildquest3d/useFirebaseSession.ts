"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { BUILD_QUEST_GAME_ID } from "@/lib/games/registry";
import { LOCAL_POINTER_CHANNEL_NAME } from "@/lib/display/LocalPointerChannel";
import { decideRecovery, controlTabId, HEARTBEAT_MS, isTakenOver } from "@/lib/liveGame/ownership";
import { HistorySaver, type HistoryStatus } from "@/lib/liveGame/historySaver";
import { LiveRecordPublisher } from "@/lib/liveGame/publisher";
import { useLiveGameController } from "@/lib/liveGame/useLiveGameController";
import { clearLiveSession, fetchLiveSession, publishSession, subscribeToLiveSession } from "@/lib/realtime/sessionRepository";
import { saveSessionHistoryOnce } from "@/lib/sessions/sessionHistoryRepository";
import { action, configure, createState, input, type Action, type Config, type State } from "./gameplay";
import { buildQuestLiveSession, encodeAcceptedState, isBuildQuestLive, recoveredState, sanitizeChildName, type BuildQuestLiveSession, type LiveTimes } from "./cloudState";
import { buildStoredBuildQuestSession } from "./history";
import { applyManual, manualCommand, type ManualCommand } from "./manual";
import { BuildQuestSensor } from "./sensorInput";
import type { Pointer } from "./stages";

type Operation = Action | { config: Partial<Config>; stage?: number } | ManualCommand;

/**
 * Build Quest Control on the shared platform: staff auth, controller lease, presence, `/liveSession` publication,
 * window ownership and reload recovery, and history save-once all come from lib/liveGame and the original
 * sessionRepository. This hook keeps only what is Build Quest: the gameplay state machine, manual priority over
 * RIGHT_HAND, and when a session counts as started/ended. The exported API is unchanged from the previous
 * dedicated-room version, so the Control screen is unaffected.
 */
export function useFirebaseBuildQuestSession(_authority: boolean, patientId: string | null = null) {
  void _authority; void patientId;
  const c = useLiveGameController();
  const [state, setState] = useState<State | null>(null), [connected, setConnected] = useState(false),
    [sensorStatus, setSensorStatus] = useState("waiting"), [error, setError] = useState<string | null>(null),
    [pending, setPending] = useState(false), [historyStatus, setHistoryStatus] = useState<HistoryStatus>("not-ended");
  const [recovered, setRecovered] = useState(false), [recoveryBlocked, setRecoveryBlocked] = useState(false),
    [forceRecover, setForceRecover] = useState(false), [superseded, setSuperseded] = useState(false), [takeoverAllowed, setTakeoverAllowed] = useState(true);
  const supersededRef = useRef(false);
  const op = useRef<(a: Operation) => void>(() => {}), pointer = useRef<(p: Pointer, activate: boolean) => void>(() => {});
  const online = c.connectionStatus === "connected";
  const onlineRef = useRef(online);
  const offlinePause = useRef<() => void>(() => {});
  useEffect(() => {
    onlineRef.current = online;
    if (!online) offlinePause.current();
  }, [online]);

  const canRun = c.auth.phase === "authorized" && c.isOwner && !superseded;
  const { db, uid, getLive } = c;
  useEffect(() => {
    if (!canRun || !uid) return;
    let disposed = false, ready = false, current: State | null = null, manualUntil = 0, lastBeat = 0, bound: string | null = null;
    const tabId = controlTabId();
    const times: LiveTimes = { createdAt: Date.now(), startedAt: 0, endedAt: 0, startingStage: 0 };
    const history = new HistorySaver();
    const sensor = new BuildQuestSensor();
    const sensorChannel = new BroadcastChannel(LOCAL_POINTER_CHANNEL_NAME);
    sensorChannel.onmessage = (e) => sensor.accept(e.data);
    const childName = () => sanitizeChildName(getLive().childName);
    const publisher = new LiveRecordPublisher<BuildQuestLiveSession>({
      write: async ({ sessionId, revision, session }) => {
        await publishSession(db, { gameId: BUILD_QUEST_GAME_ID, sessionId, revision, session, lastInteraction: null, patientId: bound });
        if (!disposed) { setError(null); setPending(false); }
      },
      fetchBaseRevision: async () => (await fetchLiveSession(db))?.revision ?? 0,
      now: () => Date.now(),
      onError: (e) => { if (!disposed) setError(e instanceof Error ? e.message : "تعذّر مزامنة الجلسة"); },
    });
    publisher.setTabId(tabId);
    const canEdit = () => ready && onlineRef.current && !supersededRef.current;
    const publish = (s: State) => {
      if (s.status === "running" && !times.startedAt) { times.startedAt = Date.now(); times.startingStage = s.stage; }
      if (s.status === "ended" && !times.endedAt) times.endedAt = Date.now();
      setPending(true);
      publisher.publish(s.session, (stamp) => buildQuestLiveSession(s, childName(), uid, times, stamp));
    };
    const saveHistory = () => {
      const s = current;
      if (!s || s.status !== "ended" || !ready) return;
      const record = buildQuestLiveSession(s, childName(), uid, times, {});
      void history.save(s.session, bound, Date.now(), () => saveSessionHistoryOnce(bound!, buildStoredBuildQuestSession(record, bound!, times.startingStage, uid)))
        .then((status) => { if (!disposed) { setHistoryStatus(status); if (status === "retry") setError("تعذّر حفظ النتيجة"); } });
    };
    const show = (s: State) => { current = s; setState(s); };
    const change = (next: State) => {
      if (!current || next === current) return;
      const changed = encodeAcceptedState(next) !== encodeAcceptedState(current);
      show(next);
      if (changed) { publish(next); saveHistory(); }
    };
    offlinePause.current = () => { if (current && ready && current.status === "running") change(action(current, "pause")); };

    const stops: Array<() => void> = [];
    void (async () => {
      const stored = await fetchLiveSession(db).catch(() => null);
      if (disposed) return;
      publisher.setBaseRevision(stored?.revision ?? 0);
      bound = getLive().patientId;
      const mine = stored && stored.gameId === BUILD_QUEST_GAME_ID && isBuildQuestLive(stored.session) ? (stored.session as BuildQuestLiveSession) : null;
      let adopted = mine ? recoveredState(mine) : null;
      if (mine && adopted?.status === "ended") {
        // A finished session is never reopened: start fresh. Its history is saved once (idempotent) in case the earlier save never completed.
        const finished = mine, owner = finished.build3.ownerId;
        if (owner === uid && stored?.patientId && stored.patientId === bound) {
          const record = buildStoredBuildQuestSession(finished, stored.patientId, finished.build3.startingStage, uid);
          void saveSessionHistoryOnce(stored.patientId, record).catch(() => {});
        }
        adopted = null;
      }
      const decision = decideRecovery({
        recordSessionId: stored?.sessionId ?? "", recordPatientId: stored?.patientId ?? null, meta: mine?.build3 ?? { ownerId: "" },
        snapshot: mine && adopted ? { sessionId: mine.sessionId, state: adopted, block: mine.build3, createdAt: mine.createdAt } : null,
        uid, patientId: bound, tabId, now: Date.now(), force: forceRecover,
      });
      if (decision.kind === "blocked") { setTakeoverAllowed(decision.takeoverAllowed); setRecoveryBlocked(true); return; }
      setRecoveryBlocked(false);
      let initial: State;
      if (decision.kind === "recover") {
        const b = decision.snapshot.block;
        Object.assign(times, { createdAt: decision.snapshot.createdAt, startedAt: b.startedAt, endedAt: b.endedAt, startingStage: b.startingStage });
        publisher.setTakeoverFrom(decision.fromTabId);
        initial = decision.snapshot.state;
        setRecovered(true);
      } else {
        initial = createState(crypto.randomUUID());
      }
      sensor.rearm(initial.pointer);
      stops.push(subscribeToLiveSession(db, (record) => {
        const meta = record && isBuildQuestLive(record.session) ? (record.session as BuildQuestLiveSession).build3 : null;
        // Only an explicit hand-over naming THIS window stands it down.
        if (isTakenOver(meta, tabId) && record && current && record.sessionId === current.session) { supersededRef.current = true; setSuperseded(true); }
      }));
      ready = true;
      show(initial);
      publish(initial);
      publisher.setBaseRevision(stored?.revision ?? 0);
      publisher.setEnabled(true);
      setConnected(true);
      saveHistory();
    })();

    op.current = (a) => {
      if (!canEdit() || !current) return;
      if (typeof a === "object" && "kind" in a) {
        manualUntil = Date.now() + 1800; sensor.rearm(current.pointer); change(applyManual(current, a));
      } else {
        change(typeof a === "string" ? action(current, a) : configure(current, a.config, a.stage));
        manualUntil = 0; sensor.rearm(current.pointer);
      }
    };
    pointer.current = (p, activate) => {
      if (!canEdit() || !current) return;
      // Manual workbench motion always has priority, including when RIGHT_HAND is selected.
      manualUntil = Date.now() + 1800; change(input(current, p, 0, activate));
    };
    const timer = setInterval(() => {
      if (disposed) return;
      const sensorNow = sensor.sample(); setSensorStatus(sensor.status);
      setConnected(canEdit());
      if (canEdit() && current) {
        if (current.config.input === "sensor" && Date.now() > manualUntil) change(input(current, sensorNow, 33));
        if (Date.now() - lastBeat >= 1000) { lastBeat = Date.now(); publisher.touch(HEARTBEAT_MS); }
        if (current.status === "ended") saveHistory();
      }
    }, 33);
    return () => {
      disposed = true; clearInterval(timer); stops.forEach((stop) => stop()); sensorChannel.close();
      op.current = () => {}; pointer.current = () => {}; offlinePause.current = () => {};
      publisher.dispose();
      if (supersededRef.current) return; // another window owns the session now: no end, no save, no clearing
      if (current && ready) {
        // Leaving mid-session ends it (partial result saved once); the shared record is then cleared.
        const finalState = current.status === "ready" || current.status === "ended" ? current : action(current, "end");
        if (finalState !== current) { current = finalState; if (!times.endedAt) times.endedAt = Date.now(); }
        if (finalState.status === "ended" && bound) {
          const record = buildQuestLiveSession(finalState, childName(), uid, times, {});
          void saveSessionHistoryOnce(bound, buildStoredBuildQuestSession(record, bound, times.startingStage, uid)).catch(() => {});
        }
        void (async () => {
          const stored = await fetchLiveSession(db).catch(() => null);
          if (stored && stored.sessionId === finalState.session) await clearLiveSession(db).catch(() => {});
        })();
      }
    };
  }, [canRun, db, uid, forceRecover, getLive]);

  const act = useCallback((a: Action) => op.current(a), []);
  const updateConfig = useCallback((config: Partial<Config>, stage?: number) => op.current({ config, stage }), []);
  const sendPointer = useCallback((p: Pointer, activate = false) => pointer.current(p, activate), []);
  const selectPiece = useCallback((id: string) => { if (state) op.current(manualCommand(state, "select", id)); }, [state]);
  const placePiece = useCallback((id: string) => { if (state) op.current(manualCommand(state, "place", id)); }, [state]);
  return {
    state, connected, sensorStatus, act, configure: updateConfig, sendPointer, selectPiece, placePiece, pending, error, historyStatus, cloud: true,
    recovered, recoveryBlocked: recoveryBlocked && !state, takeoverAllowed, superseded, takeOver: () => setForceRecover(true), displayConnected: c.displayConnected,
  };
}
