/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS browser validation harness. */
const { fs, assert, out, open, database, click, sleep, until, manual } = require('./browser-common.cjs');
const cases = [
 ['fire-rescue-3d','fr3','[data-testid=fr-control]','[data-testid=fr-view]'],
 ['pearl-voyage-3d','pv3','[data-testid=pv-control]','[data-testid=pv-view]'],
 ['harvest-valley-3d','hv3','[data-testid=hv-control]','[data-testid=hv-view]'],
];
const chosen = process.argv[2] ? cases.filter(x => process.argv[2].split(',').includes(x[0])) : cases;
(async () => {
  const db = database(), { browser, c, d, errors, base } = await open();
  const results = [], save = () => fs.writeFileSync(out + '/driving-matrix' + (process.argv[2] ? '-' + process.argv[2] : '') + '.json', JSON.stringify({ results, errors }, null, 2));
  try {
    for (const [id, engine, cs, ds, projection] of chosen) {
      const row = { id, projection: projection || ({ fp3: 'FLOOR', cc3: 'FLOOR', hex3: 'FLOOR' }[engine] || 'WALL'), stages: [], checks: [], status: 'running' };
      results.push(row); save(); console.log('BEGIN', id, row.projection);
      const state = async () => { const live = await db.read('liveSession'); assert.equal(live?.gameId, id); const e = live.session[engine]; return JSON.parse(e.payload || e.snapshot); };
      const status = s => s.status || s.lifecycle;
      const stage = s => s.stageIndex ?? s.stage;
      const sync = async () => {
        const a = await c.locator(cs).first().evaluate(e => ({ ...e.dataset }));
        await d.waitForFunction(({ ds, a }) => { const e = document.querySelector(ds); return e && (!a.stage || e.dataset.stage === a.stage) && (!a.status || e.dataset.status === a.status) && (!a.lifecycle || e.dataset.lifecycle === a.lifecycle) && (!a.progress || e.dataset.progress === a.progress) && (!a.placed || e.dataset.placed === a.placed); }, { ds, a });
      };
      try {
        // Test fixture cleanup occurs before gameplay; accepted game state is never injected.
        await c.goto('about:blank'); await d.goto('about:blank'); await sleep(600);
        for (const p of ['liveSession', 'liveSessionPrivate', 'controllerLease']) await db.fixture(p, null);
        const beforeRows = Object.keys(await db.read('sessions/sp9-patient') || {});
        await c.goto(base + '/control/' + id + '?input=MANUAL'); await d.goto(base + '/display');
        await c.locator(cs).first().waitFor(); await manual(c, projection);
        if (engine === 'bq3') await c.getByTestId('chk-auto').uncheck();
        await sync();
        if(engine==='fr3'||engine==='pv3'){await c.getByTestId('stage-8').click();await until(async()=>stage(await state())===8);await c.getByTestId('stage-0').click();await until(async()=>stage(await state())===0);row.checks.push('nine-stage arbitrary selection');}
        const select = c.locator('select#stage,select[aria-label="المستوى والمرحلة"]').first();
        if (await select.count()) { assert.equal(await select.locator('option').count(), 9); await select.selectOption('8'); await until(async () => stage(await state()) === 8); await select.selectOption('0'); await until(async () => stage(await state()) === 0); row.checks.push('nine choices and arbitrary stage selection'); }
        for (let index = 0; index < 9; index++) {
          const began = Date.now(); const initial = await state(); assert.equal(stage(initial), index); assert.equal(status(initial), 'ready');
          const start = c.getByRole('button', { name: /^(ابدأ المرحلة|بدء الجلسة|ابدأ الرحلة|بدء الحديقة|ابدأ المهمة ←|ابدأ الرحلة ←|بدء الحصاد|ابدأ)$/ }).first(); if (projection && await start.isDisabled()) await manual(c,projection); await start.click({force:true});
          await until(async () => ['running', 'playing'].includes(status(await state()))); await sync();
          if (index === 0) {
            const pause = c.getByRole('button', { name: /^(إيقاف مؤقت|استراحة)$/ }).first(); await pause.click({force:true}); await until(async () => status(await state()) === 'paused'); await sync();
            await c.reload(); await c.locator(cs).first().waitFor(); assert.equal(status(await state()), 'paused'); await d.reload(); await d.locator(ds).first().waitFor(); await sync();
            await c.getByRole('button', { name: /^(متابعة|استئناف|استئناف المهمة|استئناف الرحلة)$/ }).first().click(); await until(async () => ['running', 'playing'].includes(status(await state()))); row.checks.push('pause, paused Control/Display reload, explicit resume');
          }
          let actions = 0;
          while (['running', 'playing', 'paused', 'suspended'].includes(status(await state())) && Date.now() - began < 180000) {
            const s = await state();
            if (status(s) === 'paused' || status(s) === 'suspended') { await c.getByRole('button', { name: /^(متابعة|متابعة بعد الراحة|استئناف)$/ }).first().click(); await sleep(250); continue; }
            if(engine==='fr3'||engine==='pv3'){const key=`${s.stage}:${s.phase}:${s.stop??s.marker}`;if(row.assistKey!==key){await c.getByTestId('assist').click();row.assistKey=key;}await sleep(400);}
            else if(engine==='hv3'){await click(c,'أكّد حصاد الخلية بمساعدة');}
            else if (engine === 'fp3') {
              const preview = c.getByRole('button', { name: 'ابدأ الخطوات الآن', exact: true });
              if (await preview.count() && await preview.isEnabled()) await preview.click();
              if (await c.getByTestId('confirm').isEnabled()) await c.getByTestId('confirm').click(); else if (status(s) === 'paused' || status(s) === 'suspended') await c.getByRole('button', { name: /متابعة/ }).first().click();
            } else if (engine === 'cc3') {
              const target = await c.getByTestId('zone-map').getAttribute('data-target');
              await c.getByTestId('zone-' + target).click(); await c.getByTestId('confirm').click();
            } else if(engine==='fr3'||engine==='pv3')await c.getByTestId('next').click();
        else if (engine === 'build3') {
              const piece = c.locator('[data-piece]:not([disabled])').first(); const key = await piece.getAttribute('data-piece');
              await piece.click(); await c.locator(`[data-target="${key}"]`).click();
            } else if (engine === 'mirror3') {
              // All poses use the real documented assistance control; motion is separately exercised.
              if (s.pose === 0) await c.getByRole('button', { name: '↗ قليلًا', exact: true }).first().click();
              await click(c, 'قبول بمساعدة المعالج');
            } else if (engine === 'hex3') {
              if (s.phase === 'prep') await click(c, 'ابدأ التحذير');
              if (s.phase !== 'restoring') { const safe = c.locator('[data-tile][data-state="SAFE"]').first(); if (await safe.count()) { await safe.click(); const confirm = c.getByRole('button', { name: 'أكّد: وصل لبلاطة آمنة', exact: true }); if (await confirm.isEnabled()) await confirm.click(); } }
            } else if (engine === 'dome3') {
              // Public assistance attracts the virtual hand along the real path and uses real dwell time.
              const assist = c.getByRole('button',{name:'مساعدة الحركة',exact:true}); if(await assist.isEnabled()) await assist.click({force:true}); await sleep(500);
            } else if (engine === 'bw3') await c.getByRole('button', { name: actions % 3 === 0 ? 'إزهار بمساعدة' : /أكّد الإزهار/ }).click();
            else if (engine === 'bq3') {
              const field = c.locator(cs), color = await field.getAttribute('data-target');
              const balloon = field.locator(`[data-balloon-id][data-color="${color}"] button`).first();
              if (await balloon.count()) await balloon.click({ force: true });
            }
            actions++; await sleep(engine === 'bq3' ? 220 : 160);
          }
          const completed = await state();
          assert(['stage-complete', 'complete', 'completed'].includes(status(completed)), `${id} stage ${index + 1}: ${status(completed)}`);
          await sync();
          const summary = { index, lifecycle: status(completed), actions, elapsedMs: Date.now() - began, authoritativeCompleted: completed.completed || completed.results || completed.accepted || completed.stage?.goalDone };
          row.stages.push(summary); save(); console.log('COMPLETED', id, row.projection, index + 1, actions);
          await d.screenshot({ path: out + '/' + id + '-' + row.projection.toLowerCase() + '-stage-' + (index + 1) + '.png' });
          if (index < 8) { if(engine==='fr3'||engine==='pv3')await c.getByTestId('next').click();else await click(c, 'المرحلة التالية'); await until(async () => stage(await state()) === index + 1); }
        }
        if(engine==='fr3'||engine==='pv3')await c.getByTestId('next').click();
        else if (engine === 'build3') await click(c, 'عرض الملخص');
        else if (engine === 'bw3') await click(c, 'إنهاء والنتائج');
        else if (engine !== 'bq3') await click(c, engine === 'mirror3' ? 'إنهاء الرحلة' : 'إنهاء الجلسة');
        const added = await until(async () => Object.entries(await db.read('sessions/sp9-patient') || {}).filter(([key]) => !beforeRows.includes(key)).length > 0);
        assert(added); await sleep(1000);
        const histories = Object.entries(await db.read('sessions/sp9-patient') || {}).filter(([key]) => !beforeRows.includes(key));
        assert.equal(histories.length, 1); row.history = histories[0][1]; assert.equal(row.history.gameId, id); assert.equal(row.history.completedStageCount, 9);
        await c.reload(); await c.locator(cs).first().waitFor(); await sleep(1500);
        assert.equal(Object.keys(await db.read('sessions/sp9-patient') || {}).length, beforeRows.length + 1);
        await c.goto(base + '/control/patients/sp9-patient/sessions/' + histories[0][0]);
        await c.waitForTimeout(800); row.historyText = (await c.locator('body').innerText()).slice(0,5000); assert(!row.historyText.includes('لم يتم العثور'));
        await c.screenshot({ path: out + '/' + id + '-' + row.projection.toLowerCase() + '-history.png', fullPage: true });
        row.checks.push('one history row, nine completed stages, reload save-once, patient detail'); row.status = 'passed';
      } catch (e) { row.status = 'incomplete'; row.failure = String(e.stack || e); console.error('INCOMPLETE', id, row.projection, row.failure); }
      save();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
