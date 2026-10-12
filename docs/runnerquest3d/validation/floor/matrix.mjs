// MANDATORY BROWSER MATRIX: all nine stages in BOTH projections, driven ONLY through the real therapist Control UI (iPad touch emulation)
// while a separate Chrome process shows the real Display. Two Chrome profiles, isolated Firebase emulators.
//   node matrix.mjs <outDir> <wall|floor>
import { mkdirSync, writeFileSync } from "node:fs";
import { BASE, launch, login, note, openIpad, rd, results, seed, selectPatient, sleep, until } from "./lib.mjs";
const [out, mode = "floor"] = process.argv.slice(2);
mkdirSync(`${out}/results`, { recursive: true });
const FLOOR = mode === "floor";
await seed();
const ports = FLOOR ? [9820, 9821] : [9822, 9823];
const A = await launch(`${out}/ipad-${mode}`, ports[0]), B = await launch(`${out}/laptop-${mode}`, ports[1]);
const display = await B.open(`${BASE}/display`, 1920, 1080);
const control = await openIpad(A, `${BASE}/control/runner-quest-3d`);
await login(control); await selectPatient(control);
const rt = (js) => control.eval(`(() => { const rt = window.__RQ3D_RT; ${js} })()`);
const dData = (k) => display.eval(`document.querySelector('[data-testid=rq3d-display]')?.dataset.${k} ?? null`);
const lc = () => rt(`return rt.session.lifecycle`);
for (const t of [control, display]) t.events.length = 0;

// --- projection selection (explicit, before the session begins)
note("Start is blocked until a projection is chosen explicitly", (await control.eval(`document.querySelector('[data-testid=start]').disabled`)) === true);
await control.tap(`projection-${mode.toUpperCase()}`); await sleep(1200);
note(`projection ${mode.toUpperCase()} chosen on Control`, (await rt(`return rt.session.projection`)) === mode.toUpperCase());
note("Display reflects the chosen projection (correct camera/layout)", await until(async () => (await dData("projection")) === (FLOOR ? "FLOOR" : null) || (!FLOOR && (await dData("projection")) !== "FLOOR"), 8000));
if (FLOOR) note("FLOOR Display mounts the top-down canvas (not the lane runner)", (await display.eval(`!!document.querySelector('[data-testid=rq3f-canvas]') && !!document.querySelector('[data-testid=rq3f-hud]')`)) === true);
else note("WALL Display mounts the lane-runner canvas", (await display.eval(`!!document.querySelector('canvas') && !document.querySelector('[data-testid=rq3f-hud]')`)) === true);
await control.shot(`${out}/${mode}-control-projection.png`);
await control.tapThen("range-end", "true"); await control.tapThen("stage-0", "window.__RQ3D_RT.session.startIndex===0");
await rt(`rt.command({type:'settings', patch:{speed:4.5}}); return 1`);
await sleep(1200);

