
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
const snapC = async () => control.eval(`(() => { const p = document.querySelector('[data-testid=control-preview] [data-testid=bq-stage]'); return { life: document.querySelector('[data-testid=lifecycle]')?.textContent ?? null, goal: document.querySelector('[data-testid=goal]')?.textContent ?? null, mode: document.querySelector('[data-testid=sel-input]')?.value ?? null, recovered: !!document.querySelector('[data-testid=bq-recovered]'), target: p?.dataset.target ?? null } })()`);
const waitFor = async (fn, ms = 25000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await sleep(400); } return false; };
await waitFor(async () => await tapTarget(), 20000); await sleep(1200);
await control.eval(`(() => { const e = document.querySelector('[data-testid=sim-stream]'); if (e.checked) e.click(); })()`); await sleep(24000); // a therapist tap keeps play going for 20 s without the sensor; wait it out so the automatic hold applies
const pre = await snapC();
note("S0 sensor lost: session held automatically with progress 1", pre.life === "متوقف تلقائيًا" && pre.goal.includes("١") && pre.mode === "right-hand", JSON.stringify(pre));
await control.send("Page.reload"); await waitFor(async () => (await snapC()).life !== null, 40000); await sleep(1500);
const post = await snapC(); if (post.life === null) console.log("BODY", JSON.stringify(await control.eval("document.body.innerText.slice(0,300)")));
note("S1 reload while held for sensor loss: recovered as a plain pause, same progress, sensor mode kept", post.recovered && post.life === "متوقف مؤقتًا" && post.goal === pre.goal && post.mode === "right-hand" && post.target === pre.target, JSON.stringify(post));
const dd = await display.eval(`document.querySelector('[data-testid=bq-stage]')?.dataset.lifecycle`);
note("S2 Display shows paused with the same progress", dd === "paused" && (await display.eval(`document.querySelector('[data-testid=bq-stage]')?.dataset.goalDone`)) === "1", dd);
await control.click("resume"); await sleep(300);
note("S3 explicit resume works even though the sensor is still gone", (await life()) === "قيد اللعب", await life());
await waitFor(async () => await tapTarget(), 10000); await sleep(1200);
const after = await snapC();
note("S4 manual taps carry on without the sensor (no repeat hold)", after.life === "قيد اللعب" && after.goal.includes("٢"), JSON.stringify(after));
await sleep(5000);
note("S5 still playing 5 s later while taps are the only input", (await life()) === "قيد اللعب", await life());
writeFileSync(`${OUT}/sensor-reload.json`, JSON.stringify(results, null, 1)); console.log(results.every((r) => r.ok) ? "ALL PASS" : "SOME FAILED"); process.exit(0);
