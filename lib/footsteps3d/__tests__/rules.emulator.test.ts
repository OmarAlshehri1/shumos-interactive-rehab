/**
 * Never targets production. Run with FOOT_RULES_EMULATOR=1 against local emulators (FOOT_DB_PORT / FOOT_AUTH_PORT,
 * default 19300 / 19399) loaded with the repo's database.rules.json for the namespace `demo-foot-rules-default-rtdb`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createState, reduce, type State } from '../engine';
import { makeLive } from '../live';
import { buildHistory } from '../history';

const DB = `http://127.0.0.1:${process.env.SHUMOS_RULES_DB_PORT ?? process.env.FOOT_DB_PORT ?? 19300}`;
const AUTH = `http://127.0.0.1:${process.env.SHUMOS_RULES_AUTH_PORT ?? process.env.FOOT_AUTH_PORT ?? 19399}/identitytoolkit.googleapis.com/v1`;
const NS = 'demo-foot-rules-default-rtdb';
const admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const url = (p: string, token = '') => `${DB}/${p}.json?ns=${NS}${token ? `&auth=${token}` : ''}`;
async function put(p: string, v: unknown, token = '', owner = false) {
  return (await fetch(url(p, token), { method: 'PUT', headers: owner ? admin : { 'Content-Type': 'application/json' }, body: JSON.stringify(v) })).status;
}
async function signup() {
  const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `foot-rule-${crypto.randomUUID()}@example.test`, password: 'local-test-password', returnSecureToken: true }) });
  return (await r.json()) as { localId: string; idToken: string };
}

describe.skipIf(process.env.FOOT_RULES_EMULATOR !== '1')('Follow the Footsteps 3D shared-session rules', () => {
  let staff: { localId: string; idToken: string };
  let other: { localId: string; idToken: string };
  let outsider: { localId: string; idToken: string };
  const pid = 'foot-rules-patient';
  const live = (revision: number, patch: Record<string, unknown> = {}, state: State = createState('foot-rules')) => ({
    gameId: 'follow-the-footsteps', sessionId: state.sessionId, revision, updatedAt: { '.sv': 'timestamp' },
    session: makeLive(state, staff.localId, '', { controlTabId: 'tab', heartbeatAt: 1 }), ...patch,
  });
  const legacyLive = (revision: number) => ({
    gameId: 'follow-the-footsteps', sessionId: 'legacy-foot', revision, updatedAt: { '.sv': 'timestamp' },
    session: { sessionId: 'legacy-foot', seed: 1, config: { childFirstName: 'ليلى' }, gameState: 'WELCOME', currentDifficulty: 'EASY', currentStage: { stageNumber: 1 }, createdAt: 1 },
  });
  const finished = () => {
    let s = reduce(createState('foot-rules-h'), { type: 'start', at: 1000 });
    s = reduce(s, { type: 'confirm', stage: 0, step: 0, assisted: true });
    s = reduce(s, { type: 'confirm', stage: 0, step: 1, assisted: false });
    return reduce(s, { type: 'end', at: 2000 });
  };
  beforeAll(async () => {
    await put('liveSession', null, '', true);
    await put('sessions', null, '', true);
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
    expect(await put('liveSession', { ...v, session: { ...v.session, fp3: { ...v.session.fp3, ownerId: other.localId } } }, staff.idToken)).toBe(401);
  });
  it('refuses duplicate and stale revisions', async () => {
    expect(await put('liveSession', live(1), staff.idToken)).toBe(401);
    expect(await put('liveSession', live(0), staff.idToken)).toBe(401);
  });
  it('accepts every lifecycle state the engine produces', async () => {
    let s = createState('foot-rules');
    let rev = 2;
    const steps = [
      { type: 'start', at: 1000 }, { type: 'confirm', stage: 0, step: 0, assisted: false }, { type: 'repeat' }, { type: 'safety' }, { type: 'resume', at: 2000 },
      { type: 'skip', stage: 0, step: 1 }, { type: 'skipStage' }, { type: 'next', at: 3000 },
    ] as const;
    for (const step of steps) {
      s = reduce(s, step as never);
      expect(await put('liveSession', live(rev++, {}, s), staff.idToken)).toBe(200);
    }
  });
  it('rejects malformed engine metadata and oversized payloads', async () => {
    const v = live(50);
    expect(await put('liveSession', { ...v, session: { ...v.session, fp3: { ...v.session.fp3, payload: 'x'.repeat(32769) } } }, staff.idToken)).toBe(401);
    expect(await put('liveSession', { ...v, session: { ...v.session, fp3: { ...v.session.fp3, controlTabId: undefined } } }, staff.idToken)).toBe(401);
    expect(await put('liveSession', { ...v, session: { ...v.session, engineVersion: 2 } }, staff.idToken)).toBe(401);
    expect(await put('liveSession', { ...v, gameId: 'balloon-quest' }, staff.idToken)).toBe(401); // a 3D record under another game id
  });
  it('refuses a patient identifier on the public Display record', async () => {
    expect(await put('liveSession', live(51, { patientId: pid }), staff.idToken)).toBe(401);
  });
  it('still accepts the original game record shape (rollback path)', async () => {
    expect(await put('liveSession', legacyLive(60), staff.idToken)).toBe(200);
  });
  it('stores one immutable versioned nine-stage history record', async () => {
    const record = buildHistory(finished(), pid, staff.localId);
    const path = `sessions/${pid}/${record.sessionId}`;
    await put(path, null, '', true);
    expect(await put(path, record, staff.idToken)).toBe(200);
    expect(await put(path, record, staff.idToken)).toBe(401); // create-only
    expect(await put(path, { ...record, totalAssists: 1 }, staff.idToken)).toBe(401);
  });
  it('still accepts an original five-stage history record, and rejects tampered or mislabelled new ones', async () => {
    const p = (id: string) => `sessions/${pid}/${id}`;
    const original = { sessionId: 'old-1', patientId: pid, gameId: 'follow-the-footsteps', startedAt: 1, completedAt: 2, createdByUid: staff.localId, startingDifficulty: 'EASY', startingStage: 1, endingDifficulty: 'MEDIUM', endingStage: 5, completedStageCount: 7, skippedStageCount: 1, totalStepsPresented: 40, totalStepsCompleted: 38 };
    await put(p('old-1'), null, '', true);
    expect(await put(p('old-1'), original, staff.idToken)).toBe(200);
    const rec = buildHistory(finished(), pid, staff.localId);
    const id = (n: string) => ({ ...rec, sessionId: n });
    expect(await put(p('t-engine'), { ...id('t-engine'), engine: 'sp3-rings' }, staff.idToken)).toBe(401);
    const { engine: _e, ...noEngine } = id('t-noengine'); void _e;
    expect(await put(p('t-noengine'), noEngine, staff.idToken)).toBe(401);
    expect(await put(p('t-version'), { ...id('t-version'), resultVersion: 3 }, staff.idToken)).toBe(401);
    expect(await put(p('t-assists'), { ...id('t-assists'), totalAssists: 9 }, staff.idToken)).toBe(401);
    const { totalAssists: _a, ...noAssists } = id('t-noassist'); void _a;
    expect(await put(p('t-noassist'), noAssists, staff.idToken)).toBe(401);
    expect(await put(p('t-uid'), { ...id('t-uid'), createdByUid: other.localId }, staff.idToken)).toBe(401);
    expect(await put(p('t-other'), id('t-other'), other.idToken)).toBe(401);
    expect(await put(p('t-outsider'), id('t-outsider'), outsider.idToken)).toBe(401);
    expect(await put(`sessions/ghost/${'t-ghost'}`, { ...id('t-ghost'), patientId: 'ghost' }, staff.idToken)).toBe(401);
    expect(await put(p('t-good'), id('t-good'), staff.idToken)).toBe(200);
  });
});
