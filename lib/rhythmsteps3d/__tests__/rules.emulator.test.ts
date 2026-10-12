/**
 * Never targets production. Run with RS_RULES_EMULATOR=1 against local emulators (ports from RS_DB_PORT / RS_AUTH_PORT,
 * default 19500 / 19599, project demo-rs-rules) loaded with the repo's database.rules.json.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createState, reduce, currentStep, type State } from '../engine';
import { makeLive } from '../live';
import { buildHistory } from '../history';
import { createState as hexState } from '@/lib/safehexarena3d/engine';
import { makeLive as hexLive } from '@/lib/safehexarena3d/live';

const DB = `http://127.0.0.1:${process.env.SHUMOS_RULES_DB_PORT ?? process.env.RS_DB_PORT ?? 19500}`;
const AUTH = `http://127.0.0.1:${process.env.SHUMOS_RULES_AUTH_PORT ?? process.env.RS_AUTH_PORT ?? 19599}/identitytoolkit.googleapis.com/v1`;
const NS = 'demo-rs-rules-default-rtdb';
const admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const url = (p: string, token = '') => `${DB}/${p}.json?ns=${NS}${token ? `&auth=${token}` : ''}`;
async function put(p: string, v: unknown, token = '', owner = false) {
  return (await fetch(url(p, token), { method: 'PUT', headers: owner ? admin : { 'Content-Type': 'application/json' }, body: JSON.stringify(v) })).status;
}
async function signup() {
  const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `rs-rule-${crypto.randomUUID()}@example.test`, password: 'local-test-password', returnSecureToken: true }) });
  return (await r.json()) as { localId: string; idToken: string };
}

/** A completed run: every target of every stage confirmed, hold included, ending the session. */
function playThrough(sessionId: string, stages = 9): State {
  let s = reduce(createState(sessionId), { type: 'configure', config: { flow: 'assisted', holdMs: 1000 } });
  let t = 1000;
  for (let stage = 0; stage < stages; stage++) {
    s = reduce(s, { type: 'start', at: t });
    for (let g = 0; g < 4000 && s.status === 'running'; g++) {
      t += 50;
      s = reduce(s, { type: 'tick', at: t });
      const cur = currentStep(s);
      if (cur?.kind === 'hold' && cur.holdAt < 0) s = reduce(s, { type: 'startHold', id: cur.id });
      else if (cur && cur.kind !== 'hold') s = reduce(s, { type: 'confirm', id: cur.id, assisted: stage % 2 === 1 });
    }
    s = reduce(s, { type: 'next', at: t });
  }
  return s.status === 'ended' ? s : reduce(s, { type: 'end', at: t + 10 });
}

