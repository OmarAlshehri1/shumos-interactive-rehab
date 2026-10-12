// Visual review: real browser screenshots of the Display (dev preview harness, local engine, no Firebase).
// usage: node shots.mjs <outDir> [port] ; env RS_URL overrides the base URL
import { launch, sleep } from "./cdplib.mjs";
const out = process.argv[2] ?? "../screenshots";
const base = process.env.RS_URL ?? "http://127.0.0.1:3620";
const cases = JSON.parse(process.env.RS_CASES ?? "[]");
const chrome = await launch(process.env.RS_PROFILE ?? "/tmp/rs-chrome-profile", 9461, process.env.RS_GPU ? ["--use-angle=metal"] : []);
for (const c of cases) {
  const t = await chrome.open(`${base}/dev/rhythm-steps-preview?${c.q}`, c.w ?? 1600, c.h ?? 900);
  await sleep(c.wait ?? 7000);
  if (c.js) { await t.eval(c.js); await sleep(c.wait2 ?? 1500); }
  const m = await t.eval(`document.querySelector('canvas')?.dataset.metrics ?? null`);
  const errs = t.events.filter((e) => e.method === "Runtime.exceptionThrown" || (e.method === "Runtime.consoleAPICalled" && e.params.type === "error")).map((e) => JSON.stringify(e.params).slice(0, 300));
  await t.shot(`${out}/${c.name}.png`);
  console.log(c.name, m, errs.length ? errs.slice(0, 3) : "");
  await fetch(`http://127.0.0.1:9461/json/close/${t.targetId}`);
}
chrome.close();
