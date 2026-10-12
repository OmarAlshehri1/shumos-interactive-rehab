
import { launch, sleep } from "./cdplib.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
const OUT = process.argv[2]; const BASE = process.env.BASE ?? "http://localhost:3101"; const PORT = Number(process.env.CDP ?? 9463);
mkdirSync(`${OUT}/frames`, { recursive: true });
const b = await launch(OUT, PORT);
const display = await b.open(`${BASE}/display`, 1280, 720);
const control = await b.open(`${BASE}/control/balloon-quest`);
for (const t of [display, control]) await t.send("Emulation.setFocusEmulationEnabled", { enabled: true });
await sleep(8000);
if (await control.eval("!!document.querySelector('input[type=email]')")) { await control.eval(`(() => { const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, v); el.dispatchEvent(new Event('input',{bubbles:true})); }; set(document.querySelector('input[type=email]'), 'therapist@example.test'); set(document.querySelector('input[type=password]'), 'password123'); document.querySelector('button[type=submit]').click(); })()`); await sleep(6000); }
await control.eval(`sessionStorage.setItem('shumos.control.selectedPatient', JSON.stringify({ patientId: 'patient-1', patientNumber: '1001', firstName: 'ليلى' }))`);
await control.send("Page.reload"); await sleep(7000);
const txt = (id) => control.text(id); const life = () => txt("lifecycle");
const frames = []; let n = 0;
display.ws.addEventListener("message", (m) => { const d = JSON.parse(m.data); if (d.method === "Page.screencastFrame") { const i = n++; writeFileSync(`${OUT}/frames/f${String(i).padStart(5, "0")}.jpg`, Buffer.from(d.params.data, "base64")); frames.push(d.params.metadata.timestamp); display.send("Page.screencastFrameAck", { sessionId: d.params.sessionId }); } });
await display.send("Page.startScreencast", { format: "jpeg", quality: 85, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
const shot = async (name, tab = display) => { await tab.shot(`${OUT}/${name}.png`); console.log("shot", name); };
const tap = () => control.eval(`(() => { const stage = document.querySelector('[data-testid=control-preview] [data-testid=bq-stage]'); const sr = stage.getBoundingClientRect(); const t = stage.dataset.target; for (const l of stage.querySelectorAll('.bq3g-lane[data-color="'+t+'"]')) { const bt = l.querySelector('.bq3-balloon'); if (bt.classList.contains('is-popped')) continue; const r = bt.getBoundingClientRect(); const cy = (r.top + r.height * 0.39 - sr.top) / sr.height, cx = (r.left + r.width/2 - sr.left)/sr.width; if (cy > 0.1 && cy < 0.9 && cx > 0.08 && cx < 0.92) { bt.click(); return true; } } return false; })()`);
await shot("01-ready"); await shot("control-ready", control);
await control.click("start"); await sleep(2500);
await shot("02-easy");
const taken = new Set(); const level = async () => (await txt("level-stage")) ?? "";
let taps = 0; const t0 = Date.now(); let tapsInStage = 0, lastLevel = "";
while (Date.now() - t0 < 600000) {
  const l = await life();
  if (l === "اكتملت المغامرة") break;
  if (l === "اكتملت المرحلة") { if (!taken.has("stage-complete")) { taken.add("stage-complete"); await sleep(700); await shot("05-stage-complete"); } await sleep(500); continue; }
  if (l !== "قيد اللعب") { await sleep(400); continue; }
  const lv = await level();
  if (lv !== lastLevel) { lastLevel = lv; tapsInStage = 0; await sleep(2200);
    if (lv.includes("متوسط") && !taken.has("medium")) { taken.add("medium"); await shot("06-medium"); await shot("control-live", control); }
    if (lv.includes("متقدم") && !taken.has("advanced")) { taken.add("advanced"); await shot("07-advanced"); } }
  if (await tap()) {
    taps++; tapsInStage++;
    if (!taken.has("selection")) { taken.add("selection"); await sleep(180); await shot("03-correct-selection"); }
    if (tapsInStage === 2 && !taken.has("progress")) { taken.add("progress"); await sleep(600); await shot("04-stage-progress"); }
  }
  await sleep(900 + Math.random() * 900);
}
await sleep(2500);
await shot("08-session-complete"); await shot("control-summary", control);
await display.send("Page.stopScreencast"); await sleep(500);
let list = ""; for (let i = 0; i < frames.length; i++) { const dur = i + 1 < frames.length ? Math.max(0.001, frames[i + 1] - frames[i]) : 0.04; list += `file 'frames/f${String(i).padStart(5, "0")}.jpg'\nduration ${dur.toFixed(4)}\n`; }
writeFileSync(`${OUT}/list.txt`, list); console.log(`frames=${frames.length} span=${(frames[frames.length - 1] - frames[0]).toFixed(1)}s taps=${taps}`);
b.close(); process.exit(0);
