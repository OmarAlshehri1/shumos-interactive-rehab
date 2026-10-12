// Visual review: real browser screenshots of the Display through the dev preview harness (local engine, no Firebase).
// usage: TG_CASES='[{"name":"s1","q":"stage=0&script=start,t:3200"}]' node shots.mjs <outDir>
// env: TG_URL (default http://127.0.0.1:3631), TG_GPU=1 for the real GPU (metal), TG_PROFILE (chrome profile dir, outside the repo)
import { launch, sleep } from "./cdplib.mjs";
const out = process.argv[2] ?? "../screenshots";
const base = process.env.TG_URL ?? "http://127.0.0.1:3631";
const cases = JSON.parse(process.env.TG_CASES ?? "[]");
const chrome = await launch(process.env.TG_PROFILE ?? "/tmp/tg-chrome-profile", 9481, process.env.TG_GPU ? ["--use-angle=metal"] : []);
for (const c of cases) {
  const t = await chrome.open(`${base}/dev/turn-and-go-preview?${c.q}`, c.w ?? 1600, c.h ?? 900);
  await sleep(c.wait ?? 6000);
  if (c.js) { await t.eval(c.js); await sleep(c.wait2 ?? 1500); }
  const m = await t.eval(`document.querySelector('canvas')?.dataset.metrics ?? null`);
  const errs = t.events.filter((e) => e.method === "Runtime.exceptionThrown" || (e.method === "Runtime.consoleAPICalled" && e.params.type === "error")).map((e) => JSON.stringify(e.params).slice(0, 400));
  await t.shot(`${out}/${c.name}.png`);
  console.log(c.name, m, errs.length ? errs.slice(0, 3) : "");
  await fetch(`http://127.0.0.1:9481/json/close/${t.targetId}`);
}
chrome.close();
