import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
process.env.PLAYWRIGHT_BROWSERS_PATH='/private/tmp/shumos-playwright';
const require=createRequire(import.meta.url),{chromium}=require('/Users/omaralshehri/.npm/_npx/5c6d8c4f680fcd0a/node_modules/playwright');
const {STAGES,project}=await import('./stage-manifest.mjs');
const browser=await chromium.launch({headless:false,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const checks=[],errors=[],cloud=[];
let context,display;
try{
 context=await browser.newContext({viewport:{width:1280,height:800},recordVideo:{dir:'docs/buildquest3d/video/raw',size:{width:1280,height:800}}});
 await context.addInitScript(()=>{const Native=BroadcastChannel;window.__buildState=null;window.__receivedState=null;window.BroadcastChannel=class extends Native{postMessage(m){if(this.name.startsWith('shumos-local-buildquest3d-v1:')&&m.type==='state')window.__buildState=m.state;super.postMessage(m);}set onmessage(fn){super.onmessage=fn?e=>{if(this.name.startsWith('shumos-local-buildquest3d-v1:')&&e.data?.type==='state')window.__receivedState=e.data.state;fn(e);}:null;}get onmessage(){return super.onmessage;}};});
 context.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});p.on('request',r=>{if(/firebaseio|firebasedatabase|identitytoolkit|securetoken/.test(r.url()))cloud.push(r.url());});});
 const control=await context.newPage();display=await context.newPage();const publisher=await context.newPage();
 await control.goto('http://127.0.0.1:3108/control/build-quest-3d');await control.getByRole('link',{name:'فتح شاشة الطفل'}).waitFor({timeout:60000});
 const href=await control.getByRole('link',{name:'فتح شاشة الطفل'}).getAttribute('href');await display.goto('http://127.0.0.1:3108'+href);await display.locator('canvas').waitFor();
 await context.route('**/__buildquest-pointer-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>RIGHT_HAND simulation</title>'}));
 await publisher.goto('http://127.0.0.1:3108/__buildquest-pointer-test');
 await publisher.evaluate(()=>{window.__pointer={x:.5,y:.5};window.__target={x:.5,y:.5};window.__stream=true;let seq=0;const channel=new BroadcastChannel('shumos-sensor-pointer');setInterval(()=>{const p=window.__pointer,t=window.__target;const dx=t.x-p.x,dy=t.y-p.y,f=Math.min(1,.035/(Math.hypot(dx,dy)||1));window.__pointer={x:p.x+dx*f,y:p.y+dy*f};if(window.__stream)channel.postMessage({role:'RIGHT_HAND',...window.__pointer,visible:true,seq:++seq,sentAtMs:Date.now()});},20);});
 const target=p=>publisher.evaluate(p=>window.__target=p,p);
 const center=()=>publisher.evaluate(()=>{window.__pointer=window.__target={x:.5,y:.5};window.__stream=true;});
 const state=()=>control.evaluate(()=>window.__buildState);
 const waitSelected=id=>control.waitForFunction(id=>window.__buildState?.selected===id,id,{timeout:5000});
 await control.getByLabel('طريقة التحكم',{exact:true}).selectOption('sensor');await control.getByLabel('مدة الثبات (مللي ثانية)').fill('250');
 for(const [index,stage] of STAGES.entries()){
   console.log('sensor',stage.id);await center();await control.getByRole('button',{name:'بدء الجلسة',exact:true}).click();await control.getByTestId('sensor-status').filter({hasText:'متصل'}).waitFor();
   for(const [n,piece] of stage.pieces.entries()){
     await target(project(piece.source));await waitSelected(piece.id);
     if(index===0&&n===0){
       const held=(await state()).pointer;await publisher.evaluate(()=>window.__stream=false);await control.waitForTimeout(400);assert.equal((await state()).selected,piece.id);assert.equal((await state()).inputReady,false);assert.equal((await state()).events.length,0);
       await publisher.evaluate(()=>{window.__pointer=window.__target={x:.95,y:.85};window.__stream=true;});await control.waitForTimeout(200);assert.equal((await state()).inputReady,false);
       await publisher.evaluate(p=>window.__pointer=window.__target=p,held);await control.waitForTimeout(150);assert.equal((await state()).inputReady,true);checks.push('sensor loss holds selected block; recovery requires pickup');
       await control.getByRole('button',{name:'إيقاف مؤقت',exact:true}).click();const before=await state();await target(project(piece.target));await control.waitForTimeout(400);assert.equal((await state()).events.length,before.events.length);assert.deepEqual((await state()).pointer,before.pointer);
       await publisher.evaluate(p=>window.__pointer=window.__target=p,held);await control.getByRole('button',{name:'متابعة',exact:true}).click();checks.push('pause/resume holds accepted state and rearms input');
     }
     await target(project(piece.target));await control.waitForFunction(n=>window.__buildState?.placed.length===n,n+1,{timeout:5000});
   }
   await display.locator('[data-status="complete"]').waitFor();checks.push(`sensor simulation completes ${stage.id}`);
   await control.getByRole('button',{name:index===8?'عرض الملخص':'المرحلة التالية',exact:true}).click();
 }
 // Restart on the final stage, change level, then verify keyboard simulation.
 await control.getByRole('link',{name:'مكتبة الأنشطة',exact:true}).click();await control.goto('http://127.0.0.1:3108/control/build-quest-3d');await control.getByRole('link',{name:'فتح شاشة الطفل'}).waitFor();
 const href2=await control.getByRole('link',{name:'فتح شاشة الطفل'}).getAttribute('href');await display.goto('http://127.0.0.1:3108'+href2);
 await control.getByRole('button',{name:'بدء الجلسة',exact:true}).click();await display.locator('[data-status="running"]').waitFor();
 await display.bringToFront();const box=await display.locator('canvas').boundingBox(),src=project(STAGES[0].pieces[0].source);
 await display.mouse.move(box.x+src.x*box.width,box.y+src.y*box.height);await display.locator('canvas').focus();await display.keyboard.press('Space');await waitSelected('first-shapes:square');
 await display.keyboard.down('ArrowLeft');await display.waitForTimeout(1000);await display.keyboard.up('ArrowLeft');await display.keyboard.down('ArrowDown');await display.waitForTimeout(450);await display.keyboard.up('ArrowDown');
 await control.waitForFunction(()=>window.__buildState?.placed.includes('first-shapes:square'),{timeout:5000});checks.push('real keyboard arrow movement and Space selection place a piece');
 await control.getByRole('button',{name:'إعادة المرحلة',exact:true}).click();await control.getByLabel('طريقة التحكم',{exact:true}).selectOption('controller');await control.getByRole('button',{name:'بدء الجلسة',exact:true}).click();
 await display.locator('[data-status="running"]').waitFor();await display.bringToFront();await display.evaluate(()=>{window.__pad={axes:[0,0],buttons:[{pressed:false}]};navigator.getGamepads=()=>[window.__pad];});
 await display.mouse.move(box.x+src.x*box.width,box.y+src.y*box.height);await display.evaluate(()=>window.__pad.buttons[0].pressed=true);await waitSelected('first-shapes:square');await display.locator('[data-status="running"]').waitFor();await display.bringToFront();await display.evaluate(()=>{window.__pad.buttons[0].pressed=false;window.__pad.axes=[-1,0];});await display.waitForTimeout(1000);await display.evaluate(()=>window.__pad.axes=[0,1]);await display.waitForTimeout(450);await display.evaluate(()=>window.__pad.axes=[0,0]);
 await control.waitForFunction(()=>window.__buildState?.placed.includes('first-shapes:square'),{timeout:5000});checks.push('simulated Gamepad stick and button use authoritative placement path');
 assert.deepEqual(errors,[]);assert.deepEqual(cloud,[]);
 writeFileSync('docs/buildquest3d/validation/q3-browser.json',JSON.stringify({passed:true,checks,errors,cloud},null,2));
}catch(error){writeFileSync('docs/buildquest3d/validation/q3-browser.json',JSON.stringify({passed:false,error:String(error),checks,errors,cloud},null,2));throw error;}finally{if(context){const video=display?.video();await context.close();if(video)await video.saveAs('docs/buildquest3d/video/buildquest-gameplay.webm');}await browser.close();}
