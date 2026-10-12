/**
 * Never targets production. Run with CC_RULES_EMULATOR=1 against local emulators (CC_DB_PORT / CC_AUTH_PORT,
 * default 19400 / 19499) loaded with the repo's database.rules.json for the namespace `${CC_PROJECT}-default-rtdb`
 * (default project `demo-hex`).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createState, reduce, targetOf, type Command, type State } from '../engine';
import { makeLive } from '../live';
import { buildHistory } from '../history';

const DB = `http://127.0.0.1:${process.env.CC_DB_PORT ?? 19400}`;
const AUTH = `http://127.0.0.1:${process.env.CC_AUTH_PORT ?? 19499}/identitytoolkit.googleapis.com/v1`;
const NS = `${process.env.CC_PROJECT ?? 'demo-hex'}-default-rtdb`;
const admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const url = (p: string, token = '') => `${DB}/${p}.json?ns=${NS}${token ? `&auth=${token}` : ''}`;
async function put(p: string, v: unknown, token = '', owner = false) {
  return (await fetch(url(p, token), { method: 'PUT', headers: owner ? admin : { 'Content-Type': 'application/json' }, body: JSON.stringify(v) })).status;
}
async function signup() {
  const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `cc-rule-${crypto.randomUUID()}@example.test`, password: 'local-test-password', returnSecureToken: true }) });
  return (await r.json()) as { localId: string; idToken: string };
}

describe.skipIf(process.env.CC_RULES_EMULATOR !== '1')('Color Chase 3D shared-session rules', () => {
  let staff: { localId: string; idToken: string };
  let other: { localId: string; idToken: string };
  let outsider: { localId: string; idToken: string };
  const pid = 'cc-rules-patient';
  const live = (revision: number, patch: Record<string, unknown> = {}, state: State = createState('cc-rules')) => ({
    gameId: 'color-chase', sessionId: state.sessionId, revision, updatedAt: { '.sv': 'timestamp' },
    session: makeLive(state, staff.localId, '', { controlTabId: 'tab', heartbeatAt: 1 }), ...patch,
  });
  const legacyLive = (revision: number) => ({
    gameId: 'color-chase', sessionId: 'legacy-cc', revision, updatedAt: { '.sv': 'timestamp' },
    session: { sessionId: 'legacy-cc', seed: 1, config: { childFirstName: 'ليلى' }, gameState: 'WELCOME', currentDifficulty: 'EASY', currentStage: { stageNumber: 1 }, createdAt: 1 },
  });
  const finished = (full = false) => {
    let s = reduce(createState('cc-rules-h'), { type: 'start', at: 1000 });
    s = reduce(s, { type: 'assist', stage: 0, step: 0 });
    s = reduce(s, { type: 'repeat' });
    s = reduce(s, { type: 'select', stage: 0, step: 1, color: targetOf(s)!.color });
    if (!full) return reduce(s, { type: 'end', at: 2000 });
    for (let guard = 0; guard < 120 && s.status !== 'ended'; guard++) {
      if (s.status === 'running') s = reduce(s, { type: 'select', stage: s.stage, step: s.step, color: targetOf(s)!.color });
      else if (s.status === 'stage-complete') s = reduce(s, { type: 'next', at: 3000 });
      else if (s.status === 'ready') s = reduce(s, { type: 'start', at: 2000 });
    }
    return s;
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
    expect(await put('liveSession', { ...v, session: { ...v.session, cc3: { ...v.session.cc3, ownerId: other.localId } } }, staff.idToken)).toBe(401);
  });
  it('refuses duplicate and stale revisions', async () => {
    expect(await put('liveSession', live(1), staff.idToken)).toBe(401);
    expect(await put('liveSession', live(0), staff.idToken)).toBe(401);
  });
  it('accepts every lifecycle state the engine produces', async () => {
    let s = createState('cc-rules');
    let rev = 2;
    const steps: Command[] = [
      { type: 'start', at: 1000 }, { type: 'select', stage: 0, step: 0, color: 'blue' }, { type: 'repeat' }, { type: 'safety' }, { type: 'resume', at: 2000 },
      { type: 'assist', stage: 0, step: 0 }, { type: 'skip', stage: 0, step: 1 }, { type: 'skipStage' }, { type: 'next', at: 3000 },
    ];
    for (const step of steps) {
      s = reduce(s, step);
      expect(await put('liveSession', live(rev++, {}, s), staff.idToken)).toBe(200);
    }
  });
  it('rejects malformed engine metadata and oversized payloads', async () => {
    const v = live(50);
    expect(await put('liveSession', { ...v, session: { ...v.session, cc3: { ...v.session.cc3, payload: 'x'.repeat(32769) } } }, staff.idToken)).toBe(401);
    expect(await put('liveSession', { ...v, session: { ...v.session, cc3: { ...v.session.cc3, controlTabId: undefined } } }, staff.idToken)).toBe(401);
    expect(await put('liveSession', { ...v, session: { ...v.session, engineVersion: 2 } }, staff.idToken)).toBe(401);
    expect(await put('liveSession', { ...v, gameId: 'balloon-quest' }, staff.idToken)).toBe(401); // a 3D record under another game id
    expect(await put('liveSession', { ...v, gameId: 'follow-the-footsteps' }, staff.idToken)).toBe(401);
  });
  it('refuses a patient identifier on the public Display record', async () => {
    expect(await put('liveSession', live(51, { patientId: pid }), staff.idToken)).toBe(401);
  });
  it('still accepts the original game record shape (rollback path)', async () => {
    expect(await put('liveSession', legacyLive(60), staff.idToken)).toBe(200);
  });
  it('stores one immutable versioned nine-stage history record, complete and early-ended', async () => {
    for (const record of [buildHistory(finished(true), pid, staff.localId), buildHistory(finished(false), pid, staff.localId)]) {
      const path = `sessions/${pid}/${record.sessionId}-${record.sessionCompleted ? 'full' : 'early'}`;
      const body = { ...record, sessionId: path.split('/')[2] };
      await put(path, null, '', true);
      expect(await put(path, body, staff.idToken)).toBe(200);
      expect(await put(path, body, staff.idToken)).toBe(401); // create-only
      expect(await put(path, { ...body, assistedObjectives: 1 }, staff.idToken)).toBe(401);
    }
  });
  it('still accepts an original five-stage history record, and rejects tampered or mislabelled new ones', async () => {
    const p = (id: string) => `sessions/${pid}/${id}`;
    const original = { sessionId: 'old-cc', patientId: pid, gameId: 'color-chase', startedAt: 1, completedAt: 2, createdByUid: staff.localId, startingDifficulty: 'EASY', startingStage: 1, endingDifficulty: 'MEDIUM', endingStage: 5, completedStageCount: 7, skippedStageCount: 1, totalTargetsPresented: 40, totalCorrect: 30, totalIncorrect: 8, totalDangerPresses: 2, accuracy: 0.78 };
    await put(p('old-cc'), null, '', true);
    expect(await put(p('old-cc'), original, staff.idToken)).toBe(200);
    const rec = buildHistory(finished(true), pid, staff.localId);
    const id = (n: string) => ({ ...rec, sessionId: n });
    expect(await put(p('t-engine'), { ...id('t-engine'), engine: 'fp3-forest' }, staff.idToken)).toBe(401);
    const { engine: _e, ...noEngine } = id('t-noengine'); void _e;
    expect(await put(p('t-noengine'), noEngine, staff.idToken)).toBe(401);
    expect(await put(p('t-version'), { ...id('t-version'), resultVersion: 3 }, staff.idToken)).toBe(401);
    expect(await put(p('t-assists'), { ...id('t-assists'), assistedObjectives: 999 }, staff.idToken)).toBe(401);
    expect(await put(p('t-done'), { ...id('t-done'), objectivesCompleted: 999 }, staff.idToken)).toBe(401);
    expect(await put(p('t-accuracy'), { ...id('t-accuracy'), accuracy: 1 }, staff.idToken)).toBe(401); // the new game never claims accuracy
    expect(await put(p('t-complete'), { ...id('t-complete'), completedStageCount: 5, sessionCompleted: true }, staff.idToken)).toBe(401);
    const { objectivesCompleted: _o, ...noObjectives } = id('t-noobj'); void _o;
    expect(await put(p('t-noobj'), noObjectives, staff.idToken)).toBe(401);
    expect(await put(p('t-uid'), { ...id('t-uid'), createdByUid: other.localId }, staff.idToken)).toBe(401);
    expect(await put(p('t-other'), id('t-other'), other.idToken)).toBe(401);
    expect(await put(p('t-outsider'), id('t-outsider'), outsider.idToken)).toBe(401);
    expect(await put(`sessions/ghost/${'t-ghost'}`, { ...id('t-ghost'), patientId: 'ghost' }, staff.idToken)).toBe(401);
    expect(await put(p('t-good'), id('t-good'), staff.idToken)).toBe(200);
  });
});
