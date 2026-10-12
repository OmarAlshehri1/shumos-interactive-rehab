/**
 * Never targets production. Run with BS_RULES_EMULATOR=1 against local emulators (ports from BS_DB_PORT / BS_AUTH_PORT,
 * default 19610 / 19709, project demo-bs-rules) loaded with the repo's database.rules.json (docs/bodysequence3d/validation/emulators.sh).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { COUNTDOWN_MS, createState, currentRound, INTER_MS, reduce, type Command, type State } from '../engine';
import { makeLive } from '../live';
import { buildHistory } from '../history';
import { previewMs } from '../sequence';
import { createState as hexState } from '@/lib/safehexarena3d/engine';
import { makeLive as hexLive } from '@/lib/safehexarena3d/live';

const DB = `http://127.0.0.1:${process.env.SHUMOS_RULES_DB_PORT ?? process.env.BS_DB_PORT ?? 19610}`;
const AUTH = `http://127.0.0.1:${process.env.SHUMOS_RULES_AUTH_PORT ?? process.env.BS_AUTH_PORT ?? 19709}/identitytoolkit.googleapis.com/v1`;
const NS = 'demo-bs-rules-default-rtdb';
const admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const url = (p: string, token = '') => `${DB}/${p}.json?ns=${NS}${token ? `&auth=${token}` : ''}`;
async function put(p: string, v: unknown, token = '', owner = false) {
  return (await fetch(url(p, token), { method: 'PUT', headers: owner ? admin : { 'Content-Type': 'application/json' }, body: JSON.stringify(v) })).status;
}
async function signup() {
  const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `bs-rule-${crypto.randomUUID()}@example.test`, password: 'local-test-password', returnSecureToken: true }) });
  return (await r.json()) as { localId: string; idToken: string };
}

const run = (s: State, ...cs: Command[]) => cs.reduce(reduce, s);
function advance(s: State, ms: number): State {
  let n = s;
  for (let t = n.lastTick; t < s.lastTick + ms; t += 50) n = reduce(n, { type: 'tick', at: t + 50 });
  return n;
}
/** A completed run: every movement of every stage confirmed (previews, holds and pauses waited out), ending the session. */
function playThrough(sessionId: string, stages = 9): State {
  let s = createState(sessionId, 11);
  for (let stage = 0; stage < stages; stage++) {
    s = advance(run(s, { type: 'selectStage', stage }, { type: 'start', at: 1000 + stage }), COUNTDOWN_MS + 60);
    for (let g = 0; g < 300 && s.status === 'running'; g++) {
      if (s.inter > 0) s = advance(s, INTER_MS + 60);
      else if (s.phase === 'preview') s = advance(s, previewMs(currentRound(s).steps.length) + 100);
      else if (s.hold) s = advance(s, s.hold.ms + 60);
      else s = reduce(s, { type: 'confirm', assisted: stage % 2 === 1 });
    }
    s = reduce(s, { type: 'next', at: 5000 + stage });
  }
  return s.status === 'ended' ? s : reduce(s, { type: 'end', at: 99999 });
}

