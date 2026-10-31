/* Enable existing release switches only in this child test process. No engine or rollout policy changes. */
const {spawnSync}=require('node:child_process');const fs=require('node:fs');
const env={...process.env};
for(const dir of fs.readdirSync('lib'))for(const name of ['registration.ts','availability.ts','releasePolicy.ts']){const path=`lib/${dir}/${name}`;if(fs.existsSync(path))for(const flag of fs.readFileSync(path,'utf8').match(/NEXT_PUBLIC_[A-Z0-9_]+/g)||[])env[flag]='true';}
env.NEXT_PUBLIC_RUNNER_QUEST_3D='1';
const args=['run','lib/realtime/__tests__/staffAuthClient.test.ts','components/control/nav/__tests__','components/control/setup/__tests__','components/control/ui/__tests__','components/control/visits/__tests__','components/control/library/__tests__','components/control/home/__tests__','components/control/patients/__tests__','lib/therapyVisits/__tests__/clinicalSummary.test.ts','lib/therapyVisits/__tests__/repository.test.ts','lib/therapyVisits/__tests__/numbering.test.ts','lib/games/__tests__/finalIntegration.test.ts','lib/control/__tests__/workspacePresentation.test.ts','lib/control/__tests__/audioRequest.test.ts'];
const result=spawnSync('node_modules/.bin/vitest',args,{env,stdio:'inherit'});process.exit(result.status??1);
