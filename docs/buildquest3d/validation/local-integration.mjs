import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { STAGES, project } from './stage-manifest.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? '/Users/omaralshehri/.npm/_npx/5c6d8c4f680fcd0a/node_modules/playwright');
const browser = await chromium.launch({ headless: false, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const checks = [], errors = [], cloudRequests = [];
try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  context.on('page', page => {
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (/firebaseio|firebasedatabase|identitytoolkit|securetoken/.test(r.url())) cloudRequests.push(r.url()); });
  });
  const control = await context.newPage();
  const origin = process.env.DEMO_ORIGIN ?? 'http://127.0.0.1:3128';
  await control.goto(origin + '/control/activities');
  const card = control.locator('a[href="/control/build-quest-3d"]');
  await card.waitFor({ timeout: 60000 });
  assert.equal(await card.count(), 1);
  assert.match(await card.innerText(), /عالم البناء/);
  assert.match(await card.innerText(), /العتاد بانتظار التحقق/);
  assert.equal(await card.locator('svg').count() > 0, true);
  for (const id of ['balloon-quest', 'runner-quest-3d', 'space-pilot']) assert.equal(await control.locator(`a[href="/control/${id}"]`).count(), 1);
  checks.push('Normal library card, Arabic name, thumbnail, pending hardware label and other games');
  await card.click();
  const childLink = control.getByRole('link', { name: 'فتح شاشة الطفل', exact: true });
  await childLink.waitFor({ timeout: 60000 });
  assert.match(control.url(), /\/control\/build-quest-3d\?session=[a-z0-9-]+$/);
  const href = await childLink.getAttribute('href');
  assert.equal(href, '/display/build-quest-3d?' + new URL(control.url()).searchParams.toString());
  assert.deepEqual(await control.getByLabel('طريقة التحكم', { exact: true }).locator('option').evaluateAll(xs => xs.map(x => x.value)), ['mouse', 'sensor', 'controller']);
  for (const [level, count] of [['1', 3], ['2', 3], ['3', 3]]) {
    await control.getByLabel('الصعوبة', { exact: true }).selectOption(level);
    assert.equal(await control.getByLabel('المرحلة', { exact: true }).locator('option').count(), count);
  }
  await control.getByLabel('الصعوبة', { exact: true }).selectOption('1');
  checks.push('Library opens session-specific Control; all nine stages and three input methods preserved');
  const display = await context.newPage();
  await display.goto(origin + href);
  await display.locator('canvas').waitFor({ timeout: 60000 });
  await control.getByRole('button', { name: 'بدء الجلسة', exact: true }).click();
  await display.locator('[data-status="running"]').waitFor();
  const box = await display.locator('canvas').boundingBox();
  const piece = STAGES[0].pieces[0], source = project(piece.source), target = project(piece.target);
  await display.mouse.click(box.x + source.x * box.width, box.y + source.y * box.height);
  await display.waitForTimeout(250);
  await display.mouse.move(box.x + target.x * box.width, box.y + target.y * box.height, { steps: 12 });
  await display.waitForFunction(() => document.querySelector('[data-testid="build-state"]')?.dataset.placed === '1');
  await control.getByRole('button', { name: 'إيقاف مؤقت', exact: true }).click();
  await display.locator('[data-status="paused"]').waitFor();
  await control.getByRole('button', { name: 'إنهاء الجلسة', exact: true }).click();
  await display.locator('[data-status="ended"]').waitFor();
  checks.push('Normal child link renders 3D Display; placement and therapist pause/end synchronize locally');
  await control.getByRole('link', { name: 'مكتبة الأنشطة', exact: true }).click();
  await control.locator('a[href="/control/build-quest-3d"]').waitFor();
  assert.deepEqual(cloudRequests, []);
  assert.deepEqual(errors, []);
  checks.push('Return to normal library; demo integration has no Firebase traffic or browser errors');
  await context.close();

  // Separate configured environment: never enter credentials or allow database traffic.
  const configured = await browser.newContext();
  const databaseRequests = [], authErrors = [];
  await configured.route(/https?:\/\/[^/]*(firebaseio\.com|firebasedatabase\.app)/, async route => { databaseRequests.push('database HTTP blocked'); await route.abort(); });
  const page = await configured.newPage();
  page.on('pageerror', e => authErrors.push(e.message));
  for (const path of ['/control/activities', '/control/build-quest-3d']) {
    await page.goto((process.env.CONFIGURED_ORIGIN ?? 'http://127.0.0.1:3000') + path);
    await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).waitFor({ timeout: 60000 });
    assert.equal(await page.getByRole('button', { name: 'بدء الجلسة', exact: true }).count(), 0);
    assert.equal(await page.getByRole('link', { name: 'فتح شاشة الطفل', exact: true }).count(), 0);
  }
  await page.goto((process.env.CONFIGURED_ORIGIN ?? 'http://127.0.0.1:3000') + href);
  await page.getByText('بانتظار الأخصائي لبدء رحلة البناء', { exact: true }).waitFor();
  assert.deepEqual(authErrors, []);
  checks.push('Configured Firebase development serves both routes, retains staff login gate and blocks unauthenticated gameplay');
  await configured.close();
  writeFileSync('docs/buildquest3d/validation/local-integration.json', JSON.stringify({ passed: true, checks, errors, cloudRequests, configuredDatabaseRequests: databaseRequests, credentialsEntered: false, authenticatedConfiguredSessionTested: false }, null, 2));
  console.log('PASS:', checks);
} finally { await browser.close(); }