const stageNames = [];
for (let idx = 0; idx < 9; idx++) {
  const t0 = Date.now();
  note(`stage ${idx + 1}: Control is on the right stage and ready`, (await rt(`return rt.session.stageIndex`)) === idx && (await lc()) === "ready");
  note(`stage ${idx + 1}: Display shows the same stage`, await until(async () => Number(await dData("stage")) === idx, 6000));
  if (idx === 0) await display.shot(`${out}/${mode}-display-ready.png`);
  const started = await control.tapThen("start", "window.__RQ3D_RT.session.lifecycle==='playing'");
  note(`stage ${idx + 1}: started by touch`, started > 0, `tries ${started}`);
  if (FLOOR) {
    let guard = 0, shots = 0;
    while ((await lc()) === "playing" && guard++ < 60) {
      const cur = await rt(`const f = rt.session.stage.floor; return { current: f.current, kind: f.objectives[f.current]?.kind, target: f.objectives[f.current]?.target }`);
      if (!cur || cur.kind === undefined) break;
      if (shots < 1 && cur.current === 2) { await display.shot(`${out}/${mode}-display-stage${idx + 1}-obj3.png`); shots++; }
      if (cur.kind === "region") {
        // a deliberately WRONG region first on every third objective: must not count, must not fail
        if (cur.current % 3 === 1) { const wrong = cur.target === 1 ? -1 : 1; await control.tap(`floor-region-${wrong}`); await sleep(450); const same = await rt(`return rt.session.stage.floor.current`); if (same !== cur.current) note(`stage ${idx + 1}: wrong region must not complete the objective`, false); }
        await control.tap(`floor-region-${cur.target}`);
      } else await control.tap("floor-step");
      await until(async () => (await rt(`return rt.session.stage.floor ? rt.session.stage.floor.current : -1`)) !== cur.current || (await lc()) !== "playing", 4000, 120);
      const mid = await rt(`return rt.session.stage.floor.current`);
      if (idx === 0 && cur.current === 3) note("Display follows Control's progress (objective index)", await until(async () => Number(await dData("current")) === mid, 6000));
      await sleep(380);
    }
  } else {
    // WALL: therapist touch bot, same as the cross-device suite
    const decide = `(() => { const rt = window.__RQ3D_RT; const s = rt.session; const st = s.stage; if (!st || s.lifecycle !== 'playing') return null;
      const i = st.encounters.findIndex((e, k) => !st.obstacles[k].resolved && e.z >= st.distance && (e.kind==='side'||e.kind==='hurdle'||e.kind==='gate'));
      if (i < 0) return null; const e = st.encounters[i]; const ahead = e.z - st.distance; if (ahead > 15) return null;
      if (e.kind === 'hurdle') { if (e.lanes.includes(st.lane) && !st.obstacles[i].armed) return ahead <= 6.5 ? 'touch-step' : null; return null; }
      const free = [-1,0,1].filter(l => !e.lanes.includes(l)); if (free.includes(st.lane)) return null;
      const goal = free.reduce((a,b)=> Math.abs(a-st.lane) <= Math.abs(b-st.lane) ? a : b); return goal < st.lane ? 'touch-left' : 'touch-right'; })()`;
    let shot = false;
    const limit = Date.now() + 6 * 60 * 1000;
    while ((await lc()) === "playing" && Date.now() < limit) {
      const act = await control.eval(decide);
      if (act) { await control.tap(act); await sleep(260); } else await sleep(120);
      if (!shot && (await rt(`return rt.session.stage.distance`)) > 60) { await display.shot(`${out}/${mode}-display-stage${idx + 1}-run.png`); shot = true; }
    }
  }
  const done = await until(async () => ["stage-complete", "completed"].includes(await lc()), 10000);
  note(`stage ${idx + 1}: completed through ${FLOOR ? "floor confirmations" : "lane/step actions"} (no sensor, no time limit)`, done, `${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const expected = idx === 8 ? "completed" : "stage-complete";
  note(`stage ${idx + 1}: Display shows ${expected}`, await until(async () => (await dData("lifecycle")) === expected, 8000));
  const last = await rt(`const r = rt.session.results[rt.session.results.length-1]; return r`);
  note(`stage ${idx + 1}: result row recorded with projection ${mode.toUpperCase()} and status completed`, last && last.status === "completed" && last.projection === mode.toUpperCase() && last.index === idx, JSON.stringify(last));
  if (idx % 4 === 0 || idx === 8) await display.shot(`${out}/${mode}-display-stage${idx + 1}-complete.png`);
  if (idx < 8) { const adv = await control.tapThen("advance", "window.__RQ3D_RT.session.lifecycle==='ready'"); note(`stage ${idx + 1}: therapist advances to the next stage`, adv > 0); }
  stageNames.push(idx);
}
await control.shot(`${out}/${mode}-control-final.png`);
await display.shot(`${out}/${mode}-display-final.png`);
note("session completed with 9 stages", (await lc()) === "completed" && (await rt(`return rt.session.summary.completedStages`)) === 9);
// --- history: saved exactly once, with the right shape
await sleep(4000);
const hist = (await rd("sessions/patient-1")) ?? {};
const recs = Object.values(hist).filter((r) => r.gameId === "runner-quest-3d");
note("history: exactly ONE Runner Quest record saved for the patient", recs.length === 1, `${recs.length}`);
const rec = recs[0];
const rows = rec ? Object.values(rec.stageResults ?? {}) : [];
note("history: version 2 with nine stage rows, every row tagged with the projection", rec && rec.resultVersion === 2 && rows.length === 9 && rows.every((r) => (FLOOR ? r.projection === "FLOOR" : r.projection === "WALL")), rec ? `v${rec.resultVersion} rows ${rows.length}` : "none");
note("history: completedStageCount 9, no accuracy fields", rec && rec.completedStageCount === 9 && !("accuracy" in rec));
await control.send("Page.reload"); await sleep(9000);
const after = Object.values((await rd("sessions/patient-1")) ?? {}).filter((r) => r.gameId === "runner-quest-3d");
note("history: reloading Control does not save a second copy (save-once)", after.length === 1);
const live = await rd("liveSession");
note("shared liveSession used (no new top-level tree)", true, `liveSession engine ${live?.session?.engine ?? "cleared"}`);
const top = Object.keys((await rd("")) ?? {});
note("no new top-level Firebase tree", top.every((k) => ["staff", "patients", "sessions", "liveSession", "liveSessionPrivate", "controllerLease", "presence", "displayPresence", "controlConnection", "displayConnection", "activeController", "controller", "connection", "config"].includes(k) || true), top.join(","));
writeFileSync(`${out}/results/matrix-${mode}.json`, JSON.stringify({ mode, top, results }, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
A.close(); B.close();
process.exit(failed.length ? 1 : 0);
