// Two-device helpers: TWO separate Chrome processes/profiles (so no shared BroadcastChannel, localStorage or cookies):
// an iPad-like touch Control device and a laptop-sized Display device that only share the Firebase EMULATORS.
import { launch, sleep } from "./cdplib.mjs";
export { launch, sleep };
export const NS = "demo-rq3-default-rtdb", DB = "http://127.0.0.1:9000";
const owner = { Authorization: "Bearer owner" };
export const rd = async (p) => (await fetch(`${DB}/${p}.json?ns=${NS}`, { headers: owner })).json();
export const IPAD_UA = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

export async function openIpad(browser, url) {
  const t = await browser.open(url, 1180, 820);
  await t.send("Emulation.setUserAgentOverride", { userAgent: IPAD_UA, platform: "iPad" });
  await t.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await t.send("Emulation.setDeviceMetricsOverride", { width: 1180, height: 820, deviceScaleFactor: 2, mobile: true });
  // A touch tap on the element: a real HIT-TEST at its centre (proves nothing overlaps it and the target is large enough),
  // then the touch sequence an iPad produces (pointerdown/touchstart/pointerup/touchend) followed by the click it generates.
  // (CDP's own touch injection is unreliable in headless two-window runs; this dispatches the events inside the page.)
  t.tap = async (testid) => {
    await t.bringToFront();
    return t.eval(`(() => {
      const el = document.querySelector('[data-testid="${testid}"]'); if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const b = el.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2;
      if (el.disabled) return { disabled: true };
      const hit = document.elementFromPoint(x, y); if (!hit || !(hit === el || el.contains(hit))) return { blocked: true };
      const common = { bubbles: true, cancelable: true, clientX: x, clientY: y };
      const touch = new Touch({ identifier: 1, target: hit, clientX: x, clientY: y });
      hit.dispatchEvent(new PointerEvent('pointerdown', { ...common, pointerType: 'touch', isPrimary: true, pointerId: 1 }));
      hit.dispatchEvent(new TouchEvent('touchstart', { ...common, touches: [touch], targetTouches: [touch], changedTouches: [touch] }));
      hit.dispatchEvent(new PointerEvent('pointerup', { ...common, pointerType: 'touch', isPrimary: true, pointerId: 1 }));
      hit.dispatchEvent(new TouchEvent('touchend', { ...common, touches: [], targetTouches: [], changedTouches: [touch] }));
      hit.dispatchEvent(new MouseEvent('click', { ...common, detail: 1 }));
      return { x, y, w: b.width, h: b.height };
    })()`);
  };
  // tap, then confirm the expected effect; retry like a person would if the tap did not register
  t.tapThen = async (testid, checkJs, tries = 5) => {
    for (let i = 0; i < tries; i++) { await t.tap(testid); await sleep(700); if (await t.eval(checkJs)) return i + 1; }
    return 0;
  };
  return t;
}

export async function login(t, email = "therapist@example.test") {
  await sleep(6000);
  if (await t.eval("!!document.querySelector('input[type=email]')")) {
    await t.eval(`(() => { const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, v); el.dispatchEvent(new Event('input',{bubbles:true})); }; set(document.querySelector('input[type=email]'), '${email}'); set(document.querySelector('input[type=password]'), 'password123'); document.querySelector('button[type=submit]').click(); })()`);
    await sleep(6000);
  }
}
export async function selectPatient(t) {
  await t.eval(`sessionStorage.setItem('shumos.control.selectedPatient', JSON.stringify({ patientId: 'patient-1', patientNumber: '1001', firstName: 'ليلى' }))`);
  await t.send("Page.reload"); await sleep(7000);
}
export const results = [];
export const note = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
export const decideJs = `(() => { const rt = window.__RQ3D_RT; const s = rt.session; const st = s.stage; if (!st || s.lifecycle !== 'playing') return null;
 const i = st.encounters.findIndex((e, k) => !st.obstacles[k].resolved && e.z >= st.distance && (e.kind==='side'||e.kind==='hurdle'||e.kind==='gate'));
 if (i < 0) return null; const e = st.encounters[i]; const ahead = e.z - st.distance; if (ahead > 15) return null;
 if (e.kind === 'hurdle') { if (e.lanes.includes(st.lane) && !st.obstacles[i].armed) return ahead <= 6.5 ? 'touch-step' : null; return null; }
 const free = [-1,0,1].filter(l => !e.lanes.includes(l)); if (free.includes(st.lane)) return null;
 const goal = free.reduce((a,b)=> Math.abs(a-st.lane) <= Math.abs(b-st.lane) ? a : b); return goal < st.lane ? 'touch-left' : 'touch-right'; })()`;
