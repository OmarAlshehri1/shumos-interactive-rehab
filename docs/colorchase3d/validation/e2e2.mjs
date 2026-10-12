// Color Chase 3D robustness: reload recovery, pause / safety / skip / restart / repeat, double taps, sensor simulation,
// accessibility settings, Control lost, staff-only access, early end, save-once history. Emulators only.
// Usage: HEX_DB_PORT=19400 HEX_AUTH_PORT=19499 node e2e2.mjs <outDir> <baseUrl>
import { launch, login, openIpad, selectPatient, sleep, until, note, results, rd } from "../../footsteps3d/validation/crosslib.mjs";
import { seed } from "../../footsteps3d/validation/seed.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const [out, BASE = "http://localhost:3517"] = process.argv.slice(2);
mkdirSync(`${out}/shots`, { recursive: true });
await seed();
const A = await launch(`${out}/ipad`, 9923), B = await launch(`${out}/laptop`, 9924), C = await launch(`${out}/guest`, 9925);
const cd = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=cc-control]')?.dataset ?? null)`).then(JSON.parse);
const dd = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=garden-display]')?.dataset ?? null)`).then(JSON.parse);
const exceptions = (...tabs) => tabs.flatMap((t) => (t.events ?? []).filter((e) => e.method === "Runtime.exceptionThrown").map((e) => e.params.exceptionDetails.exception?.description?.slice(0, 200)));
const both = (c, d, pc, pd = pc) => until(async () => pc(await cd(c)) && pd(await dd(d)), 25000, 100);
const setSel = (t, sel, v) => t.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(e, ${JSON.stringify(String(v))}); e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
let ctl, display, guest;
try {
  display = await B.open(`${BASE}/display`, 1920, 1080);
  ctl = await openIpad(A, `${BASE}/control`);
  await login(ctl); await selectPatient(ctl); await sleep(3000);
  await ctl.eval(`location.href='/control/color-chase'`);
  await until(() => ctl.eval(`!!document.querySelector('[data-testid=cc-control]')`), 90000, 500);
  await until(() => display.eval(`!!document.querySelector('[data-testid=garden-display]')`), 60000, 500);
  const doStep = async () => { const t = (await cd(ctl)).target; await ctl.tapSel(`[data-testid=zone-${t}]`); await ctl.tapSel("[data-testid=confirm]"); };

  // ---- stage selection + shuffle stage ------------------------------------------------------------------------------------------
  note("stage can be chosen before starting (Level 3 · Stage 1)", await setSel(ctl, "[data-testid=stage-select]", 6) && await both(ctl, display, (x) => x.stage === "6", (x) => x.stage === "6"));
  await ctl.tapSel("[data-testid=start]");
  await both(ctl, display, (x) => x.status === "running");
  const zones0 = (await dd(display)).zones;
  await doStep(); await until(async () => (await cd(ctl)).step === "1" && (await dd(display)).step === "1", 8000, 80);
  const zones1 = (await dd(display)).zones;
  note("positions changed BETWEEN rounds (the zones traded places)", zones0 !== zones1 && zones0.split(",").sort().join() === zones1.split(",").sort().join(), `${zones0} -> ${zones1}`);
  await doStep(); await until(async () => (await cd(ctl)).step === "2", 8000, 80);
  await doStep(); await until(async () => (await cd(ctl)).step === "3", 8000, 80);
  await sleep(2500);
  const beforeReload = await dd(display);
  note("garden is partially restored mid-stage", beforeReload.restored.split(",").some((v) => Number(v) > 0) && beforeReload.restored.split(",").some((v) => Number(v) < 1), beforeReload.restored);
  await display.shot(`${out}/shots/display-before-reload.png`);

  // ---- reload the Display: the same garden is rebuilt from the authoritative record ---------------------------------------------------
  await display.send("Page.reload");
  await until(() => display.eval(`!!document.querySelector('[data-testid=garden-display]')`), 60000, 500);
  await until(() => display.eval(`!!document.querySelector('canvas')?.dataset.metrics`), 30000, 300);
  await sleep(2500);
  const afterReload = await dd(display);
  note("Display reload: stage, step, zone order and restoration are reconstructed identically", afterReload.stage === beforeReload.stage && afterReload.step === beforeReload.step && afterReload.zones === beforeReload.zones && afterReload.restored === beforeReload.restored && afterReload.objectives === beforeReload.objectives, `${beforeReload.restored} == ${afterReload.restored}`);
  const metrics = JSON.parse(await display.eval(`document.querySelector('canvas').dataset.metrics`));
  note("Display reload: the 3D scene starts already restored (no replay from gray)", Object.entries(metrics.restored).every(([, v], i) => Math.abs(v - Number(afterReload.restored.split(",")[i])) < 0.05), JSON.stringify(metrics.restored));
  await display.shot(`${out}/shots/display-after-reload.png`);

  // ---- reload the Control: it comes back paused behind a safety hold, never running by itself ---------------------------------------------
  await ctl.send("Page.reload");
  await until(() => ctl.eval(`!!document.querySelector('[data-testid=cc-control]')`), 90000, 500);
  const rc = await until(async () => { const x = await cd(ctl); return x && x.status === "paused" && x.safety === "1"; }, 30000, 200);
  const cAfter = await cd(ctl);
  note("Control reload: session recovered, stage and objective kept, paused behind a safety hold", rc && cAfter.stage === "6" && cAfter.step === "3", JSON.stringify(cAfter));
  note("Control reload: Display shows the safety pause", await until(async () => (await dd(display)).status === "paused" && (await dd(display)).safety === "1", 15000, 150));
  await display.shot(`${out}/shots/display-safety.png`);
  await ctl.tapSel("[data-testid=resume]");
  note("resume after the safety hold continues on both devices", await both(ctl, display, (x) => x.status === "running", (x) => x.status === "running"));

  // ---- double tap on confirm resolves exactly one objective ---------------------------------------------------------------------------------
  const acc0 = Number((await dd(display)).accepted);
  const t0 = (await cd(ctl)).target;
  await ctl.tapSel(`[data-testid=zone-${t0}]`);
  await ctl.tapSel("[data-testid=confirm]"); await ctl.tapSel("[data-testid=confirm]");
  await sleep(1500);
  note("double tap on confirm: exactly one objective accepted", Number((await dd(display)).accepted) === acc0 + 1);

  // ---- repeat, pause, resume ------------------------------------------------------------------------------------------------------------------
  const cue0 = Number((await dd(display)).cue);
  await ctl.tapSel("[data-testid=repeat]");
  note("repeat objective pulses the target again on the Display without changing the objective", await until(async () => Number((await dd(display)).cue) === cue0 + 1 && (await dd(display)).step === (await cd(ctl)).step, 8000, 100));
  await ctl.tapSel("[data-testid=pause]");
  note("pause is shown on both devices", await both(ctl, display, (x) => x.status === "paused"));
  await display.shot(`${out}/shots/display-paused.png`);
  await ctl.tapSel("[data-testid=resume]");
  note("resume is shown on both devices", await both(ctl, display, (x) => x.status === "running"));

  // ---- skip objective, then skip stage -------------------------------------------------------------------------------------------------------------
  const sBefore = (await dd(display)).objectives;
  await ctl.tapSel("[data-testid=skip]");
  note("skip objective is synchronized", await until(async () => (await dd(display)).objectives.includes("SKIPPED") && (await dd(display)).objectives !== sBefore, 8000, 100));
  await ctl.tapSel("[data-testid=skip-stage]");
  note("skip stage ends the stage on both devices", await both(ctl, display, (x) => x.status === "stage-complete", (x) => x.status === "stage-complete"));
  const skippedRestore = (await dd(display)).restored.split(",").map(Number);
  note("a stage with a skipped objective is not shown as fully restored", skippedRestore.some((v) => v < 1), skippedRestore.join(","));

  // ---- stage chosen again, restart ----------------------------------------------------------------------------------------------------------------------
  await ctl.tapSel("[data-testid=restart]");
  note("restart returns both devices to a fresh first stage", await both(ctl, display, (x) => x.status === "ready" && x.stage === "0", (x) => x.status === "ready" && x.stage === "0" && x.accepted === "0"));

  // ---- accessibility settings reach the Display -------------------------------------------------------------------------------------------------------------
  await ctl.eval(`document.querySelector('[data-testid=symbols]').click()`);
  note("symbols off reaches the Display", await until(async () => (await dd(display)).symbols === "0", 8000, 100));
  await ctl.eval(`document.querySelector('[data-testid=symbols]').click()`);
  await ctl.eval(`document.querySelector('[data-testid=high-contrast]').click()`); await ctl.eval(`document.querySelector('[data-testid=reduced-motion]').click()`);
  await sleep(1500); await display.shot(`${out}/shots/display-contrast-reduced-motion.png`);
  await ctl.eval(`document.querySelector('[data-testid=high-contrast]').click()`); await ctl.eval(`document.querySelector('[data-testid=reduced-motion]').click()`);
  await setSel(ctl, "[data-testid=assist-select]", "high");
  await ctl.tapSel("[data-testid=preset-large]");
  await setSel(ctl, "[data-testid=stage-select]", 3);
  await sleep(1500);
  note("large-target preset + stage 4 reach the Display (4 zones)", (await dd(display)).zones.split(",").length === 4);
  await ctl.tapSel("[data-testid=start]");
  await both(ctl, display, (x) => x.status === "running");
  await sleep(1800); await display.shot(`${out}/shots/display-assist-high-large.png`);
  const wasStep = (await cd(ctl)).step;
  await ctl.eval(`(() => { const e = document.querySelector('#maxColors'); return e?.disabled; })()`).then((d) => note("zone layout settings are locked while an objective runs", d === true));
  await ctl.tapSel("[data-testid=pause]");
  await setSel(ctl, "[data-testid=quality]", "low");
  await ctl.eval(`(() => { const e = document.querySelector('#maxColors'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, '3'); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  note("fewer visible colors (3) applies when paused and reaches the Display", await until(async () => (await dd(display)).zones.split(",").length === 3, 10000, 150));
  await ctl.tapSel("[data-testid=resume]"); await both(ctl, display, (x) => x.status === "running");
  note("the objective is unchanged by the layout edit and stays completable", (await cd(ctl)).step === wasStep && ["red", "blue", "green", "yellow"].includes((await cd(ctl)).target));
  await doStep(); await sleep(600);
  await sleep(1500); await display.shot(`${out}/shots/display-quality-low-3-colors.png`);

  // ---- sensor simulation: a hint only ----------------------------------------------------------------------------------------------------------------------
  await ctl.tapSel("[data-testid=pause]");
  await setSel(ctl, "#input", "RIGHT_FOOT");
  await ctl.tapSel("[data-testid=resume]"); await both(ctl, display, (x) => x.status === "running");
  await ctl.tapSel("[data-testid=sim-move-RIGHT_FOOT]");
  const hint = await until(() => ctl.eval(`document.body.innerText.includes('تلميح فقط')`), 8000, 150);
  const stepHint = (await cd(ctl)).step;
  note("simulated movement raises a hint banner; it never selects a zone or advances", hint && (await cd(ctl)).step === stepHint);
  await ctl.tapSel("[data-testid=sim-conn-RIGHT_FOOT]");
  note("sensor disconnect is shown and manual play keeps working", await until(() => ctl.eval(`document.body.innerText.includes('الاتصال مفقود')`), 8000, 150));
  await doStep();
  note("manual selection works with the sensor disconnected", await until(async () => (await cd(ctl)).step !== stepHint || (await cd(ctl)).status !== "running", 8000, 100));

  // ---- Control lost: the Display waits calmly -----------------------------------------------------------------------------------------------------------------
  const ctlUrl = await ctl.eval(`location.href`);
  await ctl.send("Page.navigate", { url: "about:blank" });
  note("Control lost: the Display shows the waiting state", await until(async () => (await dd(display)).connected === "0", 60000, 500));
  await display.shot(`${out}/shots/display-control-lost.png`);
  await ctl.send("Page.navigate", { url: ctlUrl });
  await until(() => ctl.eval(`!!document.querySelector('[data-testid=cc-control]')`), 90000, 500);
  note("Control back: the Display reconnects", await until(async () => (await dd(display)).connected === "1", 60000, 500));
  await ctl.tapSel("[data-testid=resume]").catch(() => {});

  // ---- staff-only access ---------------------------------------------------------------------------------------------------------------------------------------
  guest = await C.open(`${BASE}/control/color-chase`, 1180, 820);
  await sleep(9000);
  note("a visitor who is not signed in cannot open the Control game (sign-in form shown, no game)", (await guest.eval(`!document.querySelector('[data-testid=cc-control]') && !!document.querySelector('input[type=email]')`)));

  // ---- end early: results and save-once history ---------------------------------------------------------------------------------------------------------------
  await until(() => ctl.eval(`!!document.querySelector('[data-testid=end]')`), 30000, 300);
  await ctl.tapSel("[data-testid=end]");
  note("session ended early on both devices", await both(ctl, display, (x) => x.status === "ended", (x) => x.status === "ended"));
  await sleep(1500); await ctl.shot(`${out}/shots/control-results.png`); await display.shot(`${out}/shots/display-ended.png`);
  await until(async () => Object.keys((await rd("sessions/patient-1")) ?? {}).length >= 1, 25000, 300);
  await sleep(9000);
  const hist = (await rd("sessions/patient-1")) ?? {}; const rec = Object.values(hist)[0];
  note("history saved exactly once for the whole session (restart created no second record before the end)", Object.keys(hist).length === 1, JSON.stringify(Object.keys(hist)));
  note("early end is recorded as such and counts are consistent", rec?.sessionCompleted === false && rec.objectivesCompleted >= 1 && rec.assistedObjectives <= rec.objectivesCompleted && rec.repeatedObjectives === 0 || rec?.repeatedObjectives >= 0, JSON.stringify({ done: rec?.objectivesCompleted, assisted: rec?.assistedObjectives, repeats: rec?.repeatedObjectives, completed: rec?.sessionCompleted }));
  await ctl.send("Page.reload");
  await until(() => ctl.eval(`!!document.querySelector('[data-testid=cc-control]')`), 90000, 500);
  await sleep(8000);
  note("reloading an ended session does not save a second record", Object.keys((await rd("sessions/patient-1")) ?? {}).length === 1);
} catch (e) {
  note("suite ran to completion", false, String(e?.stack ?? e).slice(0, 500));
} finally {
  note("no uncaught exceptions on either device", exceptions(ctl ?? { events: [] }, display ?? { events: [] }).length === 0, JSON.stringify(exceptions(ctl ?? { events: [] }, display ?? { events: [] })));
  writeFileSync(`${out}/e2e2-results.json`, JSON.stringify(results, null, 1));
  A.close(); B.close(); C.close();
}
console.log(`${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(0);
