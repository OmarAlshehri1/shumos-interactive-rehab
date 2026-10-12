const L = require('./e2elib.cjs');
const fs = L.fs;
const out = process.argv[2];
const markers = JSON.parse(fs.readFileSync(__dirname + '/markers.json', 'utf8'));
const { rd } = (() => ({ rd: async p => (await fetch(`http://127.0.0.1:19700/${p}.json?ns=demo-pearl-voyage-rules-default-rtdb`, { headers: { Authorization: 'Bearer owner' } })).json() }))();
fs.mkdirSync(out + '/shots', { recursive: true });
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
async function setRange(c, testid, value) { await c.getByTestId(testid).evaluate((el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); }, value); }
const perf = { fps: [], heap: [], writes: [], latency: [], draw: [] };
(async () => {
  const { browser, c, d, errors } = await L.open({ out });
  const cdp = await c.context().newCDPSession(c);
  const dcdp = await d.context().newCDPSession(d);
  await dcdp.send('Performance.enable');
  await L.login(c);
  await c.goto(L.BASE + '/control/patients/patient-1', { waitUntil: 'domcontentloaded' });
  await c.getByRole('button', { name: 'بدء جلسة جديدة', exact: true }).waitFor({ timeout: 60000 });
  await d.goto(L.BASE + '/display', { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 8 && !c.url().includes('/control/activities'); i++) { await c.getByRole('button', { name: 'بدء جلسة جديدة', exact: true }).tap().catch(() => {}); await L.sleep(1500); }
  await c.locator('[data-game-card="pearl-voyage-3d"]').tap();
  await c.getByTestId('pv-control').waitFor({ timeout: 90000 });
  await d.getByTestId('pv-view').waitFor({ timeout: 90000 });
  const touch = new L.Touch(c, cdp);
  // therapist tunes participation: shorter hold, faster boat
  await setRange(c, 'config-holdSeconds', 1.5);
  await setRange(c, 'config-speedCap', 6);
  await c.waitForTimeout(600);
  L.note('settings sync to the display', (await L.dData(d)).status === 'ready');
  const metrics = async () => { const m = await dcdp.send('Performance.getMetrics'); return Math.round(m.metrics.find(x => x.name === 'JSHeapUsedSize').value / 1048576); };
  perf.heap.push(await metrics());
  let totalSync = 0, syncBad = 0;
  const differs = (a, b) => a.stage !== b.stage || a.phase !== b.phase || a.events !== b.events || a.status !== b.status || Math.hypot(+a.x - +b.pos.split(',')[0], +a.y - +b.pos.split(',')[1]) > 4;
  const checkSync = async label => {
    totalSync++;
    // the display trails the control by one publish interval, so a mismatch must persist across a second sample to count
    let a = await L.cData(c), b = await L.dData(d);
    if (!differs(a, b)) return;
    await L.sleep(450);
    a = await L.cData(c); b = await L.dData(d);
    if (differs(a, b)) { syncBad++; console.log('SYNC DIFF', label, JSON.stringify(a), JSON.stringify(b)); }
  };
  const step = m => console.log('..', new Date().toISOString().slice(11, 19), m);
  for (let stage = 0; stage < 9; stage++) {
    let st = await L.cData(c);
    step('stage ' + stage + ' begin, status=' + st.status);
    if (st.status === 'stage-complete') { await c.getByTestId('next').tap({ timeout: 15000 }); await L.until(async () => (await L.cData(c)).status === 'ready', 8000); }
    st = await L.cData(c);
    if (+st.stage !== stage) { await c.getByTestId(`stage-${stage}`).tap(); await L.until(async () => +(await L.cData(c)).stage === stage, 8000); }
    step('start tap');
    await c.getByTestId('start').tap({ timeout: 15000 });
    await L.until(async () => (await L.cData(c)).status === 'running', 8000);
    step('running');
    const t0 = Date.now(); let shot = false, lastCheck = 0, w0 = null, w0t = 0;
    let sawEncounter = false, sawHoldProgress = false;
    while (Date.now() - t0 < 240000) {
      const s = await L.cData(c);
      if (s.status === 'stage-complete') break;
      if (s.status !== 'running') { await touch.release(); await c.getByTestId('resume').tap().catch(() => {}); await L.sleep(300); continue; }
      const ids = [];
      if (s.phase === 'sailing') {
        sawEncounter = sawEncounter; const m = markers[stage][+s.marker];
        const diff = wrap(Math.atan2(m[0] - +s.x, m[1] - +s.y) - +s.heading);
        ids.push('throttle');
        if (diff > 0.22) ids.push('steer-right'); else if (diff < -0.22) ids.push('steer-left');
        if (w0 === null && Date.now() - t0 > 4000) { w0 = +(await L.cData(c)).writes; w0t = Date.now(); }
      } else if (s.phase === 'encounter') {
        sawEncounter = true;
        ids.push('hold');
        if (+s.hold > 0.05) sawHoldProgress = true;
        if (!shot && stage % 3 === 0 && +s.hold > 0.4) { shot = true; await c.screenshot({ path: `${out}/shots/s${stage}-control-encounter.png` }); await d.screenshot({ path: `${out}/shots/s${stage}-display-encounter.png` }); }
      }
      await touch.set(ids);
      if (Date.now() - lastCheck > 3000) { lastCheck = Date.now(); await checkSync(`stage ${stage}`); const f = +(await L.dData(d)).fps; if (f) perf.fps.push(f); }
      await L.sleep(100);
    }
    await touch.release();
    if (w0 !== null) { const w1 = +(await L.cData(c)).writes; const dt = (Date.now() - w0t) / 1000; if (dt > 3) perf.writes.push(+((w1 - w0) / dt).toFixed(2)); }
    const done = await L.cData(c);
    L.note(`stage ${stage + 1} completed by manual touch`, done.status === 'stage-complete' && +done.completed === stage + 1 && sawEncounter && sawHoldProgress, `events=${done.events} elapsed=${Math.round((Date.now() - t0) / 1000)}s`);
    await L.until(async () => (await L.dData(d)).status === 'stage-complete', 6000);
    const galleryVisible = await d.getByTestId('pv-gallery').isVisible().catch(() => false);
    L.note(`stage ${stage + 1} gallery shown on the display`, galleryVisible);
    if (stage % 3 === 2 || stage === 0) await d.screenshot({ path: `${out}/shots/s${stage}-display-gallery.png` });
    if (stage % 3 === 2) await c.screenshot({ path: `${out}/shots/s${stage}-control-complete.png` });
    perf.heap.push(await metrics());
  }
  const fin = await L.cData(c);
  L.note('all nine stages completed with 29 fish', +fin.completed === 9 && +fin.events === 29, JSON.stringify({ completed: fin.completed, events: fin.events }));
  L.note('display and control stayed in sync', syncBad === 0, `${totalSync} samples, ${syncBad} mismatches`);
  // end the session: results saved exactly once
  await c.getByTestId('next').tap();
  await L.until(async () => (await L.cData(c)).status === 'ended', 8000);
  await L.until(async () => (await L.cData(c)).history === 'saved', 15000);
  const saved = await rd('sessions/patient-1');
  const rows = Object.values(saved || {});
  L.note('history saved exactly once', rows.length === 1 && (await L.cData(c)).history === 'saved', `records=${rows.length}`);
  const h = rows[0] || {};
  L.note('history is factual and complete', h.gameId === 'pearl-voyage-3d' && h.engine === 'pv3' && h.completedStageCount === 9 && h.fishDiscovered === 29 && h.sessionCompleted === true && h.participationMode === 'MANUAL' && h.assistedEncounters + h.independentEncounters === 29, JSON.stringify({ c: h.completedStageCount, f: h.fishDiscovered, a: h.assistedEncounters, i: h.independentEncounters, m: h.participationMode }));
  await c.reload({ waitUntil: 'domcontentloaded' });
  await L.sleep(6000);
  const after = Object.values((await rd('sessions/patient-1')) || {});
  L.note('reload does not duplicate the saved history', after.length === 1, `records=${after.length}`);
  await d.screenshot({ path: out + '/shots/final-display-journal.png' });
  await c.screenshot({ path: out + '/shots/final-control-results.png' });
  perf.heap.push(await metrics());
  const med = a => a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : null;
  console.log('PERF', JSON.stringify({ fpsMedian: med(perf.fps), fpsMin: Math.min(...perf.fps), heapMB: perf.heap, writesPerSec: perf.writes }));
  fs.writeFileSync(out + '/play-results.json', JSON.stringify({ results: L.results, perf, errors }, null, 1));
  console.log('ERRORS', JSON.stringify(errors.slice(0, 8)));
  await browser.close();
})().catch(e => { console.error('FAIL', e.stack || e.message); process.exit(1); });
