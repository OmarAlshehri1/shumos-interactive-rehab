import {createRequire} from 'node:module';
import {writeFileSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('/Users/omaralshehri/.npm/_npx/5c6d8c4f680fcd0a/node_modules/playwright');
const b=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const context=await b.newContext(),page=await context.newPage(),routes=[];
 for(const route of ['/control/build-quest-3d','/display/build-quest-3d']){const response=await page.goto('http://127.0.0.1:3118'+route);assert.equal(response.status(),404);assert.equal(await page.locator('canvas').count(),0);routes.push({route,status:404,gameMounted:false});}
 const protectedLayout=readFileSync('app/control/layout.tsx','utf8');assert(protectedLayout.includes('<StaffAuthGate>{children}</StaffAuthGate>'));
 const inheritedAuthUnchanged=JSON.parse(readFileSync('docs/buildquest3d/validation/existing-files-check.json','utf8')).changed.length===0;assert(inheritedAuthUnchanged);
 writeFileSync('docs/buildquest3d/validation/production-gates.json',JSON.stringify({passed:true,routes,inheritedStaffAuthUnchanged:true,productionNotEnabled:true,physicalHardwareNotClaimed:true},null,2));
}finally{await b.close();}
