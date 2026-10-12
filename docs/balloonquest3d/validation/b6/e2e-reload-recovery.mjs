/* eslint-disable -- evidence script run against a live browser; not application code */
import { launch, sleep } from "./cdplib.mjs";
import { writeFileSync } from "node:fs";
const OUT = process.argv[2]; const BASE = process.env.BASE ?? "http://localhost:3100"; const PORT = Number(process.env.CDP ?? 9461);
const NS = "demo-bq3-default-rtdb", DB = "http://127.0.0.1:9000";
const owner = { Authorization: "Bearer owner" };
const rd = async (p) => (await fetch(`${DB}/${p}.json?ns=${NS}`, { headers: owner })).json();
const results = []; const note = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); };
const b = await launch(OUT, PORT);
const display = await b.open(`${BASE}/display`);
const control = await b.open(`${BASE}/control/balloon-quest`);
for (const t of [display, control]) await t.send("Emulation.setFocusEmulationEnabled", { enabled: true });
const writes = []; // firebase write observation (network): count websocket frames containing "p":"/liveSession" isn't available; use revision polling instead.
await sleep(8000);
const login = async () => { await control.eval(`(() => { const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, v); el.dispatchEvent(new Event('input',{bubbles:true})); }; set(document.querySelector('input[type=email]'), 'therapist@example.test'); set(document.querySelector('input[type=password]'), 'password123'); document.querySelector('button[type=submit]').click(); })()`); await sleep(6000); };
if (await control.eval("!!document.querySelector('input[type=email]')")) await login();
await control.eval(`sessionStorage.setItem('shumos.control.selectedPatient', JSON.stringify({ patientId: 'patient-1', patientNumber: '1001', firstName: 'ليلى' }))`);
await control.send("Page.reload"); await sleep(7000);
const txt = (id) => control.text(id);
note("production Control mounts through the existing staff login", await control.eval("!!document.querySelector('[data-testid=bq-control]')"));
note("child name is prefilled from the selected patient", (await control.eval("document.querySelector('[data-testid=child-name]')?.value")) === "ليلى");
await sleep(2500);
note("Display (anonymous, separate window) shows the redesigned ready screen from the Firebase record", (await display.eval("document.body.innerText")).includes("استعد") && (await display.eval("!!document.querySelector('[data-testid=bq-stage]')")), (await display.eval("document.body.innerText")).slice(0, 60).replace(/\n/g, " "));
note("Control sees the Display as connected (existing presence)", (await txt("display-status")).includes("متصلة"), await txt("display-status"));
note("legacy garden (leaves/birds) is not rendered behind the Display", await display.eval(`!document.querySelector('.bq-leaf') && !document.querySelector('.bq-bird')`));

const dispJs = `(() => { const stage = document.querySelector('[data-testid=bq-stage]'); if (!stage) return null; const sr = stage.getBoundingClientRect(); return { life: stage.dataset.lifecycle, goal: stage.dataset.goalDone, target: stage.dataset.target, h: sr.height, text: document.body.innerText.slice(0, 80), lanes: [...stage.querySelectorAll('.bq3g-lane')].map(l => { const r = l.querySelector('.bq3-balloon').getBoundingClientRect(); return { id: l.dataset.balloonId, y: (r.top - sr.top) / sr.height, popped: !!l.querySelector('.is-popped') } }) } })()`;
const ctlJs = `(() => { const stage = document.querySelector('[data-testid=control-preview] [data-testid=bq-stage]'); const sr = stage.getBoundingClientRect(); return { target: stage.dataset.target, goal: stage.dataset.goalDone, lanes: [...stage.querySelectorAll('.bq3g-lane')].map(l => { const bt = l.querySelector('.bq3-balloon'); const r = bt.getBoundingClientRect(); return { id: l.dataset.balloonId, color: l.dataset.color, popped: bt.classList.contains('is-popped'), y: (r.top - sr.top) / sr.height, cx: (r.left + r.width / 2 - sr.left) / sr.width, cy: (r.top + r.height * 0.39 - sr.top) / sr.height } }) } })()`;
const life = () => txt("lifecycle");
const tapTarget = async () => { return control.eval(`(() => { const stage = document.querySelector('[data-testid=control-preview] [data-testid=bq-stage]'); const sr = stage.getBoundingClientRect(); const t = stage.dataset.target; for (const l of stage.querySelectorAll('.bq3g-lane[data-color="'+t+'"]')) { const bt = l.querySelector('.bq3-balloon'); if (bt.classList.contains('is-popped')) continue; const r = bt.getBoundingClientRect(); const cy = (r.top + r.height * 0.39 - sr.top) / sr.height, cx = (r.left + r.width/2 - sr.left)/sr.width; if (cy > 0.06 && cy < 0.94 && cx > 0.05 && cx < 0.95) { bt.click(); return true; } } return false; })()`); };
// ================= reload / recovery scenarios (production build, Control + Display in separate windows) =================
const histCount = async () => Object.values((await rd("sessions/patient-1")) ?? {}).filter((h) => h.gameId === "balloon-quest").length;
const snapC = async (t = control) => t.eval(`(() => { const p = document.querySelector('[data-testid=control-preview] [data-testid=bq-stage]'); const lanes = p ? [...p.querySelectorAll('.bq3g-lane')].map((l) => l.dataset.balloonId).sort() : []; return { life: document.querySelector('[data-testid=lifecycle]')?.textContent ?? null, goal: document.querySelector('[data-testid=goal]')?.textContent ?? null, target: p?.dataset.target ?? null, ids: lanes, recovered: !!document.querySelector('[data-testid=bq-recovered]'), superseded: !!document.querySelector('[data-testid=bq-superseded]'), blocked: !!document.querySelector('[data-testid=bq-recovery-blocked]'), title: document.body.innerText.match(/المستوى[^\\n]*/)?.[0] ?? null } })()`);
const snapD = async () => display.eval(`(() => { const s = document.querySelector('[data-testid=bq-stage]'); return s ? { life: s.dataset.lifecycle, goal: s.dataset.goalDone, ids: [...s.querySelectorAll('.bq3g-lane')].map((l) => l.dataset.balloonId).sort() } : null })()`);
const waitFor = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await sleep(400); } return false; };
const reloadControl = async () => { await control.send("Page.reload"); await waitFor(async () => (await snapC()).life !== null, 30000); await sleep(1500); };
const tabKey = () => control.eval(`sessionStorage.getItem('shumos.bq3.controlTabId')`);

