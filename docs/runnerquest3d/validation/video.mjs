// Records the real child Display (CDP screencast) while a bot plays Medium stage 2 through Control with real key events.
import { launch, sleep } from "./cdplib.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
const [OUT, stageArg = "4", speedArg = "3.2"] = process.argv.slice(2);
mkdirSync(`${OUT}/frames`, { recursive: true });
const b = await launch(OUT, 9568);
const display = await b.open("http://127.0.0.1:3210/display/runner-quest-3d-prototype?auto=0", 1280, 720);
const control = await b.open("http://127.0.0.1:3210/control/runner-quest-3d-prototype", 1400, 900);
await sleep(7000);
const rt = (js) => control.eval(`(() => { const rt = window.__RQ3D_RT; ${js} })()`);
await rt(`rt.command({type:'settings', patch:{speed:${speedArg}, spacing:0.9}}); rt.command({type:'range', from:${stageArg}, to:${stageArg}}); return 1`);
const decide = `(() => { const rt = window.__RQ3D_RT; const s = rt.session; const st = s.stage; if (!st || s.lifecycle !== 'playing') return null;
 const i = st.encounters.findIndex((e, k) => !st.obstacles[k].resolved && e.z >= st.distance && (e.kind==='side'||e.kind==='hurdle'||e.kind==='gate'));
 if (i < 0) return null; const e = st.encounters[i]; const ahead = e.z - st.distance; if (ahead > 14) return null;
 if (e.kind === 'hurdle') { if (e.lanes.includes(st.lane) && !st.obstacles[i].armed) return ahead <= 6.5 ? 'step' : null; return null; }
 const free = [-1,0,1].filter(l => !e.lanes.includes(l)); if (free.includes(st.lane)) return null;
 const goal = free.reduce((a,b)=> Math.abs(a-st.lane) <= Math.abs(b-st.lane) ? a : b); return goal < st.lane ? 'left' : 'right'; })()`;
const KEY = { left: "ArrowLeft", right: "ArrowRight", step: " " };
const frames = []; let n = 0;
display.ws.addEventListener("message", (m) => { const d = JSON.parse(m.data); if (d.method === "Page.screencastFrame") { const i = n++; writeFileSync(`${OUT}/frames/f${String(i).padStart(5, "0")}.jpg`, Buffer.from(d.params.data, "base64")); frames.push(d.params.metadata.timestamp); display.send("Page.screencastFrameAck", { sessionId: d.params.sessionId }); } });
await display.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
await control.bringToFront();
await sleep(1500);
await control.click("start");
const t0 = Date.now(); let slowDone = false;
while (Date.now() - t0 < 150000) {
  const lc = await control.eval(`document.querySelector('[data-testid=rq3d-control]')?.dataset.lifecycle`);
  if (lc === "stage-complete" || lc === "completed") { await sleep(3500); break; }
  const a = lc === "playing" ? await control.eval(decide) : null;
  if (a) {
    if (!slowDone && Date.now() - t0 > 20000 && (await rt(`return rt.session.stage.holding`))) { slowDone = true; await sleep(3500); } // a slow child: the runner simply waits
    await control.key("keyDown", KEY[a]); await control.key("keyUp", KEY[a]);
  }
  await sleep(90);
}
await display.send("Page.stopScreencast");
await sleep(500);
let list = "";
for (let i = 0; i < frames.length; i++) { const dur = i + 1 < frames.length ? Math.max(0.001, frames[i + 1] - frames[i]) : 0.04; list += `file 'frames/f${String(i).padStart(5, "0")}.jpg'\nduration ${dur.toFixed(4)}\n`; }
writeFileSync(`${OUT}/list.txt`, list);
console.log(`frames=${frames.length} span=${(frames[frames.length - 1] - frames[0]).toFixed(1)}s slowChildDemonstrated=${slowDone}`);
b.close(); process.exit(0);
