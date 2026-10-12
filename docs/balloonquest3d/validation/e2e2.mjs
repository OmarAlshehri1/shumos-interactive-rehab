/* eslint-disable -- evidence script run against a live browser; not application code */
import { launch, sleep } from "./cdplib.mjs";
import { writeFileSync } from "node:fs";
const OUT = process.argv[2];
const BASE = "http://localhost:3000";
const results = [];
const note = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); };
const b = await launch(OUT, 9447);
let display = await b.open(`${BASE}/display/balloon-quest-3d-prototype`);
let control = await b.open(`${BASE}/control/balloon-quest-3d-prototype`);
const netHosts = new Map();
async function watch(tab, label) { await tab.send("Network.enable"); tab.ws.addEventListener("message", (m) => { const d = JSON.parse(m.data); if (d.method === "Network.requestWillBeSent") { try { const u = new URL(d.params.request.url); if (!u.hostname.includes("localhost") && u.protocol.startsWith("http") || u.protocol === "ws:" && !u.hostname.includes("localhost")) netHosts.set(`${label}:${u.hostname}`, (netHosts.get(`${label}:${u.hostname}`) ?? 0) + 1); } catch {} } }); }
for (const [t, l] of [[display, "display"], [control, "control"]]) { await t.send("Emulation.setFocusEmulationEnabled", { enabled: true }); await watch(t, l); }
await sleep(4500);

const stateJs = `(() => { const stage = document.querySelector('[data-testid=control-preview] [data-testid=bq-stage]'); if (!stage) return null; const sr = stage.getBoundingClientRect(); const pad = document.querySelector('[data-testid=sim-pad]').getBoundingClientRect();
 return { sr: { x: sr.left, y: sr.top, w: sr.width, h: sr.height }, pad: { x: pad.left, y: pad.top, w: pad.width, h: pad.height }, target: stage.dataset.target, motion: stage.dataset.motion, layout: stage.dataset.layout, goal: stage.dataset.goalDone, lanes: [...stage.querySelectorAll('.bq3g-lane')].map(l => { const r = l.querySelector('.bq3-balloon').getBoundingClientRect(); return { id: l.dataset.balloonId, color: l.dataset.color, popped: l.querySelector('.bq3-balloon').classList.contains('is-popped'), rising: l.classList.contains('is-rising'), x: r.left, y: r.top, w: r.width, h: r.height } }) } })()`;
