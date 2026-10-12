// Records the real child Display (CDP screencast) while the therapist's Control (separate Chrome process, iPad emulation) plays FLOOR stage 5.
//   node video.mjs <outDir>   then: ffmpeg -f concat -safe 0 -i list.txt -vsync vfr -pix_fmt yuv420p out.mp4
import { mkdirSync, writeFileSync } from "node:fs";
import { BASE, launch, login, openIpad, seed, selectPatient, sleep } from "./lib.mjs";
const [OUT] = process.argv.slice(2);
mkdirSync(`${OUT}/frames`, { recursive: true });
await seed();
const A = await launch(`${OUT}/ipad`, 9850), B = await launch(`${OUT}/laptop`, 9851);
const display = await B.open(`${BASE}/display`, 1280, 720);
const control = await openIpad(A, `${BASE}/control/runner-quest-3d`);
await login(control); await selectPatient(control);
const rt = (js) => control.eval(`(() => { const rt = window.__RQ3D_RT; ${js} })()`);
await control.tap("projection-FLOOR"); await sleep(800);
await control.tapThen("range-single", "true"); await control.tapThen("stage-4", "window.__RQ3D_RT.session.startIndex===4");
await sleep(1500);
const frames = []; let n = 0;
display.ws.addEventListener("message", (m) => { const d = JSON.parse(m.data); if (d.method === "Page.screencastFrame") { const i = n++; writeFileSync(`${OUT}/frames/f${String(i).padStart(5, "0")}.jpg`, Buffer.from(d.params.data, "base64")); frames.push(d.params.metadata.timestamp); display.send("Page.screencastFrameAck", { sessionId: d.params.sessionId }); } });
await display.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
await sleep(2500);
await control.tapThen("start", "window.__RQ3D_RT.session.lifecycle==='playing'");
await sleep(2500);
while ((await rt(`return rt.session.lifecycle`)) === "playing") {
  const o = await rt(`const f = rt.session.stage.floor; const o = f.objectives[f.current]; return o ? { kind: o.kind, target: o.target, cur: f.current } : null`);
  if (!o) break;
  if (o.cur === 3) { await control.tap("floor-repeat"); await sleep(2500); } // replay the cue
  if (o.cur === 5) { await control.tap("floor-assist"); await sleep(2600); continue; } // assisted objective
  if (o.kind === "region") await control.tap(`floor-region-${o.target}`); else await control.tap("floor-step");
  await sleep(2600);
}
await sleep(4000);
await display.send("Page.stopScreencast"); await sleep(500);
let list = "";
for (let k = 0; k < frames.length; k++) { const dur = k + 1 < frames.length ? Math.max(0.001, frames[k + 1] - frames[k]) : 0.04; list += `file 'frames/f${String(k).padStart(5, "0")}.jpg'\nduration ${dur.toFixed(4)}\n`; }
writeFileSync(`${OUT}/list.txt`, list);
console.log(`frames=${frames.length} span=${(frames[frames.length - 1] - frames[0]).toFixed(1)}s`);
A.close(); B.close(); process.exit(0);
