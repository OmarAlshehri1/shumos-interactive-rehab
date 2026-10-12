import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('/Users/omaralshehri/.npm/_npx/5c6d8c4f680fcd0a/node_modules/playwright');
const browser=await chromium.launch({headless:false,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:[]});
const results=[],errors=[],cloud=[];
try{
 const context=await browser.newContext({viewport:{width:1280,height:800}});
 await context.addInitScript(()=>{const Native=BroadcastChannel;window.__buildState=null;window.BroadcastChannel=class extends Native{postMessage(m){if(this.name.startsWith('shumos-local-buildquest3d-v1:')&&m.type==='state')window.__buildState=m.state;super.postMessage(m);}};});
 context.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});p.on('request',r=>{if(/firebaseio|firebasedatabase|identitytoolkit|securetoken/.test(r.url()))cloud.push(r.url());});});
 const control=await context.newPage(),display=await context.newPage();
 await control.goto('http://127.0.0.1:3108/control/build-quest-3d');await control.getByRole('link',{name:'فتح شاشة الطفل'}).waitFor({timeout:90000});
 const href=await control.getByRole('link',{name:'فتح شاشة الطفل'}).getAttribute('href');await display.goto('http://127.0.0.1:3108'+href);await display.locator('canvas').waitFor({timeout:30000});console.log('renderer initialized');
 // Use real source/target coordinates from the stage manifest exported by the server-side TS transformation.
 const {STAGES,project}=await import('./stage-manifest.mjs');
 for(const [index,stage] of STAGES.entries()){
  console.log('stage',index,stage.id);
  await control.getByRole('button',{name:'بدء الجلسة',exact:true}).click();await display.locator('[data-status="running"]').waitFor();
  if(index===0)await display.screenshot({path:'docs/buildquest3d/screenshots/shape-matching.png'});
  for(const [n,piece] of stage.pieces.entries()){
    const box=await display.locator('canvas').boundingBox(),src=project(piece.source),target=project(piece.target);
    await display.mouse.click(box.x+src.x*box.width,box.y+src.y*box.height);
    await control.waitForFunction(id=>window.__buildState?.selected===id,piece.id,{timeout:5000});
    await display.mouse.move(box.x+target.x*box.width,box.y+target.y*box.height,{steps:12});
    await display.waitForFunction(n=>Number(document.querySelector('[data-testid="build-state"]').dataset.placed)===n,n+1,{timeout:5000});
  }
  await display.locator('[data-status="complete"]').waitFor();await display.waitForTimeout(1000);
  await display.screenshot({path:`docs/buildquest3d/screenshots/${stage.id}-complete.png`});
  const state=await control.evaluate(()=>window.__buildState);const metrics=JSON.parse(await display.locator('canvas').getAttribute('data-metrics'));
  assert.equal(state.placed.length,stage.pieces.length);assert.equal(state.completed.length,index+1);
  results.push({stage:stage.id,pieces:stage.pieces.length,metrics});
  await control.getByRole('button',{name:index===8?'عرض الملخص':'المرحلة التالية',exact:true}).click();
 }
 await display.locator('[data-status="ended"]').waitFor();await display.screenshot({path:'docs/buildquest3d/screenshots/final-summary.png'});
 assert.deepEqual(errors,[]);assert.deepEqual(cloud,[]);
 writeFileSync('docs/buildquest3d/validation/q2-browser.json',JSON.stringify({passed:true,results,errors,cloud},null,2));
} catch(error){writeFileSync('docs/buildquest3d/validation/q2-browser.json',JSON.stringify({passed:false,error:String(error),results,errors,cloud},null,2));throw error;}finally{await browser.close();}
