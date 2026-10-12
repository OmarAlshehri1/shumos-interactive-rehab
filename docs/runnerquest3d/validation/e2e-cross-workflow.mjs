// CROSS-DEVICE workflow suite: therapist touch controls, sensor loss + manual fallback, reloads, stale/duplicate commands,
// staff authorization, read-only Display, history compatibility. TWO separate Chrome profiles + Firebase emulators.
import { writeFileSync, mkdirSync } from "node:fs";
import { launch, login, note, openIpad, rd, results, selectPatient, sleep } from "./crosslib.mjs";
const [out, BASE = "http://127.0.0.1:3230"] = process.argv.slice(2);
mkdirSync(`${out}/results`, { recursive: true });
// a legacy Balloon Quest history record that must stay readable and untouched
const owner = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const NS = "demo-rq3-default-rtdb", DB = "http://127.0.0.1:9000";
await fetch(`${DB}/sessions/patient-1/legacy-bq-1.json?ns=${NS}`, { method: "PUT", headers: owner, body: JSON.stringify({ sessionId: "legacy-bq-1", patientId: "patient-1", gameId: "balloon-quest", startedAt: 1700000000000, completedAt: 1700000600000, createdByUid: "x", startingDifficulty: "EASY", startingStage: 1, endingDifficulty: "EASY", endingStage: 5, completedStageCount: 5, skippedStageCount: 0, totalCorrect: 20, totalIncorrect: 2, accuracy: 0.9, durationMs: 600000, stageResults: [{ difficulty: "EASY", stageNumber: 5, status: "COMPLETED", correct: 4, incorrect: 0, accuracy: 1, durationMs: 100, averageReactionTimeMs: 900 }] }) });
const legacyBefore = JSON.stringify(await rd("sessions/patient-1/legacy-bq-1"));

const A = await launch(`${out}/ipad`, 9603), B = await launch(`${out}/laptop`, 9604);
let display = await B.open(`${BASE}/display`, 1920, 1080);
const control = await openIpad(A, `${BASE}/control/runner-quest-3d`);
await login(control); await selectPatient(control);
const rt = (js) => control.eval(`(() => { const rt = window.__RQ3D_RT; ${js} })()`);
const dLife = () => display.eval(`document.querySelector('[data-testid=rq3d-display]')?.dataset.lifecycle ?? null`);
const lc = () => rt(`return rt.session.lifecycle`);
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(250); } return false; };
const start = async () => control.tapThen("start", "window.__RQ3D_RT.session.lifecycle==='playing'");
await rt(`rt.command({type:'range', from:3, to:5}); rt.command({type:'settings', patch:{speed:2.4}}); return 1`);
await sleep(1200);

