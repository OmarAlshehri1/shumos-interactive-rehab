// Long-session stability: automatic warning cycles for N seconds; samples GPU resource counts, JS heap, fps, write rate.
import { launch, login, openIpad, selectPatient, sleep, until, rd } from "./crosslib.mjs";
import { seed } from "./seed.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const [out, BASE = "http://127.0.0.1:3417", SECONDS = "240"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
await seed();
const A = await launch(`${out}/ipad`, 9841), B = await launch(`${out}/laptop`, 9842);
const samples = [];
try {
  const display = await B.open(`${BASE}/display`, 1920, 1080);
  const ctl = await openIpad(A, `${BASE}/control`);
  await login(ctl); await selectPatient(ctl); await sleep(3000);
  await ctl.eval(`location.href='/control/safe-hex-arena-3d'`);
  await until(() => ctl.eval(`!!document.querySelector('[data-testid=hex-control]')`), 90000, 500);
  await until(() => display.eval(`!!document.querySelector('[data-testid=hex-display]')`), 60000, 500);
  await sleep(1500);
  await ctl.tapText("ابدأ المرحلة");
  const rev0 = (await rd("liveSession/revision")) ?? 0, t0 = Date.now();
  let cycles = 0, next = 0;
  while ((Date.now() - t0) / 1000 < Number(SECONDS)) {
    const ph = await ctl.eval(`document.querySelector('[data-testid=hex-control]')?.dataset.phase`);
    if (ph === "inactive") { await ctl.tapText("أعد الجولة"); cycles++; }
    if ((Date.now() - t0) / 1000 >= next) {
      next += 30;
      const m = JSON.parse(await display.eval(`document.querySelector('canvas')?.dataset.metrics ?? 'null'`) ?? "null");
      const heap = await display.eval(`performance.memory ? performance.memory.usedJSHeapSize : null`);
      samples.push({ t: Math.round((Date.now() - t0) / 1000), fps: m?.fps, geometries: m?.geometries, textures: m?.textures, calls: m?.calls, heapMB: heap ? +(heap / 1048576).toFixed(1) : null });
      console.log(JSON.stringify(samples.at(-1)));
    }
    await sleep(700);
  }
  const writes = ((await rd("liveSession/revision")) ?? 0) - rev0, secs = (Date.now() - t0) / 1000;
  const res = { seconds: Math.round(secs), cycles, writes, writesPerSec: +(writes / secs).toFixed(2), samples };
  writeFileSync(`${out}/soak.json`, JSON.stringify(res, null, 1));
  console.log("RESULT", JSON.stringify({ ...res, samples: undefined }));
} finally { A.close(); B.close(); }
process.exit(0);
