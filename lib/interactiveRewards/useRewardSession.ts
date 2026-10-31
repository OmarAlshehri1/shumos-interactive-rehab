'use client';
import { useGameSwitchFinalizer } from "@/components/control/visits/useGameSwitchFinalizer";
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveGameController } from '@/lib/liveGame/useLiveGameController';
import { LiveRecordPublisher } from '@/lib/liveGame/publisher';
import { HistorySaver, type HistoryStatus } from '@/lib/liveGame/historySaver';
import { controlTabId, decideRecovery, isTakenOver, HEARTBEAT_MS } from '@/lib/liveGame/ownership';
import { fetchLiveSession, publishSession, subscribeToLiveSession } from '@/lib/realtime/sessionRepository';
import { saveSessionHistoryOnce } from '@/lib/sessions/sessionHistoryRepository';
import { createState, reduce, type Command, type State } from '@/lib/achievementcity/engine';
import type { AnySessionState } from '@/lib/realtime/types';
import type { GameId } from '@/lib/games/registry';
import type { AnyStoredSession } from '@/lib/sessions/types';
import type { LiveControlMeta } from '@/lib/liveGame/ownership';
import { hasActivity as hasHistoryActivity } from '@/lib/achievementcity/engine';
import { ButtonEdgeDetector, DEFAULT_PAD_MAPPING, PAD_MAPPING_KEY, downSet, newlyPressedButton, sanitizePadMapping, type PadMapping, type PadStatus } from '@/lib/achievementcity/gamepad';

const LOOP_MS = 25; // one loop: gamepad sampling every pass, the game clock every 100 ms
const CLOCK_EVERY = 4;
const PUBLISH_MIN_MS = 60;
const RESYNC_MS = 2000;

/** Everything in a state the Display cannot extrapolate by itself. The running clock advances every tick and never forces a write. */
const wire = (s: State) => JSON.stringify({ ...s, clock: 0, levelClock0: 0, lastTick: 0 });

function loadMapping(): PadMapping {
  try {
    return sanitizePadMapping(JSON.parse(window.localStorage.getItem(PAD_MAPPING_KEY) ?? 'null')) ?? DEFAULT_PAD_MAPPING;
  } catch {
    return DEFAULT_PAD_MAPPING;
  }
}

/**
 * Control runtime on the shared platform: staff auth, controller lease, Display presence, the shared `/liveSession`
 * record (generic publisher), reload recovery, save-once history and the optional therapist-held controller. The game
 * lives in `engine.ts`; this hook only runs and publishes it. The Display animates from the state, nothing per frame.
 */
