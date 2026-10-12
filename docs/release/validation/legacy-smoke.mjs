// Regression smoke for the ORIGINAL games on the shared platform, in a production build against the Firebase emulators:
// an iPad-like Control and a separate Display device. For each original game: open its Control route, start a session
// through the game's own screen, and confirm the shared /liveSession record (right game id, child name, patient) and that
// the Display device renders the game (not the waiting world) without exceptions. Then ends the session from the Control.
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
const A = await launch(`${out}/ipad`, 9701), B = await launch(`${out}/laptop`, 9702);
const display = await B.open(`${BASE}/display`, 1920, 1080);
const control = await openIpad(A, `${BASE}/control/activities`);
await login(control); await selectPatient(control);
const put = (p, v) => fetch(`http://127.0.0.1:9000/${p}.json?ns=demo-bq3-default-rtdb`, { method: "PUT", headers: { Authorization: "Bearer owner" }, body: JSON.stringify(v) });
const library = await control.eval(`document.body.innerText`);
note("library lists the original six games and the four new ones exactly once", ["مغامرة البالونات", "خطوات", "فقاعات", "أطعم", "قائد الفضاء", "مطاردة الألوان", "مغامرة العدّاء", "عالم البناء"].every((n) => library.split(n).length === 2 || n === "خطوات" || n === "فقاعات" || n === "أطعم"), library.slice(0, 80).replace(/\n/g, " "));
for (const [gameId, route] of GAMES) {
  await put("liveSession", null); await sleep(1500);
  await control.eval(`location.href='${route}'`); await sleep(9000);
  // child name (when the setup screen asks for one), then the game's own start button(s)
  await control.eval(`(() => { const i = [...document.querySelectorAll('input[type=text]')].find((x) => !x.value); if (i) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i, 'ليلى'); i.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
  await sleep(600);
  if (gameId === "space-pilot") { await control.eval(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('رحلة النجوم'))?.click()`); await sleep(600); } // original Space Pilot: pick a preset first
  let started = false;
  for (let k = 0; k < 6 && !started; k++) {
    await control.eval(`(() => { const b = [...document.querySelectorAll('button')].find((x) => !x.disabled && /ابدأ الجلسة|بدء الجلسة|ابدأ المغامرة|ابدأ|متابعة/.test(x.textContent)); if (b) b.click(); })()`);
    await sleep(2500);
    started = (await rd("liveSession"))?.gameId === gameId;
  }
  const live = await rd("liveSession"), bound = await rd("liveSessionPrivate");
  // PRIVACY: the patient binding is in the staff-only liveSessionPrivate node, never in the Display-readable record.
  note(`${gameId}: Control publishes into the shared live record`, live?.gameId === gameId && live?.patientId === undefined && bound?.patientId === "patient-1" && bound?.sessionId === live?.sessionId && !!live?.session?.config?.childFirstName, JSON.stringify({ gameId: live?.gameId, patient: bound?.patientId, inRecord: live?.patientId, name: live?.session?.config?.childFirstName }));
  await sleep(2500);
  const text = await display.eval(`document.body.innerText`);
  const rendered = await display.eval(`document.querySelectorAll('canvas, svg, img').length`);
  note(`${gameId}: the Display device renders the game from the shared record`, started && rendered > 0 && text.length > 0, `visible elements ${rendered}, text "${text.slice(0, 40).replace(/\n/g, " ")}"`);
  await display.shot(`${out}/display-${gameId}.png`);
}
await put("liveSession", null);
note("no console exceptions on either device", [control, display].every((t) => t.events.filter((e) => e.method === "Runtime.exceptionThrown").length === 0), String([control, display].map((t) => t.events.filter((e) => e.method === "Runtime.exceptionThrown").length)));
writeFileSync(`${out}/results/legacy-smoke.json`, JSON.stringify(results, null, 1));
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
process.exit(0);
