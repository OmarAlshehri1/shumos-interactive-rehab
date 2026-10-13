// Achievement City 3D: cross-device end-to-end on LOCAL EMULATORS ONLY (RTDB 19760, Auth 19769, app 3743).
// Two separate Chrome processes/profiles (iPad-like touch Control + 1920x1080 Display) share only the emulator.
// usage: node e2e.mjs <outDir> [baseUrl]
import { launch, login, openIpad, selectPatient, sleep, until, note, results, rd } from "./crosslib.mjs";
import { seed } from "./seed.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const [out = "../evidence", BASE = "http://127.0.0.1:3743"] = process.argv.slice(2);
mkdirSync(`${out}/shots`, { recursive: true });
await seed();
const PROFILE = process.env.AC_PROFILE ?? "/tmp/ac-e2e";
const A = await launch(`${PROFILE}/ipad`, 9891, ["--use-angle=metal"]), B = await launch(`${PROFILE}/laptop`, 9892, ["--use-angle=metal"]);
const cd = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=ac-control]')?.dataset ?? null)`).then((v) => JSON.parse(v));
const dd = (t) => t.eval(`JSON.stringify(document.querySelector('[data-testid=ac-display]')?.dataset ?? null)`).then((v) => JSON.parse(v));
const prog = (t) => t.eval(`document.querySelector('canvas')?.dataset.progress ?? null`).then((v) => (v ? JSON.parse(v) : null));
const metrics = (t) => t.eval(`document.querySelector('canvas')?.dataset.metrics ?? null`).then((v) => (v ? JSON.parse(v) : null));
const history = async () => Object.values((await rd("sessions/patient-1")) ?? {});
const exists = (t, id) => t.eval(`!!document.querySelector('[data-testid=${id}]')`);
const enabled = (t, id) => t.eval(`(() => { const e = document.querySelector('[data-testid=${id}]'); return !!e && !e.disabled; })()`);
const errs = (...tabs) => tabs.flatMap((t) => (t.events ?? []).filter((e) => e.method === "Runtime.exceptionThrown").map((e) => e.params.exceptionDetails.exception?.description?.slice(0, 200)));
let ctl, display;
const tap = async (id) => { await until(() => enabled(ctl, id), 20000, 150); return ctl.tapSel(`[data-testid=${id}]`); };
const sync = (pred, ms = 15000) => until(async () => { const c = await cd(ctl), d = await dd(display); return !!c && !!d && pred(c, d); }, ms, 100);
const setText = (t, id, v) => t.eval(`(() => { const e = document.querySelector('[data-testid=${id}]'); e.focus(); Object.getOwnPropertyDescriptor(e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,'value').set.call(e, ${JSON.stringify(v)}); e.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
const PAD = `(() => { const st = { connected: false, ts: 0, pressed: [false, false, false, false] }; window.__padState = st;
  navigator.getGamepads = () => [st.connected ? { connected: true, timestamp: st.ts, buttons: st.pressed.map((p) => ({ pressed: p, value: p ? 1 : 0 })), axes: [0, 0] } : null, null, null, null];
  window.__setPad = (o) => { Object.assign(st, o); st.ts = performance.now(); }; })();`;
const setPad = (o) => ctl.eval(`window.__setPad(${JSON.stringify(o)})`);
/** one physical press: down, hold, up */
const press = async (holdMs = 120) => { await setPad({ pressed: [true, false, false, false] }); await sleep(holdMs); await setPad({ pressed: [false, false, false, false] }); };
const shot = async (name) => { await ctl.shot(`${out}/shots/control-${name}.png`); await display.shot(`${out}/shots/display-${name}.png`); };
const confirmTo = async (n) => { for (let g = 0; g < 60; g++) { const c = await cd(ctl); if (Number(c.done) >= n || c.status !== "running") return; await tap("ac-confirm"); await sleep(380); } };

try {
  display = await B.open(`${BASE}/display`, 1920, 1080);
  ctl = await openIpad(A, `${BASE}/control`);
  await ctl.send("Page.addScriptToEvaluateOnNewDocument", { source: PAD });
  await login(ctl); await selectPatient(ctl);
  await sleep(3000);
  await ctl.eval(`location.href='/control/achievement-city-3d'`);
  note("Control opens the game and publishes the shared session", await until(() => exists(ctl, "ac-control"), 180000, 500));
  note("Display (separate device) renders from /liveSession", await until(() => exists(display, "ac-display"), 120000, 500));
  await sleep(4000);
  const m0 = await metrics(display);
  note("Display 3D canvas is running (WebGL) and renders the three-level world", !!m0 && m0.builds === 32 && m0.fps > 20, JSON.stringify(m0));
  note("Record is the shared liveSession with the game id and engine", (await rd("liveSession/gameId")) === "achievement-city-3d" && (await rd("liveSession/session/engine")) === "ac3");
  note("No patient identifier on the public liveSession path", (await rd("liveSession/patientId")) == null && !JSON.stringify(await rd("liveSession")).includes("patient-1"));
  note("Arabic RTL on both devices", (await ctl.eval(`document.querySelector('[data-testid=ac-control]').getAttribute('dir')`)) === "rtl" && (await display.eval(`document.querySelector('[data-testid=ac-display]').getAttribute('dir')`)) === "rtl");

  // ---------------- setup screen: exactly three levels, no stages ----------------
  note("Setup has exactly three level cards", (await ctl.eval(`document.querySelectorAll('[data-testid^=ac-level-]').length`)) === 3);
  note("No stage / nine-stage selector anywhere on the setup screen", !(await ctl.eval(`!!document.querySelector('[data-stage-choice],[data-progressive-stages]') || /المرحلة\\s*\\d/.test(document.querySelector('[data-testid=ac-setup-screen]').innerText)`)));
  note("Level cards carry the three Arabic names", await ctl.eval(`['القرية الجميلة','المدينة المتطورة','المدينة الكبرى'].every((n) => document.querySelector('[data-testid=ac-levels]').innerText.includes(n))`));
  note("Setup shows the title, projection mode, input mode, exercise and target", await ctl.eval(`['ac-proj','ac-input','ac-exercise','ac-target'].every((id) => !!document.querySelector('[data-testid=' + id + ']'))`));
  note("Display shows the setup card before starting", await exists(display, "ac-setup"));
  await ctl.eval(`document.querySelector('[data-testid=ac-options]').open = true`);
  await shot("setup");
  await setText(ctl, "ac-exercise", "الوقوف من الجلوس");
  await tap("ac-preset-6");
  note("Exercise and target are published to the Display (target 6)", await sync((c, d) => c.target === "6" && d.target === "6"));
  await tap("ac-level-1");
  note("Selecting level 2 directly shows level 1 as a completed baseline on the Display (no fabricated history)", await until(async () => { const p = await prog(display); return p && p.cottage1 === 1 && p.festival === 1 && p.roads === 0; }, 40000, 300) && (await history()).length === 0);
  await display.shot(`${out}/shots/display-direct-level2.png`);
  await tap("ac-level-0");
  note("Selecting level 1 again returns the world to an empty landscape", await until(async () => { const p = await prog(display); return p && p.cottage1 === 0 && p.festival === 0 && p.roads === 0; }, 40000, 300));
  await display.shot(`${out}/shots/display-l1-empty.png`);

  // ---------------- play: level 1 ----------------
  await tap("ac-start");
  note("Start runs the activity on both devices", await sync((c, d) => c.status === "running" && d.status === "running"));
  note("Setup is replaced by the play screen; the big confirm button is present", (await exists(ctl, "ac-confirm")) && !(await exists(ctl, "ac-setup-screen")));
  const sz = await ctl.eval(`(() => { const b = document.querySelector('[data-testid=ac-confirm]').getBoundingClientRect(); return [b.width, b.height]; })()`);
  note("Confirm button is large (≥ 100 px tall, ≥ 60% width) for iPad", sz[1] >= 100 && sz[0] >= 600, JSON.stringify(sz));
  await tap("ac-confirm");
  note("One confirmation increments Control and Display once", await sync((c, d) => c.done === "1" && d.done === "1" && c.confirmed === "1"));
  note("The first cottage builds up on the Display (not popping in)", await until(async () => { const p = await prog(display); return p && p.cottage1 > 0; }, 15000, 100));
  await sleep(2500);
  note("The first milestone finishes building", await until(async () => (await prog(display)).cottage1 === 1, 15000, 200));
  await display.shot(`${out}/shots/display-l1-first.png`);
  // duplicate prevention: two clicks inside one tick
  const before = (await cd(ctl)).done;
  await ctl.eval(`(() => { const b = document.querySelector('[data-testid=ac-confirm]'); b.click(); b.click(); b.click(); })()`);
  await sleep(1200);
  const c2 = await cd(ctl);
  note("Accidental triple click counts exactly once; the extra presses are ignored", Number(c2.done) === Number(before) + 1 && Number(c2.ignored) >= 2, `done ${before}->${c2.done} ignored ${c2.ignored}`);
  await sleep(500);
  await tap("ac-assist");
  note("Assisted confirmation increments once and is counted as assisted", await sync((c, d) => c.assisted === "1" && d.done === "3"));
  await tap("ac-undo");
  note("Undo removes only the most recent (assisted) confirmation and counts the undo", await sync((c, d) => c.done === "2" && c.assisted === "0" && c.undos === "1" && d.done === "2"));
  await sleep(800);
  await tap("ac-skip");
  note("Skip records a skipped exercise and builds nothing", await sync((c, d) => c.skipped === "1" && c.done === "2" && d.done === "2"));
  await sleep(400);
  await tap("ac-pause");
  note("Pause freezes play: confirm disabled, Display shows the rest overlay", (await sync((c, d) => c.status === "paused" && d.status === "paused")) && !(await enabled(ctl, "ac-confirm")) && (await exists(display, "ac-overlay")));
  await display.shot(`${out}/shots/display-paused.png`);
  await tap("ac-resume");
  note("Resume continues", await sync((c, d) => c.status === "running" && d.status === "running"));
  await sleep(500);

  // ---------------- therapist-held controller (simulated Gamepad API) ----------------
  await tap("ac-results-toggle"); await tap("ac-results-toggle");
  await ctl.eval(`document.querySelector('[data-testid=ac-options]').open = true`);
  // Switch the input mode in the Play screen's Settings is not available: use the setup-time control via restart later; here inject through state command
  await ctl.eval(`window.__ac_cfg = true`);
  await tap("ac-restart"); await tap("ac-confirm-yes");
  note("Restart (with confirmation) returns to setup and wipes the unsaved progress; nothing was saved", (await sync((c) => c.status === "ready" && c.done === "0" && c.run === "1")) && (await history()).length === 0);
  await tap("ac-input-gamepad");
  note("Gamepad mode shows honest controller status (none detected)", await until(() => ctl.eval(`document.querySelector('[data-testid=ac-pad-status]')?.dataset.status === 'none'`), 6000, 100));
  await setPad({ connected: true, pressed: [false, false, false, false] });
  note("A connected controller is reported as connected", await until(() => ctl.eval(`document.querySelector('[data-testid=ac-pad-status]')?.dataset.status === 'connected'`), 6000, 100));
  await tap("ac-start");
  await sync((c) => c.status === "running");
  await sleep(600);
  await press(150);
  note("One physical press = one confirmed achievement (Control and Display)", await sync((c, d) => c.done === "1" && d.done === "1"));
  await setPad({ pressed: [true, false, false, false] });
  await sleep(1800);
  const held = await cd(ctl);
  note("Holding the button does not repeat confirmations", held.done === "2" || held.done === "1", `done=${held.done}`);
  await setPad({ pressed: [false, false, false, false] });
  await sleep(500);
  const afterHold = Number((await cd(ctl)).done);
  // bounce: two presses 120 ms apart
  await setPad({ pressed: [true, false, false, false] }); await sleep(40); await setPad({ pressed: [false, false, false, false] }); await sleep(60); await setPad({ pressed: [true, false, false, false] }); await sleep(40); await setPad({ pressed: [false, false, false, false] });
  await sleep(900);
  const afterBounce = Number((await cd(ctl)).done);
  note("A double press inside the debounce window counts once", afterBounce - afterHold <= 1, `${afterHold}->${afterBounce}`);
  await press(100); await sleep(500);
  const afterSecond = Number((await cd(ctl)).done);
  note("A later separate press counts again", afterSecond === afterBounce + 1, `${afterBounce}->${afterSecond}`);
  await setPad({ connected: false });
  note("Controller disconnect is reported and manual confirmation remains available", (await until(() => ctl.eval(`document.querySelector('[data-testid=ac-pad-chip]')?.innerText.includes('انقطعت')`), 6000, 100)) && (await enabled(ctl, "ac-confirm")));
  await sleep(400);
  const dBefore = Number((await cd(ctl)).done);
  await tap("ac-confirm");
  note("Safe fallback: the on-screen button still confirms after disconnect", await until(async () => Number((await cd(ctl)).done) === dBefore + 1, 6000, 100));
  await setPad({ connected: true, pressed: [true, false, false, false] });
  await sleep(900);
  note("A button already held when the controller reappears is not counted", Number((await cd(ctl)).done) === dBefore + 1);
  await setPad({ pressed: [false, false, false, false] });

  // ---------------- finish level 1 and continue ----------------
  await confirmTo(6);
  note("Reaching the target completes the level (celebration on Display, Continue on Control)", (await sync((c, d) => c.status === "level-complete" && d.status === "level-complete")) && (await exists(ctl, "ac-continue")) && (await exists(display, "ac-levelcomplete")));
  note("The whole village is built when level 1 completes", await until(async () => { const p = await prog(display); return p && ["cottage1","path","cottage2","farm","garden","market","playground","fountain","houses","festival"].every((k) => p[k] === 1); }, 40000, 300));
  await sleep(2500);
  await shot("l1-complete");
  // reload recovery (paused by safety, progress kept exactly, no re-animation, no duplicate counts)
  const beforeReload = await cd(ctl);
  await ctl.send("Page.reload");
  note("Control reload recovers the session: same counts, never resumes by itself", await until(async () => { const c = await cd(ctl); return c && c.done === beforeReload.done && c.status === "level-complete" && c.run === beforeReload.run; }, 60000, 300));
  await tap("ac-continue");
  note("Continue moves to level 2 on both devices; the village is still fully built", (await sync((c, d) => c.level === "1" && d.level === "1" && c.status === "running" && c.done === "0")) && (await prog(display)).festival === 1 && (await prog(display)).cottage1 === 1);
  await ctl.eval(`document.querySelector('[data-testid=ac-options]')?.removeAttribute('open')`);
  await tap("ac-confirm");
  note("Level 2 construction starts from the completed village", await until(async () => (await prog(display)).roads > 0, 20000, 200));
  // reload mid level, running -> paused with safety
  await sleep(1500);
  const mid = await cd(ctl);
  await ctl.send("Page.reload");
  note("Reload during play recovers as a safety pause with the exact counts", await until(async () => { const c = await cd(ctl); return c && c.status === "paused" && c.safety === "1" && c.done === mid.done && c.level === "1"; }, 60000, 300));
  note("Display shows the safety pause and the world was not rebuilt/duplicated", (await until(async () => (await dd(display)).status === "paused" && (await dd(display)).safety === "1", 20000, 150)) && (await prog(display)).cottage1 === 1);
  await shot("l2-recovered");
  await tap("ac-resume");
  await sync((c) => c.status === "running");
  await sleep(500);
  const mmm = await cd(ctl);
  note("Resume after recovery counts from the preserved number (no duplicate)", Number(mmm.done) === Number(mid.done));
  await confirmTo(6);
  note("Level 2 completes", await sync((c, d) => c.status === "level-complete" && d.level === "1"));
  await sleep(3000);
  await shot("l2-complete");
  await tap("ac-continue");
  await sync((c) => c.level === "2" && c.status === "running");
  await confirmTo(3);
  await shot("l3-mid");
  await confirmTo(6);
  note("Level 3 completes; the finale is shown and only 'finish' is offered", (await sync((c, d) => c.status === "level-complete" && d.level === "2")) && !(await exists(ctl, "ac-continue")) && (await exists(ctl, "ac-finish")));
  await sleep(5000);
  await shot("l3-finale");
  await until(async () => (await metrics(display)).baked === 32, 40000, 500);
  await sleep(6000);
  const m3 = await metrics(display);
  note("All 32 milestones are built and merged for performance (draw calls bounded)", (await prog(display)) && Object.values(await prog(display)).every((v) => v === 1) && m3.baked === 32 && m3.calls < 1500, JSON.stringify(m3));
  await tap("ac-finish");
  note("Finish ends the session and shows results", (await sync((c, d) => c.status === "ended" && d.status === "ended")) && (await exists(ctl, "ac-results")));
  await sleep(500);
  await setText(ctl, "ac-notes", "ملاحظة تجريبية");
  await shot("ended");
  note("History is saved once for the full run (3 levels, COMPLETED)", await until(async () => (await history()).filter((h) => h.gameId === "achievement-city-3d").length === 1, 30000, 300));
  const h1 = (await history()).find((h) => h.gameId === "achievement-city-3d");
  note("History fields: exercise, levels, target, counts, undo, completion, controller count, no score", h1 && h1.exerciseTitle === "الوقوف من الجلوس" && h1.startingLevel === 1 && h1.endingLevel === 3 && h1.levelsCompleted === 3 && h1.completion === "COMPLETED" && h1.confirmedAchievements + h1.assistedAchievements === 18 && !("score" in h1) && !("accuracy" in h1), JSON.stringify({ ...h1, levelResults: undefined }).slice(0, 400));
  await sleep(4000);
  note("History stays a single record (save-once, no duplicates after waiting)", (await history()).filter((h) => h.gameId === "achievement-city-3d").length === 1);

  // ---------------- direct level 3, partial, then end ----------------
  await tap("ac-new");
  await sync((c) => c.status === "ready");
  await tap("ac-preset-6");
  await tap("ac-input-manual");
  await tap("ac-level-2");
  note("Direct selection of level 3 renders levels 1 and 2 complete and level 3 empty", await until(async () => { const p = await prog(display); return p && p.festival === 1 && p.clocktower === 1 && p.towers === 0; }, 40000, 300));
  await display.shot(`${out}/shots/display-direct-level3.png`);
  await tap("ac-start");
  await sync((c) => c.status === "running" && c.level === "2");
  await tap("ac-confirm"); await sleep(400); await tap("ac-confirm");
  await sync((c) => c.done === "2");
  await tap("ac-end"); await tap("ac-confirm-yes");
  note("Safe end saves a partial run", await until(async () => (await history()).filter((h) => h.gameId === "achievement-city-3d").length === 2, 30000, 300));
  const h2 = (await history()).filter((h) => h.gameId === "achievement-city-3d").find((h) => h.completion === "PARTIAL");
  note("Direct level-3 run records only level 3 (no fabricated level 1/2 rows)", h2 && h2.startingLevel === 3 && h2.endingLevel === 3 && Object.values(h2.levelResults).length === 1 && h2.confirmedAchievements === 2, JSON.stringify(h2 && { s: h2.startingLevel, e: h2.endingLevel, rows: Object.values(h2.levelResults).length }));
  // ---------------- library category ----------------
  await ctl.eval(`location.href='/control/activities'`);
  note("Library opens with the new category filter", await until(() => ctl.eval(`!!document.querySelector('[data-library-filter=INTERACTIVE_REWARDS]')`), 60000, 300));
  await sleep(1500);
  const secs = await ctl.eval(`JSON.stringify([...document.querySelectorAll('[data-library-section]')].map((e) => [e.dataset.librarySection, e.querySelectorAll('[data-game-card]').length]))`).then(JSON.parse);
  note("All view shows the reward category as its own separate section with only Achievement City", secs.length === 5 && secs[4][0] === "INTERACTIVE_REWARDS" && secs[4][1] === 1 && (await ctl.eval(`document.querySelector('[data-library-section=INTERACTIVE_REWARDS] [data-game-card]').dataset.gameCard`)) === "achievement-city-3d", JSON.stringify(secs));
  note("The category label is ألعاب التحفيز التفاعلي", await ctl.eval(`document.querySelector('[data-library-filter=INTERACTIVE_REWARDS]').innerText.includes('ألعاب التحفيز التفاعلي')`));
  const ids = await ctl.eval(`JSON.stringify([...new Set([...document.querySelectorAll('[data-game-card]')].map((e) => e.dataset.gameCard))])`).then(JSON.parse);
  note("20 canonical games are present (the original 19 plus Achievement City)", ids.length === 20 && ids.includes("achievement-city-3d"), `${ids.length}`);
  await ctl.shot(`${out}/shots/library-all.png`);
  await ctl.eval(`document.querySelector('[data-library-filter=INTERACTIVE_REWARDS]').click()`);
  await sleep(1200);
  const only = await ctl.eval(`JSON.stringify({ sections: [...document.querySelectorAll('[data-library-section]')].map((e) => e.dataset.librarySection), cards: [...document.querySelectorAll('[data-game-card]')].map((e) => e.dataset.gameCard) })`).then(JSON.parse);
  note("The dedicated filter shows only Achievement City", only.sections.length === 1 && only.cards.length === 1 && only.cards[0] === "achievement-city-3d", JSON.stringify(only));
  await ctl.shot(`${out}/shots/library-rewards.png`);
  await ctl.eval(`document.querySelector('[data-library-filter=FOOT]').click()`);
  await sleep(1000);
  note("Device filters are unchanged and do not include Achievement City", await ctl.eval(`!document.querySelector('[data-game-card=achievement-city-3d]') && document.querySelectorAll('[data-game-card]').length === 13`));
  await sleep(300);
  const pageErrs = errs(ctl, display);
  note("No uncaught exceptions on either device", pageErrs.length === 0, pageErrs.join(" | "));
} catch (e) {
  note("E2E aborted with an exception", false, String(e?.stack ?? e).slice(0, 500));
}
writeFileSync(`${out}/e2e-results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
A.close(); B.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
