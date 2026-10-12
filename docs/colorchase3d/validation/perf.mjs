// Performance + resource-cleanup sampling of the Display on a software-GL headless Chrome (NOT a projector or iPad measurement).
// Usage: node perf.mjs <outDir> <baseUrl> [seconds] [quality]
import { launch, login, openIpad, selectPatient, sleep, until, note, results } from "../../footsteps3d/validation/crosslib.mjs";
import { seed } from "../../footsteps3d/validation/seed.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const [out, BASE, SECONDS = "90", Q = "high"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
await seed();
const A = await launch(`${out}/ipad`, 9981), B = await launch(`${out}/laptop`, 9982);
const samples = [];
try {
  const display = await B.open(`${BASE}/display`, 1920, 1080);
  const ctl = await openIpad(A, `${BASE}/control`);
  await login(ctl); await selectPatient(ctl); await sleep(3000);
  await ctl.eval(`location.href='/control/color-chase'`);
  await until(() => ctl.eval(`!!document.querySelector('[data-testid=cc-control]')`), 90000, 500);
  await until(() => display.eval(`!!document.querySelector('canvas')?.dataset.metrics`), 60000, 500);
  await ctl.eval(`(() => { const e = document.querySelector('[data-testid=quality]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e, ${JSON.stringify(Q)}); e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await ctl.tapSel("[data-testid=start]");
  const rev0 = await (await fetch(`http://127.0.0.1:${process.env.HEX_DB_PORT ?? 19400}/liveSession/revision.json?ns=demo-hex-default-rtdb`, { headers: { Authorization: "Bearer owner" } })).json();
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < Number(SECONDS)) {
    await sleep(4000);
    const t = await ctl.eval(`document.querySelector('[data-testid=cc-control]').dataset.target`);
    const st = await ctl.eval(`document.querySelector('[data-testid=cc-control]').dataset.status`);
    if (st === "running" && t) { await ctl.tapSel(`[data-testid=zone-${t}]`); await ctl.tapSel("[data-testid=confirm]"); }
    else if (st === "stage-complete") await ctl.tapSel("[data-testid=next]");
    else if (st === "ready") await ctl.tapSel("[data-testid=start]");
    const m = JSON.parse(await display.eval(`document.querySelector('canvas')?.dataset.metrics ?? 'null'`) ?? "null");
    const heap = await display.eval(`performance.memory ? performance.memory.usedJSHeapSize : 0`);
    if (m) samples.push({ t: Math.round((Date.now() - t0) / 1000), fps: m.fps, calls: m.calls, triangles: m.triangles, geometries: m.geometries, textures: m.textures, heapMB: Math.round(heap / 1048576) });
  }
  const rev1 = await (await fetch(`http://127.0.0.1:${process.env.HEX_DB_PORT ?? 19400}/liveSession/revision.json?ns=demo-hex-default-rtdb`, { headers: { Authorization: "Bearer owner" } })).json();
  const mean = (k) => samples.reduce((a, s) => a + s[k], 0) / samples.length;
  const first = samples.slice(0, 3), last = samples.slice(-3);
  const avg = (a, k) => a.reduce((x, s) => x + s[k], 0) / a.length;
  note(`render metrics sampled for ${SECONDS}s at quality ${Q}`, samples.length > 5, `fps mean ${mean("fps").toFixed(1)}, draw calls ${samples.at(-1).calls}, triangles ${samples.at(-1).triangles}, geometries ${samples.at(-1).geometries}, textures ${samples.at(-1).textures}`);
  note("JS heap stable (last samples within 25% + 8 MB of the first)", avg(last, "heapMB") <= avg(first, "heapMB") * 1.25 + 8, `${avg(first, "heapMB").toFixed(0)} MB -> ${avg(last, "heapMB").toFixed(0)} MB`);
  note("GPU resources stable across stage changes (geometries and textures never grow without bound)", samples.at(-1).geometries <= Math.max(...samples.slice(0, 5).map((s) => s.geometries)) * 1.6 && samples.at(-1).textures <= 40, `geometries ${samples.at(0).geometries} -> ${samples.at(-1).geometries}, textures ${samples.at(0).textures} -> ${samples.at(-1).textures}`);
  note("Firebase write frequency (shared record)", true, `${rev1 - rev0} writes in ${SECONDS}s = ${((rev1 - rev0) / Number(SECONDS)).toFixed(2)}/s (heartbeat + one per accepted action)`);
  writeFileSync(`${out}/perf-${Q}.json`, JSON.stringify({ samples, results }, null, 1));
} finally { A.close(); B.close(); }
process.exit(0);
