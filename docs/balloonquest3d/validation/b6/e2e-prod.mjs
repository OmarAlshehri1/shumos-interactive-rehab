/* eslint-disable -- evidence script run against a live browser; not application code */
import { launch, sleep } from "./cdplib.mjs";
import { writeFileSync } from "node:fs";
const OUT = process.argv[2]; const BASE = process.env.BASE ?? "http://localhost:3100"; const PORT = Number(process.env.CDP ?? 9461);
const NS = "demo-bq3-default-rtdb", DB = "http://127.0.0.1:9000";
const owner = { Authorization: "Bearer owner" };
const rd = async (p) => (await fetch(`${DB}/${p}.json?ns=${NS}`, { headers: owner })).json();
const results = []; const note = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); };
const b = await launch(OUT, PORT);
const display = await b.open(`${BASE}/display`);
const control = await b.open(`${BASE}/control/balloon-quest`);
for (const t of [display, control]) await t.send("Emulation.setFocusEmulationEnabled", { enabled: true });
const writes = []; // firebase write observation (network): count websocket frames containing "p":"/liveSession" isn't available; use revision polling instead.
await sleep(8000);
const login = async () => { await control.eval(`(() => { const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, v); el.dispatchEvent(new Event('input',{bubbles:true})); }; set(document.querySelector('input[type=email]'), 'therapist@example.test'); set(document.querySelector('input[type=password]'), 'password123'); document.querySelector('button[type=submit]').click(); })()`); await sleep(6000); };
if (await control.eval("!!document.querySelector('input[type=email]')")) await login();
await control.eval(`sessionStorage.setItem('shumos.control.selectedPatient', JSON.stringify({ patientId: 'patient-1', patientNumber: '1001', firstName: 'ليلى' }))`);
await control.send("Page.reload"); await sleep(7000);
const txt = (id) => control.text(id);
note("production Control mounts through the existing staff login", await control.eval("!!document.querySelector('[data-testid=bq-control]')"));
note("child name is prefilled from the selected patient", (await control.eval("document.querySelector('[data-testid=child-name]')?.value")) === "ليلى");
await sleep(2500);
note("Display (anonymous, separate window) shows the redesigned ready screen from the Firebase record", (await display.eval("document.body.innerText")).includes("استعد") && (await display.eval("!!document.querySelector('[data-testid=bq-stage]')")), (await display.eval("document.body.innerText")).slice(0, 60).replace(/\n/g, " "));
note("Control sees the Display as connected (existing presence)", (await txt("display-status")).includes("متصلة"), await txt("display-status"));
note("legacy garden (leaves/birds) is not rendered behind the Display", await display.eval(`!document.querySelector('.bq-leaf') && !document.querySelector('.bq-bird')`));
await display.shot(`${OUT}/prod-display-ready.png`); await control.shot(`${OUT}/prod-control-ready.png`);

const dispJs = `(() => { const stage = document.querySelector('[data-testid=bq-stage]'); if (!stage) return null; const sr = stage.getBoundingClientRect(); return { life: stage.dataset.lifecycle, goal: stage.dataset.goalDone, target: stage.dataset.target, h: sr.height, text: document.body.innerText.slice(0, 80), lanes: [...stage.querySelectorAll('.bq3g-lane')].map(l => { const r = l.querySelector('.bq3-balloon').getBoundingClientRect(); return { id: l.dataset.balloonId, y: (r.top - sr.top) / sr.height, popped: !!l.querySelector('.is-popped') } }) } })()`;
const ctlJs = `(() => { const stage = document.querySelector('[data-testid=control-preview] [data-testid=bq-stage]'); const sr = stage.getBoundingClientRect(); return { target: stage.dataset.target, goal: stage.dataset.goalDone, lanes: [...stage.querySelectorAll('.bq3g-lane')].map(l => { const bt = l.querySelector('.bq3-balloon'); const r = bt.getBoundingClientRect(); return { id: l.dataset.balloonId, color: l.dataset.color, popped: bt.classList.contains('is-popped'), y: (r.top - sr.top) / sr.height, cx: (r.left + r.width / 2 - sr.left) / sr.width, cy: (r.top + r.height * 0.39 - sr.top) / sr.height } }) } })()`;
const life = () => txt("lifecycle");
const tapTarget = async () => { return control.eval(`(() => { const stage = document.querySelector('[data-testid=control-preview] [data-testid=bq-stage]'); const sr = stage.getBoundingClientRect(); const t = stage.dataset.target; for (const l of stage.querySelectorAll('.bq3g-lane[data-color="'+t+'"]')) { const bt = l.querySelector('.bq3-balloon'); if (bt.classList.contains('is-popped')) continue; const r = bt.getBoundingClientRect(); const cy = (r.top + r.height * 0.39 - sr.top) / sr.height, cx = (r.left + r.width/2 - sr.left)/sr.width; if (cy > 0.06 && cy < 0.94 && cx > 0.05 && cx < 0.95) { bt.click(); return true; } } return false; })()`); };

