
import { launch, sleep } from "./cdplib.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
const OUT = process.argv[2];
const DURATION = Number(process.argv[3] ?? 60000);
mkdirSync(`${OUT}/frames`, { recursive: true });
const BASE = "http://localhost:3000";
const b = await launch(OUT, 9449);
const display = await b.open(`${BASE}/display/balloon-quest-3d-prototype`, 1280, 720);
const control = await b.open(`${BASE}/control/balloon-quest-3d-prototype`);
for (const t of [display, control]) await t.send("Emulation.setFocusEmulationEnabled", { enabled: true });
await sleep(4500);
const stateJs = `(() => { const stage = document.querySelector('[data-testid=control-preview] [data-testid=bq-stage]'); const sr = stage.getBoundingClientRect(); const pad = document.querySelector('[data-testid=sim-pad]').getBoundingClientRect();
 return { sr: { x: sr.left, y: sr.top, w: sr.width, h: sr.height }, pad: { x: pad.left, y: pad.top, w: pad.width, h: pad.height }, target: stage.dataset.target, lanes: [...stage.querySelectorAll('.bq3g-lane')].map(l => { const r = l.querySelector('.bq3-balloon').getBoundingClientRect(); return { id: l.dataset.balloonId, color: l.dataset.color, popped: l.querySelector('.bq3-balloon').classList.contains('is-popped'), x: r.left, y: r.top, w: r.width, h: r.height } }) } })()`;
const bodyCentre = (st, l) => ({ nx: (l.x + l.w / 2 - st.sr.x) / st.sr.w, ny: (l.y + l.h * 0.387 - st.sr.y) / st.sr.h });
const moveTo = async (st, nx, ny) => control.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: st.pad.x + nx * st.pad.w, y: st.pad.y + ny * st.pad.h, button: "none" });
await control.select("sel-input", "right-hand");
await control.eval(`(() => { const s = document.querySelector('[data-testid=sim-source]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'RIGHT_HAND'); s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
await control.select("sel-difficulty", "MEDIUM"); await control.select("sel-scope", "all");
let st = await control.eval(stateJs); await moveTo(st, 0.03, 0.03); await sleep(500);
// screencast of the CHILD display
const frames = []; let n = 0;
display.ws.addEventListener("message", (m) => { const d = JSON.parse(m.data); if (d.method === "Page.screencastFrame") { const i = n++; writeFileSync(`${OUT}/frames/f${String(i).padStart(5, "0")}.jpg`, Buffer.from(d.params.data, "base64")); frames.push(d.params.metadata.timestamp); display.send("Page.screencastFrameAck", { sessionId: d.params.sessionId }); } });
await display.send("Page.startScreencast", { format: "jpeg", quality: 85, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
await control.click("start");
const t0 = Date.now();
while (Date.now() - t0 < DURATION) {
  const life = await control.text("lifecycle");
  if (life === "اكتملت المغامرة") break;
  if (life !== "قيد اللعب") { await sleep(400); continue; }
  st = await control.eval(stateJs);
  const live = st.lanes.filter((l) => !l.popped).map((l) => ({ l, c: bodyCentre(st, l) })).filter((x) => x.c.nx > 0.08 && x.c.nx < 0.92 && x.c.ny > 0.16 && x.c.ny < 0.86);
  const tgt = live.find((x) => x.l.color === st.target);
  const wrong = live.find((x) => x.l.color !== st.target);
  if (Math.random() < 0.18 && wrong) { await moveTo(st, wrong.c.nx, wrong.c.ny); await sleep(350); await moveTo(st, 0.03, 0.5); }
  else if (tgt) { await moveTo(st, tgt.c.nx, tgt.c.ny); await sleep(140); await moveTo(st, 0.03, 0.5); }
  await sleep(900 + Math.random() * 900);
}
await display.send("Page.stopScreencast");
await sleep(500);
// concat list with real frame durations
let list = "";
for (let i = 0; i < frames.length; i++) { const dur = i + 1 < frames.length ? Math.max(0.001, frames[i + 1] - frames[i]) : 0.04; list += `file 'frames/f${String(i).padStart(5, "0")}.jpg'\nduration ${dur.toFixed(4)}\n`; }
writeFileSync(`${OUT}/list.txt`, list);
console.log(`frames=${frames.length} span=${(frames[frames.length - 1] - frames[0]).toFixed(1)}s`);
b.close(); process.exit(0);
