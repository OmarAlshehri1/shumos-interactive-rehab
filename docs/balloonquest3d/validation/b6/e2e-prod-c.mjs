
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
const bodyCentre = (st, l) => ({ nx: (l.x + l.w / 2 - st.sr.x) / st.sr.w, ny: (l.y + l.h * 0.387 - st.sr.y) / st.sr.h });
let st = await control.eval(stateJs); await moveTo(st, 0.4, 0.4); await sleep(500);
await control.click("start"); await sleep(600);
note("RIGHT_HAND mode refuses to start without live RIGHT_HAND input (no sensor connected; a different simulated source does not count)", (await life()) === "جاهز للبدء" && ((await txt("refusal")) ?? "").includes("إدخال"), (await txt("refusal")) ?? "");
// supply simulated RIGHT_HAND through the real hub path
await control.eval(`(() => { const e = document.querySelector('[data-testid=sim-source]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'RIGHT_HAND'); e.dispatchEvent(new Event('change',{bubbles:true})); })()`);
st = await control.eval(stateJs); await moveTo(st, 0.03, 0.03); await sleep(600);
await control.click("start"); await sleep(1500);
console.log("DEBUG", JSON.stringify(await control.eval(`(() => { const q = (id) => document.querySelector('[data-testid='+id+']'); return { life: q('lifecycle')?.textContent, refusal: q('refusal')?.textContent, simSource: q('sim-source')?.value, inputMode: q('sel-input')?.value, sources: [...document.querySelectorAll('[data-testid^=src-]')].map(e=>e.textContent), name: q('child-name')?.value, startDisabled: q('start')?.disabled, display: q('display-status')?.textContent, pad: (() => { const r = q('sim-pad')?.getBoundingClientRect(); return r && [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; })(), pointers: [...document.querySelectorAll('.bq3g-pointer')].map(p=>p.dataset.source+':'+p.style.display) }; })()`)));
note("with live (simulated) RIGHT_HAND input the session starts", (await life()) === "قيد اللعب", await life());
// play Medium stage 1 with the simulated hand; moving balloons
let acted = 0; const t0 = Date.now();
while (Date.now() - t0 < 120000) {
  const l = await life(); if (l !== "قيد اللعب") break;
  st = await control.eval(stateJs);
  const live = st.lanes.filter((x) => !x.popped).map((x) => ({ x, c: bodyCentre(st, x) })).filter((x) => x.c.nx > 0.08 && x.c.nx < 0.92 && x.c.ny > 0.16 && x.c.ny < 0.86);
  const tgt = live.find((x) => x.x.color === st.target);
  if (tgt) { await moveTo(st, tgt.c.nx, tgt.c.ny); acted++; await sleep(160); await moveTo(st, 0.03, 0.5); await sleep(80); } else await sleep(300);
}
note("a Medium stage (rising balloons) completes with simulated RIGHT_HAND hit testing", (await life()) === "اكتملت المرحلة", `${acted} contacts; goal ${await txt("goal")}`);
await sleep(800);
note("Display (via Firebase) shows the stage-complete scene", (await display.eval("document.body.innerText")).includes("أكملت المرحلة"));
await display.shot(`${OUT}/c-display-stage-complete.png`);
// input loss in production
await control.click("advance"); await sleep(1500);
await control.eval(`(() => { const e = document.querySelector('[data-testid=sim-stream]'); if (e.checked) e.click(); })()`); await sleep(1800);
note("losing the sensor holds the session and the Display shows only a calm message", (await life()) === "متوقف تلقائيًا" && (await display.eval("document.body.innerText")).includes("لحظة من فضلك"), await life());
await control.eval(`(() => { const e = document.querySelector('[data-testid=sim-stream]'); if (!e.checked) e.click(); })()`); await sleep(1800);
note("input recovery resumes automatically", (await life()) === "قيد اللعب", await life());
// keyboard mode with real key events
await control.select("sel-input", "keyboard"); await sleep(300);
st = await control.eval(stateJs); const t = st.lanes.filter((x) => !x.popped).map((x) => ({ x, c: bodyCentre(st, x) })).find((x) => x.x.color === st.target && x.c.ny > 0.2 && x.c.ny < 0.8 && x.c.nx > 0.1 && x.c.nx < 0.9);
if (t) {
  const g0 = Number(st.goal), kb = { x: 0.5, y: 0.5 }, speed = 0.45;
  // DOM key events dispatched at the window — exactly where the game's keyboard handler listens (browser-level key injection does not reach this tab).
  const kev = (type, k) => control.eval(`window.dispatchEvent(new KeyboardEvent("${type}", { key: ${JSON.stringify(k)}, bubbles: true, cancelable: true }))`);
  const hold = async (k, secs) => { await kev("keydown", k); await sleep(secs * 1000); await kev("keyup", k); };
  // the balloon keeps rising while we move: re-read and press when inside; a few attempts
  for (let attempt = 0; attempt < 4; attempt++) {
    st = await control.eval(stateJs); const tt = st.lanes.filter((x) => !x.popped && x.color === st.target).map((x) => ({ x, c: bodyCentre(st, x) })).find((x) => x.c.ny > 0.2 && x.c.ny < 0.8 && x.c.nx > 0.08 && x.c.nx < 0.92); if (!tt) { await sleep(800); continue; }
    const kbx = await control.eval(`(() => { const d = document.querySelector('.bq3g-pointer[data-source=KEYBOARD]'); const s = document.querySelector('[data-testid=control-preview] [data-testid=bq-stage]').getBoundingClientRect(); if (!d) return null; const r = d.getBoundingClientRect(); return { x: (r.left + r.width/2 - s.left)/s.width, y: (r.top + r.height/2 - s.top)/s.height }; })()`) ?? kb;
    const dx = tt.c.nx - kbx.x, dy = tt.c.ny - kbx.y;
    if (Math.abs(dx) > 0.01) await hold(dx > 0 ? "ArrowRight" : "ArrowLeft", Math.abs(dx) / speed);
    if (Math.abs(dy) > 0.01) await hold(dy > 0 ? "ArrowDown" : "ArrowUp", Math.abs(dy) / speed);
    await kev("keydown", " "); await kev("keyup", " ");
    await sleep(700); if (Number((await control.eval(stateJs)).goal) > g0) break;
  }
  note("keyboard simulation (DOM key events at the window) still selects balloons in the production screen", Number((await control.eval(stateJs)).goal) > g0, `goal ${g0} -> ${(await control.eval(stateJs)).goal}`);
} else note("keyboard simulation (DOM key events at the window) still selects balloons in the production screen", false, "no target on stage");
writeFileSync(`${OUT}/prod-results-c.json`, JSON.stringify(results, null, 2));
console.log("PART C DONE", results.filter((r) => r.ok).length + "/" + results.length);
b.close(); process.exit(0);
