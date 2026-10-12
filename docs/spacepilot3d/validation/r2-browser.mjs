const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import assert from 'node:assert/strict';
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
   constructor(name){super(name);this.__experimental=name.startsWith('shumos-experimental-space-pilot-3d-v3:');if(this.__experimental)window.__channels.opened++;}
   set onmessage(fn){super.onmessage=fn?e=>{if(this.__experimental&&window.__dropExperimental)return;fn(e)}:null;}
   get onmessage(){return super.onmessage;}
   postMessage(m){if(this.__experimental){if(m.type==='state')window.__lastState=m.state;if(m.type==='frame')window.__lastFrame=m.frame;if(window.__dropOutbound)return;}super.postMessage(m);if(this.__experimental&&window.__duplicateExperimental)super.postMessage(m);}
   close(){if(this.__experimental)window.__channels.closed++;super.close();}
  };
 });
 const cdp=await browser.newBrowserCDPSession();
 const contexts=await cdp.send('Target.getBrowserContexts');
 async function newWindow(url,left){const pageEvent=context.waitForEvent('page');const {targetId}=await cdp.send('Target.createTarget',{url:'about:blank',newWindow:true,browserContextId:contexts.browserContextIds[0]});const page=await pageEvent;const {windowId}=await cdp.send('Browser.getWindowForTarget',{targetId});await cdp.send('Browser.setWindowBounds',{windowId,bounds:{left,top:40,width:1100,height:860}});await page.goto(url);return{page,windowId};}
 const c=await newWindow('http://127.0.0.1:3000/control/space-pilot-3d-prototype',0);control=c.page;
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
 assert.equal(await display.locator('main').getAttribute('lang'),'ar');
 assert.equal(await display.locator('main').getAttribute('dir'),'rtl');
 assert.equal(await display.getByLabel('جودة الرسوم').count(),0);
 await display.bringToFront();await display.waitForTimeout(1800);
 await display.screenshot({path:'docs/spacepilot3d/screenshots/r2-start.png'});
 await control.screenshot({path:'docs/spacepilot3d/screenshots/r2-control-setup.png',fullPage:true});
 await control.getByRole('button',{name:'بدء الجلسة',exact:true}).click();await control.waitForTimeout(1100);
 assert.equal(await lifecycle(control).getAttribute('data-lifecycle'),'ready');assert.equal((await state()).elapsedSeconds,0);
 await control.getByRole('button',{name:'إلغاء العد التنازلي',exact:true}).click();await control.waitForTimeout(2200);
 assert.equal(await lifecycle(control).getAttribute('data-lifecycle'),'ready');
 await control.getByRole('button',{name:'بدء الجلسة',exact:true}).click();
 await cdp.send('Browser.setWindowBounds',{windowId:c.windowId,bounds:{windowState:'minimized'}});await display.waitForTimeout(3500);
 await cdp.send('Browser.setWindowBounds',{windowId:c.windowId,bounds:{windowState:'normal'}});
 assert.equal(await lifecycle(control).getAttribute('data-lifecycle'),'ready');assert.equal(await control.getByTestId('launch-countdown').count(),0);
 console.log('ARABIC_CHILD_UI_COUNTDOWN_CANCEL_AND_HIDDEN_CANCEL_OK');
 await act('بدء الجلسة','running');await display.locator('[data-testid="session-lifecycle"][data-lifecycle="running"]').waitFor();
 await display.bringToFront();await display.locator('canvas').click({position:{x:500,y:450}});await display.keyboard.down('ArrowRight');await display.waitForTimeout(250);await display.keyboard.up('ArrowRight');await display.waitForTimeout(100);const keyboardPose=await control.evaluate(()=>window.__lastFrame.ship);assert(keyboardPose.x>0&&keyboardPose.yaw>0&&keyboardPose.z<0);await display.keyboard.press('KeyC');
 await display.waitForFunction(()=>Number(document.querySelector('[data-testid="flight-input-guide"]').dataset.flightX)===.5);
 await waitResolved(1);await match();
 const old=await control.evaluate(()=>({state:window.__lastState,frame:window.__lastFrame}));
 await act('إعادة الرحلة','paused');assert.equal((await stats(control)).collected,0);
 await display.evaluate(old=>{const room=new URLSearchParams(location.hash.slice(1)).get('room');const c=new BroadcastChannel('shumos-experimental-space-pilot-3d-v3:'+room);c.postMessage({version:3,type:'state',state:old.state});c.postMessage({version:3,type:'frame',frame:old.frame});c.close()},old);
 await control.waitForTimeout(100);assert.equal((await match()).collected,0);
 await act('متابعة','running');await waitResolved(1);await act('إنهاء الجلسة','ended');await control.getByRole('region',{name:'ملخص الجلسة',exact:true}).waitFor();await match();
 const oldSession=(await stats(control)).session;
 await control.reload();await control.getByRole('link',{name:'فتح شاشة الطفل'}).waitFor();
 await control.getByRole('region',{name:'ملخص الجلسة السابقة',exact:true}).waitFor();
 await match();assert.notEqual((await stats(control)).session,oldSession);assert.equal(await lifecycle(control).getAttribute('data-lifecycle'),'ready');
 console.log('KEYBOARD_RESTART_END_RELOAD_OK');
 // Keep the sensor publisher in a separate OS window as the normal local channel does.
 const p=await newWindow('http://127.0.0.1:3000/not-an-existing-route',1400),publisher=p.page;
 const initial=await control.evaluate(()=>({frame:window.__lastFrame,state:window.__lastState}));
 await publisher.evaluate(({room,initial})=>{
  const channel=new BroadcastChannel('shumos-sensor-pointer'),world=new BroadcastChannel('shumos-experimental-space-pilot-3d-v3:'+room);
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
 await control.getByLabel('الصعوبة',{exact:true}).selectOption('HIGH');
 await control.getByLabel('طريقة التحكم',{exact:true}).selectOption('sensor');await align();await act('بدء الجلسة','running');
 // Duplicate transport deliveries must not double accepted outcomes.
 await control.evaluate(()=>window.__duplicateExperimental=true);await display.evaluate(()=>window.__duplicateExperimental=true);
 for(let mission=0;mission<3;mission++){
  for(let encounter=0;encounter<6;encounter++){
   const object=await control.evaluate(i=>window.__lastFrame.objects[i],encounter),{kind,x,y,z}=object,impact=mission>0&&encounter===5;
   await target(x,kind==='star'||impact?y+0:y+7,z);
   if((mission===0&&[0,2,3].includes(encounter))||(mission===2&&encounter===1)){
     await control.waitForFunction(i=>{const o=window.__lastFrame?.objects[i];return o&&o.presented&&o.outcome==='pending'&&window.__lastFrame.ship.z-o.z<65},encounter,{timeout:12000});
     await display.screenshot({path:`docs/spacepilot3d/screenshots/r2-m${mission+1}-encounter${encounter+1}.png`});
   }
   await waitResolved(mission*6+encounter+1);await match();
   if(mission===0&&encounter===0){await display.getByTestId('flight-feedback').filter({hasText:'أحسنت'}).waitFor();await display.screenshot({path:'docs/spacepilot3d/screenshots/r2-collection.png'});}
   if(mission===0&&encounter===3){await display.getByTestId('flight-feedback').filter({hasText:'تطوّرت'}).waitFor();await display.screenshot({path:'docs/spacepilot3d/screenshots/r2-tier2.png'});}
   if(mission===2&&encounter===5)assert.equal((await state()).stats.asteroidCollisions,2);
   if(mission===0&&encounter===0){
    await act('إيقاف مؤقت','paused');const frozen=await stats(control),pose=await control.evaluate(()=>window.__lastFrame.ship);await control.waitForTimeout(350);assert.deepEqual(await stats(control),frozen);assert.deepEqual(await control.evaluate(()=>window.__lastFrame.ship),pose);
    await display.reload();await display.locator('[data-testid="session-lifecycle"][data-lifecycle="paused"]').waitFor();await match();
    await align();await act('متابعة','running');
   }
   if(mission===2&&encounter===0){await act('إيقاف مؤقت','paused');await control.screenshot({path:'docs/spacepilot3d/screenshots/r2-control.png',fullPage:true});await display.screenshot({path:'docs/spacepilot3d/screenshots/r2-tier3.png'});await align();await act('متابعة','running');}
  }
  console.log('MISSION_COMPLETE',mission+1,await stats(control));if(mission===0)await display.screenshot({path:'docs/spacepilot3d/screenshots/r2-mission-complete.png'});if(mission===2)await display.screenshot({path:'docs/spacepilot3d/screenshots/r2-flight-complete.png'});
  if(mission<2){await align();await act('بدء المهمة '+new Intl.NumberFormat('ar-SA').format(mission+2),'running');}
 }
 const complete=await match();assert.equal(complete.collected,11);assert.equal(complete.collisions,2);assert.equal(complete.resolved,18);
 assert.equal((await state()).stats.score,1100);await act('إنهاء الجلسة','ended');await control.screenshot({path:'docs/spacepilot3d/screenshots/r2-summary.png',fullPage:true});
 console.log('THREE_MISSIONS_SENSOR_OK');
 await publisher.close();
 // Real window focus, minimize, reload and renderer scheduling checks.
 await control.reload();await control.getByRole('button',{name:'بدء الجلسة',exact:true}).waitFor();await act('بدء الجلسة','running');
 await control.bringToFront();await control.waitForTimeout(700);assert.equal(await control.evaluate(()=>document.hidden),false);const foregroundControl=await lifecycle(control).getAttribute('data-lifecycle');console.log('FOREGROUND_CONTROL',foregroundControl);
 if(foregroundControl==='suspended'){const frozen=await stats(control);await control.waitForTimeout(300);assert.deepEqual(await stats(control),frozen);await display.bringToFront();await act('متابعة','running');}else assert.equal(foregroundControl,'running');
 await display.bringToFront();await display.waitForTimeout(700);assert.equal(await control.evaluate(()=>document.hidden),false);assert.equal(await lifecycle(control).getAttribute('data-lifecycle'),'running');
 await control.evaluate(()=>window.__dropExperimental=true);await control.waitForTimeout(500);assert.equal(await lifecycle(control).getAttribute('data-lifecycle'),'suspended');
 const lost=await stats(control);await control.waitForTimeout(300);assert.deepEqual(await stats(control),lost);
 await control.evaluate(()=>window.__dropExperimental=false);await act('متابعة','running');
 await control.evaluate(()=>{const start=performance.now();while(performance.now()-start<500){}});await control.waitForTimeout(150);assert.equal(await lifecycle(control).getAttribute('data-lifecycle'),'suspended');await act('متابعة','running');
 await cdp.send('Browser.setWindowBounds',{windowId:c.windowId,bounds:{windowState:'minimized'}});await display.waitForTimeout(500);
 await cdp.send('Browser.setWindowBounds',{windowId:c.windowId,bounds:{windowState:'normal'}});await control.waitForTimeout(100);assert.equal(await lifecycle(control).getAttribute('data-lifecycle'),'suspended');await act('متابعة','running');
 await cdp.send('Browser.setWindowBounds',{windowId:d.windowId,bounds:{windowState:'minimized'}});await control.waitForTimeout(500);
 await cdp.send('Browser.setWindowBounds',{windowId:d.windowId,bounds:{windowState:'normal'}});await control.waitForTimeout(150);assert.equal(await lifecycle(control).getAttribute('data-lifecycle'),'suspended');await act('متابعة','running');
 const controlCDP=await context.newCDPSession(control);await control.evaluate(()=>window.__dropOutbound=true);await controlCDP.send('Page.setWebLifecycleState',{state:'frozen'});await display.waitForTimeout(600);assert.equal((await lifecycle(display).getAttribute('data-lifecycle')).toLowerCase(),'disconnected');await controlCDP.send('Page.setWebLifecycleState',{state:'active'});await control.evaluate(()=>window.__dropOutbound=false);await control.waitForTimeout(150);assert.equal(await lifecycle(control).getAttribute('data-lifecycle'),'suspended');await act('متابعة','running');
 const beforeReload=await stats(control);await control.reload();await control.getByRole('region',{name:'الجلسة السابقة توقفت عند إعادة تحميل التحكم',exact:true}).waitFor();assert.equal(await lifecycle(control).getAttribute('data-lifecycle'),'ready');assert.notEqual((await stats(control)).session,beforeReload.session);await match();
 console.log('FOCUS_MINIMIZE_LOSS_FREEZE_RELOAD_OK');
 const secondaryWindow=await newWindow(displayUrl,1400),secondary=secondaryWindow.page;
 await control.getByLabel('الشاشة الرئيسية',{exact:true}).waitFor();await act('بدء الجلسة','running');
 const held=await display.getByTestId('flight-input-guide').getAttribute('data-flight-x');await secondary.bringToFront();await secondary.locator('canvas').click({position:{x:500,y:450}});await secondary.keyboard.down('ArrowLeft');await secondary.waitForTimeout(200);await secondary.keyboard.up('ArrowLeft');assert.equal(await display.getByTestId('flight-input-guide').getAttribute('data-flight-x'),held);
 await secondary.close();await control.waitForTimeout(100);assert.equal(await lifecycle(control).getAttribute('data-lifecycle'),'running');
 await control.close();await display.waitForTimeout(400);assert.equal((await lifecycle(display).getAttribute('data-lifecycle')).toLowerCase(),'disconnected');
 const channels=await display.evaluate(()=>window.__channels);assert.equal(channels.opened-channels.closed,1);
 assert.deepEqual(errors,[]);assert.equal(requests.filter(u=>/firebaseio|firebasedatabase|identitytoolkit|firestore/.test(u)).length,0);
 console.log(JSON.stringify({headedSeparateWindows:true,keyboard:true,simulatedRightHand:true,threeMissions:true,stars:11,score:1100,impacts:2,duplicateAndOldRunRejected:true,displayReload:true,controlReload:true,foregroundAndUnfocusedVisible:true,actualWindowMinimizeRestore:true,controlOutboundLossWithPageFreezeCommand:true,messageLoss:true,multipleDisplays:true,controlClose:true,noFirebaseRequests:true,pageErrors:errors}));
}catch(e){if(control&&!control.isClosed())console.log('CONTROL_STATE',(await control.locator('body').innerText()).slice(0,2500));if(display&&!display.isClosed())console.log('DISPLAY_STATE',(await display.locator('body').innerText()).slice(0,1500));throw e;}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
