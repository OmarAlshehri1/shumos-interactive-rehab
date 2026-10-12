'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveGameController } from '@/lib/liveGame/useLiveGameController';
import { LiveRecordPublisher } from '@/lib/liveGame/publisher';
import { HistorySaver, type HistoryStatus } from '@/lib/liveGame/historySaver';
import { controlTabId, decideRecovery, isTakenOver, HEARTBEAT_MS } from '@/lib/liveGame/ownership';
import { fetchLiveSession, publishSession, subscribeToLiveSession } from '@/lib/realtime/sessionRepository';
import { saveSessionHistoryOnce } from '@/lib/sessions/sessionHistoryRepository';
import { createState, reduce, type Command, type State } from './engine';
import { GAME_ID, encode, makeLive, recoveredState, reviveHexLive, type HexLiveSession } from './live';
import { buildHistory, hasActivity } from './history';
import { FootMovementDetector, SimulatedFootSource, rolesForMode, type FootRole } from './sensorInput';

export interface SimState {
  moving: Record<FootRole, boolean>;
  connected: Record<FootRole, boolean>;
}
const SIM_INITIAL: SimState = { moving: { RIGHT_FOOT: false, LEFT_FOOT: false }, connected: { RIGHT_FOOT: true, LEFT_FOOT: true } };
const TICK_MS = 50;
const PUBLISH_MIN_MS = 120;

/**
 * Control runtime for Safe Hex Arena on the shared platform: staff auth, controller lease, Display presence,
 * the shared `/liveSession` record (via the generic publisher), reload recovery and save-once history.
 * The game itself lives in `engine.ts`; this hook only runs it and publishes it.
 */
