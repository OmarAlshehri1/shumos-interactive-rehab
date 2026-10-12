// Full nine-stage software session: Control + Display in two real Chrome windows, keyboard source,
// real key events, deliberately slow responses at some obstacles. Compares Control and Display each stage.
import { launch, sleep } from "./cdplib.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
const out = process.argv[2];
const quality = process.argv[3] ?? "high";
mkdirSync(`${out}/results`, { recursive: true });
const b = await launch(out, 9562);
const display = await b.open(`http://127.0.0.1:3210/display/runner-quest-3d-prototype?diag=1&quality=${quality}&auto=0`, 1600, 900);
const control = await b.open("http://127.0.0.1:3210/control/runner-quest-3d-prototype", 1400, 1000);
await sleep(7000);
const rtEval = (js) => control.eval(`(() => { const rt = window.__RQ3D_RT; ${js} })()`);
await rtEval(`rt.command({type:'settings', patch:{speed:4.5, spacing:0.8}}); rt.command({type:'range', from:0, to:8}); return 1`);
const decide = `(() => { const rt = window.__RQ3D_RT; const s = rt.session; const st = s.stage; if (!st || s.lifecycle !== 'playing') return null;
 const i = st.encounters.findIndex((e, k) => !st.obstacles[k].resolved && e.z >= st.distance && (e.kind==='side'||e.kind==='hurdle'||e.kind==='gate'));
 if (i < 0) return null; const e = st.encounters[i]; const ahead = e.z - st.distance; if (ahead > 15) return null;
 if (e.kind === 'hurdle') { if (e.lanes.includes(st.lane) && !st.obstacles[i].armed) return ahead <= 6.5 ? 'step' : null; return null; }
 const free = [-1,0,1].filter(l => !e.lanes.includes(l)); if (free.includes(st.lane)) return null;
 const goal = free.reduce((a,b)=> Math.abs(a-st.lane) <= Math.abs(b-st.lane) ? a : b); return goal < st.lane ? 'left' : 'right'; })()`;
const KEY = { left: "ArrowLeft", right: "ArrowRight", step: " " };
const log = { stages: [], mismatches: [], keyEvents: 0 };
await control.bringToFront();
const t0 = Date.now();
let stageStartedAt = Date.now();
let slowOnce = new Set();
for (let guard = 0; guard < 200000; guard++) {
  const lc = await control.eval(`document.querySelector('[data-testid=rq3d-control]')?.dataset.lifecycle`);
  if (lc === "ready") { stageStartedAt = Date.now(); await control.click("start"); await sleep(400); continue; }
  if (lc === "stage-complete") {
    const idx = await rtEval(`return rt.session.results.length`);
    await sleep(900);
    await display.shot(`${out}/e2e-stage-${idx}-complete.png`);
    const c = await rtEval(`const r = rt.session.results[rt.session.results.length-1]; return {index:r.index, stars:r.stars, holds:r.holds, resolved:r.obstaclesResolved, total:r.obstaclesTotal, status:r.status}`);
    const dispLc = await display.eval(`document.querySelector('[data-testid=rq3d-display]')?.dataset.lifecycle`);
    log.stages.push({ ...c, ms: Date.now() - stageStartedAt, displayLifecycle: dispLc });
    if (dispLc !== "stage-complete") log.mismatches.push({ stage: c.index, displayLifecycle: dispLc });
    await control.click("advance"); await sleep(700); continue;
  }
  if (lc === "completed" || lc === "ended") break;
  if (lc === "playing") {
    const a = await control.eval(decide);
    if (a) {
      // be a slow child at the first obstacle of stages 2, 4 and 6: wait 2.5 s while the runner holds
      const key = await rtEval(`return rt.session.stage.index + ':' + rt.session.stage.holds`);
      if (!slowOnce.has(key) && ["1", "3", "5"].includes(key.split(":")[0]) && (await rtEval(`return rt.session.stage.holding`))) { slowOnce.add(key); await sleep(2500); }
      await control.key("keyDown", KEY[a]); await control.key("keyUp", KEY[a]); log.keyEvents++;
    }
  }
  await sleep(90);
  if (Date.now() - t0 > 40 * 60 * 1000) { log.timeout = true; break; }
}
await sleep(1500);
await control.shot(`${out}/e2e-final-control.png`); await display.shot(`${out}/e2e-final-display.png`);
const summary = await rtEval(`const s = rt.session.summary; return s`);
log.summary = summary;
log.totalMs = Date.now() - t0;
log.displayStats = await display.eval(`JSON.stringify(window.__RQ3D?.stats())`);
log.errorsDisplay = display.events.filter((e) => e.method === "Runtime.exceptionThrown" || (e.method === "Runtime.consoleAPICalled" && e.params.type === "error")).length;
log.errorsControl = control.events.filter((e) => e.method === "Runtime.exceptionThrown" || (e.method === "Runtime.consoleAPICalled" && e.params.type === "error")).length;
writeFileSync(`${out}/results/e2e-full.json`, JSON.stringify(log, null, 1));
console.log(JSON.stringify({ stages: log.stages.length, mismatches: log.mismatches.length, completed: summary?.completedStages, totalStars: summary?.totalStars, keyEvents: log.keyEvents, minutes: (log.totalMs / 60000).toFixed(1), errors: [log.errorsDisplay, log.errorsControl] }));
b.close();
