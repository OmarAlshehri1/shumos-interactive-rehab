// R5 performance: Control + Display together, bot-played Advanced stage 3, frame times from rAF inside the Display page,
// scene stats, input->Display latency via MutationObserver on both pages, heap with forced GC.
import { launch, sleep } from "./cdplib.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
const [out, quality = "high", seconds = "60", w = "1920", h = "1080"] = process.argv.slice(2);
mkdirSync(`${out}/results`, { recursive: true });
const b = await launch(out, 9564, ["--js-flags=--expose-gc", "--enable-precise-memory-info"]);
const display = await b.open(`http://127.0.0.1:3210/display/runner-quest-3d-prototype?quality=${quality}&auto=0`, +w, +h);
const control = await b.open("http://127.0.0.1:3210/control/runner-quest-3d-prototype", 1400, 900);
await sleep(7000);
const rt = (js) => control.eval(`(() => { const rt = window.__RQ3D_RT; ${js} })()`);
await rt(`rt.command({type:'settings', patch:{speed:3.2, spacing:0.8}}); rt.command({type:'range', from:8, to:8}); return 1`);
await display.eval(`(() => { window.__frames = []; window.__lat = []; let last = performance.now(); const loop = (t) => { window.__frames.push(t - last); last = t; requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  const el = document.querySelector('[data-testid=rq3d-display]'); new MutationObserver(() => { window.__lat.push(performance.timeOrigin + performance.now()); }).observe(el, { attributes: true, attributeFilter: ['data-laneseq'] }); })()`);
await control.eval(`window.__sent = []`);
await control.click("start"); await sleep(500);
const heap0 = await display.eval(`(gc(), performance.memory.usedJSHeapSize)`);
const decide = `(() => { const rt = window.__RQ3D_RT; const s = rt.session; const st = s.stage; if (!st || s.lifecycle !== 'playing') return null;
 const i = st.encounters.findIndex((e, k) => !st.obstacles[k].resolved && e.z >= st.distance && (e.kind==='side'||e.kind==='hurdle'||e.kind==='gate'));
 if (i < 0) return null; const e = st.encounters[i]; const ahead = e.z - st.distance; if (ahead > 15) return null;
 if (e.kind === 'hurdle') { if (e.lanes.includes(st.lane) && !st.obstacles[i].armed) return ahead <= 6.5 ? 'step' : null; return null; }
 const free = [-1,0,1].filter(l => !e.lanes.includes(l)); if (free.includes(st.lane)) return null;
 const goal = free.reduce((a,b)=> Math.abs(a-st.lane) <= Math.abs(b-st.lane) ? a : b); return goal < st.lane ? 'left' : 'right'; })()`;
const KEY = { left: "ArrowLeft", right: "ArrowRight", step: " " };
const t0 = Date.now(); const sends = [];
await control.bringToFront();
while (Date.now() - t0 < +seconds * 1000) {
  const a = await control.eval(decide);
  if (a) { const wall = await control.eval(`performance.timeOrigin + performance.now()`); await control.key("keyDown", KEY[a]); await control.key("keyUp", KEY[a]); if (a !== "step") sends.push(wall); }
  if ((await rt(`return rt.session.lifecycle`)) === "stage-complete" || (await rt(`return rt.session.lifecycle`)) === "completed") break;
  await sleep(80);
}
const frames = await display.eval(`window.__frames.slice(30)`);
const lat = await display.eval(`window.__lat`);
const heap1 = await display.eval(`(gc(), performance.memory.usedJSHeapSize)`);
const stats = await display.eval(`window.__RQ3D.stats()`);
const sorted = [...frames].sort((a, b) => a - b), pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const latencies = sends.map((s, i) => (lat[i] !== undefined ? lat[i] - s : null)).filter((x) => x !== null && x >= 0 && x < 500);
latencies.sort((a, b) => a - b);
const res = {
  quality, viewport: `${w}x${h}`, seconds: +seconds, frames: frames.length,
  avgFps: 1000 / (frames.reduce((a, c) => a + c, 0) / frames.length), p50ms: pct(0.5), p95ms: pct(0.95), p99ms: pct(0.99), maxMs: sorted[sorted.length - 1], over33ms: frames.filter((f) => f > 33.4).length,
  scene: stats, heapMB: [heap0 / 1e6, heap1 / 1e6], latencyMs: latencies.length ? { n: latencies.length, p50: latencies[Math.floor(latencies.length / 2)], p95: latencies[Math.floor(latencies.length * 0.95)], max: latencies[latencies.length - 1] } : null,
  errors: [display, control].map((t) => t.events.filter((e) => e.method === "Runtime.exceptionThrown" || (e.method === "Runtime.consoleAPICalled" && e.params.type === "error")).length),
};
writeFileSync(`${out}/results/perf-${quality}-${w}.json`, JSON.stringify(res, null, 1));
console.log(JSON.stringify(res));
b.close();