const dispJs = `(() => { const stage = document.querySelector('[data-testid=bq-stage]'); if (!stage) return null; const sr = stage.getBoundingClientRect(); return { h: sr.height, w: sr.width, life: stage.dataset.lifecycle, goal: stage.dataset.goalDone, text: document.body.innerText.slice(0, 80), lanes: [...stage.querySelectorAll('.bq3g-lane')].map(l => { const r = l.querySelector('.bq3-balloon').getBoundingClientRect(); return { id: l.dataset.balloonId, y: (r.top - sr.top) / sr.height, x: (r.left - sr.left) / sr.width, w: r.width / sr.width, bottom: (r.bottom - sr.top) / sr.height } }) } })()`;
const bodyCentre = (st, l) => ({ nx: (l.x + l.w / 2 - st.sr.x) / st.sr.w, ny: (l.y + l.h * 0.387 - st.sr.y) / st.sr.h });
const moveTo = async (st, nx, ny) => control.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: st.pad.x + nx * st.pad.w, y: st.pad.y + ny * st.pad.h, button: "none" });
const life = () => control.text("lifecycle");
const setSource = (v) => control.eval(`(() => { const s = document.querySelector('[data-testid=sim-source]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'${v}'); s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
const live = (st) => st.lanes.filter((l) => !l.popped).map((l) => ({ l, c: bodyCentre(st, l) })).filter((x) => x.c.nx > 0.1 && x.c.nx < 0.9 && x.c.ny > 0.16 && x.c.ny < 0.86);
async function newSession(difficulty, stage, extra = {}) {
  await control.click("new-session").catch(() => {});
  // new-session button exists only after completion; use the settings path instead
}
async function freshReady(difficulty = "EASY", stageNo = 1, scope = "level") {
  // End whatever is running, make a new session, configure.
  const l = await life();
  if (l !== "جاهز للبدء") {
    if (l !== "اكتملت المغامرة" && l !== "أُنهيت الجلسة") { await control.click("end"); await sleep(150); await control.click("end-confirm"); await sleep(300); }
    await control.click("new-session"); await sleep(400);
  }
  await control.select("sel-difficulty", difficulty); await control.select("sel-stage", String(stageNo)); await control.select("sel-scope", scope); await sleep(200);
}
async function startRight(sourceId = "RIGHT_HAND", mode = "right-hand") {
  await control.select("sel-input", mode); await setSource(sourceId);
  const st = await control.eval(stateJs); await moveTo(st, 0.03, 0.03); await sleep(500);
  await control.click("start"); await sleep(600);
}
async function popOne(sourceReady = true) {
  for (let i = 0; i < 40; i++) {
    const st = await control.eval(stateJs);
    const t = live(st).find((x) => x.l.color === st.target);
    if (t) { const g0 = Number(st.goal); await moveTo(st, t.c.nx, t.c.ny); await sleep(260); await moveTo(st, 0.03, 0.5); await sleep(100); const g1 = Number((await control.eval(stateJs)).goal); return g1 > g0; }
    await sleep(400);
  }
  return false;
}
const settle = async (n = 1) => { await sleep(300 * n); };

// ===== A/B: Medium — positional agreement and pause/resume =====
await control.select("sel-difficulty", "MEDIUM"); await control.select("sel-stage", "1"); await control.select("sel-scope", "level");
await startRight(); await sleep(5000);
let worst = 0, n = 0;
for (let i = 0; i < 12; i++) {
  const [cs, ds] = [await control.eval(stateJs), await display.eval(dispJs)];
  for (const l of cs.lanes) { const d = ds.lanes.find((x) => x.id === l.id); if (d) { worst = Math.max(worst, Math.abs((l.y - cs.sr.y) / cs.sr.h - d.y)); n++; } }
  await sleep(700);
}
note("Control and Display balloon positions agree while rising", worst < 0.012 && n > 20, `max |Δy| = ${(worst * 100).toFixed(2)}% of stage height over ${n} samples`);
await control.shot(`${OUT}/e2e2-control-medium.png`);
await control.click("pause"); await sleep(300);
const snap = async () => { const cs = await control.eval(stateJs), ds = await display.eval(dispJs); return { c: new Map(cs.lanes.map((l) => [l.id, (l.y - cs.sr.y) / cs.sr.h])), d: new Map(ds.lanes.map((l) => [l.id, l.y])) }; };
const p1 = await snap(); await sleep(3000); const p2 = await snap();
let drift = 0; for (const [id, y] of p1.c) if (p2.c.has(id)) drift = Math.max(drift, Math.abs(p2.c.get(id) - y)); for (const [id, y] of p1.d) if (p2.d.has(id)) drift = Math.max(drift, Math.abs(p2.d.get(id) - y));
note("pause freezes balloons on both Control and Display", drift < 0.003 && p1.c.size > 3, `max drift over 3 s = ${(drift * 100).toFixed(3)}%`);
note("Display shows a calm pause message (no technical text)", (await display.eval("document.body.innerText")).includes("استراحة قصيرة"));
await display.shot(`${OUT}/e2e2-display-paused.png`);
await control.click("resume"); await sleep(250); const p3 = await snap(); await sleep(1000); const p4 = await snap();
let jump = 0, moved = 0; for (const [id, y] of p3.c) if (p4.c.has(id)) { const dlt = y - p4.c.get(id); moved = Math.max(moved, dlt); jump = Math.max(jump, Math.abs(dlt - 0.04)); }
note("resume continues smoothly upward without a jump", moved > 0.02 && moved < 0.09, `max rise over 1 s = ${(moved * 100).toFixed(1)}% of height`);

// ===== C: restart =====
const popped = await popOne();
note("a correct pop advances goal (rising level)", popped, await control.text("goal"));
await control.click("restart"); await sleep(500);
note("restart resets progress and keeps the same stage", (await control.text("goal")).startsWith("٠") && (await control.text("level-stage")).includes("متوسط"), `${await control.text("goal")} / ${await control.text("level-stage")}`);
note("Display follows the restart", (await display.eval(dispJs)).goal === "0");

// ===== D: skip (scope = level => 3 skips complete the level) =====
await control.click("skip"); await sleep(500);
note("skip moves to the next stage", (await control.text("level-stage")).includes("٢"), await control.text("level-stage"));
await control.click("skip"); await sleep(400); await control.click("skip"); await sleep(800);
note("skipping all stages of a level completes the session", (await life()) === "اكتملت المغامرة", await life());
const sum = await control.text("summary");
note("summary records the skips as skipped, never failed", /متخطاة ٣/.test(sum ?? "") && !/فشل/.test(sum ?? ""), (sum ?? "").slice(0, 120));
await control.shot(`${OUT}/e2e2-control-summary-skips.png`);

// ===== E: end session =====
await freshReady("EASY", 1, "all"); await startRight(); await popOne();
await control.click("end"); await sleep(150); await control.click("end-confirm"); await sleep(600);
note("therapist can end the session; Display shows a gentle thank-you", (await life()) === "أُنهيت الجلسة" && (await display.eval("document.body.innerText")).includes("شكرًا لك"), await life());

// ===== F: FLOOR layout =====
await freshReady("EASY", 1, "level"); await control.select("sel-layout", "FLOOR"); await sleep(200); await startRight(); await sleep(1500);
{
  const ds = await display.eval(dispJs);
  const lowest = Math.max(...ds.lanes.map((l) => l.bottom)), left = Math.min(...ds.lanes.map((l) => l.x)), right = Math.max(...ds.lanes.map((l) => l.x + l.w));
  note("FLOOR/Easy: targets stay clear of the near edge", lowest <= 0.9, `lowest balloon+string bottom = ${(lowest * 100).toFixed(1)}%`);
  note("FLOOR/Easy: horizontal safe margins respected", left >= 0.135 && right <= 0.865, `x range ${(left * 100).toFixed(1)}%–${(right * 100).toFixed(1)}%`);
  await display.shot(`${OUT}/e2e2-display-floor-easy.png`);
}
await control.click("end"); await sleep(150); await control.click("end-confirm"); await sleep(300); await control.click("new-session"); await sleep(300);
await control.select("sel-layout", "FLOOR"); await control.select("sel-difficulty", "MEDIUM"); await control.select("sel-scope", "level"); await startRight(); await sleep(7000);
{
  const ds = await display.eval(dispJs);
  const left = Math.min(...ds.lanes.map((l) => l.x)), right = Math.max(...ds.lanes.map((l) => l.x + l.w));
  note("FLOOR/Medium: rising balloons stay inside the horizontal safe lanes", left >= 0.135 && right <= 0.865 && ds.lanes.length >= 5, `x range ${(left * 100).toFixed(1)}%–${(right * 100).toFixed(1)}%, ${ds.lanes.length} balloons`);
  await display.shot(`${OUT}/e2e2-display-floor-medium.png`);
  const goalTop = await display.eval(`(() => { const e = document.querySelector('.bq3g-floor-goal'); return e ? getComputedStyle(e).display : null })()`);
  note("FLOOR layout moves the goal bar to the far (top) band", goalTop === "flex", String(goalTop));
}
// ===== G: reduced motion =====
await control.click("chk-reduced"); await sleep(200); await control.click("restart"); await sleep(1200);
{
  const cs = await control.eval(stateJs);
  note("reduced motion forces the stationary layout", cs.motion === "static" && cs.lanes.every((l) => !l.rising) && cs.lanes.length >= 5, `motion=${cs.motion}, balloons=${cs.lanes.length}`);
  const sway = await display.eval(`getComputedStyle(document.querySelector('.bq3g-lane .bq3-sway')).animationName`);
  note("reduced motion disables sway on the Display", sway === "none", sway);
  await display.shot(`${OUT}/e2e2-display-reduced-motion.png`);
}
await control.click("chk-reduced"); await control.select("sel-layout", "WALL");

// ===== H: input modes =====
for (const [mode, src] of [["left-hand", "LEFT_HAND"], ["both-hands", "LEFT_HAND"], ["foot", "RIGHT_FOOT"], ["foot", "LEFT_FOOT"], ["handheld", "HANDHELD"]]) {
  await freshReady("EASY", 1, "level"); await startRight(src, mode);
  note(`simulated ${src} in "${mode}" mode selects a target`, await popOne(), await control.text("goal"));
}
// wrong-source ignored
await freshReady("EASY", 1, "level"); await startRight("RIGHT_HAND", "left-hand").catch(() => {});
note("a simulated source that is not enabled for the mode cannot start/score", (await life()) === "جاهز للبدء" || !(await popOne()), await life());
// keyboard with REAL key events
await freshReady("EASY", 1, "level"); await control.select("sel-input", "keyboard"); await sleep(200); await control.click("start"); await sleep(600);
{
  const st = await control.eval(stateJs); const t = live(st).find((x) => x.l.color === st.target);
  const kb = { x: 0.5, y: 0.5 }; const speed = 0.45;
  const hold = async (key, secs) => { await control.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code: key, windowsVirtualKeyCode: { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 }[key] }); await sleep(secs * 1000); await control.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 }[key] }); };
  const dx = t.c.nx - kb.x, dy = t.c.ny - kb.y;
  if (Math.abs(dx) > 0.01) await hold(dx > 0 ? "ArrowRight" : "ArrowLeft", Math.abs(dx) / speed);
  if (Math.abs(dy) > 0.01) await hold(dy > 0 ? "ArrowDown" : "ArrowUp", Math.abs(dy) / speed);
  await control.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: " ", code: "Space", text: " ", windowsVirtualKeyCode: 32 }); await control.send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
  await sleep(500);
  const g = await control.text("goal");
  note("real keyboard events (arrows + Space) select a target", g.startsWith("١"), g);
}

// ===== I: input loss / recovery =====
await freshReady("MEDIUM", 1, "level"); await startRight(); await sleep(2500);
await control.eval(`(() => { const e = document.querySelector('[data-testid=sim-stream]'); if (e.checked) e.click(); })()`);
await sleep(1500);
note("input loss holds play automatically", (await life()) === "متوقف تلقائيًا", `${await life()} | ${await control.text("suspend-reason")}`);
note("Display shows a calm hold message", (await display.eval("document.body.innerText")).includes("لحظة من فضلك"));
const frozenA = (await control.eval(stateJs)).lanes.map((l) => l.y); await sleep(1500); const frozenB = (await control.eval(stateJs)).lanes.map((l) => l.y);
note("nothing moves while input is lost", frozenA.every((y, i) => Math.abs(y - frozenB[i]) < 0.5));
await control.eval(`(() => { const e = document.querySelector('[data-testid=sim-stream]'); if (!e.checked) e.click(); })()`);
await sleep(1500);
note("play resumes automatically when input returns", (await life()) === "قيد اللعب", await life());

// ===== J: display loss =====
await fetch(`http://127.0.0.1:9447/json/close/${display.targetId}`); await sleep(3500);
note("closing the Display holds play (display-unavailable)", (await life()) === "متوقف تلقائيًا" && (await control.text("suspend-reason")).includes("شاشة العرض"), await control.text("suspend-reason"));
display = await b.open(`${BASE}/display/balloon-quest-3d-prototype`); await display.send("Emulation.setFocusEmulationEnabled", { enabled: true }); await watch(display, "display2");
await sleep(5000);
note("reopening the Display resumes play and re-syncs state", (await life()) === "قيد اللعب" && (await display.eval(dispJs))?.life === "playing", await life());

// ===== K: reloads =====
const before = await display.eval(dispJs);
await display.send("Page.reload"); await sleep(5000);
const after = await display.eval(dispJs);
note("Display reload recovers the live session", after && after.life === "playing" && after.lanes.length >= 4, `lanes ${before.lanes.length} -> ${after?.lanes.length}`);
await control.click("pause"); await sleep(300);
await control.send("Page.reload"); await sleep(6000);
note("Control reload starts a clean ready session and Display follows", (await life()) === "جاهز للبدء" && (await display.eval("document.body.innerText")).includes("استعد"), `${await life()}`);
note("an interrupted-session hint is offered after reload", ((await control.eval("document.body.innerText")) ?? "").includes("جلسة سابقة لم تكتمل"));

// ===== M: second Control window =====
const second = await b.open(`${BASE}/control/balloon-quest-3d-prototype`); await sleep(4000);
note("a second Control window waits instead of competing (single authority)", ((await second.eval("document.body.innerText")) ?? "").includes("بانتظار تحرير نافذة التحكم الأخرى"));
await second.eval("window.close()").catch(() => {});

note("no external (Firebase/Google) network hosts contacted by Control or Display", [...netHosts.keys()].length === 0, JSON.stringify([...netHosts.entries()]));
writeFileSync(`${OUT}/e2e2-results.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`DONE: ${results.length - failed}/${results.length} passed`);
b.close(); process.exit(0);
