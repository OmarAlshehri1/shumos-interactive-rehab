/** Loopback/demo emulators only. No live Firebase project or patient data. */
import { beforeAll, describe, expect, it } from 'vitest';
import { SessionAuthority } from '../sessionAuthority';
import { spacePilotLiveSession } from '../cloudState';
import { buildStoredRingSession } from '../history';
import { NINE_STAGE_CURRICULUM } from '../curriculum';
const DB = `http://127.0.0.1:${process.env.SHUMOS_RULES_DB_PORT ?? process.env.SP_DB_PORT ?? '19200'}`, AUTH = `http://127.0.0.1:${process.env.SHUMOS_RULES_AUTH_PORT ?? process.env.SP_AUTH_PORT ?? '19099'}/identitytoolkit.googleapis.com/v1`;
const NS = 'demo-spacepilot-default-rtdb', admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const enabled = process.env.SPACE_PILOT_EMULATOR === '1';
const url = (path: string, token = '') => `${DB}/${path}.json?ns=${NS}${token ? `&auth=${token}` : ''}`;
async function put(path: string, body: unknown, token = '', elevated = false) { const r = await fetch(url(path, token), { method: 'PUT', headers: elevated ? admin : { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, text: await r.text() }; }
async function read(path: string, token = '') { return fetch(url(path, token)); }
async function signup(email?: string) {
  const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(email ? { email, password: 'password123' } : {}), returnSecureToken: true }) });
  const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j)); return { uid: j.localId as string, token: j.idToken as string };
}
let revision = Date.now() + 5_000_000;
function liveRecord(uid: string, over: { epoch?: number } = {}) {
  const id = crypto.randomUUID(), a = new SessionAuthority(id, crypto.randomUUID(), id);
  const session = spacePilotLiveSession(a, 0, 'اختبار', uid, { createdAt: Date.now() - 1, startedAt: 0, endedAt: 0, epoch: over.epoch ?? 1 }, { controlTabId: 'tab-1', heartbeatAt: Date.now() });
  return { a, id, session, record: { gameId: 'space-pilot', sessionId: id, revision: ++revision, updatedAt: { '.sv': 'timestamp' }, session } };
}
describe.skipIf(!enabled)('Space Pilot on the shared liveSession: RTDB/Auth emulator security', () => {
  let staff: Awaited<ReturnType<typeof signup>>, other: typeof staff, inactive: typeof staff, anon: typeof staff;
  beforeAll(async () => {
    const t = Date.now(); staff = await signup(`sp-owner-${t}@example.test`); other = await signup(`sp-other-${t}@example.test`); inactive = await signup(`sp-inactive-${t}@example.test`); anon = await signup();
    for (const u of [staff, other]) expect((await put(`staff/${u.uid}`, { active: true, role: 'therapist' }, '', true)).status).toBe(200);
    await put(`staff/${inactive.uid}`, { active: false, role: 'therapist' }, '', true);
    await put('patients/sp-test-patient', { patientNumber: 'SPTEST', firstName: 'اختبار', createdAt: 1, updatedAt: 1, createdByUid: staff.uid, active: true }, '', true);
  });
  it('active staff publish the live record; the anonymous Display may read it; nobody else may write; revisions only increase', async () => {
    await put('liveSession', null, '', true);
    const r = liveRecord(staff.uid);
    expect((await put('liveSession', r.record, staff.token)).status).toBe(200);
    expect((await read('liveSession', anon.token)).status).toBe(200); expect((await read('liveSession')).status).toBe(401);
    for (const token of [anon.token, inactive.token, '']) expect((await put('liveSession', { ...r.record, revision: ++revision }, token)).status).toBe(401);
    expect((await put('liveSession', r.record, staff.token)).status).toBe(401); // same revision
    expect((await put('liveSession', { ...r.record, revision: ++revision }, staff.token)).status).toBe(200);
    expect((await put('liveSession', { ...r.record, revision: ++revision, session: { ...r.session, config: { childFirstName: '' } } }, staff.token)).status).toBe(401);
  });
  it('retired dedicated room/active/patient paths accept no writes from anyone', async () => {
    const id = crypto.randomUUID();
    for (const path of [`spacePilot3d/rooms/${id}`, 'spacePilot3d/active', `spacePilot3d/patients/${id}`]) {
      expect((await put(path, { sessionId: id }, staff.token)).status, path).toBe(401);
      expect((await read(path, anon.token)).status, path).toBe(401);
    }
  });
  it('limits Display to its own bounded versioned presence, bound to the live session, and rejects gameplay/input messages', async () => {
    await put('liveSession', null, '', true);
    const r = liveRecord(staff.uid); expect((await put('liveSession', r.record, staff.token)).status).toBe(200);
    const p = `spacePilot3d/presence/${r.id}/${anon.uid}`;
    const ack = { version: 4, type: 'ack', displayId: crypto.randomUUID(), ownerId: r.session.sp3.ownerToken, sessionId: r.id, runId: r.session.sp3.run, inputEpoch: 1, frameSequence: 1, sequence: 1, visible: true, ready: true, updatedAt: { '.sv': 'timestamp' } };
    expect((await put(p, ack, anon.token)).status).toBe(200);
    expect((await put(p, ack, anon.token)).status).toBe(401);
    for (const bad of [{ ...ack, sequence: 2, type: 'input' }, { ...ack, sequence: 2, ownerId: 'forged' }, { ...ack, sequence: 2, score: 100 }, { ...ack, sequence: 2, runId: 99 }]) expect((await put(p, bad, anon.token)).status).toBe(401);
    expect((await put(`spacePilot3d/presence/${r.id}/another-uid`, ack, anon.token)).status).toBe(401);
    expect((await read(`spacePilot3d/presence/${r.id}`, anon.token)).status).toBe(401);
    // An acknowledgement for a session that is not the live one is refused, and so is one for a stale live record.
    const ghost = crypto.randomUUID();
    expect((await put(`spacePilot3d/presence/${ghost}/${anon.uid}`, { ...ack, sessionId: ghost, sequence: 1 }, anon.token)).status).toBe(401);
    await put('liveSession', { ...r.record, revision: ++revision, updatedAt: Date.now() - 60000 }, '', true);
    expect((await put(`spacePilot3d/presence/${r.id}/${anon.uid}`, { ...ack, sequence: 5 }, anon.token)).status).toBe(401);
  });
  it('authorizes only the owner account\'s normalized RIGHT_HAND relay for the live session and fences competing sources/replays', async () => {
    await put('liveSession', null, '', true);
    const r = liveRecord(staff.uid); expect((await put('liveSession', r.record, staff.token)).status).toBe(200);
    const p = `spacePilot3d/sensor/${r.id}`;
    const sample = { version: 1, role: 'RIGHT_HAND', ownerId: r.session.sp3.ownerToken, epoch: r.session.sp3.epoch, runId: r.session.sp3.run, inputEpoch: 1, sourceToken: crypto.randomUUID(), sequence: 1, sampleAgeMs: 0, x: .5, y: .5, visible: true, updatedAt: { '.sv': 'timestamp' } };
    for (const token of [anon.token, inactive.token, other.token, '']) expect((await put(p, sample, token)).status).toBe(401);
    expect((await put(p, sample, staff.token)).status).toBe(200);
    expect((await put(p, sample, staff.token)).status).toBe(401);
    for (const bad of [{ ...sample, sequence: 2, role: 'LEFT_HAND' }, { ...sample, sequence: 2, sourceToken: crypto.randomUUID() }, { ...sample, sequence: 2, runId: 999 }, { ...sample, sequence: 2, epoch: 9 }, { ...sample, sequence: 2, ownerId: 'forged' }, { ...sample, sequence: 2, x: 2 }, { ...sample, sequence: 2, sampleAgeMs: -1 }, { ...sample, sequence: 2, sampleAgeMs: 251 }, { ...sample, sequence: 2, unknown: true }]) expect((await put(p, bad, staff.token)).status).toBe(401);
    expect((await put(p, { ...sample, sequence: 2 }, staff.token)).status).toBe(200);
    expect((await read(p, anon.token)).status).toBe(401);
    const ghost = crypto.randomUUID();
    expect((await put(`spacePilot3d/sensor/${ghost}`, { ...sample, sequence: 1 }, staff.token)).status).toBe(401);
  });
  it('saves ring results once under the versioned schema for an existing patient, denies malformed/forged shapes and preserves legacy star history', async () => {
    const r = liveRecord(staff.uid);
    r.a.command({ type: 'end' }, r.a.revision, r.a.simulation.runId, 0);
    const ended = spacePilotLiveSession(r.a, 0, 'اختبار', staff.uid, { createdAt: Date.now() - 1000, startedAt: Date.now() - 500, endedAt: Date.now(), epoch: 1 }, {});
    const result = buildStoredRingSession(ended, 'sp-test-patient', staff.uid), hp = `sessions/sp-test-patient/${r.id}`;
    for (const [name, bad, writer] of [['version', { ...result, resultVersion: 1 }, staff], ['collected', { ...result, totalRingsCollected: 99 }, staff], ['stars', { ...result, totalStarsCollected: 1 }, staff],
      ['forged creator', { ...result, createdByUid: staff.uid }, other], ['score', { ...result, score: 999 }, staff], ['upgrade', { ...result, finalUpgradeLevel: 99 }, staff], ['patient', { ...result, patientId: 'missing-patient' }, staff]] as const) {
      expect((await put(hp, bad, writer.token)).status, name).toBe(401);
    }
    expect((await put(`sessions/no-such-patient/${r.id}`, { ...result, patientId: 'no-such-patient' }, staff.token)).status).toBe(401);
    expect((await put(hp, result, anon.token)).status).toBe(401);
    expect((await put(hp, result, inactive.token)).status).toBe(401);
    const saved = await put(hp, result, staff.token); expect(saved.status, saved.text).toBe(200);
    expect((await put(hp, result, staff.token)).status).toBe(401);
    expect((await read(hp, anon.token)).status).toBe(401);
    const legacyId = `legacy-sp-${Date.now()}`;
    const legacy = { sessionId: legacyId, patientId: 'sp-test-patient', gameId: 'space-pilot', startedAt: 100, completedAt: 200, createdByUid: staff.uid, startingDifficulty: 'EASY', startingStage: 1, endingDifficulty: 'EASY', endingStage: 1, completedStageCount: 1, skippedStageCount: 0, totalStarsPresented: 2, totalStarsCollected: 1 };
    expect((await put(`sessions/sp-test-patient/${legacyId}`, legacy, staff.token)).status).toBe(200);
  });
  it('accepts explicit v3 nine-stage history once and denies forged progress, curriculum, stage identities and unauthorized writers',async()=>{
    const id=crypto.randomUUID(),a=new SessionAuthority(id,crypto.randomUUID(),id,'LOW',3000,NINE_STAGE_CURRICULUM);
    for(let i=0;i<9;i++){a.command({type:'select-stage',value:i},a.revision,a.simulation.runId,0);a.command({type:'skip-stage'},a.revision,a.simulation.runId,0);}
    const session=spacePilotLiveSession(a,0,'اختبار',staff.uid,{createdAt:Date.now()-1000,startedAt:Date.now()-500,endedAt:Date.now(),epoch:1},{});
    const result=buildStoredRingSession(session,'sp-test-patient',staff.uid),hp=`sessions/sp-test-patient/${id}`;
    if(result.resultVersion!==3)throw Error('Expected new result version');
    for(const bad of [{...result,curriculumId:'fake'}, {...result,completedStageCount:9}, {...result,skippedStageCount:8}, {...result,assistedStageCount:1}, {...result,sessionCompleted:true}, {...result,stageResults:{...result.stageResults,0:{...result.stageResults[0],stageIndex:1}}}, {...result,stageResults:{...result.stageResults,9:result.stageResults[0]}}, {...result,totalStarsCollected:1}])expect((await put(hp,bad,staff.token)).status).toBe(401);
    for(const writer of [anon,inactive,other])expect((await put(hp,result,writer.token)).status).toBe(401);
    const saved=await put(hp,result,staff.token);expect(saved.status,saved.text).toBe(200);
    expect((await put(hp,result,staff.token)).status).toBe(401);
    expect((await read(hp,staff.token)).status).toBe(200);
    expect((await read(hp,anon.token)).status).toBe(401);
  });

  it('accepts all nine physically resolved stages in version-3 history', async()=>{
    const id=crypto.randomUUID(),a=new SessionAuthority(id,crypto.randomUUID(),id,'LOW',3000,NINE_STAGE_CURRICULUM),displayId=crypto.randomUUID();
    let now=0,sequence=0;
    const ack=()=>{const frame=a.frame(now);a.receive({version:4,type:'ack',displayId,ownerId:a.ownerId,sessionId:id,runId:a.simulation.runId,inputEpoch:a.inputEpoch,frameSequence:frame.sequence,sequence:++sequence,visible:true,ready:true},now);};
    ack();ack();a.manual({x:.5,y:.5},false);a.command({type:'start'},a.revision,a.simulation.runId,now);
    for(let n=0;n<40000&&a.lifecycle!=='completed';n++){now+=16;ack();if(a.lifecycle==='mission-complete')a.command({type:'next-mission'},a.revision,a.simulation.runId,now);a.tick(now);}
    expect(a.lifecycle).toBe('completed');
    const session=spacePilotLiveSession(a,now,'اختبار',staff.uid,{createdAt:Date.now()-1000,startedAt:Date.now()-500,endedAt:Date.now(),epoch:1},{});
    const result=buildStoredRingSession(session,'sp-test-patient',staff.uid);
    expect(result.completedStageCount).toBe(9);
    const saved=await put(`sessions/sp-test-patient/${id}`,result,staff.token);expect(saved.status,saved.text).toBe(200);
  });

});
