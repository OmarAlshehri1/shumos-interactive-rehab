/** Loopback-only security tests. Never connect to a production project. */
import { beforeAll, describe, expect, it } from 'vitest';
import { createState, reduce } from '../engine';
import { makeLive } from '../live';
import { buildHistory } from '../history';
const enabled = process.env.FIRE_RESCUE_RULES_EMULATOR === '1';
const db = `http://127.0.0.1:${process.env.FIRE_RESCUE_DB_PORT ?? 19800}`;
const auth = `http://127.0.0.1:${process.env.FIRE_RESCUE_AUTH_PORT ?? 19899}/identitytoolkit.googleapis.com/v1`;
const ns = 'demo-fire-rescue-rules-default-rtdb';
async function put(path: string, body: unknown, token = '', admin = false) { return (await fetch(`${db}/${path}.json?ns=${ns}${token ? `&auth=${token}` : ''}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(admin ? { Authorization: 'Bearer owner' } : {}) }, body: JSON.stringify(body) })).status; }
async function signup() { const r = await fetch(`${auth}/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) }); const j = await r.json(); return { uid: j.localId as string, token: j.idToken as string }; }
describe.skipIf(!enabled)('Fire Rescue shared Firebase rules', () => {
    let staff: Awaited<ReturnType<typeof signup>>, other: typeof staff, anon: typeof staff, inactive: typeof staff;
    let revision = 0;
    const stamp = () => ({ controlTabId: 'fire-rules-tab', heartbeatAt: Date.now() });
    const record = (uid: string) => { const s = createState('fire-rules-live'); return { gameId: 'fire-rescue-3d', sessionId: s.sessionId, revision: ++revision, updatedAt: Date.now(), session: makeLive(s, uid, 'ليلى', stamp()) }; };
    const history = (uid: string, sid: string) => { let s = createState(sid); s = reduce(s, { type: 'start', at: 1000 }); s = reduce(s, { type: 'skipObjective' }); s = reduce(s, { type: 'skipObjective' }); s = reduce(s, { type: 'end', at: 2000 }); return buildHistory(s, 'fire-rules-patient', uid); };
    beforeAll(async () => { staff = await signup(); other = await signup(); anon = await signup(); inactive = await signup(); for (const s of [staff, other])
        expect(await put(`staff/${s.uid}`, { active: true, role: 'therapist' }, '', true)).toBe(200); await put(`staff/${inactive.uid}`, { active: false, role: 'therapist' }, '', true); await put('controllerLease', { ownerId: staff.uid, claimedAt: 1, updatedAt: Date.now() }, '', true); await put('patients/fire-rules-patient', { patientNumber: 'FIRE-RULES', firstName: 'ليلى', createdAt: 1, updatedAt: 1, createdByUid: staff.uid, active: true }, '', true); await put('liveSession', null, '', true); });
    it('allows only the active lease owner to publish Fire Rescue', async () => { expect(await put('liveSession', record(staff.uid), staff.token)).toBe(200); for (const u of [other, anon, inactive])
        expect(await put('liveSession', record(u.uid), u.token)).toBe(401); expect(await put('liveSession', record(staff.uid))).toBe(401); });
    it('rejects forged owner, payload version and oversized payload', async () => { let r = record(staff.uid); r.session.fr3.ownerId = other.uid; expect(await put('liveSession', r, staff.token)).toBe(401); r = record(staff.uid); r.session.engineVersion = 2 as 1; expect(await put('liveSession', r, staff.token)).toBe(401); r = record(staff.uid); r.session.fr3.payload = 'x'.repeat(32769); expect(await put('liveSession', r, staff.token)).toBe(401); });
    it('protects active controller tabs and monotonic revisions', async () => { let r = record(staff.uid); r.session.fr3.controlTabId = 'other-tab'; expect(await put('liveSession', r, staff.token)).toBe(401); r = record(staff.uid); expect(await put('liveSession', r, staff.token)).toBe(200); expect(await put('liveSession', r, staff.token)).toBe(401); });
    it('rejects another active tab even when it invents a new session ID', async () => {
        const r = record(staff.uid);
        r.sessionId = 'different-fire-session';
        r.session = makeLive(createState(r.sessionId), staff.uid, 'ليلى', { ...stamp(), controlTabId: 'other-tab' });
        expect(await put('liveSession', r, staff.token)).toBe(401);
    });
    it('preserves an ended partial stage without claiming it completed or skipped', async () => {
        let s = reduce(createState('partial-' + staff.uid.slice(0, 8)), { type: 'start', at: 1000 });
        s = reduce(s, { type: 'skipObjective' });
        s = reduce(s, { type: 'end', at: 2000 });
        const h = buildHistory(s, 'fire-rules-patient', staff.uid);
        expect(h.stageResults[0].status).toBe('PARTIAL');
        expect(h.completedStageCount).toBe(0);
        expect(h.skippedStageCount).toBe(0);
        expect(await put('sessions/fire-rules-patient/' + h.sessionId, h, staff.token)).toBe(200);
    });
    it('saves history once and keeps patient data staff-only', async () => { const h = history(staff.uid, 'fire-rules-history-' + staff.uid.slice(0, 8)); expect(await put('sessions/fire-rules-patient/' + h.sessionId, h, staff.token)).toBe(200); expect(await put('sessions/fire-rules-patient/' + h.sessionId, h, staff.token)).toBe(401); expect(await put('sessions/fire-rules-patient/anon-history', history(anon.uid, 'anon-history-' + anon.uid.slice(0, 8)), anon.token)).toBe(401); const get = await fetch(`${db}/sessions/fire-rules-patient.json?ns=${ns}&auth=${anon.token}`); expect(get.status).toBe(401); });
    it('rejects missing patients, forged bindings, invalid counts and clinical metrics', async () => { let h = history(staff.uid, 'bad-patient'); expect(await put('sessions/missing/bad-patient', { ...h, patientId: 'missing' }, staff.token)).toBe(401); const variants = [{ assistedObjectives: -1 }, { fireTargetsExtinguished: 19 }, { resultVersion: 2 }, { engine: 'invalid' }, { sessionCompleted: true }, { accuracy: 0.9 }, { createdByUid: other.uid }, { startingStage: 4 }, { drivingObjectives: 0.5 }]; for (let i = 0; i < variants.length; i++) {
        h = history(staff.uid, 'invalid-' + i);
        expect(await put('sessions/fire-rules-patient/' + h.sessionId, { ...h, ...variants[i] }, staff.token), JSON.stringify(variants[i])).toBe(401);
    } });
    it('retains other active game IDs and does not restore the retired game', async () => { const s = createState('retired'); const r = { gameId: 'feed-the-animals', sessionId: s.sessionId, revision: ++revision, updatedAt: Date.now(), session: makeLive(s, staff.uid, 'ليلى', stamp()) }; expect(await put('liveSession', r, staff.token)).toBe(401); });
});
