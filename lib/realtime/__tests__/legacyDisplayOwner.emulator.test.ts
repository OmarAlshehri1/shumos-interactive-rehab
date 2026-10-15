import { afterAll, beforeAll, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('NEXT_PUBLIC_BALANCE_BRIDGE_3D', 'true'); });
import { readFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator, get, ref } from 'firebase/database';
import { createState } from '@/lib/balancebridge3d/engine';
import { makeLive } from '@/lib/balancebridge3d/live';
import { recoverDisplaySessionOwner } from '../recoverDisplaySessionOwner';
import { parseLiveSessionValue } from '../sessionRepository';

const enabled = process.env.DISPLAY_SECURITY_EMULATOR === '1';
const base = 'http://127.0.0.1:19940';
const ns = 'demo-shumos-security-default-rtdb';
const app = initializeApp({ apiKey: 'fake', projectId: 'demo-shumos-security', databaseURL: `https://${ns}.firebaseio.com` }, 'legacy-display-recovery-test');
const auth = getAuth(app), db = getDatabase(app);
let uid: string, anonymous: string;
const url = (path: string, token?: string) => `${base}/${path}.json?ns=${ns}${token ? `&auth=${token}` : ''}`;
const admin = async (path: string, value: unknown) => {
  const r = await fetch(url(path), { method: 'PUT', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  if (!r.ok) throw Error(`Local fixture failed: ${r.status}`);
};

beforeAll(async () => {
  if (!enabled) return;
  connectAuthEmulator(auth, 'http://127.0.0.1:19949', { disableWarnings: true });
  connectDatabaseEmulator(db, '127.0.0.1', 19940);
  const email = `legacy-${Date.now()}@example.test`, password = 'SyntheticTest123!';
  const signup = async (body: object) => (await (await fetch('http://127.0.0.1:19949/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, returnSecureToken: true }) })).json());
  uid = (await signup({ email, password })).localId;
  anonymous = (await signup({})).idToken;
  await admin('', { staff: { [uid]: { active: true, role: 'therapist' } } });
  await admin('.settings/rules', JSON.parse(readFileSync('database.rules.json', 'utf8')));
  await signInWithEmailAndPassword(auth, email, password);
});
afterAll(async () => { await deleteApp(app); vi.unstubAllEnvs(); });

it.skipIf(!enabled)('recovers the production legacy setup deadlock without changing gameplay, private data or window ownership', async () => {
  const session = makeLive(createState('legacy-setup'), uid, 'Synthetic', { controlTabId: 'original-window', heartbeatAt: 1 });
  const legacy = { gameId: 'balance-bridge-3d', sessionId: session.sessionId, revision: 4, updatedAt: 1, session };
  await admin('liveSession', legacy);
  await admin('liveSessionPrivate', { sessionId: session.sessionId, patientId: 'synthetic-private-patient', updatedAt: 1 });
  await admin('controllerLease', { ownerId: uid, updatedAt: Date.now(), claimedAt: Date.now() });
  const anonUid = JSON.parse(Buffer.from(anonymous.split('.')[1], 'base64url').toString()).user_id;
  await admin(`presence/displayAccess/${anonUid}`, { approvedBy: uid, issuedAt: Date.now(), expiresAt: Date.now() + 60000 });
  expect((await fetch(url('liveSession', anonymous))).status).toBe(401);
  expect(parseLiveSessionValue((await get(ref(db, 'liveSession'))).val())).not.toBeNull();
  await recoverDisplaySessionOwner(db, uid);
  const recovered = (await get(ref(db, 'liveSession'))).val();
  expect(recovered).toEqual({ ...legacy, controllerUid: uid, revision: 5 });
  expect(recovered.session.bb3).toEqual(legacy.session.bb3);
  expect((await fetch(url('liveSession', anonymous))).status).toBe(200);
  expect((await fetch(url('liveSessionPrivate', anonymous))).status).toBe(401);
  expect((await get(ref(db, 'liveSessionPrivate/patientId'))).val()).toBe('synthetic-private-patient');
  await recoverDisplaySessionOwner(db, uid);
  expect((await get(ref(db, 'liveSession/revision'))).val()).toBe(5);
  await admin('liveSession', { ...legacy, session: { ...session, bb3: { ...session.bb3, ownerId: 'another-therapist' } } });
  await recoverDisplaySessionOwner(db, uid);
  expect((await get(ref(db, 'liveSession/controllerUid'))).exists()).toBe(false);
  await admin('liveSession', legacy);
  await admin('controllerLease/ownerId', 'another-therapist');
  await recoverDisplaySessionOwner(db, uid);
  expect((await get(ref(db, 'liveSession/controllerUid'))).exists()).toBe(false);
});
