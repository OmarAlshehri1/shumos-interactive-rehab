// Quality presets (same camera position) + reduced motion, real Chrome. Records scene stats per preset.
import { launch, sleep } from "./cdplib.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
const out = process.argv[2];
mkdirSync(`${out}/results`, { recursive: true });
const b = await launch(out, 9569);
const stats = {};
for (const [name, q, extra] of [["high", "high", ""], ["medium", "medium", ""], ["low", "low", ""], ["reduced-motion", "high", "&reduced=1"]]) {
  const t = await b.open(`http://127.0.0.1:3210/display/runner-quest-3d-prototype?preview=1&stage=7&quality=${q}&auto=0&diag=1${extra}`, 1600, 900);
  await sleep(4500);
  await t.eval(`(() => { const rt = window.__RQ3D_RT; rt.command({type:'start'}); const st = rt.session.stage; const e = st.encounters.find(x => x.kind === 'hurdle'); st.distance = e.z - 13; st.lane = 0; st.speed = 0; for (let i = 0; i < st.encounters.length; i++) if (st.encounters[i].z < st.distance) st.obstacles[i].resolved = true; rt.session.revision++; })()`);
  await sleep(2500);
  await t.shot(`${out}/r5-quality-${name}.png`);
  stats[name] = await t.eval(`window.__RQ3D.stats()`);
  await fetch(`http://127.0.0.1:9569/json/close/${t.targetId}`); await sleep(500);
}
writeFileSync(`${out}/results/quality-presets.json`, JSON.stringify(stats, null, 1));
console.log(JSON.stringify(Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, { fps: +v.fps.toFixed(1), calls: v.drawCalls, tris: v.triangles, dpr: v.pixelRatio, shadows: v.shadows }]))));
b.close();
