// CROSS-DEVICE full session: iPad-like Control (touch) + laptop Display, Firebase emulators in between. All nine stages.
import { writeFileSync, mkdirSync } from "node:fs";
import { decideJs, launch, login, note, openIpad, rd, results, selectPatient, sleep } from "./crosslib.mjs";
const [out, BASE = "http://127.0.0.1:3230"] = process.argv.slice(2);
mkdirSync(`${out}/results`, { recursive: true });
const A = await launch(`${out}/ipad`, 9601), B = await launch(`${out}/laptop`, 9602);
const display = await B.open(`${BASE}/display`, 1920, 1080);
const control = await openIpad(A, `${BASE}/control/runner-quest-3d`);
await login(control); await selectPatient(control);
const rt = (js) => control.eval(`(() => { const rt = window.__RQ3D_RT; ${js} })()`);
const dLife = () => display.eval(`document.querySelector('[data-testid=rq3d-display]')?.dataset.lifecycle ?? null`);

note("Control mounts through the existing staff login on an iPad-like touch device", await control.eval("!!document.querySelector('[data-testid=rq3d-control]')"));
note("child name is prefilled from the selected patient", (await control.eval("document.querySelector('[data-testid=child-name]')?.value")) === "ليلى");
await sleep(2500);
note("Display (separate browser/profile) already shows the ready screen published by Control (name present)", (await dLife()) === "ready", String(await dLife()));
note("Control sees the Display as connected (existing presence)", (await control.text("display-status")).includes("متصلة"), await control.text("display-status"));
const touch = await control.eval(`(() => { const b = document.querySelector('[data-testid=touch-left]').getBoundingClientRect(); const c = document.querySelector('[data-testid=start]').getBoundingClientRect(); return { w: b.width, h: b.height, startH: c.height }; })()`);
note("touch pad buttons are large (>= 88 px tall, >= 120 px wide) and the start button >= 56 px", touch.h >= 88 && touch.w >= 120 && touch.startH >= 56, `${Math.round(touch.w)}x${Math.round(touch.h)}, start ${Math.round(touch.startH)}px`);
await control.shot(`${out}/cross-control-ready.png`);

await rt(`rt.command({type:'settings', patch:{speed:4.5, spacing:0.8}}); return 1`);
const rev0 = (await rd("liveSession"))?.revision ?? 0;
const startTaps = await control.tapThen("start", "window.__RQ3D_RT.session.lifecycle==='playing'"); await sleep(1800);
note("start by TOUCH starts the session; the Display on the other device follows", (await rt(`return rt.session.lifecycle`)) === "playing" && (await dLife()) === "playing", `taps needed: ${startTaps}`);
const live = await rd("liveSession");
note("live record uses its own game id, patient id and child name", live?.gameId === "runner-quest-3d" && live?.patientId === undefined && (await rd("liveSessionPrivate"))?.patientId === "patient-1" && live?.session?.config?.childFirstName === "ليلى" && live?.session?.engine === "rq3", `gameId=${live?.gameId}`);
note("live record carries no obstacle positions and stays small", !JSON.stringify(live).includes('"z":') && JSON.stringify(live).length < 3000, `${JSON.stringify(live).length} bytes`);
await display.eval(`(() => { window.__lat = []; let last = ''; new MutationObserver(() => { const v = document.querySelector('[data-testid=rq3d-display]')?.dataset.laneseq ?? ''; if (v !== last) { last = v; window.__lat.push(performance.timeOrigin + performance.now()); } }).observe(document.body, { attributes: true, attributeFilter: ['data-laneseq'], subtree: true, childList: true }); })()`);
await display.shot(`${out}/cross-display-playing.png`);

