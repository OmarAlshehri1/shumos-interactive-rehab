const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import assert from 'node:assert/strict';
const layouts=[
 [['star',0,0],['star',-2.4,1.1],['rock',3.5,-1.6],['star',1.8,-1],['star',0,1.2],['star',-1.8,-1]],
 [['star',0,0],['fiery',-2.4,1.5],['star',2.2,-1.2],['fiery',2.8,1.6],['star',-2,-.8],['fiery',0,0]],
 [['star',0,0],['fiery',-2.5,-1.6],['star',2.2,1.3],['fiery',2.8,-1.6],['star',-1.8,1.1],['fiery',0,0]]
];
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
   constructor(name){super(name);this.__experimental=name.startsWith('shumos-experimental-space-pilot-3d-v1:');if(this.__experimental)window.__channels.opened++;}
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
 await control.getByRole('link',{name:'Open Display'}).waitFor({timeout:60000});
 const displayUrl='http://127.0.0.1:3000'+await control.getByRole('link',{name:'Open Display'}).getAttribute('href');
 const d=await newWindow(displayUrl,760);display=d.page;
 const lifecycle=p=>p.getByTestId('session-lifecycle');
 const stats=p=>p.getByTestId('session-stats').evaluate(e=>({session:e.dataset.session,run:Number(e.dataset.run),events:Number(e.dataset.events),collected:Number(e.dataset.collected),collisions:Number(e.dataset.collisions),resolved:Number(e.dataset.resolved)}));
 const state=()=>control.evaluate(()=>window.__lastState);
 const act=async(name,expected)=>{
  const b=control.getByRole('button',{name,exact:true});
  for(let i=0;i<5;i++){await b.click({timeout:10000});if(expected==='running')await display.bringToFront();await control.waitForTimeout(100);if(!expected||await lifecycle(control).innerText()===expected)return;}
  throw Error('Action did not reach '+expected+': '+name+' / '+await lifecycle(control).innerText());
 };
 const waitResolved=n=>control.waitForFunction(n=>Number(document.querySelector('[data-testid="session-stats"]').dataset.resolved)>=n,n,{timeout:12000});
 const match=async()=>{const a=await stats(control);await display.waitForFunction(a=>{const e=document.querySelector('[data-testid="session-stats"]');return e&&e.dataset.session===a.session&&Number(e.dataset.run)===a.run&&Number(e.dataset.collected)===a.collected&&Number(e.dataset.resolved)===a.resolved},a);return a;};
 // Keep the sensor publisher in a separate OS window as the normal local channel does.
 const p=await newWindow('http://127.0.0.1:3000/not-an-existing-route',1400),publisher=p.page;
 await publisher.evaluate(()=>{const channel=new BroadcastChannel('shumos-sensor-pointer');let seq=0,last=performance.now();window.__pointer={x:.5,y:.5};window.__target={x:.5,y:.5};window.__stream=true;setInterval(()=>{const now=performance.now(),dt=Math.min(.05,(now-last)/1000);last=now;const dx=window.__target.x-window.__pointer.x,dy=window.__target.y-window.__pointer.y,a=Math.min(1,.38*dt/(Math.hypot(dx,dy)||1));window.__pointer={x:window.__pointer.x+dx*a,y:window.__pointer.y+dy*a};if(window.__stream)channel.postMessage({role:'RIGHT_HAND',visible:true,...window.__pointer,seq:++seq,sentAtMs:Date.now()})},20)});
 const target=(x,y)=>publisher.evaluate(({x,y})=>window.__target={x:.5+x/9.6,y:.5-y/5.6},{x,y});
 const align=async()=>{const pos=await control.evaluate(()=>window.__lastFrame.ship);await target(pos.x,pos.y);await control.getByTestId('sensor-status').filter({hasText:'tracking'}).waitFor({timeout:10000});};
 for(const difficulty of ['LOW','MEDIUM']){
 await control.getByLabel('Difficulty',{exact:true}).selectOption(difficulty);
 await control.getByLabel('Input mode',{exact:true}).selectOption('sensor');await align();await act('Start session','running');
 // Duplicate transport deliveries must not double accepted outcomes.
 await control.evaluate(()=>window.__duplicateExperimental=true);await display.evaluate(()=>window.__duplicateExperimental=true);
 for(let mission=0;mission<3;mission++){
  for(let encounter=0;encounter<6;encounter++){
   const [kind,x,y]=layouts[mission][encounter],impact=mission>0&&encounter===5;
   await target(x,kind==='star'||impact?y:y>=0?-2.6:2.6);
   if((mission===0&&[0,2,3].includes(encounter))||(mission===2&&encounter===1)){
     await control.waitForFunction(i=>{const o=window.__lastFrame?.objects[i];return o&&o.presented&&o.outcome==='pending'&&o.z>-12},encounter,{timeout:12000});
     await display.screenshot({path:`docs/spacepilot3d/screenshots/phase07-${difficulty.toLowerCase()}-m${mission+1}-encounter${encounter+1}.png`});
   }
   await waitResolved(mission*6+encounter+1);await match();
   if(mission===0&&encounter===0){
    await act('Pause','paused');const frozen=await stats(control);await control.waitForTimeout(350);assert.deepEqual(await stats(control),frozen);
    await display.reload();await lifecycle(display).filter({hasText:'paused'}).waitFor();await match();
    await align();await act('Resume','running');
    await publisher.evaluate(()=>window.__stream=false);await control.waitForFunction(()=>document.querySelector('[data-testid="session-lifecycle"]').textContent==='suspended');
    const lost=await stats(control);await control.waitForTimeout(350);assert.deepEqual(await stats(control),lost);
    await publisher.evaluate(()=>window.__stream=true);await align();await act('Resume','running');
   }
   if(mission===2&&encounter===0){await act('Pause','paused');await control.screenshot({path:'docs/spacepilot3d/screenshots/phase06-control.png'});await display.screenshot({path:'docs/spacepilot3d/screenshots/phase06-tier3.png'});await align();await act('Resume','running');}
  }
  console.log('MISSION_COMPLETE',mission+1,await stats(control));
  if(mission<2){await align();await act('Launch mission '+(mission+2),'running');}
 }
 const complete=await match();assert.equal(complete.collected,11);assert.equal(complete.collisions,2);assert.equal(complete.resolved,18);
 assert.equal((await state()).stats.score,1100);await act('End session','ended');await control.screenshot({path:'docs/spacepilot3d/screenshots/phase06-summary.png'});
 console.log('THREE_MISSIONS_SENSOR_OK',difficulty);await control.reload();await control.getByRole('link',{name:'Open Display'}).waitFor();
 }
 await publisher.close();
 console.log('PASS: LOW and MEDIUM full sessions, sensor loss/reconnection, missions, scoring, upgrades, pause/reload/restart/end.');
}catch(e){if(control&&!control.isClosed())console.log('CONTROL_STATE',(await control.locator('body').innerText()).slice(0,2500));throw e;}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
