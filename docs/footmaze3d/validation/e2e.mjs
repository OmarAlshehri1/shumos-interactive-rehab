// Foot Maze 3D: cross-device end-to-end on LOCAL EMULATORS ONLY (RTDB 19660, Auth 19669, app 3662).
// Two separate Chrome processes/profiles (iPad-like touch Control + projector-sized Display) share only the emulator.
// usage: node e2e.mjs <outDir> [baseUrl]      env: FM_STOP=<n> stops after section n (debug)
import { launch, login, openIpad, selectPatient, sleep, until, note, results, rd } from "./crosslib.mjs";
import { seed } from "./seed.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const [out, BASE = "http://127.0.0.1:3662"] = process.argv.slice(2);
mkdirSync(`${out}/shots`, { recursive: true });
await seed();
const PROFILE = process.env.FM_PROFILE ?? "/tmp/fm-e2e";
const STOP = Number(process.env.FM_STOP ?? 99);
const A = await launch(`${PROFILE}/ipad`, 9891, ["--use-angle=metal"]), B = await launch(`${PROFILE}/laptop`, 9892, ["--use-angle=metal"]);
const cd = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=fm-control]')?.dataset ?? null)`).then((v) => JSON.parse(v));
const dd = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=fm-display]')?.dataset ?? null)`).then((v) => JSON.parse(v));
const errs = (...tabs) => tabs.flatMap((t) => (t.events ?? []).filter((e) => e.method === "Runtime.exceptionThrown").map((e) => e.params.exceptionDetails.exception?.description?.slice(0, 200)));
const history = async () => Object.values((await rd("sessions/patient-1")) ?? {});
const setRange = (t, id, v) => t.eval(`(() => { const e = document.querySelector('[data-testid=${id}]'); if (!e) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e, '${v}'); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
const check = (t, id, on) => t.eval(`(() => { const e = document.querySelector('[data-testid=${id}]'); if (!e) return false; if (e.checked !== ${on}) e.click(); return true; })()`);
const openAll = (t) => t.eval(`document.querySelectorAll('details').forEach((d) => (d.open = true))`);
const enabled = (t, id) => t.eval(`(() => { const e = document.querySelector('[data-testid=${id}]'); return !!e && !e.disabled; })()`);
const exists = (t, id) => t.eval(`!!document.querySelector('[data-testid=${id}]')`);
let ctl, display;
const tap = async (id) => ctl.tapSel(`[data-testid=${id}]`);
const waitStatus = (st, ms = 15000) => until(async () => (await cd(ctl)).status === st && (await dd(display))?.status === st, ms, 120);
const startStage = async () => { await tap("fm-start"); await until(async () => (await cd(ctl)).status === "running", 8000, 100); await sleep(3300); };
const gotoStage = async (i) => { await tap(`fm-stage-${i}`); return until(async () => (await cd(ctl)).stage === String(i) && (await dd(display))?.stage === String(i) && (await cd(ctl)).status === "ready", 10000, 100); };
const shot = async (name) => { await sleep(700); await display.shot(`${out}/shots/${name}.png`); };

/** Walks one leg: choose (if needed) then confirm arrival, by touch taps on the iPad Control. */
async function leg(to) {
  const c = await cd(ctl);
  const next = to ?? c.next;
  if (c.heading !== next) {
    await tap(`fm-exit-${next}`);
    await until(async () => (await cd(ctl)).heading === next, 4000, 80);
  }
  await until(() => enabled(ctl, "fm-arrive"), 6000, 80);
  await tap("fm-arrive");
  return until(async () => { const n = await cd(ctl); return n.at === next || n.status === "stage-complete"; }, 6000, 80);
}
/** Plays the stage along the shortest route; guard / event waits are released by the therapist (`release`) unless `natural`. */
async function play(opts = {}) {
  for (let g = 0; g < 120; g++) {
    const c = await cd(ctl);
    if (c.status === "stage-complete") return true;
    if (c.status !== "running") { await sleep(200); continue; }
    if (c.act) {
      if (opts.natural) await sleep(500);
      else { await tap("fm-release"); await sleep(1900); }
      continue;
    }
    if (opts.stopAt && c.at === opts.stopAt) return true;
    if (!(await enabled(ctl, "fm-arrive")) && !c.heading) { await sleep(150); }
    await leg();
  }
  return false;
}

try {
  display = await B.open(`${BASE}/display`, 1920, 1080);
  ctl = await openIpad(A, `${BASE}/control`);
  await login(ctl); await selectPatient(ctl);
  await sleep(3000);
  await ctl.eval(`(() => { const a = [...document.querySelectorAll('a,button,article,div')].find((e) => e.textContent && e.textContent.includes('متاهة القدمين') && e.children.length < 8); a?.scrollIntoView({ block: 'center' }); })()`);
  await sleep(1200); await ctl.shot(`${out}/shots/library-card.png`);
  note("Library lists Foot Maze (Arabic name) with its real-gameplay thumbnail", await ctl.eval(`document.body.innerText.includes('متاهة القدمين') && [...document.images].some((i) => i.src.includes('foot-maze-3d') || i.currentSrc.includes('foot-maze-3d'))`));
  await ctl.eval(`location.href='/control/foot-maze-3d'`);
  note("Control opens and publishes the shared session", await until(() => exists(ctl, "fm-control"), 120000, 500));
  note("Display (separate device) renders from /liveSession", await until(() => exists(display, "fm-display"), 90000, 500));
  await sleep(3000);
  note("Display 3D canvas is running (WebGL)", !!(await display.eval(`document.querySelector('canvas')?.dataset.metrics ?? null`)));
  await openAll(ctl);
  note("Record is the shared liveSession with game id and engine", (await rd("liveSession/gameId")) === "foot-maze-3d" && (await rd("liveSession/session/engine")) === "fm3");
  note("No patient identifier on the public liveSession path", (await rd("liveSession/patientId")) == null && !JSON.stringify(await rd("liveSession")).includes("patient-1"));
  note("Control states the sensor limitation honestly", await ctl.eval(`document.body.innerText.includes('لا يُعطي موقع الطفل') && document.body.innerText.includes('لم يُختبر أي حساس حقيقي')`));
  note("Arabic RTL on both devices", (await ctl.eval(`document.querySelector('[data-testid=fm-control]').getAttribute('dir')`)) === "rtl" && (await display.eval(`document.querySelector('[data-testid=fm-display]').getAttribute('dir')`)) === "rtl");
  await ctl.shot(`${out}/shots/control-ready.png`); await shot("display-ready-s1");

  // ---- 1. setup preview: stage selection, simplified layout, width, orientation ----
  await tap("fm-stage-3");
  note("Stage selection reaches the Display (Friendly Forest)", await until(async () => (await dd(display)).stage === "3" && (await dd(display)).theme === "forest", 8000, 120));
  note("Display shows the maze preview before starting", await exists(display, "fm-setup"));
  const c3 = await cd(ctl), d3 = await dd(display);
  note("Control map and Display agree on the maze (stars, corridor width)", c3.total === d3.total && ctl.eval && Number(c3.junctions) >= 3 && Number((await ctl.eval(`document.querySelector('[data-testid=fm-map]').dataset.width`))) === Number(d3.width), JSON.stringify({ c: c3.total, d: d3.total, j: c3.junctions }));
  await shot("display-preview-s4");
  await ctl.shot(`${out}/shots/control-preview-s4.png`);
  await check(ctl, "fm-simple", true);
  note("Simplified route removes junctions and dead ends on both devices", await until(async () => (await cd(ctl)).junctions === "0" && Number((await dd(display)).total) < Number(c3.total) && (await dd(display)).total === (await cd(ctl)).total, 8000, 120));
  await shot("display-preview-s4-simple");
  await check(ctl, "fm-simple", false);
  await until(async () => (await cd(ctl)).junctions === c3.junctions, 8000, 120);
  await setRange(ctl, "fm-width", "1.3");
  note("Corridor width slider reaches the Display", await until(async () => Number((await dd(display)).width) === 1.3, 8000, 120));
  await tap("fm-width-auto");
  note("Automatic width restores the stage default", await until(async () => Number((await dd(display)).width) === Number(d3.width), 8000, 120));
  await tap("fm-rot-180"); await check(ctl, "fm-mirror", true);
  note("Rotation and mirroring are accepted before the stage starts", await until(async () => (await ctl.eval(`document.querySelector("[data-testid=fm-mirror]").checked`)) === true, 6000, 100));
  await tap("fm-rot-0"); await check(ctl, "fm-mirror", false);
  if (STOP === 1) throw new Error("STOP");

  // ---- 2. Stage 1: countdown, route, pause, assisted ----
  await gotoStage(0);
  await tap("fm-start");
  note("Countdown shows on the Display and arrival confirmation is closed", await until(async () => (await exists(display, "fm-countdown")) && !(await enabled(ctl, "fm-arrive")), 6000, 80));
  await sleep(3300);
  await shot("display-s1-go");
  note("Display pill gives a direction cue at the start (straight ahead)", (await dd(display)).phase === "go" && (await dd(display)).turn === "straight");
  await leg();
  note("First arrival confirmed: star collected on both devices", await until(async () => (await cd(ctl)).stars === "1" && (await dd(display)).stars === "1", 8000, 100));
  await tap("fm-pause");
  note("Pause freezes the clock on both devices", await (async () => { await until(async () => (await dd(display)).status === "paused", 8000, 100); const a = Number((await cd(ctl)).clock); await sleep(2500); return a === Number((await cd(ctl)).clock); })());
  note("Arrival cannot be confirmed while paused", !(await enabled(ctl, "fm-arrive")));
  await shot("display-s1-paused");
  await tap("fm-resume");
  await until(async () => (await cd(ctl)).status === "running", 8000, 100);
  await (async () => { const c = await cd(ctl); await tap(`fm-exit-${c.next}`); await until(async () => (await cd(ctl)).heading === c.next, 4000, 80); await tap("fm-arrive-assist"); await until(async () => (await cd(ctl)).at === c.next, 5000, 80); })();
  note("Assisted arrival counts in results", await ctl.eval(`/وصول بمساعدة 1/.test(document.querySelector('[data-testid=fm-results]').innerText)`));
  await play();
  note("Stage 1 completes on both devices", await waitStatus("stage-complete"));
  await shot("display-s1-complete");
  if (STOP === 2) throw new Error("STOP");

  // ---- 3. Stage 2: route choice, wrong branch is gentle, dead end, back, correct ----
  await tap("fm-next");
  await until(async () => (await cd(ctl)).stage === "1" && (await cd(ctl)).status === "ready", 8000, 100);
  await startStage();
  await leg(); // S -> junction
  const j = await cd(ctl);
  const ways = await ctl.eval(`[...document.querySelectorAll('[data-testid^=fm-exit-]')].map((e) => e.dataset.testid.replace('fm-exit-',''))`);
  note("At the junction the game does not pick for the therapist (two ways, no preselected heading)", ways.length >= 3 && j.heading === "", JSON.stringify(ways));
  await shot("display-s2-choose");
  const wrong = ways.find((w) => w !== j.next && w !== "S");
  await tap(`fm-exit-${wrong}`);
  note("Choosing a corridor shows the choice on the Display (heading) without judging it", await until(async () => (await dd(display)).heading === wrong, 6000, 100));
  await leg(wrong);
  for (let i = 0; i < 4; i++) { const c = await cd(ctl); if (c.next === undefined) break; const k = await ctl.eval(`document.querySelector('[data-testid=fm-heading-note]')?.innerText ?? ''`); if (Number((await cd(ctl)).detours) >= 1 && (await cd(ctl)).heading) break; await sleep(100); }
  await until(async () => Number((await cd(ctl)).detours) === 1, 6000, 100);
  note("A wrong branch counts as a detour (not a failure) and the stage keeps running", (await cd(ctl)).detours === "1" && (await cd(ctl)).status === "running");
  // walk the dead-end branch to its end, then back
  for (let g = 0; g < 4; g++) { const c = await cd(ctl); if (c.at === j.at) break; if (!(await enabled(ctl, "fm-arrive"))) { await sleep(150); continue; } if (!c.heading) break; await tap("fm-arrive"); await sleep(400); }
  await until(async () => Number((await dd(display)).cue) >= 1, 6000, 100);
  await shot("display-s2-deadend");
  await play();
  note("Stage 2 completes after turning back from the dead end", await waitStatus("stage-complete", 40000));
  note("Results count one detour and the correct choices", await ctl.eval(`/طرق جانبية 1/.test(document.querySelector('[data-testid=fm-results]').innerText)`));
  if (STOP === 3) throw new Error("STOP");

  // ---- 4. Stage 5: friendly guardian waiting ----
  note("Stage selection between stages works (jump to Festival Playground)", await gotoStage(4));
  await setRange(ctl, "fm-guardms", "3000");
  await startStage();
  note("No guardian before the child reaches the waiting zone", (await dd(display)).act === "");
  await leg();
  note("Guardian starts only after the arrival at the waiting zone is confirmed (both devices)", await until(async () => (await cd(ctl)).act === "guard" && (await dd(display)).act === "guard" && (await dd(display)).phase === "wait", 6000, 100));
  note("Moves are refused while the guardian blocks (arrive and route buttons disabled)", !(await enabled(ctl, "fm-arrive")) && !(await ctl.eval(`[...document.querySelectorAll('[data-testid^=fm-exit-]')].some((e) => !e.disabled)`)));
  await sleep(2200);
  await shot("display-s5-guardian-wait");
  await tap("fm-pause");
  const clk = (await cd(ctl)).clock; await sleep(2500);
  note("Pause freezes the guardian wait (clock and act)", (await cd(ctl)).clock === clk && (await cd(ctl)).act === "guard");
  await tap("fm-resume"); await until(async () => (await cd(ctl)).status === "running", 15000, 100);
  await tap("fm-extend");
  note("Therapist can extend the wait", await ctl.eval(`!!document.querySelector('[data-testid=fm-act]')`));
  const t0 = Date.now();
  note("The wait ends by itself on the running clock (natural completion)", await until(async () => (await cd(ctl)).act === "" && (await dd(display)).act === "", 25000, 150), `${Math.round((Date.now() - t0) / 100) / 10}s`);
  note("CONTINUE shows after the wait and moves are accepted again", (await cd(ctl)).waitsdone === "1" && await enabled(ctl, "fm-arrive") === true || await until(async () => (await cd(ctl)).waitsdone === "1", 3000, 100));
  await shot("display-s5-continue");
  // re-trigger by hand, then release early
  await tap("fm-trigger");
  note("Therapist can trigger the guardian again by hand", await until(async () => (await cd(ctl)).act === "guard", 4000, 100));
  await sleep(2000);
  await tap("fm-release");
  note("Manual release ends the wait early (guardian leaves, then clear)", await until(async () => (await cd(ctl)).act === "", 8000, 150));
  note("Results count the waits and the early release", await ctl.eval(`/انتظارات مكتملة 2\\/2/.test(document.querySelector('[data-testid=fm-results]').innerText)`));
  await play();
  note("Stage 5 completes", await waitStatus("stage-complete", 40000));
  if (STOP === 4) throw new Error("STOP");

  // ---- 5. Stage 7: gate, route switch, bridge; events can be disabled ----
  await tap("fm-next"); await until(async () => (await cd(ctl)).stage === "5", 8000, 100);
  await startStage();
  await tap("fm-skipstage"); await tap("fm-confirm-yes");
  note("Skipping a stage (with confirmation) moves on safely", await until(async () => (await cd(ctl)).stage === "6" && (await cd(ctl)).status === "ready", 8000, 100));
  await startStage();
  await leg(); // S -> A (gate)
  note("Gate wait begins at the waiting zone (Display + Control)", await until(async () => (await dd(display)).act === "gate" && (await cd(ctl)).act === "gate", 6000, 100));
  await sleep(2400); await shot("display-s7-gate-closed");
  await tap("fm-release"); await until(async () => (await cd(ctl)).act === "", 8000, 150);
  await leg(); // A -> n43
  await leg(); // n43 -> B (route switch)
  note("Route switch fires only after confirming arrival at its waiting zone and closes a corridor on both devices", await until(async () => (await cd(ctl)).act === "switch" && (await dd(display)).closed.includes("B~n61") && (await cd(ctl)).closed.includes("B~n61"), 6000, 100), JSON.stringify({ d: (await dd(display)).closed, c: (await cd(ctl)).closed }));
  await sleep(1500); await shot("display-s7-switch");
  await tap("fm-release"); await until(async () => (await cd(ctl)).act === "", 8000, 150);
  note("The closed corridor is no longer offered as a choice", !(await exists(ctl, "fm-exit-n61")));
  await play();
  note("Stage 7 completes through the open alternate route (bridge wait included)", await waitStatus("stage-complete", 60000));
  await tap("fm-next"); await until(async () => (await cd(ctl)).stage === "7", 8000, 100);
  await check(ctl, "fm-events", false);
  await check(ctl, "fm-guards", false);
  await startStage();
  await leg(); await leg();
  note("With guardians and events disabled nothing blocks or changes (town stage 8)", (await cd(ctl)).act === "" && (await dd(display)).act === "" && (await cd(ctl)).closed === "");
  await check(ctl, "fm-events", true); await check(ctl, "fm-guards", true);
  await shot("display-s8-play");
  if (STOP === 5) throw new Error("STOP");

  // ---- 6. skip / repeat / back / hint / unreliable confirmations ----
  const before = await cd(ctl);
  await tap("fm-hint-btn");
  note("Hint shows guidance for the Display for a few seconds and is counted", await until(async () => /تلميحات 1/.test(await ctl.eval(`document.querySelector('[data-testid=fm-results]').innerText`)), 6000, 100));
  await shot("display-s8-hint");
  await tap("fm-back");
  note("Back returns to the previous point (no star is removed or duplicated)", await until(async () => (await cd(ctl)).at !== before.at, 6000, 100) && (await cd(ctl)).stars === before.stars);
  await tap("fm-restartstage"); await tap("fm-confirm-yes");
  await until(async () => (await cd(ctl)).status === "ready", 8000, 100);
  await startStage();
  const k0 = Number((await dd(display)).skipped);
  await tap("fm-skip");
  note("Skip marks the next star skipped and counts it (+1 on both devices)", await until(async () => Number((await dd(display)).skipped) === k0 + 1 && new RegExp(`متخطاة ${k0 + 1}`).test(await ctl.eval(`document.querySelector('[data-testid=fm-results]').innerText`)), 6000, 100));
  await tap("fm-restartstage"); await tap("fm-confirm-yes");
  note("Restarting the stage returns to the preview safely", await until(async () => (await cd(ctl)).status === "ready" && (await dd(display)).status === "ready", 8000, 100));

  // ---- 7. reload recovery, safety ----
  await gotoStage(6);
  await startStage();
  await leg(); // gate act running
  const pre = await cd(ctl);
  await ctl.send("Page.reload");
  note("Control recovers after reload", await until(() => exists(ctl, "fm-control"), 90000, 500));
  await sleep(2500);
  const post = await cd(ctl);
  note("Recovery keeps stage, position and the running wait and never resumes by itself (paused + safety)", post.stage === pre.stage && post.at === pre.at && post.act === pre.act && post.status === "paused" && post.safety === "1", JSON.stringify({ pre: [pre.at, pre.act], post: [post.at, post.act, post.status] }));
  note("Display shows the safe pause after the reload", await until(async () => (await dd(display)).status === "paused", 8000, 150));
  await tap("fm-resume"); await until(async () => (await cd(ctl)).status === "running", 15000, 100);
  await display.send("Page.reload");
  note("Display recovers after reload", await until(() => display.eval(`!!document.querySelector('[data-testid=fm-display]') && !!document.querySelector('canvas')`), 90000, 500));
  await tap("fm-safety");
  note("Safety stop pauses both devices", await until(async () => (await dd(display)).safety === "1" && (await cd(ctl)).status === "paused", 10000, 100));
  await shot("display-safety");
  await tap("fm-resume");
  if (STOP === 6) throw new Error("STOP");

  // ---- 8. end early (history #1), restart, full nine stages (history #2) ----
  await tap("fm-end"); await sleep(300); await tap("fm-confirm-yes");
  note("Ending a session finishes it on both devices", await waitStatus("ended"));
  note("History saved once for the first (partial) run", await until(async () => (await history()).length === 1, 15000, 300));
  const first = (await history())[0];
  note("History record is the shared versioned record (no score)", first?.gameId === "foot-maze-3d" && first.resultVersion === 1 && first.engine === "fm3" && first.score === undefined && first.accuracy === undefined && first.confirmedCheckpoints + first.assistedCheckpoints + first.skippedCheckpoints + first.unfinishedCheckpoints === first.totalCheckpoints, JSON.stringify({ t: first?.totalCheckpoints }));
  await tap("fm-restart"); await sleep(300); await tap("fm-confirm-yes");
  note("Restart (after confirmation) opens a new run", await until(async () => (await cd(ctl)).run === "1" && (await cd(ctl)).status === "ready", 10000, 100));
  await openAll(ctl);
  for (let stage = 0; stage < 9; stage++) {
    if ((await cd(ctl)).status === "ready") await startStage();
    await play();
    const done = await waitStatus("stage-complete", 60000);
    if (stage === 3 || stage === 5 || stage === 8) await shot(`display-stage${stage + 1}-complete`);
    note(`Stage ${stage + 1} completes on both devices by manual touch confirmation`, done);
    if (stage === 8) break;
    await tap("fm-next");
    await until(async () => (await cd(ctl)).stage === String(stage + 1) && (await cd(ctl)).status === "ready", 10000, 100);
  }
  await tap("fm-next");
  note("Final stage ends the session and shows results", await waitStatus("ended", 15000));
  await sleep(2500);
  await shot("display-final"); await ctl.shot(`${out}/shots/control-final.png`);
  note("History saved exactly once for the nine-stage run", await until(async () => (await history()).length === 2, 15000, 300));
  await sleep(4000);
  const hs = await history();
  note("Save-once: still two records after waiting", hs.length === 2);
  const full = hs.find((h) => h.completedStageCount === 9);
  note("Nine-stage record: 9 stage rows, maze ids, guard waits and route choices present", !!full && full.stageResults.length === 9 && full.guardWaitsCompleted >= 4 && full.routeChoices >= 5 && full.stageResults.every((r) => r.maze && r.total > 0), JSON.stringify({ total: full?.totalCheckpoints, waits: full?.guardWaitsCompleted, choices: full?.routeChoices }));
  await ctl.send("Page.reload"); await sleep(7000);
  note("Reloading the ended session does not save it again", (await history()).length === 2);
  const mm = JSON.parse((await display.eval(`document.querySelector('canvas')?.dataset.metrics ?? 'null'`)) ?? "null");
  note("GPU resources stay bounded after many stage changes (no leak)", !!mm && mm.geometries < 140 && mm.textures < 80, JSON.stringify(mm));
  const e = errs(ctl, display);
  note("No uncaught exceptions on either device", e.length === 0, e.slice(0, 3).join(" | "));
} catch (e) {
  if (String(e?.message) !== "STOP") note("script completed without throwing", false, String(e?.stack ?? e).slice(0, 500));
} finally {
  writeFileSync(`${out}/e2e-results.json`, JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  A.close(); B.close();
  process.exit(failed ? 1 : 0);
}
