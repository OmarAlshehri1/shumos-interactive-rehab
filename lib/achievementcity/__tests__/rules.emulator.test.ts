/**
 * Never targets production. Run with AC_RULES_EMULATOR=1 against local emulators (AC_DB_PORT / AC_AUTH_PORT, default
 * 19760 / 19769, project demo-ac-rules) loaded with the repo's database.rules.json (docs/achievementcity3d/validation/emulators.sh).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createState, reduce, type Command, type State } from '../engine';
import { makeLive } from '../live';
import { buildHistory } from '../history';
import { blankEvaluation, type Visit } from '@/lib/therapyVisits/model';
import { createState as hexState } from '@/lib/safehexarena3d/engine';
import { makeLive as hexLive } from '@/lib/safehexarena3d/live';

const DB = `http://127.0.0.1:${process.env.SHUMOS_RULES_DB_PORT ?? process.env.AC_DB_PORT ?? 19760}`;
const AUTH = `http://127.0.0.1:${process.env.SHUMOS_RULES_AUTH_PORT ?? process.env.AC_AUTH_PORT ?? 19769}/identitytoolkit.googleapis.com/v1`;
const NS = process.env.AC_NS ?? 'demo-ac-test-default-rtdb';
const admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const url = (p: string, token = '') => `${DB}/${p}.json?ns=${NS}${token ? `&auth=${token}` : ''}`;
async function put(p: string, v: unknown, token = '', owner = false) {
  return (await fetch(url(p, token), { method: 'PUT', headers: owner ? admin : { 'Content-Type': 'application/json' }, body: JSON.stringify(v) })).status;
}
async function signup() {
  const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `ac-rule-${crypto.randomUUID()}@example.test`, password: 'local-test-password', returnSecureToken: true }) });
  return (await r.json()) as { localId: string; idToken: string };
}
const run = (s: State, ...cs: Command[]) => cs.reduce(reduce, s);
let T = 10_000;
const at = () => (T += 1000);
const confirmN = (s: State, n: number, assisted = false) => { for (let i = 0; i < n; i++) s = reduce(s, { type: 'confirm', assisted, at: at() }); return s; };
/** A full three-level run (3 achievements each), ending the session. */
function fullRun(id: string, target = 3): State {
  let s = run(createState(id, 5), { type: 'setTarget', target }, { type: 'setExercise', exercise: 'الوقوف من الجلوس' }, { type: 'start', at: at() });
  for (let l = 0; l < 3; l++) { s = confirmN(s, target - 1); s = confirmN(s, 1, true); if (l < 2) s = reduce(s, { type: 'continue', at: at() }); }
  return reduce(s, { type: 'end', at: at() });
}

