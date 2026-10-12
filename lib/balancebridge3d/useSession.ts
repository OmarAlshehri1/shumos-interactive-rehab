"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveGameController } from "@/lib/liveGame/useLiveGameController";
import { LiveRecordPublisher } from "@/lib/liveGame/publisher";
import { HistorySaver, type HistoryStatus } from "@/lib/liveGame/historySaver";
import {
  controlTabId,
  decideRecovery,
  isTakenOver,
  HEARTBEAT_MS,
} from "@/lib/liveGame/ownership";
import {
  fetchLiveSession,
  publishSession,
  subscribeToLiveSession,
} from "@/lib/realtime/sessionRepository";
import { getSessionHistoryRecord } from "@/lib/sessions/sessionHistoryRepository";
import { historyKeyForLive } from "@/lib/therapyVisits/gameSafety";
import { mayEnterBridge } from "./launchGuard";
import { saveSessionHistoryOnce } from "@/lib/sessions/sessionHistoryRepository";
import { createState, reduce, type Command, type State } from "./engine";
import {
  GAME_ID,
  encode,
  makeLive,
  recoveredState,
  reviveBridgeLive,
  type BridgeLiveSession,
} from "./live";
import { buildHistory } from "./history";

const TICK_MS = 100;
const PUBLISH_MIN_MS = 150;
/**
 * Control runtime for Balance Bridge 3D on the shared platform: staff auth, controller lease, Display presence,
 * the shared `/liveSession` record (via the generic publisher), reload recovery and save-once history.
 * The game itself lives in `engine.ts`; this hook only runs it and publishes it.
 */
