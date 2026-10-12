// History regression for the ORIGINAL games after the patient binding moved to the staff-only liveSessionPrivate node:
// start a patient session in each original game, end it early from the Control (end-reason sheet), and confirm exactly ONE
// immutable history row for the bound patient, and that the Display-readable record never contained the patient id.
import { launch, login, note, openIpad, rd, results, selectPatient, sleep } from "../../runnerquest3d/validation/crosslib.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const [out, BASE = "http://127.0.0.1:3100"] = process.argv.slice(2);
mkdirSync(`${out}/results`, { recursive: true });
const GAMES = [
  ["follow-the-footsteps", "/control/follow-the-footsteps"],
  ["bubble-pop-wall", "/control/bubble-pop-wall"],
  ["feed-the-animals", "/control/feed-the-animals"],
  ["color-chase", "/control/color-chase"],
  ["balloon-quest", "/control/balloon-quest-legacy"],
  ["space-pilot", "/control/space-pilot-legacy"],
];
const A = await launch(`${out}/ipad`, 9731), B = await launch(`${out}/laptop`, 9732);
const display = await B.open(`${BASE}/display`, 1920, 1080);
const control = await openIpad(A, `${BASE}/control/activities`);
await login(control); await selectPatient(control);
const put = (p, v) => fetch(`http://127.0.0.1:9000/${p}.json?ns=demo-bq3-default-rtdb`, { method: "PUT", headers: { Authorization: "Bearer owner" }, body: JSON.stringify(v) });
const clickText = (re, last = false) => control.eval(`(() => { const bs = [...document.querySelectorAll('button')].filter((x) => !x.disabled && ${re}.test(x.textContent.trim())); const b = ${last ? 'bs[bs.length - 1]' : 'bs[0]'}; if (b) { b.click(); return b.textContent.trim().slice(0, 30); } return null; })()`);
const rows = async () => Object.values((await rd("sessions/patient-1")) ?? {});
for (const [gameId, route] of GAMES.filter(([g]) => !process.env.ONLY || process.env.ONLY.split(',').includes(g))) {
  await put("liveSession", null); await put("liveSessionPrivate", null); await sleep(1500);
  const before = (await rows()).length;
  await control.eval(`location.href='${route}'`); await sleep(9000);
  await control.eval(`(() => { const i = [...document.querySelectorAll('input[type=text]')].find((x) => !x.value); if (i) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i, 'ليلى'); i.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
  await sleep(600);
  if (gameId === "space-pilot") { await control.eval(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('رحلة النجوم'))?.click()`); await sleep(600); }
  let started = false;
  for (let k = 0; k < 6 && !started; k++) {
    await clickText(/ابدأ الجلسة|بدء الجلسة|ابدأ المغامرة|ابدأ|متابعة/); await sleep(2500);
    started = (await rd("liveSession"))?.gameId === gameId;
  }
  const live = await rd("liveSession");
  // walk the game's own ready/countdown screens until the live-session controls (with the end button) are showing
  const hasEnd = () => control.eval(`[...document.querySelectorAll('button')].some((b) => !b.disabled && b.textContent.trim() === 'إنهاء الجلسة')`);
  for (let k = 0; k < 12 && !(await hasEnd()); k++) { await clickText(/^(ابدأ|بدء|الطفل جاهز|جاهز|متابعة|التالي)/); await sleep(2500); }
  // the child is ready -> countdown -> a stage is playing; skip it so the session has real progress, then end early
  await display.bringToFront(); await sleep(800); await control.bringToFront(); await sleep(500);
  const readyClick = await clickText(/^الطفل جاهز/);
  if (readyClick) { await display.bringToFront(); for (let k = 0; k < 40 && (await rd("liveSession/session/gameState")) !== "PLAYING"; k++) await sleep(1000); await control.bringToFront(); await sleep(1500); } // the Display's countdown only runs while its window is in front
  if (await clickText(/^تخطي المرحلة$/)) { await sleep(900); await clickText(/^تخطي المرحلة$/, true); await sleep(3500); }
  const labels = await control.eval(`[...document.querySelectorAll('button')].map((b) => (b.disabled ? '!' : '') + b.textContent.trim().slice(0, 20)).join(' | ')`);
  const end1 = await clickText(/^إنهاء الجلسة$|^إنهاء$/); await sleep(1200);
  const pick = await clickText(/^اكتفى الطفل$/); await sleep(600);
  const confirm = await clickText(/^(إنهاء الجلسة|تأكيد|تأكيد الإنهاء|إنهاء)$/, true); await sleep(5000);
  const endState = await rd("liveSession/session/gameState");
  let after = (await rows()).length;
  for (let k = 0; k < 10 && after === before; k++) { await sleep(1500); after = (await rows()).length; }
  const mine = (await rows()).filter((r) => r.gameId === gameId);
  note(`${gameId}: ended early -> exactly one history row for the bound patient`, started && after === before + 1 && mine.length === 1 && mine[0].patientId === "patient-1" && live?.patientId === undefined,
    JSON.stringify({ started, before, after, buttons: [end1, pick, confirm], labels: labels.slice(0, 400), readyClick, endState, rowGame: mine[0]?.gameId, inRecord: live?.patientId }));
  await sleep(3000);
  note(`${gameId}: history stays single after the Display/controller settle`, (await rows()).filter((r) => r.gameId === gameId).length === 1);
}
await put("liveSession", null);
note("no console exceptions on either device", [control, display].every((t) => t.events.filter((e) => e.method === "Runtime.exceptionThrown").length === 0));
writeFileSync(`${out}/results/legacy-history.json`, JSON.stringify(results, null, 1));
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
process.exit(0);
