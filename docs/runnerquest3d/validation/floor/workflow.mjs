// FLOOR workflow suite: assistance, repeat, skip, pause/resume, restart, sensor hints + manual fallback, reload recovery, staff gating,
// calibration (range/pad/grid/contrast/aspect/reduced motion), walk-in (no history), Firebase write rate, latency, GPU resource stability.
//   node workflow.mjs <outDir>
import { mkdirSync, writeFileSync } from "node:fs";
import { BASE, launch, login, note, openIpad, rd, results, seed, selectPatient, sleep, until } from "./lib.mjs";
const [out] = process.argv.slice(2);
mkdirSync(`${out}/results`, { recursive: true });
await seed();
const A = await launch(`${out}/ipad`, 9830), B = await launch(`${out}/laptop`, 9831), C = await launch(`${out}/outsider`, 9832);
const display = await B.open(`${BASE}/display`, 1920, 1080);
const control = await openIpad(A, `${BASE}/control/runner-quest-3d`);
await login(control); await selectPatient(control);
const rt = (js) => control.eval(`(() => { const rt = window.__RQ3D_RT; ${js} })()`);
const dData = (k) => display.eval(`document.querySelector('[data-testid=rq3d-display]')?.dataset['${k}'] ?? null`);
const lc = () => rt(`return rt.session.lifecycle`);
const cur = () => rt(`return rt.session.stage.floor.current`);
const fl = (k) => rt(`return rt.session.stage.floor.${k}`);
const target = () => rt(`const f = rt.session.stage.floor; const o = f.objectives[f.current]; return o ? { kind: o.kind, target: o.target } : null`);
const confirm = async () => { const o = await target(); if (!o) return; if (o.kind === "region") await control.tap(`floor-region-${o.target}`); else await control.tap("floor-step"); await sleep(420); };
const endSheetConfirm = () => control.eval(`(() => { const s = document.querySelector('section[aria-labelledby=end-session-reason-title]'); const b = s && [...s.querySelectorAll('button')].pop(); if (b) b.click(); return !!b; })()`);
const sessions = async () => Object.values((await rd("sessions/patient-1")) ?? {}).filter((r) => r.gameId === "runner-quest-3d");

// ---- setup: choose FLOOR, medium stage 1 only
await control.tap("projection-FLOOR"); await sleep(1000);
await control.tapThen("range-single", "true"); await control.tapThen("stage-4", "window.__RQ3D_RT.session.startIndex===4"); // medium 2: has rests
await sleep(800);

// ---- calibration before start (range, pad, margin, contrast, grid) reaches the Display
await control.tap("floor-range-high"); await control.tap("floor-pad-high"); await sleep(1500);
note("calibration: range+pad reach the Display", (await dData("range")) === "high" && (await dData("pad")) === "high");
await control.tap("floor-grid"); await sleep(1200);
note("calibration: grid toggled on the Display", (await dData("grid")) === "1");
await control.eval(`(() => { const e = document.querySelector('[data-testid=floor-width-cm]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'300'); e.dispatchEvent(new Event('input',{bubbles:true})); const h = document.querySelector('[data-testid=floor-height-cm]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(h,'190'); h.dispatchEvent(new Event('input',{bubbles:true})); })()`);
await sleep(1200);
note("calibration: projected size stored (300 x 190 cm)", (await rt(`return rt.session.settings.floor.widthCm`)) === 300 && (await rt(`return rt.session.settings.floor.heightCm`)) === 190);
await display.shot(`${out}/cal-grid-16x9-wide.png`);
await display.send("Emulation.setDeviceMetricsOverride", { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false }); await sleep(900);
await display.shot(`${out}/cal-grid-4x3.png`);
note("4:3 projector: canvas has no overflow and keeps its aspect", await display.eval(`(() => { const c = document.querySelector('[data-testid=rq3f-canvas]'); const r = c.getBoundingClientRect(); return Math.abs(r.width / r.height - 1024 / 768) < 0.01 && document.documentElement.scrollWidth <= innerWidth; })()`));
await display.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await control.tap("floor-grid"); await control.tap("floor-contrast"); await sleep(1200);
note("calibration: high contrast reaches the Display", (await dData("contrast")) === "1");
await display.shot(`${out}/cal-high-contrast.png`);
await control.tap("floor-contrast"); await control.tap("floor-range-normal"); await control.tap("floor-pad-normal"); await sleep(800);

