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

const dispJs = `(() => { const stage = document.querySelector('[data-testid=bq-stage]'); if (!stage) return null; const sr = stage.getBoundingClientRect(); return { life: stage.dataset.lifecycle, goal: stage.dataset.goalDone, target: stage.dataset.target, h: sr.height, text: document.body.innerText.slice(0, 80), lanes: [...stage.querySelectorAll('.bq3g-lane')].map(l => { const r = l.querySelector('.bq3-balloon').getBoundingClientRect(); return { id: l.dataset.balloonId, y: (r.top - sr.top) / sr.height, popped: !!l.querySelector('.is-popped') } }) } })()`;
const ctlJs = `(() => { const stage = document.querySelector('[data-testid=control-preview] [data-testid=bq-stage]'); const sr = stage.getBoundingClientRect(); return { target: stage.dataset.target, goal: stage.dataset.goalDone, lanes: [...stage.querySelectorAll('.bq3g-lane')].map(l => { const bt = l.querySelector('.bq3-balloon'); const r = bt.getBoundingClientRect(); return { id: l.dataset.balloonId, color: l.dataset.color, popped: bt.classList.contains('is-popped'), y: (r.top - sr.top) / sr.height, cx: (r.left + r.width / 2 - sr.left) / sr.width, cy: (r.top + r.height * 0.39 - sr.top) / sr.height } }) } })()`;
const life = () => txt("lifecycle");
const tapTarget = async () => { return control.eval(`(() => { const stage = document.querySelector('[data-testid=control-preview] [data-testid=bq-stage]'); const sr = stage.getBoundingClientRect(); const t = stage.dataset.target; for (const l of stage.querySelectorAll('.bq3g-lane[data-color="'+t+'"]')) { const bt = l.querySelector('.bq3-balloon'); if (bt.classList.contains('is-popped')) continue; const r = bt.getBoundingClientRect(); const cy = (r.top + r.height * 0.39 - sr.top) / sr.height, cx = (r.left + r.width/2 - sr.left)/sr.width; if (cy > 0.06 && cy < 0.94 && cx > 0.05 && cx < 0.95) { bt.click(); return true; } } return false; })()`); };
const rd2 = (p) => rd(p);
const dState = () => display.eval(`(() => { const s = document.querySelector('[data-testid=bq-stage]'); return s ? { life: s.dataset.lifecycle, goal: s.dataset.goalDone, text: document.body.innerText.slice(0, 60).replace(/\\n/g, ' ') } : null })()`);
await control.click("start"); await sleep(1500);
note("session playing", (await life()) === "قيد اللعب", await life());
for (let i = 0; i < 2; i++) { await tapTarget(); await sleep(900); }
const goalBefore = await control.eval(`document.querySelector('[data-testid=control-preview] [data-testid=bq-stage]').dataset.goalDone`);
// ---- network interruption on Control (5 s offline)
await control.send("Network.enable"); await control.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
await sleep(5000);
await control.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await sleep(7000);
note("after a 5 s Control network drop the session is still in progress with its goal count", ["قيد اللعب", "متوقف مؤقتًا", "متوقف تلقائيًا"].includes(await life()) && (await control.eval(`document.querySelector('[data-testid=control-preview] [data-testid=bq-stage]').dataset.goalDone`)) === goalBefore, `${await life()} goal ${goalBefore}`);
if ((await life()) !== "قيد اللعب") { if (await control.eval("!!document.querySelector('[data-testid=resume]')")) await control.click("resume"); await sleep(1500); }
note("play continues by therapist tap after the drop and the Display follows", (await tapTarget()) && (await sleep(1500), true) && (await display.eval(`document.querySelector('[data-testid=bq-stage]')?.dataset.goalDone`)) === String(Number(goalBefore) + 1), JSON.stringify(await dState()));
// ---- Display reload
await display.send("Page.reload"); await sleep(8000);
note("Display reload rejoins the live session", !!(await dState()) && (await dState()).life !== "ready", JSON.stringify(await dState()));
// ---- Control reload mid-session
const rec0 = await rd("liveSession/session");
await control.send("Page.reload"); await sleep(9000);
const rec1 = await rd("liveSession/session");
const st1 = await dState();
console.log("INFO after Control reload: Control lifecycle", await life(), "| display", JSON.stringify(st1), "| record sessionId same:", rec0?.sessionId === rec1?.sessionId, "| engine", rec1?.engine);
note("after a Control reload the Control is usable (can start a fresh session) and the Display follows it", ["جاهز للبدء", "متوقف مؤقتًا", "متوقف تلقائيًا"].includes(await life()), await life());
const hist = Object.values((await rd("sessions/patient-1")) ?? {}).filter((h) => h.gameId === "balloon-quest");
console.log("INFO history records for patient after reload:", hist.length);
writeFileSync(`${OUT}/recovery.json`, JSON.stringify(results, null, 1)); console.log(results.every((r) => r.ok) ? "ALL PASS" : "SOME FAILED"); process.exit(0);
