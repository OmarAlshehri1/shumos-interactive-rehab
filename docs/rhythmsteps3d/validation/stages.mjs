// Quick re-run of the nine-stage touch playthrough only (emulators only). usage: node stages.mjs <outDir> [firstStage 0..8]
import { launch, login, openIpad, selectPatient, sleep, until, note, results } from "./crosslib.mjs";
import { seed } from "./seed.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const [out, first = "0", BASE = "http://127.0.0.1:3621"] = process.argv.slice(2);
mkdirSync(`${out}/shots`, { recursive: true });
await seed();
const PROFILE = process.env.RS_PROFILE ?? "/tmp/rs-e2e";
const A = await launch(`${PROFILE}/ipad`, 9871), B = await launch(`${PROFILE}/laptop`, 9872);
const ctlData = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=rs-control]')?.dataset ?? null)`).then((v) => JSON.parse(v));
const dispData = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=rs-display]')?.dataset ?? null)`).then((v) => JSON.parse(v));
const logs = (...tabs) => tabs.flatMap((t) => (t.events ?? []).filter((e) => e.method === "Runtime.consoleAPICalled" && ["warning", "error"].includes(e.params.type)).map((e) => e.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 160)));
const openAll = (t) => t.eval(`document.querySelectorAll('details').forEach((d) => (d.open = true))`);
let ctl, display;
try {
  display = await B.open(`${BASE}/display`, 1920, 1080);
  ctl = await openIpad(A, `${BASE}/control`);
  await login(ctl); await selectPatient(ctl); await sleep(3000);
  await ctl.eval(`location.href='/control/rhythm-steps-3d'`);
  await until(() => ctl.eval(`!!document.querySelector('[data-testid=rs-control]')`), 90000, 500);
  await until(() => display.eval(`!!document.querySelector('[data-testid=rs-display]')`), 60000, 500);
  await sleep(2500); await openAll(ctl);
  await ctl.select("rs-flow", "assisted"); await ctl.select("rs-hold", "1000"); await ctl.select("rs-speed", "active");
  if (first !== "0") await ctl.select("rs-stage", first);
  for (let stage = Number(first); stage < 9; stage++) {
    if ((await ctlData(ctl)).status === "ready") await ctl.tapSel("[data-testid=rs-start]");
    await until(async () => (await ctlData(ctl)).status === "running" && (await dispData(display))?.status === "running", 20000, 100);
    const t0 = Date.now(); let done = false, pauses = 0; const perf = []; let lastPerf = 0;
    while (Date.now() - t0 < 150000) {
      if (Date.now() - lastPerf > 2000) { lastPerf = Date.now(); const m = await display.eval(`document.querySelector('canvas')?.dataset.metrics ?? null`); if (m) perf.push(JSON.parse(m)); }
      const d = await ctlData(ctl);
      if (d.status === "stage-complete") { done = true; break; }
      if (d.status === "paused") { pauses++; await ctl.tapSel("[data-testid=rs-resume]"); await sleep(500); continue; }
      const info = JSON.parse(await ctl.eval(`JSON.stringify({ id: document.querySelector('[data-testid=rs-current]')?.dataset.current ?? '', kind: document.querySelector('[data-testid=rs-current]')?.dataset.kind ?? '', holding: document.querySelector('[data-testid=rs-current]')?.dataset.holding ?? '' })`));
      if (info.id) { if (info.kind === "hold") { if (info.holding === "0") await ctl.tapSel("[data-testid=rs-hold-start]"); } else await ctl.tapSel("[data-testid=rs-confirm]"); }
      await sleep(180);
    }
    const fps = perf.map((p) => p.fps).sort((a, b) => a - b);
    note(`Stage ${stage + 1} completes`, done, `pauses ${pauses}, ${Math.round((Date.now() - t0) / 1000)} s, fps min ${fps[0]} median ${fps[fps.length >> 1]}, cpu frame ms ${Math.max(...perf.map((p) => p.frameMs))}, draw calls ${perf.at(-1)?.calls}, tris ${perf.at(-1)?.triangles}`);
    if (stage === 8) break;
    await ctl.tapSel("[data-testid=rs-next]");
    await until(async () => (await ctlData(ctl)).stage === String(stage + 1) && (await ctlData(ctl)).status === "ready", 10000, 100);
  }
  console.log("console warnings:", logs(ctl, display).slice(0, 8));
} catch (e) {
  note("script completed without throwing", false, String(e?.stack ?? e).slice(0, 400));
} finally {
  writeFileSync(`${out}/stages-results.json`, JSON.stringify(results, null, 2));
  A.close(); B.close(); process.exit(0);
}
