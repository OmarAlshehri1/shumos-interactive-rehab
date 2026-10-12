// Two-device helpers: TWO separate Chrome processes/profiles (no shared BroadcastChannel/localStorage/cookies):
// an iPad-like touch Control device and a laptop/projector-sized Display device that only share the Firebase EMULATORS.
import { launch, sleep } from "./cdplib.mjs";
import { NS, DB } from "./seed.mjs";
export { launch, sleep, NS, DB };
const owner = { Authorization: "Bearer owner" };
export const rd = async (p) => (await fetch(`${DB}/${p}.json?ns=${NS}`, { headers: owner })).json();
export const IPAD_UA = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
export const until = async (fn, ms = 30000, step = 250) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await sleep(step); } return false; };

export async function openIpad(browser, url) {
  const t = await browser.open(url, 1180, 820);
  await t.send("Emulation.setUserAgentOverride", { userAgent: IPAD_UA, platform: "iPad" });
  await t.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await t.send("Emulation.setDeviceMetricsOverride", { width: 1180, height: 820, deviceScaleFactor: 2, mobile: true });
  // A touch tap on an element: real hit-test at its centre (proves nothing overlaps it), then the touch + click sequence an iPad produces.
  t.tapSel = async (sel) => {
    await t.bringToFront();
    return t.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const b = el.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2;
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') return { disabled: true };
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
  // tap a button by its exact visible text
  t.tapText = async (text) => {
    await t.bringToFront();
    return t.eval(`(() => {
      const el = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(text)});
      if (!el) return null; if (el.disabled) return { disabled: true };
      el.scrollIntoView({ block: 'center' });
      const b = el.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2;
      const hit = document.elementFromPoint(x, y); if (!hit || !(hit === el || el.contains(hit))) return { blocked: true };
      const common = { bubbles: true, cancelable: true, clientX: x, clientY: y };
      hit.dispatchEvent(new PointerEvent('pointerdown', { ...common, pointerType: 'touch', isPrimary: true, pointerId: 1 }));
      hit.dispatchEvent(new PointerEvent('pointerup', { ...common, pointerType: 'touch', isPrimary: true, pointerId: 1 }));
      hit.dispatchEvent(new MouseEvent('click', { ...common, detail: 1 }));
      return { w: b.width, h: b.height };
    })()`);
  };
  return t;
}

export async function login(t, email = "therapist@example.test") {
  await until(() => t.eval("!!document.querySelector('input[type=email]') || !!document.querySelector('[data-testid=rs-control]') || location.pathname.startsWith('/control')"), 60000, 500);
  await sleep(2500);
  if (await t.eval("!!document.querySelector('input[type=email]')")) {
    await t.eval(`(() => { const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, v); el.dispatchEvent(new Event('input',{bubbles:true})); }; set(document.querySelector('input[type=email]'), '${email}'); set(document.querySelector('input[type=password]'), 'password123'); [...document.querySelectorAll('button')].find((b) => b.type === 'submit' || /دخول|تسجيل/.test(b.textContent))?.click(); })()`);
    await sleep(5000);
  }
}
export async function selectPatient(t) {
  await t.eval(`sessionStorage.setItem('shumos.control.selectedPatient', JSON.stringify({ patientId: 'patient-1', patientNumber: '1001', firstName: 'ليلى' }))`);
  await t.send("Page.reload");
}
export const results = [];
export const note = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
