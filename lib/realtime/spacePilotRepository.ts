import { serverTimestamp, onValue, ref, set, type Database } from 'firebase/database';
import { SPACE_PILOT_ROOT, roomValid } from '@/lib/spacepilot3d/cloudState';
import type { SessionMessage } from '@/lib/spacepilot3d/sessionContract';

/**
 * The two Space Pilot 3D paths that cannot live in the shared `/liveSession` record (documented exceptions):
 *  - `presence/{session}/{displayUid}`: the anonymous Display's acknowledgements. They flow Display -> Control, so
 *    they need a node a Display may write; the single-writer live record is Control -> Display only.
 *  - `sensor/{session}`: the remote RIGHT_HAND relay from a second staff device.
 * Everything else (session state, ownership, lease, patient binding, history) uses the shared platform.
 */
const presencePath = (id: string) => { if (!roomValid(id)) throw new Error('Invalid Space Pilot session'); return `${SPACE_PILOT_ROOT}/presence/${id}`; };
const sensorPath = (id: string) => { if (!roomValid(id)) throw new Error('Invalid Space Pilot session'); return `${SPACE_PILOT_ROOT}/sensor/${id}`; };

/** Per-anonymous-UID presence; Display has no permission to write game state/input/outcomes. */
export const watchSpacePilotPresence = (db: Database, id: string, cb: (v: Record<string, unknown> | null) => void, fail: (e: Error) => void) => onValue(ref(db, presencePath(id)), s => cb(s.val()), fail);
export const writeSpacePilotPresence = (db: Database, id: string, displayUid: string, message: SessionMessage) => set(ref(db, `${presencePath(id)}/${displayUid}`), { ...message, updatedAt: serverTimestamp() });

export const watchSpacePilotSensor = (db: Database, id: string, cb: (v: unknown) => void, fail: (e: Error) => void) => onValue(ref(db, sensorPath(id)), s => cb(s.val()), fail);
export const writeSpacePilotSensor = (db: Database, session: { sessionId: string; ownerToken: string; epoch: number; run: number }, inputEpoch: number, sourceToken: string, sequence: number, pointer: { x: number; y: number; visible: boolean }, sampleAgeMs = 0) => set(ref(db, sensorPath(session.sessionId)), {
  version: 1, role: 'RIGHT_HAND', ownerId: session.ownerToken, epoch: session.epoch, runId: session.run, inputEpoch,
  sourceToken, sequence, sampleAgeMs, x: pointer.x, y: pointer.y, visible: pointer.visible, updatedAt: serverTimestamp(),
});
