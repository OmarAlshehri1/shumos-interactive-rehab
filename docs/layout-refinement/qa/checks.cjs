/* Enable existing release switches only in this child test process. No engine or rollout policy changes. */
const {spawnSync}=require('node:child_process');const fs=require('node:fs');
const env={...process.env};
for(const dir of fs.readdirSync('lib'))for(const name of ['registration.ts','availability.ts','releasePolicy.ts']){const path=`lib/${dir}/${name}`;if(fs.existsSync(path))for(const flag of fs.readFileSync(path,'utf8').match(/NEXT_PUBLIC_[A-Z0-9_]+/g)||[])env[flag]='true';}
env.NEXT_PUBLIC_RUNNER_QUEST_3D='1';
const args=['run','lib/control/__tests__/patientPagination.test.ts','components/control/library/__tests__','components/control/nav/__tests__','components/control/patients/__tests__','components/control/setup/__tests__/progressive.test.tsx','components/control/youtube/VideoPreview.test.tsx','lib/analytics/__tests__/patientAnalytics.test.ts','components/control/visits/__tests__/visitPresentation.test.tsx'];
const result=spawnSync('node_modules/.bin/vitest',args,{env,stdio:'inherit'});process.exit(result.status??1);
