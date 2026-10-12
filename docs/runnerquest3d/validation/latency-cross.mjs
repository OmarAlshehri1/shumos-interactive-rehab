// Touch tap on the iPad-like Control device -> visible state change on the separate Display device, through the Firebase emulator.
import { mkdirSync, writeFileSync } from "node:fs";
import { launch, login, openIpad, selectPatient, sleep } from "./crosslib.mjs";
const [out, BASE = "http://127.0.0.1:3230"] = process.argv.slice(2);
mkdirSync(`${out}/results`, { recursive: true });
const A = await launch(`${out}/ipad`, 9606), B = await launch(`${out}/laptop`, 9607);
const display = await B.open(`${BASE}/display`, 1920, 1080);
const control = await openIpad(A, `${BASE}/control/runner-quest-3d`);
await login(control); await selectPatient(control); await sleep(2500);
await control.eval(`(() => { const rt = window.__RQ3D_RT; rt.command({type:'range', from:0, to:0}); rt.command({type:'settings', patch:{speed:1.0}}); })()`);
await control.tapThen("start", "window.__RQ3D_RT.session.lifecycle==='playing'"); await sleep(1500);
await display.eval(`(() => { window.__lat = []; let last = ''; new MutationObserver(() => { const v = document.querySelector('[data-testid=rq3d-display]')?.dataset.laneseq ?? ''; if (v !== last) { last = v; window.__lat.push(performance.timeOrigin + performance.now()); } }).observe(document.body, { attributes: true, attributeFilter: ['data-laneseq'], subtree: true, childList: true }); })()`);
const sends = [];
for (let i = 0; i < 40; i++) {
  const wall = await control.eval(`performance.timeOrigin + performance.now()`);
  const r = await control.tap(i % 2 === 0 ? "touch-left" : "touch-right");
  if (r && !r.disabled && !r.blocked) sends.push(wall);
  await sleep(900);
}
await sleep(1500);
const lat = await display.eval(`window.__lat`);
const d = sends.map((s) => { const e = lat.find((x) => x >= s - 5); return e === undefined ? null : e - s; }).filter((x) => x !== null && x >= 0 && x < 5000).sort((a, b) => a - b);
const res = { taps: sends.length, displayChanges: lat.length, matched: d.length, p50: d[Math.floor(d.length / 2)], p95: d[Math.floor(d.length * 0.95)], max: d[d.length - 1], min: d[0], note: "same machine, Firebase EMULATOR; not a real WAN" };
writeFileSync(`${out}/results/latency-cross.json`, JSON.stringify(res, null, 1));
console.log(JSON.stringify(res));
A.close(); B.close(); process.exit(0);
