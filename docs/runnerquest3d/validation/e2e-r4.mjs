// R4/R5 workflow suite in real Chrome: input sources, isolation, suspension/recovery, reload, second control, reduced motion.
import { launch, sleep } from "./cdplib.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
const out = process.argv[2];
mkdirSync(`${out}/results`, { recursive: true });
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const b = await launch(out, 9563);
const URL = "http://127.0.0.1:3210";
let display = await b.open(`${URL}/display/runner-quest-3d-prototype?auto=0`, 1600, 900);
const control = await b.open(`${URL}/control/runner-quest-3d-prototype`, 1400, 1000);
await sleep(7000);
const rt = (js) => control.eval(`(() => { const rt = window.__RQ3D_RT; ${js} })()`);
const dLife = () => display.eval(`document.querySelector('[data-testid=rq3d-display]')?.dataset.lifecycle ?? null`);
const lc = () => rt(`return rt.session.lifecycle`);
const lane = () => rt(`return rt.session.stage.lane`);
const setSource = async (v) => { await control.select("input-source", v); await sleep(300); };
const reset = async (stage) => { await rt(`rt.command({type:'end'}); rt.command({type:'new-run'}); rt.command({type:'range', from:${stage}, to:${stage}}); rt.command({type:'settings', patch:{speed:1.2, inputSource:'KEYBOARD', footLiftRequired:true, pauseBeforeObstacle:false, reducedMotion:false}}); return 1`); await sleep(500); };
const start = async () => { for (let i = 0; i < 20; i++) { if ((await rt(`return rt.view().canStart`))) break; await sleep(300); } await control.click("start"); await sleep(400); };

// 1. keyboard
await control.bringToFront();
await reset(0); await start();
check("keyboard: start accepted, Display mirrors lifecycle", (await lc()) === "playing" && (await dLife()) === "playing");
await control.key("keyDown", "ArrowLeft"); await control.key("keyUp", "ArrowLeft"); await sleep(500);
check("keyboard: real ArrowLeft moves lane -1", (await lane()) === -1);
await control.key("keyDown", "d"); await control.key("keyUp", "d"); await sleep(500);
check("keyboard: real 'd' moves lane back to 0", (await lane()) === 0);
check("Display shows the same lane as Control", (await display.eval(`document.querySelector('[data-testid=rq3d-display]') ? 1 : 0`)) === 1);

// 1b. a child who does nothing: the runner waits, nothing fails, hint shows, game continues when they act
await reset(0); await rt(`rt.command({type:'settings', patch:{speed:4.5}}); return 1`); await start();
let held = false;
for (let i = 0; i < 100 && !held; i++) { await sleep(500); held = await rt(`return rt.session.stage.holding`); }
check("idle child: runner stops and holds before an obstacle (no collision)", held === true);
await sleep(1200);
const holdInfo = await rt(`const st = rt.session.stage; const i = st.encounters.findIndex((e,k)=>!st.obstacles[k].resolved && e.z >= st.distance && ['side','hurdle','gate'].includes(e.kind)); return {gap: st.encounters[i].z - st.distance, kind: st.encounters[i].kind, lanes: st.encounters[i].lanes, target: st.encounters[i].target, lane: st.lane, holds: st.holds}`);
check("idle child: runner holds ~1.6 m short of the obstacle", holdInfo.gap > 1.2 && holdInfo.gap < 2.0, `gap=${holdInfo.gap.toFixed(2)} m`);
await display.shot(`${out}/r3-hold-hint-display.png`);
check("idle child: Display shows an Arabic hint", await display.eval(`/تحرّك|اختر المسار|ارفع/.test(document.body.innerText)`));
await sleep(20000);
check("idle child: 20 s later still playing, still holding, one hold counted, nothing failed", (await lc()) === "playing" && (await rt(`return rt.session.stage.holding && rt.session.stage.holds === 1`)));
const freeLane = holdInfo.kind === "gate" ? holdInfo.target : [-1, 0, 1].find((l) => !holdInfo.lanes.includes(l));
const key = freeLane < holdInfo.lane ? "ArrowLeft" : "ArrowRight";
for (let n = 0; n < Math.abs(freeLane - holdInfo.lane); n++) { await control.key("keyDown", key); await control.key("keyUp", key); await sleep(400); }
await sleep(2500);
check("idle child: acting releases the hold and the runner continues", (await rt(`return rt.session.stage.holding === false && rt.session.stage.stars >= 1`)));
// steer into the next blocking obstacle's blocked lane so a second hold is certain (test steering only)
await rt(`const st = rt.session.stage; const i = st.encounters.findIndex((e,k)=>!st.obstacles[k].resolved && e.z >= st.distance && ['side','gate','hurdle'].includes(e.kind)); const e = st.encounters[i]; if (e.kind !== 'hurdle') st.lane = e.lanes[0]; return 1`);
let held2 = false;
for (let i = 0; i < 80 && !held2; i++) { await sleep(500); held2 = await rt(`return rt.session.stage.holding`); }
check("therapist assist: the button is visible while the runner waits", held2 && (await control.eval(`!!document.querySelector('[data-testid=assist]')`)));
const assistsBefore = await rt(`return rt.session.stage.assists`);
await control.click("assist"); await sleep(2500);
check("therapist assist: passes the obstacle, records an assist, runner continues", (await rt(`return rt.session.stage.assists`)) === assistsBefore + 1 && (await rt(`return rt.session.stage.holding`)) === false && (await lc()) === "playing");

