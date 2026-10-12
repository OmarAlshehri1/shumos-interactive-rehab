const { chromium } = require(process.env.HOME + '/.npm/_npx/db89d7302a373f10/node_modules/playwright');
const [, , url, out, waitMs = '4000', script = '', w = '1600', h = '900'] = process.argv;
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=metal'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h } });
  const logs = [];
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text().slice(0, 300)); });
  page.on('pageerror', e => logs.push('pageerror: ' + e.message.slice(0, 400)));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('[data-testid=pv-view]', { timeout: 120000 });
  await page.waitForTimeout(+waitMs);
  if (script) { await page.evaluate(script); await page.waitForTimeout(+waitMs); }
  const stats = await page.getByTestId('pv-view').evaluate(e => ({ ...e.dataset }));
  await page.screenshot({ path: out });
  console.log(JSON.stringify({ stats, logs: logs.slice(0, 12) }));
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
