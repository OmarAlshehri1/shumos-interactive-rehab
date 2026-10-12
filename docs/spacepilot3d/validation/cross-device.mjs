import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? '/Users/omaralshehri/.npm/_npx/5c6d8c4f680fcd0a/node_modules/playwright');
const base = process.env.SP_TEST_ORIGIN ?? 'http://127.0.0.1:3100', DB = process.env.DB_ORIGIN ?? 'http://127.0.0.1:9000', NS = process.env.DB_NS ?? 'demo-bq3-default-rtdb', AUTH_ORIGIN = process.env.AUTH_ORIGIN ?? 'http://127.0.0.1:9099';
const admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const dburl = p => `${DB}/${p}.json?ns=${NS}`;
const put = async (p, body) => { const r = await fetch(dburl(p), { method: 'PUT', headers: admin, body: JSON.stringify(body) }); assert.equal(r.status, 200, await r.text()); };
const read = async p => (await fetch(dburl(p), { headers: admin })).json();
/** The live Space Pilot record on the shared /liveSession (what used to be a dedicated room). */
const room = async () => { const l = await read('liveSession'); return { sessionId: l.sessionId, revision: l.revision, ...l.session.sp3 }; };
/** A brand-new session: clears the shared record the way leaving the page does (a hard navigation would otherwise recover the old one). */
const fresh = async () => { await put('liveSession', null); };
const suffix = Date.now(), email = `sp-browser-${suffix}@example.test`, password = 'emulator-only-password123', patientId = `sp-browser-${suffix}`;
const signup = await fetch(`${AUTH_ORIGIN}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
assert.equal(signup.status, 200); const uid = (await signup.json()).localId;
await put(`staff/${uid}`, { active: true, role: 'therapist' });
await put(`patients/${patientId}`, { patientNumber: `SP${suffix}`, firstName: 'اختبار', createdAt: 1, updatedAt: 1, createdByUid: uid, active: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
const errors = [], externalFirebase = [], checks = [], measurements = [];
const passed = text => { checks.push(text); console.log('CHECK', text); };
let c, d, control, display, sensorContext;
let lastWrite;
try {
  c = await browser.newContext({ viewport: { width: 1024, height: 900 }, hasTouch: true });
  d = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  for (const context of [c, d]) context.on('page', p => { p.on('pageerror', e => errors.push(e.message)); p.on('request', r => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname) && /firebaseio|firebasedatabase|identitytoolkit|securetoken/.test(u.href)) externalFirebase.push(u.href); }); });
  await c.addInitScript(patientId => { if (!sessionStorage.getItem('sp.validation.walkIn')) sessionStorage.setItem('shumos.control.selectedPatient', JSON.stringify({ patientId, patientNumber: 'SP', firstName: 'اختبار' })); }, patientId);
  control = await c.newPage(); display = await d.newPage();
  control.on('websocket', ws => ws.on('framesent', frame => { try { const m = JSON.parse(String(frame.payload)); if (m.d?.a === 'p' && String(m.d?.b?.p) === '/liveSession') { const r = m.d.b.d; lastWrite = { path: m.d.b.p, fields: { ...r, payload: r?.payload ? `length ${r.payload.length}` : null } }; } } catch {} }));
  await control.goto(base + '/control/activities');
  await control.getByLabel('البريد الإلكتروني', { exact: true }).fill(email);
  await control.getByLabel('كلمة المرور', { exact: true }).fill(password);
  await control.getByRole('button', { name: 'تسجيل الدخول', exact: true }).tap();
  const card = control.locator('a[href="/control/space-pilot"]'); await card.waitFor(); assert.equal(await card.count(), 1); await card.tap();
  const link = control.getByRole('link', { name: 'فتح شاشة الطفل', exact: true }); await link.waitFor();
  assert.equal(await link.getAttribute('href'), '/display'); await control.waitForTimeout(2000); const sid = (await room()).sessionId; assert(sid);
  await display.goto(base + '/display');
  const life = p => p.getByTestId('session-lifecycle');
  await control.getByRole('button', { name: 'بدء الجلسة', exact: true }).waitFor();
  await control.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent === 'بدء الجلسة')?.disabled, null, { timeout: 20000 });
  passed('Production library: one canonical Space Pilot card; active staff Control and independent anonymous normal /display automatically joins the room.');
  const act = async (name, expected) => { await control.getByRole('button', { name, exact: true }).tap(); if (expected) await control.locator(`[data-testid="session-lifecycle"][data-lifecycle="${expected}"]`).waitFor({ timeout: 15000 }); };
  await act('بدء الجلسة', 'running');
  await display.locator('[data-testid="session-lifecycle"][data-lifecycle="running"]').waitFor();
  const pointer = async (id, type, pointerId, pointerType = 'touch') => control.getByTestId(`flight-${id}`).evaluate((e, { type, pointerId, pointerType }) => {
    // Dispatch through the real React pointer handlers. Native capture is replaced
    // only because synthetic events do not establish a browser pointer stream.
    if (type === 'pointerdown') e.setPointerCapture = () => {};
    e.dispatchEvent(new PointerEvent(type, { pointerId, pointerType, bubbles: true, cancelable: true, buttons: type === 'pointerdown' ? 1 : 0 }));
  }, { type, pointerId, pointerType });
  await pointer('right', 'pointerdown', 1); await control.waitForTimeout(500);
  let checkpoint = JSON.parse((await room()).payload);
  assert.equal(checkpoint.frame.ship.controlX, 1); assert(checkpoint.frame.ship.x > 0);
  await pointer('right', 'pointerup', 1); await control.waitForTimeout(300);
  checkpoint = JSON.parse((await room()).payload); assert.equal(checkpoint.frame.ship.controlX, .5);
  passed('Touch press-and-hold advances flight; pointer release returns accepted steering to neutral.');
  await act('إيقاف مؤقت', 'paused'); await act('متابعة', 'running'); await act('إعادة الرحلة', 'paused');
  passed('Pause/resume/restart work across independent contexts.');
  await control.reload(); await control.getByRole('button', { name: 'متابعة', exact: true }).waitFor({ timeout: 25000 });
  await control.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent === 'متابعة')?.disabled, null, { timeout: 25000 });
  await act('متابعة', 'running');
  await display.reload(); await control.locator('[data-testid="session-lifecycle"][data-lifecycle="suspended"]').waitFor({ timeout: 15000 });
  await control.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent === 'متابعة')?.disabled, null, { timeout: 20000 });
  await act('متابعة', 'running'); passed('Control and Display reload preserve run progress and require safe resume.');
  await act('إنهاء الجلسة', 'ended');
  await control.locator('[data-testid="cloud-status"][data-history="saved"]').waitFor({ timeout: 15000 });
  const history = await read(`sessions/${patientId}/${sid}`); assert.equal(history.resultVersion, 2); assert.equal(history.engine, 'sp3-rings'); assert.equal(history.totalStarsCollected, undefined);
  passed('Immutable versioned patient ring history saved from accepted Control state.');
  // Fresh room, real pointer handlers in every configured mode/difficulty.
  for (const mode of ['EASY', 'MEDIUM', 'ADVANCED']) for (const difficulty of ['LOW', 'MEDIUM', 'HIGH']) {
    await fresh(); await control.goto(base + '/control/space-pilot'); await link.waitFor(); await control.waitForTimeout(1500);
    await control.getByLabel('نمط الطيران', { exact: true }).selectOption(mode);
    await control.getByLabel('الصعوبة', { exact: true }).selectOption(difficulty);
    await display.goto(base + await link.getAttribute('href'));
    await control.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent === 'بدء الجلسة')?.disabled, null, { timeout: 20000 });
    await act('بدء الجلسة', 'running');
    await pointer('right', 'pointerdown', 11); await pointer('up', 'pointerdown', 12); await control.waitForTimeout(400);
    let f = JSON.parse((await room()).payload).frame;
    assert.equal(f.ship.controlX, 1);
    if (mode === 'ADVANCED') { assert.equal(f.ship.controlY, 0); assert(f.ship.y > 0); }
    else if (mode === 'EASY') assert.equal(f.ship.y, 0);
    await pointer('right', 'pointercancel', 11); await pointer('up', 'pointerup', 12); await control.waitForTimeout(250);
    f = JSON.parse((await room()).payload).frame;
    assert.equal(f.ship.controlX, .5); assert.equal(f.ship.controlY, .5);
    if (mode === 'ADVANCED' && difficulty === 'HIGH') {
      // Browser-native simultaneous touch delivery also exercises real pointer capture.
      await control.getByTestId('manual-flight-controls').scrollIntoViewIfNeeded();
      const r = await control.getByTestId('flight-right').boundingBox(), u = await control.getByTestId('flight-up').boundingBox();
      const cdp = await c.newCDPSession(control);
      const touches = [{ x: r.x + r.width/2, y: r.y + r.height/2, id: 31 }, { x: u.x + u.width/2, y: u.y + u.height/2, id: 32 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches }); await control.waitForTimeout(350);
      f = JSON.parse((await room()).payload).frame;
      assert.equal(f.ship.controlX, 1); assert.equal(f.ship.controlY, 0);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await control.waitForTimeout(250);
      f = JSON.parse((await room()).payload).frame; assert.equal(f.ship.controlX, .5); assert.equal(f.ship.controlY, .5);
      await cdp.detach();
    }
    await act('إنهاء الجلسة', 'ended');
  }
  passed('All nine flight-mode/difficulty configurations accept touch steering/cancellation; EASY stays level and ADVANCED accepts native multi-touch diagonals.');
  await fresh(); await control.goto(base + '/control/space-pilot'); await link.waitFor(); await control.waitForTimeout(1500);
  await control.getByLabel('نمط الطيران', { exact: true }).selectOption('ADVANCED');
  await control.getByLabel('طريقة التحكم', { exact: true }).selectOption('sensor');
  await display.goto(base + await link.getAttribute('href'));
  const sensorId = (await room()).sessionId;
  await control.evaluate(() => {
    const ch = new BroadcastChannel('shumos-sensor-pointer'); let seq = 0;
    window.__spSensor = { x: .5, y: .5, visible: true };
    window.__spSensorTimer = setInterval(() => ch.postMessage({ role: 'RIGHT_HAND', ...window.__spSensor, seq: ++seq, sentAtMs: Date.now() }), 20);
  });
  await control.locator('[data-testid="sensor-status"][data-status="tracking"]').waitFor({ timeout: 15000 });
  await act('بدء الجلسة', 'running');
  await control.evaluate(() => { window.__spSensor.x = .7; window.__spSensor.y = .3; }); await control.waitForTimeout(500);
  let f = JSON.parse((await room()).payload).frame; assert.equal(f.ship.controlX, .7);
  await control.getByTestId('manual-override').tap();
  await pointer('left', 'pointerdown', 41); await pointer('down', 'pointerdown', 42); await control.waitForTimeout(350);
  f = JSON.parse((await room()).payload).frame; assert.equal(f.ship.controlX, 0); assert.equal(f.ship.controlY, 1);
  await pointer('left', 'pointerup', 41); await pointer('down', 'pointerup', 42);
  await control.getByTestId('manual-override').tap();
  await control.locator('[data-testid="session-lifecycle"][data-lifecycle="suspended"]').waitFor();
  await control.evaluate(() => { window.__spSensor.x = .5; window.__spSensor.y = .5; });
  await control.locator('[data-testid="sensor-status"][data-status="tracking"]').waitFor();
  await act('متابعة', 'running');
  await control.evaluate(() => clearInterval(window.__spSensorTimer));
  await control.locator('[data-testid="session-lifecycle"][data-lifecycle="suspended"]').waitFor();
  await control.getByTestId('manual-override').tap(); await act('متابعة', 'running');
  await pointer('right', 'pointerdown', 51); await control.waitForTimeout(350);
  f = JSON.parse((await room()).payload).frame; assert.equal(f.ship.controlX, 1);
  await pointer('right', 'pointerup', 51);
  passed('Normalized RIGHT_HAND simulation, manual priority, safe sensor pickup, disconnect suspension and immediate explicit manual fallback.');
  const beforeOffline = await room();
  await c.setOffline(true); await control.waitForTimeout(3500);
  await display.locator('[data-testid="session-lifecycle"][data-lifecycle="disconnected"]').waitFor();
  await c.setOffline(false);
  await control.locator('[data-testid="cloud-status"][data-connected="true"]').waitFor({ timeout: 25000 });
  assert.equal(JSON.parse((await room()).payload).state.stats.ringsCollected, JSON.parse(beforeOffline.payload).state.stats.ringsCollected);
  assert.equal(await life(control).getAttribute('data-lifecycle'), 'suspended');
  passed('Network loss freezes presentation and clears steering; reconnect restores accepted scoring in suspended state.');
  // Independent authenticated laptop relay; therapist and sensor source clocks differ.
  await control.getByLabel('مصدر اليد اليمنى', { exact: true }).selectOption('remote');
  sensorContext = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  await sensorContext.addInitScript(() => { const nativeNow = Date.now; Date.now = () => nativeNow() + 120000; });
  const source = await sensorContext.newPage();
  source.on('pageerror', e => errors.push(e.message));
  source.on('request', r => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname) && /firebaseio|firebasedatabase|identitytoolkit|securetoken/.test(u.href)) externalFirebase.push(u.href); });
  await source.goto(base + `/control/space-pilot/sensor-source?session=${sensorId}`);
  await source.getByLabel('البريد الإلكتروني', { exact: true }).fill(email);
  await source.getByLabel('كلمة المرور', { exact: true }).fill(password);
  await source.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await source.getByTestId('sensor-relay-status').waitFor();
  const held = JSON.parse((await room()).payload).frame.ship;
  await source.evaluate(held => {
    const ch = new BroadcastChannel('shumos-sensor-pointer'); let seq = 0;
    window.__spSensor = { x: held.controlX, y: held.controlY, visible: true };
    window.__spSensorTimer = setInterval(() => ch.postMessage({ role: 'RIGHT_HAND', ...window.__spSensor, seq: ++seq, sentAtMs: Date.now() }), 20);
  }, held);
  await control.locator('[data-testid="sensor-status"][data-status="tracking"]').waitFor({ timeout: 20000 });
  await act('متابعة', 'running');
  await source.evaluate(() => { window.__spSensor.x = .7; window.__spSensor.y = .3; }); await control.waitForTimeout(500);
  f = JSON.parse((await room()).payload).frame; assert.equal(f.ship.controlX, .7); assert.equal(f.ship.controlY, .3);
  await source.evaluate(() => clearInterval(window.__spSensorTimer));
  await control.locator('[data-testid="session-lifecycle"][data-lifecycle="suspended"]').waitFor();
  await control.getByTestId('manual-override').tap(); await act('متابعة', 'running');
  await pointer('left', 'pointerdown', 61); await control.waitForTimeout(350);
  f = JSON.parse((await room()).payload).frame; assert.equal(f.ship.controlX, 0);
  await pointer('left', 'pointerup', 61); await sensorContext.close(); sensorContext = null;
  passed('A separately authenticated laptop relays the unchanged filtered RIGHT_HAND protocol across Firebase despite two minutes of clock skew; stale relay input suspends and manual override continues immediately.');
  await act('إنهاء الجلسة', 'ended');
  // A real three-mission flight through the therapist's directional pointer handlers.
  await fresh(); await control.goto(base + '/control/space-pilot'); await link.waitFor(); await control.waitForTimeout(1500);
  await control.getByLabel('الصعوبة', { exact: true }).selectOption('LOW');
  await control.getByLabel('نمط الطيران', { exact: true }).selectOption('EASY');
  await control.getByLabel('تطوير المركبة', { exact: true }).selectOption('2/5');
  await display.goto(base + await link.getAttribute('href'));
  await control.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent === 'بدء الجلسة')?.disabled, null, { timeout: 20000 });
  const flightId = (await room()).sessionId;
  const ownedBefore = await room();
  const competitor = await c.newPage(); await competitor.goto(base + '/control/space-pilot');
  await competitor.getByTestId('sp-recovery-blocked').waitFor({ timeout: 30000 });
  assert.equal((await room()).epoch, ownedBefore.epoch); await competitor.close();
  passed('A second Control tab using the same authenticated staff account is blocked from silently taking over the live session.');
  await control.bringToFront();
  await control.waitForTimeout(1500);
  await act('بدء الجلسة', 'running');
  let direction = 0, snapshots = 0, bytes = 0, maxPayload = 0;
  const flightStarted = Date.now();
  for (let mission = 0; mission < 3; mission++) {
    for (let i = 0; i < 1500; i++) {
      const r = await room(), cp = JSON.parse(r.payload);
      snapshots++; bytes += r.payload.length; maxPayload = Math.max(maxPayload, r.payload.length);
      if (['mission-complete', 'completed'].includes(cp.state.lifecycle)) break;
      assert.equal(cp.state.lifecycle, 'running');
      const ship = cp.frame.ship, object = cp.frame.objects.find(o => o.outcome === 'pending');
      const depth = Math.max(10, ship.z - object.z);
      const x = object.kind === 'ring' ? object.x : object.x + (object.x > 0 ? -10 : 10);
      const target = Math.atan2((x - ship.x) * 2, depth);
      const next = Math.abs(target) > .005 && (Math.sign(target) !== Math.sign(ship.yaw) || Math.abs(ship.yaw) < Math.abs(target)) ? Math.sign(target) : 0;
      if (next !== direction) {
        if (direction) await pointer(direction > 0 ? 'right' : 'left', 'pointerup', 71);
        if (next) await pointer(next > 0 ? 'right' : 'left', 'pointerdown', 71);
        direction = next;
      }
      await control.waitForTimeout(100);
    }
    if (direction) { await pointer(direction > 0 ? 'right' : 'left', 'pointerup', 71); direction = 0; }
    if (mission < 2) await act(`بدء المهمة ${mission + 2 === 2 ? '٢' : '٣'}`, 'running');
  }
  const finalRoom = await room(), finalState = JSON.parse(finalRoom.payload).state;
  assert.equal(finalState.lifecycle, 'completed'); assert.equal(finalState.stats.ringsCollected, 15);
  assert.equal(finalState.stats.asteroidCollisions, 0); assert.equal(finalState.stats.resolved, 18);
  assert.equal(finalState.stats.upgradeTier, 3); assert.equal(finalState.stats.completedMissions, 3);
  assert.equal(new Set(finalState.outcomes.map(e => `${e.sessionId}/${e.runId}/${e.objectId}`)).size, 18);
  await display.waitForFunction(() => document.querySelector('[data-testid="session-stats"]')?.dataset.collected === '15');
  await control.locator('[data-testid="cloud-status"][data-history="saved"]').waitFor();
  const completed = await read(`sessions/${patientId}/${flightId}`); assert.equal(completed.totalRingsCollected, 15); assert.equal(completed.score, 1500);
  passed('Actual therapist pointer controls complete all three EASY/LOW missions, collect all 15 rings, avoid all three asteroids, reach both upgrade tiers, and save exactly-once accepted results.');
  measurements.push({ flightSeconds: (Date.now() - flightStarted)/1000, sampledSnapshots: snapshots, sampledPayloadBytes: bytes, maxPayloadBytes: maxPayload, acceptedRevision: finalRoom.revision });
  measurements.push(JSON.parse(await display.locator('canvas').getAttribute('data-graphics-metrics')));
  await display.screenshot({ path: 'docs/spacepilot3d/screenshots/cross-device-complete.png' });
  await control.evaluate(() => { sessionStorage.setItem('sp.validation.walkIn', 'true'); sessionStorage.removeItem('shumos.control.selectedPatient'); });
  await fresh(); await control.goto(base + '/control/space-pilot'); await link.waitFor(); await control.waitForTimeout(1500);
  const walkInId = (await room()).sessionId;
  await display.goto(base + await link.getAttribute('href'));
  await control.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent === 'بدء الجلسة')?.disabled, null, { timeout: 20000 });
  await act('بدء الجلسة', 'running'); await act('إنهاء الجلسة', 'ended');
  await control.locator('[data-testid="cloud-status"][data-history="walk-in"]').waitFor();
  assert.equal(await read('liveSession/patientId'), null); assert.equal(await read(`sessions/${patientId}/${walkInId}`), null);
  passed('Walk-in sessions publish no patient binding and do not write patient history.');


  assert.deepEqual(errors, []); assert.deepEqual(externalFirebase, []);
  writeFileSync('docs/spacepilot3d/validation/cross-device.json', JSON.stringify({ passed: true, checks, errors, externalFirebase, measurements, emulatorsOnly: true }, null, 2)); console.log('PASS', checks);
} catch (e) {
  if (control && !control.isClosed()) console.log('CONTROL', (await control.locator('body').innerText()).slice(0, 6000));
  if (display && !display.isClosed()) console.log('DISPLAY', (await display.locator('body').innerText()).slice(0, 1200));
  console.log('ERRORS', errors, 'LAST_WRITE', lastWrite); throw e;
} finally { await c?.close(); await d?.close(); await sensorContext?.close(); await browser.close(); }
