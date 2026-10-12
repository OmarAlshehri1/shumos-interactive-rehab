/**
 * Never targets production. Run with TG_RULES_EMULATOR=1 against local emulators (ports from TG_DB_PORT / TG_AUTH_PORT,
 * default 19510 / 19609, project demo-tg-rules) loaded with the repo's database.rules.json (docs/turngo3d/validation/emulators.sh).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { activeCp, COUNTDOWN_MS, createState, reduce, schedule, type Command, type State } from '../engine';
import { makeLive } from '../live';
import { buildHistory } from '../history';
import { createState as hexState } from '@/lib/safehexarena3d/engine';
import { makeLive as hexLive } from '@/lib/safehexarena3d/live';

const DB = `http://127.0.0.1:${process.env.TG_DB_PORT ?? 19510}`;
const AUTH = `http://127.0.0.1:${process.env.TG_AUTH_PORT ?? 19609}/identitytoolkit.googleapis.com/v1`;
const NS = 'demo-tg-rules-default-rtdb';
const admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const url = (p: string, token = '') => `${DB}/${p}.json?ns=${NS}${token ? `&auth=${token}` : ''}`;
async function put(p: string, v: unknown, token = '', owner = false) {
  return (await fetch(url(p, token), { method: 'PUT', headers: owner ? admin : { 'Content-Type': 'application/json' }, body: JSON.stringify(v) })).status;
}
async function signup() {
  const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `tg-rule-${crypto.randomUUID()}@example.test`, password: 'local-test-password', returnSecureToken: true }) });
  return (await r.json()) as { localId: string; idToken: string };
}

const run = (s: State, ...cs: Command[]) => cs.reduce(reduce, s);
function advance(s: State, ms: number): State {
  let n = s;
  for (let t = n.lastTick; t < s.lastTick + ms; t += 50) n = reduce(n, { type: 'tick', at: t + 50 });
  return n;
}
/** A completed run: every star of every stage confirmed (stops by their hold), ending the session. */
function playThrough(sessionId: string, stages = 9): State {
  let s = createState(sessionId, 11);
  for (let stage = 0; stage < stages; stage++) {
    s = advance(reduce(s, { type: 'start', at: 1000 + stage }), COUNTDOWN_MS + 60);
    for (let g = 0; g < 200 && s.status === 'running'; g++) {
      if (s.wait) s = run(s, { type: 'continue' });
      else if (s.hold) s = advance(s, s.hold.ms + 60);
      else s = reduce(s, { type: 'confirm', assisted: stage % 2 === 1 });
    }
    s = reduce(s, { type: 'next', at: 5000 + stage });
  }
  return s.status === 'ended' ? s : reduce(s, { type: 'end', at: 99999 });
}