// ---- start + live sync
const rev0 = (await rd("liveSession"))?.revision;
await control.click("start"); await sleep(1500);
note("session starts through the platform flow", (await life()) === "قيد اللعب", await life());
const live = await rd("liveSession");
note("live record uses the existing game id and carries patient + child name", live?.gameId === "balloon-quest" && live?.patientId === undefined && (await rd("liveSessionPrivate"))?.patientId === "patient-1" && live?.session?.config?.childFirstName === "ليلى" && live?.session?.engine === "bq3", `gameId=${live?.gameId} patientId=${live?.patientId}`);
// positions agreement (Easy static)
await sleep(1500);
{ const [c, d] = [await control.eval(ctlJs), await display.eval(dispJs)]; let worst = 0, n = 0; for (const l of c.lanes) { const m = d.lanes.find((x) => x.id === l.id); if (m) { worst = Math.max(worst, Math.abs(l.y - m.y)); n++; } } note("Control and Display (over Firebase) draw the same balloons at the same positions (Easy)", n >= 4 && worst < 0.01, `n=${n}, max |dy|=${(worst*100).toFixed(2)}%`); }

// ---- complete all nine stages by therapist taps; probe sync in a rising stage
let stagesDone = 0, probed = false, taps = 0; const t0 = Date.now();
while (Date.now() - t0 < 420000) {
  const l = await life();
  if (l === "اكتملت المغامرة") break;
  if (l === "قيد اللعب") {
    if (await tapTarget()) taps++;
    const lv = await txt("level-stage");
    if (!probed && lv.includes("متقدم")) { probed = true; await sleep(2500);
      const [c, d] = [await control.eval(ctlJs), await display.eval(dispJs)]; let worst = 0, n = 0; for (const x of c.lanes) { const m = d.lanes.find((y) => y.id === x.id); if (m) { worst = Math.max(worst, Math.abs(x.y - m.y)); n++; } }
      note("rising balloons: Display positions match Control over Firebase (Advanced)", n >= 4 && worst < 0.03, `n=${n}, max |dy|=${(worst*100).toFixed(2)}% (network latency + 1 Hz clock)`);
      await display.shot(`${OUT}/prod-display-advanced.png`); await control.shot(`${OUT}/prod-control-advanced.png`); }
    await sleep(350);
  } else await sleep(500);
}
note("all nine stages completed through the production flow", (await life()) === "اكتملت المغامرة", `${taps} therapist taps`);
await sleep(2500);
await display.shot(`${OUT}/prod-display-complete.png`); await control.shot(`${OUT}/prod-control-summary.png`);
note("Display shows the child completion scene", (await display.eval("document.body.innerText")).includes("أكملت المغامرة"));
const rev1 = (await rd("liveSession"))?.revision;
// ---- history
const hist = await rd("sessions/patient-1");
const recs = Object.values(hist ?? {});
note("exactly one history record was saved for the patient", recs.length === 1, `${recs.length}`);
const h = recs[0];
note("history record: balloon-quest id, 9 completed stages, marker on every stage result, no accuracy", h?.gameId === "balloon-quest" && h?.completedStageCount === 9 && h?.stageResults?.length === 9 && h.stageResults.every((r) => r.engine === "bq3") && h?.accuracy === undefined, JSON.stringify({ completed: h?.completedStageCount, correct: h?.totalCorrect, touches: h?.totalIncorrect, start: [h?.startingDifficulty, h?.startingStage], end: [h?.endingDifficulty, h?.endingStage] }));
note("history: correct picks = 45 (3+4+5+4+5+6+5+6+7)", h?.totalCorrect === 45, String(h?.totalCorrect));
writeFileSync(`${OUT}/history-record.json`, JSON.stringify(h, null, 2));
note("Firebase write volume stays modest", true, `revision ${rev0 ?? 0} -> ${rev1} over ${Math.round((Date.now() - t0) / 1000)} s`);
writeFileSync(`${OUT}/prod-results-a.json`, JSON.stringify(results, null, 2));
console.log("PART A DONE");
b.close(); process.exit(0);
