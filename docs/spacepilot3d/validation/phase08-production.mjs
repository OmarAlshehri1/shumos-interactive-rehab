import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const checks=[];
for(const section of ['display','control']){
 const response=await fetch(`http://127.0.0.1:3105/${section}/space-pilot-3d-prototype`);
 const body=await response.text();
 const result={section,status:response.status,streamedNotFound:body.includes('NEXT_HTTP_ERROR_FALLBACK;404'),experimentalComponentPresent:body.includes('SpacePilot3DControl')||body.includes('SpacePilot3DSessionDisplay'),startLabelPresent:body.includes('بدء الجلسة')};
 assert.equal(result.experimentalComponentPresent,false);assert.equal(result.startLabelPresent,false);
 if(section==='display')assert.equal(response.status,404);else assert(result.streamedNotFound||response.status===404);
 checks.push(result);
}
writeFileSync('docs/spacepilot3d/validation/phase08-production.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks,null,2));
