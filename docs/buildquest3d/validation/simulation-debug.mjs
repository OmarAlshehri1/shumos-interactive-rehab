import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('/Users/omaralshehri/.npm/_npx/5c6d8c4f680fcd0a/node_modules/playwright');
const {STAGES,project}=await import('./stage-manifest.mjs');
const b=await chromium.launch({headless:false,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
const context=await b.newContext({viewport:{width:1280,height:800}}),control=await context.newPage(),display=await context.newPage();
await context.addInitScript(()=>{const Native=BroadcastChannel;window.__state=null;window.BroadcastChannel=class extends Native{postMessage(m){if(m.type==='state'&&this.name.startsWith('shumos-local-buildquest'))window.__state=m.state;super.postMessage(m);}}});
control.on('pageerror',console.log);display.on('pageerror',console.log);
await control.goto('http://127.0.0.1:3108/control/build-quest-3d');await control.getByRole('link',{name:'فتح شاشة الطفل'}).waitFor();await display.goto('http://127.0.0.1:3108'+await control.getByRole('link',{name:'فتح شاشة الطفل'}).getAttribute('href'));
await control.getByRole('button',{name:'بدء الجلسة',exact:true}).click();await display.locator('[data-status="running"]').waitFor();await display.bringToFront();const box=await display.locator('canvas').boundingBox(),src=project(STAGES[0].pieces[0].source);
await display.mouse.move(box.x+src.x*box.width,box.y+src.y*box.height);await display.locator('canvas').focus();await display.keyboard.press('Space');await display.waitForTimeout(150);console.log('selected',await control.evaluate(()=>window.__state));
await display.keyboard.down('ArrowLeft');await display.waitForTimeout(1000);await display.keyboard.up('ArrowLeft');console.log('left',await control.evaluate(()=>window.__state.pointer));await display.keyboard.down('ArrowDown');await display.waitForTimeout(450);await display.keyboard.up('ArrowDown');await display.waitForTimeout(200);console.log('down',await control.evaluate(()=>window.__state));await display.screenshot({path:'docs/buildquest3d/screenshots/keyboard-debug.png'});
}finally{await b.close();}
