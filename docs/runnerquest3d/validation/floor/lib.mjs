// Runner Quest 3D FLOOR upgrade validation helpers. Everything is driven by environment variables so the suite can run against ANY
// isolated Firebase emulator + dev/prod server pair (never a real project): RQ_DB_PORT, RQ_AUTH_PORT, RQ_PROJECT, RQ_BASE.
import { launch, sleep } from "../cdplib.mjs";
import { IPAD_UA, openIpad as openIpadBase } from "../crosslib.mjs";
export { launch, sleep, IPAD_UA };
export const PROJECT = process.env.RQ_PROJECT ?? "demo-rq5";
export const DB_PORT = process.env.RQ_DB_PORT ?? "19410";
export const AUTH_PORT = process.env.RQ_AUTH_PORT ?? "19411";
export const BASE = process.env.RQ_BASE ?? "http://localhost:3410";
export const NS = `${PROJECT}-default-rtdb`;
export const DB = `http://127.0.0.1:${DB_PORT}`;
export const AUTH = `http://127.0.0.1:${AUTH_PORT}/identitytoolkit.googleapis.com/v1`;
const owner = { Authorization: "Bearer owner", "Content-Type": "application/json" };
export const rd = async (p) => (await fetch(`${DB}/${p}.json?ns=${NS}`, { headers: owner })).json();
export const wr = (p, b) => fetch(`${DB}/${p}.json?ns=${NS}`, { method: "PUT", headers: owner, body: JSON.stringify(b) }).then((r) => r.status);
export const results = [];
export const note = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
export const until = async (fn, ms = 8000, step = 200) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(step); } return false; };

export async function seed() {
  await fetch(`http://127.0.0.1:${AUTH_PORT}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
  await fetch(`${DB}/.json?ns=${NS}`, { method: "DELETE", headers: owner });
  const signUp = async (email, displayName) => (await (await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "password123", displayName, returnSecureToken: true }) })).json()).localId;
  const uid = await signUp("therapist@example.test", "أ. سارة");
  const other = await signUp("outsider@example.test", "زائر");
  await wr(`staff/${uid}`, { active: true, role: "therapist" });
  await wr("patients/patient-1", { patientNumber: "1001", firstName: "ليلى", createdAt: 1, updatedAt: 1, createdByUid: uid, active: true });
  return { uid, other };
}

export const openIpad = openIpadBase;
export async function login(t, email = "therapist@example.test") {
  await sleep(6000);
  if (await t.eval("!!document.querySelector('input[type=email]')")) {
    await t.eval(`(() => { const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, v); el.dispatchEvent(new Event('input',{bubbles:true})); }; set(document.querySelector('input[type=email]'), '${email}'); set(document.querySelector('input[type=password]'), 'password123'); document.querySelector('button[type=submit]').click(); })()`);
    await sleep(6000);
  }
}
export async function selectPatient(t, walkIn = false) {
  if (walkIn) await t.eval(`sessionStorage.removeItem('shumos.control.selectedPatient')`);
  else await t.eval(`sessionStorage.setItem('shumos.control.selectedPatient', JSON.stringify({ patientId: 'patient-1', patientNumber: '1001', firstName: 'ليلى' }))`);
  await t.send("Page.reload"); await sleep(7000);
}
