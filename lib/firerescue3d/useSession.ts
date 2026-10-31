'use client';
import { useGameSwitchFinalizer } from "@/components/control/visits/useGameSwitchFinalizer";
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveGameController } from '@/lib/liveGame/useLiveGameController';
import { LiveRecordPublisher } from '@/lib/liveGame/publisher';
import { HistorySaver, type HistoryStatus } from '@/lib/liveGame/historySaver';
import { controlTabId, decideRecovery, isTakenOver, HEARTBEAT_MS } from '@/lib/liveGame/ownership';
import { fetchLiveSession, publishSession, subscribeToLiveSession } from '@/lib/realtime/sessionRepository';
import { saveSessionHistoryOnce } from '@/lib/sessions/sessionHistoryRepository';
import { createState, reduce, type Command, type State } from './engine';
import { GAME_ID, encode, makeLive, recoveredState, reviveFireLive, type FireLiveSession } from './live';
import { buildHistory } from './history';
import { DEFAULT_MAPPING, sampleGamepad, type Mapping, handAim } from './input';
const TICK_MS = 50;
const PUBLISH_MIN_MS = 150;
/**
 * Control runtime for Fire Rescue 3D on the shared platform: staff auth, controller lease, Display presence,
 * the shared `/liveSession` record (via the generic publisher), reload recovery and save-once history.
 * The game itself lives in `engine.ts`; this hook only runs it and publishes it.
 */
