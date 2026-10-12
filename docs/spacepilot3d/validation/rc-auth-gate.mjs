const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage(),checks=[],hydrationWarnings=[];
 page.on('console',m=>{if(/hydrated|hydration/i.test(m.text()))hydrationWarnings.push(m.text())});
 for(const path of ['/control/activities','/control/space-pilot','/control/space-pilot-legacy','/control/space-pilot-3d-prototype']){
  await page.goto('http://127.0.0.1:3000'+path);await page.getByRole('button',{name:'تسجيل الدخول',exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:'فتح شاشة الطفل',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'بدء الجلسة',exact:true}).count(),0);
  checks.push({path,existingStaffSignInGateVisible:true,gameActionsAbsent:true});
 }
 assert.deepEqual(hydrationWarnings,[]);
 writeFileSync('docs/spacepilot3d/validation/rc-auth-gate.json',JSON.stringify({checks,noCredentialsEntered:true,normalConfiguredServer:true,hydrationWarnings},null,2));console.log(checks);
}finally{await browser.close()}
