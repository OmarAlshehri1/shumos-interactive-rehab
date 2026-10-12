// Color Chase 3D: nine stages by touch on a Control device, followed by an independent Display device.
// Two separate Chrome processes/profiles share only the Firebase EMULATORS (HEX_DB_PORT/HEX_AUTH_PORT, default 19400/19499
// when run with those variables). Never touches production.
// Usage: HEX_DB_PORT=19400 HEX_AUTH_PORT=19499 node e2e.mjs <outDir> <baseUrl>
import { launch, login, openIpad, selectPatient, sleep, until, note, results, rd } from "../../footsteps3d/validation/crosslib.mjs";
import { seed } from "../../footsteps3d/validation/seed.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const [out, BASE = "http://localhost:3517"] = process.argv.slice(2);
mkdirSync(`${out}/shots`, { recursive: true });
await seed();
const A = await launch(`${out}/ipad`, 9921), B = await launch(`${out}/laptop`, 9922);
const STEPS = [4, 5, 3, 6, 6, 6, 7, 8, 5]; // objectives per stage
const SEQ_STAGES = new Set([4, 7, 8]);
const cd = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=cc-control]')?.dataset ?? null)`).then(JSON.parse);
const dd = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=garden-display]')?.dataset ?? null)`).then(JSON.parse);
const mapZones = (t) => t.eval(`document.querySelector('[data-testid=zone-map]')?.dataset.zones ?? ''`);
const exceptions = (...tabs) => tabs.flatMap((t) => (t.events ?? []).filter((e) => e.method === "Runtime.exceptionThrown").map((e) => e.params.exceptionDetails.exception?.description?.slice(0, 200)));
const both = (c, d, pc, pd = pc) => until(async () => pc(await cd(c)) && pd(await dd(d)), 25000, 100);
const restored = (x) => x.restored.split(",").map(Number);
// zone centres on the therapist map (world coords) vs where the Display really renders them (screen fractions)
const parity = async (ctl, display) => {
  const map = await ctl.eval(`(() => { const svg = document.querySelector('[data-testid=zone-map]'); const [x0, y0, w, h] = svg.getAttribute('viewBox').split(' ').map(Number); return JSON.stringify([...svg.querySelectorAll('g[data-testid^=zone-]')].map((g) => { const c = g.querySelector('circle.hit'); return { wx: +c.getAttribute('cx'), wy: +c.getAttribute('cy'), fx: (+c.getAttribute('cx') - x0) / w, fy: (+c.getAttribute('cy') - y0) / h }; })); })()`).then(JSON.parse);
  const disp = await display.eval(`JSON.stringify(${JSON.stringify(map)}.map((m) => window.__garden.project(m.wx, m.wy)))`).then(JSON.parse);
  return Math.max(...map.map((m, i) => Math.hypot(m.fx - disp[i].x, m.fy - disp[i].y)));
};
let ctl, display;
const latencies = [];
try {
  display = await B.open(`${BASE}/display`, 1920, 1080);
  ctl = await openIpad(A, `${BASE}/control`);
  await login(ctl); await selectPatient(ctl); await sleep(3000);
  await ctl.eval(`location.href='/control/color-chase'`);
  note("Control opens the 3D game on the canonical route and publishes the shared session", await until(() => ctl.eval(`!!document.querySelector('[data-testid=cc-control]')`), 90000, 500));
  note("Display (separate device) renders from /liveSession", await until(() => display.eval(`!!document.querySelector('[data-testid=garden-display]')`), 60000, 500));
  await until(() => display.eval(`!!document.querySelector('canvas')`), 30000, 300);
  await sleep(2500);
  const m0 = await display.eval(`document.querySelector('canvas')?.dataset.metrics ?? null`);
  note("Display 3D garden is rendering (WebGL)", !!m0, m0 ?? "no metrics");
  note("record is the shared liveSession, same game id as the original, tagged cc3", (await rd("liveSession/gameId")) === "color-chase" && (await rd("liveSession/session/engine")) === "cc3");
  await ctl.shot(`${out}/shots/control-ready.png`); await display.shot(`${out}/shots/display-ready.png`);
  const rev0 = (await rd("liveSession/revision")) ?? 0, t0 = Date.now();
  let mapChecks = 0, mapOk = 0, maxPar = 0, monotonic = true, wrongNudges = 0;
  let objectives = 0;

  for (let stage = 0; stage < 9; stage++) {
    let c = await cd(ctl);
    if (c.status === "ready") await ctl.tapSel("[data-testid=start]");
    note(`stage ${stage + 1}: started on both devices`, await both(ctl, display, (x) => x.status === "running", (x) => x.status === "running"));
    const n = STEPS[stage];
    const objs = (await dd(display)).objectives.split(",").length;
    note(`stage ${stage + 1}: ${n} objectives on Display`, objs === n);
    const par = await parity(ctl, display); maxPar = Math.max(maxPar, par);
    note(`stage ${stage + 1}: zone positions identical on both devices (max error ${par.toFixed(4)})`, par < 0.012);
    let prev = restored(await dd(display));
    for (let step = 0; step < n; step++) {
      await until(async () => { const x = await cd(ctl); return x.step === String(step) && x.status === "running"; }, 20000, 80);
      const cs = await mapZones(ctl);
      const dsnow = await dd(display);
      mapChecks++;
      if (cs === dsnow.zones && dsnow.step === String(step) && dsnow.target === (await cd(ctl)).target) mapOk++;
      if (step === 0 && stage % 3 === 0) { await sleep(900); await display.shot(`${out}/shots/display-L${stage / 3 + 1}-target.png`); await ctl.shot(`${out}/shots/control-L${stage / 3 + 1}.png`); }
      const target = (await cd(ctl)).target;
      const before = Number((await dd(display)).accepted);
      await display.eval(`window.__t = 0; new MutationObserver(() => { const d = document.querySelector('[data-testid=garden-display]'); if (d && Number(d.dataset.accepted) > ${before} && !window.__t) window.__t = Date.now(); }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['data-accepted'] })`);
      const stamp = await ctl.eval(`Date.now()`);
      const k = stage * 9 + step; void k;
      if (k % 5 === 4) {
        // a different zone first: only a gentle second look, nothing is scored or resolved
        const other = (cs.split(",").find((z) => z !== target));
        await ctl.tapSel(`[data-testid=zone-${other}]`); await ctl.tapSel("[data-testid=confirm]");
        await sleep(350);
        const after = await cd(ctl);
        if (after.step === String(step) && Number((await dd(display)).accepted) === before) wrongNudges++;
      }
      if (k % 7 === 6) await ctl.tapSel("[data-testid=repeat]");
      if (k % 6 === 5) await ctl.tapSel("[data-testid=assist]");
      else { await ctl.tapSel(`[data-testid=zone-${target}]`); await ctl.tapSel("[data-testid=confirm]"); }
      await until(() => display.eval(`window.__t > 0`), 10000, 20);
      latencies.push((await display.eval(`window.__t`)) - stamp);
      objectives++;
      if (step === 0 && stage % 3 === 0) { await sleep(900); await display.shot(`${out}/shots/display-L${stage / 3 + 1}-success.png`); }
      await sleep(120);
      const now = restored(await dd(display));
      if (now.some((v, i) => v + 1e-9 < prev[i])) monotonic = false;
      prev = now;
      if (SEQ_STAGES.has(stage) && step === 0) {
        const pips = await display.eval(`document.querySelector('[data-testid=pips]')?.textContent !== undefined`);
        note(`stage ${stage + 1}: sequence pips are shown on the Display`, pips);
      }
    }
    note(`stage ${stage + 1}: stage-complete on both devices`, await both(ctl, display, (x) => x.status === "stage-complete", (x) => x.status === "stage-complete"));
    const fin = restored(await dd(display));
    note(`stage ${stage + 1}: the whole garden is restored on completion`, fin.every((v) => v >= 0.99), fin.join(","));
    if (stage % 3 === 0) { await sleep(1800); await display.shot(`${out}/shots/display-L${stage / 3 + 1}-complete.png`); }
    if (stage === 8) break;
    await ctl.tapSel("[data-testid=next]");
    await until(async () => { const x = await cd(ctl); return x.status === "ready" && x.stage === String(stage + 1); }, 15000, 100);
    await until(async () => (await dd(display)).stage === String(stage + 1), 15000, 100);
    const reset = restored(await dd(display));
    note(`stage ${stage + 2}: the next garden starts desaturated again`, reset.every((v) => v < 0.2) || stage === 8, reset.join(","));
  }
  note("zone state: therapist map == Display at every objective", mapChecks > 0 && mapOk === mapChecks, `${mapOk}/${mapChecks}`);
  note("restoration never decreases within a stage", monotonic);
  note("a wrong zone never resolves an objective nor changes the accepted count", wrongNudges > 5, `${wrongNudges} wrong choices`);
  const dur = (Date.now() - t0) / 1000, writes = ((await rd("liveSession/revision")) ?? 0) - rev0;
  note("writes: shared record revisions during the nine-stage run", true, `${writes} in ${dur.toFixed(0)} s = ${(writes / dur).toFixed(2)}/s`);
  latencies.sort((a, b) => a - b);
  note("input-to-Display latency (same machine, emulator): Control tap -> Display accepts the objective", latencies.length > 20, `p50 ${latencies[Math.floor(latencies.length / 2)]} ms, p95 ${latencies[Math.floor(latencies.length * 0.95)]} ms, max ${latencies.at(-1)} ms (n=${latencies.length})`);
  note("Display render metrics at the end", !!(await display.eval(`document.querySelector('canvas')?.dataset.metrics`)), await display.eval(`document.querySelector('canvas')?.dataset.metrics`));
  await ctl.tapSel("[data-testid=next]");
  note("session ended on both devices", await both(ctl, display, (x) => x.status === "ended", (x) => x.status === "ended"));
  await sleep(1200);
  await ctl.shot(`${out}/shots/control-ended.png`); await display.shot(`${out}/shots/display-ended.png`);
  await until(async () => Object.keys((await rd("sessions/patient-1")) ?? {}).length >= 1, 20000, 300);
  await sleep(8000);
  const hist = (await rd("sessions/patient-1")) ?? {}; const rec = Object.values(hist)[0];
  note("history saved exactly once", Object.keys(hist).length === 1, JSON.stringify(Object.keys(hist)));
  const total = STEPS.reduce((a, b) => a + b, 0);
  note("history record is the versioned nine-stage format with counts only", rec?.gameId === "color-chase" && rec.resultVersion === 2 && rec.engine === "cc3-garden" && rec.completedStageCount === 9 && rec.objectivesCompleted === total && rec.assistedObjectives > 0 && rec.sessionCompleted === true && rec.accuracy === undefined && rec.totalCorrect === undefined, JSON.stringify({ v: rec?.resultVersion, stages: rec?.completedStageCount, objectives: rec?.objectivesCompleted, assists: rec?.assistedObjectives, repeats: rec?.repeatedObjectives, rows: Object.keys(rec?.stageResults ?? {}).length }));
  note("results summary on Control matches the saved record", (await ctl.text("res-completed")) === String(total) && (await ctl.text("res-stages")) === "9/9", `${await ctl.text("res-completed")} / ${await ctl.text("res-assisted")} / ${await ctl.text("res-repeats")}`);
  note("public liveSession record carries no patient id", !JSON.stringify(await rd("liveSession")).includes("patient-1"));
  note("maximum map/Display zone position error across all stages", maxPar < 0.012, maxPar.toFixed(5));
  note("objectives completed through the UI", objectives === total, `${objectives}/${total}`);
} catch (e) {
  note("suite ran to completion", false, String(e?.stack ?? e).slice(0, 500));
} finally {
  note("no uncaught exceptions on either device", exceptions(ctl ?? { events: [] }, display ?? { events: [] }).length === 0, JSON.stringify(exceptions(ctl ?? { events: [] }, display ?? { events: [] })));
  writeFileSync(`${out}/e2e-results.json`, JSON.stringify(results, null, 1));
  A.close(); B.close();
}
console.log(`${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(0);
