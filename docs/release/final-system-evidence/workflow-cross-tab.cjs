/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS browser validation harness. */
const { fs, assert, out, open, database, sleep, until } = require('./browser-common.cjs');
(async () => {
  const db = database(), { browser, c, d, cc, base, errors } = await open();
  const result = { expectation: process.argv[2] || 'preserved', errors };
  try {
    await c.goto('about:blank'); await sleep(500);
    for (const p of ['liveSession','liveSessionPrivate','controllerLease']) await db.fixture(p,null);
    await c.goto(base + '/control/build-quest-3d'); await d.goto(base + '/display');
    await c.getByTestId('build-state').waitFor(); await c.getByRole('button',{name:'بدء الجلسة',exact:true}).click();
    const piece = c.locator('[data-piece]:not([disabled])').first(), id = await piece.getAttribute('data-piece');
    await piece.click(); await c.locator(`[data-target="${id}"]`).click();
    await until(async () => JSON.parse((await db.read('liveSession')).session.build3.payload).placed.length === 1);
    const before = await db.read('liveSession'), binding = await db.read('liveSessionPrivate');
    const rows = Object.keys(await db.read('sessions/sp9-patient') || {}).length;
    result.before = { sessionId: before.sessionId, binding, placed: 1, controlTabId: before.session.build3.controlTabId };
    const second = await cc.newPage(); await second.goto(base + '/control/activities'); await second.waitForSelector('[data-game-card]'); await sleep(500);
    const after = await db.read('liveSession'); result.after = after;
    if (result.expectation === 'deleted') { assert.equal(after,null); result.reproduced = true; }
    else {
      assert.equal(after.sessionId,before.sessionId); assert.equal(JSON.parse(after.session.build3.payload).placed.length,1);
      assert.deepEqual(await db.read('liveSessionPrivate'),binding);
      assert.equal(Object.keys(await db.read('sessions/sp9-patient') || {}).length,rows);
      await d.waitForFunction(() => document.querySelector('[data-testid=build-state]')?.dataset.placed === '1');
      await c.getByRole('button',{name:'إيقاف مؤقت',exact:true}).click();
      await second.goto(base + '/control'); await second.waitForSelector('[data-game-card]'); await sleep(400);
      assert.equal((await db.read('liveSession')).sessionId,before.sessionId);
      result.activeAndPausedPreserved = true;
    }
    await second.screenshot({path:out+'/workflow-second-tab-'+result.expectation+'.png',fullPage:true});await second.close();result.status='passed';
  } catch(e) { result.status='failed';result.failure=String(e.stack||e);throw e; }
  finally { fs.writeFileSync(out+'/workflow-cross-tab-'+result.expectation+'.json',JSON.stringify(result,null,2));await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
