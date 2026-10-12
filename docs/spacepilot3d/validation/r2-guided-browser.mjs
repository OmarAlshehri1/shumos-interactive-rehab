const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('docs/spacepilot3d/videos',{recursive:true});
const evidence=[];
(async()=>{
const browser=await chromium.launch({headless:false,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:[]});
let control,display;
try{
 const context=await browser.newContext({viewport:{width:1376,height:768},recordVideo:{dir:'/private/tmp/shumos-r2-video',size:{width:1376,height:768}}});
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
 const act=async(name,expected)=>{
  const b=control.getByRole('button',{name,exact:true});
  for(let i=0;i<5;i++){await b.click({timeout:10000});if(expected==='running')await display.bringToFront();await control.waitForTimeout(name==='بدء الجلسة'?3300:100);if(!expected||await lifecycle(control).getAttribute('data-lifecycle')===expected)return;}
  throw Error('Action did not reach '+expected+': '+name+' / '+await lifecycle(control).getAttribute('data-lifecycle'));
 };
 const waitResolved=n=>control.waitForFunction(n=>Number(document.querySelector('[data-testid="session-stats"]').dataset.resolved)>=n,n,{timeout:12000});
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


 const shot=async(name)=>{await display.bringToFront();await display.waitForTimeout(350);await display.screenshot({path:`docs/spacepilot3d/screenshots/r2-${name}.png`});evidence.push({name,frame:await control.evaluate(()=>window.__lastFrame),graphics:JSON.parse(await display.locator('canvas').getAttribute('data-graphics-metrics'))});};
 await control.getByLabel('الصعوبة',{exact:true}).selectOption('HIGH');
 await control.getByLabel('عرض مسار الرحلة',{exact:true}).selectOption('32');
 await control.getByLabel('الفاصل بين المواجهات',{exact:true}).selectOption('6');
 await control.getByLabel('طريقة التحكم',{exact:true}).selectOption('sensor');await align();await act('بدء الجلسة','running');
 await waitResolved(1);const poses=[];
 await publisher.evaluate(()=>{window.__aim=null;window.__target={x:1,y:.5}});await display.bringToFront();
 for(let i=0;i<160;i++){await display.waitForTimeout(100);const p=await control.evaluate(()=>window.__lastFrame.ship);assert(Math.abs(p.x)<=32);assert(Math.abs(p.yaw)<=Math.PI/3+1e-8);assert(p.z<0);poses.push(p);}
 await shot('right-boundary');assert(poses.at(-1).x>20);assert.equal(await display.getByTestId('objective-guidance').isVisible(),true);await shot('objective-guidance');
 const recovery=await control.evaluate(()=>window.__lastFrame.objects.find(o=>o.kind==='star'&&o.outcome==='pending'&&window.__lastFrame.ship.z-o.z>120));assert(recovery);
 await target(recovery.x,recovery.y,recovery.z);await control.waitForFunction(id=>window.__lastFrame.objects.find(o=>o.id===id)?.outcome!=='pending',recovery.id,{timeout:16000});
 assert.equal(await control.evaluate(id=>window.__lastFrame.objects.find(o=>o.id===id).outcome,recovery.id),'collected');await shot('guided-recovery-collection');
 await act('إعادة الرحلة','paused');await align();await act('متابعة','running');await publisher.evaluate(()=>{window.__aim=null;window.__target={x:0,y:.5}});await display.bringToFront();
 for(let i=0;i<160;i++){await display.waitForTimeout(100);const p=await control.evaluate(()=>window.__lastFrame.ship);assert(Math.abs(p.x)<=32);assert(Math.abs(p.yaw)<=Math.PI/3+1e-8);poses.push(p);}
 await shot('left-boundary');assert(poses.at(-1).x< -20);
 await act('إنهاء الجلسة','ended');await control.reload();await control.getByRole('button',{name:'بدء الجلسة',exact:true}).waitFor();
 await control.getByLabel('مسار الرحلة',{exact:true}).selectOption('1');await control.getByLabel('حركة كاميرا مريحة',{exact:true}).selectOption('1');await control.getByLabel('مساعدة الوصول للأهداف',{exact:true}).selectOption('0');
 await display.goto(displayUrl.replace('#','?settings=1#'));await display.getByText('إعدادات المعالج',{exact:true}).click();await display.waitForFunction(()=>document.querySelector('[data-testid="session-lifecycle"]').dataset.lifecycle==='ready');await display.waitForTimeout(200);assert.equal(await display.getByLabel('تقليل حركة الكاميرا').isChecked(),true);assert.equal(await display.getByLabel('تقليل حركة الكاميرا').isDisabled(),true);await display.getByText('إعدادات المعالج',{exact:true}).click();
 await control.getByLabel('طريقة التحكم',{exact:true}).selectOption('sensor');await align();await act('بدء الجلسة','running');await display.waitForTimeout(1500);assert.equal(await display.getByTestId('objective-guidance').isVisible(),false);
 const metrics=JSON.parse(await display.locator('canvas').getAttribute('data-graphics-metrics'));assert.equal(metrics.reducedCameraMotion,true);await shot('curved-course-reduced-motion');await act('إنهاء الجلسة','ended');
 assert.deepEqual(errors,[]);const video=display.video();await publisher.close();await display.close();await video.saveAs('docs/spacepilot3d/videos/r2-guided-flight.webm');
 writeFileSync('docs/spacepilot3d/validation/r2-guided-browser.json',JSON.stringify({evidence,poses,pageErrors:errors,zeroFirebaseGameplayRequests:requests.filter(u=>/firebaseio|firebasedatabase|identitytoolkit|firestore/.test(u)).length===0},null,2));
 console.log('PASS: both corridor edges, heading envelope, offscreen guidance, collection after return, curved course, Control reduced-camera setting and disabled guidance.');
}catch(e){if(control&&!control.isClosed())console.log('CONTROL_STATE',(await control.locator('body').innerText()).slice(0,2500));throw e;}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
