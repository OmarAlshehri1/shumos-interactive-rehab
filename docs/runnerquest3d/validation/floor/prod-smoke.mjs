// Production-build smoke (no development hooks): FLOOR then WALL, driven only through the visible Control UI + Display DOM attributes.
//   node prod-smoke.mjs <outDir>   (RQ_BASE points at `next start`)
import { mkdirSync, writeFileSync } from "node:fs";
import { BASE, launch, login, note, openIpad, rd, results, seed, selectPatient, sleep, until } from "./lib.mjs";
const [out] = process.argv.slice(2);
mkdirSync(`${out}/results`, { recursive: true });
await seed();
const A = await launch(`${out}/ipad`, 9840), B = await launch(`${out}/laptop`, 9841);
const display = await B.open(`${BASE}/display`, 1920, 1080);
const control = await openIpad(A, `${BASE}/control/runner-quest-3d`);
await login(control); await selectPatient(control);
const dData = (k) => display.eval(`document.querySelector('[data-testid=rq3d-display]')?.dataset['${k}'] ?? null`);
note("production build exposes no development hook", (await control.eval(`typeof window.__RQ3D_RT`)) === "undefined" && (await display.eval(`typeof window.__RQ3F`)) === "undefined");
await control.tap("projection-FLOOR"); await sleep(1000);
note("Display shows FLOOR", await until(async () => (await dData("projection")) === "FLOOR", 8000));
await control.tapThen("range-single", "true"); await control.tapThen("stage-0", "!!document.querySelector('[data-testid=floor-map]')||true");
await control.tapThen("start", "document.querySelector('[data-testid=floor-map]') && !document.querySelector('[data-testid=floor-region-1]').disabled");
let n = 0;
for (let g = 0; g < 40; g++) {
  const tgt = await control.eval(`(() => { const t = document.querySelector('[data-testid^=floor-region-][data-target="1"]'); return t ? t.dataset.testid : (document.querySelector('[data-testid=floor-step]') && !document.querySelector('[data-testid=floor-step]').disabled ? 'floor-step' : null); })()`);
  if (!tgt) break;
  await control.tap(tgt); n++; await sleep(550);
}
note("FLOOR stage 1 completed by touch in the production build", await until(async () => (await dData("lifecycle")) === "completed", 8000), `${n} confirmations`);
await display.shot(`${out}/prod-floor-complete.png`);
await sleep(2500);
await control.tap("end"); await sleep(1000);
await control.eval(`(() => { const s = document.querySelector('section[aria-labelledby=end-session-reason-title]'); const b = s && [...s.querySelectorAll('button')].pop(); b && b.click(); })()`); await sleep(3000);
const recs = Object.values((await rd("sessions/patient-1")) ?? {}).filter((r) => r.gameId === "runner-quest-3d");
note("production history record saved (v2, FLOOR rows)", recs.length === 1 && recs[0].resultVersion === 2 && Object.values(recs[0].stageResults).every((r) => r.projection === "FLOOR"));
writeFileSync(`${out}/results/prod-smoke.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} passed`);
A.close(); B.close();
process.exit(failed.length ? 1 : 0);
