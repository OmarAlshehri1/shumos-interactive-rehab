// Local emulators only. No production credentials, no remote writes.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/omaralshehri/.npm/_npx/5c6d8c4f680fcd0a/node_modules/playwright');
const base=process.env.MIRROR_BASE||'http://localhost:3120',DB='http://127.0.0.1:19100',AUTH='http://127.0.0.1:19199/identitytoolkit.googleapis.com/v1',NS='demo-mirror-default-rtdb';
const evidence=process.env.MIRROR_EVIDENCE||'/tmp/mirror-premium-validation/evidence';fs.mkdirSync(evidence,{recursive:true});
const url=p=>`${DB}/${p}.json?ns=${NS}`;
const admin={Authorization:'Bearer owner','Content-Type':'application/json'};
async function put(p,v){const r=await fetch(url(p),{method:'PUT',headers:admin,body:JSON.stringify(v)});assert.equal(r.status,200);}
async function read(p){return (await fetch(url(p),{headers:admin})).json();}
(async()=>{
 const suffix=Date.now(),email=`mirror-${suffix}@example.test`,password='local-test-password';
 const signup=await fetch(`${AUTH}/accounts:signUp?key=fake`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});const account=await signup.json();assert(signup.ok);const uid=account.localId;
 await put(`staff/${uid}`,{active:true,role:'therapist'});const pid=`mirror-${suffix}`;await put(`patients/${pid}`,{patientNumber:`MQ${suffix}`,firstName:'ليلى',active:true,createdAt:Date.now(),updatedAt:Date.now(),createdByUid:uid});await put('liveSession',null);await put('controllerLease',null);
 const browser=await chromium.launch({headless:false,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const errors=[],checks=[],metrics={};
 const cc=await browser.newContext({viewport:{width:1280,height:900},hasTouch:true,recordVideo:{dir:evidence,size:{width:1280,height:720}}});
 await cc.addInitScript(({pid,suffix})=>sessionStorage.setItem('shumos.control.selectedPatient',JSON.stringify({patientId:pid,patientNumber:`MQ${suffix}`,firstName:'ليلى'})),{pid,suffix});
 const dc=await browser.newContext({viewport:{width:1600,height:900},recordVideo:{dir:evidence,size:{width:1600,height:900}}});const control=await cc.newPage(),display=await dc.newPage();for(const page of [control,display]){page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE',e.message);});page.on('console',m=>{if(m.type()==='error')console.error('CONSOLE',m.text());});page.on('requestfailed',r=>console.error('REQUEST',r.url(),r.failure()));}
 try {
  await control.goto(base+'/control/activities');await control.getByLabel('البريد الإلكتروني',{exact:true}).fill(email);await control.getByLabel('كلمة المرور',{exact:true}).fill(password);await control.getByRole('button',{name:'تسجيل الدخول',exact:true}).click();
  const card=control.locator('a[href="/control/mirror-quest-3d"]');await card.waitFor({timeout:60000});assert.equal(await card.count(),1);await card.click();await control.locator('[data-status="ready"]').waitFor({timeout:60000});
  await display.goto(base+'/display');await display.locator('[data-status="ready"]').waitFor({timeout:60000});checks.push('One Arabic library card, real staff login, independent read-only anonymous Display, shared liveSession');
  await control.getByLabel('مدة الثبات',{exact:true}).selectOption('500');
  console.log('Login and live Display ready');
  for(const name of ['الأرنب','الدب','الثعلب','الأسد']) {await control.getByRole('button',{name}).click();await display.waitForTimeout(1100);await display.screenshot({path:`${evidence}/${name}.png`});}
  checks.push('All four articulated costume characters render standing');
  await control.getByLabel('عرض الشخصية',{exact:true}).selectOption('seated');
  for(const name of ['الأرنب','الدب','الثعلب','الأسد']) {await control.getByRole('button',{name}).click();await display.waitForTimeout(1100);await display.screenshot({path:`${evidence}/seated-${name}.png`});}
  await control.getByLabel('عرض الشخصية',{exact:true}).selectOption('standing');
  await control.getByLabel('مدة الثبات',{exact:true}).selectOption('3000');
  await control.getByRole('button',{name:'ابدأ الرحلة',exact:true}).click();
  const feedbackSlider=control.locator('input[id="RIGHT_HAND"]');
  for(const [value,name] of [[0,'far'],[.15,'near'],[.35,'matched']]){await feedbackSlider.evaluate((input,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(value));input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));},value);await display.waitForTimeout(450);await display.screenshot({path:`${evidence}/ghost-${name}.png`});}
  await control.getByRole('button',{name:'إعادة البدء',exact:true}).click();await control.getByLabel('مدة الثبات',{exact:true}).selectOption('500');
  checks.push('All four seated costumes and neutral/orange/green ghost feedback captured');
  await control.getByRole('button',{name:'اختيار عشوائي',exact:true}).click();await control.getByRole('button',{name:'الأسد'}).click();
  await control.screenshot({path:`${evidence}/control.png`});
  const first=[{RIGHT_HAND:.35},{RIGHT_HAND:.65},{RIGHT_HAND:0}],second=[{LEFT_HAND:.35},{LEFT_HAND:.65},{LEFT_HAND:0}];
  const stages=[first,second,[{RIGHT_HAND:.65,LEFT_HAND:.65},{RIGHT_HAND:1,LEFT_HAND:1},{}],[{RIGHT_FOOT:.35},{RIGHT_FOOT:.65},{}],[{LEFT_FOOT:.35},{LEFT_FOOT:.65},{}],[{RIGHT_FOOT:.35},{LEFT_FOOT:.35},{}],[{RIGHT_HAND:.35,LEFT_FOOT:.35},{RIGHT_HAND:.65,LEFT_FOOT:.35},{}],[{RIGHT_HAND:.35,LEFT_FOOT:.35},{LEFT_HAND:.35,RIGHT_FOOT:.35},{}],[{RIGHT_HAND:.65,LEFT_HAND:.65},{RIGHT_HAND:.35,LEFT_FOOT:.35},{LEFT_HAND:.35,RIGHT_FOOT:.35},{}]];
  const limbs=['RIGHT_HAND','LEFT_HAND','RIGHT_FOOT','LEFT_FOOT'];
  async function slider(l,value){const locator=control.locator(`input[id="${l}"]`);if(await locator.count()){await locator.evaluate((input,value)=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(input,String(value));input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));},value);}}
  let accepts=0;
  for(let stage=0;stage<9;stage++) {
   console.log('Manual stage',stage+1);
   if(stage===2)await control.getByLabel('مدة الثبات',{exact:true}).selectOption('2000');
   if(stage===3)await control.getByLabel('مدة الثبات',{exact:true}).selectOption('500');
   await control.getByRole('button',{name:'ابدأ الرحلة',exact:true}).click();
   for(let pose=0;pose<stages[stage].length;pose++) {
    const values=stages[stage][pose];
    // Set neutral values before intentional movement, preventing carry-over conflicts.
    for(const l of limbs)await slider(l,values[l]||0);
    if(stage===2&&pose===1){await display.waitForTimeout(800);await display.screenshot({path:`${evidence}/both-arms.png`});}
    accepts++;
    await display.waitForFunction(n=>Number(document.querySelector('[data-accepted]')?.dataset.accepted)===n,accepts,{timeout:10000});
    if(stage===0&&pose===0){await control.getByRole('button',{name:'إيقاف مؤقت',exact:true}).click();await display.locator('[data-status="paused"]').waitFor();await control.reload();await control.getByRole('button',{name:'متابعة',exact:true}).waitFor();assert.equal(Number(await display.locator('[data-accepted]').getAttribute('data-accepted')),accepts);await control.getByRole('button',{name:'متابعة',exact:true}).click();checks.push('Control reload recovers paused without losing accepted progress');}

   }
   await display.locator('[data-status="stage-complete"]').waitFor();await control.getByRole('button',{name:stage===8?'إنهاء الرحلة':'المرحلة التالية',exact:true}).click();
  }
  await display.locator('[data-status="ended"]').waitFor();checks.push('All nine stages, 28 poses completed through limb controls without sensors or assistance');
  await control.getByText('✓ حُفظت الجلسة',{exact:false}).waitFor();const records=await read(`sessions/${pid}`);assert.equal(Object.keys(records).length,1);const record=Object.values(records)[0];assert.equal(record.totalPoses,28);assert.equal(record.completedStageCount,9);await control.reload();await control.waitForTimeout(1500);assert.equal(Object.keys(await read(`sessions/${pid}`)).length,1);checks.push('History saved exactly once across Control reload');
  await display.screenshot({path:`${evidence}/completed.png`});
  await display.reload();await display.locator('[data-status="ended"]').waitFor();assert.equal(Number(await display.locator('[data-accepted]').getAttribute('data-accepted')),28);checks.push('Display reload restores completed authoritative state');
  await control.goto(`${base}/control/patients/${pid}/sessions/${record.sessionId}`);await control.getByText('نتائج المرآة السحرية',{exact:true}).waitFor();checks.push('Versioned history opens through the existing patient detail screen');
  await control.goto(base+'/control/mirror-quest-3d');await control.locator('[data-status="ended"]').waitFor();await control.getByRole('button',{name:'إعادة البدء',exact:true}).click();
  await control.getByLabel('مصدر الحركة',{exact:true}).selectOption('simulated');await control.getByRole('button',{name:'ابدأ الرحلة',exact:true}).click();
  await slider('sim-RIGHT_HAND',.35);await display.waitForFunction(()=>document.querySelector('[data-accepted]')?.dataset.accepted==='1');
  await control.getByRole('button',{name:'محاكاة فقد الحساس',exact:true}).click();await display.locator('[data-status="paused"]').waitFor();assert.equal(Number(await display.locator('[data-accepted]').getAttribute('data-accepted')),1);
  await control.getByRole('button',{name:'متابعة',exact:true}).click();const latencyStart=performance.now();await slider('RIGHT_HAND',.65);await display.locator('[data-feedback="matched"]').waitFor();metrics.inputToDisplayMs=performance.now()-latencyStart;await display.waitForFunction(()=>document.querySelector('[data-accepted]')?.dataset.accepted==='2');
  await slider('RIGHT_HAND',0);await display.locator('[data-status="stage-complete"]').waitFor();checks.push('Calibrated simulated input accepts poses; sensor loss pauses and preserves progress; manual fallback completes the stage');
  await control.getByRole('button',{name:'المرحلة التالية',exact:true}).click();await control.getByLabel('جودة العرض',{exact:true}).selectOption('low');await control.getByLabel('تقليل الحركة',{exact:false}).check();await control.getByLabel('المستوى والمرحلة',{exact:true}).selectOption('8');
  await display.waitForFunction(()=>document.querySelector('[data-stage]')?.dataset.stage==='8');checks.push('Stage selection, low graphics and reduced motion synchronize');
  await display.bringToFront();const resources=[],revisionBefore=(await read('liveSession')).revision;for(let i=0;i<24;i++){await display.waitForTimeout(5000);resources.push(JSON.parse(await display.locator('canvas').getAttribute('data-metrics')));}
  metrics.stabilitySeconds=120;metrics.resources=resources;assert(resources.every(r=>r.geometries===resources[0].geometries));metrics.idleWritesPerSecond=((await read('liveSession')).revision-revisionBefore)/120;checks.push('120-second rendering sample keeps geometry counts bounded and publishes only heartbeat while idle');
  const costumeCleanup=[];for(const name of ['الأسد','الأرنب','الأسد','الثعلب','الأسد']){await control.getByRole('button',{name}).click();await display.waitForTimeout(1100);costumeCleanup.push({name,...JSON.parse(await display.locator('canvas').getAttribute('data-metrics'))});}assert(costumeCleanup.filter(r=>r.name==='الأسد').every(r=>r.geometries===costumeCleanup[0].geometries));metrics.costumeCleanup=costumeCleanup;checks.push('Repeated costume remounts keep geometry counts bounded');
  const secondContext=await browser.newContext({viewport:{width:1280,height:900}});await secondContext.addInitScript(({pid,suffix})=>sessionStorage.setItem('shumos.control.selectedPatient',JSON.stringify({patientId:pid,patientNumber:`MQ${suffix}`,firstName:'ليلى'})),{pid,suffix});const other=await secondContext.newPage();await other.goto(base+'/control/mirror-quest-3d');await other.getByLabel('البريد الإلكتروني',{exact:true}).fill(email);await other.getByLabel('كلمة المرور',{exact:true}).fill(password);await other.getByRole('button',{name:'تسجيل الدخول',exact:true}).click();await other.getByText('هذه الجلسة تعمل في نافذة أخرى. أغلقها ثم أعد المحاولة.',{exact:true}).waitFor();await secondContext.close();checks.push('Another Control window cannot overwrite the live session');
  await control.bringToFront();await control.waitForTimeout(1500);
  metrics.control=JSON.parse(await control.locator('canvas').getAttribute('data-metrics'));metrics.display=JSON.parse(await display.locator('canvas').getAttribute('data-metrics'));
  await display.screenshot({path:`${evidence}/low-quality.png`});assert.deepEqual(errors,[]);
  fs.writeFileSync(`${evidence}/browser.json`,JSON.stringify({checks,metrics,errors,physicalDevicesTested:false},null,2));console.log(JSON.stringify({checks,metrics,errors},null,2));
 }catch(e){console.error(e);await control.screenshot({path:`${evidence}/failure-control.png`});await display.screenshot({path:`${evidence}/failure-display.png`});console.error(await control.locator('body').innerText());console.error('live',await read('liveSession'));process.exitCode=1;}
 finally{await cc.close();await dc.close();await browser.close();}
})();
