/**
 * Never targets production. Run with HEX_RULES_EMULATOR=1 against local emulators (ports from HEX_DB_PORT / HEX_AUTH_PORT,
 * default 19300 / 19399) loaded with the repo's database.rules.json.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createState, reduce, type State } from '../engine';
import { makeLive } from '../live';
import { buildHistory } from '../history';
import { createState as mirrorState } from '@/lib/mirrorquest3d/engine';
import { makeLive as mirrorLive } from '@/lib/mirrorquest3d/live';

const DB = `http://127.0.0.1:${process.env.SHUMOS_RULES_DB_PORT ?? process.env.HEX_DB_PORT ?? 19300}`;
const AUTH = `http://127.0.0.1:${process.env.SHUMOS_RULES_AUTH_PORT ?? process.env.HEX_AUTH_PORT ?? 19399}/identitytoolkit.googleapis.com/v1`;
const NS = 'demo-hex-rules-default-rtdb';
const admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const url = (p: string, token = '') => `${DB}/${p}.json?ns=${NS}${token ? `&auth=${token}` : ''}`;
async function put(p: string, v: unknown, token = '', owner = false) {
  return (await fetch(url(p, token), { method: 'PUT', headers: owner ? admin : { 'Content-Type': 'application/json' }, body: JSON.stringify(v) })).status;
}
async function signup() {
  const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `hex-rule-${crypto.randomUUID()}@example.test`, password: 'local-test-password', returnSecureToken: true }) });
  return (await r.json()) as { localId: string; idToken: string };
}

describe.skipIf(process.env.HEX_RULES_EMULATOR !== '1')('Safe Hex Arena shared-session rules', () => {
  let staff: { localId: string; idToken: string };
  let other: { localId: string; idToken: string };
  let outsider: { localId: string; idToken: string };
  const pid = 'hex-rules-patient';
  const live = (revision: number, patch: Record<string, unknown> = {}, state: State = createState('hex-rules')) => ({
    gameId: 'safe-hex-arena-3d', sessionId: state.sessionId, revision, updatedAt: { '.sv': 'timestamp' },
    session: makeLive(state, staff.localId, '', { controlTabId: 'tab', heartbeatAt: 1 }), ...patch,
  });
  beforeAll(async () => {
    staff = await signup();
    other = await signup();
    outsider = await signup();
    for (const s of [staff, other]) expect(await put(`staff/${s.localId}`, { active: true, role: 'therapist' }, '', true)).toBe(200);
    expect(await put('controllerLease', { ownerId: staff.localId, updatedAt: Date.now() }, '', true)).toBe(200);
    expect(await put(`patients/${pid}`, { patientId: pid, firstName: 'Test' }, '', true)).toBe(200);
  });

  it('only the lease-owning staff member may publish; non-staff and anonymous may not', async () => {
    expect(await put('liveSession', live(1), other.idToken)).toBe(401);
    expect(await put('liveSession', live(1), outsider.idToken)).toBe(401);
    expect(await put('liveSession', live(1))).toBe(401);
    expect(await put('liveSession', live(1), staff.idToken)).toBe(200);
  });
  it('requires the record owner to be the publishing account', async () => {
    const v = live(2);
    expect(await put('liveSession', { ...v, session: { ...v.session, hex3: { ...v.session.hex3, ownerId: other.localId } } }, staff.idToken)).toBe(401);
  });
  it('refuses duplicate and stale revisions', async () => {
    expect(await put('liveSession', live(1), staff.idToken)).toBe(401);
    expect(await put('liveSession', live(0), staff.idToken)).toBe(401);
  });
  it('accepts every lifecycle state the engine produces', async () => {
    let s = createState('hex-rules');
    let rev = 2;
    const steps = [{ type: 'start', at: 1000 }, { type: 'warn' }, { type: 'hide' }, { type: 'safety' }, { type: 'resume', at: 2000 }, { type: 'skipStage' }] as const;
    for (const step of steps) {
      s = reduce(s, step as never);
      expect(await put('liveSession', live(rev++, {}, s), staff.idToken)).toBe(200);
    }
  });
  it('rejects malformed engine metadata and oversized payloads', async () => {
    const v = live(50);
    expect(await put('liveSession', { ...v, session: { ...v.session, engine: 'fake' } }, staff.idToken)).toBe(401);
    expect(await put('liveSession', { ...v, session: { ...v.session, hex3: { ...v.session.hex3, payload: 'x'.repeat(32769) } } }, staff.idToken)).toBe(401);
    expect(await put('liveSession', { ...v, session: { ...v.session, hex3: { ...v.session.hex3, controlTabId: undefined } } }, staff.idToken)).toBe(401);
  });
  it('refuses a patient identifier on the public Display record', async () => {
    expect(await put('liveSession', live(51, { patientId: pid }), staff.idToken)).toBe(401);
  });
  it('leaves other games working (Mirror Quest record still accepted)', async () => {
    const m = mirrorLive(mirrorState('mirror-ok'), staff.localId, '', { controlTabId: 't', heartbeatAt: 1 });
    expect(await put('liveSession', { gameId: 'mirror-quest-3d', sessionId: 'mirror-ok', revision: 60, updatedAt: { '.sv': 'timestamp' }, session: m }, staff.idToken)).toBe(200);
  });
  it('stores one immutable versioned history record', async () => {
    let s = reduce(createState('hex-rules-h'), { type: 'start', at: 1000 });
    s = reduce(s, { type: 'warn' });
    const dest = [...Array(9).keys()].find((t) => !s.warn.includes(t))!;
    s = reduce(s, { type: 'confirm', tile: dest, assisted: true });
    s = reduce(s, { type: 'end', at: 2000 });
    const record = buildHistory(s, pid, staff.localId);
    const path = `sessions/${pid}/${record.sessionId}`;
    await put(path, null, '', true);
    expect(await put(path, record, staff.idToken)).toBe(200);
    expect(await put(path, record, staff.idToken)).toBe(401); // create-only
    expect(await put(path, { ...record, totalSafeTransitions: 5 }, staff.idToken)).toBe(401);
    expect(await put(path, { ...record, totalRoundsCompleted: 99 }, staff.idToken)).toBe(401);
  });
  it('rejects tampered or incomplete history and unknown patients', async () => {
    let s = reduce(createState('hex-rules-t'), { type: 'start', at: 1000 });
    s = reduce(s, { type: 'end', at: 2000 });
    const record = buildHistory(s, pid, staff.localId);
    const p = (id: string) => `sessions/${pid}/${id}`;
    const { totalSafeTransitions: _drop, ...missing } = record;
    void _drop;
    expect(await put(p(record.sessionId), missing, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, totalRoundsPresented: 42, totalRoundsCompleted: 0 }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, resultVersion: 2 }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, createdByUid: other.localId }, staff.idToken)).toBe(401);
    const ghost = buildHistory(s, 'ghost-patient', staff.localId);
    expect(await put(`sessions/ghost-patient/${ghost.sessionId}`, ghost, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), record, other.idToken)).toBe(401);
    expect(await put(p(record.sessionId), record, outsider.idToken)).toBe(401);
  });
});
