const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage(),hydrationWarnings=[];page.on('console',m=>{if(/hydrated|hydration/i.test(m.text()))hydrationWarnings.push(m.text())});await page.goto('http://127.0.0.1:3000/control/space-pilot-3d-prototype');
 await page.getByRole('button',{name:'تسجيل الدخول',exact:true}).waitFor();
 assert.equal(await page.getByRole('link',{name:'فتح شاشة الطفل',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'بدء الجلسة',exact:true}).count(),0);
 const result={normalConfiguredDevServer:true,signedOutStaffGateVisible:true,experimentalControlActionsAbsent:true,noCredentialsEntered:true,hydrationWarnings};
 writeFileSync('docs/spacepilot3d/validation/r2-auth-gate.json',JSON.stringify(result,null,2));console.log(result);
}finally{await browser.close()}
