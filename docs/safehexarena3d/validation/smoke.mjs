import { launch, login, openIpad, selectPatient, sleep, until, note, results, rd } from "./crosslib.mjs";
import { seed } from "./seed.mjs";
import { mkdirSync } from "node:fs";
const [out, BASE = "http://127.0.0.1:3417"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
await seed();
const A = await launch(`${out}/ipad`, 9811), B = await launch(`${out}/laptop`, 9812);
try {
  const display = await B.open(`${BASE}/display`, 1920, 1080);
  const ctl = await openIpad(A, `${BASE}/control`);
  await login(ctl); await selectPatient(ctl);
  await sleep(4000);
  await ctl.shot(`${out}/library.png`);
  const card = await ctl.eval(`[...document.querySelectorAll('a,button')].some(e => e.textContent.includes('الأرض الآمنة'))`);
  note("library shows the Safe Hex Arena card", card);
  await ctl.eval(`location.href='/control/safe-hex-arena-3d'`);
  const ok = await until(() => ctl.eval(`!!document.querySelector('[data-testid=hex-control]')`), 90000, 500);
  note("control screen renders", ok);
  const shown = await until(() => display.eval(`!!document.querySelector('[data-testid=hex-display]')`), 60000, 500);
  note("display renders the arena from the shared record", shown, JSON.stringify(await rd("liveSession/gameId")));
  await sleep(2500);
  await ctl.shot(`${out}/control-ready.png`); await display.shot(`${out}/display-ready.png`);
  console.log("display data:", await display.eval(`JSON.stringify(document.querySelector('[data-testid=hex-display]')?.dataset)`));
  console.log("metrics:", await display.eval(`document.querySelector('canvas')?.dataset.metrics`));
  console.log("console errors:", JSON.stringify([...(ctl.events ?? []), ...(display.events ?? [])].filter(e => e.method === "Runtime.exceptionThrown").map(e => e.params.exceptionDetails.exception?.description?.slice(0, 300))));
} finally { A.close(); B.close(); }
console.log(`${results.filter(r => r.ok).length}/${results.length}`);
process.exit(0);