const log = { stages: [], sends: [] };
const t0 = Date.now(); const sends = [];
for (let guard = 0; guard < 100000 && Date.now() - t0 < 25 * 60 * 1000; guard++) {
  const lc = await rt(`return rt.session.lifecycle`);
  if (lc === "completed") break;
  if (lc === "stage-complete") {
    await sleep(1200);
    const idx = await rt(`return rt.session.results.length`);
    if (idx === 1 || idx === 5 || idx === 8) { await display.shot(`${out}/cross-display-stage${idx}-complete.png`); await control.shot(`${out}/cross-control-stage${idx}-complete.png`); }
    const c = await rt(`const r = rt.session.results[rt.session.results.length-1]; return {index:r.index, stars:r.stars, status:r.status, holds:r.holds}`);
    const d = await display.eval(`({ lc: document.querySelector('[data-testid=rq3d-display]')?.dataset.lifecycle, stars: document.querySelector('[data-testid=rq3d-display]')?.dataset.stars })`);
    log.stages.push({ ...c, display: d });
    await control.tapThen("advance", "window.__RQ3D_RT.session.lifecycle==='ready'"); await control.tapThen("start", "window.__RQ3D_RT.session.lifecycle==='playing'"); await sleep(400); continue;
  }
  if (lc === "playing") {
    const a = await control.eval(decideJs);
    if (a) { const wall = await control.eval(`performance.timeOrigin + performance.now()`); const ok = await control.tap(a); if (ok && a !== "touch-step") sends.push(wall); }
  }
  await sleep(100);
}
const revEnd = (await rd("liveSession"))?.revision ?? 0;
const secs = (Date.now() - t0) / 1000;
note("all nine stages completed from the iPad by touch", (await rt(`return rt.session.lifecycle`)) === "completed" && (await rt(`return rt.session.results.filter(r => r.status==='completed').length`)) === 9, `${(secs / 60).toFixed(1)} min`);
await sleep(3000);
note("Display shows the completion/summary", (await dLife()) === "completed");
note("every stage-complete moment matched on both devices", log.stages.every((s) => s.display.lc === "stage-complete" && Number(s.display.stars) === s.stars), JSON.stringify(log.stages.map((s) => `${s.index}:${s.stars}/${s.display.stars}`)));
const writesPerSec = (revEnd - rev0) / secs;
note("Firebase write rate is bounded (<= 3 writes/s on average)", writesPerSec <= 3, `${(revEnd - rev0)} revisions in ${secs.toFixed(0)} s = ${writesPerSec.toFixed(2)}/s`);
const lat = (await display.eval(`window.__lat`)); const d = sends.map((s) => { const e = lat.find((x) => x >= s - 5); return e === undefined ? null : e - s; }).filter((x) => x !== null && x >= 0 && x < 5000).sort((a, b) => a - b); // matched to the next Display change (the original index pairing misaligned across stage changes; see latency-cross.mjs)
note("touch -> other device latency measured", d.length > 10, d.length ? `n=${d.length} p50=${d[Math.floor(d.length / 2)].toFixed(0)}ms p95=${d[Math.floor(d.length * 0.95)].toFixed(0)}ms max=${d[d.length - 1].toFixed(0)}ms (local emulator; not real WAN)` : "no samples");
await control.shot(`${out}/cross-control-summary.png`); await display.shot(`${out}/cross-display-summary.png`);
await sleep(2500);
const hist = Object.values((await rd("sessions/patient-1")) ?? {}).filter((r) => r.gameId === "runner-quest-3d");
const sum = await rt(`return rt.session.summary`);
note("exactly ONE history record was saved for the patient, with its own game id and result version", hist.length === 1 && hist[0].resultVersion === 1, `records=${hist.length}`);
note("history record: 9 completed stages and stars equal the Control summary", hist[0] && hist[0].completedStageCount === 9 && hist[0].totalStars === sum.totalStars && Object.values(hist[0].stageResults ?? {}).length === 9, `stars ${hist[0]?.totalStars}/${sum.totalStars}`);
note("history record has no accuracy/incorrect fields", hist[0] && !("accuracy" in hist[0]) && !("totalIncorrect" in hist[0]));
note("no unexpected console exceptions", [control, display].every((t) => t.events.filter((e) => e.method === "Runtime.exceptionThrown").length === 0));
writeFileSync(`${out}/results/e2e-cross-full.json`, JSON.stringify({ results, log, writesPerSec, latencyMs: d.length ? { n: d.length, p50: d[Math.floor(d.length / 2)], p95: d[Math.floor(d.length * 0.95)], max: d[d.length - 1] } : null }, null, 1));
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
A.close(); B.close();
