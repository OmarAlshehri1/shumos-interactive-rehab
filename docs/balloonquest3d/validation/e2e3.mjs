
import { launch, sleep } from "./cdplib.mjs";
import { writeFileSync } from "node:fs";
const OUT = process.argv[2];
const BASE = "http://localhost:3000";
const results = [];
const note = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); };
const b = await launch(OUT, 9448);
const display = await b.open(`${BASE}/display/balloon-quest-3d-prototype`);
const control = await b.open(`${BASE}/control/balloon-quest-3d-prototype`);
for (const t of [display, control]) await t.send("Emulation.setFocusEmulationEnabled", { enabled: true });
await sleep(4500);
const stateJs = `(() => { const stage = document.querySelector('[data-testid=control-preview] [data-testid=bq-stage]'); const sr = stage.getBoundingClientRect(); const pad = document.querySelector('[data-testid=sim-pad]').getBoundingClientRect();
 return { sr: { x: sr.left, y: sr.top, w: sr.width, h: sr.height }, pad: { x: pad.left, y: pad.top, w: pad.width, h: pad.height }, target: stage.dataset.target, goal: stage.dataset.goalDone, lanes: [...stage.querySelectorAll('.bq3g-lane')].map(l => { const r = l.querySelector('.bq3-balloon').getBoundingClientRect(); return { id: l.dataset.balloonId, color: l.dataset.color, popped: l.querySelector('.bq3-balloon').classList.contains('is-popped'), wob: l.querySelector('.bq3-balloon').classList.contains('is-wobbling'), x: r.left, y: r.top, w: r.width, h: r.height } }) } })()`;
const tfJs = `Object.fromEntries([...document.querySelectorAll('.bq3g-lane.is-rising')].map(l => [l.dataset.balloonId, l.style.transform]))`;
const bodyCentre = (st, l) => ({ nx: (l.x + l.w / 2 - st.sr.x) / st.sr.w, ny: (l.y + l.h * 0.387 - st.sr.y) / st.sr.h });
const moveTo = async (st, nx, ny) => control.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: st.pad.x + nx * st.pad.w, y: st.pad.y + ny * st.pad.h, button: "none" });
const life = () => control.text("lifecycle");
const same = (a, c) => { const ids = Object.keys(a).filter((k) => k in c); return ids.length > 3 && ids.every((k) => a[k] === c[k]); };

await control.select("sel-input", "right-hand");
await control.eval(`(() => { const s = document.querySelector('[data-testid=sim-source]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'RIGHT_HAND'); s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
await control.select("sel-difficulty", "ADVANCED"); await control.select("sel-scope", "level");
let st = await control.eval(stateJs); await moveTo(st, 0.03, 0.03); await sleep(500);
await control.click("start"); await sleep(4000);

// 1. pause: authoritative transforms identical on both windows and unchanged
await control.click("pause"); await sleep(400);
const [c1, d1] = [await control.eval(tfJs), await display.eval(tfJs)];
await sleep(3000);
const [c2, d2] = [await control.eval(tfJs), await display.eval(tfJs)];
note("PAUSE: authoritative balloon transforms are bit-identical after 3 s (Control)", same(c1, c2), `${Object.keys(c1).length} balloons`);
note("PAUSE: authoritative balloon transforms are bit-identical after 3 s (Display)", same(d1, d2));
await control.click("resume"); await sleep(1200);

// 2. input loss freeze
await control.eval(`(() => { const e = document.querySelector('[data-testid=sim-stream]'); if (e.checked) e.click(); })()`);
await sleep(1600);
const l1 = await life();
const [e1, f1] = [await control.eval(tfJs), await display.eval(tfJs)];
await sleep(2500);
const [e2, f2] = [await control.eval(tfJs), await display.eval(tfJs)];
note("INPUT LOSS: play is held", l1 === "متوقف تلقائيًا", l1);
note("INPUT LOSS: authoritative transforms frozen on Control and Display", same(e1, e2) && same(f1, f2));
await control.eval(`(() => { const e = document.querySelector('[data-testid=sim-stream]'); if (!e.checked) e.click(); })()`);
await sleep(1500);
note("INPUT RECOVERY: resumes and motion continues", (await life()) === "قيد اللعب" && !same(e2, await control.eval(tfJs)));

// 3. wrong-colour cue in the browser
st = await control.eval(stateJs);
const wrong = st.lanes.filter((l) => !l.popped && l.color !== st.target).map((l) => ({ l, c: bodyCentre(st, l) })).find((x) => x.c.nx > 0.1 && x.c.nx < 0.9 && x.c.ny > 0.18 && x.c.ny < 0.84);
const w0 = await control.text("wrong"), g0 = (await control.eval(stateJs)).goal;
await moveTo(st, wrong.c.nx, wrong.c.ny); await sleep(350);
const st2 = await control.eval(stateJs);
const lane = st2.lanes.find((l) => l.id === wrong.l.id);
note("WRONG COLOUR: balloon stays on screen (not removed)", !!lane && !lane.popped);
note("WRONG COLOUR: gentle wobble cue plays", !!lane?.wob);
note("WRONG COLOUR: progress unchanged, no penalty, play continues", st2.goal === g0 && (await life()) === "قيد اللعب", `${w0} -> ${await control.text("wrong")}`);
const dw = await display.eval(`document.querySelector('[data-balloon-id="${wrong.l.id}"] .bq3-balloon')?.classList.contains('is-wobbling')`);
note("WRONG COLOUR: Display shows the same cue", dw === true);
await control.shot(`${OUT}/e2e3-control-wrong-cue.png`); await display.shot(`${OUT}/e2e3-display-wrong-cue.png`);
writeFileSync(`${OUT}/e2e3-results.json`, JSON.stringify(results, null, 2));
console.log(`DONE: ${results.filter((r) => r.ok).length}/${results.length} passed`);
b.close(); process.exit(0);
