// R2 evidence: hop animation frames, success feedback, marker/gate/checkpoint visuals in real Chrome.
import { launch, sleep } from "./cdplib.mjs";
const out = process.argv[2];
const b = await launch(out, 9561);
async function open(stage) {
  const t = await b.open(`http://127.0.0.1:3210/display/runner-quest-3d-prototype?preview=1&stage=${stage}&auto=0`);
  await sleep(4500);
  await t.eval(`window.__RQ3D_RT.command({type:'start'})`);
  return t;
}
const place = (t, id, off, lane = 0) => t.eval(`(() => { const rt = window.__RQ3D_RT, st = rt.session.stage; const e = st.encounters.find(x => x.id === '${id}'); st.distance = e.z - ${off}; st.lane = ${lane}; st.speed = 3; for (let i = 0; i < st.encounters.length; i++) if (st.encounters[i].z < st.distance) st.obstacles[i].resolved = true; rt.session.revision++; return e.kind; })()`);
// 1) hop frames (medium stage 1)
let t = await open(3);
await place(t, "e0", 6);
await t.eval(`window.__RQ3D_RT.key(' ')`);
await sleep(1350);
for (let i = 0; i < 4; i++) { await t.shot(`${out}/r2-hop-${i}.png`); await sleep(120); }
console.log("hop outcome:", await t.eval(`window.__RQ3D_RT.session.stage.obstacles[0].how + ' stars=' + window.__RQ3D_RT.session.stage.stars`));
await t.eval("location.href='about:blank'");
// 2) checkpoint toast + celebration (easy stage 1)
t = await open(0);
await t.eval(`(() => { const rt = window.__RQ3D_RT, st = rt.session.stage; const c = st.encounters.find(x => x.kind === 'checkpoint'); st.distance = c.z - 2.5; st.speed = 3; for (let i = 0; i < st.encounters.length; i++) if (st.encounters[i].z < st.distance && st.encounters[i].kind !== 'checkpoint') st.obstacles[i].resolved = true; st.lane = 0; rt.session.revision++; })()`);
await sleep(1500);
await t.shot(`${out}/r2-checkpoint-0.png`); await sleep(350); await t.shot(`${out}/r2-checkpoint-1.png`);
await t.eval("location.href='about:blank'");
// 3) marker (advanced stage 1) and sunset hurdle (medium stage 3)
t = await open(6);
const kinds = await t.eval(`window.__RQ3D_RT.session.stage.encounters.map(e => e.id + ':' + e.kind).join(',')`);
console.log(kinds);
const marker = kinds.split(",").find((k) => k.endsWith(":marker"))?.split(":")[0];
const mk = await t.eval(`window.__RQ3D_RT.session.stage.encounters.find(e => e.id === '${marker}').target`);
await place(t, marker, 13, mk === 0 ? -1 : 0);
await t.eval(`window.__RQ3D_RT.session.stage.speed = 0`);
await sleep(900);
await t.shot(`${out}/r2-marker.png`);
b.close();
