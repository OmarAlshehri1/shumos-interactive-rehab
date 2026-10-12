// Follow the Footsteps 3D: nine stages by touch on a Control device, followed by an independent Display device.
// Two separate Chrome processes/profiles share only the Firebase EMULATORS (ports 19300/19399). Never touches production.
// Usage: node e2e.mjs <outDir> [baseUrl]
import { launch, login, openIpad, selectPatient, sleep, until, note, results, rd } from "./crosslib.mjs";
import { seed } from "./seed.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const [out, BASE = "http://127.0.0.1:3417"] = process.argv.slice(2);
mkdirSync(`${out}/shots`, { recursive: true });
await seed();
const A = await launch(`${out}/ipad`, 9921), B = await launch(`${out}/laptop`, 9922);
const STEPS = [4, 5, 5, 6, 6, 7, 7, 6, 8];
const RESTS = { 5: [2, 4] };
const cd = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=foot-control]')?.dataset ?? null)`).then(JSON.parse);
const dd = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=foot-display]')?.dataset ?? null)`).then(JSON.parse);
const mapStones = (t) => t.eval(`document.querySelector('[data-testid=stone-map]')?.dataset.stones ?? ''`);
const exceptions = (...tabs) => tabs.flatMap((t) => (t.events ?? []).filter((e) => e.method === "Runtime.exceptionThrown").map((e) => e.params.exceptionDetails.exception?.description?.slice(0, 200)));
const both = (c, d, pc, pd = pc) => until(async () => pc(await cd(c)) && pd(await dd(d)), 25000, 100);
// stone centres on the therapist map (world coords) vs where the Display really renders them (screen fractions)
const parity = async (ctl, display) => {
  const map = await ctl.eval(`(() => { const svg = document.querySelector('[data-testid=stone-map]'); const [x0, y0, w, h] = svg.getAttribute('viewBox').split(' ').map(Number); return JSON.stringify([...svg.querySelectorAll('g[data-stone]')].map((g) => { const c = g.querySelector('circle'); return { wx: +c.getAttribute('cx'), wy: +c.getAttribute('cy'), fx: (+c.getAttribute('cx') - x0) / w, fy: (+c.getAttribute('cy') - y0) / h }; })); })()`).then(JSON.parse);
  const disp = await display.eval(`JSON.stringify(${JSON.stringify(map)}.map((m) => window.__forest.project(m.wx, m.wy)))`).then(JSON.parse);
  return Math.max(...map.map((m, i) => Math.hypot(m.fx - disp[i].x, m.fy - disp[i].y)));
};
let ctl, display;
const latencies = [];
try {
  display = await B.open(`${BASE}/display`, 1920, 1080);
  ctl = await openIpad(A, `${BASE}/control`);
  await login(ctl); await selectPatient(ctl); await sleep(3000);
  await ctl.eval(`location.href='/control/follow-the-footsteps'`);
  note("Control opens the 3D game on the canonical route and publishes the shared session", await until(() => ctl.eval(`!!document.querySelector('[data-testid=foot-control]')`), 90000, 500));
  note("Display (separate device) renders from /liveSession", await until(() => display.eval(`!!document.querySelector('[data-testid=foot-display]')`), 60000, 500));
  await until(() => display.eval(`!!document.querySelector('canvas')`), 30000, 300);
  await sleep(2500);
  const m0 = await display.eval(`document.querySelector('canvas')?.dataset.metrics ?? null`);
  note("Display 3D forest is rendering (WebGL)", !!m0, m0 ?? "no metrics");
  note("record is the shared liveSession, same game id as the original, tagged fp3", (await rd("liveSession/gameId")) === "follow-the-footsteps" && (await rd("liveSession/session/engine")) === "fp3");
  await ctl.shot(`${out}/shots/control-ready.png`); await display.shot(`${out}/shots/display-ready.png`);
  const rev0 = (await rd("liveSession/revision")) ?? 0, t0 = Date.now();
  let mapChecks = 0, mapOk = 0, maxPar = 0;

  for (let stage = 0; stage < 9; stage++) {
    let c = await cd(ctl);
    if (c.status === "ready") await ctl.tapText("ابدأ المرحلة");
    note(`stage ${stage + 1}: started on both devices`, await both(ctl, display, (x) => x.status === "running", (x) => x.status === "running"));
    const n = STEPS[stage];
    const stones = (await dd(display)).stones.split(",").length;
    note(`stage ${stage + 1}: ${n} stones on Display and on the therapist map`, stones === n && (await mapStones(ctl)).split(",").length === n);
    const par = await parity(ctl, display); maxPar = Math.max(maxPar, par);
    note(`stage ${stage + 1}: stone positions identical on both devices (max error ${par.toFixed(4)})`, par < 0.012);
    for (let step = 0; step < n; step++) {
      await until(async () => { const x = await cd(ctl); return x.step === String(step) && x.status === "running"; }, 20000, 80);
      // memory stage: the pair is shown first, then the child steps
      if (stage === 7 && step % 2 === 0) {
        note(`stage 8 step ${step + 1}: pair preview shown on the Display`, await both(ctl, display, (x) => x.phase === "preview", (x) => x.phase === "preview"));
        if (step === 0) { await sleep(1600); await display.shot(`${out}/shots/display-memory-preview.png`); }
        await ctl.tapText("ابدأ الخطوات الآن"); await both(ctl, display, (x) => x.phase === "step");
      }
      mapChecks++;
      const cs = await mapStones(ctl), ds = (await dd(display)).stones;
      if (cs === ds && (await dd(display)).step === String(step)) mapOk++;
      if (step === 0 && stage % 3 === 0) { await sleep(900); await display.shot(`${out}/shots/display-L${stage / 3 + 1}-target.png`); await ctl.shot(`${out}/shots/control-L${stage / 3 + 1}.png`); }
      const before = Number((await dd(display)).accepted);
      await display.eval(`window.__t = 0; new MutationObserver(() => { const d = document.querySelector('[data-testid=foot-display]'); if (d && Number(d.dataset.accepted) > ${before} && !window.__t) window.__t = Date.now(); }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['data-accepted'] })`);
      const stamp = await ctl.eval(`Date.now()`);
      if ((stage * 3 + step) % 4 === 3) await ctl.tapText("خطوة بمساعدة"); else await ctl.tapSel("[data-testid=confirm]");
      await until(() => display.eval(`window.__t > 0`), 10000, 20);
      latencies.push((await display.eval(`window.__t`)) - stamp);
      if (step === 0 && stage % 3 === 0) { await sleep(350); await display.shot(`${out}/shots/display-L${stage / 3 + 1}-success.png`); }
      if (RESTS[stage]?.includes(step)) {
        note(`stage ${stage + 1}: optional rest after step ${step + 1} pauses both devices`, await both(ctl, display, (x) => x.status === "paused" && x.rest === "1", (x) => x.status === "paused" && x.rest === "1"));
        if (step === 2) await display.shot(`${out}/shots/display-rest.png`);
        await ctl.tapText("متابعة بعد الراحة"); await both(ctl, display, (x) => x.status === "running");
      }
    }
    note(`stage ${stage + 1}: stage-complete on both devices`, await both(ctl, display, (x) => x.status === "stage-complete", (x) => x.status === "stage-complete"));
    if (stage % 3 === 0) { await sleep(800); await display.shot(`${out}/shots/display-L${stage / 3 + 1}-complete.png`); }
    if (stage === 8) break;
    await ctl.tapText("المرحلة التالية");
    await until(async () => { const x = await cd(ctl); return x.status === "ready" && x.stage === String(stage + 1); }, 15000, 100);
  }
  note("tile/stone state: therapist map == Display at every step", mapChecks > 0 && mapOk === mapChecks, `${mapOk}/${mapChecks}`);
  const dur = (Date.now() - t0) / 1000, writes = ((await rd("liveSession/revision")) ?? 0) - rev0;
  note("writes: shared record revisions during the nine-stage run", true, `${writes} in ${dur.toFixed(0)} s = ${(writes / dur).toFixed(2)}/s`);
  latencies.sort((a, b) => a - b);
  note("input-to-Display latency (same machine, emulator): Control tap -> Display accepts the step", latencies.length > 20, `p50 ${latencies[Math.floor(latencies.length / 2)]} ms, p95 ${latencies[Math.floor(latencies.length * 0.95)]} ms, max ${latencies.at(-1)} ms (n=${latencies.length})`);
  note("Display render metrics at the end", !!(await display.eval(`document.querySelector('canvas')?.dataset.metrics`)), await display.eval(`document.querySelector('canvas')?.dataset.metrics`));
  await ctl.tapText("إنهاء الجلسة");
  note("session ended on both devices", await both(ctl, display, (x) => x.status === "ended", (x) => x.status === "ended"));
  await ctl.shot(`${out}/shots/control-ended.png`); await display.shot(`${out}/shots/display-ended.png`);
  await until(async () => Object.keys((await rd("sessions/patient-1")) ?? {}).length >= 1, 20000, 300);
  await sleep(8000);
  const hist = (await rd("sessions/patient-1")) ?? {}; const rec = Object.values(hist)[0];
  note("history saved exactly once", Object.keys(hist).length === 1, JSON.stringify(Object.keys(hist)));
  const total = STEPS.reduce((a, b) => a + b, 0);
  note("history record is the versioned nine-stage format with counts only", rec?.gameId === "follow-the-footsteps" && rec.resultVersion === 2 && rec.engine === "fp3-forest" && rec.completedStageCount === 9 && rec.totalStepsPresented === total && rec.totalStepsCompleted === total && rec.totalAssists > 0, JSON.stringify({ v: rec?.resultVersion, stages: rec?.completedStageCount, steps: rec?.totalStepsCompleted, assists: rec?.totalAssists, rows: Object.keys(rec?.stageResults ?? {}).length }));
  note("public liveSession record carries no patient id", !JSON.stringify(await rd("liveSession")).includes("patient-1"));
  note("maximum map/Display stone position error across all stages", maxPar < 0.012, maxPar.toFixed(5));
} catch (e) {
  note("suite ran to completion", false, String(e?.stack ?? e).slice(0, 500));
} finally {
  note("no uncaught exceptions on either device", exceptions(ctl ?? { events: [] }, display ?? { events: [] }).length === 0, JSON.stringify(exceptions(ctl ?? { events: [] }, display ?? { events: [] })));
  writeFileSync(`${out}/e2e-results.json`, JSON.stringify(results, null, 1));
  A.close(); B.close();
}
console.log(`${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(0);
