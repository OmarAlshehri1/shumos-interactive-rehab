/** Short transport/recovery checks. Loopback demo services and synthetic records only; no game rendering. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously, signInWithEmailAndPassword } from 'firebase/auth';
import { connectDatabaseEmulator, getDatabase, get, ref, goOffline, goOnline, type Database } from 'firebase/database';
import { readFileSync } from 'node:fs';
import { getStaffDb, getDisplayDb, getStaffFirebaseApp, getDisplayFirebaseApp } from '@/lib/realtime/firebaseClient';
import { claimControllerLease, fetchLiveSession, publishSession, subscribeToLiveSession } from '@/lib/realtime/sessionRepository';
import { saveSessionHistoryOnce } from '@/lib/sessions/sessionHistoryRepository';
import { createPatientVisit } from '@/lib/therapyVisits/repository';
import { prepareVideoDisplay, publishCommand, subscribeCommand } from '@/lib/youtube/repository';
import { newerCommand, type VideoCommand } from '@/lib/youtube/model';
import { createState, reduce, type State } from '@/lib/achievementforest/engine';
import { decode, makeLive, recoveredState, type AchievementForestLiveSession } from '@/lib/achievementforest/live';
import { buildHistory } from '@/lib/achievementforest/history';
import { LiveRecordPublisher } from '../publisher';
import { decideRecovery } from '../ownership';

const NS='demo-shumos-final-default-rtdb',BASE='http://127.0.0.1:19940',AUTH='http://127.0.0.1:19949';
const owner={Authorization:'Bearer owner','Content-Type':'application/json'};
const url=(path:string)=>`${BASE}/${path}.json?ns=${NS}`;
async function admin(path:string,data:unknown){const r=await fetch(url(path),{method:'PUT',headers:owner,body:JSON.stringify(data)});if(!r.ok)throw Error(`Fixture ${path}: ${r.status}`);}
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function until(f:()=>boolean|Promise<boolean>){for(let i=0;i<100;i++){if(await f())return;await sleep(40);}throw Error('Focused check timed out');}
let control:Database,display:Database,uid:string,state:State,publisher:LiveRecordPublisher<AchievementForestLiveSession>;
const stops:Array<()=>void>=[];const counts:number[]=[];let offline=false;
const send=()=>publisher.publish(state.sessionId,stamp=>makeLive(state,uid,'Synthetic',stamp));
const pid='critical-patient',tab='critical-control-tab';

describe.skipIf(process.env.FINAL_INTEGRATION_EMULATOR!=='1')('Critical shared integration (short SDK interruptions)',()=>{
 beforeAll(async()=>{
  vi.stubEnv('NODE_ENV','development');
  const env={NEXT_PUBLIC_FIREBASE_API_KEY:'fake',NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:'demo-shumos-final.firebaseapp.com',NEXT_PUBLIC_FIREBASE_DATABASE_URL:`https://${NS}.firebaseio.com`,NEXT_PUBLIC_FIREBASE_PROJECT_ID:'demo-shumos-final',NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:'demo-shumos-final.appspot.com',NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:'1',NEXT_PUBLIC_FIREBASE_APP_ID:'1:1:web:final',NEXT_PUBLIC_FIREBASE_EMULATOR_HOST:'127.0.0.1',NEXT_PUBLIC_FIREBASE_EMULATOR_PORT:'19940',NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT:'19949'};
  for(const [k,v] of Object.entries(env))vi.stubEnv(k,v);
  await admin('',null);await admin('.settings/rules',JSON.parse(readFileSync('database.rules.json','utf8')));
  const email=`critical-${Date.now()}@example.test`,password='SyntheticTest123!';
  const r=await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});uid=(await r.json()).localId;
  await admin(`staff/${uid}`,{active:true,role:'therapist'});
  await admin(`patients/${pid}`,{patientNumber:'CRITICAL-1',firstName:'Synthetic',createdAt:1,updatedAt:1,createdByUid:uid,active:true});
  const auth=getAuth(getStaffFirebaseApp());connectAuthEmulator(auth,AUTH,{disableWarnings:true});await signInWithEmailAndPassword(auth,email,password);control=getStaffDb();
  const da=getAuth(getDisplayFirebaseApp());connectAuthEmulator(da,AUTH,{disableWarnings:true});await signInAnonymously(da);display=getDisplayDb();
  await claimControllerLease(control,uid);
  publisher=new LiveRecordPublisher({write:async w=>{if(offline)throw Error('simulated brief interruption');await publishSession(control,{...w,gameId:'achievement-forest-3d',lastInteraction:null,patientId:pid,therapistNotes:state.notes});},fetchBaseRevision:async()=>(await fetchLiveSession(control))?.revision??0,now:Date.now});publisher.setTabId(tab);
  stops.push(subscribeToLiveSession(display,r=>{if(r?.gameId==='achievement-forest-3d'){const s=decode(r.session);if(s)counts.push(s.confirmed+s.assisted);}}));
  state=reduce(createState('critical-session'),{type:'setNotes',notes:'synthetic private note'});state=reduce(state,{type:'start',at:Date.now()});state=reduce(state,{type:'confirm',at:Date.now()});send();publisher.setEnabled(true);await until(()=>counts.includes(1));
 },15000);
 afterAll(async()=>{publisher?.dispose();stops.forEach(s=>s());if(control)goOnline(control);if(display)goOnline(display);await Promise.all([deleteApp(getStaffFirebaseApp()),deleteApp(getDisplayFirebaseApp())]);vi.unstubAllEnvs();});
 it('delivers Control state to the independent Display without exposing the patient binding',async()=>{expect(counts.at(-1)).toBe(1);const r=await fetchLiveSession(display);expect(r?.patientId).toBeNull();expect(r?.therapistNotes).toBeUndefined();expect(decode(r?.session)?.notes).toBe('');expect((await fetchLiveSession(control))?.therapistNotes).toBe('synthetic private note');await expect(get(ref(display,'liveSessionPrivate'))).rejects.toThrow();expect((await fetchLiveSession(control))?.patientId).toBe(pid);});
 it('recovers Control as paused and restores Display using a fresh authenticated client',async()=>{
  const r=(await fetchLiveSession(control))!;const live=r.session as AchievementForestLiveSession;const snapshot=recoveredState(live)!;
  expect(r.therapistNotes).toBe('synthetic private note');expect(snapshot.status).toBe('paused');expect(snapshot.confirmed).toBe(1);expect(decideRecovery({recordSessionId:r.sessionId,recordPatientId:r.patientId??null,meta:live.af3,snapshot,uid,patientId:pid,tabId:tab,now:Date.now()}).kind).toBe('recover');
  const app=initializeApp({apiKey:'fake',projectId:'demo-shumos-final',databaseURL:`https://${NS}.firebaseio.com`},'critical-reloaded-display');const a=getAuth(app);connectAuthEmulator(a,AUTH,{disableWarnings:true});await signInAnonymously(a);const db=getDatabase(app);connectDatabaseEmulator(db,'127.0.0.1',19940);try{expect(decode((await fetchLiveSession(db))?.session)?.confirmed).toBe(1);}finally{await deleteApp(app);}
 });
 it('reconnects after a 250ms interruption with the latest progress and no repeated achievement',async()=>{
  offline=true;goOffline(control);goOffline(display);state=reduce(state,{type:'confirm',at:Date.now()+1000});send();state=reduce(state,{type:'pause'});send();await sleep(250);goOnline(control);goOnline(display);offline=false;await claimControllerLease(control,uid);send();await until(()=>counts.at(-1)===2);await sleep(200);expect(decode((await fetchLiveSession(control))?.session)?.confirmed).toBe(2);expect(Math.max(...counts)).toBe(2);
 });
 it('rejects a stale authorized controller switching games against the current lease',async()=>{
  const email=`critical-other-${Date.now()}@example.test`;
  const signup=await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'SyntheticTest123!',returnSecureToken:true})});const other=await signup.json();await admin(`staff/${other.localId}`,{active:true,role:'therapist'});
  const legacy={gameId:'balloon-quest',sessionId:'unauthorized-legacy',revision:10000,updatedAt:{'.sv':'timestamp'},session:{sessionId:'unauthorized-legacy',seed:1,config:{childFirstName:'Synthetic'},gameState:'PLAYING',currentDifficulty:'EASY',currentStage:1,createdAt:1}};
  const r=await fetch(`${url('liveSession')}&auth=${other.idToken}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(legacy)});expect(r.status).toBe(401);
 });
 it('rejects stale/duplicate delivery revisions at the server',async()=>{const r=(await fetchLiveSession(control))!;await expect(publishSession(control,{sessionId:r.sessionId,revision:r.revision,session:r.session,gameId:'achievement-forest-3d',lastInteraction:null,patientId:pid})).rejects.toThrow();expect(decode((await fetchLiveSession(display))?.session)?.confirmed).toBe(2);});
 it('YouTube refuses to overwrite the unsaved paused game',async()=>{await expect(prepareVideoDisplay(control,uid,tab)).rejects.toThrow();expect((await fetchLiveSession(control))?.sessionId).toBe(state.sessionId);});
 it('saves once across reconnect/retry without losing the confirmed result',async()=>{state=reduce(state,{type:'end',at:Date.now()+2000});send();await until(async()=>decode((await fetchLiveSession(control))?.session)?.status==='ended');const history=buildHistory(state,pid,uid);expect(await saveSessionHistoryOnce(pid,history)).toBe('saved');goOffline(control);await sleep(100);goOnline(control);expect(await saveSessionHistoryOnce(pid,history)).toBe('already-saved');const stored=(await get(ref(control,`sessions/${pid}`))).val();expect(Object.keys(stored)).toEqual([history.sessionId]);expect(stored[history.sessionId].confirmedAchievements).toBe(2);expect(stored[history.sessionId].therapistNotes).toBe('synthetic private note');});
 it('retains the active numbered therapy visit while moving from a saved game to YouTube',async()=>{
  const now=Date.now();await createPatientVisit({version:1,visitId:'critical-visit',patientId:pid,childName:'Synthetic',ownerUid:uid,controlTabId:tab,title:'Synthetic visit',therapistName:'Synthetic',initialNotes:'',finalNotes:'',overallRating:null,startedAt:now,plannedMs:60000,pausedMs:0,pausedAt:null,endedAt:null,revision:0,updatedAt:now,entries:{},breaks:{}});
  await prepareVideoDisplay(control,uid,tab);expect(await fetchLiveSession(control)).toBeNull();expect((await get(ref(control,`activeTherapyVisits/${uid}`))).val().visitId).toBe('critical-visit');expect((await get(ref(control,`therapyVisits/${pid}/critical-visit`))).val().endedAt??null).toBeNull();
 });
 it('delivers media across Display reconnect without applying a duplicate command',async()=>{
  let last:VideoCommand|null=null,handled=0;stops.push(subscribeCommand(display,c=>{if(c&&newerCommand(c,last)){last=c;handled++;}}));const now=Date.now();const c:VideoCommand={sessionId:'critical-media',commandId:'critical-command',ownerId:uid,controlTabId:tab,revision:1,videoId:'M7lc1UVf-VE',state:'playing',position:0,volume:0,muted:true,issuedAt:now,heartbeatAt:now};await publishCommand(control,c);await until(()=>handled===1);goOffline(display);await sleep(100);goOnline(display);await sleep(200);expect(handled).toBe(1);await expect(publishCommand(control,c)).rejects.toThrow();expect(handled).toBe(1);
 });
});
