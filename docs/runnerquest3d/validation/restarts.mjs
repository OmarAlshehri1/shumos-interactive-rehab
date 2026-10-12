// Repeated stage transitions / restarts / new runs: GPU resource counts and heap must plateau.
import { launch, sleep } from "./cdplib.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
const out = process.argv[2];
mkdirSync(`${out}/results`, { recursive: true });
const b = await launch(out, 9567, ["--js-flags=--expose-gc", "--enable-precise-memory-info"]);
const display = await b.open("http://127.0.0.1:3210/display/runner-quest-3d-prototype?auto=0&quality=medium", 1600, 900);
const control = await b.open("http://127.0.0.1:3210/control/runner-quest-3d-prototype", 1400, 900);
await sleep(7000);
const rt = (js) => control.eval(`(() => { const rt = window.__RQ3D_RT; ${js} })()`);
const samples = [];
const sample = async (label) => { const s = await display.eval(`(gc(), { own: window.__RQ3D.counts(), gpu: (({geometries, textures}) => ({geometries, textures}))(window.__RQ3D.stats()), heap: performance.memory.usedJSHeapSize })`); samples.push({ label, ...s }); };
await rt(`rt.command({type:'settings', patch:{speed:4.5}}); return 1`);
await control.bringToFront();
for (let run = 0; run < 4; run++) {
  await rt(`rt.command({type:'range', from:0, to:8}); return 1`);
  for (let st = 0; st < 9; st++) {
    await control.click("start"); await sleep(250);
    await rt(`rt.command({type:'restart'}); return 1`); await sleep(120);
    await control.click("start"); await sleep(250);
    await rt(`rt.command({type:'skip'}); return 1`); await sleep(500);
    if (st < 8) { await control.click("advance"); await sleep(450); }
    if (st === 8) await sample(`run${run}-end`);
  }
}
const a = samples[0], z = samples[samples.length - 1];
const res = { transitions: 4 * 9, restarts: 4 * 9, samples, first: a, last: z, heapGrowthMB: (z.heap - a.heap) / 1e6 };
writeFileSync(`${out}/results/restarts.json`, JSON.stringify(res, null, 1));
console.log(JSON.stringify({ transitions: res.transitions, first: { own: a.own, gpu: a.gpu, heapMB: a.heap / 1e6 }, last: { own: z.own, gpu: z.gpu, heapMB: z.heap / 1e6 }, errors: display.events.filter((e) => e.method === "Runtime.exceptionThrown").length }));
b.close();
