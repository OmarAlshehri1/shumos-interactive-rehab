 
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function launch(outDir, port = 9444, extra = []) {
  mkdirSync(outDir, { recursive: true });
  const CH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const chrome = spawn(CH, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${outDir}/profile`, "--window-size=1600,900", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", "--hide-scrollbars", "--autoplay-policy=no-user-gesture-required", ...extra, "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 40; i++) { try { const t = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (t.length) break; } catch {} await sleep(250); }
  const tabs = [];
  async function open(url, w = 1600, h = 900) {
    const t = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let id = 0; const pending = new Map(); const events = [];
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result ?? d); pending.delete(d.id); } else if (d.method) events.push(d); };
    const send = (method, params = {}) => new Promise((r, rej) => { const i = ++id; pending.set(i, r); const to = setTimeout(() => { pending.delete(i); rej(new Error(`CDP timeout: ${method}`)); }, 60000); pending.set(i, (v) => { clearTimeout(to); r(v); }); ws.send(JSON.stringify({ id: i, method, params })); });
    await send("Page.enable"); await send("Runtime.enable"); await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    const tab = {
      send, events, ws, targetId: t.id,
      async eval(expr) { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "eval error"); return r.result?.value; },
      async shot(path) { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(path, Buffer.from(r.data, "base64")); },
      async key(type, key) { await send("Input.dispatchKeyEvent", { type, key, code: key, windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : ({ ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Enter: 13 }[key] ?? 0), text: type === "keyDown" && key.length === 1 ? key : undefined }); },
      async click(testid) { return tab.eval(`(() => { const e = document.querySelector('[data-testid="${testid}"]'); if (!e) return false; e.click(); return true; })()`); },
      async select(testid, value) { return tab.eval(`(() => { const e = document.querySelector('[data-testid="${testid}"]'); if (!e) return false; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(e, '${value}'); e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`); },
      async text(testid) { return tab.eval(`document.querySelector('[data-testid="${testid}"]')?.textContent ?? null`); },
      async bringToFront() { await send("Page.bringToFront"); },
    };
    tabs.push(tab);
    return tab;
  }
  return { open, close() { chrome.kill(); } };
}