export interface RewardAdapter<L extends AnySessionState> {
  GAME_ID: GameId;
  encode: (s: State) => string;
  makeLive: (s: State, owner: string, child: string, stamp?: Partial<LiveControlMeta>) => L;
  revive: (raw: unknown) => L | null;
  recover: (raw: L) => State | null;
  meta: (raw: L) => LiveControlMeta;
  history: (s: State, patient: string, uid: string) => AnyStoredSession;
}
export function useRewardSession<L extends AnySessionState>(adapter: RewardAdapter<L>) {
  const { GAME_ID, makeLive, revive: reviveAchievementCityLive, recover: recoveredState, meta, history: buildHistory } = adapter;
  const c = useLiveGameController();
  const { db, uid, getLive } = c;
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryStatus>('not-ended');
  const [blocked, setBlocked] = useState(false);
  const [pad, setPad] = useState<{ status: PadStatus; mapping: PadMapping; learning: boolean }>({ status: 'none', mapping: DEFAULT_PAD_MAPPING, learning: false });
  const op = useRef<(cmd: Command) => void>(() => {});
  const online = useRef(false);
  const mappingRef = useRef<PadMapping>(DEFAULT_PAD_MAPPING);
  const learning = useRef(false);
  const stats = useRef({ writes: 0 });
  useEffect(() => {
    online.current = c.connectionStatus === 'connected';
  }, [c.connectionStatus]);
  useEffect(() => {
    mappingRef.current = loadMapping();
    queueMicrotask(() => setPad((p) => ({ ...p, mapping: mappingRef.current })));
  }, []);

  useEffect(() => {
    if (c.auth.phase !== 'authorized' || !c.isOwner || !uid) return;
    let disposed = false;
    let ready = false;
    let current: State | null = null;
    let bound: string | null = null;
    let lastPublish = 0;
    let lastUi = 0;
    let dirty = false;
    let pass = 0;
    let lastPadStatus: PadStatus = 'none';
    let learnBase: Set<number> = new Set();
    const tab = controlTabId();
    const saver = new HistorySaver();
    const edge = new ButtonEdgeDetector();
    const publisher = new LiveRecordPublisher<L>({
      write: async (w) => {
        await publishSession(db, { ...w, gameId: GAME_ID, lastInteraction: null, patientId: bound, therapistNotes: current?.notes ?? '' });
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
      if (current?.status !== 'ended' || !hasHistoryActivity(current)) return;
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
    const change = (next: State) => {
      if (!current || next === current) return;
      const structural = wire(next) !== wire(current);
      if (structural) dirty = true;
      current = next;
      const t = Date.now();
      if (structural || t - lastUi >= 200) {
        lastUi = t;
        setState(next);
      }
      // progress is published at once (never lose a confirmation to a throttle)
      if (structural && t - lastPublish >= PUBLISH_MIN_MS) publish();
      save();
    };

    const stop = subscribeToLiveSession(db, (record) => {
      if (record?.gameId === GAME_ID && isTakenOver(meta(record.session as L), tab)) {
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
        const live = record?.gameId === GAME_ID ? reviveAchievementCityLive(record.session) : null;
        const recovered = live ? recoveredState(live) : null;
        const snapshot = recovered ? { ...recovered, notes: record?.therapistNotes ?? recovered.notes } : null;
        const decision = decideRecovery({
          recordSessionId: record?.sessionId ?? '',
          recordPatientId: record?.patientId ?? null,
          meta: live ? meta(live) : { ownerId: '' },
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
      if (command.type === 'tick') return; // the clock comes only from the loop below
      change(reduce(current, command));
    };

    const readPad = () => {
      try {
        return typeof navigator.getGamepads === 'function' ? (navigator.getGamepads()[mappingRef.current.deviceIndex] ?? null) : null;
      } catch {
        return null; // an unsupported or denied Gamepad API leaves manual control as the only path
      }
    };

    const timer = setInterval(() => {
      if (!ready || !current) return;
      const now = Date.now();
      pass++;

      // ---- therapist-held controller: sampled here, in the one session loop ----
      const sample = readPad();
      const perf = performance.now();
      if (learning.current) {
        const idx = newlyPressedButton(sample, learnBase);
        learnBase = downSet(sample);
        if (idx >= 0) {
          mappingRef.current = { ...mappingRef.current, button: idx };
          try {
            window.localStorage.setItem(PAD_MAPPING_KEY, JSON.stringify(mappingRef.current));
          } catch { /* storage may be blocked */ }
          learning.current = false;
          edge.reset();
          setPad({ status: edge.status, mapping: mappingRef.current, learning: false });
        }
      }
      let pressed = false;
      if (current.config.inputSource === 'gamepad' && !learning.current) pressed = edge.push(sample, mappingRef.current, perf);
      else if (current.config.inputSource !== 'gamepad') { edge.push(sample, mappingRef.current, perf); edge.reset(); }
      if (edge.status !== lastPadStatus) {
        lastPadStatus = edge.status;
        setPad((p) => ({ ...p, status: edge.status }));
      }
      if (pressed && online.current && current.status === 'running') change(reduce(current, { type: 'confirm', at: now, viaPad: true }));

      if (pass % CLOCK_EVERY === 0) {
        if (!online.current) {
          // Connection lost: freeze everything. Resuming needs an explicit therapist action.
          if (current.status === 'running') change(reduce(current, { type: 'safety' }));
          return;
        }
        if (current.status === 'running') change(reduce(current, { type: 'tick', at: now }));
        if (now - lastPublish >= RESYNC_MS || (dirty && now - lastPublish >= PUBLISH_MIN_MS)) publish();
        publisher.touch(HEARTBEAT_MS);
        save();
      }
    }, LOOP_MS);

    learnBase = new Set();
    return () => {
      disposed = true;
      ready = false;
      clearInterval(timer);
      stop();
      publisher.dispose();
      op.current = () => {};
    };
  }, [c.auth.phase, c.isOwner, db, uid, getLive, GAME_ID, makeLive, reviveAchievementCityLive, recoveredState, meta, buildHistory]);

  const send = useCallback((command: Command) => op.current(command), []);
  useGameSwitchFinalizer(GAME_ID, state?.sessionId, !!state && c.connectionStatus === "connected" && c.isOwner && !blocked && hasHistoryActivity(state), () => send({ type: "end", at: Date.now() }));
  const learnButton = useCallback(() => {
    learning.current = true;
    setPad((p) => ({ ...p, learning: true }));
  }, []);
  const cancelLearn = useCallback(() => {
    learning.current = false;
    setPad((p) => ({ ...p, learning: false }));
  }, []);

  return {
    state,
    send,
    error,
    history,
    blocked,
    pad,
    learnButton,
    cancelLearn,
    connected: c.connectionStatus === 'connected' && c.isOwner,
    displayConnected: c.displayConnected,
    writes: stats,
  };
}