describe.skipIf(process.env.TG_RULES_EMULATOR !== '1')('Turn & Go shared-session rules', () => {
  let staff: { localId: string; idToken: string };
  let other: { localId: string; idToken: string };
  let outsider: { localId: string; idToken: string };
  const pid = 'tg-rules-patient';
  const live = (revision: number, patch: Record<string, unknown> = {}, state: State = createState('tg-rules')) => ({
    gameId: 'turn-and-go-3d', sessionId: state.sessionId, revision, updatedAt: { '.sv': 'timestamp' },
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
    expect(await put('liveSession', { ...v, session: { ...v.session, tg3: { ...v.session.tg3, ownerId: other.localId } } }, staff.idToken)).toBe(401);
  });
  it('refuses duplicate and stale revisions', async () => {
    expect(await put('liveSession', live(1), staff.idToken)).toBe(401);
    expect(await put('liveSession', live(0), staff.idToken)).toBe(401);
  });
  it('accepts every lifecycle state the engine produces, including a customised nine-star stage', async () => {
    let s = createState('tg-rules');
    let rev = 2;
    const cmds: Command[] = [{ type: 'selectStage', stage: 8 }, { type: 'configure', config: { cones: { '0': [-5, 1], '1': [-1.5, 0.5] }, cpPos: { '0': [-4, 2] }, rot: 180, mirror: true, density: 2, proj: { name: 'قاعة الأرضية', rot: 90, inset: 7, wCm: 640, hCm: 360 }, inputMode: 'DUAL_FOOT', inputSource: 'simulated' } }, { type: 'start', at: 1000 }, { type: 'safety' }, { type: 'resume', at: 2000 }, { type: 'pause' }];
    for (const c of cmds) {
      s = reduce(s, c);
      expect(await put('liveSession', live(rev++, {}, s), staff.idToken)).toBe(200);
    }
    const big = live(rev++, {}, s);
    expect(big.session.tg3.payload.length).toBeLessThan(32768);
  });
  it('rejects malformed engine metadata and oversized payloads', async () => {
    const v = live(50);
    expect(await put('liveSession', { ...v, session: { ...v.session, engine: 'fake' } }, staff.idToken)).toBe(401);
    expect(await put('liveSession', { ...v, session: { ...v.session, tg3: { ...v.session.tg3, payload: 'x'.repeat(32769) } } }, staff.idToken)).toBe(401);
    expect(await put('liveSession', { ...v, session: { ...v.session, tg3: { ...v.session.tg3, controlTabId: undefined } } }, staff.idToken)).toBe(401);
  });
  it('refuses a patient identifier on the public Display record', async () => {
    expect(await put('liveSession', live(51, { patientId: pid }), staff.idToken)).toBe(401);
  });
  it('leaves other games working (Safe Hex Arena record still accepted)', async () => {
    const m = hexLive(hexState('hex-ok'), staff.localId, '', { controlTabId: 't', heartbeatAt: 1 });
    expect(await put('liveSession', { gameId: 'safe-hex-arena-3d', sessionId: 'hex-ok', revision: 60, updatedAt: { '.sv': 'timestamp' }, session: m }, staff.idToken)).toBe(200);
  });
  it('stores one immutable versioned history record from a full nine-stage run', async () => {
    const s = playThrough('tg-rules-h');
    expect(s.completed).toHaveLength(9);
    const record = buildHistory(s, pid, staff.localId);
    expect(record.stageResults).toHaveLength(9);
    expect(record.totalCheckpoints).toBeGreaterThan(30);
    const path = `sessions/${pid}/${record.sessionId}`;
    await put(path, null, '', true);
    expect(await put(path, record, staff.idToken)).toBe(200);
    expect(await put(path, record, staff.idToken)).toBe(401); // create-only
    expect(await put(path, { ...record, confirmedCheckpoints: record.confirmedCheckpoints + 1 }, staff.idToken)).toBe(401);
  });
  it('stores a partial run (two stages, session ended early) and a run with deviations, repeats and skips', async () => {
    let s = playThrough('tg-rules-p', 2);
    s = reduce(s, { type: 'end', at: 999999 });
    const record = buildHistory(s, pid, staff.localId);
    const path = `sessions/${pid}/${record.sessionId}`;
    await put(path, null, '', true);
    expect(await put(path, record, staff.idToken)).toBe(200);
    let t = advance(reduce(createState('tg-rules-d', 3), { type: 'start', at: 1 }), COUNTDOWN_MS + 60);
    t = run(t, { type: 'deviation', cone: false }, { type: 'deviation', cone: true }, { type: 'skip' }, { type: 'repeat', prev: false }, { type: 'end', at: 5000 });
    const rec2 = buildHistory(t, pid, staff.localId);
    expect(rec2).toMatchObject({ routeDeviations: 1, coneTouches: 1, skippedCheckpoints: 1, repeats: 1 });
    const p2 = `sessions/${pid}/${rec2.sessionId}`;
    await put(p2, null, '', true);
    expect(await put(p2, rec2, staff.idToken)).toBe(200);
    expect(activeCp(createState('x'))).toBe(-1);
    expect(schedule(createState('y')).plan.cps.length).toBeGreaterThan(0);
  });
  it('rejects tampered, score-bearing or incomplete history and unknown patients', async () => {
    const s = playThrough('tg-rules-t', 3);
    const record = buildHistory(s, pid, staff.localId);
    const p = (id: string) => `sessions/${pid}/${id}`;
    const { confirmedCheckpoints: _drop, ...missing } = record;
    void _drop;
    expect(await put(p(record.sessionId), missing, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, totalCheckpoints: record.totalCheckpoints + 3 }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, resultVersion: 2 }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, engine: 'hv3' }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, score: 100 }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, accuracy: 0.9 }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, secretField: 1 }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, stopHoldsAssisted: record.stopHoldsCompleted + 1 }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, settings: { ...record.settings, stopMs: 99 } }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, settings: { ...record.settings, extra: true } }, staff.idToken)).toBe(401);
    const rows = record.stageResults.map((r, i) => (i === 0 ? { ...r, confirmed: r.confirmed + 4 } : r));
    expect(await put(p(record.sessionId), { ...record, stageResults: rows }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, stageResults: record.stageResults.map((r, i) => (i === 0 ? { ...r, stageNumber: 3 } : r)) }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, createdByUid: other.localId }, staff.idToken)).toBe(401);
    const ghost = buildHistory(s, 'ghost-patient', staff.localId);
    expect(await put(`sessions/ghost-patient/${ghost.sessionId}`, ghost, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), record, other.idToken)).toBe(401);
    expect(await put(p(record.sessionId), record, outsider.idToken)).toBe(401);
    // the untouched record is accepted, proving the rejections above were about the tampering
    expect(await put(p(record.sessionId), record, staff.idToken)).toBe(200);
  });
});