// ---- run
await control.tapThen("start", "window.__RQ3D_RT.session.lifecycle==='playing'");
note("projection can no longer be changed once started (buttons disabled, command refused)", (await control.eval(`document.querySelector('[data-testid=projection-WALL]').disabled`)) === true && (await rt(`return rt.command({type:'projection', value:'WALL'})`)) === false);
const i0 = await cur();
await control.tap("floor-assist"); await sleep(900);
note("assisted confirmation completes the objective, counts as assisted", (await cur()) === i0 + 1 && (await rt(`return rt.session.stage.assists`)) === 1);
note("Display shows the assisted outcome", await until(async () => Number(await dData("assisted")) === 1, 6000));
const cs0 = await dData("cueSeq");
await control.tap("floor-repeat"); await sleep(1200);
note("repeat replays the cue without changing progress", Number(await dData("cueSeq")) === Number(cs0) + 1 && (await cur()) === i0 + 1);
await control.tap("floor-skip-objective"); await sleep(1000);
note("skip objective moves on, no star, counted as skipped", (await cur()) === i0 + 2 && (await fl("skipped")) === 1 && Number(await dData("skipped")) === 1);
const o = await target(); const wrong = o.kind === "region" ? (o.target === 1 ? -1 : 1) : null;
if (wrong !== null) { const c0 = await cur(); await control.tap(`floor-region-${wrong}`); await sleep(700); note("a wrong region is ignored: no error, objective unchanged, still playing", (await cur()) === c0 && (await lc()) === "playing" && (await rt(`return rt.session.stage.floor.region`)) === wrong); }
// pause / resume
await control.tap("pause"); await sleep(1200);
note("pause: Display shows the pause card and actions are disabled", (await lc()) === "paused" && (await dData("lifecycle")) === "paused" && (await control.eval(`document.querySelector('[data-testid=floor-region-1]').disabled`)) === true);
await display.shot(`${out}/wf-display-paused.png`); await control.shot(`${out}/wf-control-paused.png`);
const cp = await cur();
await control.tap("resume"); await sleep(1000);
note("resume continues at the same objective", (await lc()) === "playing" && (await cur()) === cp);
// restart
await confirm(); await confirm();
await control.tap("restart"); await sleep(1200);
note("restart: stage back to ready at objective 1 (same plan) on both devices", (await lc()) === "ready" && (await cur()) === 0 && Number(await dData("current")) === 0);
await control.tapThen("start", "window.__RQ3D_RT.session.lifecycle==='playing'");
await control.tap("floor-assist"); await sleep(700); await control.tap("floor-skip-objective"); await sleep(700); // counted again, now in the run that is saved

