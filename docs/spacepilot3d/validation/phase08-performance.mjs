const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
(async()=>{
const browser=await chromium.launch({headless:false,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:[],ignoreDefaultArgs:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
let control,display;
try{
 const context=await browser.newContext({viewport:{width:1376,height:768},deviceScaleFactor:2});
 const errors=[],requests=[];
 context.on('page',p=>{p.on('console',m=>{if(/THREE.WebGLProgram|Shader Error/.test(m.text()))errors.push(m.text())});p.on('pageerror',e=>{errors.push(e.message);console.log('PAGE_ERROR',e.message)});p.on('request',r=>requests.push(r.url()))});
 await context.addInitScript(()=>{
  const Native=BroadcastChannel;window.__channels={opened:0,closed:0};window.__lastState=null;window.__lastFrame=null;window.__latencies=[];
  window.BroadcastChannel=class extends Native{
   constructor(name){super(name);this.__experimental=name.startsWith('shumos-experimental-space-pilot-3d-v1:');if(this.__experimental)window.__channels.opened++;}
   set onmessage(fn){super.onmessage=fn?e=>{if(this.__experimental&&window.__dropExperimental)return;if(this.__experimental&&e.data.__sent){window.__latencies.push({type:e.data.type,ms:performance.timeOrigin+performance.now()-e.data.__sent});if(window.__latencies.length>5000)window.__latencies.shift();}fn(e)}:null;}
   get onmessage(){return super.onmessage;}
   postMessage(m){if(this.__experimental){m.__sent=performance.timeOrigin+performance.now();if(m.type==='state')window.__lastState=m.state;if(m.type==='frame')window.__lastFrame=m.frame;if(window.__dropOutbound)return;}super.postMessage(m);if(this.__experimental&&window.__duplicateExperimental)super.postMessage(m);}
   close(){if(this.__experimental)window.__channels.closed++;super.close();}
  };
 });
 const cdp=await browser.newBrowserCDPSession();
 const contexts=await cdp.send('Target.getBrowserContexts');
 async function newWindow(url,left){const pageEvent=context.waitForEvent('page');const {targetId}=await cdp.send('Target.createTarget',{url:'about:blank',newWindow:true,browserContextId:contexts.browserContextIds[0]});const page=await pageEvent;const {windowId}=await cdp.send('Browser.getWindowForTarget',{targetId});await cdp.send('Browser.setWindowBounds',{windowId,bounds:{left,top:40,width:1100,height:860}});await page.goto(url);const pageCDP=await context.newCDPSession(page);await pageCDP.send('Emulation.setFocusEmulationEnabled',{enabled:false});return{page,windowId};}
 const c=await newWindow('http://127.0.0.1:3000/control/space-pilot-3d-prototype',0);control=c.page;
 await control.getByRole('link',{name:'فتح شاشة الطفل'}).waitFor({timeout:60000});
 const displayUrl='http://127.0.0.1:3000'+await control.getByRole('link',{name:'فتح شاشة الطفل'}).getAttribute('href');
 const d=await newWindow(displayUrl.replace('#','?settings=1#'),760);display=d.page;
 const lifecycle=p=>p.getByTestId('session-lifecycle');
 const stats=p=>p.getByTestId('session-stats').evaluate(e=>({session:e.dataset.session,run:Number(e.dataset.run),events:Number(e.dataset.events),collected:Number(e.dataset.collected),collisions:Number(e.dataset.collisions),resolved:Number(e.dataset.resolved)}));
 const act=async(name,expected)=>{
  const b=control.getByRole('button',{name,exact:true});
  for(let i=0;i<5;i++){await b.click({timeout:10000});if(expected==='running')await display.bringToFront();await control.waitForTimeout(name==='بدء الجلسة'?3300:100);if(!expected||await lifecycle(control).getAttribute('data-lifecycle')===expected)return;}
  throw Error('Action did not reach '+expected+': '+name+' / '+await lifecycle(control).getAttribute('data-lifecycle'));
 };

 const result={environment:await display.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return {userAgent:navigator.userAgent,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',viewport:[innerWidth,innerHeight],devicePixelRatio,hardwareConcurrency:navigator.hardwareConcurrency};}),samples:[],remounts:[]};
 await display.getByText('إعدادات المعالج',{exact:true}).click();
 for(const quality of ['low','medium','high']){
  await display.getByLabel('جودة الرسوم').selectOption(quality);
  if((await lifecycle(control).getAttribute('data-lifecycle'))==='ready')await act('بدء الجلسة','running');else{await act('إعادة الرحلة','paused');await act('متابعة','running');}
  await control.bringToFront();await control.waitForTimeout(100);await display.bringToFront();await control.waitForFunction(()=>!document.hasFocus());await display.waitForTimeout(6500);
  assert.equal(await lifecycle(control).getAttribute('data-lifecycle'),'running');
  result.samples.push({quality,focus:'Display (Control unfocused)',actualFocus:{control:await control.evaluate(()=>document.hasFocus()),display:await display.evaluate(()=>document.hasFocus())},metrics:JSON.parse(await display.locator('canvas').getAttribute('data-graphics-metrics'))});
  await control.bringToFront();await control.waitForTimeout(6000);
  assert.equal(await lifecycle(control).getAttribute('data-lifecycle'),'running');
  result.samples.push({quality,focus:'Control (Display unfocused)',actualFocus:{control:await control.evaluate(()=>document.hasFocus()),display:await display.evaluate(()=>document.hasFocus())},metrics:JSON.parse(await display.locator('canvas').getAttribute('data-graphics-metrics'))});
  await act('إيقاف مؤقت','paused');
 }
 await display.emulateMedia({reducedMotion:'reduce'});await display.waitForTimeout(1300);
 assert.equal(await display.locator('main').getAttribute('data-reduced-effects'),'true');
 result.reducedEffects=JSON.parse(await display.locator('canvas').getAttribute('data-graphics-metrics'));assert.equal(result.reducedEffects.reducedEffects,true);
 await display.getByLabel('تقليل المؤثرات والحركة').uncheck();await display.waitForTimeout(1100);assert.equal(await display.locator('main').getAttribute('data-reduced-effects'),'false');
 await display.emulateMedia({reducedMotion:'no-preference'});
 const summarize=values=>{values.sort((a,b)=>a-b);return {count:values.length,meanMs:values.reduce((a,b)=>a+b,0)/values.length,p95Ms:values[Math.floor(values.length*.95)],maxMs:values.at(-1)}};
 result.frameLatency=summarize(await display.evaluate(()=>window.__latencies.filter(x=>x.type==='frame').map(x=>x.ms)));
 result.inputLatency=summarize(await control.evaluate(()=>window.__latencies.filter(x=>x.type==='input').map(x=>x.ms)));
 // Context loss suspends authority and requires explicit reload/resume.
 await act('متابعة','running');await display.evaluate(()=>document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
 await control.waitForFunction(()=>document.querySelector('[data-testid="session-lifecycle"]').dataset.lifecycle==='suspended');
 const frozen=await stats(control);await control.waitForTimeout(500);assert.deepEqual(await stats(control),frozen);
 await display.getByRole('button',{name:'إعادة تحميل العرض'}).click();await act('متابعة','running');await act('إيقاف مؤقت','paused');
 for(let i=0;i<3;i++){await display.reload();await display.waitForTimeout(1800);result.remounts.push(JSON.parse(await display.locator('canvas').getAttribute('data-graphics-metrics')));}
 writeFileSync('docs/spacepilot3d/validation/phase08-performance.json',JSON.stringify(result,null,2));
 const modelPattern='**/spacepilot3d/models/bob.glb';await context.route(modelPattern,r=>r.fulfill({status:404,body:'Test missing model'}));await display.reload();await display.getByRole('alert').filter({hasText:'Spacecraft could not load'}).waitFor();assert.equal(await control.getByRole('button',{name:'متابعة',exact:true}).isEnabled(),false);await context.unroute(modelPattern);await display.getByRole('button',{name:'إعادة تحميل العرض'}).click();await act('متابعة','running');await act('إنهاء الجلسة','ended');
 result.contextLossAndRecovery=true;result.assetFailureAndRecovery=true;result.pageErrors=errors;result.firebaseRequests=requests.filter(u=>/firebaseio|firebasedatabase|identitytoolkit|firestore/.test(u));
 writeFileSync('docs/spacepilot3d/validation/phase08-performance.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 assert.deepEqual(errors,[]);assert.deepEqual(result.firebaseRequests,[]);assert(result.samples.filter(x=>x.focus.startsWith('Display')).every(x=>x.actualFocus.control===false));assert(result.samples.filter(x=>x.focus.startsWith('Control')).every(x=>x.actualFocus.display===false));
}catch(e){if(control&&!control.isClosed())console.log('CONTROL_STATE',(await control.locator('body').innerText()).slice(0,2500));if(display&&!display.isClosed())console.log('DISPLAY_STATE',(await display.locator('body').innerText()).slice(0,1500));throw e;}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