describe.skipIf(process.env.RS_RULES_EMULATOR !== '1')('Rhythm Steps shared-session rules', () => {
  let staff: { localId: string; idToken: string };
  let other: { localId: string; idToken: string };
  let outsider: { localId: string; idToken: string };
  const pid = 'rs-rules-patient';
  const live = (revision: number, patch: Record<string, unknown> = {}, state: State = createState('rs-rules')) => ({
    gameId: 'rhythm-steps-3d', sessionId: state.sessionId, revision, updatedAt: { '.sv': 'timestamp' },
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
    expect(await put('liveSession', { ...v, session: { ...v.session, rs3: { ...v.session.rs3, ownerId: other.localId } } }, staff.idToken)).toBe(401);
  });
  it('refuses duplicate and stale revisions', async () => {
    expect(await put('liveSession', live(1), staff.idToken)).toBe(401);
    expect(await put('liveSession', live(0), staff.idToken)).toBe(401);
  });
  it('accepts every lifecycle state the engine produces, including a full stage stream', async () => {
    let s = reduce(createState('rs-rules'), { type: 'configure', config: { flow: 'assisted', holdMs: 1000 } });
    let rev = 2;
    const cmds = [{ type: 'start', at: 1000 }, { type: 'safety' }, { type: 'resume', at: 2000 }, { type: 'spawn', on: false }, { type: 'spawn', on: true }, { type: 'pause' }] as const;
    for (const c of cmds) {
      s = reduce(s, c as never);
      expect(await put('liveSession', live(rev++, {}, s), staff.idToken)).toBe(200);
    }
    // the largest payload: the last stage with every setting changed
    s = reduce(createState('rs-rules'), { type: 'stage', stage: 8 });
    s = reduce(s, { type: 'configure', config: { flow: 'assisted', jumping: true, fast: true, floorWidthCm: 400, floorHeightCm: 250, calibrationConfirmed: true, inputMode: 'DUAL_FOOT', inputSource: 'simulated' } });
    const big = live(rev++, {}, s);
    expect(big.session.rs3.payload.length).toBeLessThan(32768);
    expect(await put('liveSession', big, staff.idToken)).toBe(200);
  });
  it('rejects malformed engine metadata and oversized payloads', async () => {
    const v = live(50);
    expect(await put('liveSession', { ...v, session: { ...v.session, engine: 'fake' } }, staff.idToken)).toBe(401);
    expect(await put('liveSession', { ...v, session: { ...v.session, rs3: { ...v.session.rs3, payload: 'x'.repeat(32769) } } }, staff.idToken)).toBe(401);
    expect(await put('liveSession', { ...v, session: { ...v.session, rs3: { ...v.session.rs3, controlTabId: undefined } } }, staff.idToken)).toBe(401);
  });
  it('refuses a patient identifier on the public Display record', async () => {
    expect(await put('liveSession', live(51, { patientId: pid }), staff.idToken)).toBe(401);
  });
  it('leaves other games working (Safe Hex Arena record still accepted)', async () => {
    const m = hexLive(hexState('hex-ok'), staff.localId, '', { controlTabId: 't', heartbeatAt: 1 });
    expect(await put('liveSession', { gameId: 'safe-hex-arena-3d', sessionId: 'hex-ok', revision: 60, updatedAt: { '.sv': 'timestamp' }, session: m }, staff.idToken)).toBe(200);
  });
  it('stores one immutable versioned history record from a full nine-stage run', async () => {
    const s = playThrough('rs-rules-h');
    expect(s.completed).toHaveLength(9);
    const record = buildHistory(s, pid, staff.localId);
    expect(record.stageResults).toHaveLength(9);
    const path = `sessions/${pid}/${record.sessionId}`;
    await put(path, null, '', true);
    expect(await put(path, record, staff.idToken)).toBe(200);
    expect(await put(path, record, staff.idToken)).toBe(401); // create-only
    expect(await put(path, { ...record, confirmedEvents: record.confirmedEvents + 1 }, staff.idToken)).toBe(401);
  });
  it('stores a partial run (one stage, session ended early)', async () => {
    const s = playThrough('rs-rules-p', 2);
    const record = buildHistory(reduce(s, { type: 'end', at: 999999 }), pid, staff.localId);
    const path = `sessions/${pid}/${record.sessionId}`;
    await put(path, null, '', true);
    expect(await put(path, record, staff.idToken)).toBe(200);
  });
  it('rejects tampered, score-bearing or incomplete history and unknown patients', async () => {
    const s = playThrough('rs-rules-t', 3);
    const record = buildHistory(s, pid, staff.localId);
    const p = (id: string) => `sessions/${pid}/${id}`;
    const { confirmedEvents: _drop, ...missing } = record;
    void _drop;
    expect(await put(p(record.sessionId), missing, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, totalTargetEvents: record.totalTargetEvents + 3 }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, singleFootExercises: record.singleFootExercises + 1 }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, resultVersion: 2 }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, engine: 'hv3' }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, flowMode: 'turbo' }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, score: 100 }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, accuracy: 0.9 }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, secretField: 1 }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, settings: { ...record.settings, speed: 9 } }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, settings: { ...record.settings, extra: true } }, staff.idToken)).toBe(401);
    const rows = record.stageResults.map((r, i) => (i === 0 ? { ...r, confirmed: r.confirmed + 4 } : r));
    expect(await put(p(record.sessionId), { ...record, stageResults: rows }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, stageResults: record.stageResults.map((r, i) => (i === 0 ? { ...r, stageNumber: 3 } : r)) }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, createdByUid: other.localId }, staff.idToken)).toBe(401);
    const ghost = buildHistory(s, 'ghost-patient', staff.localId);
    expect(await put(`sessions/ghost-patient/${ghost.sessionId}`, ghost, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), record, other.idToken)).toBe(401);
    expect(await put(p(record.sessionId), record, outsider.idToken)).toBe(401);
    // and the untouched record is accepted, proving the rejections above were about the tampering
    expect(await put(p(record.sessionId), record, staff.idToken)).toBe(200);
  });
});
