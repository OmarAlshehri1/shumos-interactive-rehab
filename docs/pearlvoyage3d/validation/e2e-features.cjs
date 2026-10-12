const L = require('./e2elib.cjs');
const out = process.argv[2];
const rd = async p => (await fetch(`http://127.0.0.1:19700/${p}.json?ns=demo-pearl-voyage-rules-default-rtdb`, { headers: { Authorization: 'Bearer owner' } })).json();
L.fs.mkdirSync(out + '/shots', { recursive: true });
const pct = (a, q) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))];
(async () => {
  const { browser, c, d, errors } = await L.open({ out, video: true });
  const tap = async id => { await c.getByTestId(id).tap({ timeout: 15000 }); };
  const cs = async () => L.cData(c), ds = async () => L.dData(d);
  const setCheck = async (id, on) => { const el = c.getByTestId(id); if ((await el.isChecked()) !== on) await el.tap({ timeout: 15000 }); };
  const setRange = async (id, v) => c.getByTestId(id).evaluate((el, x) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(x)); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  await L.login(c);
  await c.goto(L.BASE + '/control/patients/patient-1', { waitUntil: 'domcontentloaded' });
  await c.getByRole('button', { name: 'بدء جلسة جديدة', exact: true }).waitFor({ timeout: 60000 });
  await d.goto(L.BASE + '/display', { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 8 && !c.url().includes('/control/activities'); i++) { await c.getByRole('button', { name: 'بدء جلسة جديدة', exact: true }).tap().catch(() => {}); await L.sleep(1500); }
  await c.locator('[data-game-card="pearl-voyage-3d"]').tap();
  await c.getByTestId('pv-control').waitFor({ timeout: 90000 });
  await d.getByTestId('pv-view').waitFor({ timeout: 90000 });
  await L.sleep(3000);
  // ---- auto navigation + auto hold, stage 2 (two encounters)
  await tap('stage-1'); await setRange('config-holdSeconds', 1.5); await setRange('config-speedCap', 6);
  await setCheck('auto-drive', true); await setCheck('auto-hold', true);
  await tap('start');
  await L.until(async () => +(await cs()).speed > 0.5, 8000);
  L.note('auto-navigation drives the boat with no touch', +(await cs()).speed > 0.5);
  // ---- command-to-display latency
  const lat = [];
  for (let i = 0; i < 12; i++) {
    const want = i % 2 === 0 ? 'paused' : 'running';
    const t0 = Date.now(); await tap(want === 'paused' ? 'pause' : 'resume');
    await L.until(async () => (await ds()).status === want, 5000, 15);
    lat.push(Date.now() - t0);
    await L.sleep(250);
  }
  if ((await cs()).status === 'paused') await tap('resume');
  L.note('input-to-display latency', pct(lat, 0.5) < 800, `p50=${pct(lat, 0.5)}ms p95=${pct(lat, 0.95)}ms (includes tap dispatch), n=${lat.length}`);
  // ---- reload recovery after the first discovery
  await L.until(async () => +(await cs()).events >= 1, 90000);
  const before = await cs();
  await c.reload({ waitUntil: 'domcontentloaded' });
  await c.getByTestId('pv-control').waitFor({ timeout: 90000 });
  await L.sleep(2500);
  const after = await cs();
  L.note('reload recovery keeps progress and pauses safely', after.status === 'paused' && after.safety === '1' && +after.events >= +before.events && after.stage === before.stage && after.speed === '0.000', `before events=${before.events} -> after events=${after.events} status=${after.status}`);
  await L.sleep(1500);
  const dsr = await ds();
  L.note('display survives the control reload', dsr.stage === after.stage && dsr.events === after.events, JSON.stringify({ status: dsr.status }));
  await tap('resume');
  await L.until(async () => (await cs()).status === 'stage-complete', 120000);
  L.note('stage completes after recovery', (await cs()).status === 'stage-complete');
  await d.screenshot({ path: out + '/shots/features-gallery.png' });
  // ---- skip encounter / repeat / encounter select / restart / skip stage on stage 3
  await tap('next'); await L.until(async () => (await cs()).status === 'ready', 8000);
  await setCheck('auto-drive', false); await setCheck('auto-hold', false);
  await tap('start'); await L.sleep(800);
  await tap('skip-objective');
  await L.until(async () => +(await cs()).events === 3 + 0 + 1 + 1 || true, 500);
  let s = await cs();
  const skipRec = (await rd('liveSession')).session.pv3.payload;
  L.note('skip encounter records a skipped encounter and moves on', JSON.parse(skipRec).events.some(e => e.stage === 2 && e.outcome === 'skipped') && s.marker === '1', `marker=${s.marker}`);
  await tap('repeat'); await L.sleep(500);
  const rep = JSON.parse((await rd('liveSession')).session.pv3.payload);
  L.note('repeat encounter reopens the encounter and counts the repeat', rep.repeats === 1 && rep.phase === 'sailing');
  await tap('marker-2'); await L.sleep(500);
  L.note('encounter selection jumps to the chosen marker', (await cs()).marker === '2');
  await tap('pause'); await tap('restart'); await L.sleep(500);
  s = await cs();
  L.note('restart stage resets position and status', s.status === 'ready' && s.marker === '0' && s.x === '0.00');
  await tap('start'); await tap('skip-stage'); await L.sleep(600);
  s = await cs();
  L.note('skip stage ends the stage as skipped', s.status === 'stage-complete' && s.skipped === '1', `skipped=${s.skipped}`);
  await tap('stage-4'); await L.sleep(500);
  L.note('stage selection works from the therapist panel', (await cs()).stage === '4' && (await cs()).status === 'ready');
  // ---- hardware selection with no device: safe pause, manual fallback
  await c.getByTestId('config-control').selectOption('wheel'); await L.sleep(400);
  await tap('start'); await L.sleep(1500);
  s = await cs();
  L.note('missing wheel pauses safely and flags lost input', s.status === 'paused' && s.safety === '1', `status=${s.status}`);
  await tap('manual-fallback'); await L.sleep(400); await tap('resume'); await L.sleep(500);
  L.note('therapist manual fallback resumes play at any time', (await cs()).status === 'running' && (await cs()).control === 'manual');
  // ---- accessibility and graphics
  await setCheck('config-reducedMotion', true); await setCheck('config-highContrast', true); await setCheck('config-sound', true);
  await L.sleep(800);
  await d.screenshot({ path: out + '/shots/features-reduced-contrast.png' });
  await setCheck('config-reducedMotion', false); await setCheck('config-highContrast', false); await setCheck('config-sound', false);
  for (const q of ['medium', 'low', 'high']) { await c.getByTestId('config-quality').selectOption(q); await L.sleep(3500); const f = await ds(); L.note(`quality ${q} renders`, +f.fps > 0, `fps=${f.fps} draws=${f.drawCalls} tris=${f.triangles}`); await d.screenshot({ path: `${out}/shots/features-quality-${q}.png` }); }
  await tap('end'); await L.until(async () => (await cs()).history === 'saved', 15000);
  const rows = Object.values((await rd('sessions/patient-1')) || {});
  const h = rows[rows.length - 1] || {};
  L.note('feature session saved once with honest counts', rows.length === 1 && h.skippedEncounters >= 1 && h.participationMode === 'MIXED' && h.repeatedEncounters >= 1, JSON.stringify({ n: rows.length, skipped: h.skippedEncounters, fish: h.fishDiscovered, mode: h.participationMode, repeats: h.repeatedEncounters }));
  // ---- staff authorisation: a signed-in non-staff user cannot reach a session
  const outsider = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  const op = await outsider.newPage();
  await L.login(op, 'outsider@example.test');
  await op.goto(L.BASE + '/control/pearl-voyage-3d', { waitUntil: 'domcontentloaded' });
  await L.sleep(6000);
  const hasControl = await op.getByTestId('pv-control').count();
  L.note('non-staff account cannot open the Pearl Voyage control', hasControl === 0, (await op.locator('body').innerText()).slice(0, 80).replace(/\n/g, ' '));
  console.log('ERRORS', JSON.stringify(errors.slice(0, 8)));
  L.note('no console or page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  L.fs.writeFileSync(out + '/features-results.json', JSON.stringify({ results: L.results, latencyMs: lat, errors }, null, 1));
  await d.context().close(); await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FAIL', e.stack || e.message); process.exit(1); });