describe.skipIf(process.env.BS_RULES_EMULATOR !== '1')('Body Sequence shared-session rules', () => {
  let staff: { localId: string; idToken: string };
  let other: { localId: string; idToken: string };
  let outsider: { localId: string; idToken: string };
  const pid = 'bs-rules-patient';
  const live = (revision: number, patch: Record<string, unknown> = {}, state: State = createState('bs-rules')) => ({
    gameId: 'body-sequence-3d', sessionId: state.sessionId, revision, updatedAt: { '.sv': 'timestamp' },
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
    expect(await put('liveSession', { ...v, session: { ...v.session, bs3: { ...v.session.bs3, ownerId: other.localId } } }, staff.idToken)).toBe(401);
  });
  it('refuses duplicate and stale revisions', async () => {
    expect(await put('liveSession', live(1), staff.idToken)).toBe(401);
    expect(await put('liveSession', live(0), staff.idToken)).toBe(401);
  });
  it('accepts every lifecycle state the engine produces, including a customised three-lane stage', async () => {
    let s = createState('bs-rules');
    let rev = 2;
    const cmds: Command[] = [{ type: 'selectStage', stage: 8 }, { type: 'configure', config: { feet: 'L', allow: { R: 'R', L: 'LC' }, spacing: 1.2, rot: 180, mirror: true, hints: true, holdMs: 4500, proj: { name: 'قاعة الأرضية', rot: 90, inset: 7, wCm: 640, hCm: 360 }, inputMode: 'DUAL_FOOT', inputSource: 'simulated' } }, { type: 'start', at: 1000 }, { type: 'safety' }, { type: 'resume', at: 2000 }, { type: 'pause' }];
    for (const c of cmds) {
      s = reduce(s, c);
      expect(await put('liveSession', live(rev++, {}, s), staff.idToken)).toBe(200);
    }
    expect(live(rev++, {}, s).session.bs3.payload.length).toBeLessThan(32768);
  });
  it('rejects malformed engine metadata and oversized payloads', async () => {
    const v = live(50);
    expect(await put('liveSession', { ...v, session: { ...v.session, engine: 'fake' } }, staff.idToken)).toBe(401);
    expect(await put('liveSession', { ...v, session: { ...v.session, bs3: { ...v.session.bs3, payload: 'x'.repeat(32769) } } }, staff.idToken)).toBe(401);
    expect(await put('liveSession', { ...v, session: { ...v.session, bs3: { ...v.session.bs3, controlTabId: undefined } } }, staff.idToken)).toBe(401);
  });
  it('refuses a patient identifier on the public Display record', async () => {
    expect(await put('liveSession', live(51, { patientId: pid }), staff.idToken)).toBe(401);
  });
  it('leaves other games working (Safe Hex Arena record still accepted)', async () => {
    const m = hexLive(hexState('hex-ok'), staff.localId, '', { controlTabId: 't', heartbeatAt: 1 });
    expect(await put('liveSession', { gameId: 'safe-hex-arena-3d', sessionId: 'hex-ok', revision: 60, updatedAt: { '.sv': 'timestamp' }, session: m }, staff.idToken)).toBe(200);
  });
  it('stores one immutable versioned history record from a full nine-stage run', async () => {
    const s = playThrough('bs-rules-h');
    expect(s.completed).toHaveLength(9);
    const record = buildHistory(s, pid, staff.localId);
    expect(record.stageResults).toHaveLength(9);
    expect(record.totalMovements).toBeGreaterThan(60);
    expect(record.stageResults.slice(0, 3).every((r) => r.lanes === 2)).toBe(true);
    expect(record.stageResults.slice(3).every((r) => r.lanes === 3)).toBe(true);
    const path = `sessions/${pid}/${record.sessionId}`;
    await put(path, null, '', true);
    expect(await put(path, record, staff.idToken)).toBe(200);
    expect(await put(path, record, staff.idToken)).toBe(401); // create-only
    expect(await put(path, { ...record, confirmedMovements: record.confirmedMovements + 1 }, staff.idToken)).toBe(401);
  });
  it('stores a partial run and a run with incorrect attempts, repeats, replays and skips', async () => {
    let s = playThrough('bs-rules-p', 2);
    s = reduce(s, { type: 'end', at: 999999 });
    const record = buildHistory(s, pid, staff.localId);
    const path = `sessions/${pid}/${record.sessionId}`;
    await put(path, null, '', true);
    expect(await put(path, record, staff.idToken)).toBe(200);
    let t = advance(run(createState('bs-rules-d', 3), { type: 'selectStage', stage: 2 }, { type: 'start', at: 1 }), COUNTDOWN_MS + 60);
    t = advance(t, previewMs(2) + 100);
    t = advance(run(t, { type: 'incorrect' }, { type: 'replay' }), previewMs(2) + 100);
    t = run(t, { type: 'confirm', assisted: true }, { type: 'repeat', prev: false });
    t = run(t, { type: 'confirm', assisted: true });
    t = advance(t, INTER_MS + previewMs(2) + 200);
    t = run(t, { type: 'skip' }, { type: 'end', at: 5000 });
    const rec2 = buildHistory(t, pid, staff.localId);
    expect(rec2).toMatchObject({ incorrectAttempts: 1, replays: 1, skippedMovements: 1, assistedMovements: 2, repeats: 1, movementAttempts: 3 });
    const p2 = `sessions/${pid}/${rec2.sessionId}`;
    await put(p2, null, '', true);
    expect(await put(p2, rec2, staff.idToken)).toBe(200);
  });
  it('rejects tampered, score-bearing or incomplete history and unknown patients', async () => {
    const s = playThrough('bs-rules-t', 4);
    const record = buildHistory(s, pid, staff.localId);
    const p = (id: string) => `sessions/${pid}/${id}`;
    const { confirmedMovements: _drop, ...missing } = record;
    void _drop;
    expect(await put(p(record.sessionId), missing, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, totalMovements: record.totalMovements + 3 }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, movementAttempts: record.movementAttempts + 1 }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, resultVersion: 2 }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, engine: 'tg3' }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, score: 100 }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, accuracy: 0.9 }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, secretField: 1 }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, holdsAssisted: record.holdsCompleted + 1 }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, settings: { ...record.settings, maxLanes: 4 } }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, settings: { ...record.settings, holdMs: 99 } }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, settings: { ...record.settings, extra: true } }, staff.idToken)).toBe(401);
    const rows = record.stageResults.map((r, i) => (i === 0 ? { ...r, confirmed: r.confirmed + 4 } : r));
    expect(await put(p(record.sessionId), { ...record, stageResults: rows }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, stageResults: record.stageResults.map((r, i) => (i === 0 ? { ...r, stageNumber: 3 } : r)) }, staff.idToken)).toBe(401);
    // level 1 may never claim three lanes, and no row may claim four
    expect(await put(p(record.sessionId), { ...record, stageResults: record.stageResults.map((r, i) => (i === 0 ? { ...r, lanes: 3 } : r)) }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, stageResults: record.stageResults.map((r, i) => (i === 3 ? { ...r, lanes: 4 } : r)) }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, createdByUid: other.localId }, staff.idToken)).toBe(401);
    const ghost = buildHistory(s, 'ghost-patient', staff.localId);
    expect(await put(`sessions/ghost-patient/${ghost.sessionId}`, ghost, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), record, other.idToken)).toBe(401);
    expect(await put(p(record.sessionId), record, outsider.idToken)).toBe(401);
    // the untouched record is accepted, proving the rejections above were about the tampering
    expect(await put(p(record.sessionId), record, staff.idToken)).toBe(200);
  });
});