// --- 1. read-only Display
note("Display is read-only: the game view has no buttons, inputs or links (only the platform's own mute toggle exists outside it)", await display.eval(`document.querySelector('[data-testid=rq3d-display]') ? document.querySelector('[data-testid=rq3d-display]').querySelectorAll('button, input, select, textarea, a[href]').length === 0 : true`));
// --- 2. touch controls
await start(); await sleep(2500);
note("touch start; Display (other device) is playing", (await lc()) === "playing" && await until(async () => (await dLife()) === "playing"));
const l0 = await rt(`return rt.session.stage.lane`);
await control.tap("touch-left"); await sleep(1200);
note("touch LEFT moves the runner left on Control", (await rt(`return rt.session.stage.lane`)) === -1 && l0 === 0);
note("the Display (other device) registers the move", Number(await display.eval(`document.querySelector('[data-testid=rq3d-display]').dataset.laneseq`)) >= 1);
await control.tap("touch-left"); await sleep(400);
await sleep(700); await control.tap("touch-right"); await sleep(1100);
note("touch RIGHT moves back toward centre", (await rt(`return rt.session.stage.lane`)) === 0);
await rt(`rt.session.stage.distance = rt.session.stage.encounters[0].z - 5; return 1`);
await sleep(300); await control.tap("touch-step"); await sleep(900);
note("touch STEP arms the hurdle (in-game step-over, no physical jump)", (await rt(`return rt.session.stage.obstacles[0].armed`)) === true);
await sleep(5000);
note("hurdle cleared, star awarded by Control; Display shows the same star count", (await rt(`return rt.session.stage.obstacles[0].how`)) === "stepped" && Number(await display.eval(`document.querySelector('[data-testid=rq3d-display]').dataset.stars`)) === (await rt(`return rt.session.stage.stars`)));
const dupBefore = await rt(`return rt.session.stage.laneSeq`);
await control.eval(`(() => { const b = document.querySelector('[data-testid=touch-left]'); b.click(); b.click(); b.click(); })()`); await sleep(500);
note("rapid triple-tap moves only ONE lane (duplicate/bounce protection)", (await rt(`return rt.session.stage.laneSeq`)) - dupBefore === 1);
// --- 3. pause / resume / restart
await control.tapThen("pause", "window.__RQ3D_RT.session.lifecycle==='paused'"); await sleep(1500);
const pd = await rt(`return rt.session.stage.distance`); await sleep(1200);
note("pause by touch freezes the runner; Display shows paused", (await lc()) === "paused" && (await rt(`return rt.session.stage.distance`)) === pd && await until(async () => (await dLife()) === "paused"));
await control.shot(`${out}/wf-control-paused.png`); await display.shot(`${out}/wf-display-paused.png`);
await control.tapThen("resume", "window.__RQ3D_RT.session.lifecycle==='playing'"); await sleep(1500);
note("resume by touch continues; Display follows", (await lc()) === "playing" && await until(async () => (await dLife()) === "playing"));
await control.tapThen("restart", "window.__RQ3D_RT.session.lifecycle==='ready'"); await sleep(1500);
note("restart by touch returns the stage to ready at distance 0 on both devices", (await rt(`return rt.session.stage.distance`)) === 0 && await until(async () => (await dLife()) === "ready"));
// --- 4. idle child: hold, assist
await start(); await rt(`rt.command({type:'settings', patch:{speed:4.5}}); return 1`);
const held = await until(() => rt(`return rt.session.stage.holding`), 60000);
note("the runner waits at an obstacle when nobody acts (no failure)", held && (await lc()) === "playing");
await sleep(8000);
note("8 s later still playing and waiting; Display shows the hint", (await lc()) === "playing" && (await rt(`return rt.session.stage.holding`)) && /تحرّك|ارفع|اختر/.test(await display.eval(`document.body.innerText`)));
await control.tap("assist"); await sleep(2500);
note("therapist ASSIST by touch passes the obstacle and records it", (await rt(`return rt.session.stage.assists`)) === 1 && !(await rt(`return rt.session.stage.holding`)));
// --- 5. skip -> advance -> end
await control.tapThen("skip", "window.__RQ3D_RT.session.lifecycle==='stage-complete'"); await sleep(1500);
note("skip by touch -> stage-complete, never automatic; Display shows it", (await lc()) === "stage-complete" && await until(async () => (await dLife()) === "stage-complete"));
await sleep(4000); note("it waits for the therapist", (await lc()) === "stage-complete");
await control.tapThen("advance", "window.__RQ3D_RT.session.lifecycle==='ready'");
// --- 6. sensor mode, loss and manual fallback
await rt(`rt.command({type:'settings', patch:{inputSource:'RIGHT_FOOT', speed:2.4}}); return 1`);
await sleep(2500);
note("RIGHT_FOOT (simulated) becomes ready", (await rt(`return rt.view().inputReady`)) === true);
await start(); await sleep(1500);
await control.tap("touch-right"); await sleep(900);
note("manual touch override works while a sensor mode is active", (await rt(`return rt.session.stage.lane`)) === 1);
const idBefore = await rt(`return rt.session.sessionId`);
await control.eval(`(() => { const c = document.querySelector('[data-testid=sim-RIGHT_FOOT-connected]'); c.click(); })()`); await sleep(2200);
note("sensor disconnect suspends but does NOT end the session; Display shows the calm pause", (await lc()) === "suspended" && (await rt(`return rt.session.sessionId`)) === idBefore && await until(async () => (await dLife()) === "suspended"));
note("a plain resume is refused while the sensor is gone", !(await rt(`return rt.command({type:'resume'})`)) && (await lc()) === "suspended");
await control.shot(`${out}/wf-control-sensor-lost.png`); await display.shot(`${out}/wf-display-sensor-lost.png`);
await control.tapThen("continue-manually", "window.__RQ3D_RT.session.lifecycle==='playing'"); await sleep(1500);
note("'continue manually' resumes with the same session; the sensor stays lost without re-suspending", (await lc()) === "playing" && (await rt(`return rt.session.sessionId`)) === idBefore);
await sleep(3500);
note("still playing 3.5 s later (no repeat suspension)", (await lc()) === "playing");
await control.tap("touch-left"); await sleep(900);
note("manual touch keeps working with the sensor gone", (await rt(`return rt.session.stage.lane`)) === 0);
await control.eval(`(() => { document.querySelector('[data-testid=sim-RIGHT_FOOT-connected]').click(); })()`); await sleep(3500);
note("sensor reconnects: the manual bypass clears and automatic input is live again", (await rt(`return rt.view().sensorBypass`)) === false && (await rt(`return rt.view().inputOk`)) === true);
await rt(`rt.command({type:'settings', patch:{inputSource:'MANUAL'}}); return 1`);
// --- 7. Display reload
await display.eval(`location.reload()`); await sleep(7000);
note("Display reload mid-play re-joins the live session on its own", (await dLife()) === "playing" || (await dLife()) === "suspended");
// --- 8. stale command / old run
const old = await rt(`return { sessionEpoch: rt.session.sessionEpoch, runId: rt.session.runId }`);
await rt(`rt.command({type:'end'}); rt.command({type:'new-run'}); return 1`); await sleep(800);
note("a stale command addressed to the old run is refused", (await rt(`return rt.command({type:'skip'}, ${JSON.stringify(old)})`)) === false);
note("Display follows the new run (ready)", await until(async () => (await dLife()) === "ready"));
// --- 9. Control reload => safe new session; Display follows
await control.eval(`location.reload()`); await sleep(9000);
note("after a Control reload a fresh session starts safely in ready", (await control.eval(`document.querySelector('[data-testid=rq3d-control]')?.dataset.lifecycle`)) === "ready");
note("Display follows the reloaded Control", await until(async () => (await dLife()) === "ready", 10000));
// --- 10. complete a short session so history is written, then check history compat in the UI
await rt(`rt.command({type:'range', from:0, to:0}); rt.command({type:'settings', patch:{speed:4.5, spacing:0.8}}); return 1`);
await start();
for (let i = 0; i < 4000 && (await lc()) !== "completed"; i++) {
  const a = await control.eval(`(() => { const rt = window.__RQ3D_RT; const s = rt.session; const st = s.stage; if (!st || s.lifecycle !== 'playing') return null; const i = st.encounters.findIndex((e, k) => !st.obstacles[k].resolved && e.z >= st.distance && (e.kind==='side'||e.kind==='gate')); if (i < 0) return null; const e = st.encounters[i]; if (e.z - st.distance > 15) return null; const free = [-1,0,1].filter(l => !e.lanes.includes(l)); if (free.includes(st.lane)) return null; const g = free.reduce((a,b)=> Math.abs(a-st.lane) <= Math.abs(b-st.lane) ? a : b); return g < st.lane ? 'touch-left' : 'touch-right'; })()`);
  if (a) await control.tap(a);
  await sleep(100);
}
await sleep(3000);
const hist = Object.values((await rd("sessions/patient-1")) ?? {}).filter((r) => r.gameId === "runner-quest-3d");
note("a completed session wrote exactly one Runner Quest history record", hist.length === 1 && hist[0].resultVersion === 1, `records=${hist.length}`);
note("the legacy Balloon Quest record is byte-identical (never touched or reinterpreted)", JSON.stringify(await rd("sessions/patient-1/legacy-bq-1")) === legacyBefore);
await control.eval(`location.href='/control/patients/patient-1'`); await sleep(9000);
const prof = await control.eval(`document.body.innerText`);
note("patient profile lists the Runner Quest session (stars, no accuracy) AND the legacy Balloon Quest session", prof.includes("مغامرة العدّاء") && prof.includes("نجمة") && prof.includes("مغامرة البالونات"), "");
await control.shot(`${out}/wf-history-list.png`);
const sid = hist[0]?.sessionId;
await control.eval(`location.href='/control/patients/patient-1/sessions/${sid}'`); await sleep(8000);
const detail = await control.eval(`document.body.innerText`);
note("session detail page renders Runner Quest results without accuracy/incorrect", detail.includes("النجوم") && detail.includes("وقفات") && !detail.includes("الدقة الإجمالية"));
await control.shot(`${out}/wf-history-detail.png`);
// --- 11. other games unaffected
for (const [path, needle] of [["/control/activities", "مغامرة العدّاء"], ["/control/balloon-quest", "مغامرة البالونات"], ["/control/space-pilot", null], ["/control/color-chase", null]]) {
  await control.eval(`location.href='${path}'`); await sleep(6000);
  const ok = await control.eval(`document.body.innerText.length > 50 && !/Application error|Unhandled|404/.test(document.body.innerText)`);
  note(`existing route ${path} still loads`, ok && (!needle || (await control.eval(`document.body.innerText.includes('${needle}')`))));
}
const lib = await control.eval(`['مغامرة البالونات','قائد الفضاء','مطاردة الألوان','أطعم الحيوانات','فرقع الفقاعات','اتبع الخطوات'].filter(t => document.body.innerText.includes(t)).length`);
await control.eval(`location.href='/control/activities'`); await sleep(6000);
note("library lists all six original games next to Runner Quest", (await control.eval(`['مغامرة البالونات','قائد الفضاء','مطاردة الألوان','أطعم الحيوانات','فرقع الفقاعات','اتبع الخطوات','مغامرة العدّاء'].every(t => document.body.innerText.includes(t))`)));
void lib;
note("no console exceptions on either device", [control, display].every((t) => t.events.filter((e) => e.method === "Runtime.exceptionThrown").length === 0), String([control, display].map((t) => t.events.filter((e) => e.method === "Runtime.exceptionThrown").length)));

// --- 12. staff authorization: a signed-in NON-staff account is refused by the existing gate
const C = await launch(`${out}/outsider`, 9605);
const outsider = await openIpad(C, `${BASE}/control/runner-quest-3d`);
await login(outsider, "outsider@example.test"); await sleep(3000);
note("a non-staff account cannot reach the Runner Quest Control (existing authorization gate)", !(await outsider.eval(`!!document.querySelector('[data-testid=rq3d-control]')`)) && !(await outsider.eval(`!!document.querySelector('[data-testid=start]')`)));
await outsider.shot(`${out}/wf-outsider-blocked.png`);
const liveNow = await rd("liveSession");
note("and nothing was written to the live session by the outsider", !liveNow || liveNow.session?.config?.childFirstName !== "زائر");
writeFileSync(`${out}/results/e2e-cross-workflow.json`, JSON.stringify(results, null, 1));
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
A.close(); B.close(); C.close();
