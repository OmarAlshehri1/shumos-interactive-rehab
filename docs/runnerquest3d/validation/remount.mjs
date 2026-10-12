import { launch, sleep } from "./cdplib.mjs";
const out = process.argv[2];
const b = await launch(out, 9559, ["--js-flags=--expose-gc", "--enable-precise-memory-info"]);
const t = await b.open("http://127.0.0.1:3210/display/runner-quest-3d-prototype?harness=remount&cycles=30");
for (let i = 0; i < 120; i++) { await sleep(1000); if (await t.eval("window.__RQ3D_HARNESS?.done === true")) break; }
const h = await t.eval("JSON.stringify(window.__RQ3D_HARNESS)");
const warnings = t.events.filter((e) => e.method === "Runtime.consoleAPICalled" && /context|WebGL/i.test(JSON.stringify(e.params.args))).length;
const j = JSON.parse(h);
console.log(t.events.filter((e) => e.method === 'Runtime.consoleAPICalled' && /context|WebGL/i.test(JSON.stringify(e.params.args))).slice(0,3).map((e)=>JSON.stringify(e.params.args).slice(0,300)).join('\n'));
const first = j.samples[2], last = j.samples[j.samples.length - 1];
console.log(JSON.stringify({ cycles: j.samples.length, first, last, webglWarnings: warnings }, null, 1));
import { writeFileSync, mkdirSync } from "node:fs";
mkdirSync(`${out}/results`, { recursive: true }); writeFileSync(`${out}/results/remount.json`, JSON.stringify({ samples: j.samples, webglWarnings: warnings }, null, 1));
b.close();
