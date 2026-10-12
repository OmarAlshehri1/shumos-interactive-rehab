// Records a real gameplay video of the Display (frames captured from a real browser, stitched with ffmpeg). Emulators only.
import { launch, login, openIpad, selectPatient, sleep, until } from "../../footsteps3d/validation/crosslib.mjs";
import { seed } from "../../footsteps3d/validation/seed.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const [out, BASE = "http://localhost:3517"] = process.argv.slice(2);
mkdirSync(`${out}/frames`, { recursive: true });
await seed();
const A = await launch(`${out}/ipad`, 9951), B = await launch(`${out}/laptop`, 9952);
const setSel = (t, sel, v) => t.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e, ${JSON.stringify(String(v))}); e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
let recording = false, n = 0;
async function record(display) {
  recording = true;
  const t0 = Date.now();
  while (recording) {
    const r = await display.send("Page.captureScreenshot", { format: "jpeg", quality: 72 });
    writeFileSync(`${out}/frames/f${String(n++).padStart(5, "0")}.jpg`, Buffer.from(r.data, "base64"));
    await sleep(40);
  }
  return (Date.now() - t0) / 1000;
}
try {
  const display = await B.open(`${BASE}/display`, 1280, 720);
  const ctl = await openIpad(A, `${BASE}/control`);
  await login(ctl); await selectPatient(ctl); await sleep(3000);
  await ctl.eval(`location.href='/control/color-chase'`);
  await until(() => ctl.eval(`!!document.querySelector('[data-testid=cc-control]')`), 90000, 500);
  await until(() => display.eval(`!!document.querySelector('canvas')`), 60000, 500);
  await sleep(2500);
  const rec = record(display);
  const play = async (steps, gap = 3200, assistAt = -1) => {
    for (let i = 0; i < steps; i++) {
      await sleep(gap);
      const t = await ctl.eval(`document.querySelector('[data-testid=cc-control]').dataset.target`);
      if (i === assistAt) await ctl.tapSel("[data-testid=assist]");
      else { await ctl.tapSel(`[data-testid=zone-${t}]`); await ctl.tapSel("[data-testid=confirm]"); }
    }
  };
  await sleep(2500);
  await ctl.tapSel("[data-testid=start]"); await sleep(1500);
  await play(4, 3400, 2);                                  // level 1 stage 1: two colors, the forgotten garden
  await sleep(3500);
  await ctl.tapSel("[data-testid=next]"); await sleep(800);
  await setSel(ctl, "[data-testid=stage-select]", 3); await sleep(900); // level 2: the sleeping fountain
  await ctl.tapSel("[data-testid=start]"); await sleep(1500);
  await play(4, 3200);
  await ctl.tapSel("[data-testid=skip-stage]"); await sleep(1500);
  await setSel(ctl, "[data-testid=stage-select]", 6); await sleep(900); // level 3: sanctuary, positions change
  await ctl.tapSel("[data-testid=start]"); await sleep(1500);
  await play(5, 3200);
  await sleep(3000);
  recording = false;
  const secs = await rec;
  const fps = Math.max(4, Math.round(n / secs));
  const r = spawnSync("ffmpeg", ["-y", "-framerate", String(fps), "-i", `${out}/frames/f%05d.jpg`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", "-movflags", "+faststart", `${out}/gameplay.mp4`], { encoding: "utf8" });
  console.log("frames", n, "seconds", secs.toFixed(1), "fps", fps, "ffmpeg", r.status);
} finally { recording = false; A.close(); B.close(); }
process.exit(0);
