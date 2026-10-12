import {beforeAll,describe,expect,it} from 'vitest';
import {createState,reduce} from '../engine';
import {buildHistory} from '../history';
import {makeLive} from '../live';
const on=process.env.DOME_RULES_EMULATOR==='1',DB=`http://127.0.0.1:${process.env.SHUMOS_RULES_DB_PORT ?? 19900}`,AUTH=`http://127.0.0.1:${process.env.SHUMOS_RULES_AUTH_PORT ?? 19999}/identitytoolkit.googleapis.com/v1`,NS='demo-rules-default-rtdb';
async function put(path:string,body:unknown,token='owner'){const r=await fetch(`${DB}/${path}.json?ns=${NS}${token==='owner'?'':`&auth=${token}`}`,{method:'PUT',headers:{'Content-Type':'application/json',...(token==='owner'?{Authorization:'Bearer owner'}:{})},body:JSON.stringify(body)});return r.status;}
async function signup(email?:string){const r=await fetch(`${AUTH}/accounts:signUp?key=fake`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...(email?{email,password:'password123'}:{}),returnSecureToken:true})});const j=await r.json();return {uid:j.localId as string,token:j.idToken as string};}
describe.skipIf(!on)('Wonder Dome rules on isolated emulators',()=>{
 let staff:{uid:string;token:string},other:{uid:string;token:string},anon:{uid:string;token:string};
 beforeAll(async()=>{staff=await signup(`dome-${Date.now()}@test.local`);other=await signup(`other-${Date.now()}@test.local`);anon=await signup();await put('staff/'+staff.uid,{active:true,role:'therapist'});await put('staff/'+other.uid,{active:true,role:'therapist'});});
 it('requires active staff, lease ownership and matching engine owner; rejects duplicate revisions',async()=>{
   await put('liveSession',null);await put('controllerLease',{ownerId:staff.uid,claimedAt:1,updatedAt:1});
   const session=makeLive(createState('dome-rules'),staff.uid,'صديقي',{controlTabId:'tab',heartbeatAt:1});
   const record={gameId:'bubble-pop-wall',sessionId:session.sessionId,session,revision:1,updatedAt:1};
   expect(await put('liveSession',record,anon.token)).toBe(401);expect(await put('liveSession',record,other.token)).toBe(401);
   expect(await put('liveSession',record,staff.token)).toBe(200);expect(await put('liveSession',record,staff.token)).toBe(401);
   expect(await put('liveSession',{...record,revision:2,session:{...session,dome3:{...session.dome3,ownerId:other.uid}}},staff.token)).toBe(401);
   expect(await put('liveSession',{...record,revision:2,session:{...session,dome3:{...session.dome3,payload:'x'.repeat(32769)}}},staff.token)).toBe(401);
   expect(await put('liveSession',{...record,revision:2,gameId:'follow-the-footsteps'},staff.token)).toBe(401);
   expect(await put('liveSession',{...record,revision:2,patientId:'private'},staff.token)).toBe(401);
 });
 it('saves a versioned result once, rejects invalid metrics, and keeps patient history private',async()=>{
   await put('patients/dome-rules-patient',{patientNumber:'DR1',firstName:'نور',createdAt:1,updatedAt:1,createdByUid:staff.uid,active:true});
   const ended=reduce(reduce(createState('dome-history'),{type:'start',at:100}),{type:'end',at:200});
   const history=buildHistory(ended,'dome-rules-patient',staff.uid),path=`sessions/${history.patientId}/${history.sessionId}`;
   expect(await put(path,{...history,assistedObjectives:2},staff.token)).toBe(401);
   expect(await put(path,history,staff.token)).toBe(200);
   expect(await put(path,history,staff.token)).toBe(401);
   const response=await fetch(`${DB}/${path}.json?ns=${NS}&auth=${anon.token}`);expect(response.status).toBe(401);
 });
});
