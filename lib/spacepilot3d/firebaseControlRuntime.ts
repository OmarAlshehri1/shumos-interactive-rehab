import {NINE_STAGE_CURRICULUM} from './curriculum';
import type { Database } from 'firebase/database';
import { onValue, ref } from 'firebase/database';
import { SPACE_PILOT_GAME_ID } from '@/lib/games/registry';
import { controlTabId, decideRecovery, HEARTBEAT_MS, isTakenOver } from '@/lib/liveGame/ownership';
import { HistorySaver } from '@/lib/liveGame/historySaver';
import { LiveRecordPublisher } from '@/lib/liveGame/publisher';
import { clearLiveSession, fetchLiveSession, publishSession, subscribeToConnectionStatus, subscribeToLiveSession } from '@/lib/realtime/sessionRepository';
import { watchSpacePilotPresence, watchSpacePilotSensor } from '@/lib/realtime/spacePilotRepository';
import { saveSessionHistoryOnce } from '@/lib/sessions/sessionHistoryRepository';
import { buildStoredRingSession } from './history';
import { CLOUD_LINK_MS, CLOUD_SNAPSHOT_MS, decodeCheckpoint, isSpacePilotLive, recoverAuthority, spacePilotLiveSession, type LiveTimes, type SpacePilotLiveSession } from './cloudState';
import { RightHandFlightInput, subscribeToRightHandFlightInput } from './sensorInput';
import { SessionAuthority } from './sessionAuthority';
import type { ControlSessionHandle, ControlSessionView } from './controlSessionRuntime';
import { relayPointer } from './sensorRelay';
import { isRecord } from './sessionContract';

/** What the platform controller hook (lib/liveGame/useLiveGameController) hands to this runtime. */
export interface SpacePilotPlatform {
  db: Database;
  uid: string;
  /** Selected patient and the child's display name at the moment of the call. */
  patient: () => { patientId: string | null; childName: string };
  /** The therapist explicitly chose to take over a window that still looks alive. */
  force?: boolean;
}
export type OwnershipEvent = { kind: 'recovered' } | { kind: 'blocked'; takeoverAllowed: boolean } | { kind: 'superseded' };

/**
 * Space Pilot 3D Control over the shared platform: session state is published into `/liveSession` through the
 * platform publisher, window ownership / reload recovery come from lib/liveGame/ownership, history through the
 * shared save-once guard. What stays Space Pilot: the SessionAuthority simulation, manual-versus-sensor priority,
 * the Display acknowledgement handshake and the remote RIGHT_HAND relay (documented exceptions).
 */