// ---- A. reload while balloons are moving (MEDIUM, rising)
await control.select("sel-difficulty", "MEDIUM"); await sleep(400);
await control.click("start"); await sleep(4000);
await tapTarget(); await sleep(900); await tapTarget(); await sleep(1500);
const pre = await snapC(); const revPre = (await rd("liveSession"))?.revision;
note("A0 session playing in a moving stage with 2 accepted selections", pre.life === "قيد اللعب" && pre.goal?.includes("٢"), JSON.stringify({ life: pre.life, goal: pre.goal, title: pre.title }));
const hist0 = await histCount();
await reloadControl();
const post = await snapC(); const dpost = await snapD();
note("A1 after the Control reload the SAME session is recovered, paused, with a recovery notice", post.recovered && post.life === "متوقف مؤقتًا", JSON.stringify({ life: post.life, recovered: post.recovered }));
note("A2 stage and progress preserved: same goal, same target colour, same level/stage title", post.goal === pre.goal && post.target === pre.target && post.title === pre.title, JSON.stringify({ pre: [pre.goal, pre.target, pre.title], post: [post.goal, post.target, post.title] }));
note("A3 the same balloon identities come back (shared with the Display)", post.ids.length > 0 && post.ids.filter((i) => pre.ids.includes(i)).length >= Math.min(3, post.ids.length), `${post.ids.filter((i) => pre.ids.includes(i)).length}/${post.ids.length} ids unchanged`);
note("A4 the child Display follows: paused, same goal, no new session", dpost?.life === "paused" && dpost.goal === "2", JSON.stringify(dpost));
note("A5 live record keeps the same session and its revision only moved forward", (await rd("liveSession"))?.revision > revPre && (await rd("liveSession/session/sessionId")) === (await rd("liveSession/sessionId")));
await sleep(3500);
const still = await snapC();
note("A6 nothing moves or scores while paused (no auto-resume)", still.life === "متوقف مؤقتًا" && still.goal === pre.goal && JSON.stringify(still.ids) === JSON.stringify(post.ids), still.life);
const tappedWhilePaused = await tapTarget(); await sleep(700);
note("A7 a therapist tap while paused does not score", (await snapC()).goal === pre.goal, String(tappedWhilePaused));
await control.click("resume"); await sleep(1500);
note("A8 explicit resume continues play on both devices", (await life()) === "قيد اللعب" && (await snapD())?.life === "playing", await life());
let g = Number((await snapC()).goal.match(/[٠-٩]/)[0].charCodeAt(0) - 1632);
await waitFor(async () => await tapTarget(), 15000); await sleep(1500);
const afterTap = (await snapC()).goal;
note("A9 exactly one more correct selection scores (no duplicate scoring)", afterTap.includes(String.fromCharCode(1632 + g + 1)) && (await snapD()).goal === String(g + 1), `${pre.goal} -> ${afterTap}`);
note("A10 no history was written by recovery", (await histCount()) === hist0, String(await histCount()));

