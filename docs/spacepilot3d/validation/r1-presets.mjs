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
   constructor(name){super(name);this.__experimental=name.startsWith('shumos-experimental-space-pilot-3d-v2:');if(this.__experimental)window.__channels.opened++;}
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
 // Keep the sensor publisher in a separate OS window as the normal local channel does.
 const p=await newWindow('http://127.0.0.1:3000/not-an-existing-route',1400),publisher=p.page;
 const initial=await control.evaluate(()=>({frame:window.__lastFrame,state:window.__lastState}));
 await publisher.evaluate(({room,initial})=>{
  const channel=new BroadcastChannel('shumos-sensor-pointer'),world=new BroadcastChannel('shumos-experimental-space-pilot-3d-v2:'+room);
  window.__frame=initial.frame;window.__state=initial.state;world.onmessage=e=>{if(e.data.type==='frame')window.__frame=e.data.frame;if(e.data.type==='state')window.__state=e.data.state};
  let seq=0,last=performance.now();window.__pointer={x:.5,y:.5};window.__target={x:.5,y:.5};window.__aim=null;window.__stream=true;
  setInterval(()=>{
   const now=performance.now(),dt=Math.min(.05,(now-last)/1000);last=now;
   if(window.__aim&&window.__frame){const p=window.__frame.ship,o=window.__aim,depth=Math.max(1,p.z-o.z),sens=window.__state.flightSettings.sensitivity;
    const inverse=v=>Math.abs(v)<1e-9?0:Math.sign(v)*(.06+Math.min(1,Math.abs(v)/sens)*.94);
    window.__target={x:.5+inverse(Math.atan2(o.x-p.x,depth)/.6)/2,y:.5-inverse(Math.atan2(o.y-p.y,Math.hypot(depth,o.x-p.x))/.3)/2};
   }
   const dx=window.__target.x-window.__pointer.x,dy=window.__target.y-window.__pointer.y,a=Math.min(1,.38*dt/(Math.hypot(dx,dy)||1));
   window.__pointer={x:window.__pointer.x+dx*a,y:window.__pointer.y+dy*a};if(window.__stream)channel.postMessage({role:'RIGHT_HAND',visible:true,...window.__pointer,seq:++seq,sentAtMs:Date.now()});
  },20);
 },{room:initial.state.roomId,initial});
 const target=(x,y,z)=>publisher.evaluate(({x,y,z})=>window.__aim={x,y,z},{x,y,z});
 const align=async()=>{const pos=await control.evaluate(()=>window.__lastFrame.ship);await publisher.evaluate(pos=>{window.__aim=null;window.__target={x:pos.controlX,y:pos.controlY}},pos);await control.locator('[data-testid="sensor-status"][data-status="tracking"]').waitFor({timeout:10000});};


 await control.getByLabel('حساسية التوجيه',{exact:true}).selectOption('0.75');
 await control.getByLabel('سرعة الانعطاف القصوى',{exact:true}).selectOption('30');
 await control.getByLabel('الفاصل بين المواجهات',{exact:true}).selectOption('8');
 await control.getByLabel('نصف عرض المجال',{exact:true}).selectOption('32');
 await control.getByLabel('حد الارتفاع',{exact:true}).selectOption('12');
 assert.deepEqual((await state()).flightSettings,{sensitivity:.75,maxTurnRate:30,encounterSpacing:8,horizontalLimit:32,verticalLimit:12});
 for(const difficulty of ['LOW','MEDIUM']){
  if(difficulty==='MEDIUM'){await control.reload();await control.getByRole('button',{name:'بدء الجلسة',exact:true}).waitFor();}
  await control.getByLabel('الصعوبة',{exact:true}).selectOption(difficulty);
  await control.getByLabel('طريقة التحكم',{exact:true}).selectOption('sensor');await align();await act('بدء الجلسة','running');
  assert.equal(await control.getByLabel('حساسية التوجيه',{exact:true}).isDisabled(),true);
  for(let mission=0;mission<3;mission++){
   for(let encounter=0;encounter<6;encounter++){
    const o=await control.evaluate(i=>window.__lastFrame.objects[i],encounter),impact=mission>0&&encounter===5;
    await target(o.x,o.kind==='star'||impact?o.y:o.y-7,o.z);
    await waitResolved(mission*6+encounter+1);await match();
    if(mission===0&&encounter===0){
     await publisher.evaluate(()=>window.__stream=false);
     await control.locator('[data-testid="session-lifecycle"][data-lifecycle="suspended"]').waitFor();
     const frozen=await control.evaluate(()=>window.__lastFrame.ship);await control.waitForTimeout(400);assert.deepEqual(await control.evaluate(()=>window.__lastFrame.ship),frozen);
     await publisher.evaluate(()=>window.__stream=true);await align();await act('متابعة','running');
     // Inject a discontinuous final RIGHT_HAND coordinate, as an upstream recenter can do.
     await publisher.evaluate(()=>{window.__aim=null;window.__pointer={x:1,y:.5};window.__target={x:1,y:.5}});
     await control.locator('[data-testid="session-lifecycle"][data-lifecycle="suspended"]').waitFor();
     const discontinuity=await control.evaluate(()=>window.__lastFrame.ship);await control.waitForTimeout(350);assert.deepEqual(await control.evaluate(()=>window.__lastFrame.ship),discontinuity);
     await align();await act('متابعة','running');
    }
   }
   console.log('MISSION',difficulty,mission+1,await stats(control));
   if(mission<2){await align();await act('بدء المهمة '+new Intl.NumberFormat('ar-SA').format(mission+2),'running');}
  }
  const result=await match();assert.equal(result.collected,11);assert.equal(result.collisions,2);assert.equal(result.resolved,18);assert.equal((await state()).stats.score,1100);
  evidence.push({difficulty,stats:(await state()).stats,pose:await control.evaluate(()=>window.__lastFrame.ship)});
  await act('إنهاء الجلسة','ended');await control.screenshot({path:`docs/spacepilot3d/screenshots/r1-${difficulty.toLowerCase()}-summary.png`,fullPage:true});
 }
 assert.deepEqual(errors,[]);assert.equal(requests.filter(u=>/firebaseio|firebasedatabase|identitytoolkit|firestore/.test(u)).length,0);
 writeFileSync('docs/spacepilot3d/validation/r1-presets.json',JSON.stringify({evidence,pageErrors:errors},null,2));
 console.log('PASS: LOW/MEDIUM full missions, lower avoidance route, RIGHT_HAND loss/recovery, Control/Display scores');
}catch(e){if(control&&!control.isClosed())console.log('CONTROL_STATE',(await control.locator('body').innerText()).slice(0,2500));throw e;}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
