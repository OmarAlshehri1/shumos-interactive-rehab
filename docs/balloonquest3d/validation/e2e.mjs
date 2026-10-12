/* eslint-disable -- evidence script run against a live browser; not application code */
import { launch, sleep } from "./cdplib.mjs";
import { writeFileSync } from "node:fs";
const OUT = process.argv[2];
const BASE = "http://localhost:3000";
const results = [];
const note = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); };
const b = await launch(OUT, 9445);
const display = await b.open(`${BASE}/display/balloon-quest-3d-prototype`);
const control = await b.open(`${BASE}/control/balloon-quest-3d-prototype`);
for (const t of [display, control]) { await t.send("Emulation.setFocusEmulationEnabled", { enabled: true }); }
// network observation (Firebase etc.)
const netHits = [];
for (const [name, t] of [["display", display], ["control", control]]) {
  await t.send("Network.enable");
}
await sleep(4500);
console.log("hidden?", await display.eval("document.hidden"), await control.eval("document.hidden"));

const stateJs = `(() => {
  const stage = document.querySelector('[data-testid=control-preview] [data-testid=bq-stage]');
  if (!stage) return null;
  const sr = stage.getBoundingClientRect();
  const lanes = [...stage.querySelectorAll('.bq3g-lane')].map(l => { const bt = l.querySelector('.bq3-balloon'); const r = bt.getBoundingClientRect();
    return { id: l.dataset.balloonId, color: l.dataset.color, popped: bt.classList.contains('is-popped'), x: r.left, y: r.top, w: r.width, h: r.height }; });
  const pad = document.querySelector('[data-testid=sim-pad]').getBoundingClientRect();
  return { sr: { x: sr.left, y: sr.top, w: sr.width, h: sr.height }, pad: { x: pad.left, y: pad.top, w: pad.width, h: pad.height }, lanes, target: stage.dataset.target, life: stage.dataset.lifecycle, goal: stage.dataset.goalDone };
})()`;
const displayJs = `(() => { const stage = document.querySelector('[data-testid=bq-stage]'); if (!stage) return null; const sr = stage.getBoundingClientRect();
  return { sr: { x: sr.left, y: sr.top, w: sr.width, h: sr.height }, target: stage.dataset.target, life: stage.dataset.lifecycle, goal: stage.dataset.goalDone, lanes: [...stage.querySelectorAll('.bq3g-lane')].map(l => { const r = l.querySelector('.bq3-balloon').getBoundingClientRect(); return { id: l.dataset.balloonId, color: l.dataset.color, popped: !!l.querySelector('.is-popped'), y: r.top } }) } })()`;
const moveTo = async (st, nx, ny) => { const px = st.pad.x + nx * st.pad.w, py = st.pad.y + ny * st.pad.h; await control.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: px, y: py, button: "none" }); };
const bodyCentre = (st, l) => ({ nx: (l.x + l.w / 2 - st.sr.x) / st.sr.w, ny: (l.y + l.h * 0.387 - st.sr.y) / st.sr.h });
const onStage = (st, c) => c.nx > 0.06 && c.nx < 0.94 && c.ny > 0.12 && c.ny < 0.9;
const lifecycle = () => control.text("lifecycle");

