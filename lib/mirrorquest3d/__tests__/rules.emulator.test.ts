/** Never targets production. Run MIRROR_RULES_EMULATOR=1 with local ports 19100/19199. */
import { beforeAll,describe,it,expect } from 'vitest';
import { createState,reduce } from '../engine';
import { makeLive } from '../live';
import { buildHistory } from '../history';
const DB=`http://127.0.0.1:${process.env.SHUMOS_RULES_DB_PORT ?? 19100}`,AUTH=`http://127.0.0.1:${process.env.SHUMOS_RULES_AUTH_PORT ?? 19199}/identitytoolkit.googleapis.com/v1`,NS='demo-mirror-rules-default-rtdb';
const admin={Authorization:'Bearer owner','Content-Type':'application/json'};
const url=(p:string,token='')=>`${DB}/${p}.json?ns=${NS}${token?`&auth=${token}`:''}`;
async function put(p:string,v:unknown,token='',owner=false){return (await fetch(url(p,token),{method:'PUT',headers:owner?admin:{'Content-Type':'application/json'},body:JSON.stringify(v)})).status;}
async function signup(){const r=await fetch(`${AUTH}/accounts:signUp?key=fake`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`mirror-rule-${crypto.randomUUID()}@example.test`,password:'local-test-password',returnSecureToken:true})});return await r.json() as {localId:string;idToken:string};}
describe.skipIf(process.env.MIRROR_RULES_EMULATOR!=='1')('Mirror shared-session rules',()=>{
 let staff:{localId:string;idToken:string},other:{localId:string;idToken:string};const pid='mirror-rules-patient';
 const live=(revision:number,patch:Record<string,unknown>={})=>({gameId:'mirror-quest-3d',sessionId:'mirror-rules',revision,updatedAt:{'.sv':'timestamp'},session:makeLive(createState('mirror-rules'),staff.localId,'',{controlTabId:'rules-tab',heartbeatAt:Date.now()}),...patch});
 beforeAll(async()=>{staff=await signup();other=await signup();for(const s of [staff,other])expect(await put(`staff/${s.localId}`,{active:true,role:'therapist'},'',true)).toBe(200);expect(await put('controllerLease',{ownerId:staff.localId,claimedAt:Date.now(),updatedAt:Date.now()},'',true)).toBe(200);expect(await put(`patients/${pid}`,{patientNumber:pid,firstName:'اختبار',active:true,createdAt:1,updatedAt:1,createdByUid:staff.localId},'',true)).toBe(200);expect(await put('liveSession',null,'',true)).toBe(200);});
 it('only the lease-owning staff member may publish',async()=>{expect(await put('liveSession',live(1),other.idToken)).toBe(401);expect(await put('liveSession',live(1),staff.idToken)).toBe(200);});
 it('refuses duplicate and stale revisions',async()=>{expect(await put('liveSession',live(1),staff.idToken)).toBe(401);expect(await put('liveSession',live(0),staff.idToken)).toBe(401);});
 it('rejects malformed engine metadata and oversized payloads',async()=>{const v=live(2);expect(await put('liveSession',{...v,session:{...v.session,engine:'fake'}},staff.idToken)).toBe(401);expect(await put('liveSession',{...v,session:{...v.session,mirror3:{...v.session.mirror3,payload:'x'.repeat(32769)}}},staff.idToken)).toBe(401);});
 it('refuses a patient identifier on the public Display record',async()=>{expect(await put('liveSession',live(2,{patientId:pid}),staff.idToken)).toBe(401);});
 it('stores one immutable versioned history record with assistance',async()=>{let s=reduce(createState('mirror-rules'),{type:'start',at:1000});s=reduce(s,{type:'assist'});s=reduce(s,{type:'end',at:2000});const record=buildHistory(s,pid,staff.localId),path=`sessions/${pid}/${record.sessionId}`;await put(path,null,'',true);expect(await put(path,record,staff.idToken)).toBe(200);expect(await put(path,record,staff.idToken)).toBe(401);expect(await put(path,{...record,totalPoses:99},staff.idToken)).toBe(401);});
});