export function useHexSession() {
  const c = useLiveGameController();
  const { db, uid, getLive } = c;
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryStatus>('not-ended');
  const [blocked, setBlocked] = useState(false);
  const [sim, setSim] = useState<SimState>(SIM_INITIAL);
  const op = useRef<(cmd: Command) => void>(() => {});
  const simRef = useRef<SimState>(SIM_INITIAL);
  const online = useRef(false);
  const stats = useRef({ writes: 0, startedAt: 0 });
  useEffect(() => {
    online.current = c.connectionStatus === 'connected';
  }, [c.connectionStatus]);

  useEffect(() => {
    if (c.auth.phase !== 'authorized' || !c.isOwner || !uid) return;
    let disposed = false;
    let ready = false;
    let current: State | null = null;
    let bound: string | null = null;
    let lastPublish = 0;
    let dirty = false;
    const tab = controlTabId();
    const saver = new HistorySaver();
    const detector = new FootMovementDetector('MANUAL');
    const source = new SimulatedFootSource();
    let detectorKey = '';
    const publisher = new LiveRecordPublisher<HexLiveSession>({
      write: async (w) => {
        await publishSession(db, { ...w, gameId: GAME_ID, lastInteraction: null, patientId: bound });
        stats.current.writes++;
        if (!disposed) setError(null);
      },
      fetchBaseRevision: async () => (await fetchLiveSession(db))?.revision ?? 0,
      now: Date.now,
      onError: (e) => {
        if (!disposed) setError(String(e));
      },
    });
    publisher.setTabId(tab);

    const save = () => {
      if (current?.status !== 'ended' || !hasActivity(current)) return;
      const snapshot = current;
      void saver
        .save(`${snapshot.sessionId}:${snapshot.run}`, bound, Date.now(), () => saveSessionHistoryOnce(bound!, buildHistory(snapshot, bound!, uid)))
        .then((v) => {
          if (!disposed) setHistory(v);
        });
    };
    const publish = () => {
      if (!current) return;
      publisher.publish(current.sessionId, (stamp) => makeLive(current!, uid, getLive().childName, stamp));
      lastPublish = Date.now();
      dirty = false;
    };
    // `elapsed` and `lastTick` advance every tick; the Display extrapolates them, so they never force a write.
    const sameForWire = (a: State, b: State) => encode({ ...a, elapsed: 0 }) === encode({ ...b, elapsed: 0 });
    const change = (next: State) => {
      if (!current || next === current) return;
      if (!sameForWire(next, current)) dirty = true;
      current = next;
      setState(next);
      save();
    };

    const stop = subscribeToLiveSession(db, (record) => {
      if (record?.gameId === GAME_ID && isTakenOver((record.session as HexLiveSession).hex3, tab)) {
        ready = false;
        publisher.setEnabled(false);
        setBlocked(true);
      }
    });

    void (async () => {
      try {
        const record = await fetchLiveSession(db);
        if (disposed) return;
        bound = getLive().patientId;
        publisher.setBaseRevision(record?.revision ?? 0);
        const live = record?.gameId === GAME_ID ? reviveHexLive(record.session) : null;
        const snapshot = live ? recoveredState(live) : null;
        const decision = decideRecovery({
          recordSessionId: record?.sessionId ?? '',
          recordPatientId: record?.patientId ?? null,
          meta: live?.hex3 ?? { ownerId: '' },
          snapshot: snapshot ? { sessionId: snapshot.sessionId, state: snapshot } : null,
          uid,
          patientId: bound,
          tabId: tab,
          now: Date.now(),
        });
        if (decision.kind === 'blocked') {
          setBlocked(true);
          return;
        }
        current = decision.kind === 'recover' ? decision.snapshot.state : createState(crypto.randomUUID());
        if (decision.kind === 'recover') publisher.setTakeoverFrom(decision.fromTabId);
        stats.current.startedAt = Date.now();
        ready = true;
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
      if (command.type === 'sensor') return; // sensor events come only from the detector below
      change(reduce(current, command));
    };

    const timer = setInterval(() => {
      if (!ready || !current) return;
      const now = Date.now();
      if (!online.current) {
        // Connection lost: freeze everything. Resuming needs an explicit therapist action.
        if (current.status === 'running') change(reduce(current, { type: 'safety' }));
        return;
      }
      if (current.status === 'running') change(reduce(current, { type: 'tick', at: now }));

      // Foot sensor path (simulated source today): hints only, and manual play never depends on it.
      const key = `${current.config.inputMode}:${current.config.inputSource}`;
      if (key !== detectorKey) {
        detectorKey = key;
        detector.setMode(current.config.inputSource === 'simulated' ? current.config.inputMode : 'MANUAL');
      }
      if (current.config.inputSource === 'simulated') {
        for (const role of rolesForMode(current.config.inputMode)) {
          const sample = source.sample(role, simRef.current.moving[role] ? 0.8 : 0.02, now);
          if (sample) for (const e of detector.push(sample)) change(reduce(current, { type: 'sensor', ...e }));
        }
        for (const e of detector.poll(now)) change(reduce(current, { type: 'sensor', ...e }));
      }

      if (dirty && now - lastPublish >= PUBLISH_MIN_MS) publish();
      publisher.touch(HEARTBEAT_MS);
      save();
    }, TICK_MS);

    // the simulator's connection switches are read from simRef by the same loop
    const syncSource = setInterval(() => {
      for (const role of ['RIGHT_FOOT', 'LEFT_FOOT'] as const) source.setConnected(role, simRef.current.connected[role]);
    }, TICK_MS);

    return () => {
      disposed = true;
      ready = false;
      clearInterval(timer);
      clearInterval(syncSource);
      stop();
      publisher.dispose();
      op.current = () => {};
    };
  }, [c.auth.phase, c.isOwner, db, uid, getLive]);

  const send = useCallback((command: Command) => op.current(command), []);
  const setSimulated = useCallback((patch: Partial<SimState>) => {
    simRef.current = { ...simRef.current, ...patch };
    setSim(simRef.current);
  }, []);

  return {
    state,
    send,
    error,
    history,
    blocked,
    sim,
    setSimulated,
    connected: c.connectionStatus === 'connected' && c.isOwner,
    displayConnected: c.displayConnected,
    writes: stats,
  };
}
