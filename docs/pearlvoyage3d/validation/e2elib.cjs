const { chromium } = require(process.env.HOME + '/.npm/_npx/db89d7302a373f10/node_modules/playwright');
const fs = require('fs');
const BASE = process.env.PV_BASE || 'http://localhost:3617';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const note = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
async function until(fn, ms = 30000, step = 120) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch {} await sleep(step); } return false; }
async function open({ out, video = false }) {
  const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=metal'] });
  const cc = await browser.newContext({ viewport: { width: 1024, height: 1500 }, hasTouch: true, isMobile: false, deviceScaleFactor: 1 });
  const dc = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...(video ? { recordVideo: { dir: out + '/video', size: { width: 1280, height: 720 } } } : {}) });
  const c = await cc.newPage(), d = await dc.newPage();
  const errors = [];
  for (const [n, p] of [['control', c], ['display', d]]) { p.on('pageerror', e => errors.push(n + ': ' + e.message.slice(0, 300))); p.on('console', m => { if (m.type() === 'error' && !/favicon|preload|Failed to load resource/.test(m.text())) errors.push(n + ' console: ' + m.text().slice(0, 300)); }); }
  return { browser, cc, dc, c, d, errors };
}
async function login(c, email = 'therapist@example.test') {
  await c.goto(BASE + '/control', { waitUntil: 'domcontentloaded', timeout: 180000 });
  await c.waitForSelector('input[type=email]', { timeout: 120000 });
  await c.locator('input[type=email]').fill(email);
  await c.locator('input[type=password]').fill('password123');
  await c.locator('button[type=submit]').click();
  await c.waitForTimeout(5000);
}
const cData = c => c.getByTestId('pv-control').evaluate(e => ({ ...e.dataset }));
const dData = d => d.getByTestId('pv-view').evaluate(e => ({ ...e.dataset }));
// multi-touch holds through CDP so steering and throttle can be held together, like real fingers
class Touch {
  constructor(page, cdp) { this.page = page; this.cdp = cdp; this.active = new Map(); this.n = 1; }
  async centre(testid) { const b = await this.page.getByTestId(testid).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
  async set(ids) {
    const want = new Set(ids), had = new Set(this.active.keys());
    if ([...want].every(i => had.has(i)) && [...had].every(i => want.has(i))) return;
    // CDP cannot lift a single finger reliably, so any change lifts all fingers and presses the wanted ones again
    if ([...had].some(i => !want.has(i))) { this.active.clear(); await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
    for (const id of want) if (!this.active.has(id)) { const p = await this.centre(id); this.active.set(id, { ...p, id: this.n++ }); await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...this.active.values()].map(v => ({ x: v.x, y: v.y, id: v.id })) }); }
  }
  async release() { if (this.active.size) { this.active.clear(); await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); } }
}
module.exports = { BASE, sleep, until, note, results, open, login, cData, dData, Touch, chromium, fs };