describe.skipIf(process.env.AC_RULES_EMULATOR !== '1')('Achievement City shared-session rules', () => {
  let staff: { localId: string; idToken: string };
  let other: { localId: string; idToken: string };
  let outsider: { localId: string; idToken: string };
  const pid = 'ac-rules-patient';
  const live = (revision: number, patch: Record<string, unknown> = {}, state: State = createState('ac-rules')) => ({
    gameId: 'achievement-city-3d', sessionId: state.sessionId, revision, updatedAt: { '.sv': 'timestamp' },
    session: makeLive(state, staff.localId, '', { controlTabId: 'tab', heartbeatAt: 1 }), ...patch,
  });
  beforeAll(async () => {
    staff = await signup(); other = await signup(); outsider = await signup();
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
    expect(await put('liveSession', { ...v, session: { ...v.session, ac3: { ...v.session.ac3, ownerId: other.localId } } }, staff.idToken)).toBe(401);
  });
  it('refuses duplicate and stale revisions', async () => {
    expect(await put('liveSession', live(1), staff.idToken)).toBe(401);
    expect(await put('liveSession', live(0), staff.idToken)).toBe(401);
  });
  it('accepts every lifecycle state the engine produces', async () => {
    let s = createState('ac-rules');
    let rev = 2;
    const cmds: Command[] = [{ type: 'selectLevel', level: 2 }, { type: 'setTarget', target: 30 }, { type: 'setExercise', exercise: 'المشي حول الأقماع' }, { type: 'configure', config: { inputSource: 'gamepad', quality: 'low', proj: { name: 'جدار القاعة', inset: 6 } } }, { type: 'start', at: at() }, { type: 'confirm', at: at(), viaPad: true }, { type: 'safety' }, { type: 'resume', at: at() }, { type: 'pause' }];
    for (const c of cmds) { s = reduce(s, c); expect(await put('liveSession', live(rev++, {}, s), staff.idToken)).toBe(200); }
    expect(live(rev, {}, s).session.ac3.payload.length).toBeLessThan(8192);
  });
  it('rejects malformed engine metadata and oversized payloads', async () => {
    const v = live(50);
    expect(await put('liveSession', { ...v, session: { ...v.session, engine: 'fake' } }, staff.idToken)).toBe(401);
    expect(await put('liveSession', { ...v, session: { ...v.session, ac3: { ...v.session.ac3, payload: 'x'.repeat(8193) } } }, staff.idToken)).toBe(401);
    expect(await put('liveSession', { ...v, session: { ...v.session, ac3: { ...v.session.ac3, controlTabId: undefined } } }, staff.idToken)).toBe(401);
  });
  it('refuses a patient identifier on the public Display record', async () => {
    expect(await put('liveSession', live(51, { patientId: pid }), staff.idToken)).toBe(401);
  });
  it('leaves other games working (Safe Hex Arena record still accepted)', async () => {
    const m = hexLive(hexState('hex-ok'), staff.localId, '', { controlTabId: 't', heartbeatAt: 1 });
    expect(await put('liveSession', { gameId: 'safe-hex-arena-3d', sessionId: 'hex-ok', revision: 60, updatedAt: { '.sv': 'timestamp' }, session: m }, staff.idToken)).toBe(200);
  });
  it('stores one immutable versioned history record from a full three-level run', async () => {
    const s = fullRun('ac-rules-h');
    const record = buildHistory(s, pid, staff.localId);
    expect(record.levelResults).toHaveLength(3);
    expect(record.completion).toBe('COMPLETED');
    const path = `sessions/${pid}/${record.sessionId}`;
    await put(path, null, '', true);
    expect(await put(path, record, staff.idToken)).toBe(200);
    expect(await put(path, record, staff.idToken)).toBe(401); // create-only
    expect(await put(path, { ...record, confirmedAchievements: record.confirmedAchievements + 1 }, staff.idToken)).toBe(401);
  });
  it('stores a partial run started directly at level 3, with undo and skips', async () => {
    let s = run(createState('ac-rules-p', 3), { type: 'selectLevel', level: 2 }, { type: 'setTarget', target: 6 }, { type: 'setNotes', notes: 'ملاحظة' }, { type: 'start', at: at() });
    s = confirmN(s, 3); s = reduce(s, { type: 'undo', at: at() }); s = reduce(s, { type: 'skip', at: at() }); s = reduce(s, { type: 'end', at: at() });
    const record = buildHistory(s, pid, staff.localId);
    expect(record).toMatchObject({ startingLevel: 3, endingLevel: 3, completion: 'PARTIAL', undoCount: 1, skippedAchievements: 1, confirmedAchievements: 2 });
    const path = `sessions/${pid}/${record.sessionId}`;
    await put(path, null, '', true);
    expect(await put(path, record, staff.idToken)).toBe(200);
  });
  it('rejects tampered, score-bearing or incomplete history and unknown patients', async () => {
    const s = fullRun('ac-rules-t');
    const record = buildHistory(s, pid, staff.localId);
    const p = (id: string) => `sessions/${pid}/${id}`;
    const { confirmedAchievements: _drop, ...missing } = record;
    void _drop;
    expect(await put(p(record.sessionId), missing, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, confirmedAchievements: record.targetAchievements + 5 }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, resultVersion: 2 }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, engine: 'bs3' }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, score: 100 }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, accuracy: 0.9 }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, secretField: 1 }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, startingLevel: 4 }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, levelsCompleted: 4 }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, completion: 'PERFECT' }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, therapistNotes: 'x'.repeat(301) }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, settings: { ...record.settings, inputSource: 'SIMULATED' } }, staff.idToken)).toBe(401);
    // there are no stages: a fourth row, or a row with level 4, is refused
    expect(await put(p(record.sessionId), { ...record, levelResults: [...record.levelResults, { ...record.levelResults[0] }] }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, levelResults: record.levelResults.map((r, i) => (i === 0 ? { ...r, level: 4 } : r)) }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, levelResults: record.levelResults.map((r, i) => (i === 0 ? { ...r, confirmed: r.confirmed + 9 } : r)) }, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), { ...record, createdByUid: other.localId }, staff.idToken)).toBe(401);
    const ghost = buildHistory(s, 'ghost-patient', staff.localId);
    expect(await put(`sessions/ghost-patient/${ghost.sessionId}`, ghost, staff.idToken)).toBe(401);
    expect(await put(p(record.sessionId), record, other.idToken)).toBe(401);
    expect(await put(p(record.sessionId), record, outsider.idToken)).toBe(401);
    // the untouched record is accepted, proving the rejections above were about the tampering
    expect(await put(p(record.sessionId), record, staff.idToken)).toBe(200);
  });

  it('links a saved Achievement City result to a parent therapy visit with an immutable claim; unsaved or foreign references are refused', async () => {
    const now = Date.now();
    const visit: Visit = {
      version: 1, visitId: 'ac-visit-1', patientId: pid, childName: 'ليلى', ownerUid: staff.localId, controlTabId: 'ac-visit-tab', title: 'جلسة علاج طبيعي', therapistName: 'معالج تجريبي',
      initialNotes: '', finalNotes: '', overallRating: null, startedAt: 1, plannedMs: 45 * 60000, pausedMs: 0, pausedAt: null, endedAt: null, revision: 0, updatedAt: now, entries: {}, breaks: {},
    };
    expect(await put(`patients/${pid}`, { patientNumber: pid, firstName: 'ليلى', createdAt: 1, updatedAt: 1, createdByUid: staff.localId, active: true }, '', true)).toBe(200);
    const created = await fetch(url('', staff.idToken), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [`therapyVisits/${pid}/${visit.visitId}`]: visit, [`activeTherapyVisits/${staff.localId}`]: { patientId: pid, visitId: visit.visitId, controlTabId: visit.controlTabId } }) });
    expect(created.status).toBe(200);
    const s = fullRun('ac-visit-run');
    const record = buildHistory(s, pid, staff.localId);
    const entry = { kind: 'game', sessionId: record.sessionId, gameId: record.gameId, linkedAt: now, evaluation: blankEvaluation(staff.localId, now) };
    const linked = (patch: Record<string, unknown> = {}) => ({ ...visit, revision: 1, updatedAt: Date.now(), entries: { [record.sessionId]: { ...entry, ...patch } } });
    // the claim requires the real saved result: before saving, no claim and no link
    await put(`sessions/${pid}/${record.sessionId}`, null, '', true);
    expect(await put(`visitResultClaims/${pid}/${record.sessionId}`, visit.visitId, other.idToken)).toBe(401);
    expect(await put(`sessions/${pid}/${record.sessionId}`, record, staff.idToken)).toBe(200);
    expect(await put(`visitResultClaims/${pid}/${record.sessionId}`, visit.visitId, staff.idToken)).toBe(200);
    expect(await put(`therapyVisits/${pid}/${visit.visitId}`, linked({ gameId: 'achievement-city-3d', sessionId: 'someone-elses' }), staff.idToken)).toBe(401);
    expect(await put(`therapyVisits/${pid}/${visit.visitId}`, linked(), staff.idToken)).toBe(200);
    expect(await put(`visitResultClaims/${pid}/${record.sessionId}`, 'another-visit', staff.idToken)).toBe(401); // claim is immutable
  });
});
