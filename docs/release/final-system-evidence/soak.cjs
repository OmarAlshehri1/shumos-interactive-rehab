/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS browser validation harness. */
const { fs, assert, out, open, database, click, sleep, manual } = require('./browser-common.cjs');
(async () => {
  const db = database('demo-final-soak-default-rtdb');
  const user = JSON.parse(fs.readFileSync('/private/tmp/shumos-final-demo-user.json'));
  await db.fixture('.settings/rules', JSON.parse(fs.readFileSync('/private/tmp/shumos-final-v16-candidate/database.rules.json')));
  await db.fixture('staff/' + user.uid, { active: true, role: 'therapist' });
  await db.fixture('patients/sp9-patient', { patientNumber: 'SOAK-SYNTHETIC', firstName: 'تجربة الاستقرار', active: true, createdAt: 1, updatedAt: 1, createdByUid: user.uid });
  const { browser, c, d, errors, base } = await open('http://127.0.0.1:3517');
  const result = { startedAt: new Date().toISOString(), targetMs: 3600000, samples: [], errors, status: 'running', durationMs: 0 };
  const save = () => fs.writeFileSync(out + '/soak.json', JSON.stringify(result, null, 2));
  await c.goto(base + '/control/blooming-world-3d?input=MANUAL');
  await d.goto(base + '/display');
  await c.getByTestId('bw-control').waitFor();
  await manual(c, 'WALL');
  await click(c, 'بدء الحديقة');
  await click(c, 'إزهار بمساعدة');
  await c.getByRole('button', { name: 'المنطقة 1: 1 من 1', exact: true }).click();
  const cm = await c.context().newCDPSession(c), dm = await d.context().newCDPSession(d);
  await cm.send('Performance.enable'); await dm.send('Performance.enable');
  await d.evaluate(() => {
    window.__soakFrames = { count: 0, maxGap: 0, gapsOver100: 0, last: 0 };
    const loop = t => { const s = window.__soakFrames; if (s.last) { const gap = t - s.last; s.maxGap = Math.max(s.maxGap, gap); if (gap > 100) s.gapsOver100++; } s.count++; s.last = t; requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  });
  const start = Date.now(), initial = await db.read('liveSession');
  save(); console.log('REAL 60 MINUTE SOAK STARTED', result.startedAt);
  try {
    while (Date.now() - start < result.targetMs) {
      await sleep(30000);
      await click(c, 'تكرار المنطقة');
      const at = Date.now(); await click(c, 'إزهار بمساعدة');
      await d.waitForFunction(() => document.querySelector('[data-testid=bw-view]')?.dataset.progress === '25');
      const live = await db.read('liveSession');
      const state = JSON.parse(live.session.bw3.payload);
      assert.equal(state.status, 'running'); assert.equal(state.stage, 0);
      assert.equal(state.regions.reduce((sum, r) => sum + r.hits, 0), 1);
      assert.equal(Object.keys(await db.read('sessions/sp9-patient') || {}).length, 0);
      const metrics = async session => Object.fromEntries((await session.send('Performance.getMetrics')).metrics.filter(m => ['JSHeapUsedSize', 'JSHeapTotalSize', 'Nodes', 'Documents'].includes(m.name)).map(m => [m.name, m.value]));
      result.durationMs = Date.now() - start;
      result.samples.push({ elapsedMs: result.durationMs, revision: live.revision, control: await metrics(cm), display: await metrics(dm), render: await d.getByTestId('bw-view').evaluate(e => ({ ...e.dataset })), frames: await d.evaluate(() => window.__soakFrames), practiceEvents: state.practiceEvents.length, acknowledgementMs: Date.now() - at, writesPerSecond: (live.revision - initial.revision) / (result.durationMs / 1000) });
      save(); console.log('SOAK', Math.round(result.durationMs / 60000), 'minutes', 'practice', state.practiceEvents.length);
    }
    await click(c, 'إنهاء والنتائج');
    await c.waitForFunction(() => document.querySelector('[data-testid=bw-control]')?.dataset.history === 'saved');
    assert.equal(Object.keys(await db.read('sessions/sp9-patient')).length, 1);
    await c.reload(); await c.getByTestId('bw-control').waitFor(); await sleep(1500);
    assert.equal(Object.keys(await db.read('sessions/sp9-patient')).length, 1);
    await d.screenshot({ path: out + '/soak-final-display.png' });
    result.status = 'passed'; result.finishedAt = new Date().toISOString(); save();
  } catch (e) { result.status = 'failed'; result.failure = String(e.stack || e); save(); throw e; }
  finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
