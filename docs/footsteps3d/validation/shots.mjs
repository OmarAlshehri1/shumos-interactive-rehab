// Quick visual capture of the Enchanted Forest on the Display for chosen stages (emulators only).
import { launch, login, openIpad, selectPatient, sleep, until } from "./crosslib.mjs";
import { seed } from "./seed.mjs";
import { mkdirSync } from "node:fs";
const [out, BASE = "http://127.0.0.1:3417", stagesArg = "0,3,6"] = process.argv.slice(2);
const stages = stagesArg.split(",").map(Number);
mkdirSync(`${out}/shots`, { recursive: true });
await seed();
let ctl, display;
const A = await launch(`${out}/ipad`, 9881), B = await launch(`${out}/laptop`, 9882);
const cd = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=foot-control]')?.dataset ?? null)`).then(JSON.parse);
const setSelect = (t, id, v) => t.eval(`(() => { const e = document.getElementById(${JSON.stringify(id)}); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e, ${JSON.stringify(v)}); e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
try {
  display = await B.open(`${BASE}/display`, 1920, 1080);
  ctl = await openIpad(A, `${BASE}/control`);
  await login(ctl); await selectPatient(ctl); await sleep(3000);
  await ctl.eval(`location.href='/control/follow-the-footsteps'`);
  await until(() => ctl.eval(`!!document.querySelector('[data-testid=foot-control]')`), 90000, 500);
  await until(() => display.eval(`!!document.querySelector('[data-testid=foot-display]')`), 60000, 500);
  await sleep(2500);
  console.log("display text", (await display.eval(`document.body.innerText.slice(0,160)`)).replace(/\s+/g,' '), JSON.stringify(display.events.filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error').map((e) => JSON.stringify(e.params.args.map((a) => a.description || a.value)).slice(0, 300))));
  console.log("metrics", await display.eval(`document.querySelector('canvas')?.dataset.metrics ?? null`));
  for (const st of stages) {
    await setSelect(ctl, "stage", String(st)); await sleep(800);
    await ctl.tapText("ابدأ المرحلة");
    await until(async () => (await cd(ctl)).status === "running", 15000, 150);
    await sleep(3500);
    await display.shot(`${out}/shots/display-stage${st + 1}-target.png`);
    await ctl.shot(`${out}/shots/control-stage${st + 1}.png`);
    await ctl.tapSel("[data-testid=confirm]");
    await sleep(450); await display.shot(`${out}/shots/display-stage${st + 1}-success-a.png`);
    await sleep(700); await display.shot(`${out}/shots/display-stage${st + 1}-success-b.png`);
    await sleep(1200);
    await ctl.tapText("تجاوز المرحلة"); await until(async () => (await cd(ctl)).status === "stage-complete", 15000, 150);
    console.log("stage", st + 1, await display.eval(`document.querySelector('canvas')?.dataset.metrics ?? null`));
  }
  console.log("errors", JSON.stringify([...(ctl.events ?? []), ...(display.events ?? [])].filter((e) => e.method === "Runtime.exceptionThrown").map((e) => e.params.exceptionDetails.exception?.description?.slice(0, 300))));
  console.log("console errors", JSON.stringify(display.events.filter((e) => e.method === "Runtime.consoleAPICalled" && e.params.type === "error").map((e) => JSON.stringify(e.params.args.map((a) => a.description || a.value)).slice(0, 400))));
} catch (e) {
  console.log('FAILED', String(e).slice(0, 200));
  console.log('control text:', await (typeof ctl !== 'undefined' ? ctl.eval('document.body.innerText.slice(0,200)') : null).catch?.(() => null));
} finally { A.close(); B.close(); }
process.exit(0);
