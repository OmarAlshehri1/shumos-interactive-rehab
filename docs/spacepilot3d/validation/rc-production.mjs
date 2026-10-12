import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const enabled=process.env.EXPECT_3D==='true',checks=[];
for(const path of ['/control/space-pilot','/control/space-pilot-legacy','/display/space-pilot','/control/space-pilot-3d-prototype','/display/space-pilot-3d-prototype']){
 const response=await fetch('http://127.0.0.1:3105'+path),body=await response.text();
 const result={path,status:response.status,notFound:body.includes('NEXT_HTTP_ERROR_FALLBACK;404'),newControl:body.includes('SpacePilot3DControl'),newDisplay:body.includes('SpacePilot3DSessionDisplay'),legacyControl:body.includes('SpacePilotControlScreen')};
 if(path.endsWith('-3d-prototype')){assert(result.notFound||result.status===404);assert(!result.newControl&&!result.newDisplay);}
 else if(path==='/display/space-pilot'){assert.equal(result.status,enabled?200:404);assert.equal(result.newDisplay,enabled);}
 else if(path==='/control/space-pilot'){assert.equal(result.newControl,enabled);assert.equal(result.legacyControl,!enabled);assert.equal(result.status,200);}
 else {assert.equal(result.status,200);assert(result.legacyControl);assert(!result.newControl);}
 checks.push(result);
}
writeFileSync(`docs/spacepilot3d/validation/rc-production-${enabled?'enabled':'default'}.json`,JSON.stringify(checks,null,2));console.log(checks);
