// Body Sequence 3D: cross-device end-to-end on LOCAL EMULATORS ONLY (RTDB 19610, Auth 19709, app 3732).
// Two separate Chrome processes/profiles (iPad-like touch Control + projector-sized Display) share only the emulator.
// usage: node e2e.mjs <outDir> [baseUrl]
import { launch, login, openIpad, selectPatient, sleep, until, note, results, rd } from "./crosslib.mjs";
import { seed } from "./seed.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const [out, BASE = "http://127.0.0.1:3732"] = process.argv.slice(2);
mkdirSync(`${out}/shots`, { recursive: true });
await seed();
const PROFILE = process.env.BS_PROFILE ?? "/tmp/bs-e2e";
const A = await launch(`${PROFILE}/ipad`, 9891, ["--use-angle=metal"]), B = await launch(`${PROFILE}/laptop`, 9892, ["--use-angle=metal"]);
const cd = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=bs-control]')?.dataset ?? null)`).then((v) => JSON.parse(v));
const cur = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=bs-current]')?.dataset ?? null)`).then((v) => JSON.parse(v));
const dd = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=bs-display]')?.dataset ?? null)`).then((v) => JSON.parse(v));
const errs = (...tabs) => tabs.flatMap((t) => (t.events ?? []).filter((e) => e.method === "Runtime.exceptionThrown").map((e) => e.params.exceptionDetails.exception?.description?.slice(0, 200)));
const history = async () => Object.values((await rd("sessions/patient-1")) ?? {});
const check = (t, id, on) => t.eval(`(() => { const e = document.querySelector('[data-testid=${id}]'); if (!e) return false; if (e.checked !== ${on}) e.click(); return true; })()`);
const setRange = (t, id, v) => t.eval(`(() => { const e = document.querySelector('[data-testid=${id}]'); if (!e) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e, '${v}'); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
const openAll = (t) => t.eval(`document.querySelectorAll('details').forEach((d) => (d.open = true))`);
const enabled = (t, id) => t.eval(`(() => { const e = document.querySelector('[data-testid=${id}]'); return !!e && !e.disabled; })()`);
const exists = (t, id) => t.eval(`!!document.querySelector('[data-testid=${id}]')`);
let ctl, display;
const tap = async (id) => ctl.tapSel(`[data-testid=${id}]`);
const waitStatus = (st, ms = 15000) => until(async () => (await cd(ctl)).status === st && (await dd(display))?.status === st, ms, 120);
const startStage = async () => { await tap("bs-start"); await until(async () => (await cd(ctl)).status === "running", 8000, 100); await sleep(3300); };
const goStage = async (i) => { await tap(`bs-stage-${i}`); await until(async () => (await cd(ctl)).stage === String(i) && (await dd(display)).stage === String(i), 8000, 100); };
/** Touch-confirms movements until the stage completes: previews end early, holds run out, pauses between sequences are waited. */
async function playStage({ endPreview = true } = {}) {
  for (let g = 0; g < 900; g++) {
    const c = await cd(ctl);
    if (c.status === "stage-complete" || c.status === "ended") return;
    if (c.holding === "1") { await sleep(350); continue; }
    if (await exists(ctl, "bs-between")) { await sleep(400); continue; }
    if (await exists(ctl, "bs-previewing")) { if (endPreview) await tap("bs-endpreview"); else await sleep(400); await sleep(200); continue; }
    if (await enabled(ctl, "bs-confirm")) await tap("bs-confirm");
    await sleep(220);
  }
}
try {
  display = await B.open(`${BASE}/display`, 1920, 1080);
  ctl = await openIpad(A, `${BASE}/control`);
  await login(ctl); await selectPatient(ctl);
  await sleep(3000);
  await ctl.eval(`location.href='/control/body-sequence-3d'`);
  note("Control opens and publishes the shared session", await until(() => ctl.eval(`!!document.querySelector('[data-testid=bs-control]')`), 150000, 500));
  note("Display (separate device) renders from /liveSession", await until(() => display.eval(`!!document.querySelector('[data-testid=bs-display]')`), 120000, 500));
  await sleep(3000);
  note("Display 3D canvas is running (WebGL)", !!(await display.eval(`document.querySelector('canvas')?.dataset.metrics ?? null`)));
  await openAll(ctl);
  note("Record is the shared liveSession with game id and engine", (await rd("liveSession/gameId")) === "body-sequence-3d" && (await rd("liveSession/session/engine")) === "bs3");
  note("No patient identifier on the public liveSession path", (await rd("liveSession/patientId")) == null && !JSON.stringify(await rd("liveSession")).includes("patient-1"));
  note("Control states the sensor limitation honestly", await ctl.eval(`document.body.innerText.includes('لا يُعطي موقع القدم') && document.body.innerText.includes('لم يُختبر أي حساس حقيقي')`));
  note("Arabic RTL on both devices", (await ctl.eval(`document.querySelector('[data-testid=bs-control]').getAttribute('dir')`)) === "rtl" && (await display.eval(`document.querySelector('[data-testid=bs-display]').getAttribute('dir')`)) === "rtl");
  await ctl.shot(`${out}/shots/control-ready.png`); await display.shot(`${out}/shots/display-ready.png`);

  // ---- lane limits ----
  note("Level 1 shows exactly two lanes on Control map and Display", (await dd(display)).lanes === "2" && (await ctl.eval(`document.querySelector('[data-testid=bs-lanemap]').dataset.lanes`)) === "2" && (await ctl.eval(`document.querySelectorAll('[data-testid=bs-lanemap] g[data-lane]').length`)) === 3);
  note("Display setup card is shown before starting", await exists(display, "bs-setup"));

  // ---- stage 1: single-foot instructions, order, pause, incorrect, replay, repeat ----
  await tap("bs-feet-R");
  note("Allowed-feet setting (right only) reaches Control state", await until(async () => (await ctl.eval(`document.querySelector('[data-testid=bs-feet-R]').getAttribute('aria-pressed')`)) === "true", 6000, 100));
  await startStage();
  note("Countdown has ended and the first movement is shown on both devices with the same foot and lane", await until(async () => { const a = await cur(ctl), b = await dd(display); return a?.foot && a.foot === b.stepFoot && a.lane === b.stepLane && b.phase === "go"; }, 8000, 100));
  note("Right-foot-only setting: every movement of the sequence is the right foot", await ctl.eval(`[...document.querySelectorAll('[data-testid^=bs-seqstep-]')].every((e) => e.dataset.foot === 'R')`));
  await display.shot(`${out}/shots/display-stage1-go.png`);
  await ctl.shot(`${out}/shots/control-stage1-go.png`);
  const lab = await display.eval(`document.querySelector('[data-testid=bs-label]').textContent`);
  note("Display instruction names the right foot in Arabic", /اليمنى/.test(lab), lab);
  await tap("bs-incorrect");
  note("Incorrect attempt pulses gently on the Display and changes no progress", await until(async () => Number((await dd(display)).cue) >= 1 && (await dd(display)).cueKind === "incorrect" && (await cd(ctl)).moves === "0", 6000, 100));
  await tap("bs-replay"); await tap("bs-repeat");
  note("Replay and repeat are recorded without moving progress", await until(async () => /إعادة العرض 1/.test(await ctl.eval(`document.querySelector('[data-testid=bs-results]').innerText`)) && /إعادة الحركة 1/.test(await ctl.eval(`document.querySelector('[data-testid=bs-results]').innerText`)) && (await cd(ctl)).moves === "0", 6000, 100));
  await tap("bs-confirm");
  note("First movement confirmed on both devices", await until(async () => (await cd(ctl)).moves === "1" && (await dd(display)).moves === "1", 8000, 100));
  await tap("bs-pause");
  note("Pause freezes the clock on both devices", await (async () => { await until(async () => (await dd(display)).status === "paused", 8000, 100); const a = Number((await cd(ctl)).clock); await sleep(2500); return a === Number((await cd(ctl)).clock); })());
  await display.shot(`${out}/shots/display-paused.png`);
  await tap("bs-resume");
  await until(async () => (await cd(ctl)).status === "running", 8000, 100);
  await tap("bs-assist");
  note("Finishing a sequence celebrates and moves to the next one on both devices", await until(async () => (await cd(ctl)).seq === "1" && (await dd(display)).seq === "1", 8000, 100));
  await sleep(300);
  await display.shot(`${out}/shots/display-sequence-complete.png`);
  note("Confirmation is closed during the celebration pause", !(await enabled(ctl, "bs-confirm")) && (await exists(ctl, "bs-between")));
  note("The next sequence starts by itself", await until(async () => (await cd(ctl)).round === "1" && (await enabled(ctl, "bs-confirm")), 9000, 150));
  await tap("bs-skip");
  note("Skipping a movement resolves it without awarding it", await until(async () => /متخطاة 1/.test(await ctl.eval(`document.querySelector('[data-testid=bs-results]').innerText`)), 6000, 100));
  await playStage();
  note("Stage 1 completes by touch on both devices", await waitStatus("stage-complete", 60000));
  note("Results count the assisted movement", await ctl.eval(`/بمساعدة 1/.test(document.querySelector('[data-testid=bs-results]').innerText)`));
  await sleep(2200);
  await display.shot(`${out}/shots/display-stage1-complete.png`);
  await tap("bs-feet-both");

  // ---- stage 3: memory ----
  await tap("bs-next");
  await until(async () => (await cd(ctl)).stage === "1", 8000, 100);
  await goStage(2);
  await startStage();
  note("Memory: the Display previews the sequence and confirmation is closed", await until(async () => (await dd(display)).phase === "preview" && !(await enabled(ctl, "bs-confirm")) && (await exists(ctl, "bs-previewing")), 8000, 100));
  await sleep(1800);
  await display.shot(`${out}/shots/display-memory-preview.png`);
  note("Memory: preview lights movements one by one", Number((await dd(display)).preview) >= 0);
  await until(async () => (await dd(display)).phase === "go", 15000, 150);
  note("Memory: recall hides the movement on the Display while Control still shows the order", (await dd(display)).revealed === "0" && (await ctl.eval(`document.querySelectorAll('[data-testid^=bs-seqstep-]').length`)) === 2);
  await display.shot(`${out}/shots/display-memory-recall.png`);
  await tap("bs-replay");
  note("Replay returns to the preview without penalty", await until(async () => (await dd(display)).phase === "preview", 6000, 100) && /إعادة العرض [2-9]/.test(await ctl.eval(`document.querySelector('[data-testid=bs-results]').innerText`)));
  await tap("bs-endpreview");
  await until(async () => (await dd(display)).phase === "go", 8000, 100);
  await check(ctl, "bs-hints", true);
  note("Hints reveal the movement during recall", await until(async () => (await dd(display)).revealed === "1", 6000, 100));
  await check(ctl, "bs-hints", false);
  await playStage();
  note("Stage 3 completes (memory)", await waitStatus("stage-complete", 90000));
  await tap("bs-next");

  // ---- stage 4: three lanes ----
  await until(async () => (await cd(ctl)).stage === "3" && (await cd(ctl)).status === "ready" && (await dd(display)).stage === "3", 8000, 100);
  note("Level 2 shows three lanes on Control map and Display", (await dd(display)).lanes === "3" && (await ctl.eval(`document.querySelectorAll('[data-testid=bs-lanemap] g[data-lane]').length`)) === 4);
  await display.shot(`${out}/shots/display-setup-stage4.png`);
  await startStage();
  await display.shot(`${out}/shots/display-stage4-go.png`);
  await playStage();
  note("Stage 4 completes", await waitStatus("stage-complete", 60000));
  await tap("bs-next");

  // ---- stage 5: hold and move ----
  await until(async () => (await cd(ctl)).stage === "4" && (await cd(ctl)).status === "ready", 8000, 100);
  await startStage();
  await tap("bs-confirm");
  note("Hold-and-move: confirming starts a timed hold on both devices", await until(async () => (await dd(display)).hold === "1" && (await cd(ctl)).holding === "1", 8000, 100));
  await display.shot(`${out}/shots/display-hold.png`);
  await check(ctl, "bs-input-mode", true);
  await ctl.select("bs-input-mode", "DUAL_FOOT"); await ctl.select("bs-input-source", "simulated"); await sleep(600);
  const before5 = (await cd(ctl)).moves;
  await tap("bs-incorrect");
  note("Incorrect during a hold stops it without progress", await until(async () => (await cd(ctl)).holding === "0" && (await cd(ctl)).moves === before5, 6000, 100));
  await tap("bs-confirm");
  note("Hold completes by the game clock and the movement is counted exactly once", await until(async () => (await cd(ctl)).holding === "0" && Number((await cd(ctl)).moves) === Number(before5) + 1, 12000, 150));
  await ctl.select("bs-input-source", "manual"); await ctl.select("bs-input-mode", "MANUAL");
  await tap("bs-skipstage"); await tap("bs-confirm-yes");
  await until(async () => (await cd(ctl)).stage === "5", 8000, 100);
  note("Skipping a stage (with confirmation) moves on safely", (await cd(ctl)).status === "ready");

  // ---- stage 7: stop and continue ----
  await goStage(6);
  await startStage();
  await tap("bs-confirm");
  note("Stop signal appears on the Display after the first movement", await until(async () => (await dd(display)).stepMove === "stop", 8000, 100));
  await display.shot(`${out}/shots/display-stop.png`);
  await tap("bs-confirm");
  note("Standing still starts the timed pose", await until(async () => (await dd(display)).hold === "1", 6000, 100));
  await playStage();
  note("Stage 7 completes", await waitStatus("stage-complete", 90000));

  // ---- settings: rotation / orientation ----
  await tap("bs-next");
  await until(async () => (await cd(ctl)).stage === "7" && (await cd(ctl)).status === "ready", 8000, 100);
  await tap("bs-rot-180"); await check(ctl, "bs-mirror", true);
  note("Orientation settings reach the Display", await until(async () => (await dd(display)).rot === "180" && (await dd(display)).mirror === "1", 8000, 100));
  await display.shot(`${out}/shots/display-rot180-mirror.png`);
  await tap("bs-rot-90");
  await until(async () => (await dd(display)).rot === "90", 8000, 100);
  await display.shot(`${out}/shots/display-rot90.png`);
  await tap("bs-rot-0"); await check(ctl, "bs-mirror", false);
  await setRange(ctl, "bs-spacing", "1.3");
  await sleep(600);
  await display.shot(`${out}/shots/display-spacing-1.3.png`);
  await setRange(ctl, "bs-spacing", "1");
  await startStage();
  note("Settings are locked once a stage runs (spacing change is ignored)", await (async () => { await setRange(ctl, "bs-spacing", "0.7"); await sleep(600); return Number(await ctl.eval(`document.querySelector('[data-testid=bs-spacing]').value`)) !== 0.7 || (await ctl.eval(`document.querySelector('[data-testid=bs-spacing]').disabled`)); })());

  // ---- reload recovery, safety ----
  await tap("bs-confirm");
  const before = await cd(ctl);
  await ctl.send("Page.reload");
  note("Control recovers after reload", await until(() => ctl.eval(`!!document.querySelector('[data-testid=bs-control]')`), 90000, 500));
  await sleep(2500);
  const after = await cd(ctl);
  note("Recovery keeps stage and progress and never resumes by itself (paused + safety)", after.stage === before.stage && after.moves === before.moves && after.status === "paused" && after.safety === "1", JSON.stringify({ b: before.moves, a: after.moves, s: after.status }));
  await sleep(1500);
  note("Display shows the safe pause after the reload", (await dd(display)).status === "paused");
  await tap("bs-resume"); await until(async () => (await cd(ctl)).status === "running", 15000, 100);
  await display.send("Page.reload");
  note("Display recovers after reload", await until(() => display.eval(`!!document.querySelector('[data-testid=bs-display]') && !!document.querySelector('canvas')`), 90000, 500));
  await tap("bs-safety");
  note("Safety stop pauses both devices", await until(async () => (await dd(display)).safety === "1" && (await cd(ctl)).status === "paused", 10000, 100));
  await display.shot(`${out}/shots/display-safety.png`);
  await tap("bs-resume");

  // ---- end early (history #1), restart, full nine stages (history #2) ----
  await tap("bs-end"); await sleep(300); await tap("bs-confirm-yes");
  note("Ending a session finishes it on both devices", await waitStatus("ended"));
  note("History saved once for the first (partial) run", await until(async () => (await history()).length === 1, 15000, 300));
  const first = (await history())[0];
  note("History record is the shared versioned record (no score)", first?.gameId === "body-sequence-3d" && first.resultVersion === 1 && first.engine === "bs3" && first.score === undefined && first.accuracy === undefined && first.confirmedMovements + first.assistedMovements + first.skippedMovements + first.unfinishedMovements === first.totalMovements && first.movementAttempts === first.confirmedMovements + first.assistedMovements + first.incorrectAttempts, JSON.stringify({ t: first?.totalMovements, a: first?.movementAttempts }));
  note("Partial record carries the therapist-recorded counts", first.incorrectAttempts >= 1 && first.replays >= 1 && first.repeats >= 1 && first.skippedMovements >= 1, JSON.stringify({ i: first?.incorrectAttempts, rp: first?.replays, r: first?.repeats, s: first?.skippedMovements }));
  await tap("bs-restart"); await sleep(300); await tap("bs-confirm-yes");
  note("Restart (after confirmation) opens a new run", await until(async () => (await cd(ctl)).run === "1" && (await cd(ctl)).status === "ready", 10000, 100));
  await openAll(ctl);
  for (let stage = 0; stage < 9; stage++) {
    if ((await cd(ctl)).status === "ready") await startStage();
    await playStage();
    const done = await waitStatus("stage-complete", 90000);
    if (stage === 1 || stage === 5 || stage === 7 || stage === 8) { await sleep(2200); await display.shot(`${out}/shots/display-stage${stage + 1}-complete.png`); }
    note(`Stage ${stage + 1} completes on both devices by manual touch confirmation`, done);
    if (stage === 8) break;
    await tap("bs-next");
    await until(async () => (await cd(ctl)).stage === String(stage + 1) && (await cd(ctl)).status === "ready" && (await dd(display)).stage === String(stage + 1), 10000, 100);
    const lanes = (await dd(display)).lanes;
    if (lanes !== (stage + 1 < 3 ? "2" : "3")) note(`Stage ${stage + 2} lane count matches the curriculum`, false, lanes);
  }
  await tap("bs-next");
  note("Final stage ends the session and shows results", await waitStatus("ended", 15000));
  await sleep(2500);
  await display.shot(`${out}/shots/display-final.png`); await ctl.shot(`${out}/shots/control-final.png`);
  note("History saved exactly once for the nine-stage run", await until(async () => (await history()).length === 2, 15000, 300));
  await sleep(4000);
  const hs = await history();
  note("Save-once: still two records after waiting", hs.length === 2);
  const full = hs.find((h) => h.completedStageCount === 9);
  note("Nine-stage record: 9 stage rows, lanes 2 then 3, every sequence completed", !!full && full.stageResults.length === 9 && full.stageResults.every((r, i) => r.lanes === (i < 3 ? 2 : 3) && r.sequencesCompleted === r.sequences) && full.settings.maxLanes === 3, JSON.stringify({ total: full?.totalMovements, seq: full?.sequencesCompleted }));
  await ctl.send("Page.reload"); await sleep(7000);
  note("Reloading the ended session does not save it again", (await history()).length === 2);
  const e = errs(ctl, display);
  note("No uncaught exceptions on either device", e.length === 0, e.slice(0, 3).join(" | "));
} catch (e) {
  note("script completed without throwing", false, String(e?.stack ?? e).slice(0, 600));
} finally {
  writeFileSync(`${out}/e2e-results.json`, JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  A.close(); B.close();
  process.exit(failed ? 1 : 0);
}
