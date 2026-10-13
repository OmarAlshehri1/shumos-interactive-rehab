// Synthetic LOCAL EMULATOR verification of the actual shared VisitProvider. Control only, no GPU load.
import {launch,openIpad,login,selectPatient,until,sleep,rd} from './crosslib.mjs';
import {seed,put} from './seed.mjs';
import {writeFileSync,mkdirSync} from 'node:fs';
await seed();const browser=await launch('/private/tmp/af-visit-only',9896,['--use-angle=metal']);const results=[];
const check=(name,ok)=>{results.push({name,ok:!!ok});console.log(ok?'PASS':'FAIL',name);};
try{
 const ctl=await openIpad(browser,'http://127.0.0.1:3754/control');await login(ctl);await selectPatient(ctl);await sleep(1500);await ctl.eval("location.href='/control/achievement-forest-3d'");
 if(!await until(()=>ctl.eval("!!document.querySelector('[data-testid=af-control]')"),60000))throw Error('Control did not hydrate');
 const uid=await rd('controllerLease/ownerId'),controlTabId=await ctl.eval("sessionStorage.getItem('shumos.liveGame.controlTabId')"),visitId='forest-visit-browser',at=Date.now();
 await put(`therapyVisits/patient-1/${visitId}`,{version:1,visitId,patientId:'patient-1',childName:'ليلى',ownerUid:uid,controlTabId,title:'جلسة اختبار',therapistName:'معالج تجريبي',initialNotes:'',finalNotes:'',overallRating:null,startedAt:at,plannedMs:45*60000,pausedMs:0,pausedAt:null,endedAt:null,revision:0,updatedAt:at,entries:{},breaks:{}});
 await put(`activeTherapyVisits/${uid}`,{patientId:'patient-1',visitId,controlTabId});await sleep(1500);
 await ctl.click('af-start');await sleep(700);await ctl.click('af-confirm');await sleep(500);
 check('Therapist confirmation recorded in active visit context',await ctl.eval("document.querySelector('[data-testid=af-control]')?.dataset.done==='1'"));
 await ctl.send('Page.reload');
 check('Active-visit reload restores count in safety pause',await until(()=>ctl.eval("document.querySelector('[data-testid=af-control]')?.dataset.done==='1' && document.querySelector('[data-testid=af-control]')?.dataset.status==='paused'"),30000));
 await ctl.click('af-resume');await sleep(500);await ctl.click('af-end');await ctl.click('af-confirm-yes');
 check('Partial history is saved once',await until(async()=>Object.values(await rd('sessions/patient-1')??{}).length===1,15000));
 const histories=Object.values(await rd('sessions/patient-1')??{});const history=histories[0];
 check('Shared VisitProvider attaches saved Forest history to parent visit',!!history&&await until(async()=>{const visit=await rd(`therapyVisits/patient-1/${visitId}`);return visit?.entries?.[history.sessionId]?.gameId==='achievement-forest-3d'&&(await rd(`visitResultClaims/patient-1/${history.sessionId}`))===visitId;},15000));
 mkdirSync('docs/achievementforest3d/evidence',{recursive:true});await ctl.shot('docs/achievementforest3d/evidence/visit-control.png');
}catch(e){check(String(e?.stack??e),false);}finally{browser.close();writeFileSync('docs/achievementforest3d/evidence/visit-results.json',JSON.stringify(results,null,2));}
process.exit(results.every(r=>r.ok)?0:1);