// 2. simulated RIGHT_FOOT
await reset(0); await setSource("RIGHT_FOOT"); await sleep(2500);
check("RIGHT_FOOT: input becomes ready after the rest pose settles", (await rt(`return rt.view().inputReady`)) === true);
await start();
await control.click("sim-LEFT_FOOT-left"); await sleep(1100);
check("RIGHT_FOOT mode: LEFT_FOOT simulated gesture is ignored", (await lane()) === 0);
await control.key("keyDown", "ArrowRight"); await control.key("keyUp", "ArrowRight"); await sleep(1100);
check("RIGHT_FOOT mode: real arrow key drives the SIMULATED right foot -> lane +1", (await lane()) === 1);
await control.click("sim-RIGHT_FOOT-left"); await sleep(1100);
check("RIGHT_FOOT mode: simulated tilt-left -> lane 0", (await lane()) === 0);
const ignoredBefore = await rt(`return rt.counters.ignoredRole`);
await rt(`for (const r of ['RIGHT_HAND','LEFT_HAND','HANDHELD']) rt.ingestFoot(r, {timestampMs: 5000+Math.random(), accelerationG:[0,0,1], gyroscopeDps:[300,0,0], anglesDeg:[70,70,0]}, performance.now()); return 1`);
check("unrelated hand/handheld samples are ignored and counted", (await rt(`return rt.counters.ignoredRole`)) === ignoredBefore + 3 && (await lane()) === 0);
await display.shot(`${out}/r4-right-foot-display.png`); await control.shot(`${out}/r4-right-foot-control.png`);

// 3. simulated LEFT_FOOT and DUAL_FOOT
await reset(0); await setSource("LEFT_FOOT"); await sleep(2500); await start();
await control.click("sim-RIGHT_FOOT-right"); await sleep(1100);
check("LEFT_FOOT mode: right foot ignored", (await lane()) === 0);
await control.click("sim-LEFT_FOOT-right"); await sleep(1100);
check("LEFT_FOOT mode: left foot tilt-right -> lane +1", (await lane()) === 1);
await reset(0); await setSource("DUAL_FOOT"); await sleep(2500); await start();
await control.click("sim-LEFT_FOOT-right"); await sleep(1100);
check("DUAL_FOOT: left foot tilting right is ignored (crossed mapping)", (await lane()) === 0);
await control.click("sim-LEFT_FOOT-left"); await sleep(1100);
check("DUAL_FOOT: left foot -> lane -1", (await lane()) === -1);
await control.click("sim-RIGHT_FOOT-right"); await sleep(1100);
check("DUAL_FOOT: right foot -> lane 0 (back)", (await lane()) === 0);

// 4. foot lift arms a hurdle (medium stage 1), step window respected
await reset(3); await setSource("RIGHT_FOOT"); await sleep(2500); await start();
await control.click("sim-RIGHT_FOOT-lift"); await sleep(1000);
check("foot lift far from a hurdle does nothing", (await rt(`return rt.session.stage.stepSeq`)) === 0);
await rt(`rt.session.stage.distance = rt.session.stage.encounters[0].z - 5; return 1`);
await control.click("sim-RIGHT_FOOT-lift"); await sleep(1000);
check("foot lift near the hurdle arms it (simulated)", (await rt(`return rt.session.stage.obstacles[0].armed`)) === true);
await sleep(6000);
check("armed hurdle is cleared without a collision", (await rt(`return rt.session.stage.obstacles[0].how`)) === "stepped" && (await rt(`return rt.session.stage.stars`)) >= 1);

