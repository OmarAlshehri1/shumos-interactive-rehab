const { chromium } = require(process.env.HOME + '/.npm/_npx/db89d7302a373f10/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=metal'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto('http://localhost:3617/dev/pearl-voyage-preview?stage=0&hold=3', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => !!window.__pv, null, { timeout: 120000 });
  await p.addStyleTag({ content: '[data-testid=pv-view] > div:not(:first-child), [data-testid=pv-view] > section, [data-testid=pv-view] > span { display: none !important }' });
  await p.evaluate(() => { __pv.dispatch({ type: 'start', at: Date.now() }); const s = __pv.get(); __pv.set({ ...s, phase: 'encounter', x: 6, y: 32.5, heading: 0, encounterMs: 100 }); });
  await p.waitForTimeout(5200);
  await p.screenshot({ path: process.argv[2], type: 'jpeg', quality: 86, clip: { x: 100, y: 0, width: 1173, height: 660 } });
  await b.close();
})();