export function useBridgeSession() {
  const c = useLiveGameController();
  const { db, uid, getLive } = c;
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryStatus>("not-ended");
  const [blocked, setBlocked] = useState(false);
  const [identity, setIdentity] = useState<{
    patientId: string | null;
    childName: string;
  } | null>(null);
  const op = useRef<(cmd: Command) => void>(() => {});
  const online = useRef(false);
  const stats = useRef({ writes: 0, startedAt: 0 });
  useEffect(() => {
    online.current = c.connectionStatus === "connected";
  }, [c.connectionStatus]);
  useEffect(() => {
    if (c.auth.phase !== "authorized" || !c.isOwner || !uid) return;
    let disposed = false;
    let ready = false;
    let current: State | null = null;
    let bound: string | null = null;
    let boundName = "";
    let lastPublish = 0;
    let dirty = false;
    const tab = controlTabId();
    const saver = new HistorySaver();
    const publisher = new LiveRecordPublisher<BridgeLiveSession>({
      write: async (w) => {
        await publishSession(db, {
          ...w,
          gameId: GAME_ID,
          lastInteraction: null,
          patientId: bound,
        });
        stats.current.writes++;
        if (!disposed) setError(null);
      },
      fetchBaseRevision: async () =>
        (await fetchLiveSession(db))?.revision ?? 0,
      now: Date.now,
      onError: (e) => {
        if (!disposed) setError(String(e));
      },
    });
    publisher.setTabId(tab);
    const save = () => {
      if (current?.status !== "ended") return;
      const snapshot = current;
      void saver
        .save(`${snapshot.sessionId}:${snapshot.run}`, bound, Date.now(), () =>
          saveSessionHistoryOnce(bound!, buildHistory(snapshot, bound!, uid)),
        )
        .then((v) => {
          if (!disposed) setHistory(v);
        });
    };
    const publish = () => {
      if (!current) return;
      publisher.publish(current.sessionId, (stamp) =>
        makeLive(current!, uid, boundName, stamp),
      );
      lastPublish = Date.now();
      dirty = false;
    };
    // Snapshot updates are coalesced to <= 6.7 writes/sec; idle states use shared ownership heartbeats.
    const sameForWire = (a: State, b: State) =>
      encode({ ...a, elapsed: 0 }) === encode({ ...b, elapsed: 0 });
    const change = (next: State) => {
      if (!current || next === current) return;
      if (!sameForWire(next, current)) dirty = true;
      current = next;
      if (next.status !== "ended") setHistory("not-ended");
      // an idle channel publishes at once, so a confirmed step reaches the Display without waiting for the next timer tick
      if (dirty && ready && Date.now() - lastPublish >= PUBLISH_MIN_MS)
        publish();
      setState(next);
      save();
    };
    const stop = subscribeToLiveSession(db, (record) => {
      if (current && record && record.gameId !== GAME_ID) {
        ready = false;
        publisher.setEnabled(false);
        setBlocked(true);
        return;
      }
      if (
        record?.gameId === GAME_ID &&
        isTakenOver((record.session as BridgeLiveSession).bb3, tab)
      ) {
        ready = false;
        publisher.setEnabled(false);
        setBlocked(true);
      }
    });
    void (async () => {
      try {
        const record = await fetchLiveSession(db);
        if (disposed) return;
        const oldKey = record ? historyKeyForLive(record) : null;
        const oldResult =
          record &&
          record.gameId !== GAME_ID &&
          record.patientId &&
          record.session.gameState === "SESSION_COMPLETE" &&
          oldKey
            ? await getSessionHistoryRecord(record.patientId, oldKey)
            : null;
        if (disposed) return;
        if (!mayEnterBridge(record, oldResult)) {
          setBlocked(true);
          return;
        }
        bound = getLive().patientId;
        boundName = getLive().childName;
        publisher.setBaseRevision(record?.revision ?? 0);
        const live =
          record?.gameId === GAME_ID ? reviveBridgeLive(record.session) : null;
        const snapshot = live ? recoveredState(live) : null;
        if (
          live &&
          record?.patientId !== bound &&
          snapshot?.status !== "ended"
        ) {
          setBlocked(true);
          return;
        }
        const decision = decideRecovery({
          recordSessionId: record?.sessionId ?? "",
          recordPatientId: record?.patientId ?? null,
          meta: live?.bb3 ?? { ownerId: "" },
          snapshot: snapshot
            ? { sessionId: snapshot.sessionId, state: snapshot }
            : null,
          uid,
          patientId: bound,
          tabId: tab,
          now: Date.now(),
        });
        if (decision.kind === "blocked") {
          setBlocked(true);
          return;
        }
        current =
          decision.kind === "recover"
            ? decision.snapshot.state
            : createState(crypto.randomUUID());
        if (decision.kind === "recover" && live)
          boundName = live.config.childFirstName;
        if (decision.kind === "recover")
          publisher.setTakeoverFrom(decision.fromTabId);
        stats.current.startedAt = Date.now();
        ready = true;
        setIdentity({ patientId: bound, childName: boundName });
        setState(current);
        publish();
        publisher.setEnabled(true);
        save();
      } catch (e) {
        if (!disposed) setError(String(e));
      }
    })();
    op.current = (command) => {
      if (!ready || !current || !online.current) return;
      if (command.type === "tick") return; // physical sources enter only through the runtime
      change(reduce(current, command));
    };
    const timer = setInterval(() => {
      if (!ready || !current) return;
      const now = Date.now();
      if (!online.current) {
        // Connection lost: freeze everything. Resuming needs an explicit therapist action.
        if (current.status === "running")
          change(reduce(current, { type: "pause" }));
        return;
      }
      if (current.status === "running")
        change(reduce(current, { type: "tick", at: now }));
      if (dirty && now - lastPublish >= PUBLISH_MIN_MS) publish();
      publisher.touch(HEARTBEAT_MS);
      save();
    }, TICK_MS);
    return () => {
      disposed = true;
      ready = false;
      clearInterval(timer);
      stop();
      publisher.dispose();
      op.current = () => {};
    };
  }, [c.auth.phase, c.isOwner, db, uid, getLive]);
  const send = useCallback((command: Command) => op.current(command), []);
  return {
    state,
    identity,
    send,
    error,
    history,
    blocked,
    connected: c.connectionStatus === "connected" && c.isOwner,
    displayConnected: c.displayConnected,
    writes: stats,
  };
}
