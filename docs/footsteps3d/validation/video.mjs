// Records a real gameplay video of the Display (frames captured from a real browser, stitched with ffmpeg). Emulators only.
import { launch, login, openIpad, selectPatient, sleep, until } from "./crosslib.mjs";
import { seed } from "./seed.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const [out, BASE = "http://127.0.0.1:3417"] = process.argv.slice(2);
mkdirSync(`${out}/frames`, { recursive: true });
await seed();
const A = await launch(`${out}/ipad`, 9951), B = await launch(`${out}/laptop`, 9952);
const setSelect = (t, id, v) => t.eval(`(() => { const e = document.getElementById(${JSON.stringify(id)}); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e, ${JSON.stringify(v)}); e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
let recording = false, n = 0;
async function record(display) {
  recording = true;
  const t0 = Date.now();
  while (recording) {
    const r = await display.send("Page.captureScreenshot", { format: "jpeg", quality: 72 });
    writeFileSync(`${out}/frames/f${String(n++).padStart(5, "0")}.jpg`, Buffer.from(r.data, "base64"));
    const wait = 100 - ((Date.now() - t0) % 100);
    await sleep(Math.min(wait, 60));
  }
  return (Date.now() - t0) / 1000;
}
try {
  const display = await B.open(`${BASE}/display`, 1280, 720);
  const ctl = await openIpad(A, `${BASE}/control`);
  await login(ctl); await selectPatient(ctl); await sleep(3000);
  await ctl.eval(`location.href='/control/follow-the-footsteps'`);
  await until(() => ctl.eval(`!!document.querySelector('[data-testid=foot-control]')`), 90000, 500);
  await until(() => display.eval(`!!document.querySelector('canvas')`), 60000, 500);
  await sleep(2500);
  const rec = record(display);
  const play = async (steps, gap = 3200, assistAt = -1) => {
    for (let i = 0; i < steps; i++) {
      await sleep(gap);
      if (i === assistAt) await ctl.tapText("خطوة بمساعدة"); else await ctl.tapSel("[data-testid=confirm]");
    }
  };
  await sleep(2500);                                   // ready card, then start
  await ctl.tapText("ابدأ المرحلة"); await sleep(1200);
  await play(4, 3200, 2);                               // level 1: sunny garden, four stones
  await sleep(2800);
  await ctl.tapText("المرحلة التالية"); await sleep(600);
  await setSelect(ctl, "stage", "3"); await sleep(800); // level 2: riverside forest, alternating feet
  await ctl.tapText("ابدأ المرحلة"); await sleep(1500);
  await play(3, 3000);
  await ctl.tapText("تجاوز المرحلة"); await sleep(1500);
  await setSelect(ctl, "stage", "7"); await sleep(800); // level 3: twilight forest, two-step memory
  await ctl.tapText("ابدأ المرحلة"); await sleep(1500);
  await sleep(6500);                                    // the pair preview
  await play(2, 2600);
  await sleep(3000);
  recording = false;
  const secs = await rec;
  const frames = n;
  const fps = Math.max(4, Math.round(frames / secs));
  const r = spawnSync("ffmpeg", ["-y", "-framerate", String(fps), "-i", `${out}/frames/f%05d.jpg`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", "-movflags", "+faststart", `${out}/gameplay.mp4`], { encoding: "utf8" });
  console.log("frames", frames, "seconds", secs.toFixed(1), "fps", fps, "ffmpeg", r.status);
} finally { recording = false; A.close(); B.close(); }
process.exit(0);
