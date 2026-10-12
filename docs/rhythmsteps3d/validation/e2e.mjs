// Rhythm Steps 3D: cross-device end-to-end on LOCAL EMULATORS ONLY (RTDB 19500, Auth 19599, app 3621).
// Two separate Chrome processes/profiles (an iPad-like touch Control and a projector-sized Display) share only the emulator.
// Usage: node e2e.mjs <outDir> [baseUrl]
import { launch, login, openIpad, selectPatient, sleep, until, note, results, rd } from "./crosslib.mjs";
import { seed } from "./seed.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const [out, BASE = "http://127.0.0.1:3621"] = process.argv.slice(2);
mkdirSync(`${out}/shots`, { recursive: true });
await seed();
const PROFILE = process.env.RS_PROFILE ?? "/tmp/rs-e2e";
const A = await launch(`${PROFILE}/ipad`, 9871), B = await launch(`${PROFILE}/laptop`, 9872);
const ctlData = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=rs-control]')?.dataset ?? null)`).then((v) => JSON.parse(v));
const dispData = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=rs-display]')?.dataset ?? null)`).then((v) => JSON.parse(v));
const vclock = (t) => t.eval(`Number(document.querySelector('canvas')?.dataset.vclock ?? -1)`);
const errs = (...tabs) => tabs.flatMap((t) => (t.events ?? []).filter((e) => e.method === "Runtime.exceptionThrown").map((e) => e.params.exceptionDetails.exception?.description?.slice(0, 200)));
const setRange = (t, id, v) => t.eval(`(() => { const e = document.querySelector('[data-testid=${id}]'); if (!e) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e, '${v}'); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
const check = (t, id, on) => t.eval(`(() => { const e = document.querySelector('[data-testid=${id}]'); if (!e) return false; if (e.checked !== ${on}) e.click(); return true; })()`);
const openAll = (t) => t.eval(`document.querySelectorAll('details').forEach((d) => (d.open = true))`);
const history = async () => Object.values((await rd("sessions/patient-1")) ?? {});

let ctl, display;
try {
  display = await B.open(`${BASE}/display`, 1920, 1080);
  ctl = await openIpad(A, `${BASE}/control`);
  await login(ctl); await selectPatient(ctl);
  await sleep(3000);
  await ctl.eval(`location.href='/control/rhythm-steps-3d'`);
  note("Control opens and publishes the shared session", await until(() => ctl.eval(`!!document.querySelector('[data-testid=rs-control]')`), 90000, 500));
  note("Display (separate device) renders from /liveSession", await until(() => display.eval(`!!document.querySelector('[data-testid=rs-display]')`), 60000, 500));
  await sleep(2500);
  const m0 = await display.eval(`document.querySelector('canvas')?.dataset.metrics ?? null`);
  note("Display 3D canvas is running (WebGL)", !!m0, m0 ?? "no metrics");
  await openAll(ctl);
  await ctl.shot(`${out}/shots/control-ready.png`); await display.shot(`${out}/shots/display-ready.png`);
  note("Record is the shared liveSession with the game id and engine", (await rd("liveSession/gameId")) === "rhythm-steps-3d" && (await rd("liveSession/session/engine")) === "rs3");
  note("Record carries no patient identifier on the public path", (await rd("liveSession/patientId")) == null && !JSON.stringify(await rd("liveSession")).includes("patient-1"));
  note("Control states the sensor limitation", await ctl.eval(`document.body.innerText.includes('لا تُعطي موقع القدم') && document.body.innerText.includes('يؤكّد المعالج كل موضع يدويًا')`));
  note("Arabic RTL interface", (await ctl.eval(`document.querySelector('[data-testid=rs-control]').getAttribute('dir')`)) === "rtl" && (await display.eval(`document.querySelector('[data-testid=rs-display]').getAttribute('dir')`)) === "rtl");

  // ---- stage 1, continuous flow ----
  await ctl.select("rs-flow", "continuous");
  note("Stage 1 starts on both devices", await (async () => { await ctl.tapSel("[data-testid=rs-start]"); return until(async () => (await ctlData(ctl)).status === "running" && (await dispData(display))?.status === "running", 20000, 150); })());
  await sleep(6000);
  const c1 = Number((await ctlData(ctl)).clock), d1 = await vclock(display);
  note("Control and Display clocks agree (continuous flow)", Math.abs(c1 - d1) < 1500, `control ${c1} display ${d1}`);
  note("Targets are in flight on the Display and in the Control map", Number((await dispData(display)).targets) > 0 && (await ctl.eval(`document.querySelectorAll('[data-testid=rs-map-target]').length`)) > 0);
  await ctl.shot(`${out}/shots/control-running.png`); await display.shot(`${out}/shots/display-stage1.png`);
  note("Display shows a foot-symbol caption with the colour name", await display.eval(`(document.querySelector('[data-testid=rs-caption]')?.textContent ?? '').length > 4`));

  // pause / resume
  await ctl.tapSel("[data-testid=rs-pause]");
  await until(async () => (await ctlData(ctl)).status === "paused" && (await dispData(display)).status === "paused", 10000, 100);
  const p1 = Number((await ctlData(ctl)).clock); const v1 = await vclock(display);
  await sleep(3500);
  const p2 = Number((await ctlData(ctl)).clock); const v2 = await vclock(display);
  note("Pause freezes the clock on both devices", p1 === p2 && Math.abs(v2 - v1) < 80, `control ${p1}->${p2} display ${v1}->${v2}`);
  await display.shot(`${out}/shots/display-paused.png`);
  await ctl.tapSel("[data-testid=rs-resume]");
  await until(async () => (await ctlData(ctl)).status === "running", 10000, 100);
  await sleep(1200);
  const p3 = Number((await ctlData(ctl)).clock);
  note("Resume continues without a jump", p3 > p2 && p3 - p2 < 1800, `+${p3 - p2} ms of game clock after ~1.2 s`);

  // speed change keeps sync
  const beforeSpeed = Number((await ctlData(ctl)).clock); const t0 = Date.now();
  await ctl.select("rs-speed", "gentle"); await sleep(3000);
  const g1 = Number((await ctlData(ctl)).clock); const dtg = (Date.now() - t0) / 1000;
  await ctl.select("rs-speed", "active"); const a0 = Number((await ctlData(ctl)).clock); const t1 = Date.now(); await sleep(3000);
  const a1 = Number((await ctlData(ctl)).clock); const dta = (Date.now() - t1) / 1000;
  const rateG = (g1 - beforeSpeed) / dtg / 1000, rateA = (a1 - a0) / dta / 1000;
  note("Speed profile changes the clock rate (gentle slower than active)", rateG < rateA && rateG > 0.35 && rateA > 0.85, `gentle ×${rateG.toFixed(2)} active ×${rateA.toFixed(2)}`);
  await sleep(1500);
  note("Clocks stay in sync after speed changes", Math.abs(Number((await ctlData(ctl)).clock) - (await vclock(display))) < 1800);
  await ctl.select("rs-speed", "comfortable");

  // manual confirmation via real touch taps
  await until(async () => (await ctl.eval(`document.querySelector('[data-testid=rs-current]')?.dataset.current`)) !== "" && (await ctl.eval(`!!document.querySelector('[data-testid=rs-confirm]')`)), 30000, 150);
  const curId = await ctl.eval(`document.querySelector('[data-testid=rs-current]').dataset.current`);
  await ctl.tapSel("[data-testid=rs-confirm]");
  note("Manual confirmation reaches the Display (confirmed count)", await until(async () => Number((await dispData(display)).confirmed) >= 1, 8000, 100));
  note("The confirmed target is not current any more (no double confirmation)", (await ctl.eval(`document.querySelector('[data-testid=rs-current]')?.dataset.current`)) !== curId);
  await display.shot(`${out}/shots/display-hit.png`);

  // skip and repeat
  await until(async () => (await ctl.eval(`!!document.querySelector('[data-testid=rs-skip]')`)), 30000, 150);
  await ctl.tapSel("[data-testid=rs-skip]"); await sleep(400);
  await ctl.tapSel("[data-testid=rs-repeat]");
  note("Repeat queues the exercise again", await until(async () => /إعادات \d+/.test(await ctl.eval(`document.querySelector('[data-testid=rs-results]').innerText`)) && (await ctl.eval(`document.querySelector('[data-testid=rs-results]').innerText.match(/إعادات (\\d+)/)[1]`)) === "1", 8000, 150));
  // temporarily stop new targets
  await ctl.tapSel("[data-testid=rs-spawn]"); await sleep(500);
  note("Stopping the stream is shown on Control", await ctl.eval(`document.body.innerText.includes('الأهداف الجديدة متوقفة')`));
  await ctl.tapSel("[data-testid=rs-spawn]");

  // ---- assisted flow stalls at the line ----
  await ctl.select("rs-flow", "assisted");
  await until(async () => { const a = Number((await ctlData(ctl)).clock); await sleep(1200); return a === Number((await ctlData(ctl)).clock); }, 90000, 100);
  const frozen = Number((await ctlData(ctl)).clock); await sleep(3000);
  note("Assisted flow: the stream waits at the line (clock frozen) while the Display keeps animating", Number((await ctlData(ctl)).clock) === frozen && Math.abs((await vclock(display)) - frozen) < 400, `clock ${frozen}`);
  await display.shot(`${out}/shots/display-assisted-wait.png`);
  await ctl.tapSel("[data-testid=rs-assist]");
  note("Assisted confirmation resumes the stream", await until(async () => Number((await ctlData(ctl)).clock) > frozen + 200, 8000, 100));
  await ctl.select("rs-flow", "continuous");
  await ctl.select("rs-flow", "assisted");

  // ---- reload recovery (Control) ----
  const before = JSON.parse(await ctl.eval(`JSON.stringify({ run: document.querySelector('[data-testid=rs-control]').dataset.run, stage: document.querySelector('[data-testid=rs-control]').dataset.stage, res: document.querySelector('[data-testid=rs-results]').innerText.match(/إجمالي الأهداف (\\d+)/)[1] })`));
  await ctl.send("Page.reload");
  note("Control recovers after reload", await until(() => ctl.eval(`!!document.querySelector('[data-testid=rs-control]')`), 60000, 500));
  await sleep(2500);
  const after = JSON.parse(await ctl.eval(`JSON.stringify({ run: document.querySelector('[data-testid=rs-control]').dataset.run, stage: document.querySelector('[data-testid=rs-control]').dataset.stage, status: document.querySelector('[data-testid=rs-control]').dataset.status, safety: document.querySelector('[data-testid=rs-control]').dataset.safety, res: document.querySelector('[data-testid=rs-results]').innerText.match(/إجمالي الأهداف (\\d+)/)[1] })`));
  note("Recovery keeps stage and counts and never resumes by itself (paused, safety)", after.stage === before.stage && after.run === before.run && after.res === before.res && after.status === "paused", JSON.stringify({ before, after }));
  await sleep(2000);
  note("Display shows the safe pause after the reload", (await dispData(display)).status === "paused");
  await ctl.tapSel("[data-testid=rs-resume]");
  await until(async () => (await ctlData(ctl)).status === "running", 15000, 100);

  // ---- Display reload ----
  await display.send("Page.reload");
  note("Display recovers after reload", await until(() => display.eval(`!!document.querySelector('[data-testid=rs-display]') && !!document.querySelector('canvas')`), 60000, 500));

  // ---- safety stop ----
  await ctl.tapSel("[data-testid=rs-safety]");
  note("Safety stop pauses both devices and shows the safe message", await until(async () => (await dispData(display)).safety === "1" && (await ctlData(ctl)).status === "paused", 10000, 100));
  await display.shot(`${out}/shots/display-safety.png`);
  await ctl.tapSel("[data-testid=rs-resume]");

  // ---- all nine stages, played through the touch UI in assisted flow ----
  await ctl.tapSel("[data-testid=rs-end]"); await sleep(300); await ctl.tapSel("[data-testid=rs-confirm-yes]");
  note("Ending a session finishes it", await until(async () => (await ctlData(ctl)).status === "ended", 10000, 100));
  note("History saved once for the first (partial) run", await until(async () => (await history()).length === 1, 15000, 300));
  const first = (await history())[0];
  note("History record is the shared versioned record (no score)", first?.gameId === "rhythm-steps-3d" && first.resultVersion === 1 && first.engine === "rs3" && first.score === undefined && first.confirmedEvents + first.assistedEvents + first.skippedEvents + first.missedEvents === first.totalTargetEvents, JSON.stringify({ g: first?.gameId, total: first?.totalTargetEvents }));
  await ctl.tapSel("[data-testid=rs-restart]"); await sleep(300); await ctl.tapSel("[data-testid=rs-confirm-yes]");
  note("Restart (after confirmation) opens a new run", await until(async () => (await ctlData(ctl)).run === "2" && (await ctlData(ctl)).status === "ready", 10000, 100));
  await openAll(ctl);
  await ctl.select("rs-flow", "assisted"); await ctl.select("rs-hold", "1000");
  await ctl.select("rs-speed", "active");
  const stageNotes = [];
  for (let stage = 0; stage < 9; stage++) {
    if ((await ctlData(ctl)).status === "ready") await ctl.tapSel("[data-testid=rs-start]");
    await until(async () => (await ctlData(ctl)).status === "running" && (await dispData(display))?.status === "running", 20000, 100);
    const t0s = Date.now();
    let done = false; let holds = 0; let dual = 0;
    while (Date.now() - t0s < 120000) {
      const st = (await ctlData(ctl)).status;
      if (st === "stage-complete") { done = true; break; }
      const info = JSON.parse(await ctl.eval(`JSON.stringify({ id: document.querySelector('[data-testid=rs-current]')?.dataset.current ?? '', kind: document.querySelector('[data-testid=rs-current]')?.dataset.kind ?? '', holding: document.querySelector('[data-testid=rs-current]')?.dataset.holding ?? '', two: document.querySelectorAll('[data-testid=rs-current] [class*=pill]').length })`));
      if (info.id) {
        if (info.kind === "hold") { if (info.holding === "0") { await ctl.tapSel("[data-testid=rs-hold-start]"); holds++; } }
        else { if (info.two > 1) dual++; await ctl.tapSel("[data-testid=rs-confirm]"); }
      }
      await sleep(180);
    }
    const dd = await dispData(display);
    stageNotes.push({ stage: stage + 1, holds, dual });
    if (stage === 3 || stage === 6 || stage === 8) await display.shot(`${out}/shots/display-stage${stage + 1}-complete.png`);
    note(`Stage ${stage + 1} completes on both devices`, done && (await until(async () => (await dispData(display))?.status === "stage-complete", 10000, 100)), `holds ${holds}, two-foot ${dual}`);
    if (stage === 8) break;
    await ctl.tapSel("[data-testid=rs-next]");
    await until(async () => (await ctlData(ctl)).stage === String(stage + 1) && (await ctlData(ctl)).status === "ready", 10000, 100);
    if (stage === 2) await display.shot(`${out}/shots/display-stage4-ready.png`);
  }
  note("Stages 4 and 8 included two-foot targets, stage 7 included holds", stageNotes[3].dual > 0 && stageNotes[7].dual > 0 && stageNotes[6].holds > 0, JSON.stringify(stageNotes));
  await ctl.tapSel("[data-testid=rs-next]");
  note("Final stage ends the session and shows results", await until(async () => (await ctlData(ctl)).status === "ended" && (await dispData(display)).status === "ended", 15000, 100));
  await sleep(2500);
  await display.shot(`${out}/shots/display-final.png`); await ctl.shot(`${out}/shots/control-final.png`);
  note("History saved exactly once for the nine-stage run", await until(async () => (await history()).length === 2, 15000, 300));
  await sleep(4000);
  const hs = await history();
  note("Save-once: still two records after waiting (no duplicate)", hs.length === 2);
  const full = hs.find((h) => h.completedStageCount === 9);
  note("Nine-stage record: 9 completed stages, 9 stage rows, hold and two-foot counts present", !!full && full.stageResults.length === 9 && full.holdExercises > 0 && full.twoFootExercises > 0, JSON.stringify({ total: full?.totalTargetEvents, hold: full?.holdExercises, two: full?.twoFootExercises }));
  await ctl.send("Page.reload"); await sleep(6000);
  note("Reloading the ended session does not save it again", (await history()).length === 2);

  const e = errs(ctl, display);
  note("No uncaught exceptions on either device", e.length === 0, e.slice(0, 3).join(" | "));
} catch (e) {
  note("script completed without throwing", false, String(e?.stack ?? e).slice(0, 400));
} finally {
  writeFileSync(`${out}/e2e-results.json`, JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  A.close(); B.close();
  process.exit(failed ? 1 : 0);
}
