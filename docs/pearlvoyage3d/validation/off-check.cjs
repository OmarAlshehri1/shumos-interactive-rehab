const L = require('./e2elib.cjs');
(async () => {
  const { browser, c } = await L.open({ out: process.argv[2] });
  await L.login(c);
  await c.goto(L.BASE + '/control/patients/patient-1', { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 8 && !c.url().includes('/control/activities'); i++) { await c.getByRole('button', { name: 'بدء جلسة جديدة', exact: true }).tap().catch(() => {}); await L.sleep(1500); }
  await c.waitForSelector('[data-game-card]', { timeout: 60000 });
  const cards = await c.locator('[data-game-card]').evaluateAll(els => els.map(e => e.dataset.gameCard));
  console.log('CARDS', JSON.stringify(cards));
  await browser.close();
})();
