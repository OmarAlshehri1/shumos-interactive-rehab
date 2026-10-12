// Window ownership on the shared platform for Build Quest 3D and Space Pilot 3D (production build, Firebase emulators):
// a second window of the same account is blocked while the first is alive; after an explicit take-over it holds the session
// PAUSED with its progress, the first window stands down (no end, no save, no clearing), the Display follows the new owner.
import { launch, login, note, openIpad, rd, results, selectPatient, sleep } from "../../runnerquest3d/validation/crosslib.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const [out, BASE = "http://127.0.0.1:3100"] = process.argv.slice(2);
mkdirSync(`${out}/results`, { recursive: true });
const A = await launch(`${out}/ipad`, 9721), B = await launch(`${out}/laptop`, 9722);
const display = await B.open(`${BASE}/display`, 1920, 1080);
const c1 = await openIpad(A, `${BASE}/control/activities`);
await login(c1); await selectPatient(c1);
const put = (p, v) => fetch(`http://127.0.0.1:9000/${p}.json?ns=demo-bq3-default-rtdb`, { method: "PUT", headers: { Authorization: "Bearer owner" }, body: JSON.stringify(v) });
const click = (t, sel) => t.eval(`(() => { const e = document.querySelector('${sel}'); if (!e) return false; e.click(); return true; })()`);
const clickText = (t, text) => t.eval(`(() => { const b = [...document.querySelectorAll('button')].find((x) => !x.disabled && x.textContent.trim() === ${JSON.stringify(text)}); if (!b) return false; b.click(); return true; })()`);
const until = async (fn, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await sleep(500); } return false; };
const histCount = async () => Object.keys((await rd("sessions/patient-1")) ?? {}).length;

// ================= Build Quest 3D =================
await put("liveSession", null); await sleep(1000);
await c1.eval(`location.href='/control/build-quest-3d'`); await sleep(9000);
await clickText(c1, "بدء الجلسة"); await sleep(1500);
const stage = await c1.eval(`(() => { const p = document.querySelector('[data-piece]'); return p ? p.dataset.piece : null })()`);
await click(c1, `[data-piece="${stage}"]`); await sleep(500); await click(c1, `[data-target="${stage}"]`); await sleep(1500);
const dBefore = await display.eval(`document.querySelector('[data-testid=build-state]')?.dataset.placed ?? null`);
note("Build: first window plays; one piece placed, Display shows it", dBefore === "1", `display placed=${dBefore}`);
const tab1 = await rd("liveSession/session/build3/controlTabId"); const hist0 = await histCount();
const c2 = await A.open(`${BASE}/control/build-quest-3d`, 1180, 820); await sleep(7000);
await c2.eval(`sessionStorage.setItem('shumos.control.selectedPatient', JSON.stringify({ patientId: 'patient-1', patientNumber: '1001', firstName: 'ليلى' }))`);
await c2.send("Page.reload"); await until(() => c2.eval(`!!document.querySelector('[data-testid=bq-recovery-blocked]') || !!document.querySelector('[data-testid=build-state]')`), 40000);
note("Build: second window of the same account is blocked from silently taking over", await c2.eval(`!!document.querySelector('[data-testid=bq-recovery-blocked]')`));
note("Build: first window keeps controlling meanwhile (record still its own)", (await rd("liveSession/session/build3/controlTabId")) === tab1);
await click(c2, "[data-testid=bq-take-over]");
await until(() => c2.eval(`!!document.querySelector('[data-testid=bq-recovered]')`), 40000); await sleep(2500);
note("Build: after the take-over the second window holds the session paused with its progress", await c2.eval(`document.querySelector('[data-testid=build-state]')?.dataset.status === 'paused' && document.querySelector('[data-testid=build-state]')?.dataset.placed === '1'`), await c2.eval(`JSON.stringify({ s: document.querySelector('[data-testid=build-state]')?.dataset.status, p: document.querySelector('[data-testid=build-state]')?.dataset.placed })`));
note("Build: the first window stands down", await c1.eval(`!!document.querySelector('[data-testid=bq-superseded]')`));
await sleep(3000);
note("Build: only the new window publishes; no history was written by the hand-over; the Display follows (paused, same progress)", (await rd("liveSession/session/build3/controlTabId")) !== tab1 && (await histCount()) === hist0 && (await display.eval(`document.querySelector('[data-testid=build-state]')?.dataset.status`)) === "paused" && (await display.eval(`document.querySelector('[data-testid=build-state]')?.dataset.placed`)) === "1");
await clickText(c2, "متابعة"); await sleep(1500);
note("Build: the new owner resumes explicitly and the Display follows", (await display.eval(`document.querySelector('[data-testid=build-state]')?.dataset.status`)) === "running");
await c2.send("Page.close").catch(() => {});

// ================= Space Pilot 3D =================
await put("liveSession", null); await sleep(1000);
await c1.eval(`location.href='/control/space-pilot'`); await sleep(10000);
await c1.eval(`(() => { const s = document.querySelector('select[aria-label="الصعوبة"]'); if (!s) return; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s, 'LOW'); s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(2000);
const sp1 = await rd("liveSession/session/sp3/controlTabId"); const spLive = await rd("liveSession/gameId"); const hist1 = await histCount();
note("Space Pilot: first window publishes the 3D session into the shared record", spLive === "space-pilot" && !!sp1 && (await rd("liveSession/session/engine")) === "sp3");
const c3 = await A.open(`${BASE}/control/space-pilot`, 1180, 820); await sleep(7000);
await c3.eval(`sessionStorage.setItem('shumos.control.selectedPatient', JSON.stringify({ patientId: 'patient-1', patientNumber: '1001', firstName: 'ليلى' }))`);
await c3.send("Page.reload"); await until(() => c3.eval(`!!document.querySelector('[data-testid=sp-recovery-blocked]') || !!document.querySelector('[data-testid=session-lifecycle]')`), 45000);
note("Space Pilot: second window of the same account is blocked from silently taking over", await c3.eval(`!!document.querySelector('[data-testid=sp-recovery-blocked]')`));
await click(c3, "[data-testid=sp-take-over]");
await until(() => c3.eval(`!!document.querySelector('[data-testid=sp-recovered]')`), 45000); await sleep(2500);
note("Space Pilot: after the take-over the second window holds the flight stopped (not running) with the same session", (await c3.eval(`document.querySelector('[data-testid=session-lifecycle]')?.dataset.lifecycle`)) !== "running" && (await rd("liveSession/session/sp3/controlTabId")) !== sp1 && (await rd("liveSession/session/sp3/epoch")) >= 2);
note("Space Pilot: the first window stands down and nothing was saved by the hand-over", (await c1.eval(`!!document.querySelector('[data-testid=sp-superseded]')`)) && (await histCount()) === hist1);
await put("liveSession", null);
note("no console exceptions on any window", [c1, c2, c3, display].every((t) => (t.events ?? []).filter((e) => e.method === "Runtime.exceptionThrown").length === 0));
writeFileSync(`${out}/results/takeover.json`, JSON.stringify(results, null, 1));
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
process.exit(0);
