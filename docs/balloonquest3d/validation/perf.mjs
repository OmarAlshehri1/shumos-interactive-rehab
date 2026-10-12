
import { launch, sleep } from "./cdplib.mjs";
import { writeFileSync } from "node:fs";
const OUT = process.argv[2];
const SOAK_MS = Number(process.argv[3] ?? 240000);
const BASE = "http://localhost:3000";
const b = await launch(OUT, 9446);
const display = await b.open(`${BASE}/display/balloon-quest-3d-prototype`);
const control = await b.open(`${BASE}/control/balloon-quest-3d-prototype`);
for (const t of [display, control]) await t.send("Emulation.setFocusEmulationEnabled", { enabled: true });
await sleep(4500);

const stateJs = `(() => { const stage = document.querySelector('[data-testid=control-preview] [data-testid=bq-stage]'); if (!stage) return null; const sr = stage.getBoundingClientRect(); const pad = document.querySelector('[data-testid=sim-pad]').getBoundingClientRect();
 return { sr: { x: sr.left, y: sr.top, w: sr.width, h: sr.height }, pad: { x: pad.left, y: pad.top, w: pad.width, h: pad.height }, target: stage.dataset.target, lanes: [...stage.querySelectorAll('.bq3g-lane')].map(l => { const r = l.querySelector('.bq3-balloon').getBoundingClientRect(); return { id: l.dataset.balloonId, color: l.dataset.color, popped: l.querySelector('.bq3-balloon').classList.contains('is-popped'), x: r.left, y: r.top, w: r.width, h: r.height } }) } })()`;
const bodyCentre = (st, l) => ({ nx: (l.x + l.w / 2 - st.sr.x) / st.sr.w, ny: (l.y + l.h * 0.387 - st.sr.y) / st.sr.h });
const moveTo = async (st, nx, ny) => control.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: st.pad.x + nx * st.pad.w, y: st.pad.y + ny * st.pad.h, button: "none" });

// instrumentation
await display.eval(`(() => { window.__t0 = performance.timeOrigin; window.__pops = {}; window.__fps = { frames: [], last: performance.now(), run: true };
  const loop = (t) => { if (!window.__fps.run) return; window.__fps.frames.push(t - window.__fps.last); window.__fps.last = t; requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  new MutationObserver((muts) => { for (const m of muts) { const el = m.target; if (el.classList && el.classList.contains('is-popped')) { const id = el.closest('.bq3g-lane')?.dataset.balloonId; if (id && !window.__pops[id]) window.__pops[id] = performance.timeOrigin + performance.now(); } } }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  new MutationObserver((muts) => { for (const m of muts) for (const n of m.addedNodes) { const b = n.querySelector?.('.is-popped') ?? (n.classList?.contains('is-popped') ? n : null); if (b) { const id = b.closest('.bq3g-lane')?.dataset.balloonId; if (id && !window.__pops[id]) window.__pops[id] = performance.timeOrigin + performance.now(); } } }).observe(document.body, { subtree: true, childList: true });
  return true; })()`);
await control.eval(`(() => { window.__moves = []; window.__pops = {}; window.__fps = { frames: [], last: performance.now(), run: true };
  document.querySelector('[data-testid=sim-pad]').addEventListener('pointermove', () => { window.__lastMove = performance.timeOrigin + performance.now(); }, true);
  const loop = (t) => { if (!window.__fps.run) return; window.__fps.frames.push(t - window.__fps.last); window.__fps.last = t; requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  new MutationObserver((muts) => { for (const m of muts) { const el = m.target; if (el.classList && el.classList.contains('is-popped')) { const id = el.closest('.bq3g-lane')?.dataset.balloonId; if (id && !window.__pops[id]) window.__pops[id] = performance.timeOrigin + performance.now(); } } }).observe(document.querySelector('[data-testid=control-preview]'), { subtree: true, attributes: true, attributeFilter: ['class'] });
  return true; })()`);