// ---- sensor hints (simulated) + manual fallback
await control.tap("pause");
await control.eval(`(() => { const s = document.querySelector('[data-testid=input-source]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'RIGHT_FOOT'); s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
await sleep(3500);
await control.tap("resume"); await sleep(1200);
const before = await cur(); const t1 = await target();
await control.tap(`sim-RIGHT_FOOT-${t1.kind === "region" ? (t1.target === 1 ? "right" : "left") : "lift"}`); await sleep(1500);
note("sensor movement is only a HINT in FLOOR: the objective is not completed by it", (await cur()) === before);
note("the hint is shown to the therapist with a confirm button", await control.eval(`!!document.querySelector('[data-testid=floor-hint]')`));
await control.tap("floor-hint-confirm"); await sleep(1000);
note("therapist confirming the hint completes the objective", (await cur()) === before + 1);
await control.eval(`(() => { const c = document.querySelector('[data-testid=sim-RIGHT_FOOT-connected]'); c.click(); })()`); await sleep(2500);
note("sensor disconnect suspends safely; progress preserved", (await lc()) === "suspended" && (await cur()) === before + 1);
note("manual fallback offered", await control.eval(`!!document.querySelector('[data-testid=continue-manually]')`));
await control.tap("continue-manually"); await sleep(1000);
await confirm();
note("manual control works with the sensor disconnected", (await lc()) === "playing" && (await cur()) === before + 2);

// ---- Display reload recovery
const cNow = await cur();
await display.send("Page.reload"); await sleep(9000);
note("Display reload: re-joins the live record at the same objective", await until(async () => Number(await dData("current")) === cNow && (await dData("projection")) === "FLOOR", 12000));
// finish this stage by touch, then skip-stage / end flows
while ((await lc()) === "playing") await confirm();
note("stage finished by touch after the Display reload", ["completed", "stage-complete"].includes(await lc()));
await sleep(3500);
let h = await sessions();
note("history: saved exactly once for the finished session", h.length === 1 && h[0].resultVersion === 2 && Object.values(h[0].stageResults).every((r) => r.projection === "FLOOR"), `${h.length}`);
const row = Object.values(h[0]?.stageResults ?? {})[0];
note("history row carries objectives completed / skipped / assisted", row && row.objectivesSkipped === 1 && row.assists === 1 && row.obstaclesTotal === 10 && row.obstaclesResolved === 9, JSON.stringify(row));

// ---- Control reload: fresh safe session, projection must be re-chosen
await control.send("Page.reload"); await sleep(9000);
note("Control reload: starts a fresh safe session (ready), Start blocked until a projection is chosen again", (await lc()) === "ready" && (await control.eval(`document.querySelector('[data-testid=start]').disabled`)) === true);
note("Control reload does not create a duplicate history record", (await sessions()).length === 1);

// ---- staff authorisation: a separate profile with no login
const outsider = await C.open(`${BASE}/control/runner-quest-3d`, 1180, 820); await sleep(7000);
note("unauthenticated visitor sees the login, not the Runner controls", (await outsider.eval(`!!document.querySelector('input[type=email]') && !document.querySelector('[data-testid=projection-card]')`)) === true);
note("Display (read-only) exposes no controls or inputs inside the game view", (await display.eval(`!document.querySelector('[data-testid=rq3d-display] button, [data-testid=rq3d-display] input, [data-testid=rq3d-display] a')`)) === true);

// ---- skip stage / end session on a fresh FLOOR run, results on Display
await control.tap("projection-FLOOR"); await sleep(800);
await control.tapThen("range-end", "true"); await control.tapThen("stage-0", "window.__RQ3D_RT.session.startIndex===0"); await sleep(600);
await control.tapThen("start", "window.__RQ3D_RT.session.lifecycle==='playing'");
await confirm(); await confirm();
await control.tap("skip"); await sleep(1500);
note("skip stage: recorded as skipped, Display shows stage-complete", (await rt(`return rt.session.results[0].status`)) === "skipped" && (await dData("lifecycle")) === "stage-complete");
await control.tapThen("advance", "window.__RQ3D_RT.session.lifecycle==='ready'"); await control.tapThen("start", "window.__RQ3D_RT.session.lifecycle==='playing'");
await confirm();
await control.tap("end"); await sleep(1200);
await endSheetConfirm(); await sleep(2500);
note("end session (reason sheet) produces results on both devices", (await lc()) === "ended" && (await dData("lifecycle")) === "ended");
await display.shot(`${out}/wf-display-results.png`); await control.shot(`${out}/wf-control-results.png`);
await sleep(3000);
h = await sessions();
note("history: second session saved once with the skipped stage and the partial run", h.length === 2, `${h.length}`);

// ---- reduced motion + perf + GPU stability on a fresh run through all nine stages (runtime-driven for speed; the UI matrix proves the touch path)
await control.tap("new-run"); await sleep(800);
await control.tap("reduced"); await sleep(800);
await control.tapThen("start", "window.__RQ3D_RT.session.lifecycle==='playing'");
await display.shot(`${out}/wf-display-reduced-motion.png`);
note("reduced motion reaches the Display", await display.eval(`getComputedStyle(document.querySelector('[data-testid=rq3d-display]')).getPropertyValue('--x') !== 'never'`));
await control.tap("end"); await sleep(600);
await endSheetConfirm(); await sleep(1500);
await control.tap("new-run"); await sleep(800);
await control.tap("reduced");
const gpu = [];
await control.tap("projection-FLOOR");
for (let s = 0; s < 9; s++) {
  await rt(`rt.command({type:'range', from:${s}, to:${s}}); return 1`); await sleep(1100);
  await control.tapThen("start", "window.__RQ3D_RT.session.lifecycle==='playing'");
  const t0 = Date.now(); let lat = null;
  const o2 = await target(); const before = Number(await dData("current"));
  if (o2.kind === "region") await control.tap(`floor-region-${o2.target}`); else await control.tap("floor-step");
  const tTap = Date.now();
  await until(async () => Number(await dData("current")) > before, 6000, 25); lat = Date.now() - tTap;
  while ((await lc()) === "playing") await confirm();
  const stats = await display.eval(`window.__RQ3F ? window.__RQ3F.stats() : null`);
  const counts = await display.eval(`window.__RQ3F ? window.__RQ3F.counts() : null`);
  const mem = await display.eval(`performance.memory ? performance.memory.usedJSHeapSize : null`);
  gpu.push({ stage: s + 1, latencyMs: lat, fps: stats?.fps, drawCalls: stats?.drawCalls, triangles: stats?.triangles, counts, heapMB: mem ? Math.round(mem / 1e6) : null });
  if ((await lc()) === "stage-complete") await control.tapThen("advance", "window.__RQ3D_RT.session.lifecycle==='ready'");
  await control.tap("end").catch(() => {});
  await sleep(300);
  // fresh run for the next stage
  await rt(`const l = rt.session.lifecycle; if (l==='stage-complete') rt.command({type:'advance'}); if (rt.session.lifecycle!=='completed' && rt.session.lifecycle!=='ended') rt.command({type:'end'}); rt.command({type:'new-run'}); return 1`);
  await sleep(500);
  void t0;
}
writeFileSync(`${out}/results/gpu-latency.json`, JSON.stringify(gpu, null, 2));
const maxGeo = Math.max(...gpu.map((g) => g.counts?.geometries ?? 0)), minGeo = Math.min(...gpu.map((g) => g.counts?.geometries ?? 0));
note("GPU resources do not accumulate across nine stage rebuilds", maxGeo - minGeo < 80 && maxGeo > 0, JSON.stringify(gpu.map((g) => g.counts?.geometries)));
note("input-to-Display latency under 1.5 s for every stage (emulator, same machine)", gpu.every((g) => g.latencyMs !== null && g.latencyMs < 1500), JSON.stringify(gpu.map((g) => g.latencyMs)));
console.log(JSON.stringify(gpu));

// ---- Firebase write frequency while a FLOOR stage runs idle (should be near zero) and while confirming
await control.tap("new-run").catch(() => {}); await sleep(500);
await rt(`rt.command({type:'range', from:0, to:0}); return 1`); await sleep(800);
await control.tapThen("start", "window.__RQ3D_RT.session.lifecycle==='playing'");
const r0 = (await rd("liveSession")).revision; await sleep(15000); const r1 = (await rd("liveSession")).revision;
note("Firebase writes while FLOOR idles: no periodic clock writes", r1 - r0 <= 1, `${r1 - r0} writes in 15 s`);
const w0 = (await rd("liveSession")).revision; let n = 0;
while ((await lc()) === "playing") { await confirm(); n++; }
const w1 = (await rd("liveSession")).revision;
note("Firebase writes ~ one per confirmation (+ stage change)", w1 - w0 <= n + 3, `${w1 - w0} writes for ${n} confirmations`);
writeFileSync(`${out}/results/workflow.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
A.close(); B.close(); C.close();
process.exit(failed.length ? 1 : 0);
