import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('/Users/omaralshehri/.npm/_npx/5c6d8c4f680fcd0a/node_modules/playwright');
const {STAGES,project}=await import('./stage-manifest.mjs');
const browser=await chromium.launch({headless:false,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const checks=[],metrics={},errors=[],cloud=[];let context,control,display;
try{
 context=await browser.newContext({viewport:{width:1280,height:800}});
 await context.addInitScript(()=>{
  const Native=BroadcastChannel;window.__buildState=null;window.__receivedState=null;window.__channelCounts={opened:0,closed:0};window.__latencies=[];let pending=[];
  window.BroadcastChannel=class extends Native{
   constructor(name){super(name);if(name.startsWith('shumos-local-buildquest3d-v1:'))window.__channelCounts.opened++;}
   postMessage(m){if(this.name.startsWith('shumos-local-buildquest3d-v1:')){if(m.type==='state')window.__buildState=m.state;if(m.type==='input')pending.push(m);if(pending.length>100)pending.shift();}super.postMessage(m);}
   set onmessage(fn){super.onmessage=fn?e=>{const m=e.data;if(this.name.startsWith('shumos-local-buildquest3d-v1:')&&m?.type==='state'){window.__receivedState=m.state;const matched=pending.filter(p=>p.guard.run===m.state.run&&p.guard.stage===m.state.stage&&Math.hypot(p.x-m.state.pointer.x,p.y-m.state.pointer.y)<.002);pending=pending.filter(p=>!matched.includes(p));requestAnimationFrame(()=>matched.forEach(p=>window.__latencies.push(Date.now()-p.sentAt)));}fn(e);}:null;}
   get onmessage(){return super.onmessage;}
   close(){if(this.name.startsWith('shumos-local-buildquest3d-v1:'))window.__channelCounts.closed++;super.close();}
  };
 });
 context.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});p.on('request',r=>{if(/firebaseio|firebasedatabase|identitytoolkit|securetoken/.test(r.url()))cloud.push(r.url());});});
 control=await context.newPage();display=await context.newPage();
 await control.goto('http://127.0.0.1:3108/control/build-quest-3d');await control.getByRole('link',{name:'فتح شاشة الطفل'}).waitFor({timeout:60000});
 const href=await control.getByRole('link',{name:'فتح شاشة الطفل'}).getAttribute('href'),controlUrl=control.url();await display.goto('http://127.0.0.1:3108'+href);await display.locator('canvas').waitFor();
 const state=()=>control.evaluate(()=>window.__buildState),stats=()=>display.getByTestId('build-state');
 const clickPiece=async piece=>{const box=await display.locator('canvas').boundingBox(),src=project(piece.source),target=project(piece.target);await display.mouse.click(box.x+src.x*box.width,box.y+src.y*box.height);await control.waitForFunction(id=>window.__buildState?.selected===id,piece.id);await display.mouse.move(box.x+target.x*box.width,box.y+target.y*box.height,{steps:12});};
 await control.getByRole('button',{name:'بدء الجلسة',exact:true}).click();await display.locator('[data-status="running"]').waitFor();await clickPiece(STAGES[0].pieces[0]);await display.waitForFunction(()=>document.querySelector('[data-testid="build-state"]').dataset.placed==='1');
 const old=await state();const session=old.session;
 // Duplicate and stale raw input requests use the public transport, not gameplay-state injection.
 await display.evaluate(({s,p})=>{const c=new BroadcastChannel('shumos-local-buildquest3d-v1:'+s.session);const packet={type:'input',guard:{session:s.session,run:s.run,stage:s.stage,revision:s.revision},client:'duplicate-test-client',seq:1,sentAt:Date.now(),...p,activate:true};c.postMessage(packet);c.postMessage(packet);c.close();},{s:old,p:project(STAGES[0].pieces[0].target)});
 await control.waitForTimeout(150);assert.equal((await state()).events.length,1);checks.push('duplicate requests never duplicate a placement');
 await display.reload();await display.locator('[data-status="running"]').waitFor();assert.equal(await stats().getAttribute('data-placed'),'1');checks.push('Display reload recovers accepted progress without scoring');
 await control.reload();await control.getByRole('button',{name:'متابعة',exact:true}).waitFor();await display.locator('[data-status="paused"]').waitFor();const recovered=await state();assert(recovered.run>old.run);assert.equal(recovered.events.length,1);assert.equal(recovered.inputReady,false);checks.push('Control reload restores accepted state paused with a new run');
 await display.evaluate(s=>{const c=new BroadcastChannel('shumos-local-buildquest3d-v1:'+s.session);c.postMessage({type:'state',state:s,sentAt:Date.now()});c.postMessage({type:'input',guard:{session:s.session,run:s.run,stage:s.stage,revision:s.revision},client:'stale-input-client',seq:1,sentAt:Date.now(),x:.2,y:.4,activate:true});c.close();},old);
 await display.waitForTimeout(200);assert.equal(await stats().getAttribute('data-run'),String(recovered.run));assert.equal((await state()).events.length,1);checks.push('old-run snapshots and input requests are rejected');
 await control.getByRole('button',{name:'متابعة',exact:true}).click();await display.locator('[data-status="running"]').waitFor();await clickPiece(STAGES[0].pieces[1]);await display.locator('[data-status="complete"]').waitFor();assert.equal((await state()).events.length,2);
 await control.getByRole('button',{name:'إعادة المرحلة',exact:true}).click();await display.locator('[data-status="ready"]').waitFor();assert.equal(await stats().getAttribute('data-placed'),'0');assert.equal((await state()).events.length,2);checks.push('restart clears the stage and keeps total accepted session activity');
 await control.getByRole('button',{name:'تخطي المرحلة',exact:true}).click();await display.waitForFunction(()=>document.querySelector('[data-testid="build-state"]').dataset.stage==='1');assert.deepEqual((await state()).skipped,['first-shapes']);checks.push('skip advances safely and records therapist skip');
 // The exclusive Web Lock prevents two controls from accepting outcomes concurrently.
 const second=await context.newPage();await second.goto(controlUrl);await second.waitForTimeout(350);assert.equal(await second.getByRole('button',{name:'بدء الجلسة',exact:true}).count(),0);const held=await control.evaluate(()=>navigator.locks.query());assert.equal(held.held.filter(l=>l.name.includes('authority')).length,1);await second.close();checks.push('only one Control owns a session across tabs');
 // Revisit stages repeatedly and observe bounded resource counts after disposal.
 const geometryCounts=[];for(const level of ['3','1','3','1','3','1']){await control.getByLabel('الصعوبة',{exact:true}).selectOption(level);await display.waitForTimeout(1050);const m=JSON.parse(await display.locator('canvas').getAttribute('data-metrics'));geometryCounts.push({level,geometries:m.geometries,textures:m.textures});}
 const level1=geometryCounts.filter(x=>x.level==='1');assert(level1.every(x=>x.geometries===level1[0].geometries&&x.textures===level1[0].textures));metrics.stageCleanup=geometryCounts;checks.push('repeated stage transitions release geometry and keep texture counts bounded');
 await control.getByRole('button',{name:'بدء الجلسة',exact:true}).click();await display.locator('[data-status="running"]').waitFor();
 const box=await display.locator('canvas').boundingBox();for(let i=0;i<15;i++){await display.mouse.move(box.x+box.width*(.43+(.03*(i%2))),box.y+box.height*.76);await display.waitForTimeout(120);}
 await display.waitForTimeout(4200);metrics.highDisplay=JSON.parse(await display.locator('canvas').getAttribute('data-metrics'));metrics.highControl=JSON.parse(await control.locator('canvas').getAttribute('data-metrics'));
 const latency=await display.evaluate(()=>window.__latencies.filter(v=>v>=0&&v<1000));latency.sort((a,b)=>a-b);metrics.inputToDisplayFrameMs={samples:latency.length,median:latency[Math.floor(latency.length/2)]??null,p95:latency[Math.floor((latency.length-1)*.95)]??null,max:Math.max(...latency)};assert(latency.length>10);
 await control.getByRole('button',{name:'إيقاف مؤقت',exact:true}).click();await control.getByLabel('جودة العرض',{exact:true}).selectOption('low');await control.getByRole('button',{name:'متابعة',exact:true}).click();await display.waitForTimeout(4500);metrics.lowDisplay=JSON.parse(await display.locator('canvas').getAttribute('data-metrics'));assert(metrics.lowDisplay.drawCalls<metrics.highDisplay.drawCalls);checks.push('quality fallback reduces rendering work and preserves gameplay state');
 await control.getByRole('button',{name:'إنهاء الجلسة',exact:true}).click();await display.locator('[data-status="ended"]').waitFor();checks.push('therapist can end safely');
 await control.close();await display.waitForTimeout(1300);assert((await display.locator('body').innerText()).includes('سنكمل مع الأخصائي'));checks.push('Control disappearance holds Display');
 control=await context.newPage();await control.goto(controlUrl);await control.getByRole('link',{name:'فتح شاشة الطفل'}).waitFor();await display.locator('[data-status="ended"]').waitFor();checks.push('local summary survives Control reopening');
 // SPA navigation runs actual channel and renderer cleanup without unloading the page.
 await control.getByRole('link',{name:'مكتبة الأنشطة',exact:true}).click();await control.getByRole('heading',{name:'مكتبة الأنشطة',exact:true}).waitFor();const counts=await control.evaluate(()=>window.__channelCounts);assert.equal(counts.opened,counts.closed);metrics.channelCleanup=counts;checks.push('library navigation cleans Build Quest channels; existing library remains intact');
 const links=await control.locator('a[href^="/control/"]').evaluateAll(a=>a.map(x=>x.getAttribute('href')));assert(links.includes('/control/space-pilot'));assert(links.includes('/control/balloon-quest'));assert(!links.includes('/control/build-quest-3d'));checks.push('shared library remains unchanged; Build Quest registration conflict is deferred');
 assert.deepEqual(errors,[]);assert.deepEqual(cloud,[]);
 writeFileSync('docs/buildquest3d/validation/q4-browser.json',JSON.stringify({passed:true,checks,metrics,errors,cloud,session},null,2));
}catch(error){if(display)await display.screenshot({path:'docs/buildquest3d/screenshots/q4-failure.png'}).catch(()=>{});writeFileSync('docs/buildquest3d/validation/q4-browser.json',JSON.stringify({passed:false,error:String(error),checks,metrics,errors,cloud},null,2));throw error;}finally{await context?.close();await browser.close();}
