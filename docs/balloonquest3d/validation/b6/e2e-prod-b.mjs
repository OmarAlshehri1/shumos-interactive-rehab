
import { launch, sleep } from "./cdplib.mjs";
import { writeFileSync } from "node:fs";
const OUT = process.argv[2]; const BASE = process.env.BASE ?? "http://localhost:3100"; const PORT = Number(process.env.CDP ?? 9462);
const NS = "demo-bq3-default-rtdb", DB = "http://127.0.0.1:9000"; const owner = { Authorization: "Bearer owner" };
const rd = async (p) => (await fetch(`${DB}/${p}.json?ns=${NS}`, { headers: owner })).json();
const results = []; const note = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); };
const b = await launch(OUT, PORT);
let display = await b.open(`${BASE}/display`);
const control = await b.open(`${BASE}/control/balloon-quest`);
for (const t of [display, control]) await t.send("Emulation.setFocusEmulationEnabled", { enabled: true });
await sleep(8000);
if (await control.eval("!!document.querySelector('input[type=email]')")) { await control.eval(`(() => { const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, v); el.dispatchEvent(new Event('input',{bubbles:true})); }; set(document.querySelector('input[type=email]'), 'therapist@example.test'); set(document.querySelector('input[type=password]'), 'password123'); document.querySelector('button[type=submit]').click(); })()`); await sleep(6000); }
await control.eval(`sessionStorage.setItem('shumos.control.selectedPatient', JSON.stringify({ patientId: 'patient-1', patientNumber: '1001', firstName: 'ليلى' }))`);
await control.send("Page.reload"); await sleep(7000);
const txt = (id) => control.text(id); const life = () => txt("lifecycle");
const dispJs = `(() => { const stage = document.querySelector('[data-testid=bq-stage]'); if (!stage) return null; const sr = stage.getBoundingClientRect(); return { life: stage.dataset.lifecycle, layout: stage.dataset.layout, motion: stage.dataset.motion, goal: stage.dataset.goalDone, text: document.body.innerText.slice(0, 90), floorGoal: !!document.querySelector('.bq3g-floor-goal') && getComputedStyle(document.querySelector('.bq3g-floor-goal')).display, lanes: [...stage.querySelectorAll('.bq3g-lane')].map(l => ({ id: l.dataset.balloonId, x: l.getBoundingClientRect().left })) } })()`;
const tap = () => control.eval(`(() => { const stage = document.querySelector('[data-testid=control-preview] [data-testid=bq-stage]'); const sr = stage.getBoundingClientRect(); const t = stage.dataset.target; for (const l of stage.querySelectorAll('.bq3g-lane[data-color="'+t+'"]')) { const bt = l.querySelector('.bq3-balloon'); if (bt.classList.contains('is-popped')) continue; const r = bt.getBoundingClientRect(); const cy = (r.top + r.height * 0.39 - sr.top) / sr.height, cx = (r.left + r.width/2 - sr.left)/sr.width; if (cy > 0.06 && cy < 0.94 && cx > 0.05 && cx < 0.95) { bt.click(); return true; } } return false; })()`);
const goal = () => txt("goal");
const popOne = async () => { for (let i = 0; i < 40; i++) { const g0 = await goal(); if (await tap()) { await sleep(400); if ((await goal()) !== g0) return true; } await sleep(300); } return false; };

// ---- floor layout through the production flow, pause / resume / restart / skip
await control.select("sel-difficulty", "MEDIUM"); await control.select("sel-layout", "FLOOR"); await sleep(400);
await control.click("start"); await sleep(5000);
{ const d = await display.eval(dispJs); note("FLOOR layout reaches the Display over Firebase (goal bar in the far band)", d?.layout === "FLOOR" && d?.floorGoal === "flex", JSON.stringify({ layout: d?.layout, floorGoal: d?.floorGoal })); }
await display.shot(`${OUT}/prod-display-floor.png`);
note("a correct therapist tap scores and the Display follows", await popOne() && (await display.eval(dispJs)).goal === "1", `${await goal()} / display ${(await display.eval(dispJs)).goal}`);
await control.click("pause"); await sleep(1500);
note("pause reaches the Display (calm message)", (await display.eval(dispJs))?.text.includes("استراحة قصيرة"), (await display.eval(dispJs))?.text.slice(0, 40));
await control.click("resume"); await sleep(1500);
note("resume continues play", (await life()) === "قيد اللعب");
await control.click("restart"); await sleep(1500);
note("restart resets progress (Control and Display)", (await goal()).startsWith("٠") && (await display.eval(dispJs)).goal === "0");
await control.click("skip"); await sleep(1500);
note("skip moves to the next stage", (await txt("level-stage")).includes("٢"), await txt("level-stage"));

