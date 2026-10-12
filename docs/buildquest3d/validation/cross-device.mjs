import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { STAGES, project } from './stage-manifest.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE ?? '/Users/omaralshehri/.npm/_npx/5c6d8c4f680fcd0a/node_modules/playwright');
const base=process.env.BUILDQUEST_TEST_ORIGIN ?? 'http://127.0.0.1:3100';
assert.equal(new URL(base).hostname,'127.0.0.1');
const DB=process.env.DB_ORIGIN??'http://127.0.0.1:9000',AUTH=(process.env.AUTH_ORIGIN??'http://127.0.0.1:9099')+'/identitytoolkit.googleapis.com/v1',ns=process.env.DB_NS??'demo-bq3-default-rtdb';
const dburl=p=>`${DB}/${p}.json?ns=${ns}`;
const admin={Authorization:'Bearer owner','Content-Type':'application/json'};
const put=async(p,v)=>{const r=await fetch(dburl(p),{method:'PUT',headers:admin,body:JSON.stringify(v)});assert.equal(r.status,200);};
const read=async p=>{const r=await fetch(dburl(p),{headers:admin});assert.equal(r.status,200);return r.json();};
const suffix=Date.now(),email=`build-touch-${suffix}@example.test`,password='emulator-only-password123';
const signup=async email=>{
 const r=await fetch(`${AUTH}/accounts:signUp?key=fake`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});
 const j=await r.json();assert.equal(r.status,200);return j.localId;
};
const uid=await signup(email),inactiveEmail=`build-inactive-${suffix}@example.test`,inactiveUid=await signup(inactiveEmail);
await put(`staff/${uid}`,{active:true,role:'therapist'});await put(`staff/${inactiveUid}`,{active:false,role:'therapist'});
const patientId=`build-browser-${suffix}`;
await put(`patients/${patientId}`,{patientNumber:`BQT${suffix}`,firstName:'اختبار',active:true,createdAt:Date.now(),updatedAt:Date.now(),createdByUid:uid});
await put('liveSession',null);
const browser=await chromium.launch({headless:false,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const contexts=[],checks=[],errors=[],externalFirebase=[],stages=[],metrics={latencyMs:150,separateBrowserContexts:true,realHardwareTested:false};
let control,display,session;
const context=async opts=>{
 const c=await browser.newContext(opts);contexts.push(c);
 await c.addInitScript(()=>{window.__buildLocalChannels=0;const Native=BroadcastChannel;window.BroadcastChannel=class extends Native{constructor(name){super(name);if(name.startsWith('shumos-local-buildquest3d-v1:'))window.__buildLocalChannels++;}};});
 c.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{const u=new URL(r.url());if(!['127.0.0.1','localhost'].includes(u.hostname)&&/firebaseio|firebasedatabase|identitytoolkit|securetoken/.test(r.url()))externalFirebase.push(r.url());});});
 return c;
};
const delay=async p=>{const cdp=await p.context().newCDPSession(p);await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:1500000,uploadThroughput:300000});return cdp;};
const login=async(p,account=email)=>{await p.getByRole('button',{name:'تسجيل الدخول',exact:true}).waitFor({timeout:60000});await p.getByLabel('البريد الإلكتروني',{exact:true}).fill(account);await p.getByLabel('كلمة المرور',{exact:true}).fill(password);await p.getByRole('button',{name:'تسجيل الدخول',exact:true}).tap();};
const status=async(p,want)=>p.locator(`[data-testid="build-state"][data-status="${want}"]`).waitFor({timeout:30000});
const placed=async(p,n)=>p.waitForFunction(n=>Number(document.querySelector('[data-testid="build-state"]')?.dataset.placed)===n,n,{timeout:30000});
const tap=async name=>control.getByRole('button',{name,exact:true}).tap();
const piece=async(p,n)=>{await control.locator(`[data-piece="${p.id}"]`).tap();await control.locator(`[data-target="${p.id}"]`).tap();await placed(display,n);};
try{
 const cc=await context({viewport:{width:1024,height:768},hasTouch:true,isMobile:true,deviceScaleFactor:2});
 await cc.addInitScript(({patientId,suffix})=>sessionStorage.setItem('shumos.control.selectedPatient',JSON.stringify({patientId,patientNumber:`BQT${suffix}`,firstName:'اختبار'})),{patientId,suffix});
 control=await cc.newPage();await control.goto(base+'/control/activities');await login(control);
 const card=control.locator('a[href="/control/build-quest-3d"]');await card.waitFor({timeout:60000});assert.equal(await card.count(),1);assert.match(await card.innerText(),/العتاد بانتظار التحقق/);await card.tap();
 await control.getByRole('link',{name:'فتح شاشة الطفل',exact:true}).waitFor({timeout:60000});
 await control.locator('[data-testid="build-state"]').first().waitFor({timeout:60000});session=await read('liveSession/sessionId');assert(session);assert.equal(await read('liveSession/gameId'),'build-quest-3d');
 const dc=await context({viewport:{width:1440,height:900}});display=await dc.newPage();await display.goto(base+'/display');await status(display,'ready');
 const cdp=await delay(control);await delay(display);
 checks.push('Real staff login, Arabic library card, touch Control and normal /display in an independent anonymous browser context');
 const denied=await context({viewport:{width:1024,height:768},hasTouch:true});const deniedPage=await denied.newPage();await deniedPage.goto(base+'/control/build-quest-3d');await login(deniedPage,inactiveEmail);await deniedPage.getByText('هذا الحساب غير مُفعّل',{exact:true}).waitFor();assert.equal(await deniedPage.locator('[data-testid="build-state"]').count(),0);await denied.close();
 const duplicate=await context({viewport:{width:1024,height:768},hasTouch:true});const duplicatePage=await duplicate.newPage();await duplicatePage.goto(base+'/control/build-quest-3d');await login(duplicatePage);await duplicatePage.locator('[data-testid="bq-recovery-blocked"]').waitFor({timeout:60000});assert.equal(await duplicatePage.getByRole('button',{name:'بدء الجلسة',exact:true}).count(),0);await duplicate.close();
 checks.push('Inactive staff denied by unchanged gate; a second window of the same account is blocked from silently taking over a live session');
 for(const [index,stage] of STAGES.entries()){
  await tap('بدء الجلسة');await status(display,'running');
  for(const [i,p] of stage.pieces.entries()){
   await piece(p,i+1);
   if(index===0&&i===0){
    await display.reload();await status(display,'running');await placed(display,1);
    await control.reload();await control.getByRole('button',{name:'متابعة',exact:true}).waitFor({timeout:30000});await status(display,'paused');await placed(display,1);await tap('متابعة');await status(display,'running');
    checks.push('Display reload recovers accepted placement; Control reload recovers paused without losing progress');
   }
  }
  await status(display,'complete');stages.push({id:stage.id,pieces:stage.pieces.length,input:'therapist touch buttons',passed:true});
  await tap(index===8?'عرض الملخص':'المرحلة التالية');await status(display,index===8?'ended':'ready');
 }
 await control.locator('[data-testid="history-status"][data-status="saved"]').waitFor({timeout:30000});
 const result=await read(`sessions/${patientId}/${session}`);assert.equal(result.gameId,'build-quest-3d');assert.equal(result.resultVersion,1);assert.equal(result.completedStageCount,9);assert.equal(result.totalPiecesPlaced,STAGES.reduce((sum,s)=>sum+s.pieces.length,0));
 {const payload=JSON.parse(await read('liveSession/session/build3/payload'));assert.equal(new Set(payload.events.map(e=>e.id)).size,result.totalPiecesPlaced);}
 checks.push('All nine stages completed using touch-only manual Control, with exactly-once versioned patient history');
 await control.goto(`${base}/control/patients/${patientId}/sessions/${session}`);await control.getByText('نتائج عالم البناء',{exact:true}).waitFor({timeout:60000});
 assert(await control.getByText('القطع الموضوعة',{exact:true}).count()>0);checks.push('Saved Build Quest history opens through the normal patient session-detail route');
 await control.goto(base+'/control/build-quest-3d');await control.getByRole('link',{name:'فتح شاشة الطفل',exact:true}).waitFor();await control.waitForFunction(()=>document.querySelector('[data-testid="build-state"]'));await control.waitForTimeout(1500);session=await read('liveSession/sessionId');
 await control.getByLabel('طريقة التحكم',{exact:true}).selectOption('sensor');await control.getByLabel('مدة الثبات (مللي ثانية)').fill('250');
 await tap('بدء الجلسة');await status(display,'running');
 await cc.route('**/__buildquest-pointer-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Test normalized sensor publisher</title>'}));
 const publisher=await cc.newPage();await publisher.goto(base+'/__buildquest-pointer-test');
 await publisher.evaluate(()=>{const c=new BroadcastChannel('shumos-sensor-pointer');let seq=10000;window.__pointer=window.__target={x:.5,y:.5};window.__stream=true;window.__timer=setInterval(()=>{const p=window.__pointer,t=window.__target,dx=t.x-p.x,dy=t.y-p.y,f=Math.min(1,.025/(Math.hypot(dx,dy)||1));window.__pointer={x:p.x+dx*f,y:p.y+dy*f};if(window.__stream)c.postMessage({role:'RIGHT_HAND',...window.__pointer,visible:true,seq:++seq,sentAtMs:Date.now()});},20);window.__sensor=c;window.__disconnect=()=>{window.__stream=false;c.postMessage({role:'RIGHT_HAND',x:0,y:0,visible:false,seq:++seq,sentAtMs:Date.now()});};});
 await control.locator('[data-testid="sensor-status"][data-status="tracking"]').waitFor({timeout:10000});
 await publisher.evaluate(p=>window.__target=p,project(STAGES[0].pieces[0].source));
 await control.locator(`[data-piece="${STAGES[0].pieces[0].id}"][aria-pressed="true"]`).waitFor({timeout:10000});
 await publisher.evaluate(p=>window.__target=p,project(STAGES[0].pieces[0].target));await placed(display,1);
 await piece(STAGES[0].pieces[1],2);await status(display,'complete');checks.push('Normalized RIGHT_HAND simulation places through Firebase; therapist manual override remains available while sensor streams');
 await tap('المرحلة التالية');await status(display,'ready');await tap('بدء الجلسة');await publisher.evaluate(()=>window.__disconnect());await control.waitForTimeout(400);
 for(const [i,p] of STAGES[1].pieces.entries())await piece(p,i+1);
 await status(display,'complete');checks.push('Sensor disconnection preserves progress and all pieces remain manually playable in sensor mode');
 await tap('إعادة المرحلة');await status(display,'ready');await control.getByLabel('طريقة التحكم',{exact:true}).selectOption('controller');await tap('بدء الجلسة');await piece(STAGES[1].pieces[0],1);checks.push('Prepared handheld mode retains manual selection and placement');
 await tap('إيقاف مؤقت');await status(display,'paused');await tap('متابعة');await status(display,'running');await tap('إعادة المرحلة');await status(display,'ready');await placed(display,0);
 await tap('بدء الجلسة');await status(display,'running');const beforeOffline=await read('liveSession/revision');
 await cc.setOffline(true);await control.getByText('الاتصال متوقف؛ التحكم معلّق بأمان',{exact:true}).waitFor({timeout:15000});assert.equal(await control.locator(`[data-piece="${STAGES[1].pieces[0].id}"]`).isDisabled(),true);
 await cc.setOffline(false);await status(display,'paused');await control.getByRole('button',{name:'متابعة',exact:true}).waitFor({timeout:30000});await tap('متابعة');await status(display,'running');
 const afterOffline=await read('liveSession/revision');assert(afterOffline>beforeOffline);checks.push('Network loss disables edits; reconnect re-publishes the paused authoritative state with a higher revision');
 await tap('تخطي المرحلة');await status(display,'ready');await tap('إنهاء الجلسة');await status(display,'ended');await control.locator('[data-testid="history-status"][data-status="saved"]').waitFor();checks.push('Pause/resume/restart, skip and end synchronize after latency and disconnection');
 const room={payload:await read('liveSession/session/build3/payload')};assert(room.payload.length<32768);assert(!/"(pointer|hover|dwell|inputReady)"/.test(room.payload));metrics.finalPayloadBytes=Buffer.byteLength(room.payload);
 assert.equal(await control.evaluate(()=>window.__buildLocalChannels),0);assert.equal(await display.evaluate(()=>window.__buildLocalChannels),0);checks.push('Cross-device test uses no Build Quest BroadcastChannel and sends no raw pointer/scene state');
 const childHref=await control.getByRole('link',{name:'فتح شاشة الطفل',exact:true}).getAttribute('href');assert.equal(childHref,'/display');await display.goto(base+childHref);await status(display,'ended');checks.push('The child-screen link is the normal platform Display and recovers the live session after a Display reload');
 await control.getByRole('link',{name:'مكتبة الأنشطة',exact:true}).tap();await control.locator('a[href="/control/balloon-quest"]').waitFor();
 await cdp.detach();
 assert.deepEqual(errors,[]);assert.deepEqual(externalFirebase,[]);
 writeFileSync('docs/buildquest3d/validation/cross-device.json',JSON.stringify({passed:true,checks,stages,metrics,errors,externalFirebase},null,2));console.log('PASS',checks);
}catch(e){writeFileSync('docs/buildquest3d/validation/cross-device.json',JSON.stringify({passed:false,error:String(e),checks,stages,metrics,errors,externalFirebase},null,2));throw e;}
finally{await Promise.all(contexts.map(c=>c.close().catch(()=>{})));await browser.close();}
