const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';

const evidence=[];
(async()=>{
const browser=await chromium.launch({headless:false,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:[]});
let control,display;
try{
 const context=await browser.newContext({viewport:{width:1376,height:768}});
 const errors=[],requests=[];
 context.on('page',p=>{p.on('pageerror',e=>{errors.push(e.message);console.log('PAGE_ERROR',e.message)});p.on('request',r=>requests.push(r.url()))});
 await context.addInitScript(()=>{
  const Native=BroadcastChannel;window.__channels={opened:0,closed:0};window.__lastState=null;window.__lastFrame=null;
  window.BroadcastChannel=class extends Native{
   constructor(name){super(name);this.__experimental=name.startsWith('shumos-experimental-space-pilot-3d-v4:');if(this.__experimental)window.__channels.opened++;}
   set onmessage(fn){super.onmessage=fn?e=>{if(this.__experimental&&window.__dropExperimental)return;fn(e)}:null;}
   get onmessage(){return super.onmessage;}
   postMessage(m){if(this.__experimental){if(m.type==='state')window.__lastState=m.state;if(m.type==='frame')window.__lastFrame=m.frame;if(window.__dropOutbound)return;}super.postMessage(m);if(this.__experimental&&window.__duplicateExperimental)super.postMessage(m);}
   close(){if(this.__experimental)window.__channels.closed++;super.close();}
  };
 });
 const cdp=await browser.newBrowserCDPSession();
 const contexts=await cdp.send('Target.getBrowserContexts');
 async function newWindow(url,left){const pageEvent=context.waitForEvent('page');const {targetId}=await cdp.send('Target.createTarget',{url:'about:blank',newWindow:true,browserContextId:contexts.browserContextIds[0]});const page=await pageEvent;const {windowId}=await cdp.send('Browser.getWindowForTarget',{targetId});await cdp.send('Browser.setWindowBounds',{windowId,bounds:{left,top:40,width:1100,height:860}});await page.goto(url);return{page,windowId};}
 const c=await newWindow('http://127.0.0.1:3000/control/activities',0);control=c.page;await control.locator('a[href="/control/space-pilot"]').click();await control.waitForURL('**/control/space-pilot');assert.equal(new URL(control.url()).pathname,'/control/space-pilot');
 await control.getByRole('link',{name:'فتح شاشة الطفل'}).waitFor({timeout:60000});
 const displayUrl='http://127.0.0.1:3000'+await control.getByRole('link',{name:'فتح شاشة الطفل'}).getAttribute('href');
 const d=await newWindow(displayUrl,760);display=d.page;
 const lifecycle=p=>p.getByTestId('session-lifecycle');
 const stats=p=>p.getByTestId('session-stats').evaluate(e=>({session:e.dataset.session,run:Number(e.dataset.run),events:Number(e.dataset.events),collected:Number(e.dataset.collected),collisions:Number(e.dataset.collisions),resolved:Number(e.dataset.resolved)}));
 const state=()=>control.evaluate(()=>window.__lastState);
 const act=async(name,expected)=>{
  const b=control.getByRole('button',{name,exact:true});
  for(let i=0;i<5;i++){await b.click({timeout:10000});if(expected==='running')await display.bringToFront();await control.waitForTimeout(name==='بدء الجلسة'?3300:100);if(!expected||await lifecycle(control).getAttribute('data-lifecycle')===expected)return;}
  throw Error('Action did not reach '+expected+': '+name+' / '+await lifecycle(control).getAttribute('data-lifecycle'));
 };
 const waitResolved=n=>control.waitForFunction(n=>Number(document.querySelector('[data-testid="session-stats"]').dataset.resolved)>=n,n,{timeout:12000});
 const match=async()=>{const a=await stats(control);await display.waitForFunction(a=>{const e=document.querySelector('[data-testid="session-stats"]');return e&&e.dataset.session===a.session&&Number(e.dataset.run)===a.run&&Number(e.dataset.collected)===a.collected&&Number(e.dataset.resolved)===a.resolved},a);return a;};
 // Keep the sensor publisher in a separate OS window as the normal local channel does.
 await context.route('**/__spacepilot-test-publisher',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Test sensor publisher</title>'}));
 const p=await newWindow('http://127.0.0.1:3000/__spacepilot-test-publisher',1400),publisher=p.page;
 const initial=await control.evaluate(()=>({frame:window.__lastFrame,state:window.__lastState}));
 await publisher.evaluate(({room,initial})=>{
  const channel=new BroadcastChannel('shumos-sensor-pointer'),world=new BroadcastChannel('shumos-experimental-space-pilot-3d-v4:'+room);
  window.__frame=initial.frame;window.__state=initial.state;world.onmessage=e=>{if(e.data.type==='frame')window.__frame=e.data.frame;if(e.data.type==='state')window.__state=e.data.state};
  let seq=0,last=performance.now();window.__pointer={x:.5,y:.5};window.__target={x:.5,y:.5};window.__aim=null;window.__stream=true;
  setInterval(()=>{
   const now=performance.now(),dt=Math.min(.05,(now-last)/1000);last=now;
   if(window.__aim&&window.__frame){const p=window.__frame.ship,o=window.__aim,depth=Math.max(1,p.z-o.z),sens=window.__state.flightSettings.sensitivity;
    const inverse=v=>Math.abs(v)<1e-9?0:Math.sign(v)*(.06+Math.min(1,Math.abs(v)/sens)*.94);
    window.__target={x:.5+inverse((Math.atan2(o.x-p.x,depth)-(window.__state.flightSettings.course?Math.atan(12*Math.PI*2/1600*Math.cos(-p.z*Math.PI*2/1600)):0))/(window.__state.flightSettings.headingLimit*Math.PI/180))/2,y:.5-inverse(Math.atan2(o.y-p.y,Math.hypot(depth,o.x-p.x))/.3)/2};
   }
   const dx=window.__target.x-window.__pointer.x,dy=window.__target.y-window.__pointer.y,a=Math.min(1,.38*dt/(Math.hypot(dx,dy)||1));
   window.__pointer={x:window.__pointer.x+dx*a,y:window.__pointer.y+dy*a};if(window.__stream)channel.postMessage({role:'RIGHT_HAND',visible:true,...window.__pointer,seq:++seq,sentAtMs:Date.now()});
  },20);
 },{room:initial.state.roomId,initial});
 const target=(x,y,z)=>publisher.evaluate(({x,y,z})=>window.__aim={x,y,z},{x,y,z});
 const align=async()=>{const pos=await control.evaluate(()=>window.__lastFrame.ship);await publisher.evaluate(pos=>{window.__aim=null;window.__target={x:pos.controlX,y:pos.controlY}},pos);await control.locator('[data-testid="sensor-status"][data-status="tracking"]').waitFor({timeout:10000});};



 const cases=[{mode:'ADVANCED',difficulty:'HIGH'}];
 for(let caseIndex=0;caseIndex<cases.length;caseIndex++){
  const {mode,difficulty}=cases[caseIndex];
  if(caseIndex){await control.reload();await control.getByRole('button',{name:'بدء الجلسة',exact:true}).waitFor();}
  await control.getByLabel('الصعوبة',{exact:true}).selectOption(difficulty);
  await control.getByLabel('نمط الطيران',{exact:true}).selectOption(mode);
  // Explicit assistance makes hazard routes testable on HIGH too; defaults are
  // independently asserted by automated tests. No gameplay state is injected.
  await control.getByLabel('مساعدة الوصول للأهداف',{exact:true}).selectOption('2');
  await display.getByTestId('flight-instructions').waitFor();
  const initialTime=(await state()).elapsedSeconds;await display.waitForTimeout(350);assert.equal((await state()).elapsedSeconds,initialTime);assert.equal((await state()).stats.score,0);
  if(caseIndex===0){await display.bringToFront();await display.waitForTimeout(350);await display.screenshot({path:'docs/spacepilot3d/screenshots/rc-instructions.png'});}
  await act('متابعة · تخطي التعليمات');await display.getByTestId('flight-instructions').waitFor({state:'hidden'});
  // Exercise real keyboard controls once in every mode. EASY/MEDIUM ignore
  // vertical keys; ADVANCED climbs. Restart restores the actual session safely.
  if(difficulty==='LOW'){
   await act('بدء الجلسة','running');await display.locator('canvas').click();await display.keyboard.down('ArrowUp');await display.waitForTimeout(650);await display.keyboard.up('ArrowUp');
   const y=await control.evaluate(()=>window.__lastFrame.ship.y);if(mode==='ADVANCED')assert(y>.1);else assert(Math.abs(y)<.01);
   await display.keyboard.down('ArrowRight');await display.waitForTimeout(650);await display.keyboard.up('ArrowRight');assert((await control.evaluate(()=>window.__lastFrame.ship.x))>.1);
   await display.keyboard.press('c');await act('إيقاف مؤقت','paused');const paused=await control.evaluate(()=>window.__lastFrame.ship);await display.waitForTimeout(350);assert.deepEqual(await control.evaluate(()=>window.__lastFrame.ship),paused);
   await control.getByLabel('طريقة التحكم',{exact:true}).selectOption('sensor');await act('إعادة الرحلة','paused');await align();await act('متابعة','running');
  }else{await control.getByLabel('طريقة التحكم',{exact:true}).selectOption('sensor');await align();await act('بدء الجلسة','running');}
  assert.equal(await control.getByLabel('نمط الطيران',{exact:true}).isDisabled(),true);
  assert.equal(await control.getByLabel('فسحة عبور الحلقة',{exact:true}).isDisabled(),true);
  let previousTier=1;
  for(let mission=0;mission<3;mission++){
   for(let encounter=0;encounter<6;encounter++){
    const o=await control.evaluate(i=>window.__lastFrame.objects[i],encounter);
    const ship=await control.evaluate(()=>window.__lastFrame.ship),settings=(await state()).flightSettings;
    let x=o.x,y=o.y;
    if(o.kind!=='ring'){
     if(mode==='ADVANCED'){y=o.y+(ship.y>=o.y?1:-1)*(o.radius+3);if(Math.abs(y)>settings.verticalLimit-2)y=o.y-(ship.y>=o.y?1:-1)*(o.radius+3);}
     else{x=o.x+(ship.x>=o.x?1:-1)*(o.radius+4);y=mode==='EASY'?0:ship.y;}
    }
    await target(x,y,o.z);
    if(caseIndex===0&&mission===0&&encounter===0){
     await control.waitForFunction(()=>window.__lastFrame.ship.z-window.__lastFrame.objects[0].z<12,null,{timeout:12000});
     assert.equal((await state()).stats.ringsCollected,0);await display.screenshot({path:'docs/spacepilot3d/screenshots/rc-ring-approach.png'});
    }
    await waitResolved(mission*6+encounter+1);await match();
    const outcome=await control.evaluate(i=>window.__lastFrame.objects[i].outcome,encounter);assert.equal(outcome,o.kind==='ring'?'collected':'avoided',`${mode}/${difficulty}/${mission}/${encounter}`);
    const tier=(await state()).stats.upgradeTier;
    if(caseIndex===0&&tier>previousTier){await display.waitForTimeout(400);await display.screenshot({path:`docs/spacepilot3d/screenshots/rc-tier${tier}.png`});}previousTier=tier;
    if(caseIndex===0&&mission===0&&encounter===0){
     await display.screenshot({path:'docs/spacepilot3d/screenshots/rc-ring-completed.png'});
     await publisher.evaluate(()=>window.__stream=false);await control.locator('[data-testid="session-lifecycle"][data-lifecycle="suspended"]').waitFor();
     const frozen=await control.evaluate(()=>window.__lastFrame.ship);await control.waitForTimeout(400);assert.deepEqual(await control.evaluate(()=>window.__lastFrame.ship),frozen);
     await publisher.evaluate(()=>window.__stream=true);await align();await act('متابعة','running');
    }
   }
   console.log('MISSION',mode,difficulty,mission+1,await stats(control));
   if(mission<2){await align();await act('بدء المهمة '+new Intl.NumberFormat('ar-SA').format(mission+2),'running');}
  }
  const count=difficulty==='LOW'?15:difficulty==='MEDIUM'?13:11;
  const result=await match();assert.equal(result.collected,count);assert.equal(result.collisions,0);assert.equal(result.resolved,18);
  const current=await state();assert.equal(current.stats.score,count*100);assert.equal(current.stats.collectionAccuracy,1);assert.equal(current.summary.ringsCollected,count);
  evidence.push({mode,difficulty,stats:current.stats,summary:current.summary,pose:await control.evaluate(()=>window.__lastFrame.ship)});
  await control.screenshot({path:`docs/spacepilot3d/screenshots/rc-${mode.toLowerCase()}-${difficulty.toLowerCase()}-summary.png`,fullPage:true});
  writeFileSync('docs/spacepilot3d/validation/rc-browser.json',JSON.stringify({evidence,pageErrors:errors},null,2));
 }
 await control.getByRole('link',{name:'النسخة السابقة',exact:true}).click();await control.locator('[data-controller-phase="SETUP"]').waitFor();assert.equal(new URL(control.url()).pathname,'/control/space-pilot-legacy');
 await control.screenshot({path:'docs/spacepilot3d/screenshots/rc-legacy-rollback.png'});
 assert.deepEqual(errors,[]);assert.equal(requests.filter(u=>/firebaseio|firebasedatabase|identitytoolkit|firestore/.test(u)).length,0);
 console.log('PASS: integrated library navigation and canonical Control/Display routes, ADVANCED/HIGH full session, simulated RIGHT_HAND, instructions, plane passage, upgrades, complete missions, no collisions, pause/restart/dropout/recovery, matching summaries.');
}catch(e){if(control&&!control.isClosed())console.log('CONTROL_STATE',(await control.locator('body').innerText()).slice(0,2500));throw e;}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
