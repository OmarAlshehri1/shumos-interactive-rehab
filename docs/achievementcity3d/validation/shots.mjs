// Visual review: real browser screenshots of the Display through the dev preview harness (local engine, no Firebase).
// usage: AC_CASES='[{"name":"l1","q":"level=0&script=start,c,c"}]' node shots.mjs <outDir>
// env: AC_URL (default http://127.0.0.1:3742), AC_GPU=1 for the real GPU (metal), AC_PROFILE (chrome profile dir, outside the repo)
import { launch, sleep } from "./cdplib.mjs";
const out = process.argv[2] ?? "../screenshots";
const base = process.env.AC_URL ?? "http://127.0.0.1:3742";
const cases = JSON.parse(process.env.AC_CASES ?? "[]");
const chrome = await launch(process.env.AC_PROFILE ?? "/tmp/ac-chrome-profile", 9681, process.env.AC_GPU ? ["--use-angle=metal"] : []);
for (const c of cases) {
  const t = await chrome.open(`${base}/dev/achievement-city-preview?${c.q}`, c.w ?? 1920, c.h ?? 1080);
  await sleep(c.wait ?? 7000);
  if (c.js) { await t.eval(c.js); await sleep(c.wait2 ?? 3000); }
  const m = await t.eval(`document.querySelector('canvas')?.dataset.metrics ?? null`);
  const pr = await t.eval(`document.querySelector('canvas')?.dataset.progress ?? null`);
  const errs = t.events.filter((e) => e.method === "Runtime.exceptionThrown" || (e.method === "Runtime.consoleAPICalled" && e.params.type === "error")).map((e) => JSON.stringify(e.params).slice(0, 500));
  await t.shot(`${out}/${c.name}.png`);
  console.log(c.name, m, c.progress ? pr : "", errs.length ? errs.slice(0, 3) : "");
  await fetch(`http://127.0.0.1:9681/json/close/${t.targetId}`);
}
chrome.close();
