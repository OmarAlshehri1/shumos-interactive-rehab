const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("node:fs"),
  assert = require("node:assert/strict");
const base = "http://127.0.0.1:3399",
  db = "http://127.0.0.1:19940",
  ns = "demo-balance-default-rtdb",
  out = "docs/balancebridge3d/evidence";
let browser, restore;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function read() {
  return (
    await fetch(`${db}/liveSession.json?ns=${ns}`, {
      headers: { Authorization: "Bearer owner" },
    })
  ).json();
}
async function state() {
  const r = await read();
  return JSON.parse(r.session.bb3.payload);
}
async function until(fn) {
  let at = Date.now();
  while (Date.now() - at < 35000) {
    if (await fn()) return;
    await sleep(150);
  }
  throw Error("Timeout " + fn.toString());
}
async function setup(context, route = "/control/balance-bridge-3d") {
  await context.addInitScript(() =>
    sessionStorage.setItem(
      "shumos.control.selectedPatient",
      JSON.stringify({
        patientId: "bridge-patient",
        patientNumber: "bridge-qa",
        firstName: "بطل",
      }),
    ),
  );
  const page = await context.newPage();
  await page.route("**/api/tts", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"error":"Local QA: upstream blocked"}',
    }),
  );
  await page.goto(base + route);
  await page.getByRole("textbox").first().fill("bridge-qa@example.test");
  await page.locator("input[type=password]").fill("local-bridge-test");
  await page.getByRole("button", { name: /دخول/ }).click();
  return page;
}
(async () => {
  const results = {
    checks: [],
    errors: [],
    hardware: "No physical Bluetooth devices connected; no chooser opened",
  };
  browser = await chromium.launch({
    headless: false,
    args: ["--use-angle=metal", "--disable-background-timer-throttling"],
  });
  const a = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    c = await setup(
      a,
      (await read())?.gameId === "blooming-world-3d"
        ? "/control/blooming-world-3d"
        : "/control/balance-bridge-3d",
    );
  c.on("pageerror", (e) => results.errors.push(e.message));
  if ((await read())?.gameId === "blooming-world-3d") {
    await c
      .getByRole("button", { name: "إنهاء والنتائج", exact: true })
      .click();
    await until(
      async () => (await read())?.session.gameState === "SESSION_COMPLETE",
    );
    const old = await read();
    const run = JSON.parse(old.session.bw3.payload).run;
    const key = run ? `${old.sessionId}-r${run}` : old.sessionId;
    await until(async () => {
      const r = await fetch(
        `${db}/sessions/bridge-patient/${key}.json?ns=${ns}`,
        { headers: { Authorization: "Bearer owner" } },
      );
      return !!(await r.json());
    });
    await c.goto(base + "/control/balance-bridge-3d");
  }

  await c.getByRole("button", { name: "إعادة الرحلة", exact: true }).waitFor();
  await until(
    async () =>
      !(await c
        .getByRole("button", { name: "إعادة الرحلة", exact: true })
        .isDisabled()),
  );
  await c.getByRole("button", { name: "إعادة الرحلة", exact: true }).click();
  await c.getByRole("button", { name: "تأكيد الإعادة", exact: true }).click();
  await until(async () => (await state()).status === "ready");
  await c.getByLabel("المشاركة", { exact: true }).selectOption("DUAL_FOOT");
  await c.getByTestId("foot-RIGHT_FOOT").waitFor();
  await c.getByTestId("foot-LEFT_FOOT").waitFor();
  for (const role of ["RIGHT_FOOT", "LEFT_FOOT"])
    assert.equal(
      await c.getByTestId("foot-" + role).getAttribute("data-hint"),
      "unavailable",
    );
  assert.equal(
    (await state()).checkpoints.filter((p) => p.outcome !== "pending").length,
    0,
  );
  results.checks.push(
    "Two independent FOOT role connection panels with unavailable hints and no automatic progress",
  );
  await c.getByLabel("المشاركة", { exact: true }).selectOption("RIGHT_FOOT");
  await until(async () => (await state()).config.mode === "RIGHT_FOOT");
  assert.equal(await c.getByTestId("foot-LEFT_FOOT").count(), 0);
  results.checks.push("Selecting RIGHT_FOOT unmounts LEFT_FOOT runtime");
  await c.getByRole("button", { name: "ابدأ الرحلة", exact: true }).click();
  await until(async () => (await state()).countdown === 0);
  await c.getByRole("button", { name: "تأكيد الوصول", exact: true }).click();
  await until(async () => (await state()).active === 1);
  results.checks.push(
    "Manual checkpoint confirmation works in foot mode with no connected device",
  );
  await c
    .getByTestId("foot-RIGHT_FOOT")
    .screenshot({ path: out + "/foot-panel.png" });
  await c.getByRole("button", { name: "إنهاء آمن", exact: true }).click();
  await c.getByRole("button", { name: "تأكيد الإنهاء", exact: true }).click();
  await c.getByText("حُفظت النتيجة", { exact: true }).waitFor();
  restore = await read();
  fs.writeFileSync(
    out + "/pre-foreign-session.json",
    JSON.stringify(restore, null, 2),
  );
  await c.goto(base + "/control/blooming-world-3d");
  await until(async () => (await read())?.gameId === "blooming-world-3d");
  const foreign = await read();
  const b = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    }),
    other = await setup(b);
  other.on("pageerror", (e) => results.errors.push(e.message));
  await other
    .getByRole("dialog", { name: "حفظ النشاط قبل الانتقال" })
    .waitFor();
  await sleep(3000);
  assert.equal((await read()).gameId, "blooming-world-3d");
  assert.equal((await read()).sessionId, foreign.sessionId);
  await other.screenshot({ path: out + "/foreign-session-blocked.png" });
  results.checks.push(
    "Another tab cannot launch Bridge over an unresolved Blooming World session",
  );
  assert.equal(results.errors.length, 0);
  fs.writeFileSync(
    out + "/foot-ownership-browser.json",
    JSON.stringify(results, null, 2),
  );
  console.log(results);
  await browser.close();
  browser = null;
  const latest = await read();
  restore.revision = Math.max(restore.revision, latest.revision) + 1;
  restore.updatedAt = Date.now();
  const response = await fetch(`${db}/liveSession.json?ns=${ns}`, {
    method: "PUT",
    headers: {
      Authorization: "Bearer owner",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(restore),
  });
  assert.equal(response.status, 200);
})().catch(async (e) => {
  console.error(e);
  await browser?.close();
  process.exitCode = 1;
});
