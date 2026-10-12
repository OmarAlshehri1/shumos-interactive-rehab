// Safe Hex Arena 3D: enlarged floor layout, presets, aspect ratios and physical calibration in real browsers.
// Control (iPad touch) and Display are separate Chrome processes sharing only the Firebase EMULATORS. Never production.
import { launch, login, openIpad, selectPatient, sleep, until, note, results } from "./crosslib.mjs";
import { seed } from "./seed.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const [out, BASE = "http://127.0.0.1:3417"] = process.argv.slice(2);
mkdirSync(`${out}/shots`, { recursive: true });
await seed();
const A = await launch(`${out}/ipad`, 9861), B = await launch(`${out}/laptop`, 9862);
const cd = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=hex-control]')?.dataset ?? null)`).then(JSON.parse);
const dd = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=hex-display]')?.dataset ?? null)`).then(JSON.parse);
const setSelect = (t, id, value) => t.eval(`(() => { const e = document.getElementById(${JSON.stringify(id)}); if (!e) return false; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
const setInput = (t, id, value) => t.eval(`(() => { const e = document.getElementById(${JSON.stringify(id)}); if (!e) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e, ${JSON.stringify(String(value))}); e.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const exceptions = (...tabs) => tabs.flatMap((t) => (t.events ?? []).filter((e) => e.method === "Runtime.exceptionThrown").map((e) => e.params.exceptionDetails.exception?.description?.slice(0, 160)));
const layoutOnBoth = (c, d, key) => until(async () => (await dd(d))?.layout === key && (await c.eval(`document.querySelector('[data-testid=hex-map]')?.dataset.layout`)) === key, 25000, 150);
// real on-screen measurement of the arena from the rendered camera
const measure = (t, n) => t.eval(`(() => { const P = window.__hexArena.project; const xs = [], ys = []; for (let i = 0; i < ${n}; i++) for (let k = 0; k < 6; k++) { const a = Math.PI / 180 * (60 * k - 30); const p = P(i, Math.cos(a), Math.sin(a)); xs.push(p.x); ys.push(p.y); } const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys); const c0 = P(0), c1 = P(1); return JSON.stringify({ w, h, area: w * h, innerW: innerWidth, innerH: innerHeight, cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2, c0, c1 }); })()`).then(JSON.parse);
const parity = async (c, d, n) => {
  const disp = await d.eval(`JSON.stringify(Array.from({length:${n}},(_, i) => window.__hexArena.project(i)))`).then(JSON.parse);
  const map = await c.eval(`JSON.stringify([...document.querySelectorAll('[data-testid=hex-map] [data-tile]')].map((g) => { const b = g.querySelector('polygon').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }))`).then(JSON.parse);
  const norm = (pts) => { const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y); const w = Math.max(...xs) - Math.min(...xs) || 1, h = Math.max(...ys) - Math.min(...ys) || 1; return pts.map((p) => ({ x: (p.x - Math.min(...xs)) / w, y: (p.y - Math.min(...ys)) / h })); };
  const a = norm(disp), b = norm(map);
  return map.length === n && Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));
};
const covRows = [];
let ctl, display;
try {
  display = await B.open(`${BASE}/display`, 1920, 1080);
  ctl = await openIpad(A, `${BASE}/control`);
  await login(ctl); await selectPatient(ctl); await sleep(3000);
  await ctl.eval(`location.href='/control/safe-hex-arena-3d'`);
  await until(() => ctl.eval(`!!document.querySelector('[data-testid=hex-control]')`), 90000, 500);
  await until(() => display.eval(`!!document.querySelector('[data-testid=hex-display]')`), 60000, 500);
  await sleep(2500);

  // ---- 1. STANDARD on 16:9: enlarged arena, real measured coverage for Easy / Medium / Advanced -----------------
  const shotStage = async (stage, label) => {
    await setSelect(ctl, "stage", String(stage)); await sleep(700);
    await ctl.tapText("ابدأ المرحلة");
    await until(async () => (await cd(ctl)).status === "running", 15000, 150);
    await ctl.tapText("ابدأ التحذير");
    await until(async () => (await dd(display)).phase === "warning", 15000, 150);
    await sleep(2300);
    const d = await dd(display), n = d.tiles.split(",").length;
    const m = await measure(display, n);
    const par = await parity(ctl, display, n);
    note(`${label}: Display layout ${d.layout} matches the therapist map (max normalised error ${par.toFixed(4)})`, par < 0.02 && (await ctl.eval(`document.querySelector('[data-testid=hex-map]').dataset.layout`)) === d.layout);
    covRows.push({ label, layout: d.layout, tiles: n, width: +(m.w * 100).toFixed(1), height: +(m.h * 100).toFixed(1), screenCoverage: +(m.area * 100).toFixed(1), centred: Math.abs(m.cx - 0.5) < 0.01 && Math.abs(m.cy - 0.5) < 0.01 });
    note(`${label}: arena is centred and inside the safe margin`, Math.abs(m.cx - 0.5) < 0.01 && Math.abs(m.cy - 0.5) < 0.01 && m.w <= 0.9401 && m.h <= 0.9401, JSON.stringify({ w: m.w.toFixed(3), h: m.h.toFixed(3) }));
    await display.shot(`${out}/shots/display-standard-${label}.png`); await ctl.shot(`${out}/shots/control-standard-${label}.png`);
    await ctl.tapText("تجاوز المرحلة");
    await until(async () => (await cd(ctl)).status === "stage-complete", 15000, 150);
  };
  await shotStage(0, "easy"); await shotStage(3, "medium"); await shotStage(6, "advanced");

  // ---- 2. presets (between stages only) ---------------------------------------------------------------------------
  const presetCheck = async (preset, expectTiles, stage, shotName) => {
    await setSelect(ctl, "layoutPreset", preset); await sleep(600);
    await setSelect(ctl, "stage", String(stage)); await sleep(600);
    const key = await ctl.eval(`document.querySelector('[data-testid=hex-map]').dataset.layout`);
    note(`${preset}: stage ${stage + 1} uses ${expectTiles} tiles on Control and Display`, key.startsWith(`${expectTiles}:`) && (await layoutOnBoth(ctl, display, key)), key);
    await ctl.tapText("ابدأ المرحلة"); await until(async () => (await cd(ctl)).status === "running", 15000, 150);
    await ctl.tapText("ابدأ التحذير"); await until(async () => (await dd(display)).phase === "warning", 15000, 150); await sleep(2200);
    const m = await measure(display, expectTiles), par = await parity(ctl, display, expectTiles);
    note(`${preset}: tile positions identical on both devices`, par < 0.02, String(par));
    covRows.push({ label: `${preset}-stage${stage + 1}`, layout: key, tiles: expectTiles, width: +(m.w * 100).toFixed(1), height: +(m.h * 100).toFixed(1), screenCoverage: +(m.area * 100).toFixed(1) });
    await display.shot(`${out}/shots/display-${shotName}.png`); await ctl.shot(`${out}/shots/control-${shotName}.png`);
    return key;
  };
  await presetCheck("EXTRA_LARGE", 6, 1, "extralarge-easy");
  // preset locked while the round is live
  note("preset selector is locked while a stage is running", await ctl.eval(`document.getElementById('layoutPreset').disabled === true`));
  // play this stage to completion manually on the extra-large layout
  for (let r = 0; r < 3; r++) {
    if (r > 0) { await until(async () => (await cd(ctl)).phase === "prep" && (await cd(ctl)).round === String(r), 15000, 100); await ctl.tapText("ابدأ التحذير"); }
    await until(async () => (await cd(ctl)).phase === "warning", 15000, 100);
    await ctl.tapText("أطفئ البلاطات الآن"); await until(async () => (await dd(display)).phase === "inactive", 15000, 100);
    const tiles = (await ctl.eval(`document.querySelector('[data-testid=hex-map]').dataset.tiles`)).split(",");
    await ctl.tapSel(`[data-testid=hex-map] [data-tile="${tiles.findIndex((x) => x === "SAFE")}"]`); await sleep(250);
    await ctl.tapText(r === 1 ? "انتقال بمساعدة" : "أكّد: وصل لبلاطة آمنة");
    await until(async () => (await dd(display)).phase === "restoring", 15000, 100);
  }
  note("EXTRA_LARGE: a full stage is playable manually and syncs", await until(async () => (await cd(ctl)).status === "stage-complete" && (await dd(display)).status === "stage-complete", 20000, 150));
  await presetCheck("COMPACT", 12, 2, "compact-easy");
  await ctl.tapText("تجاوز المرحلة"); await until(async () => (await cd(ctl)).status === "stage-complete", 15000, 150);

  // ---- 3. aspect ratio: 4:3 projector image, Display resized to 4:3 ------------------------------------------------
  await setSelect(ctl, "layoutPreset", "STANDARD"); await setSelect(ctl, "stage", "7"); await sleep(500);
  await display.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false });
  await setSelect(ctl, "aspect", "4:3"); await sleep(800);
  const k43 = await ctl.eval(`document.querySelector('[data-testid=hex-map]').dataset.layout`);
  note("4:3 aspect: both devices switch to the same re-fitted layout", await layoutOnBoth(ctl, display, k43), k43);
  await ctl.tapText("ابدأ المرحلة"); await until(async () => (await cd(ctl)).status === "running", 15000, 150);
  await ctl.tapText("ابدأ التحذير"); await until(async () => (await dd(display)).phase === "warning", 15000, 150); await sleep(2200);
  const m43 = await measure(display, 16), par43 = await parity(ctl, display, 16);
  note("4:3 aspect: tile positions identical on both devices", par43 < 0.02, par43.toFixed(4));
  note("4:3 aspect: arena stays centred and inside margins", Math.abs(m43.cx - 0.5) < 0.01 && Math.abs(m43.cy - 0.5) < 0.01 && m43.w <= 0.9401 && m43.h <= 0.9401, JSON.stringify({ w: m43.w.toFixed(3), h: m43.h.toFixed(3) }));
  covRows.push({ label: "STANDARD-4:3-advanced", layout: k43, tiles: 16, width: +(m43.w * 100).toFixed(1), height: +(m43.h * 100).toFixed(1), screenCoverage: +(m43.area * 100).toFixed(1) });
  await display.shot(`${out}/shots/display-standard-43-advanced.png`);
  await ctl.tapText("تجاوز المرحلة"); await until(async () => (await cd(ctl)).status === "stage-complete", 15000, 150);
  await display.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await setSelect(ctl, "aspect", "16:9"); await sleep(600);

  // ---- 4. physical calibration interface ----------------------------------------------------------------------------
  await ctl.eval(`document.querySelector('[data-testid=calibration]').scrollIntoView({block:'start'})`);
  const before = await ctl.eval(`document.querySelector('[data-testid=calibration-readout]').innerText`);
  note("calibration: no physical size is shown before dimensions are entered", !/≈\s*\d+\s*سم/.test(before) && before.includes("لا تُعرض أي أبعاد فعلية"), before.slice(0, 80));
  await setSelect(ctl, "stage", "8"); await sleep(400);
  // a floor whose shape differs from the 16:9 projector image would be stretched: the panel must say so
  await setInput(ctl, "floorW", 400); await setInput(ctl, "floorH", 300); await sleep(300);
  await ctl.tapSel("[data-testid=apply-floor]"); await sleep(900);
  note("calibration: a floor shape that does not match the projector image is flagged as stretched", (await ctl.eval(`document.querySelector('[data-testid=calibration-readout]').innerText`)).includes("ممطوطة"));
  await setInput(ctl, "floorW", 320); await setInput(ctl, "floorH", 180); await sleep(300);
  await ctl.tapSel("[data-testid=apply-floor]"); await sleep(900);
  const after = await ctl.eval(`document.querySelector('[data-testid=calibration-readout]').innerText`);
  note("calibration: estimated hexagon width and spacing appear after entering centimetres", /≈\s*\d+\s*سم/.test(after) && after.includes("الفاصل الآمن التقديري") && !after.includes("ممطوطة"), after.replace(/\s+/g, " ").slice(0, 260));
  const status1 = await ctl.eval(`document.querySelector('[data-testid=calibration-status]').innerText`);
  note("calibration: states clearly that the size is unverified until measured", status1.includes("غير متحقَّق"), status1);
  await ctl.eval(`document.querySelector('[data-testid=calibration]').scrollIntoView({block:'start'})`);
  await ctl.shot(`${out}/shots/control-calibration.png`);
  await ctl.eval(`(() => { const l = [...document.querySelectorAll('label')].find((x) => x.textContent.includes('قِستُ الإسقاط')); l.querySelector('input').click(); })()`); await sleep(600);
  const status2 = await ctl.eval(`document.querySelector('[data-testid=calibration-status]').innerText`);
  note("calibration: even when confirmed it says the figures are estimates the system cannot verify", status2.includes("لا يتحقق النظام"), status2);
  // the estimate must agree with what the Display really renders: tile flat-to-flat as a fraction of the 320 cm wide image
  const est = await ctl.eval(`document.querySelector('[data-testid=calibration-readout]').innerText`);
  const tileCm = Number((est.match(/ضلع لضلع\):\s*≈\s*([\d.]+)/) ?? [])[1]);
  const gapCm = Number((est.match(/الفاصل الآمن التقديري بين البلاطات:\s*≈\s*([\d.]+)/) ?? [])[1]);
  console.log("estimate text:", est.replace(/\s+/g, " "));
  await ctl.tapText("ابدأ المرحلة"); await until(async () => (await cd(ctl)).status === "running", 15000, 150);
  await ctl.tapText("ابدأ التحذير"); await until(async () => (await dd(display)).phase === "warning", 15000, 150); await sleep(1500);
  const px = await display.eval(`(() => { const P = window.__hexArena.project; const h = 0.93 * Math.sqrt(3) / 2; const a = P(0, -h, 0), b = P(0, h, 0); const c = P(0, Math.sqrt(3) / 2, 0), d = P(0, -Math.sqrt(3) / 2, 0); return JSON.stringify({ tile: (b.x - a.x), cell: (c.x - d.x), tileY: (P(0, 0, 0.93).y - P(0, 0, -0.93).y) }); })()`).then(JSON.parse);
  const renderedTileCm = px.tile * 320, renderedGapCm = (px.cell - px.tile) * 320;
  note("calibration: the estimated tile width matches the rendered tile width on a 320 cm floor (within 2 %)", Math.abs(tileCm - renderedTileCm) / renderedTileCm < 0.02, `estimate ${tileCm} cm, rendered ${renderedTileCm.toFixed(1)} cm`);
  note("calibration: the estimated spacing matches the rendered gap (within 0.6 cm)", Math.abs(gapCm - renderedGapCm) < 0.6, `estimate ${gapCm} cm, rendered ${renderedGapCm.toFixed(2)} cm`);
  note("calibration: the tile is plausible for a 320 cm floor (25–60 cm)", tileCm > 25 && tileCm < 60, String(tileCm));
  await display.shot(`${out}/shots/display-calibrated-advanced.png`);

  // ---- 5. no camera movement / orthographic in floor view ---------------------------------------------------------
  const a = await measure(display, 16); await sleep(3000); const b = await measure(display, 16);
  note("floor view is stable: the arena does not move or rescale during play", Math.abs(a.cx - b.cx) < 1e-6 && Math.abs(a.w - b.w) < 1e-6 && (await dd(display)).view === "floor");
  note("no uncaught exceptions", exceptions(ctl, display).length === 0, JSON.stringify(exceptions(ctl, display)));
  writeFileSync(`${out}/coverage.json`, JSON.stringify(covRows, null, 1));
  console.log("COVERAGE", JSON.stringify(covRows));
} catch (e) {
  note("suite ran to completion", false, String(e?.stack ?? e).slice(0, 500));
} finally {
  writeFileSync(`${out}/layout-results.json`, JSON.stringify(results, null, 1));
  A.close(); B.close();
}
console.log(`${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(0);
