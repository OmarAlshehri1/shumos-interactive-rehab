const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import assert from 'node:assert/strict';
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});try{
 const context=await browser.newContext();const first=await context.newPage();const url='http://127.0.0.1:3000/control/space-pilot-3d-prototype';
 await first.goto(url);await first.getByRole('link',{name:'Open Display'}).waitFor();
 const room=await first.evaluate(()=>sessionStorage.getItem('shumos.experimental.space-pilot-3d.room.v1'));
 const lockName='shumos-space-pilot-3d-owner:'+room;
 const second=await context.newPage();await second.addInitScript(room=>sessionStorage.setItem('shumos.experimental.space-pilot-3d.room.v1',room),room);await second.goto(url);
 await second.waitForFunction(async name=>{const l=await navigator.locks.query();return l.held.filter(x=>x.name===name).length===1&&l.pending.filter(x=>x.name===name).length===1},lockName);
 assert.equal(await second.getByRole('link',{name:'Open Display'}).count(),0);
 await first.close();await second.getByRole('link',{name:'Open Display'}).waitFor();
 for(let i=0;i<5;i++){await second.reload();await second.getByRole('link',{name:'Open Display'}).waitFor();const locks=await second.evaluate(()=>navigator.locks.query());assert.equal(locks.held.filter(x=>x.name===lockName).length,1);assert.equal(locks.pending.filter(x=>x.name===lockName).length,0);}
 console.log('PASS: StrictMode mount, duplicate-room Control queued, close transfers ownership, five rapid reloads hold exactly one lock and leave no pending owner.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
