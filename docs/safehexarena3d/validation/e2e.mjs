// Safe Hex Arena 3D: nine stages by touch on a Control device, followed by an independent Display device.
// Two separate Chrome processes/profiles share only the Firebase EMULATORS (ports 19300/19399). Never touches production.
// Usage: node e2e.mjs <outDir> [baseUrl]
import { launch, login, openIpad, selectPatient, sleep, until, note, results, rd } from "./crosslib.mjs";
import { seed } from "./seed.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const [out, BASE = "http://127.0.0.1:3417"] = process.argv.slice(2);
mkdirSync(`${out}/shots`, { recursive: true });
await seed();
const A = await launch(`${out}/ipad`, 9821), B = await launch(`${out}/laptop`, 9822);
const STAGES = [[9, 3], [9, 3], [9, 4], [12, 4], [12, 5], [12, 5], [16, 5], [16, 6], [16, 6]];
const ctlData = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=hex-control]')?.dataset ?? null)`).then((v) => JSON.parse(v));
const dispData = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=hex-display]')?.dataset ?? null)`).then((v) => JSON.parse(v));
const mapTiles = (t) => t.eval(`document.querySelector('[data-testid=hex-map]')?.dataset.tiles ?? ''`);
const consoleErrors = (...tabs) => tabs.flatMap((t) => (t.events ?? []).filter((e) => e.method === "Runtime.exceptionThrown").map((e) => e.params.exceptionDetails.exception?.description?.slice(0, 200)));
const stat = async () => (await rd("liveSession/revision")) ?? 0;
let ctl, display;
try {
  display = await B.open(`${BASE}/display`, 1920, 1080);
  ctl = await openIpad(A, `${BASE}/control`);
  await login(ctl); await selectPatient(ctl);
  await sleep(3000);
  await ctl.eval(`location.href='/control/safe-hex-arena-3d'`);
  note("Control opens and publishes the shared session", await until(() => ctl.eval(`!!document.querySelector('[data-testid=hex-control]')`), 90000, 500));
  note("Display (separate device) renders from /liveSession", await until(() => display.eval(`!!document.querySelector('[data-testid=hex-display]')`), 60000, 500));
  await sleep(2500);
  const metrics0 = await display.eval(`document.querySelector('canvas')?.dataset.metrics ?? null`);
  note("Display 3D canvas is running (WebGL)", !!metrics0, metrics0 ?? "no metrics");
  await ctl.shot(`${out}/shots/control-ready.png`); await display.shot(`${out}/shots/display-ready.png`);
  note("Record is the shared liveSession with the game id", (await rd("liveSession/gameId")) === "safe-hex-arena-3d" && (await rd("liveSession/session/engine")) === "hex3");
  const rev0 = await stat(); const t0 = Date.now();
  let sameMap = 0, mapChecks = 0; const latencies = []; const warnTimes = [];

  // wait until both devices agree on a phase
  const bothPhase = (phase) => until(async () => (await ctlData(ctl))?.phase === phase && (await dispData(display))?.phase === phase, 20000, 100);
  const compare = async () => { mapChecks++; if ((await mapTiles(ctl)) === (await dispData(display)).tiles) sameMap++; };
  // tap a tile on the map (safe, first), confirm
  const confirmSafe = async (assisted) => {
    const tiles = (await mapTiles(ctl)).split(",");
    const preferred = tiles.findIndex((s) => s === "SAFE");
    await ctl.tapSel(`[data-testid=hex-map] [data-tile="${preferred}"]`);
    await sleep(250);
    const r = await ctl.tapText(assisted ? "انتقال بمساعدة" : "أكّد: وصل لبلاطة آمنة");
    return r;
  };

  for (let stage = 0; stage < 9; stage++) {
    const [tiles, rounds] = STAGES[stage];
    let cd = await ctlData(ctl);
    if (cd.status === "ready") await ctl.tapText("ابدأ المرحلة");
    note(`stage ${stage + 1}: started on both devices`, await until(async () => (await ctlData(ctl)).status === "running" && (await dispData(display))?.status === "running", 20000, 150));
    const dd0 = await dispData(display);
    note(`stage ${stage + 1}: ${tiles} tiles on the Display`, dd0.tiles.split(",").length === tiles && (await mapTiles(ctl)).split(",").length === tiles);
    for (let round = 0; round < rounds; round++) {
      const auto = stage === 0;
      if (!auto) {
        await until(async () => (await ctlData(ctl)).phase === "prep" && (await ctlData(ctl)).round === String(round), 15000, 100);
        const stamp = await ctl.eval(`Date.now()`);
        await display.eval(`window.__seenWarn = 0; new MutationObserver(() => { const d = document.querySelector('[data-testid=hex-display]'); if (d?.dataset.phase === 'warning' && !window.__seenWarn) window.__seenWarn = Date.now(); }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['data-phase'] })`);
        await ctl.tapText("ابدأ التحذير");
        await until(() => display.eval(`window.__seenWarn > 0`), 10000, 20);
        latencies.push((await display.eval(`window.__seenWarn`)) - stamp);
      } else {
        const tw = Date.now();
        await bothPhase("warning"); const t1 = Date.now();
        warnTimes.push(["warning-start-after-prep-ms", t1 - tw]);
        if (round === 0) { await sleep(2500); await display.shot(`${out}/shots/display-L1-warning.png`); await ctl.shot(`${out}/shots/control-L1-warning.png`); }
        const w0 = Date.now(); await bothPhase("inactive"); warnTimes.push(["warning-duration-ms", Date.now() - w0 + 2500 * (round === 0 ? 1 : 0) + (t1 - tw > 0 ? 0 : 0)]);
      }
      if (!auto) {
        await bothPhase("warning");
        await sleep(1800);
        if (round === 0 && [3, 6].includes(stage)) { await display.shot(`${out}/shots/display-L${stage / 3 + 1}-warning.png`); await ctl.shot(`${out}/shots/control-L${stage / 3 + 1}-warning.png`); }
        await compare();
        await ctl.tapText("أطفئ البلاطات الآن");
        await bothPhase("inactive");
      } else await compare();
      if (round === 0 && stage % 3 === 0) { await sleep(1200); await display.shot(`${out}/shots/display-L${stage / 3 + 1}-inactive.png`); await ctl.shot(`${out}/shots/control-L${stage / 3 + 1}-inactive.png`); }
      await compare();
      await confirmSafe(round % 2 === 1);
      note(`stage ${stage + 1} round ${round + 1}: therapist confirmation reaches the Display (restoring)`, await bothPhase("restoring"));
      if (round < rounds - 1) await until(async () => (await ctlData(ctl)).round === String(round + 1) && (await ctlData(ctl)).phase === "prep", 15000, 100);
    }
    note(`stage ${stage + 1}: stage-complete on both devices`, await until(async () => (await ctlData(ctl)).status === "stage-complete" && (await dispData(display))?.status === "stage-complete", 15000, 100));
    if (stage % 3 === 0) { await sleep(800); await display.shot(`${out}/shots/display-L${stage / 3 + 1}-stage-complete.png`); await ctl.shot(`${out}/shots/control-L${stage / 3 + 1}-stage-complete.png`); }
    if (stage === 8) break;
    await ctl.tapText("المرحلة التالية");
    await until(async () => (await ctlData(ctl)).status === "ready" && (await ctlData(ctl)).stage === String(stage + 1), 15000, 150);
  }
  note("tile identity: the therapist map matched the Display tile-for-tile at every check", mapChecks > 0 && sameMap === mapChecks, `${sameMap}/${mapChecks}`);
  const dur = (Date.now() - t0) / 1000, writes = (await stat()) - rev0;
  note("writes: shared record revisions during the nine-stage run", true, `${writes} in ${dur.toFixed(0)} s = ${(writes / dur).toFixed(2)}/s`);
  latencies.sort((a, b) => a - b);
  note("input-to-Display latency (same-machine emulator; Control tap -> Display phase change)", latencies.length > 5, `p50 ${latencies[Math.floor(latencies.length / 2)]} ms, p95 ${latencies[Math.floor(latencies.length * 0.95)]} ms, max ${latencies.at(-1)} ms (n=${latencies.length})`);
  console.log("auto timings:", JSON.stringify(warnTimes));
  const fps = await display.eval(`document.querySelector('canvas')?.dataset.metrics ?? null`);
  note("Display render metrics at the end", !!fps, fps ?? "");

  // end -> history exactly once
  await ctl.tapText("إنهاء الجلسة");
  const ended = await until(async () => (await ctlData(ctl)).status === "ended" && (await dispData(display))?.status === "ended", 15000, 150);
  note("session ended on both devices", ended);
  await ctl.shot(`${out}/shots/control-ended.png`); await display.shot(`${out}/shots/display-ended.png`);
  await until(async () => Object.keys((await rd("sessions/patient-1")) ?? {}).length >= 1, 20000, 300);
  await sleep(8000);
  const hist = (await rd("sessions/patient-1")) ?? {}; const rec = Object.values(hist)[0];
  note("history saved exactly once", Object.keys(hist).length === 1, JSON.stringify(Object.keys(hist)));
  note("history record is versioned and therapist-confirmed only", rec?.gameId === "safe-hex-arena-3d" && rec.resultVersion === 1 && rec.completedStageCount === 9 && rec.totalRoundsCompleted === 41 && rec.totalSafeTransitions + rec.totalAssists === 41 && rec.totalAssists > 0, JSON.stringify({ stages: rec?.completedStageCount, rounds: rec?.totalRoundsCompleted, safe: rec?.totalSafeTransitions, assist: rec?.totalAssists }));
  note("public liveSession record carries no patient id", !JSON.stringify(await rd("liveSession")).includes("patient-1"));
} catch (e) {
  note("suite ran to completion", false, String(e?.stack ?? e).slice(0, 400));
} finally {
  note("no uncaught exceptions on either device", consoleErrors(ctl ?? { events: [] }, display ?? { events: [] }).length === 0, JSON.stringify(consoleErrors(ctl ?? { events: [] }, display ?? { events: [] })));
  writeFileSync(`${out}/e2e-results.json`, JSON.stringify(results, null, 1));
  A.close(); B.close();
}
console.log(`${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(0);
