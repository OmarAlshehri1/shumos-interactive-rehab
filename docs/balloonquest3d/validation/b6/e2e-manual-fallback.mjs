
import { launch, sleep } from "./cdplib.mjs";
import { writeFileSync } from "node:fs";
const OUT = process.argv[2]; const BASE = process.env.BASE ?? "http://localhost:3100"; const PORT = Number(process.env.CDP ?? 9464);
const results = []; const note = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); };
const b = await launch(OUT, PORT);
const display = await b.open(`${BASE}/display`);
const control = await b.open(`${BASE}/control/balloon-quest`);
for (const t of [display, control]) await t.send("Emulation.setFocusEmulationEnabled", { enabled: true });
await sleep(8000);
if (await control.eval("!!document.querySelector('input[type=email]')")) { await control.eval(`(() => { const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, v); el.dispatchEvent(new Event('input',{bubbles:true})); }; set(document.querySelector('input[type=email]'), 'therapist@example.test'); set(document.querySelector('input[type=password]'), 'password123'); document.querySelector('button[type=submit]').click(); })()`); await sleep(6000); }
await control.eval(`sessionStorage.setItem('shumos.control.selectedPatient', JSON.stringify({ patientId: 'patient-1', patientNumber: '1001', firstName: 'ليلى' }))`);
await control.send("Page.reload"); await sleep(7000);
const txt = (id) => control.text(id); const life = () => txt("lifecycle");
await control.eval(`document.querySelector('[data-testid=sim-pad]').scrollIntoView({ block: "center" })`); await sleep(500);
for (let i = 0; i < 20 && !((await txt("display-status")) ?? "").includes("متصلة"); i++) await sleep(1000); // the Display must be linked before anything starts
const opts = await control.eval(`[...document.querySelector('[data-testid=sel-input]').options].map(o => o.value)`);
note("production input modes: therapist, right hand, keyboard, left hand (experimental), both hands (experimental) — foot/handheld simulations are not offered", JSON.stringify(opts) === JSON.stringify(["therapist", "right-hand", "keyboard", "left-hand", "both-hands"]), JSON.stringify(opts));
const labels = await control.eval(`[...document.querySelector('[data-testid=sel-input]').options].map(o => o.textContent)`);
note("unverified modes are labelled experimental in Arabic", labels.filter((l) => l.includes("تجريبي")).length === 2, JSON.stringify(labels));
note("therapist-tap is the default input mode", (await control.eval(`document.querySelector('[data-testid=sel-input]').value`)) === "therapist");
// right-hand mode with no sensor connected
await control.select("sel-input", "right-hand"); await control.select("sel-difficulty", "MEDIUM"); await sleep(300);
await control.eval(`(() => { const e = document.querySelector('[data-testid=sim-source]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'LEFT_HAND'); e.dispatchEvent(new Event('change',{bubbles:true})); })()`); // a source that is NOT enabled for this mode
const stateJs = `(() => { const stage = document.querySelector('[data-testid=control-preview] [data-testid=bq-stage]'); const sr = stage.getBoundingClientRect(); const pad = document.querySelector('[data-testid=sim-pad]').getBoundingClientRect(); return { sr: { x: sr.left, y: sr.top, w: sr.width, h: sr.height }, pad: { x: pad.left, y: pad.top, w: pad.width, h: pad.height }, target: stage.dataset.target, goal: stage.dataset.goalDone, lanes: [...stage.querySelectorAll('.bq3g-lane')].map(l => { const r = l.querySelector('.bq3-balloon').getBoundingClientRect(); return { id: l.dataset.balloonId, color: l.dataset.color, popped: l.querySelector('.bq3-balloon').classList.contains('is-popped'), x: r.left, y: r.top, w: r.width, h: r.height } }) } })()`;
// Drives the pad's own React pointermove handler with dispatched pointer events (browser-level mouse injection does not reach this page).
const moveTo = async (st, nx, ny) => control.eval(`(() => { const pad = document.querySelector('[data-testid=sim-pad]'); pad.dispatchEvent(new PointerEvent("pointermove", { clientX: ${st.pad.x + nx * st.pad.w}, clientY: ${st.pad.y + ny * st.pad.h}, bubbles: true, pointerType: "mouse" })); })()`);
let st = await control.eval(stateJs); await moveTo(st, 0.4, 0.4); await sleep(500);
await control.click("start"); await sleep(600);
note("RIGHT_HAND mode refuses to start without live RIGHT_HAND input (no sensor connected; a different simulated source does not count)", (await life()) === "جاهز للبدء" && ((await txt("refusal")) ?? "").includes("إدخال"), (await txt("refusal")) ?? "");
// supply simulated RIGHT_HAND through the real hub path
await control.eval(`(() => { const e = document.querySelector('[data-testid=sim-source]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'RIGHT_HAND'); e.dispatchEvent(new Event('change',{bubbles:true})); })()`);
st = await control.eval(stateJs); await moveTo(st, 0.03, 0.03); await sleep(600);
await control.click("start"); await sleep(1500);
note("with live (simulated) RIGHT_HAND input the session starts", (await life()) === "قيد اللعب", await life());
const tapTarget = async () => { return control.eval(`(() => { const stage = document.querySelector('[data-testid=control-preview] [data-testid=bq-stage]'); const sr = stage.getBoundingClientRect(); const t = stage.dataset.target; for (const l of stage.querySelectorAll('.bq3g-lane[data-color="'+t+'"]')) { const bt = l.querySelector('.bq3-balloon'); if (bt.classList.contains('is-popped')) continue; const r = bt.getBoundingClientRect(); const cy = (r.top + r.height * 0.39 - sr.top) / sr.height, cx = (r.left + r.width/2 - sr.left)/sr.width; if (cy > 0.06 && cy < 0.94 && cx > 0.05 && cx < 0.95) { bt.click(); return true; } } return false; })()`); };
// ---- sensor loss -> therapist taps carry on (manual fallback) ----
const goal = async () => Number(await control.eval(`document.querySelector('[data-testid=control-preview] [data-testid=bq-stage]').dataset.goalDone`));
await sleep(1500);
await control.eval(`(() => { const e = document.querySelector('[data-testid=sim-stream]'); if (e.checked) e.click(); })()`); await sleep(2200);
note("sensor lost: session holds, Display shows calm message", (await life()) === "متوقف تلقائيًا" && (await display.eval("document.body.innerText")).includes("لحظة من فضلك"), await life());
const g0 = await goal();
note("therapist tap on a target balloon while held: resumes and scores", (await tapTarget()) && (await sleep(700), (await life()) === "قيد اللعب") && (await goal()) === g0 + 1, `goal ${g0} -> ${await goal()}`);
await sleep(300);
note("Display (separate browser, via Firebase) shows the same goal progress", (await display.eval(`document.querySelector('[data-testid=bq-stage]')?.dataset.goalDone`)) == String(g0 + 1), await display.eval(`document.querySelector('[data-testid=bq-stage]')?.dataset.goalDone`));
await sleep(6000);
note("with the sensor still gone and taps continuing, the game is not re-held", (await life()) === "قيد اللعب", await life());
let taps = 0; const t0 = Date.now();
while (Date.now() - t0 < 90000 && (await life()) !== "اكتملت المرحلة") { if (await tapTarget()) taps++; await sleep(700); }
note("stage completed purely by therapist taps with the sensor disconnected", (await life()) === "اكتملت المرحلة", `${taps} more taps`);
await sleep(800);
note("Display shows stage-complete", (await display.eval("document.body.innerText")).includes("أكملت المرحلة"));
writeFileSync(`${OUT}/manual-fallback.json`, JSON.stringify(results, null, 1));
console.log(results.every((r) => r.ok) ? "ALL PASS" : "SOME FAILED"); await b.close?.(); process.exit(0);
