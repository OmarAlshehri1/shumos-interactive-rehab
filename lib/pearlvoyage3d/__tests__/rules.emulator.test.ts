/** Loopback-only security tests. Never connect to a production project. Run with PEARL_RULES_EMULATOR=1 and dedicated emulator ports. */
import { beforeAll, describe, expect, it } from 'vitest';
import { createState, reduce, type State } from '../engine';
import { makeLive } from '../live';
import { buildHistory } from '../history';

const enabled = process.env.PEARL_RULES_EMULATOR === '1';
const db = `http://127.0.0.1:${process.env.PEARL_DB_PORT ?? 19700}`;
const auth = `http://127.0.0.1:${process.env.PEARL_AUTH_PORT ?? 19799}/identitytoolkit.googleapis.com/v1`;
const ns = 'demo-pearl-voyage-rules-default-rtdb';
async function put(path: string, body: unknown, token = '', admin = false) { return (await fetch(`${db}/${path}.json?ns=${ns}${token ? `&auth=${token}` : ''}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(admin ? { Authorization: 'Bearer owner' } : {}) }, body: JSON.stringify(body) })).status; }
async function signup() { const r = await fetch(`${auth}/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) }); const j = await r.json(); return { uid: j.localId as string, token: j.idToken as string }; }

describe.skipIf(!enabled)('Pearl Voyage shared Firebase rules', () => {
    let staff: Awaited<ReturnType<typeof signup>>, other: typeof staff, anon: typeof staff, inactive: typeof staff;
    let revision = 0;
    const stamp = () => ({ controlTabId: 'pearl-rules-tab', heartbeatAt: Date.now() });
    const record = (uid: string, state: State = createState('pearl-rules-live')) => ({ gameId: 'pearl-voyage-3d', sessionId: state.sessionId, revision: ++revision, updatedAt: Date.now(), session: makeLive(state, uid, 'ليلى', stamp()) });
    const finished = (sid: string, mutate?: (s: State) => State) => {
        let s = reduce(createState(sid), { type: 'start', at: 1000 });
        s = reduce(s, { type: 'assist' });
        s = reduce(s, { type: 'skipObjective' });
        s = reduce(s, { type: 'end', at: 2000 });
        return mutate ? mutate(s) : s;
    };
    const history = (uid: string, sid: string) => buildHistory(finished(sid), 'pearl-rules-patient', uid);
    beforeAll(async () => {
        staff = await signup(); other = await signup(); anon = await signup(); inactive = await signup();
        for (const s of [staff, other]) expect(await put(`staff/${s.uid}`, { active: true, role: 'therapist' }, '', true)).toBe(200);
        await put(`staff/${inactive.uid}`, { active: false, role: 'therapist' }, '', true);
        await put('controllerLease', { ownerId: staff.uid, claimedAt: 1, updatedAt: Date.now() }, '', true);
        await put('patients/pearl-rules-patient', { patientNumber: 'PEARL-RULES', firstName: 'ليلى', createdAt: 1, updatedAt: 1, createdByUid: staff.uid, active: true }, '', true);
        await put('liveSession', null, '', true);
    });
    it('allows only the active lease owner to publish Pearl Voyage', async () => {
        expect(await put('liveSession', record(staff.uid), staff.token)).toBe(200);
        for (const u of [other, anon, inactive]) expect(await put('liveSession', record(u.uid), u.token)).toBe(401);
        expect(await put('liveSession', record(staff.uid))).toBe(401);
    });
    it('rejects forged owner, engine version, engine key and oversized payload', async () => {
        let r = record(staff.uid); r.session.pv3.ownerId = other.uid; expect(await put('liveSession', r, staff.token)).toBe(401);
        r = record(staff.uid); r.session.engineVersion = 2 as 1; expect(await put('liveSession', r, staff.token)).toBe(401);
        r = record(staff.uid); (r.session as { engine: string }).engine = 'fr3'; expect(await put('liveSession', r, staff.token)).toBe(401);
        r = record(staff.uid); r.session.pv3.payload = 'x'.repeat(32769); expect(await put('liveSession', r, staff.token)).toBe(401);
        r = record(staff.uid); (r.session.pv3 as unknown as Record<string, unknown>).extra = 'x'; expect(await put('liveSession', r, staff.token)).toBe(401);
    });
    it('accepts a realistic in-play payload and stays under the size limit for the largest session', async () => {
        let s = reduce(createState('pearl-size'), { type: 'start', at: 1000 });
        for (let stage = 0; stage < 9; stage++) { s = reduce(s, { type: 'skipStage' }); if (stage < 8) { s = reduce(s, { type: 'next', at: 1100 }); } }
        expect(JSON.stringify({ ...s, lastTick: 0 }).length).toBeLessThan(8000);
        expect(await put('liveSession', record(staff.uid, s), staff.token)).toBe(200);
    });
    it('protects active controller tabs and monotonic revisions', async () => {
        let r = record(staff.uid); r.session.pv3.controlTabId = 'other-tab'; expect(await put('liveSession', r, staff.token)).toBe(401);
        r = record(staff.uid); expect(await put('liveSession', r, staff.token)).toBe(200); expect(await put('liveSession', r, staff.token)).toBe(401);
    });
    it('rejects another active tab even when it invents a new session ID', async () => {
        const r = record(staff.uid);
        r.sessionId = 'different-pearl-session';
        r.session = makeLive(createState(r.sessionId), staff.uid, 'ليلى', { ...stamp(), controlTabId: 'other-tab' });
        expect(await put('liveSession', r, staff.token)).toBe(401);
    });
    it('saves a partial-stage history without claiming completion', async () => {
        let s = reduce(createState('partial-' + staff.uid.slice(0, 8)), { type: 'stage', stage: 1 });
        s = reduce(s, { type: 'start', at: 1000 });
        s = reduce(s, { type: 'skipObjective' });
        s = reduce(s, { type: 'end', at: 2000 });
        const h = buildHistory(s, 'pearl-rules-patient', staff.uid);
        expect(h.stageResults[0].status).toBe('PARTIAL');
        expect(h.completedStageCount).toBe(0);
        expect(await put('sessions/pearl-rules-patient/' + h.sessionId, h, staff.token)).toBe(200);
    });
    it('saves history once and keeps patient data staff-only', async () => {
        const h = history(staff.uid, 'pearl-rules-history-' + staff.uid.slice(0, 8));
        expect(await put('sessions/pearl-rules-patient/' + h.sessionId, h, staff.token)).toBe(200);
        expect(await put('sessions/pearl-rules-patient/' + h.sessionId, h, staff.token)).toBe(401);
        expect(await put('sessions/pearl-rules-patient/anon-history', history(anon.uid, 'anon-history-' + anon.uid.slice(0, 8)), anon.token)).toBe(401);
        expect((await fetch(`${db}/sessions/pearl-rules-patient.json?ns=${ns}&auth=${anon.token}`)).status).toBe(401);
    });
    it('rejects missing patients, forged bindings, invalid counts, clinical metrics and unknown fields', async () => {
        let h = history(staff.uid, 'bad-patient');
        expect(await put('sessions/missing/bad-patient', { ...h, patientId: 'missing' }, staff.token)).toBe(401);
        const variants: Record<string, unknown>[] = [{ fishDiscovered: 30 }, { assistedEncounters: -1 }, { independentEncounters: 4 }, { skippedEncounters: 0.5 }, { repeatedEncounters: -2 }, { resultVersion: 2 }, { engine: 'fr3' }, { sessionCompleted: true }, { participationMode: 'HAND' }, { accuracy: 0.9 }, { createdByUid: other.uid }, { startingStage: 4 }, { completedStageCount: 10 }, { unknownField: 1 }, { stageResults: [{ engine: 'pv3', stageIndex: 9, difficulty: 'EASY', stageNumber: 1, status: 'PARTIAL', fishDiscovered: 0, assistedEncounters: 0, skippedEncounters: 1 }] }, { stageResults: [{ engine: 'pv3', stageIndex: 0, difficulty: 'ADVANCED', stageNumber: 1, status: 'PARTIAL', fishDiscovered: 0, assistedEncounters: 0, skippedEncounters: 1 }] }, { stageResults: [{ engine: 'pv3', stageIndex: 0, difficulty: 'EASY', stageNumber: 1, status: 'PARTIAL', fishDiscovered: 0, assistedEncounters: 1, skippedEncounters: 0 }] }, { stageResults: [{ engine: 'pv3', stageIndex: 0, difficulty: 'EASY', stageNumber: 1, status: 'PARTIAL', fishDiscovered: 0, assistedEncounters: 0, skippedEncounters: 1, secret: 'x' }] }];
        for (let i = 0; i < variants.length; i++) {
            h = history(staff.uid, 'invalid-' + i);
            expect(await put('sessions/pearl-rules-patient/' + h.sessionId, { ...h, ...variants[i] }, staff.token), JSON.stringify(variants[i])).toBe(401);
        }
    });
    it('accepts every participation mode the app can record', async () => {
        for (const [i, mode] of (['MANUAL', 'WHEEL', 'PEDAL', 'WHEEL_PEDAL', 'MIXED'] as const).entries()) {
            const h = { ...history(staff.uid, 'mode-' + i + '-' + staff.uid.slice(0, 6)), participationMode: mode, inputSource: mode };
            expect(await put('sessions/pearl-rules-patient/' + h.sessionId, h, staff.token), mode).toBe(200);
        }
    });
    it('retains other active game IDs and does not restore the retired game', async () => {
        const s = createState('retired');
        const r = { gameId: 'feed-the-animals', sessionId: s.sessionId, revision: ++revision, updatedAt: Date.now(), session: makeLive(s, staff.uid, 'ليلى', stamp()) };
        expect(await put('liveSession', r, staff.token)).toBe(401);
        const other3d = { ...record(staff.uid), gameId: 'fire-rescue-3d' };
        expect(await put('liveSession', other3d, staff.token), 'a pv3 payload must not pass under another game id').toBe(401);
    });
});