export function useFireRescueSession() {
    const c = useLiveGameController();
    const { db, uid, getLive } = c;
    const [state, setState] = useState<State | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [history, setHistory] = useState<HistoryStatus>('not-ended');
    const [blocked, setBlocked] = useState(false);
    const [identity, setIdentity] = useState<{
        patientId: string | null;
        childName: string;
    } | null>(null);
    const op = useRef<(cmd: Command) => void>(() => { });
    const hardwareRef = useRef<{
        mapping: Mapping;
        pointer: {
            x: number;
            y: number;
            fresh: boolean;
        } | null;
    }>({ mapping: DEFAULT_MAPPING, pointer: null });
    const online = useRef(false);
    const stats = useRef({ writes: 0, startedAt: 0 });
    useEffect(() => {
        online.current = c.connectionStatus === 'connected';
    }, [c.connectionStatus]);
    useEffect(() => {
        if (c.auth.phase !== 'authorized' || !c.isOwner || !uid)
            return;
        let disposed = false;
        let ready = false;
        let current: State | null = null;
        let bound: string | null = null;
        let boundName = "";
        let lastPublish = 0;
        let dirty = false;
        const tab = controlTabId();
        const saver = new HistorySaver();
        const publisher = new LiveRecordPublisher<FireLiveSession>({
            write: async (w) => {
                await publishSession(db, { ...w, gameId: GAME_ID, lastInteraction: null, patientId: bound });
                stats.current.writes++;
                if (!disposed)
                    setError(null);
            },
            fetchBaseRevision: async () => (await fetchLiveSession(db))?.revision ?? 0,
            now: Date.now,
            onError: (e) => {
                if (!disposed)
                    setError(String(e));
            },
        });
        publisher.setTabId(tab);
        const save = () => {
            if (current?.status !== 'ended')
                return;
            const snapshot = current;
            void saver
                .save(`${snapshot.sessionId}:${snapshot.run}`, bound, Date.now(), () => saveSessionHistoryOnce(bound!, buildHistory(snapshot, bound!, uid)))
                .then((v) => {
                if (!disposed)
                    setHistory(v);
            });
        };
        const publish = () => {
            if (!current)
                return;
            publisher.publish(current.sessionId, (stamp) => makeLive(current!, uid, boundName, stamp));
            lastPublish = Date.now();
            dirty = false;
        };
        // Timer metadata alone never forces a write; gameplay changes are coalesced to <= 6.7 writes/sec.
        const sameForWire = (a: State, b: State) => encode({ ...a, elapsed: 0 }) === encode({ ...b, elapsed: 0 });
        const change = (next: State) => {
            if (!current || next === current)
                return;
            if (!sameForWire(next, current))
                dirty = true;
            current = next;
            if (next.status !== 'ended')
                setHistory('not-ended');
            // an idle channel publishes at once, so a confirmed step reaches the Display without waiting for the next timer tick
            if (dirty && ready && Date.now() - lastPublish >= PUBLISH_MIN_MS)
                publish();
            setState(next);
            save();
        };
        const stop = subscribeToLiveSession(db, (record) => {
            if (record?.gameId === GAME_ID && isTakenOver((record.session as FireLiveSession).fr3, tab)) {
                ready = false;
                publisher.setEnabled(false);
                setBlocked(true);
            }
        });
        void (async () => {
            try {
                const record = await fetchLiveSession(db);
                if (disposed)
                    return;
                bound = getLive().patientId;
                boundName = getLive().childName;
                publisher.setBaseRevision(record?.revision ?? 0);
                const live = record?.gameId === GAME_ID ? reviveFireLive(record.session) : null;
                const snapshot = live ? recoveredState(live) : null;
                if (live && record?.patientId !== bound && snapshot?.status !== 'ended') {
                    setBlocked(true);
                    return;
                }
                const decision = decideRecovery({
                    recordSessionId: record?.sessionId ?? '',
                    recordPatientId: record?.patientId ?? null,
                    meta: live?.fr3 ?? { ownerId: '' },
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
                if (decision.kind === 'recover' && live)
                    boundName = live.config.childFirstName;
                if (decision.kind === 'recover')
                    publisher.setTakeoverFrom(decision.fromTabId);
                stats.current.startedAt = Date.now();
                ready = true;
                setIdentity({ patientId: bound, childName: boundName });
                setState(current);
                publish();
                publisher.setEnabled(true);
                save();
            }
            catch (e) {
                if (!disposed)
                    setError(String(e));
            }
        })();
        op.current = (command) => {
            if (!ready || !current || !online.current)
                return;
            if (command.type === 'tick' || command.type === 'input' && command.source !== 'manual')
                return; // physical sources enter only through the runtime
            change(reduce(current, command));
        };
        const timer = setInterval(() => {
            if (!ready || !current)
                return;
            const now = Date.now();
            if (!online.current) {
                // Connection lost: freeze everything. Resuming needs an explicit therapist action.
                if (current.status === 'running')
                    change(reduce(current, { type: 'safety' }));
                return;
            }
            if (current.status === 'running' && current.config.source !== 'manual') {
                if (current.config.source === 'hand') {
                    const pointer = hardwareRef.current.pointer;
                    const patch = pointer && current.phase === 'firefighting' ? handAim(pointer.x, pointer.y, current.aim, pointer.fresh) : null;
                    change(patch ? reduce(current, { type: 'input', patch, source: 'hand', at: now }) : { ...reduce(current, { type: 'safety' }), inputLost: true });
                }
                else {
                    const mapping = hardwareRef.current.mapping;
                    let patch = null;
                    try {
                        const pad = typeof navigator.getGamepads === 'function' ? navigator.getGamepads()[mapping.deviceIndex] : null;
                        patch = sampleGamepad(pad ?? null, mapping);
                    }
                    catch { /* unsupported/denied Gamepad API safely pauses below */ }
                    change(patch ? reduce(current, { type: 'input', patch, source: current.config.source, at: now }) : { ...reduce(current, { type: 'safety' }), inputLost: true });
                }
            }
            if (current.status === 'running')
                change(reduce(current, { type: 'tick', at: now }));
            if (dirty && now - lastPublish >= PUBLISH_MIN_MS)
                publish();
            publisher.touch(HEARTBEAT_MS);
            save();
        }, TICK_MS);
        return () => {
            disposed = true;
            ready = false;
            clearInterval(timer);
            stop();
            publisher.dispose();
            op.current = () => { };
        };
    }, [c.auth.phase, c.isOwner, db, uid, getLive]);
    const send = useCallback((command: Command) => op.current(command), []);
  useGameSwitchFinalizer(GAME_ID, state?.sessionId, !!state && c.connectionStatus === "connected" && c.isOwner && !blocked, () => send({ type: "end", at: Date.now() }));
    const setHardware = useCallback((mapping: Mapping, pointer: {
        x: number;
        y: number;
        fresh: boolean;
    } | null) => {
        hardwareRef.current = { mapping, pointer };
    }, []);
    return {
        state,
        identity,
        send,
        error,
        history,
        blocked,
        setHardware,
        connected: c.connectionStatus === 'connected' && c.isOwner,
        displayConnected: c.displayConnected,
        writes: stats,
    };
}
