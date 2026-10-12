
import { launch, sleep } from "./cdplib.mjs";
import { writeFileSync } from "node:fs";
const OUT = process.argv[2]; const BASE = process.env.BASE ?? "http://localhost:3102"; const PORT = Number(process.env.CDP ?? 9490);
const results = []; const note = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); };
const b = await launch(OUT, PORT);
const display = await b.open(`${BASE}/display`);
const control = await b.open(`${BASE}/control/balloon-quest`);
for (const t of [display, control]) await t.send("Emulation.setFocusEmulationEnabled", { enabled: true });
await sleep(9000);
const txt = (id) => control.text(id); const life = () => txt("lifecycle");
note("local mode (no Firebase): no staff login, the redesigned Control mounts", await control.eval("!!document.querySelector('[data-testid=bq-control]') && !document.querySelector('input[type=email]')"));
note("no child-name field is required without a live record", !(await control.eval("!!document.querySelector('[data-testid=child-name]')")));
for (let i = 0; i < 12 && !((await txt("display-status")) ?? "").includes("متصلة"); i++) await sleep(1000);
note("Display window found over the local channel", ((await txt("display-status")) ?? "").includes("متصلة"), await txt("display-status"));
note("Display shows the redesigned ready screen (not the old garden demo)", (await display.eval("document.body.innerText")).includes("استعد") && !(await display.eval("!!document.querySelector('.bq-leaf, .bq-bird')")));
await control.click("start"); await sleep(1500);
note("session starts", (await life()) === "قيد اللعب", await life());
const tap = () => control.eval(`(() => { const stage = document.querySelector('[data-testid=control-preview] [data-testid=bq-stage]'); const t = stage.dataset.target; for (const l of stage.querySelectorAll('.bq3g-lane[data-color="'+t+'"]')) { const bt = l.querySelector('.bq3-balloon'); if (!bt.classList.contains('is-popped')) { bt.click(); return true; } } return false; })()`);
for (let i = 0; i < 4; i++) { await tap(); await sleep(500); }
const dg = await display.eval("document.querySelector('[data-testid=bq-stage]')?.dataset.goalDone");
note("a therapist tap scores and the local Display follows", (await txt("goal")).includes("٣") && dg === "3", `${await txt("goal")} / display ${dg}`);
await control.click("end"); await sleep(500);
await control.eval(`(() => { const sheet = document.querySelector('[role=presentation]'); const c = [...sheet.querySelectorAll('button')].find(x => /تأكيد|إنهاء/.test(x.textContent)); c && c.click(); })()`); await sleep(1500);
note("ending works through the existing reason sheet; Display shows a gentle thank-you", (await life()) === "أُنهيت الجلسة" && (await display.eval("document.body.innerText")).includes("شكرًا لك"), await life());
await display.shot(`${OUT}/local-display.png`); await control.shot(`${OUT}/local-control.png`);
writeFileSync(`${OUT}/local-results.json`, JSON.stringify(results, null, 2));
console.log("LOCAL DONE", results.filter((r) => r.ok).length + "/" + results.length);
b.close(); process.exit(0);
