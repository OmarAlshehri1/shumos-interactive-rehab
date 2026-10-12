// Place the preview runner at specific spots of a stage and capture real screenshots.
import { launch, sleep } from "./cdplib.mjs";
const [out, stage, ...spots] = process.argv.slice(2);
const b = await launch(out, 9557);
const t = await b.open(`http://127.0.0.1:3210/display/runner-quest-3d-prototype?preview=1&stage=${stage}&quality=high&auto=0`);
await sleep(5000);
await t.eval(`(() => { const rt = window.__RQ3D_RT; rt.command({type:'start'}); return rt.session.lifecycle; })()`);
for (const sp of spots) {
  // "name:distanceBeforeEncounterIndex:lane"  e.g. a:e0:-1  (distance = encounter z - offset)
  const [name, enc, off, lane] = sp.split(":");
  await t.eval(`(() => { const rt = window.__RQ3D_RT; const st = rt.session.stage; const e = '${enc}'==='END' ? {z: st.length} : st.encounters.find(x=>x.id==='${enc}'); st.distance = e.z - ${off}; st.lane = ${lane}; st.speed = 0; st.holding=false; for (let i=0;i<st.encounters.length;i++){ if(st.encounters[i].z < st.distance) st.obstacles[i].resolved = true; } for(let i=0;i<20;i++) rt.session.revision++; rt.tick(); return 1; })()`);
  await sleep(1500);
  await t.shot(`${out}/${name}.png`);
}
console.log(await t.eval("JSON.stringify(window.__RQ3D?.stats())"));
b.close();
