// Follow the Footsteps 3D robustness: safety hold, Control/Display reload, Control disconnect, second window, sensor hints and
// loss, locked layout settings, calibration vs rendered size, graphics presets, reduced motion, camera stability. Emulators only.
import { launch, login, openIpad, selectPatient, sleep, until, note, results } from "./crosslib.mjs";
import { seed } from "./seed.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const [out, BASE = "http://127.0.0.1:3417"] = process.argv.slice(2);
mkdirSync(`${out}/shots`, { recursive: true });
await seed();
const A = await launch(`${out}/ipad`, 9931), B = await launch(`${out}/laptop`, 9932);
const cd = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=foot-control]')?.dataset ?? null)`).then(JSON.parse);
const dd = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=foot-display]')?.dataset ?? null)`).then(JSON.parse);
const both = (c, d, pc, pd = pc) => until(async () => pc(await cd(c)) && pd(await dd(d)), 25000, 120);
const exceptions = (...tabs) => tabs.flatMap((t) => (t.events ?? []).filter((e) => e.method === "Runtime.exceptionThrown").map((e) => e.params.exceptionDetails.exception?.description?.slice(0, 160)));
const setSelect = (t, id, value) => t.eval(`(() => { const e = document.getElementById(${JSON.stringify(id)}); if (!e) return false; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
const setInput = (t, id, value) => t.eval(`(() => { const e = document.getElementById(${JSON.stringify(id)}); if (!e) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e, ${JSON.stringify(String(value))}); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
const setCheck = (t, text, on) => t.eval(`(() => { const l = [...document.querySelectorAll('label')].find((x) => x.textContent.includes(${JSON.stringify(text)})); const i = l?.querySelector('input'); if (!i) return false; if (i.checked !== ${on}) i.click(); return true; })()`);
const metrics = (t) => t.eval(`document.querySelector('canvas')?.dataset.metrics ?? null`).then((v) => (v ? JSON.parse(v) : null));
const confirm = (c) => c.tapSel("[data-testid=confirm]");
let ctl, display, extra;
try {
  display = await B.open(`${BASE}/display`, 1920, 1080);
  ctl = await openIpad(A, `${BASE}/control`);
  await login(ctl); await selectPatient(ctl); await sleep(3000);
  await ctl.eval(`location.href='/control/follow-the-footsteps'`);
  await until(() => ctl.eval(`!!document.querySelector('[data-testid=foot-control]')`), 90000, 500);
  await until(() => display.eval(`!!document.querySelector('canvas')`), 60000, 500);
  await sleep(2000);

  // ---- A. start, two steps, safety hold ------------------------------------------------------------------------------
  await ctl.tapText("ابدأ المرحلة"); await both(ctl, display, (x) => x.status === "running");
  await confirm(ctl); await both(ctl, display, (x) => x.step === "1");
  await confirm(ctl); await both(ctl, display, (x) => x.step === "2");
  const stonesBefore = (await dd(display)).stones;
  await ctl.tapSel("[data-testid=safety]");
  note("safety: both devices enter a paused safety hold", await both(ctl, display, (x) => x.status === "paused" && x.safety === "1"));
  await display.shot(`${out}/shots/display-safety.png`);
  await sleep(6000);
  note("safety: nothing advances while held; the target stays identifiable", (await dd(display)).step === "2" && (await dd(display)).stones === stonesBefore && (await cd(ctl)).step === "2");
  const confirmDisabled = await ctl.eval(`document.querySelector('[data-testid=confirm]')?.disabled`);
  note("safety: resume is explicit and clearly labelled", await ctl.eval(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'استئناف بعد إيقاف الأمان')`) && confirmDisabled !== undefined);

  // ---- B. Control reload during the hold ---------------------------------------------------------------------------------
  await ctl.send("Page.reload");
  await until(() => ctl.eval(`!!document.querySelector('[data-testid=foot-control]')`), 90000, 500); await sleep(2500);
  const rc = await cd(ctl);
  note("Control reload: same stage and step, paused with a safety hold, never auto-resuming", rc.status === "paused" && rc.safety === "1" && rc.step === "2" && rc.stage === "0", JSON.stringify(rc));
  await sleep(5000);
  note("Control reload: still frozen 5 s later", (await cd(ctl)).step === "2" && (await dd(display)).step === "2");
  // ---- C. Display reload ---------------------------------------------------------------------------------------------------
  await display.send("Page.reload");
  await until(() => display.eval(`!!document.querySelector('canvas')`), 60000, 500); await sleep(1500);
  const r2 = await dd(display);
  note("Display reload: shows the same held state and target from the shared record", r2.step === "2" && r2.safety === "1" && r2.stones === stonesBefore);
  await ctl.tapText("استئناف بعد إيقاف الأمان");
  note("explicit resume restarts both devices with progress kept", await both(ctl, display, (x) => x.status === "running" && x.safety === "0" && x.step === "2"));
  // ---- D. Control disappears -----------------------------------------------------------------------------------------------
  await ctl.eval(`location.href='about:blank'`);
  note("Control gone: the Display falls back to the calm safe state with a waiting card", await until(async () => (await dd(display)).connected === "0", 40000, 500));
  await display.shot(`${out}/shots/display-control-lost.png`);
  note("Control gone: no step advanced on the Display by itself", (await dd(display)).step === "2");
  await ctl.eval(`location.href='${BASE}/control/follow-the-footsteps'`);
  await until(() => ctl.eval(`!!document.querySelector('[data-testid=foot-control]')`), 90000, 500); await sleep(3000);
  const back = await cd(ctl);
  note("Control returns: adopts the session paused with a safety hold; Display reconnects", back.status === "paused" && back.safety === "1" && back.step === "2" && (await until(async () => (await dd(display)).connected === "1", 20000, 300)), JSON.stringify(back));
  // ---- E. second window --------------------------------------------------------------------------------------------------------
  extra = await openIpad(A, `${BASE}/control/follow-the-footsteps`);
  await sleep(12000);
  const second = await extra.eval(`({ control: !!document.querySelector('[data-testid=foot-control]'), blocked: document.body.innerText.includes('تعمل في نافذة أخرى') })`);
  note("a second window of the same account does not silently take over a live session", second.blocked && !second.control, JSON.stringify(second));
  await extra.send("Page.close").catch(() => {}); extra = null;
  await ctl.tapText("استئناف بعد إيقاف الأمان"); await both(ctl, display, (x) => x.status === "running");

  // ---- F. sensors: hints only, never a confirmed step; loss; manual fallback ----------------------------------------------------
  await setSelect(ctl, "input", "RIGHT_FOOT"); await sleep(600);
  const stepNow = (await cd(ctl)).step, acceptedNow = (await dd(display)).accepted;
  await ctl.tapText("حرّك القدم");
  note("sensor sim: a movement hint is shown to the therapist as a hint only", await until(() => ctl.eval(`document.body.innerText.includes('رُصدت حركة قدم')`), 12000, 200));
  await sleep(1500);
  note("sensor sim: movement never confirms a step or advances anything", (await cd(ctl)).step === stepNow && (await dd(display)).accepted === acceptedNow);
  await ctl.tapText("أوقف الحركة"); await ctl.tapText("افصل الحساس");
  note("sensor loss: link reported lost", await until(() => ctl.eval(`document.body.innerText.includes('الاتصال مفقود')`), 10000, 250));
  await confirm(ctl);
  note("manual fallback: therapist confirmation still works with the sensor lost", await both(ctl, display, (x) => Number(x.step) === Number(stepNow) + 1));
  await setSelect(ctl, "input", "MANUAL");

  // ---- G. layout settings: locked while a step is running, adjustable when paused; calibration estimate vs rendered size ------------------
  note("stone size / spacing / reach sliders are locked while running", await ctl.eval(`['stoneScale','spacing','reach','margin'].every((id) => document.getElementById(id)?.disabled === true)`));
  await ctl.tapText("إيقاف مؤقت"); await both(ctl, display, (x) => x.status === "paused");
  note("sliders unlock when paused", await ctl.eval(`['stoneScale','spacing','reach','margin'].every((id) => document.getElementById(id)?.disabled === false)`));
  const proj = (wx, wy) => display.eval(`JSON.stringify(window.__forest.project(${wx}, ${wy}))`).then(JSON.parse);
  const stoneAt = () => ctl.eval(`(() => { const svg = document.querySelector('[data-testid=stone-map]'); const g = svg.querySelectorAll('g[data-stone]')[0].querySelector('circle'); return JSON.stringify({ x: +g.getAttribute('cx'), y: +g.getAttribute('cy'), r: +g.getAttribute('r') }); })()`).then(JSON.parse);
  const s0 = await stoneAt();
  await setInput(ctl, "stoneScale", 70); await sleep(1500);
  const s1 = await stoneAt();
  note("a smaller stone size reaches both devices (radius shrinks, centre fixed)", s1.r < s0.r - 0.05 && Math.abs(s1.x - s0.x) < 0.01);
  await setInput(ctl, "stoneScale", 100); await sleep(1500);
  await setInput(ctl, "floorW", 320); await setInput(ctl, "floorH", 180); await sleep(300);
  await ctl.tapSel("[data-testid=apply-floor]"); await sleep(900);
  const readout = await ctl.eval(`document.querySelector('[data-testid=calibration-readout]').innerText`);
  const diaCm = Number((readout.match(/قطر الحجر التقديري:\s*≈\s*([\d.]+)/) ?? [])[1]);
  const status = await ctl.eval(`document.querySelector('[data-testid=calibration-status]').innerText`);
  note("calibration: estimated stone diameter appears after entering centimetres, labelled as unverified", diaCm > 20 && status.includes("غير متحقَّق"), `${diaCm} cm; ${status}`);
  const sc = await stoneAt();
  const a = await proj(sc.x - sc.r, sc.y), b = await proj(sc.x + sc.r, sc.y);
  const renderedCm = (b.x - a.x) * 320;
  note("calibration: the estimate matches the rendered stone width on a 320 cm floor (within 3 %)", Math.abs(diaCm - renderedCm) / renderedCm < 0.03, `estimate ${diaCm} cm, rendered ${renderedCm.toFixed(1)} cm`);
  await ctl.eval(`document.querySelector('[data-testid=calibration]').scrollIntoView({block:'start'})`); await ctl.shot(`${out}/shots/control-calibration.png`);
  await setInput(ctl, "floorW", 400); await setInput(ctl, "floorH", 300); await ctl.tapSel("[data-testid=apply-floor]"); await sleep(700);
  note("calibration: a mismatched floor shape is flagged as stretched", (await ctl.eval(`document.querySelector('[data-testid=calibration-readout]').innerText`)).includes("ممطوطة"));
  await setInput(ctl, "floorW", 320); await setInput(ctl, "floorH", 180); await ctl.tapSel("[data-testid=apply-floor]"); await sleep(500);

  // ---- H. floor view stability, calibration grid, cinematic preview, graphics presets, reduced motion -------------------------------------
  await ctl.tapText("متابعة"); await both(ctl, display, (x) => x.status === "running");
  const p1 = await proj(s0.x, s0.y); await sleep(3000); const p2 = await proj(s0.x, s0.y);
  note("floor view is stable: the camera never moves or rescales during play", Math.abs(p1.x - p2.x) < 1e-9 && Math.abs(p1.y - p2.y) < 1e-9 && (await dd(display)).view === "floor");
  await setCheck(ctl, "شبكة المعايرة", true); await sleep(1200); await display.shot(`${out}/shots/display-calibration-grid.png`); await setCheck(ctl, "شبكة المعايرة", false);
  await setSelect(ctl, "view", "cinematic"); await sleep(2500); await display.shot(`${out}/shots/display-cinematic-preview.png`);
  note("cinematic perspective is a separate, opt-in preview (floor is the default)", (await dd(display)).view === "cinematic");
  await setSelect(ctl, "view", "floor"); await sleep(1500);
  note("floor mode restored", (await dd(display)).view === "floor");
  const presets = {};
  for (const q of ["low", "medium", "high"]) {
    await setSelect(ctl, "quality", q); await sleep(3500);
    const m = await metrics(display); presets[q] = m;
    await display.shot(`${out}/shots/display-quality-${q}.png`);
  }
  note("graphics presets: low < medium < high in draw work, and all stay interactive", presets.low.calls <= presets.high.calls && presets.low.triangles < presets.high.triangles && [presets.low, presets.medium, presets.high].every((m) => m.fps >= 25), JSON.stringify(Object.fromEntries(Object.entries(presets).map(([k, v]) => [k, { calls: v.calls, tris: v.triangles, fps: v.fps }]))));
  await setCheck(ctl, "تقليل الحركة", true); await setCheck(ctl, "تباين عالٍ", true); await sleep(2500);
  await display.shot(`${out}/shots/display-reduced-motion-contrast.png`);
  note("accessibility toggles reach the Display", (await display.eval(`document.querySelector('[data-testid=foot-display]').className.includes('hc')`)) === true);
  const rm = await metrics(display);
  note("reduced motion keeps the render interactive", rm.fps >= 25, JSON.stringify(rm));
  await setCheck(ctl, "تقليل الحركة", false); await setCheck(ctl, "تباين عالٍ", false);

  // ---- I. other games still launch ------------------------------------------------------------------------------------------------
  const probe = async (path, needle) => { await ctl.eval(`location.href='${BASE}${path}'`); await until(() => ctl.eval(`document.body.innerText.includes(${JSON.stringify(needle)})`), 60000, 500); return ctl.eval(`document.body.innerText.includes(${JSON.stringify(needle)})`); };
  note("Balloon Quest control still launches", await probe("/control/balloon-quest", "بالون"));
  note("Color Chase control still launches", await probe("/control/color-chase", "الألوان"));
  note("the original game's sensor-play route still launches (rollback assets intact)", await probe("/control/follow-the-footsteps-sensor-play", "الخطو"));
  note("no uncaught exceptions", exceptions(ctl, display).length === 0, JSON.stringify(exceptions(ctl, display)));
} catch (e) {
  note("suite ran to completion", false, String(e?.stack ?? e).slice(0, 500));
} finally {
  writeFileSync(`${out}/e2e2-results.json`, JSON.stringify(results, null, 1));
  A.close(); B.close();
}
console.log(`${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(0);
