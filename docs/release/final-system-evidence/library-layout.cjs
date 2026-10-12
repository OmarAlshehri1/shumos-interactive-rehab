/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS browser validation harness. */
const { fs, assert, out, open } = require('./browser-common.cjs');
(async () => {
  const { browser, c, base } = await open('http://127.0.0.1:3516', false);
  const result = { layouts: [], routes: [], assets: [], auth: {}, errors: [] };
  try {
    const sections = await c.locator('[data-library-category]').evaluateAll(a => a.map(e => ({ id: e.dataset.libraryCategory, heading: e.querySelector('h2')?.textContent, cards: [...e.querySelectorAll('[data-game-card]')].map(g => ({ id: g.dataset.gameCard, href: g.getAttribute('href') })) })));
    assert.deepEqual(sections.map(s => s.cards.length), [6, 7, 6, 3]);
    assert.equal(new Set(sections.flatMap(s => s.cards.map(g => g.id))).size, 13); result.sections = sections;
    for (const [name, width, height] of [['desktop',1440,900],['ipad-landscape',1180,820],['ipad-portrait',820,1180],['mobile',390,844]]) {
      await c.setViewportSize({ width, height });
      for (const img of await c.locator('[data-game-card] img').all()) { await img.scrollIntoViewIfNeeded(); await img.evaluate(e => e.decode()); }
      await c.evaluate(() => scrollTo(0,0)); await c.waitForTimeout(500);
      const data = await c.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, rtl: getComputedStyle(document.querySelector('[data-library-category]')).direction, images: [...document.querySelectorAll('[data-game-card] img')].map(i => ({ src: i.getAttribute('src'), loaded: i.complete && i.naturalWidth > 0 })) }));
      result.layouts.push({ name, ...data });
      assert(data.scrollWidth <= width + 1, name + ' horizontal overflow'); assert.equal(data.rtl, 'rtl'); assert(data.images.every(i => i.loaded));
      await c.screenshot({ path: out + '/library-' + name + '.png', fullPage: true });
    }
    await c.goto(base + '/control'); await c.waitForSelector('[data-game-card]');
    const home = await c.locator('[data-game-card]').evaluateAll(a => a.map(e => e.dataset.gameCard));
    assert.equal(home.length,13); assert.equal(new Set(home).size,13); result.home = home;
    for (const id of new Set(sections.flatMap(s => s.cards.map(g => g.id)))) {
      const r = await c.request.get(base + '/control/' + id); result.routes.push({ id, status: r.status() }); assert.equal(r.status(), 200);
    }
    const retired = await c.request.get(base + '/control/feed-the-animals'); assert.equal(retired.status(), 404); result.retiredRoute = 404;
    const inventory = JSON.parse(fs.readFileSync(out + '/inventory.json'));
    for (const game of inventory.games) {
      const p = '/private/tmp/shumos-final-v16-candidate/app' + game.route + '/page.tsx'; assert(fs.existsSync(p));
    }
    const anonymous = await browser.newContext(), a = await anonymous.newPage(); await a.goto(base + '/control/activities');
    await a.locator('input[type=email]').waitFor(); result.auth.staffGate = await a.locator('[data-game-card]').count() === 0; assert(result.auth.staffGate); await anonymous.close();
    const rollback = await open('http://127.0.0.1:3518', false);
    const rollbackIds = await rollback.c.locator('[data-game-card]').evaluateAll(a => [...new Set(a.map(e => e.dataset.gameCard))]);
    assert.deepEqual(rollbackIds.sort(), ['balloon-quest','follow-the-footsteps','bubble-pop-wall','space-pilot','color-chase','blooming-world-3d'].sort());
    result.rollbackIds = rollbackIds;
    for (const id of ['runner-quest-3d','build-quest-3d','mirror-quest-3d','safe-hex-arena-3d','fire-rescue-3d','harvest-valley-3d','pearl-voyage-3d']) {
      const r = await rollback.c.request.get('http://127.0.0.1:3518/control/' + id); result.routes.push({ id, rollback: true, status: r.status() }); const body=await r.text();assert(r.status()===404 || body.includes('NEXT_HTTP_ERROR_FALLBACK;404'),id+' must render not-found with the flag disabled');
    }
    await rollback.c.screenshot({ path: out + '/library-rollback.png', fullPage: true }); await rollback.browser.close(); result.status = 'passed';
  } catch (e) { result.status = 'failed'; result.failure = String(e.stack || e); throw e; }
  finally { fs.writeFileSync(out + '/library-layout.json', JSON.stringify(result, null, 2)); await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