await control.select("sel-input", "right-hand");
await control.eval(`(() => { const s = document.querySelector('[data-testid=sim-source]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'RIGHT_HAND'); s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
await control.select("sel-difficulty", "ADVANCED");
await control.select("sel-scope", "level");
let st = await control.eval(stateJs);
await moveTo(st, 0.03, 0.03); await sleep(500);
await control.click("start"); await sleep(600);

const lifecycle = () => control.text("lifecycle");
const pairs = [];
const samples = [];
const t0 = Date.now();
let lastSample = 0, selections = 0;
const stats = (arr) => { const a = [...arr].sort((x, y) => x - y); const q = (p) => a[Math.min(a.length - 1, Math.floor(p * a.length))]; return { n: a.length, mean: a.reduce((s, x) => s + x, 0) / (a.length || 1), p50: q(0.5), p95: q(0.95), p99: q(0.99), max: a[a.length - 1] }; };
async function sampleHealth(tag) {
  const d = await display.eval(`({ nodes: document.querySelectorAll('*').length, lanes: document.querySelectorAll('.bq3g-lane').length, svg: document.querySelectorAll('svg').length, heap: performance.memory?.usedJSHeapSize ?? null })`);
  const c = await control.eval(`({ nodes: document.querySelectorAll('*').length, heap: performance.memory?.usedJSHeapSize ?? null })`);
  samples.push({ tag, tSec: Math.round((Date.now() - t0) / 1000), display: d, control: c });
  console.log(tag, `t=${Math.round((Date.now() - t0) / 1000)}s`, JSON.stringify({ dDom: d.nodes, dLanes: d.lanes, dHeapMB: d.heap && Math.round(d.heap / 1e6), cDom: c.nodes, cHeapMB: c.heap && Math.round(c.heap / 1e6) }));
}
await sampleHealth("start");
while (Date.now() - t0 < SOAK_MS) {
  const life = await lifecycle();
  if (life === "اكتملت المغامرة" || life === "أُنهيت الجلسة") { await control.click("new-run"); await sleep(300); await control.click("start"); await sleep(500); continue; }
  if (life !== "قيد اللعب") { await sleep(500); continue; }
  st = await control.eval(stateJs);
  const live = st.lanes.filter((l) => !l.popped).map((l) => ({ l, c: bodyCentre(st, l) })).filter((x) => x.c.nx > 0.06 && x.c.nx < 0.94 && x.c.ny > 0.14 && x.c.ny < 0.88);
  const tgt = live.find((x) => x.l.color === st.target);
  if (tgt && Math.random() < 0.8) {
    await moveTo(st, tgt.c.nx, tgt.c.ny);
    const tc = await control.eval("window.__lastMove");
    pairs.push({ id: tgt.l.id, tc }); selections++;
    await sleep(120); await moveTo(st, 0.03, 0.5);
  }
  await sleep(700 + Math.random() * 700);
  if (Date.now() - lastSample > 30000) { lastSample = Date.now(); await sampleHealth("soak"); }
}
await sampleHealth("end");
const dFrames = await display.eval(`(() => { window.__fps.run = false; return window.__fps.frames.slice(5); })()`);
const cFrames = await control.eval(`(() => { window.__fps.run = false; return window.__fps.frames.slice(5); })()`);
const dPops = await display.eval("window.__pops"), cPops = await control.eval("window.__pops");
const toDisplay = [], toControlUi = [];
for (const p of pairs) { if (dPops[p.id] && p.tc) toDisplay.push(dPops[p.id] - p.tc); if (cPops[p.id] && p.tc) toControlUi.push(cPops[p.id] - p.tc); }
const fpsOf = (f) => { const s = stats(f); return { frames: f.length, avgFps: Math.round(1000 / s.mean * 10) / 10, medianMs: Math.round(s.p50 * 10) / 10, p95Ms: Math.round(s.p95 * 10) / 10, p99Ms: Math.round(s.p99 * 10) / 10, maxMs: Math.round(s.max), over33ms: f.filter((x) => x > 33.4).length, over50ms: f.filter((x) => x > 50).length }; };
const report = {
  soakSeconds: Math.round((Date.now() - t0) / 1000), selections,
  displayFrames: fpsOf(dFrames), controlFrames: fpsOf(cFrames),
  latencyMs_pointerToDisplayPop: { ...stats(toDisplay) }, latencyMs_pointerToControlPreviewPop: { ...stats(toControlUi) },
  samples,
  note: "Headless Chrome on the dev server (Next dev build, unoptimised); simulated pointer through the real hub; not a physical projector or sensor measurement.",
};
writeFileSync(`${OUT}/perf-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ displayFrames: report.displayFrames, controlFrames: report.controlFrames, toDisplay: report.latencyMs_pointerToDisplayPop, toControl: report.latencyMs_pointerToControlPreviewPop }, null, 1));
b.close(); process.exit(0);
