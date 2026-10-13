// Measures the Display on THIS machine's real GPU (Chrome/ANGLE Metal). Reports fps, CPU ms per frame in draw(), draw calls, triangles.
import { launch, sleep } from "./cdplib.mjs";
const chrome = await launch("/tmp/ac-perf", 9683, ["--use-angle=metal"]);
const out = [];
for (const [name, q, w, h] of [["L1 empty 1080p", "level=0&target=10&script=start", 1920, 1080], ["L1 complete 1080p", "level=0&target=3&script=start,c,c,c", 1920, 1080], ["L2 complete 1080p", "level=1&target=3&script=start,c,c,c", 1920, 1080], ["L3 complete 1080p (finale, fireworks)", "level=2&target=3&script=start,c,c,c", 1920, 1080], ["L3 complete 4K", "level=2&target=3&script=start,c,c,c", 3840, 2160], ["L3 complete 1080p quality=low", "level=2&target=3&script=start,c,c,c&cfg=%7B%22quality%22%3A%22low%22%7D", 1920, 1080], ["L3 complete 1080p quality=high (bloom, 4096 shadows)", "level=2&target=3&script=start,c,c,c&cfg=%7B%22quality%22%3A%22high%22%7D", 1920, 1080]]) {
  const t = await chrome.open(`http://127.0.0.1:3742/dev/achievement-city-preview?${q}`, w, h);
  await sleep(20000);
  const m = [];
  for (let i = 0; i < 6; i++) { m.push(JSON.parse(await t.eval(`document.querySelector('canvas').dataset.metrics`))); await sleep(1100); }
  const avg = (k) => Math.round((m.reduce((a, b) => a + b[k], 0) / m.length) * 100) / 100;
  out.push({ name, fps: avg("fps"), frameMs: avg("frameMs"), calls: m.at(-1).calls, triangles: m.at(-1).triangles, pixelRatio: m.at(-1).pixelRatio });
  console.log(JSON.stringify(out.at(-1)));
  await fetch(`http://127.0.0.1:9683/json/close/${t.targetId}`);
}
chrome.close();
import("node:fs").then((f) => f.writeFileSync("../evidence/performance.json", JSON.stringify(out, null, 2)));
