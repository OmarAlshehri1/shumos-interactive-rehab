// Long-session stability and resource cleanup: cycles through the stages (every stage change rebuilds the scene), samples
// GPU resource counts, JS heap, fps, long main-thread tasks and the shared-record write rate. Emulators only.
import { launch, login, openIpad, selectPatient, sleep, until, rd } from "./crosslib.mjs";
import { seed } from "./seed.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const [out, BASE = "http://127.0.0.1:3417", SECONDS = "240"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
await seed();
const A = await launch(`${out}/ipad`, 9961), B = await launch(`${out}/laptop`, 9962);
const cd = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=foot-control]')?.dataset ?? null)`).then(JSON.parse);
const samples = [];
try {
  const display = await B.open(`${BASE}/display`, 1920, 1080);
  const ctl = await openIpad(A, `${BASE}/control`);
  await login(ctl); await selectPatient(ctl); await sleep(3000);
  await ctl.eval(`location.href='/control/follow-the-footsteps'`);
  await until(() => ctl.eval(`!!document.querySelector('[data-testid=foot-control]')`), 90000, 500);
  await until(() => display.eval(`!!document.querySelector('canvas')`), 60000, 500);
  await display.eval(`window.__long = []; try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true }); } catch {}`);
  await sleep(2000);
  const rev0 = (await rd("liveSession/revision")) ?? 0, t0 = Date.now();
  let next = 0, confirms = 0, rebuilds = 0, lastStage = -1;
  while ((Date.now() - t0) / 1000 < Number(SECONDS)) {
    const c = await cd(ctl);
    if (c.stage !== String(lastStage)) { lastStage = Number(c.stage); rebuilds++; }
    if (c.status === "ready") await ctl.tapText("ابدأ المرحلة");
    else if (c.status === "paused" && c.rest === "1") await ctl.tapText("متابعة بعد الراحة");
    else if (c.status === "running" && c.phase === "preview") await ctl.tapText("ابدأ الخطوات الآن");
    else if (c.status === "running") { await ctl.tapSel("[data-testid=confirm]"); confirms++; }
    else if (c.status === "stage-complete") await ctl.tapText(c.stage === "8" ? "إعادة البدء" : "المرحلة التالية");
    else if (c.status === "ended") await ctl.tapText("إعادة البدء");
    if ((Date.now() - t0) / 1000 >= next) {
      next += 20;
      const m = JSON.parse((await display.eval(`document.querySelector('canvas')?.dataset.metrics ?? 'null'`)) ?? "null");
      const heap = await display.eval(`performance.memory ? performance.memory.usedJSHeapSize : null`);
      const long = await display.eval(`window.__long.slice()`);
      samples.push({ t: Math.round((Date.now() - t0) / 1000), fps: m?.fps, calls: m?.calls, triangles: m?.triangles, geometries: m?.geometries, textures: m?.textures, heapMB: heap ? +(heap / 1048576).toFixed(1) : null, longTasks: long.length, maxLongMs: Math.max(0, ...long) });
      console.log(JSON.stringify(samples.at(-1)));
    }
    await sleep(1500);
  }
  const writes = ((await rd("liveSession/revision")) ?? 0) - rev0, secs = (Date.now() - t0) / 1000;
  const res = { seconds: Math.round(secs), confirms, stageRebuilds: rebuilds, writes, writesPerSec: +(writes / secs).toFixed(2), samples };
  writeFileSync(`${out}/soak.json`, JSON.stringify(res, null, 1));
  console.log("RESULT", JSON.stringify({ ...res, samples: undefined }));
} finally { A.close(); B.close(); }
process.exit(0);
