import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('/Users/omaralshehri/.npm/_npx/5c6d8c4f680fcd0a/node_modules/playwright');
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}}),control=await context.newPage(),display=await context.newPage();const errors=[];
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));control.on('pageerror',e=>errors.push(e.message));display.on('pageerror',e=>errors.push(e.message));
 console.log('control');await control.goto('http://127.0.0.1:3108/control/build-quest-3d');await control.getByRole('link',{name:'فتح شاشة الطفل'}).waitFor({timeout:90000});
 console.log('ready');control.on('console',m=>{if(m.type()==='error')console.log('CONTROL ERROR',m.text())});const href=await control.getByRole('link',{name:'فتح شاشة الطفل'}).getAttribute('href');await display.goto('http://127.0.0.1:3108'+href);
 console.log('display ready');await control.getByRole('button',{name:'بدء الجلسة',exact:true}).click();await display.locator('[data-status="running"]').waitFor();
 console.log('running');console.log(await display.locator('body').innerText());const c=display.locator('canvas');await c.waitFor();const box=await c.boundingBox();
 const project=([x,y,z])=>({x:.5+x/18,y:.5+(z*14/Math.hypot(14,16)-y*16/Math.hypot(14,16))/10.125});
 const src=project([2.6,.57,-2.5]),target=project([-5,.57,0]);
 await display.mouse.click(box.x+src.x*box.width,box.y+src.y*box.height);await display.waitForTimeout(150);
 await display.mouse.move(box.x+target.x*box.width,box.y+target.y*box.height,{steps:24});await display.waitForTimeout(800);
 assert.equal(await display.getByTestId('build-state').getAttribute('data-placed'),'1');
 await display.screenshot({path:'docs/buildquest3d/screenshots/q1-workshop.png'});assert.deepEqual(errors,[]);
 writeFileSync('docs/buildquest3d/validation/q1-browser.json',JSON.stringify({passed:true,placed:1,errors,metrics:JSON.parse(await c.getAttribute('data-metrics'))},null,2));
}finally{await browser.close();}
