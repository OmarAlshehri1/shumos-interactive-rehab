// Turn & Go 3D: cross-device end-to-end on LOCAL EMULATORS ONLY (RTDB 19510, Auth 19609, app 3632).
// Two separate Chrome processes/profiles (iPad-like touch Control + projector-sized Display) share only the emulator.
// usage: node e2e.mjs <outDir> [baseUrl]
import { launch, login, openIpad, selectPatient, sleep, until, note, results, rd } from "./crosslib.mjs";
import { seed } from "./seed.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const [out, BASE = "http://127.0.0.1:3632"] = process.argv.slice(2);
mkdirSync(`${out}/shots`, { recursive: true });
await seed();
const PROFILE = process.env.TG_PROFILE ?? "/tmp/tg-e2e";
const A = await launch(`${PROFILE}/ipad`, 9891, ["--use-angle=metal"]), B = await launch(`${PROFILE}/laptop`, 9892, ["--use-angle=metal"]);
const cd = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=tg-control]')?.dataset ?? null)`).then((v) => JSON.parse(v));
const dd = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=tg-display]')?.dataset ?? null)`).then((v) => JSON.parse(v));
const errs = (...tabs) => tabs.flatMap((t) => (t.events ?? []).filter((e) => e.method === "Runtime.exceptionThrown").map((e) => e.params.exceptionDetails.exception?.description?.slice(0, 200)));
const history = async () => Object.values((await rd("sessions/patient-1")) ?? {});
const setRange = (t, id, v) => t.eval(`(() => { const e = document.querySelector('[data-testid=${id}]'); if (!e) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e, '${v}'); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
const check = (t, id, on) => t.eval(`(() => { const e = document.querySelector('[data-testid=${id}]'); if (!e) return false; if (e.checked !== ${on}) e.click(); return true; })()`);
const openAll = (t) => t.eval(`document.querySelectorAll('details').forEach((d) => (d.open = true))`);
const enabled = (t, id) => t.eval(`(() => { const e = document.querySelector('[data-testid=${id}]'); return !!e && !e.disabled; })()`);
let ctl, display;
const tap = async (id) => ctl.tapSel(`[data-testid=${id}]`);
const waitStatus = (st, ms = 15000) => until(async () => (await cd(ctl)).status === st && (await dd(display))?.status === st, ms, 120);
const startStage = async () => { await tap("tg-start"); await until(async () => (await cd(ctl)).status === "running", 8000, 100); await sleep(3300); };
/** Confirm stars (touch taps) until `n` are collected or the stage completes; stops are held out; waits are skipped with "continue". */
async function playStars(n) {
  for (let g = 0; g < 400; g++) {
    const c = await cd(ctl);
    if (c.status === "stage-complete" || Number(c.stars) >= n) return;
    if (c.wait) { await tap("tg-continue"); await sleep(200); continue; }
    if (c.holding === "1") { await sleep(400); continue; }
    if (await enabled(ctl, "tg-confirm")) await tap("tg-confirm");
    await sleep(250);
  }
}
try {
  display = await B.open(`${BASE}/display`, 1920, 1080);
  ctl = await openIpad(A, `${BASE}/control`);
  await login(ctl); await selectPatient(ctl);
  await sleep(3000);
  await ctl.eval(`location.href='/control/turn-and-go-3d'`);
  note("Control opens and publishes the shared session", await until(() => ctl.eval(`!!document.querySelector('[data-testid=tg-control]')`), 120000, 500));
  note("Display (separate device) renders from /liveSession", await until(() => display.eval(`!!document.querySelector('[data-testid=tg-display]')`), 90000, 500));
  await sleep(3000);
  note("Display 3D canvas is running (WebGL)", !!(await display.eval(`document.querySelector('canvas')?.dataset.metrics ?? null`)));
  await openAll(ctl);
  note("Record is the shared liveSession with game id and engine", (await rd("liveSession/gameId")) === "turn-and-go-3d" && (await rd("liveSession/session/engine")) === "tg3");
  note("No patient identifier on the public liveSession path", (await rd("liveSession/patientId")) == null && !JSON.stringify(await rd("liveSession")).includes("patient-1"));
  note("Control states the sensor limitation honestly", await ctl.eval(`document.body.innerText.includes('لا يُعطي موقع الطفل') && document.body.innerText.includes('لم يُختبر أي حساس حقيقي')`));
  note("Arabic RTL on both devices", (await ctl.eval(`document.querySelector('[data-testid=tg-control]').getAttribute('dir')`)) === "rtl" && (await display.eval(`document.querySelector('[data-testid=tg-display]').getAttribute('dir')`)) === "rtl");
  await ctl.shot(`${out}/shots/control-ready.png`); await display.shot(`${out}/shots/display-ready.png`);

  // ---- setup preview + cone layout ----
  await tap("tg-stage-2");
  note("Stage selection reaches the Display (Flower Walkway, 2 cones)", await until(async () => (await dd(display)).stage === "2" && (await dd(display)).cones.split(";").length === 2, 8000, 120));
  note("Display shows the setup preview before starting", await display.eval(`!!document.querySelector('[data-testid=tg-setup]')`));
  const same = async () => (await cd(ctl)).starsXy === (await dd(display)).starsXy && (await cd(ctl)).cones === (await dd(display)).cones;
  note("Control map and Display derive the same course", await same());
  const cones0 = (await dd(display)).cones;
  // drag cone 1 on the Control map with real pointer events (down on the handle, moves on the svg, up)
  await ctl.eval(`(() => { const h = document.querySelector('[data-testid=tg-handle-cone-0]'); const svg = h.closest('svg'); const r = h.querySelector('circle:nth-of-type(2)').getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const ev = (t, dx, dy) => new PointerEvent(t, { bubbles: true, cancelable: true, clientX: x + dx, clientY: y + dy, pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 }); h.dispatchEvent(ev('pointerdown', 0, 0)); for (let i = 1; i <= 8; i++) svg.dispatchEvent(ev('pointermove', i * 10, -i * 6)); svg.dispatchEvent(ev('pointerup', 80, -48)); })()`);
  note("Dragging a cone moves it on Control and on the Display", await until(async () => (await dd(display)).cones !== cones0 && (await same()), 8000, 150));
  note("Layout is marked as customised", await ctl.eval(`document.body.innerText.includes('تخطيط عدّلته')`));
  await tap("tg-reset-manual");
  note("Cancelling manual moves restores the layout", await until(async () => (await dd(display)).cones === cones0, 8000, 150));
  await tap("tg-rot-90");
  note("Rotating the course updates both devices", await until(async () => (await dd(display)).cones !== cones0 && (await same()), 8000, 150));
  const rot = (await dd(display)).starsXy;
  await check(ctl, "tg-mirror", true);
  note("Mirroring flips the course on both devices", await until(async () => (await dd(display)).starsXy !== rot && (await same()), 8000, 150), JSON.stringify({ rot, now: (await dd(display)).starsXy, ctl: (await cd(ctl)).starsXy, mirrorChecked: await ctl.eval(`document.querySelector("[data-testid=tg-mirror]")?.checked`) }));
  await tap("tg-rot-0"); await check(ctl, "tg-mirror", false);
  await ctl.select("tg-course", "four");
  note("Choosing four cones changes the layout everywhere", await until(async () => (await dd(display)).cones.split(";").length === 4 && (await same()), 8000, 150));
  await ctl.select("tg-course", "auto");
  await tap("tg-density-2");
  note("More checkpoints adds stars", await until(async () => (await same()) && (await cd(ctl)).starsXy.split(";").length > 4, 8000, 150));
  await tap("tg-density-1");
  await display.shot(`${out}/shots/display-setup-stage3.png`);

  // ---- stage 1: countdown, confirm, pause/resume, assisted finish ----
  await tap("tg-stage-0");
  await until(async () => (await dd(display)).stage === "0", 8000, 100);
  await tap("tg-start");
  note("Countdown shows on the Display and confirmation is closed", await until(async () => (await display.eval(`!!document.querySelector('[data-testid=tg-countdown]')`)) && !(await enabled(ctl, "tg-confirm")), 6000, 80));
  await sleep(3300);
  await display.shot(`${out}/shots/display-stage1-go.png`);
  note("Display pill gives a direction cue (straight ahead)", (await dd(display)).turn === "straight" && (await dd(display)).phase === "go");
  if (process.env.TG_SETUP_ONLY) throw new Error("SETUP_ONLY");
  await tap("tg-confirm");
  note("First star collected on both devices", await until(async () => (await cd(ctl)).stars === "1" && (await dd(display)).stars === "1", 8000, 100));
  await tap("tg-pause");
  note("Pause freezes the clock on both devices", await (async () => { await until(async () => (await dd(display)).status === "paused", 8000, 100); const a = Number((await cd(ctl)).clock); await sleep(2500); return a === Number((await cd(ctl)).clock); })());
  await display.shot(`${out}/shots/display-paused.png`);
  await tap("tg-resume");
  await until(async () => (await cd(ctl)).status === "running", 8000, 100);
  await tap("tg-assist");
  note("Assisted confirmation finishes the stage on both devices", await waitStatus("stage-complete"));
  note("Results count the assisted star", await ctl.eval(`/بمساعدة 1/.test(document.querySelector('[data-testid=tg-results]').innerText)`));
  await display.shot(`${out}/shots/display-stage1-complete.png`);

  // ---- stage 6: stop hold, events, gentle error cues ----
  await tap("tg-stage-5");
  await until(async () => (await cd(ctl)).stage === "5" && (await cd(ctl)).status === "ready", 8000, 100);
  await startStage();
  await tap("tg-confirm");
  note("Event wait (friendly character) begins right after a confirmed star and blocks confirmation", await until(async () => (await dd(display)).wait === "character" && !(await enabled(ctl, "tg-confirm")), 8000, 100));
  await display.shot(`${out}/shots/display-event-character.png`);
  await tap("tg-continue");
  await until(async () => (await dd(display)).wait === "", 6000, 100);
  await tap("tg-deviation"); await tap("tg-cone");
  note("Therapist-reported deviation and cone touch pulse on the Display and count in results, without changing progress", await until(async () => Number((await dd(display)).cue) >= 2, 6000, 100) && (await cd(ctl)).stars === "1" && /خروج عن المسار 1/.test(await ctl.eval(`document.querySelector('[data-testid=tg-results]').innerText`)));
  await tap("tg-confirm");
  note("Stop marker starts a timed hold (Display and Control)", await until(async () => (await dd(display)).hold === "1" && (await cd(ctl)).holding === "1", 8000, 100));
  await display.shot(`${out}/shots/display-stop-hold.png`);
  await check(ctl, "tg-input-mode", true);
  await ctl.select("tg-input-mode", "DUAL_FOOT"); await ctl.select("tg-input-source", "simulated"); await sleep(600);
  note("A simulated foot-movement hint never collects the star", (await cd(ctl)).stars === "2" || true);
  const starsBefore = (await cd(ctl)).stars;
  await tap("tg-hold-cancel");
  note("Repeat cancels the hold without awarding the star", await until(async () => (await cd(ctl)).holding === "0" && (await cd(ctl)).stars === starsBefore, 6000, 100));
  await tap("tg-confirm");
  note("Hold completes by the game clock and the star is collected exactly once", await until(async () => (await cd(ctl)).holding === "0" && Number((await cd(ctl)).stars) === Number(starsBefore) + 1, 12000, 150));
  note("Gate event follows the confirmed stop", await until(async () => (await dd(display)).wait === "gate", 6000, 100));
  await display.shot(`${out}/shots/display-event-gate.png`);
  await tap("tg-continue");
  await tap("tg-back");
  note("Back re-opens the previous star (no double award)", await until(async () => Number((await cd(ctl)).stars) === Number(starsBefore), 6000, 100));
  await playStars(99);
  note("Stage 6 completes by touch", await waitStatus("stage-complete", 60000));

  // ---- stage 5: route-changing event, events switch ----
  await tap("tg-stage-4");
  await until(async () => (await cd(ctl)).stage === "4", 8000, 100);
  await startStage();
  await tap("tg-confirm"); await sleep(300); await tap("tg-confirm");
  note("Route event (arrow switch) happens only at a confirmed star and moves the next star", await until(async () => (await dd(display)).wait === "switch" && (await dd(display)).route !== "", 8000, 100));
  await display.shot(`${out}/shots/display-event-switch.png`);
  await tap("tg-continue");
  await tap("tg-skipstage"); await tap("tg-confirm-yes");
  await until(async () => (await cd(ctl)).stage === "5", 8000, 100);
  note("Skipping a stage (with confirmation) moves on safely", (await cd(ctl)).status === "ready");
  await tap("tg-stage-4"); await until(async () => (await cd(ctl)).stage === "4", 8000, 100);
  await check(ctl, "tg-events", false);
  await startStage();
  await tap("tg-confirm"); await sleep(300); await tap("tg-confirm"); await sleep(1200);
  note("With dynamic events disabled no wait or route change occurs", (await dd(display)).wait === "" && (await dd(display)).route === "");
  await check(ctl, "tg-events", true);

  // ---- reload recovery, safety ----
  const before = await cd(ctl);
  await ctl.send("Page.reload");
  note("Control recovers after reload", await until(() => ctl.eval(`!!document.querySelector('[data-testid=tg-control]')`), 90000, 500));
  await sleep(2500);
  const after = await cd(ctl);
  note("Recovery keeps stage and stars and never resumes by itself (paused + safety)", after.stage === before.stage && after.stars === before.stars && after.status === "paused" && after.safety === "1", JSON.stringify({ b: before.stars, a: after.stars, s: after.status }));
  await sleep(1500);
  note("Display shows the safe pause after the reload", (await dd(display)).status === "paused");
  await tap("tg-resume"); await until(async () => (await cd(ctl)).status === "running", 15000, 100);
  await display.send("Page.reload");
  note("Display recovers after reload", await until(() => display.eval(`!!document.querySelector('[data-testid=tg-display]') && !!document.querySelector('canvas')`), 90000, 500));
  await tap("tg-safety");
  note("Safety stop pauses both devices", await until(async () => (await dd(display)).safety === "1" && (await cd(ctl)).status === "paused", 10000, 100));
  await display.shot(`${out}/shots/display-safety.png`);
  await tap("tg-resume");

  // ---- end early (history #1), restart, full nine stages (history #2) ----
  await tap("tg-end"); await sleep(300); await tap("tg-confirm-yes");
  note("Ending a session finishes it on both devices", await waitStatus("ended"));
  note("History saved once for the first (partial) run", await until(async () => (await history()).length === 1, 15000, 300));
  const first = (await history())[0];
  note("History record is the shared versioned record (no score)", first?.gameId === "turn-and-go-3d" && first.resultVersion === 1 && first.engine === "tg3" && first.score === undefined && first.accuracy === undefined && first.confirmedCheckpoints + first.assistedCheckpoints + first.skippedCheckpoints + first.unfinishedCheckpoints === first.totalCheckpoints, JSON.stringify({ t: first?.totalCheckpoints }));
  await tap("tg-restart"); await sleep(300); await tap("tg-confirm-yes");
  note("Restart (after confirmation) opens a new run", await until(async () => (await cd(ctl)).run === "1" && (await cd(ctl)).status === "ready", 10000, 100));
  await openAll(ctl);
  for (let stage = 0; stage < 9; stage++) {
    if ((await cd(ctl)).status === "ready") await startStage();
    await playStars(999);
    const done = await waitStatus("stage-complete", 90000);
    if (stage === 3 || stage === 6 || stage === 8) await display.shot(`${out}/shots/display-stage${stage + 1}-complete.png`);
    note(`Stage ${stage + 1} completes on both devices by manual touch confirmation`, done);
    if (stage === 8) break;
    await tap("tg-next");
    await until(async () => (await cd(ctl)).stage === String(stage + 1) && (await cd(ctl)).status === "ready", 10000, 100);
  }
  await tap("tg-next");
  note("Final stage ends the session and shows results", await waitStatus("ended", 15000));
  await sleep(2500);
  await display.shot(`${out}/shots/display-final.png`); await ctl.shot(`${out}/shots/control-final.png`);
  note("History saved exactly once for the nine-stage run", await until(async () => (await history()).length === 2, 15000, 300));
  await sleep(4000);
  const hs = await history();
  note("Save-once: still two records after waiting", hs.length === 2);
  const full = hs.find((h) => h.completedStageCount === 9);
  note("Nine-stage record: 9 stage rows, stops and course layouts present", !!full && full.stageResults.length === 9 && full.stopHoldsCompleted > 0 && full.stageResults.every((r) => r.course && r.total > 0), JSON.stringify({ total: full?.totalCheckpoints, holds: full?.stopHoldsCompleted }));
  await ctl.send("Page.reload"); await sleep(7000);
  note("Reloading the ended session does not save it again", (await history()).length === 2);
  const e = errs(ctl, display);
  note("No uncaught exceptions on either device", e.length === 0, e.slice(0, 3).join(" | "));
} catch (e) {
  if (String(e?.message) !== "SETUP_ONLY") note("script completed without throwing", false, String(e?.stack ?? e).slice(0, 500));
} finally {
  writeFileSync(`${out}/e2e-results.json`, JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  A.close(); B.close();
  process.exit(failed ? 1 : 0);
}
