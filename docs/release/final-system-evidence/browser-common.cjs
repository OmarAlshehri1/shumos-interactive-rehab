/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS browser validation harness. */
const { chromium } = require('/Users/omaralshehri/.npm/_npx/db89d7302a373f10/node_modules/playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const out = __dirname;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000) {
  const t = Date.now();
  while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(150); }
  throw Error('Timed out waiting for authoritative state');
}
function database(ns = 'demo-shumos-final-default-rtdb') {
  assert(ns.startsWith('demo-'));
  const url = p => `http://127.0.0.1:21000/${p}.json?ns=${ns}`;
  return {
    read: async p => { const r = await fetch(url(p), { headers: { Authorization: 'Bearer owner' } }); assert(r.ok); return r.json(); },
    // Used exclusively for synthetic fixtures and cleanup BETWEEN sessions.
    fixture: async (p, value) => { const r = await fetch(url(p), { method: 'PUT', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify(value) }); assert(r.ok, await r.text()); },
  };
}
async function open(base = 'http://127.0.0.1:3516', patient = true) {
  const browser = await chromium.launch({ headless: false, args: ['--use-angle=metal', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const cc = await browser.newContext({ viewport: { width: 1024, height: 1100 }, hasTouch: true });
  const dc = await browser.newContext({ viewport: { width: 1440, height: 810 } });
  const c = await cc.newPage(), d = await dc.newPage(), errors = [];
  for (const [name, p] of [['Control', c], ['Display', d]]) { p.setDefaultTimeout(20000); p.on('pageerror', e => errors.push(name + ': ' + e.message)); }
  await c.goto(base + '/control/activities');
  await c.locator('input[type=email]').fill('library-audit@example.test');
  await c.locator('input[type=password]').fill('local-audit-password');
  await c.getByRole('button', { name: /دخول/ }).click();
  await c.waitForSelector('[data-game-card]');
  if (patient) {
    await c.goto(base + '/control/patients/sp9-patient');
    await c.getByRole('button', { name: 'بدء جلسة جديدة', exact: true }).click();
    await c.waitForSelector('[data-game-card]');
  }
  return { browser, cc, dc, c, d, errors, base };
}
async function click(c, name) { await c.getByRole('button', { name, exact: true }).first().click(); }
async function manual(c, projection) {
  await c.getByRole('button', { name: 'طريقة المشاركة المطلوبة', exact: true }).click();
  await click(c, 'تحكم المعالج اليدوي');
  if (projection) await c.locator('#library-launch-options').getByRole('button', { name: projection === 'FLOOR' ? 'أرضي' : 'جداري', exact: true }).click();
  await c.getByRole('button', { name: 'إغلاق إعدادات المشاركة' }).click();
}
module.exports = { chromium, fs, assert, out, sleep, until, database, open, click, manual };