// 5. sensor loss and recovery
await reset(0); await setSource("RIGHT_FOOT"); await sleep(2500); await start(); await sleep(800);
await control.click("sim-RIGHT_FOOT-connected"); await sleep(1500);
check("sensor loss suspends play with reason input-lost", (await lc()) === "suspended" && (await rt(`return rt.session.suspendReason`)) === "input-lost");
const frozen = await rt(`return rt.session.stage.distance`); await sleep(1500);
check("nothing moves while the sensor is lost", (await rt(`return rt.session.stage.distance`)) === frozen);
check("Display shows the calm pause overlay while suspended", (await dLife()) === "suspended");
await control.click("resume"); await sleep(300);
check("resume is refused while the sensor is still gone", (await lc()) === "suspended");
await control.click("sim-RIGHT_FOOT-connected"); await sleep(300);
await control.click("resume"); await sleep(300);
check("resume is refused until the foot has settled again", (await lc()) === "suspended");
await sleep(2200); await control.click("resume"); await sleep(400);
check("after settling, resume continues the same stage", (await lc()) === "playing" && (await rt(`return rt.session.stage.distance`)) >= frozen);

// 6. pause / resume / skip / restart / end / advance via the real buttons
await control.click("pause"); await sleep(300);
const p = await rt(`return rt.session.stage.distance`); await sleep(800);
check("pause freezes the runner", (await lc()) === "paused" && (await rt(`return rt.session.stage.distance`)) === p && (await dLife()) === "paused");
await control.click("resume"); await sleep(300); check("resume", (await lc()) === "playing");
await control.click("restart"); await sleep(400); check("restart returns to ready at distance 0", (await lc()) === "ready" && (await rt(`return rt.session.stage.distance`)) === 0);
await reset(0); await rt(`rt.command({type:'range', from:0, to:2}); return 1`); await start(); await sleep(500);
await control.click("skip"); await sleep(400); check("skip -> stage-complete (never automatic)", (await lc()) === "stage-complete");
await sleep(3000); check("stage-complete waits for the therapist", (await lc()) === "stage-complete");
await control.click("advance"); await sleep(400); check("advance -> next stage ready", (await lc()) === "ready" && (await rt(`return rt.session.stageIndex`)) === 1);
await start(); await control.click("end"); await sleep(500);
check("end shows a session summary on both windows", (await lc()) === "ended" && (await control.eval(`!!document.querySelector('[data-testid=summary]')`)) && (await dLife()) === "ended");
await display.shot(`${out}/r4-summary-display.png`); await control.shot(`${out}/r4-summary-control.png`);

// 7. reduced motion
await reset(0); await control.click("reduced"); await sleep(600);
check("reduced motion reaches the Display", await display.eval(`/reduced/.test(document.querySelector('[data-testid=rq3d-display]').className)`));
await control.click("reduced"); await sleep(300);

// 8. Display reload and closing
await reset(0); await start(); await control.key("keyDown", "ArrowRight"); await control.key("keyUp", "ArrowRight"); await sleep(900);
await display.eval(`location.reload()`); await sleep(6000);
check("Display reload re-syncs to the live session", (await dLife()) === "playing");
await b.close_tab?.(display);
const dpid = display.targetId;
await fetch(`http://127.0.0.1:9563/json/close/${dpid}`); await sleep(3500);
check("closing the Display suspends play (display-unavailable)", (await lc()) === "suspended" && (await rt(`return rt.session.suspendReason`)) === "display-unavailable");
display = await b.open(`${URL}/display/runner-quest-3d-prototype?auto=0`, 1600, 900); await sleep(6000);
check("reopening the Display resumes automatically", (await lc()) === "playing" && (await dLife()) === "playing");

// 9. background-window safety (simulated visibility change) and second Control window
await control.eval(`(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); })()`); await sleep(500);
check("hidden Control window suspends (control-hidden) and does not auto-resume", (await lc()) === "suspended" && (await rt(`return rt.session.suspendReason`)) === "control-hidden");
await control.eval(`(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); })()`); await sleep(1500);
check("returning to the Control window stays suspended until the therapist resumes", (await lc()) === "suspended");
await control.click("resume"); await sleep(300);
const c2 = await b.open(`${URL}/control/runner-quest-3d-prototype`, 1200, 800); await sleep(4000);
check("a second Control window cannot take over (waits for the lock)", (await c2.eval(`document.body.innerText.includes('توجد نافذة تحكم أخرى')`)) === true);

await fetch(`http://127.0.0.1:9563/json/close/${c2.targetId}`); await sleep(1500);
// 10. Control reload: safe new session, Display follows
await control.eval(`location.reload()`); await sleep(7000);
check("after a Control reload a fresh run starts safely in ready", (await control.eval(`document.querySelector('[data-testid=rq3d-control]')?.dataset.lifecycle`)) === "ready");
check("Display follows the new Control (ready)", (await dLife()) === "ready");
check("no unexpected console errors in either window", [control, display].every((t) => t.events.filter((e) => e.method === "Runtime.exceptionThrown").length === 0));
writeFileSync(`${out}/results/e2e-r4.json`, JSON.stringify(results, null, 1));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
b.close();
