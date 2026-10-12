// Final production-integration check for Follow the Footsteps 3D on the original Shumos platform (emulators only).
import { launch, login, openIpad, selectPatient, sleep, until, note, results, rd } from "./crosslib.mjs";
import { seed } from "./seed.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const [out, BASE = "http://127.0.0.1:3417"] = process.argv.slice(2);
mkdirSync(`${out}/shots`, { recursive: true });
await seed();
const A = await launch(`${out}/ipad`, 9971), B = await launch(`${out}/laptop`, 9972), C = await launch(`${out}/outsider`, 9973);
const cd = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=foot-control]')?.dataset ?? null)`).then(JSON.parse);
const dd = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=foot-display]')?.dataset ?? null)`).then(JSON.parse);
const both = (c, d, pc, pd = pc) => until(async () => pc(await cd(c)) && pd(await dd(d)), 25000, 120);
const exceptions = (...tabs) => tabs.flatMap((t) => (t.events ?? []).filter((e) => e.method === "Runtime.exceptionThrown").map((e) => e.params.exceptionDetails.exception?.description?.slice(0, 160)));
const histCount = async () => Object.keys((await rd("sessions/patient-1")) ?? {}).length;
let ctl, display, outsider;
try {
  display = await B.open(`${BASE}/display`, 1920, 1080);
  ctl = await openIpad(A, `${BASE}/control/activities`);
  await login(ctl); await selectPatient(ctl); await sleep(9000);
  // 1. the existing library: exactly one Follow the Footsteps card, the 3D one
  const cards = await ctl.eval(`JSON.stringify({ titles: [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && e.textContent.trim() === 'اتبع الخطوات').length, links: [...document.querySelectorAll('a[href]')].filter((a) => a.getAttribute('href') === '/control/follow-the-footsteps').length, en: document.body.innerText.includes('Follow the Footsteps 3D'), legacyLinks: [...document.querySelectorAll('a[href]')].filter((a) => /footsteps-legacy/.test(a.getAttribute('href'))).length })`).then(JSON.parse);
  note("library: exactly one Follow the Footsteps card, the 3D one, linking to the canonical route", cards.titles === 1 && cards.links === 1 && cards.en && cards.legacyLinks === 0, JSON.stringify(cards));
  const txt = await ctl.eval(`document.body.innerText`);
  note("library: the other games are untouched (Mirror Quest, Safe Hex Arena, Balloon Quest, Color Chase, Space Pilot)", ["المرآة السحرية", "الأرض الآمنة", "مغامرة البالونات", "مطاردة الألوان", "قائد الفضاء"].every((n) => txt.includes(n)));
  await ctl.eval(`(() => { const e = [...document.querySelectorAll('*')].find((x) => x.children.length === 0 && x.textContent.trim() === 'اتبع الخطوات'); e.scrollIntoView({ block: 'center' }); })()`); await sleep(1200);
  await ctl.shot(`${out}/shots/library-card.png`);
  await ctl.eval(`document.querySelector('a[href="/control/follow-the-footsteps"]').click()`);
  note("the card opens the 3D Control on the canonical route", await until(() => ctl.eval(`!!document.querySelector('[data-testid=foot-control]')`), 90000, 500));
  note("the child Display (separate browser) renders the shared session", await until(() => display.eval(`!!document.querySelector('[data-testid=foot-display]')`), 60000, 500));
  await sleep(2500);
  // 2. session controls: start, confirm, assist, pause, resume, repeat, skip, skip stage, restart
  await ctl.tapText("ابدأ المرحلة"); note("start", await both(ctl, display, (x) => x.status === "running"));
  await ctl.tapSel("[data-testid=confirm]"); note("confirm a step", await both(ctl, display, (x) => x.step === "1"));
  await ctl.tapText("خطوة بمساعدة"); note("assisted step", await both(ctl, display, (x) => x.step === "2"));
  await ctl.tapText("أعد التلميح"); note("repeat the cue (no progress change)", await until(async () => (await dd(display)).cue === "1" && (await dd(display)).step === "2", 8000, 100));
  await ctl.tapText("إيقاف مؤقت"); note("pause (both devices)", await both(ctl, display, (x) => x.status === "paused"));
  await ctl.tapText("متابعة"); note("resume (both devices)", await both(ctl, display, (x) => x.status === "running"));
  await ctl.tapText("تجاوز الخطوة"); note("skip a step", await both(ctl, display, (x) => x.step === "3"));
  await ctl.tapText("تجاوز المرحلة"); note("skip the stage", await both(ctl, display, (x) => x.status === "stage-complete"));
  await ctl.tapText("إعادة البدء"); note("restart (new run, ready on both devices)", await both(ctl, display, (x) => x.status === "ready" && x.stage === "0", (x) => x.status === "ready"));
  // 3. a short real session, reload recovery, end, history save-once
  await ctl.tapText("ابدأ المرحلة"); await both(ctl, display, (x) => x.status === "running");
  await ctl.tapSel("[data-testid=confirm]"); await both(ctl, display, (x) => x.step === "1");
  await ctl.tapText("خطوة بمساعدة"); await both(ctl, display, (x) => x.step === "2");
  await ctl.send("Page.reload");
  await until(() => ctl.eval(`!!document.querySelector('[data-testid=foot-control]')`), 90000, 500); await sleep(2500);
  const rc = await cd(ctl);
  note("Control reload: same stage and step, paused with a safety hold", rc.status === "paused" && rc.safety === "1" && rc.step === "2" && rc.stage === "0", JSON.stringify(rc));
  await ctl.tapText("استئناف بعد إيقاف الأمان"); await both(ctl, display, (x) => x.status === "running");
  note("no history before the session ends", (await histCount()) === 0);
  await ctl.tapText("إنهاء الجلسة"); note("end (both devices)", await both(ctl, display, (x) => x.status === "ended"));
  await until(async () => (await histCount()) >= 1, 20000, 300); await sleep(6000);
  await ctl.send("Page.reload"); await until(() => ctl.eval(`!!document.querySelector('[data-testid=foot-control]')`), 90000, 500); await sleep(6000);
  await display.send("Page.reload"); await sleep(5000);
  const hist = (await rd("sessions/patient-1")) ?? {}; const rec = Object.values(hist)[0];
  note("history saved exactly once, even after Control and Display reloads", Object.keys(hist).length === 1 && rec?.gameId === "follow-the-footsteps" && rec.resultVersion === 2 && rec.engine === "fp3-forest" && /-r1$/.test(Object.keys(hist)[0]), JSON.stringify(Object.keys(hist)));
  note("history reflects the restarted run and is distinguishable from the original five-stage format", rec?.totalStepsCompleted === 2 && rec.totalAssists === 1 && rec.totalStepsPresented === 4 && rec.stageResults && Object.values(rec.stageResults).every((r) => r.engine === "fp3"), JSON.stringify({ done: rec?.totalStepsCompleted, assists: rec?.totalAssists, presented: rec?.totalStepsPresented }));
  note("public liveSession record carries no patient id", !JSON.stringify(await rd("liveSession")).includes("patient-1"));
  // 4. patient history screen reads the new record (the existing history UI)
  await ctl.eval(`location.href='${BASE}/control/patients'`); await sleep(9000);
  await ctl.shot(`${out}/shots/patients.png`);
  // 5. staff authentication and authorization still enforced
  outsider = await openIpad(C, `${BASE}/control/follow-the-footsteps`);
  await login(outsider, "outsider@example.test"); await sleep(8000);
  const denied = await outsider.eval(`({ control: !!document.querySelector('[data-testid=foot-control]'), text: document.body.innerText.slice(0, 160) })`);
  note("a signed-in non-staff account cannot reach the game Control", denied.control === false, denied.text.replace(/\s+/g, " "));
  const anon = await B.open(`${BASE}/control/follow-the-footsteps`, 1180, 820); await sleep(9000);
  note("a signed-out visitor sees the staff sign-in, not the game", await anon.eval(`!document.querySelector('[data-testid=foot-control]') && !!document.querySelector('input[type=email]')`));
  // 6. rollback path and other games
  const probe = async (path, needle, avoidTestid) => { await ctl.eval(`location.href='${BASE}${path}'`); await until(() => ctl.eval(`document.body.innerText.includes(${JSON.stringify(needle)})`), 60000, 500); await sleep(1500); return (await ctl.eval(`document.body.innerText.includes(${JSON.stringify(needle)}) && ${avoidTestid ? `!document.querySelector('[data-testid=${avoidTestid}]')` : "true"}`)); };
  note("the original game's Control is still reachable internally (rollback path), not the 3D one", await probe("/control/follow-the-footsteps-legacy", "اتبع الخطوات", "foot-control"));
  note("the original game's sensor-play route still launches", await probe("/control/follow-the-footsteps-sensor-play", "الخطو"));
  note("Mirror Quest control launches", await probe("/control/mirror-quest-3d", "المرآة"));
  note("Safe Hex Arena control launches", await probe("/control/safe-hex-arena-3d", "الأرض الآمنة"));
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
