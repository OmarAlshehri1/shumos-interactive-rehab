const { chromium } = require(process.env.HOME + '/.npm/_npx/db89d7302a373f10/node_modules/playwright');
const fs = require('fs');
const [, , file, outDir] = process.argv;
const scenarios = JSON.parse(fs.readFileSync(file, 'utf8'));
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=metal'] });
  for (const sc of scenarios) {
    const page = await browser.newPage({ viewport: { width: sc.w || 1600, height: sc.h || 900 } });
    const logs = [];
    page.on('console', m => { if (m.type() === 'error') logs.push(m.text().slice(0, 300)); });
    page.on('pageerror', e => logs.push('pageerror: ' + e.message.slice(0, 300)));
    await page.goto(sc.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForSelector('[data-testid=pv-view]', { timeout: 120000 });
    await page.waitForFunction(() => !!window.__pv, null, { timeout: 120000 }).catch(() => {}); await page.waitForTimeout(sc.initWait || 2500);
    for (const st of sc.steps || []) { if (st.js) await page.evaluate(st.js); await page.waitForTimeout(st.wait || 500); }
    const stats = await page.getByTestId('pv-view').evaluate(e => ({ phase: e.dataset.phase, status: e.dataset.status, fps: e.dataset.fps, draws: e.dataset.drawCalls, tris: e.dataset.triangles, hold: e.dataset.hold }));
    await page.screenshot({ path: `${outDir}/${sc.name}.png` });
    console.log(sc.name, JSON.stringify(stats), logs.length ? 'ERR ' + JSON.stringify(logs.slice(0, 3)) : '');
    await page.close();
  }
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
