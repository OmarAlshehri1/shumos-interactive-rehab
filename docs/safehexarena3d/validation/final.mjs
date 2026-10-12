// Final production-integration check for Safe Hex Arena 3D on the original Shumos platform (emulators only).
import { launch, login, openIpad, selectPatient, sleep, until, note, results, rd } from "./crosslib.mjs";
import { seed } from "./seed.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const [out, BASE = "http://127.0.0.1:3417"] = process.argv.slice(2);
mkdirSync(`${out}/shots`, { recursive: true });
await seed();
const A = await launch(`${out}/ipad`, 9871), B = await launch(`${out}/laptop`, 9872), C = await launch(`${out}/outsider`, 9873);
const cd = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=hex-control]')?.dataset ?? null)`).then(JSON.parse);
const dd = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=hex-display]')?.dataset ?? null)`).then(JSON.parse);
const both = (c, d, pc, pd = pc) => until(async () => pc(await cd(c)) && pd(await dd(d)), 25000, 150);
const exceptions = (...tabs) => tabs.flatMap((t) => (t.events ?? []).filter((e) => e.method === "Runtime.exceptionThrown").map((e) => e.params.exceptionDetails.exception?.description?.slice(0, 160)));
const histCount = async () => Object.keys((await rd("sessions/patient-1")) ?? {}).length;
const safeTapAndConfirm = async (ctl, assisted) => {
  const tiles = (await ctl.eval(`document.querySelector('[data-testid=hex-map]').dataset.tiles`)).split(",");
  await ctl.tapSel(`[data-testid=hex-map] [data-tile="${tiles.findIndex((x) => x === "SAFE")}"]`); await sleep(250);
  return ctl.tapText(assisted ? "انتقال بمساعدة" : "أكّد: وصل لبلاطة آمنة");
};
let ctl, display, outsider;
try {
  display = await B.open(`${BASE}/display`, 1920, 1080);
  ctl = await openIpad(A, `${BASE}/control/activities`);
  await login(ctl); await selectPatient(ctl); await sleep(9000);
  // 1. exactly one card in the existing library
  const cards = await ctl.eval(`JSON.stringify({ titles: [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && e.textContent.trim() === 'الأرض الآمنة').length, links: [...document.querySelectorAll('a[href]')].filter((a) => a.getAttribute('href') === '/control/safe-hex-arena-3d').length, all: document.querySelectorAll('a[href^="/control/"]').length })`).then(JSON.parse);
  note("library: exactly one Safe Hex Arena card, linking to the normal Control route", cards.titles === 1 && cards.links === 1, JSON.stringify(cards));
  const txt = await ctl.eval(`document.body.innerText`);
  note("library: existing games, including Mirror Quest, are still listed", ["المرآة السحرية", "مغامرة البالونات", "اتبع الخطوات", "قائد الفضاء", "مطاردة الألوان"].every((n) => txt.includes(n)));
  await ctl.eval(`(() => { const e = [...document.querySelectorAll('*')].find((x) => x.children.length === 0 && x.textContent.trim() === 'الأرض الآمنة'); e.scrollIntoView({ block: 'center' }); })()`); await sleep(1200);
  await ctl.shot(`${out}/shots/library-card.png`);
  // 2. the card opens the normal Control route
  await ctl.eval(`document.querySelector('a[href="/control/safe-hex-arena-3d"]').click()`);
  note("Control route opens from the library card", await until(() => ctl.eval(`!!document.querySelector('[data-testid=hex-control]')`), 90000, 500));
  note("child Display (separate browser) renders the shared session", await until(() => display.eval(`!!document.querySelector('[data-testid=hex-display]')`), 60000, 500));
  await sleep(2000);

  // 3. session controls: start, assist, pause, resume, skip round, skip stage, restart, end
  await ctl.tapText("ابدأ المرحلة"); note("start", await both(ctl, display, (c) => c.status === "running", (d) => d.status === "running"));
  await ctl.tapText("ابدأ التحذير"); await both(ctl, display, (c) => c.phase === "warning", (d) => d.phase === "warning");
  await ctl.tapText("إيقاف مؤقت"); note("pause (both devices)", await both(ctl, display, (c) => c.status === "paused", (d) => d.status === "paused"));
  await ctl.tapText("متابعة"); note("resume (both devices)", await both(ctl, display, (c) => c.status === "running", (d) => d.status === "running"));
  await ctl.tapText("أطفئ البلاطات الآن"); await both(ctl, display, (c) => c.phase === "inactive", (d) => d.phase === "inactive");
  await safeTapAndConfirm(ctl, true); note("assisted transition accepted", await both(ctl, display, (c) => c.phase === "restoring", (d) => d.phase === "restoring"));
  await until(async () => (await cd(ctl)).phase === "prep" && (await cd(ctl)).round === "1", 15000, 100);
  await ctl.tapText("تجاوز الجولة"); note("skip round", await until(async () => (await cd(ctl)).round === "2" || (await cd(ctl)).phase === "restoring", 15000, 100));
  await until(async () => (await cd(ctl)).phase === "prep" && (await cd(ctl)).round === "2", 15000, 100);
  await ctl.tapText("تجاوز المرحلة"); note("skip stage", await both(ctl, display, (c) => c.status === "stage-complete", (d) => d.status === "stage-complete"));
  await ctl.tapText("إعادة البدء"); note("restart (new run, ready on both devices)", await both(ctl, display, (c) => c.status === "ready" && c.stage === "0", (d) => d.status === "ready"));
  // 4. a short real session, reload recovery, end, history save-once
  await ctl.tapText("ابدأ المرحلة"); await both(ctl, display, (c) => c.status === "running", (d) => d.status === "running");
  await ctl.tapText("ابدأ التحذير"); await both(ctl, display, (c) => c.phase === "warning", (d) => d.phase === "warning");
  const warnTiles = (await dd(display)).tiles;
  await ctl.send("Page.reload");
  await until(() => ctl.eval(`!!document.querySelector('[data-testid=hex-control]')`), 90000, 500); await sleep(2500);
  const rc = await cd(ctl);
  note("Control reload: same stage/round/warning, paused with safety hold", rc.status === "paused" && rc.safety === "1" && rc.phase === "warning" && (await dd(display)).tiles === warnTiles, JSON.stringify(rc));
  await ctl.tapText("استئناف بعد إيقاف الأمان"); await both(ctl, display, (c) => c.status === "running", (d) => d.status === "running");
  await ctl.tapText("أطفئ البلاطات الآن"); await both(ctl, display, (c) => c.phase === "inactive", (d) => d.phase === "inactive");
  await safeTapAndConfirm(ctl, false); await both(ctl, display, (c) => c.phase === "restoring", (d) => d.phase === "restoring");
  note("no history before the session ends", (await histCount()) === 0);
  await until(async () => (await cd(ctl)).phase === "prep", 15000, 100);
  await ctl.tapText("إنهاء الجلسة"); note("end (both devices)", await both(ctl, display, (c) => c.status === "ended", (d) => d.status === "ended"));
  await until(async () => (await histCount()) >= 1, 20000, 300); await sleep(6000);
  await ctl.send("Page.reload"); await until(() => ctl.eval(`!!document.querySelector('[data-testid=hex-control]')`), 90000, 500); await sleep(6000);
  await display.send("Page.reload"); await sleep(5000);
  const hist = (await rd("sessions/patient-1")) ?? {}; const rec = Object.values(hist)[0];
  note("history saved exactly once, even after Control and Display reloads", Object.keys(hist).length === 1 && rec?.gameId === "safe-hex-arena-3d" && rec.resultVersion === 1 && /-r1$/.test(Object.keys(hist)[0]), JSON.stringify(Object.keys(hist)));
  note("history reflects the restarted run (one assisted-free confirmed round), rows carry the tile count", rec?.totalRoundsCompleted === 1 && rec.totalSafeTransitions === 1 && rec.totalAssists === 0 && Object.values(rec.stageResults ?? {}).every((r) => [9].includes(r.tiles)), JSON.stringify({ rounds: rec?.totalRoundsCompleted, rows: rec?.stageResults }));
  note("public liveSession carries no patient id", !JSON.stringify(await rd("liveSession")).includes("patient-1"));

  // 5. staff authentication and authorization still enforced
  outsider = await openIpad(C, `${BASE}/control/safe-hex-arena-3d`);
  await login(outsider, "outsider@example.test"); await sleep(8000);
  const denied = await outsider.eval(`({ control: !!document.querySelector('[data-testid=hex-control]'), text: document.body.innerText.slice(0, 160) })`);
  note("a signed-in non-staff account cannot reach the game Control", denied.control === false, denied.text.replace(/\s+/g, " "));
  await outsider.shot(`${out}/shots/non-staff-denied.png`);
  const anon = await B.open(`${BASE}/control/safe-hex-arena-3d`, 1180, 820); await sleep(9000);
  note("a signed-out visitor sees the staff sign-in, not the game", await anon.eval(`!document.querySelector('[data-testid=hex-control]') && !!document.querySelector('input[type=email]')`));

  // 6. other games still launch from the same Control (Mirror Quest included)
  const probe = async (path, needle) => { await ctl.eval(`location.href='${BASE}${path}'`); await until(() => ctl.eval(`document.body.innerText.includes(${JSON.stringify(needle)})`), 60000, 500); return ctl.eval(`document.body.innerText.includes(${JSON.stringify(needle)})`); };
  note("Mirror Quest control launches", await probe("/control/mirror-quest-3d", "المرآة"));
  note("Balloon Quest control launches", await probe("/control/balloon-quest", "بالون"));
  note("Color Chase control launches", await probe("/control/color-chase", "الألوان"));
  note("no uncaught exceptions on any window", exceptions(ctl, display, outsider).length === 0, JSON.stringify(exceptions(ctl, display, outsider)));
} catch (e) {
  note("suite ran to completion", false, String(e?.stack ?? e).slice(0, 500));
} finally {
  writeFileSync(`${out}/final-results.json`, JSON.stringify(results, null, 1));
  A.close(); B.close(); C.close();
}
console.log(`${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(0);