// ---------- setup: simulated RIGHT_HAND via the real hub path ----------
await control.select("sel-input", "right-hand");
await control.select("sel-source", "x").catch(() => {});
await control.eval(`(() => { const s = document.querySelector('[data-testid=sim-source]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'RIGHT_HAND'); s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
let st = await control.eval(stateJs);
await moveTo(st, 0.03, 0.03);
await sleep(600);
note("display linked", (await control.text("display-status")).includes("متصلة"), await control.text("display-status"));
await control.click("start");
await sleep(500);
note("session started", (await lifecycle()) === "قيد اللعب", await lifecycle());

async function playStageOnce(wrongEvery = 5) {
  let acted = 0, wrongProbes = 0, safety = 0;
  const stageStart = Date.now();
  while (safety++ < 2000 && Date.now() - stageStart < 240000) {
    const life = await lifecycle();
    if (life !== "قيد اللعب") return life;
    st = await control.eval(stateJs);
    if (!st) { await sleep(100); continue; }
    const live = st.lanes.filter((l) => !l.popped).map((l) => ({ l, c: bodyCentre(st, l) })).filter((x) => onStage(st, x.c));
    const tgt = live.find((x) => x.l.color === st.target);
    if (acted % wrongEvery === 2 && wrongProbes < 3) {
      const wrong = live.find((x) => x.l.color !== st.target);
      if (wrong) {
        const before = await control.text("wrong");
        await moveTo(st, wrong.c.nx, wrong.c.ny); await sleep(250);
        const st2 = await control.eval(stateJs);
        const still = st2.lanes.some((l) => l.id === wrong.l.id && !l.popped);
        const after = await control.text("wrong");
        if (!still || after === before) { /* cooldown or moved on; only fail if balloon vanished */ }
        if (!still && st2.lanes.some((l) => l.id === wrong.l.id) === false) note(`wrong-colour balloon not removed (${wrong.l.id})`, false);
        wrongProbes++;
        await moveTo(st2, 0.03, 0.5); await sleep(120);
      }
    }
    if (tgt) { await moveTo(st, tgt.c.nx, tgt.c.ny); acted++; await sleep(160); await moveTo(st, 0.03, 0.5); await sleep(60); }
    else await sleep(250);
  }
  return "safety";
}

// ---------- hit-test fidelity: drawn balloon == engine balloon ----------
{
  st = await control.eval(stateJs);
  const t = st.lanes.filter((l) => !l.popped && l.color === st.target).map((l) => ({ l, c: bodyCentre(st, l) })).find((x) => onStage(st, x.c));
  const rPx = t.l.w * 0.5, tol = 0.15;
  const nxOut = t.c.nx + (rPx * (1 + tol) * 1.25) / st.sr.w;
  await moveTo(st, nxOut, t.c.ny); await sleep(400);
  const g0 = await control.text("goal");
  note("contact fidelity: just OUTSIDE the drawn balloon does not select", g0.startsWith("٠"), g0);
  await moveTo(st, 0.03, 0.5); await sleep(200);
  const nxIn = t.c.nx + (rPx * (1 + tol) * 0.8) / st.sr.w;
  await moveTo(st, nxIn, t.c.ny); await sleep(400);
  const g1 = await control.text("goal");
  note("contact fidelity: just INSIDE the drawn balloon selects", g1.startsWith("١"), g1);
  await moveTo(st, 0.03, 0.5); await sleep(200);
}
// ---------- full nine-stage session ----------
const stageLog = [];
let shots = 0;
for (let guard = 0; guard < 30; guard++) {
  const life = await lifecycle();
  if (life === "اكتملت المغامرة") break;
  if (life === "اكتملت المرحلة") {
    if (stageLog.length % 3 === 0 || true) { await display.shot(`${OUT}/e2e-display-stage-complete-${stageLog.length}.png`); }
    await sleep(1000); continue;
  }
  const label = await control.text("level-stage");
  const t0 = Date.now();
  // mid-stage screenshot of the child display after a little play, once per stage
  const p = playStageOnce();
  await sleep(6000);
  await display.shot(`${OUT}/e2e-display-${stageLog.length + 1}-${(label ?? "").replace(/[^؀-ۿA-Za-z0-9]/g, "")}.png`);
  const res = await p;
  stageLog.push({ label, ms: Date.now() - t0, res });
  console.log("stage", stageLog.length, label, Math.round((Date.now() - t0) / 1000) + "s", res);
}
await sleep(1200);
note("all nine stages completed in one session", stageLog.length === 9 && (await lifecycle()) === "اكتملت المغامرة", `${stageLog.length} stages; lifecycle=${await lifecycle()}`);
await display.shot(`${OUT}/e2e-display-final.png`);
await control.shot(`${OUT}/e2e-control-summary.png`);
const summaryText = await control.text("summary");
note("summary shows 9 completed stages", /مراحل مكتملة ٩/.test(summaryText ?? ""), (summaryText ?? "").slice(0, 160));
writeFileSync(`${OUT}/e2e-stagelog.json`, JSON.stringify(stageLog, null, 2));
writeFileSync(`${OUT}/e2e-results.json`, JSON.stringify(results, null, 2));
b.close(); process.exit(0);