export function mountFirebaseControl(platform: SpacePilotPlatform, onView: (v: ControlSessionView) => void, onReady: (h: ControlSessionHandle) => void, onError: (s: string) => void, onOwnership: (e: OwnershipEvent) => void = () => {}): () => void {
  const { db, uid } = platform, tabId = controlTabId(), token = crypto.randomUUID();
  // A new mount always uses a new token: copied tabs cannot share an authority.
  let disposed = false, online = false, ready = false, superseded = false, offset = 0, lastCommit = -Infinity,
    a: SessionAuthority | null = null, sessionId = '', bound: string | null = null, childName = '',
    lastViewRevision = -1, lastViewRun = -1, historyStatus = 'not-ended', manualX = 0, manualY = 0, override = false, lastMode = '', lastEpoch = -1;
  const times: LiveTimes = { createdAt: Date.now(), startedAt: 0, endedAt: 0, epoch: 1 };
  const history = new HistorySaver();
  const localSensor = new RightHandFlightInput(); localSensor.activate({ x: .5, y: .5 });
  let remoteSensor = new RightHandFlightInput(), sensor = localSensor, remoteToken = '';
  remoteSensor.activate({ x: .5, y: .5 });
  const stopSensor = subscribeToRightHandFlightInput(localSensor);
  const now = () => Date.now() + offset;
  const editable = () => ready && online && !superseded && !!a;
  const view = () => { if (!disposed && a) { lastViewRevision = a.revision; lastViewRun = a.simulation.runId; onView({ state: a.snapshot(), ready: editable() && a.canPlay(performance.now()), previousSummary: null, checkpointAvailable: true, cloud: true, connected: editable(), historyStatus }); } };
  const clearManual = () => { manualX = manualY = 0; override = false; a?.manual(null, false); if (a) sensor.rearm({ x: a.simulation.ship.controlX, y: a.simulation.ship.controlY }); };
  const fail = (e: unknown) => { if (disposed) return; clearManual(); a?.suspend('control-closed'); onError(e instanceof Error ? e.message : 'تعذّر مزامنة الجلسة'); view(); };

  const publisher = new LiveRecordPublisher<SpacePilotLiveSession>({
    write: async ({ sessionId: id, revision, session }) => {
      await publishSession(db, { gameId: SPACE_PILOT_GAME_ID, sessionId: id, revision, session, lastInteraction: null, patientId: bound });
      if (!disposed) onError('');
    },
    fetchBaseRevision: async () => (await fetchLiveSession(db))?.revision ?? 0,
    now: () => Date.now(),
    onError: (e) => { if (!disposed) onError(e instanceof Error ? e.message : 'تعذّر مزامنة الجلسة'); },
  });
  publisher.setTabId(tabId);
  const snapshotLive = (stamp: Parameters<typeof spacePilotLiveSession>[5]) => spacePilotLiveSession(a!, performance.now(), childName, uid, times, stamp);
  const track = () => {
    if (!a) return;
    if (a.lifecycle === 'running' && !times.startedAt) times.startedAt = Date.now();
    if (['completed', 'ended'].includes(a.lifecycle) && !times.endedAt) times.endedAt = Date.now();
  };
  const flush = () => { if (!editable() || !a) return; track(); lastCommit = performance.now(); publisher.publish(sessionId, snapshotLive); void save(); };
  const save = async () => {
    if (!a || !['completed', 'ended'].includes(a.lifecycle) || !ready || !times.endedAt) return;
    const record = () => buildStoredRingSession(snapshotLive({}), bound!, uid);
    const status = await history.save(sessionId, bound, Date.now(), () => saveSessionHistoryOnce(bound!, record()));
    if (!disposed) { historyStatus = status; if (status === 'saved') onError(''); else if (status === 'retry') onError('تعذّر حفظ النتيجة'); view(); }
  };

  const stops: Array<() => void> = [
    onValue(ref(db, '.info/serverTimeOffset'), s => { offset = Number(s.val()) || 0; }),
    subscribeToConnectionStatus(db, status => {
      online = status === 'connected';
      if (!online) { clearManual(); a?.suspend('control-closed'); view(); }
    }),
  ];
  const handle: ControlSessionHandle = {
    action(action, revision, runId) {
      if (!editable() || !a || revision !== lastViewRevision || runId !== lastViewRun || runId !== a.simulation.runId || (action.type === 'restart' && ['completed', 'ended'].includes(a.lifecycle))) return false;
      const accepted = a.command(action, a.revision, runId, performance.now());
      if (accepted) {
        if (['start', 'resume', 'next-mission'].includes(action.type)) { manualX = manualY = 0; a.manual(a.inputMode === 'keyboard' || override ? { x: .5, y: .5 } : null, override); }
        else clearManual();
        view(); flush();
      } return accepted;
    },
    manual(x, y, active) {
      if (!editable() || !a) { clearManual(); return; }
      const was = override; manualX = Math.max(-1, Math.min(1, x)); manualY = Math.max(-1, Math.min(1, y)); override = active;
      if (was !== active) sensor.rearm({ x: a.simulation.ship.controlX, y: a.simulation.ship.controlY });
      a.manual(a.inputMode === 'keyboard' || active ? { x: .5 + manualX * .5, y: .5 - manualY * .5 } : null, active);
      view();
    },
    dispose() { close(); },
  };
  onReady(handle);

  // ---- platform ownership: adopt this account's unfinished session (paused) or start a fresh one ----
  void (async () => {
    const stored = await fetchLiveSession(db).catch(() => null);
    if (disposed) return;
    publisher.setBaseRevision(stored?.revision ?? 0);
    const who = platform.patient();
    bound = who.patientId; childName = who.childName;
    const mine = stored && stored.gameId === SPACE_PILOT_GAME_ID && isSpacePilotLive(stored.session) ? (stored.session as SpacePilotLiveSession) : null;
    const checkpoint = mine ? decodeCheckpoint(mine) : null;
    const finished = !!checkpoint && ['completed', 'ended'].includes(checkpoint.state.lifecycle);
    if (mine && finished && mine.sp3.ownerId === uid && stored?.patientId && stored.patientId === bound && mine.sp3.endedAt) {
      // A finished session is never reopened. Its history is saved once (idempotent) in case the earlier save never completed.
      void saveSessionHistoryOnce(stored.patientId, buildStoredRingSession(mine, stored.patientId, uid)).catch(() => {});
    }
    const decision = decideRecovery({
      recordSessionId: stored?.sessionId ?? '', recordPatientId: stored?.patientId ?? null, meta: mine?.sp3 ?? { ownerId: '' },
      snapshot: mine && checkpoint && !finished ? { sessionId: mine.sessionId, live: mine } : null,
      uid, patientId: bound, tabId, now: Date.now(), force: platform.force,
    });
    if (decision.kind === 'blocked') { onOwnership({ kind: 'blocked', takeoverAllowed: decision.takeoverAllowed }); return; }
    if (decision.kind === 'recover') {
      const live = decision.snapshot.live;
      sessionId = live.sessionId; a = recoverAuthority(live, token);
      Object.assign(times, { createdAt: live.createdAt, startedAt: live.sp3.startedAt, endedAt: live.sp3.endedAt, epoch: live.sp3.epoch + 1 });
      publisher.setTakeoverFrom(decision.fromTabId);
      onOwnership({ kind: 'recovered' });
    } else {
      sessionId = crypto.randomUUID(); a = new SessionAuthority(sessionId, token, sessionId, 'LOW', CLOUD_LINK_MS,NINE_STAGE_CURRICULUM);
    }
    clearManual();
    stops.push(
      subscribeToLiveSession(db, record => {
        const meta = record && isSpacePilotLive(record.session) ? (record.session as SpacePilotLiveSession).sp3 : null;
        // Only an explicit hand-over naming THIS window stands it down.
        if (isTakenOver(meta, tabId) && record && record.sessionId === sessionId) { superseded = true; publisher.dispose(); fail(new Error('انتقلت ملكية الجلسة. التحكم متوقف بأمان.')); onOwnership({ kind: 'superseded' }); }
      }),
      watchSpacePilotSensor(db, sessionId, raw => {
        if (!editable() || !a || a.sensorSource !== 'remote') return;
        const p = relayPointer(raw, { ownerId: token, epoch: times.epoch, runId: a.simulation.runId, inputEpoch: a.inputEpoch }, now(), Date.now());
        if (!p) return;
        if (remoteToken !== p.sourceToken) {
          remoteToken = p.sourceToken; remoteSensor.dispose(); remoteSensor = new RightHandFlightInput();
          remoteSensor.activate({ x: a.simulation.ship.controlX, y: a.simulation.ship.controlY });
          sensor = remoteSensor;
        }
        remoteSensor.accept(p);
      }, fail),
      watchSpacePilotPresence(db, sessionId, values => {
        if (!editable() || !a || !values) return;
        for (const value of Object.values(values)) {
          if (isRecord(value) && typeof value.updatedAt === 'number' && now() - value.updatedAt >= -1000 && now() - value.updatedAt < 3000) a.receive(value, performance.now());
        }
        view();
      }, fail),
    );
    ready = true;
    publisher.setEnabled(true);
    flush(); view();
  })().catch(fail);

  const stopForFocus = () => { clearManual(); if (document.hidden) { a?.suspend('control-hidden'); flush(); } view(); };
  window.addEventListener('blur', stopForFocus); document.addEventListener('visibilitychange', stopForFocus);
  let lastBeat = 0;
  const timer = setInterval(() => {
    if (disposed) return;
    if (editable() && a) {
      const mono = performance.now(), held = { x: a.simulation.ship.controlX, y: a.simulation.ship.controlY };
      const selected = a.sensorSource === 'remote' ? remoteSensor : localSensor;
      if (selected !== sensor) { sensor = selected; sensor.rearm(held); }
      sensor.notePosition(held);
      if (lastMode !== a.inputMode || lastEpoch !== a.inputEpoch) { lastMode = a.inputMode; lastEpoch = a.inputEpoch; sensor.rearm(held); }
      a.manual(a.inputMode === 'keyboard' || override ? { x: .5 + manualX * .5, y: .5 - manualY * .5 } : null, override);
      const sampled = sensor.sample(); // Keep availability current during manual override too.
      a.tick(mono, override ? null : sampled, sensor.status, sensor.latestPointer);
      if (document.hidden) { clearManual(); a.suspend('control-hidden'); }
      if (mono - lastCommit >= (a.lifecycle === 'running' ? CLOUD_SNAPSHOT_MS : 1000)) flush();
      if (Date.now() - lastBeat >= 1000) { lastBeat = Date.now(); publisher.touch(HEARTBEAT_MS); }
    } else if (a && ready) {
      clearManual(); a.suspend('control-closed'); view();
    }
  }, 1000 / 60);
  function close() {
    if (disposed) return;
    disposed = true; clearInterval(timer); stops.forEach(s => s()); stopSensor(); localSensor.dispose(); remoteSensor.dispose();
    window.removeEventListener('blur', stopForFocus); document.removeEventListener('visibilitychange', stopForFocus);
    publisher.dispose();
    if (superseded || !a || !ready) return; // another window owns the session now, or it never started: nothing to end or clear
    clearManual();
    // Leaving mid-session ends it (the partial result is saved once); the shared record is then cleared.
    if (!['ready', 'completed', 'ended'].includes(a.lifecycle)) { a.command({ type: 'end' }, a.revision, a.simulation.runId, performance.now()); }
    if (['completed', 'ended'].includes(a.lifecycle) && !times.endedAt) times.endedAt = Date.now();
    if (['completed', 'ended'].includes(a.lifecycle) && bound && times.endedAt) {
      const record = buildStoredRingSession(spacePilotLiveSession(a, performance.now(), childName, uid, times, {}), bound, uid);
      void saveSessionHistoryOnce(bound, record).catch(() => {});
    }
    const id = sessionId;
    void (async () => {
      const stored = await fetchLiveSession(db).catch(() => null);
      if (stored && stored.sessionId === id) await clearLiveSession(db).catch(() => {});
    })();
  }
  return close;
}