// ---- B. reload while paused
await control.click("pause"); await sleep(1200);
const preB = await snapC();
await reloadControl();
const postB = await snapC();
note("B1 reload while paused: recovered paused with the same progress", postB.recovered && postB.life === "متوقف مؤقتًا" && postB.goal === preB.goal && postB.target === preB.target, JSON.stringify({ pre: preB.goal, post: postB.goal }));

// ---- C. complete a whole level (3 stages) by taps, then reload after completion
await control.click("resume"); await sleep(800);
await control.click("end"); await sleep(800);
await control.eval(`(() => { const d = document.querySelector('[role=dialog]'); [...d.querySelectorAll('button')].find(b => b.textContent.includes('اكتفى'))?.click(); })()`); await sleep(500);
await control.eval(`(() => { const d = document.querySelector('[role=dialog]'); [...d.querySelectorAll('button')].filter(b => b.textContent.trim() === 'إنهاء الجلسة').pop().click(); })()`); await sleep(3500);
note("C0 ending the recovered session saves exactly one history record", (await histCount()) === hist0 + 1, String(await histCount()));
await control.click("new-session"); await sleep(1000);
await control.select("sel-scope", "level"); await control.select("sel-difficulty", "EASY"); await sleep(500);
await control.click("start"); await sleep(1500);
let taps = 0; const tC = Date.now();
while (Date.now() - tC < 150000 && (await life()) !== "اكتملت المغامرة") { if ((await life()) === "اكتملت المرحلة") await control.click("advance"); else if (await tapTarget()) taps++; await sleep(600); }
note("C1 a full level completes by therapist taps", (await life()) === "اكتملت المغامرة", `${taps} taps`);
await sleep(3000);
const histDone = await histCount();
note("C2 completion saved one more history record", histDone === hist0 + 2, String(histDone));
const preC = await snapC();
await reloadControl(); await sleep(4000);
const postC = await snapC();
note("C3 reload after completion restores the completed session (summary visible), no new session started", postC.life === "اكتملت المغامرة" && (await control.eval(`!!document.querySelector('[data-testid=summary]') || document.body.innerText.includes('ملخص')`)), JSON.stringify(postC.life));
note("C4 no duplicate history record after the reload", (await histCount()) === histDone, String(await histCount()));

// ---- D. conflicting Control ownership: second window of the same account
await control.click("new-session"); await sleep(1000);
await control.select("sel-difficulty", "MEDIUM"); await control.select("sel-scope", "all"); await sleep(400);
await control.click("start"); await sleep(3500); await tapTarget(); await sleep(1500);
const preD = await snapC(); const recD = await rd("liveSession/session/bq3/controlTabId");
const tab2 = await b.open(`${BASE}/control/balloon-quest`); await tab2.send("Emulation.setFocusEmulationEnabled", { enabled: true });
await sleep(6000);
await tab2.eval(`sessionStorage.setItem('shumos.control.selectedPatient', JSON.stringify({ patientId: 'patient-1', patientNumber: '1001', firstName: 'ليلى' }))`);
await tab2.send("Page.reload"); await waitFor(async () => (await snapC(tab2)).blocked || (await snapC(tab2)).life, 30000); await sleep(1500);
const s2 = await snapC(tab2);
note("D1 a second window finds a session owned by a live window: it is NOT silently taken over", s2.blocked && !s2.life, JSON.stringify({ blocked: s2.blocked, life: s2.life }));
note("D2 the first window keeps control and keeps playing meanwhile", (await life()) === "قيد اللعب" && (await rd("liveSession/session/bq3/controlTabId")) === recD, await life());
await tab2.click("bq-take-over");
await waitFor(async () => (await snapC(tab2)).recovered, 30000); await sleep(2500);
const s2b = await snapC(tab2); const s1b = await snapC();
note("D3 after the therapist chooses to take over, the second window holds the session paused with its progress", s2b.recovered && s2b.life === "متوقف مؤقتًا" && s2b.goal === preD.goal, JSON.stringify({ life: s2b.life, goal: s2b.goal, pre: preD.goal }));
note("D4 the first window stands down (no longer controls, does not end or save the session)", s1b.superseded, JSON.stringify({ superseded: s1b.superseded }));
await sleep(3000);
const tabAfter = await rd("liveSession/session/bq3/controlTabId");
note("D5 only the second window publishes now, and no history was written by the hand-over", tabAfter !== recD && (await histCount()) === histDone, `${tabAfter?.slice(0, 8)} vs ${recD?.slice(0, 8)}; hist ${await histCount()}`);
await tab2.click("resume"); await sleep(1200);
note("D6 the new owner resumes and the Display follows", (await tab2.text("lifecycle")) === "قيد اللعب" && (await snapD())?.life === "playing");
writeFileSync(`${OUT}/reload-recovery.json`, JSON.stringify(results, null, 1)); console.log(results.every((r) => r.ok) ? "ALL PASS" : "SOME FAILED"); process.exit(0);
