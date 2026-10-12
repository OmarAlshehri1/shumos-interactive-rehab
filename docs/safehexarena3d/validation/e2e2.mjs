// Safe Hex Arena 3D robustness: safety hold, Control/Display reload, Control disconnect, sensor simulation + loss,
// second window, accessibility/calibration modes, tile layout parity, other games still launch. Emulators only.
import { launch, login, openIpad, selectPatient, sleep, until, note, results } from "./crosslib.mjs";
import { seed } from "./seed.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const [out, BASE = "http://127.0.0.1:3417"] = process.argv.slice(2);
mkdirSync(`${out}/shots`, { recursive: true });
await seed();
const A = await launch(`${out}/ipad`, 9831), B = await launch(`${out}/laptop`, 9832);
const cd = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=hex-control]')?.dataset ?? null)`).then(JSON.parse);
const dd = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=hex-display]')?.dataset ?? null)`).then(JSON.parse);
const both = (c, d, pc, pd = pc) => until(async () => pc(await cd(c)) && pd(await dd(d)), 25000, 150);
const exceptions = (...tabs) => tabs.flatMap((t) => (t.events ?? []).filter((e) => e.method === "Runtime.exceptionThrown").map((e) => e.params.exceptionDetails.exception?.description?.slice(0, 160)));
const setSelect = (t, id, value) => t.eval(`(() => { const e = document.getElementById(${JSON.stringify(id)}); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
const setCheck = (t, text, on) => t.eval(`(() => { const l = [...document.querySelectorAll('label')].find((x) => x.textContent.includes(${JSON.stringify(text)})); const i = l?.querySelector('input'); if (!i) return false; if (i.checked !== ${on}) i.click(); return true; })()`);
let ctl, display, extra;
try {
  display = await B.open(`${BASE}/display`, 1920, 1080);
  ctl = await openIpad(A, `${BASE}/control`);
  await login(ctl); await selectPatient(ctl); await sleep(3000);
  await ctl.eval(`location.href='/control/safe-hex-arena-3d'`);
  await until(() => ctl.eval(`!!document.querySelector('[data-testid=hex-control]')`), 90000, 500);
  await until(() => display.eval(`!!document.querySelector('[data-testid=hex-display]')`), 60000, 500);
  await sleep(1500);

  // ---- A. layout parity: Display projected tile order == therapist map order, for the three layouts -------------
  const rank = (a) => a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]).map((p) => p[1]).join(",");
  const parity = async (n) => {
    const disp = await display.eval(`JSON.stringify(Array.from({length:${n}},(_, i) => window.__hexArena.project(i)))`).then(JSON.parse);
    const map = await ctl.eval(`JSON.stringify([...document.querySelectorAll('[data-testid=hex-map] [data-tile]')].map((g) => { const b = g.querySelector('polygon').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }))`).then(JSON.parse);
    // same geometry up to translation/scale: normalised coordinates must agree
    const norm = (pts) => { const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y); const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys); return pts.map((p) => ({ x: (p.x - Math.min(...xs)) / w, y: (p.y - Math.min(...ys)) / h })); };
    const a = norm(disp), b = norm(map);
    const maxErr = Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));
    return { maxErr, sameOrder: rank(disp.map((p) => p.x * 1000 + p.y)) === rank(map.map((p) => p.x * 1000 + p.y)) };
  };
  const p9 = await parity(9);
  note("layout parity (9 tiles): Display tile i is where the map shows tile i", p9.maxErr < 0.02, `max normalised error ${p9.maxErr.toFixed(4)}`);

  // ---- B. start, warn, safety hold -----------------------------------------------------------------------------
  await ctl.tapText("ابدأ المرحلة");
  await both(ctl, display, (c) => c.status === "running", (d) => d.status === "running");
  await ctl.tapText("ابدأ التحذير");
  await both(ctl, display, (c) => c.phase === "warning", (d) => d.phase === "warning");
  const warnTiles = (await dd(display)).tiles;
  await ctl.tapSel("[data-testid=safety]");
  note("safety: both devices enter a paused safety hold", await both(ctl, display, (c) => c.status === "paused" && c.safety === "1", (d) => d.status === "paused" && d.safety === "1"));
  await display.shot(`${out}/shots/display-safety.png`); await ctl.shot(`${out}/shots/control-safety.png`);
  await sleep(9000); // auto timing would have gone inactive after 5 s
  const frozen = await dd(display);
  note("safety: layout stays frozen and nothing advances while held (9 s > warning time)", frozen.phase === "warning" && frozen.tiles === warnTiles && (await cd(ctl)).phase === "warning");
  const resumeTxt = await ctl.eval(`[...document.querySelectorAll('button')].map(b=>b.textContent.trim()).includes('استئناف بعد إيقاف الأمان')`);
  note("safety: resume needs an explicit, clearly-labelled therapist action", resumeTxt);
  // ---- C. Control reload during the held warning ---------------------------------------------------------------
  await ctl.send("Page.reload");
  await until(() => ctl.eval(`!!document.querySelector('[data-testid=hex-control]')`), 90000, 500);
  await sleep(2500);
  const rc = await cd(ctl);
  note("Control reload: recovers the same stage/round/warning, paused with a safety hold, never auto-resuming", rc.status === "paused" && rc.safety === "1" && rc.phase === "warning" && rc.stage === "0" && (await dd(display)).tiles === warnTiles, JSON.stringify(rc));
  await sleep(7000);
  note("Control reload: still frozen 7 s later", (await cd(ctl)).phase === "warning" && (await dd(display)).phase === "warning");
  // ---- D. Display reload ---------------------------------------------------------------------------------------
  await display.send("Page.reload");
  await until(() => display.eval(`!!document.querySelector('[data-testid=hex-display]')`), 60000, 500);
  const rd2 = await dd(display);
  note("Display reload: shows the same held state from the shared record", rd2.tiles === warnTiles && rd2.safety === "1" && rd2.phase === "warning");
  await ctl.tapText("استئناف بعد إيقاف الأمان");
  note("explicit resume restarts both devices", await both(ctl, display, (c) => c.status === "running" && c.safety === "0", (d) => d.status === "running"));
  // ---- E. Control disappears: Display goes to a safe visual state, nothing advances ----------------------------
  await ctl.eval(`location.href='about:blank'`);
  note("Control gone: Display falls back to the safe visual state (waiting overlay, all-safe arena)", await until(async () => (await dd(display)).connected === "0", 40000, 500));
  await display.shot(`${out}/shots/display-control-lost.png`);
  note("Control gone: phase never advanced to inactive on the Display", (await dd(display)).phase !== "inactive");
  await ctl.eval(`location.href='${BASE}/control/safe-hex-arena-3d'`);
  await until(() => ctl.eval(`!!document.querySelector('[data-testid=hex-control]')`), 90000, 500); await sleep(3000);
  const back = await cd(ctl);
  note("Control returns: adopts the session paused with a safety hold; Display reconnects", back.status === "paused" && back.safety === "1" && (await until(async () => (await dd(display)).connected === "1", 20000, 300)), JSON.stringify(back));
  // ---- F. second window of the same account is blocked ---------------------------------------------------------
  extra = await openIpad(A, `${BASE}/control/safe-hex-arena-3d`);
  await sleep(12000);
  const blockedTxt = await extra.eval(`document.body.innerText.includes('تعمل في نافذة أخرى') || !!document.querySelector('[data-testid=hex-control]')`);
  const secondIsControl = await extra.eval(`!!document.querySelector('[data-testid=hex-control]')`);
  note("second window of the same account does not silently take over a live session", blockedTxt && !secondIsControl, secondIsControl ? "second window became a control" : "blocked");
  await extra.send("Page.close").catch(() => {}); extra = null;
  await ctl.tapText("استئناف بعد إيقاف الأمان"); await both(ctl, display, (c) => c.status === "running", (d) => d.status === "running");
  // ---- G. sensors: simulated foot hint, never a tile, manual fallback after loss ---------------------------------
  await ctl.tapText("أطفئ البلاطات الآن").then(() => null); // may be absent if not in warning; harmless
  await ctl.eval(`window.scrollTo(0,0)`);
  await setSelect(ctl, "input", "RIGHT_FOOT"); await sleep(600);
  const phaseNow = (await cd(ctl)).phase;
  if (phaseNow === "prep") await ctl.tapText("ابدأ التحذير");
  await until(async () => ["warning", "inactive"].includes((await cd(ctl)).phase), 15000, 150);
  const childBefore = await ctl.eval(`document.querySelector('[data-testid=hex-control]').innerText.includes('موقع الطفل غير مؤكد')`);
  await ctl.tapText("حرّك القدم");
  note("sensor sim: a movement hint is shown to the therapist as a hint only", await until(() => ctl.eval(`document.body.innerText.includes('رُصدت حركة قدم')`), 12000, 200));
  const childAfter = await ctl.eval(`document.querySelector('[data-testid=hex-control]').innerText.includes('موقع الطفل غير مؤكد')`);
  note("sensor sim: movement never assigns a tile (child position unchanged)", childBefore === childAfter);
  await ctl.tapText("أوقف الحركة"); await ctl.tapText("افصل الحساس");
  note("sensor loss: link reported lost", await until(() => ctl.eval(`document.body.innerText.includes('الاتصال مفقود')`), 10000, 250));
  await until(async () => (await cd(ctl)).phase === "warning" || (await cd(ctl)).phase === "inactive", 5000, 150);
  const tiles = (await ctl.eval(`document.querySelector('[data-testid=hex-map]').dataset.tiles`)).split(",");
  await ctl.tapSel(`[data-testid=hex-map] [data-tile="${tiles.findIndex((s) => s === "SAFE")}"]`); await sleep(300);
  await ctl.tapText("أكّد: وصل لبلاطة آمنة");
  note("manual fallback: therapist confirmation still works with the sensor lost", await both(ctl, display, (c) => c.phase === "restoring", (d) => d.phase === "restoring"));

  // ---- H. accessibility + calibration modes ----------------------------------------------------------------------
  await sleep(2500);
  await setSelect(ctl, "input", "MANUAL");
  await setCheck(ctl, "تباين عالٍ", true); await setCheck(ctl, "تقليل الحركة", true); await setCheck(ctl, "شبكة المعايرة", true); await sleep(2500);
  await display.shot(`${out}/shots/display-highcontrast-grid.png`);
  note("accessibility toggles reach the Display", (await display.eval(`document.querySelector('[data-testid=hex-display]').className.includes('hc')`)) === true);
  await setCheck(ctl, "تباين عالٍ", false); await setCheck(ctl, "شبكة المعايرة", false);
  await setSelect(ctl, "view", "cinematic"); await sleep(2500);
  await display.shot(`${out}/shots/display-cinematic-preview.png`);
  note("cinematic preview is a separate, opt-in mode (floor is the default)", (await dd(display)).view === "cinematic");
  await setSelect(ctl, "view", "floor"); await sleep(1500);
  note("floor projection mode is the default and restorable", (await dd(display)).view === "floor");
  await setCheck(ctl, "تقليل الحركة", false);
  const metrics = await display.eval(`document.querySelector('canvas')?.dataset.metrics`);
  note("render stays at interactive frame rate after mode changes", JSON.parse(metrics).fps >= 30, metrics);

  // ---- I. other games still launch --------------------------------------------------------------------------------
  const probe = async (path, needle) => { await ctl.eval(`location.href='${BASE}${path}'`); await until(() => ctl.eval(`document.body.innerText.includes(${JSON.stringify(needle)})`), 60000, 500); return ctl.eval(`document.body.innerText.includes(${JSON.stringify(needle)})`); };
  note("library lists Safe Hex Arena and the existing games", await (async () => { await ctl.eval(`location.href='${BASE}/control'`); await sleep(9000); const txt = await ctl.eval(`document.body.innerText`); return ["الأرض الآمنة", "مغامرة البالونات", "اتبع الخطوات", "قائد الفضاء", "مطاردة الألوان"].every((n) => txt.includes(n)); })());
  note("Balloon Quest control still launches", await probe("/control/balloon-quest", "بالون"));
  note("Color Chase control still launches", await probe("/control/color-chase", "الألوان"));
  note("no uncaught exceptions", exceptions(ctl, display).length === 0, JSON.stringify(exceptions(ctl, display)));
} catch (e) {
  note("suite ran to completion", false, String(e?.stack ?? e).slice(0, 500));
} finally {
  writeFileSync(`${out}/e2e2-results.json`, JSON.stringify(results, null, 1));
  A.close(); B.close();
}
console.log(`${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(0);