// ---- reduced motion through Firebase
await control.click("chk-reduced"); await control.click("restart"); await sleep(2500);
{ const d = await display.eval(dispJs); note("reduced motion reaches the Display (stationary layout)", d?.motion === "static", `motion=${d?.motion}`); }
await control.click("chk-reduced"); await control.click("restart"); await sleep(1200);

// ---- Display reload recovers
const before = (await display.eval(dispJs)).lanes.length;
await display.send("Page.reload"); await sleep(7000);
{ const d = await display.eval(dispJs); note("Display reload recovers the live session from Firebase", d?.life === "playing" && d.lanes.length >= 4, `balloons ${before} -> ${d?.lanes.length}`); }

// ---- end session with the existing reason sheet
await control.click("end"); await sleep(600);
note("ending opens the existing early-end reason sheet", await control.eval("document.body.innerText.includes('اكتفى الطفل')"));
await control.eval(`(() => { const btn = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'تعب الطفل'); btn && btn.click(); })()`); await sleep(300);
await control.eval(`(() => { const sheet = document.querySelector('[role=presentation]'); const btns = [...sheet.querySelectorAll('button')]; const confirm = btns.find(x => /تأكيد|إنهاء/.test(x.textContent)); confirm && confirm.click(); })()`); await sleep(2500);
note("session ended", (await life()) === "أُنهيت الجلسة", await life());
note("Display shows a gentle thank-you", (await display.eval("document.body.innerText")).includes("شكرًا لك"));
await sleep(2500);
const hist = Object.values((await rd("sessions/patient-1")) ?? {});
const ended = hist.find((h) => h.endReason);
note("history gained a record carrying the therapist's end reason", !!ended && ended.endReason === "CHILD_TIRED" && ended.stageResults.every((r) => r.engine === "bq3"), JSON.stringify({ n: hist.length, endReason: ended?.endReason, skipped: ended?.skippedStageCount }));
note("history never stores a derived accuracy for the new game", hist.filter((h) => h.stageResults?.some((r) => r.engine === "bq3")).every((h) => h.accuracy === undefined));

// ---- leaving mid-session ends it cleanly and clears the live record
await control.click("new-run"); await sleep(600);
await control.click("start"); await sleep(3000);
await control.eval("document.querySelector('a[href=\"/control/activities\"]').click()"); await sleep(6000);
{ const live = await rd("liveSession"); note("navigating away mid-session clears the live record (Display returns to the waiting world)", live === null || live === undefined, String(live && live.gameId)); }
{ const t = await display.eval("document.body.innerText"); note("Display is back at the waiting world", t.includes("بانتظار اختيار النشاط")); }
const hist2 = Object.values((await rd("sessions/patient-1")) ?? {});
note("the interrupted session was saved as ended early", hist2.length === hist.length + 1, `${hist.length} -> ${hist2.length}`);

// ---- library + rollback
const cards = await control.eval(`[...document.querySelectorAll('a')].filter(a => a.textContent.includes('مغامرة البالونات')).map(a => a.getAttribute('href'))`);
note("game library lists exactly one Balloon Quest entry pointing at /control/balloon-quest", cards.length === 1 && cards[0] === "/control/balloon-quest", JSON.stringify(cards));
await control.shot(`${OUT}/prod-library.png`);
await control.eval("location.href = '/control/balloon-quest-legacy'"); await sleep(7000);
note("the legacy implementation remains reachable at /control/balloon-quest-legacy (rollback)", await control.eval("!!document.querySelector('[data-controller-phase]') && !document.querySelector('[data-testid=bq-control]')"));
await control.eval(`(() => { const i = document.querySelector('input[placeholder="اكتب الاسم الأول"]'); if (i && !i.value) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i, 'ليلى'); i.dispatchEvent(new Event('input',{bubbles:true})); } })()`); await sleep(500);
await control.shot(`${OUT}/prod-legacy-setup.png`);
await control.eval(`(() => { const b = [...document.querySelectorAll('button')].find(x => /متابعة|ابدأ|تأكيد/.test(x.textContent) && !x.disabled); b && b.click(); })()`); await sleep(5000);
{ const t = await display.eval("document.body.innerText"); const hasNew = await display.eval("!!document.querySelector('[data-testid=bq-stage]')"); const legacyGarden = await display.eval("!!document.querySelector('.bq-leaf, .bq-bird, .bq-cloud')"); note("a legacy session started from the rollback route still renders on the Display with the legacy module", !hasNew && (t.includes("مغامرة البالونات") || legacyGarden), (t || "").slice(0, 70).replace(/\n/g, " ")); await display.shot(`${OUT}/prod-display-legacy.png`); }
writeFileSync(`${OUT}/prod-results-b.json`, JSON.stringify(results, null, 2));
console.log("PART B DONE", results.filter((r) => r.ok).length + "/" + results.length);
b.close(); process.exit(0);
