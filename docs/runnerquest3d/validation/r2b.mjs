// R2 stills with the runner frozen (paused) at exact points: hop peak, marker, celebration at the destination.
import { launch, sleep } from "./cdplib.mjs";
const out = process.argv[2];
const b = await launch(out, 9571);
const open = async (stage) => { const t = await b.open(`http://127.0.0.1:3210/display/runner-quest-3d-prototype?preview=1&stage=${stage}&auto=0`); await sleep(4500); await t.eval(`window.__RQ3D_RT.command({type:'start'})`); return t; };
let t = await open(3);
await t.eval(`(() => { const rt = window.__RQ3D_RT, st = rt.session.stage, e = st.encounters[0]; st.distance = e.z - 0.15; st.obstacles[0].armed = true; st.lane = 0; st.speed = 0; rt.session.revision++; rt.tick = () => {}; })()`);
await sleep(1200); await t.shot(`${out}/r2-hop-peak.png`);
await t.eval("location.href='about:blank'");
t = await open(6);
await t.eval(`(() => { const st = window.__RQ3D_RT.session.stage; const e = st.encounters.find(x => x.kind === 'marker'); st.distance = e.z - 12; st.lane = e.target === 0 ? -1 : 0; for (let i = 0; i < st.encounters.length; i++) if (st.encounters[i].z < st.distance) st.obstacles[i].resolved = true; st.speed = 0; window.__RQ3D_RT.session.revision++; window.__RQ3D_RT.tick = () => {}; return e.target; })()`);
await sleep(1200); await t.shot(`${out}/r2-marker.png`);
await t.eval("location.href='about:blank'");
t = await open(8);
await t.eval(`(() => { const rt = window.__RQ3D_RT, st = rt.session.stage; st.distance = st.length - 6; st.speed = 0; for (let i = 0; i < st.encounters.length; i++) st.obstacles[i].resolved = true; st.speed = 0; rt.session.revision++; rt.tick = () => {}; })()`);
await sleep(1200); await t.shot(`${out}/r2-finale-destination.png`);
b.close();
