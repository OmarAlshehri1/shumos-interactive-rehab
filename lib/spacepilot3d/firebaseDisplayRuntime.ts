import { getAuth } from 'firebase/auth';
import { getDisplayDb, getDisplayFirebaseApp } from '@/lib/realtime/firebaseClient';
import { subscribeToAuthState } from '@/lib/realtime/authClient';
import { subscribeToConnectionStatus } from '@/lib/realtime/sessionRepository';
import { writeSpacePilotPresence } from '@/lib/realtime/spacePilotRepository';
import { CLOUD_LINK_MS, decodeCheckpoint, type CloudCheckpoint, type SpacePilotLiveSession } from './cloudState';
import type { DisplaySessionView } from './displaySessionRuntime';
import { emptyScene, type RemoteSceneDriver } from './presentation';

/**
 * Space Pilot 3D Display over the shared platform. The standard Display owns the `/liveSession` subscription (and its
 * revision ordering); this runtime is fed each record through `accept()`. It renders accepted positions only, never
 * simulates, scores or collides. The one thing it writes is its acknowledgement (visible + rendered), the documented
 * Display -> Control exception (see spacePilotRepository.ts).
 */
export function createLiveDisplay(onView: (v: DisplaySessionView) => void, onError: (s: string) => void) {
  const db = getDisplayDb(), displayId = crypto.randomUUID(), scene = emptyScene();
  let disposed = false, online = false, ready = false, failed = false, latest: SpacePilotLiveSession | null = null, cp: CloudCheckpoint | null = null,
    received = -Infinity, lastAck = -Infinity, ackSequence = 0, uid = '';
  const stops: Array<() => void> = [];
  // Freshness uses only this device's own receipt times; the Control rewrites the record at least once a second.
  const connected = () => online && !!cp && performance.now() - received < CLOUD_LINK_MS;
  const report = () => onView({ state: cp ? cp.state : null, connected: connected(), displayId });
  const ack = () => {
    if (!uid || !cp || !latest || !connected() || disposed) return;
    const s = cp.state;
    lastAck = performance.now();
    void writeSpacePilotPresence(db, latest.sessionId, uid, { version: 4, type: 'ack', displayId, ownerId: s.ownerId,
      sessionId: s.sessionId, runId: s.runId, inputEpoch: s.inputEpoch, frameSequence: cp.frame.sequence,
      sequence: ++ackSequence, visible: !document.hidden, ready: ready && !failed }).catch(e => {
        // A run/epoch transition can reject an in-flight acknowledgement.
        // It carries no gameplay; the next bounded presence update retries the current identity.
        if (!disposed && e.code !== 'PERMISSION_DENIED') onError(e.message);
      });
  };
  stops.push(subscribeToConnectionStatus(db, s => { online = s === 'connected'; report(); }));
  stops.push(subscribeToAuthState(auth => {
    if (auth.status === 'failed') { onError('تعذّر توثيق شاشة الطفل'); return; }
    if (auth.status === 'authenticated' && !disposed) uid = getAuth(getDisplayFirebaseApp()).currentUser!.uid;
  }));
  const visibility = () => { ack(); report(); };
  document.addEventListener('visibilitychange', visibility);
  const driver: RemoteSceneDriver = {
    read: () => scene,
    rawPointer: () => cp?.frame.rawPointer ?? null,
    unavailable() { failed = true; ready = false; ack(); },
    presented() { if (!failed) ready = true; if (performance.now() - lastAck >= 400) ack(); },
    update(_now, delta) {
      const c = cp;
      if (!c || !connected() || document.hidden) { scene.status = 'paused'; report(); return; }
      const s = c.state, f = c.frame;
      scene.status = s.lifecycle === 'running' ? 'running' : s.lifecycle === 'ready' ? 'ready' : s.lifecycle === 'mission-complete' ? 'mission-complete' : ['completed', 'ended'].includes(s.lifecycle) ? 'complete' : 'paused';
      // Smooth only toward accepted positions. No extrapolation, scoring or collision simulation.
      const alpha = 1 - Math.exp(-Math.max(0, Math.min(delta, .1)) * 25);
      const previous = scene.ship;
      scene.ship = { ...f.ship, x: previous.x + (f.ship.x - previous.x) * alpha,
        y: previous.y + (f.ship.y - previous.y) * alpha,
        z: 'z' in previous ? (previous.z as number) + (f.ship.z - (previous.z as number)) * alpha : f.ship.z };
      scene.sessionId = s.sessionId; scene.runId = s.runId; scene.revision = s.revision;
      scene.elapsedSeconds = f.elapsedSeconds; scene.objects = f.objects; scene.stats = s.stats;
      scene.flightSettings = s.flightSettings; scene.accessibility = s.accessibility;
    },
  };
  return {
    driver,
    /** Feed every Space Pilot 3D record the standard Display receives. */
    accept(next: SpacePilotLiveSession) {
      if (disposed) return;
      const c = decodeCheckpoint(next);
      if (!c) return;
      if (latest && cp) {
        // A late write from an earlier owner (lower epoch), or an older state of the same owner, never replaces newer accepted state.
        if (next.sessionId === latest.sessionId && (next.sp3.epoch < latest.sp3.epoch || (next.sp3.epoch === latest.sp3.epoch && next.sp3.ownerToken === latest.sp3.ownerToken && c.state.revision < cp.state.revision))) return;
      }
      const recovery = !connected() || latest?.sp3.epoch !== next.sp3.epoch || latest?.sessionId !== next.sessionId || scene.runId !== c.state.runId;
      if (recovery) { scene.events.length = 0; scene.ship = { ...c.frame.ship }; }
      else { const oldSeq = cp?.state.eventSequence ?? 0; scene.events.push(...c.state.outcomes.filter(e => e.sequence > oldSeq)); }
      latest = next; cp = c; received = performance.now(); report();
      if (performance.now() - lastAck > 300) ack();
    },
    dispose() { disposed = true; stops.forEach(s => s()); document.removeEventListener('visibilitychange', visibility); },
  };
}
