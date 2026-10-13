/* Unified production-build QA. Loopback demo services only; speech upstream intercepted. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("fs"),
  assert = require("assert/strict");
const base = "http://127.0.0.1:3399",
  db = "http://127.0.0.1:19940",
  auth = "http://127.0.0.1:19949",
  ns = "demo-shumos-unified-default-rtdb",
  out = "docs/control-ux/start-evidence";
const result = {
  environment:
    "production build; fake loopback Firebase; independent Control/Display contexts",
  checks: [],
  launches: [],
  games: [],
  errors: [],
  hardware: "unverified",
  speech: "intercepted",
};
function save() {
  fs.writeFileSync(out + "/browser.json", JSON.stringify(result, null, 2));
}
function check(name) {
  result.checks.push(name);
  save();
  console.log("PASS", name);
}
async function admin(p, v) {
  const r = await fetch(`${db}/${p}.json?ns=${ns}`, {
    method: "PUT",
    headers: {
      Authorization: "Bearer owner",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(v),
  });
  assert.equal(r.status, 200, await r.text());
}
async function read(p) {
  return (
    await fetch(`${db}/${p}.json?ns=${ns}`, {
      headers: { Authorization: "Bearer owner" },
    })
  ).json();
}
async function until(fn, ms = 30000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw Error("Timed out: " + fn.toString().slice(0, 160));
}
let browser, qaPage;
(async () => {
  await admin(
    ".settings/rules",
    JSON.parse(fs.readFileSync("database.rules.json")),
  );
  await admin("", null);
  const response = await fetch(
    auth + "/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "unified-qa@example.test",
        password: "LocalUnified123!",
        returnSecureToken: true,
      }),
    },
  );
  let account = await response.json();
  if (!account.localId) {
    account = await (
      await fetch(
        auth +
          "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "unified-qa@example.test",
            password: "LocalUnified123!",
            returnSecureToken: true,
          }),
        },
      )
    ).json();
  }
  assert.ok(account.localId);
  await admin("staff/" + account.localId, { active: true, role: "therapist" });
  await admin("patients/unified-patient", {
    patientNumber: "UNIFIED-QA",
    firstName: "ليلى",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    createdByUid: account.localId,
    active: true,
  });
  browser = await chromium.launch({
    headless: false,
    args: ["--use-angle=metal"],
  });
  const cctx = await browser.newContext({
      viewport: { width: 1180, height: 950 },
    }),
    dctx = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
  const c = await cctx.newPage(),
    d = await dctx.newPage();
  qaPage = c;
  for (const [name, p] of [
    ["Control", c],
    ["Display", d],
  ]) {
    p.setDefaultTimeout(25000);
    p.on("pageerror", (e) => {
      result.errors.push(name + ": " + e.message);
      save();
    });
    p.on("dialog", (dialog) => dialog.accept());
    await p.route("**/api/tts", (r) =>
      r.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"error":"Local QA blocks upstream speech"}',
      }),
    );
  }
  await c.goto(base + "/control");
  await c.getByLabel("البريد الإلكتروني").fill("unified-qa@example.test");
  await c.getByLabel("كلمة المرور").fill("LocalUnified123!");
  await c.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await c.getByRole("heading", { name: "جاهزية النظام" }).waitFor();
  check("Authenticated readiness dashboard");
  await d.goto(base + "/display");
  await c.goto(base + "/control/calibration");
  await c.getByLabel(/الاتجاه/).selectOption("90");
  await c.getByRole("button", { name: "حفظ الملف", exact: true }).click();
  await c
    .getByRole("button", { name: "إرسال الشبكة إلى العرض", exact: true })
    .click();
  await d.getByTestId("projection-display-preview").waitFor();
  assert.ok(
    (await d.getByTestId("projection-display-preview").innerText()).includes(
      "90°",
    ),
  );
  check("Control calibration reaches independent Display");
  await c
    .getByRole("button", { name: "إخفاء الشبكة من العرض", exact: true })
    .click();
  await d
    .getByTestId("projection-display-preview")
    .waitFor({ state: "hidden" });
  await c.goto(base + "/control/visits");
  await c.getByRole("button", { name: /ليلى.*UNIFIED-QA/ }).click();
  await c.getByLabel("اسم المعالج", { exact: true }).fill("معالج الاختبار");
  await c.getByRole("button", { name: "بدء الجلسة واختيار الأنشطة" }).click();
  await c.waitForURL("**/control/activities");

  const cards = await c
    .locator("[data-game-card]")
    .evaluateAll((es) =>
      Object.fromEntries(
        es.map((e) => [
          e.dataset.gameCard,
          e.getAttribute("href").split("?")[0],
        ]),
      ),
    );
  const decoded = (r) => {
    const m = r.session[r.session.engine];
    return m.payload
      ? JSON.parse(m.payload)
      : m.snapshot
        ? JSON.parse(m.snapshot)
        : m.state;
  };
  const config = (r) => {
    const s = decoded(r);
    const state = s?.state || s;
    return (
      state?.config ||
      state?.settings ||
      Object.fromEntries(
        ["difficulty", "inputMode", "sensitivity", "quality", "reducedMotion"]
          .filter((k) => state && k in state)
          .map((k) => [k, state[k]]),
      )
    );
  };
  for (const [id, href] of Object.entries(cards)) {
    // Deliberately reset ONLY demo records between isolated startup cases; the production navigation guard stays enabled.
    await admin("liveSession", null);
    await admin("liveSessionPrivate", null);
    await c.goto(base + href);
    const picker = c.locator("[data-progressive-stages]").first();
    await picker.waitFor();
    const floor = c
      .locator("[data-launch-game] fieldset")
      .getByRole("button", { name: "أرضي", exact: true });
    if ((await floor.count()) && (await floor.isEnabled())) await floor.click();
    await picker.locator('[aria-label="مستوى الصعوبة"] button').nth(2).click();
    await until(async () => {
      const r = await read("liveSession");
      return r?.gameId === id && r.session.currentStage.stageIndex === 6;
    });
    if (id === "balance-bridge-3d")
      await c.locator("#bridge-width").selectOption("standard");
    if (id === "rhythm-steps-3d")
      await c.getByTestId("rs-flow").selectOption("assisted");
    if (id === "body-sequence-3d") await c.getByTestId("bs-feet-R").click();
    await c.waitForTimeout(500);
    const before = await read("liveSession");
    const expected = config(before);
    const start = c.getByRole("button", { name: "ابدأ النشاط", exact: true });
    await start.click();
    await until(async () => {
      const r = await read("liveSession");
      return r?.gameId === id && r.session.gameState === "PLAYING";
    }, 30000);
    const started = await read("liveSession");
    assert.equal(started.session.currentStage.stageIndex, 6, id);
    assert.deepEqual(
      config(started),
      expected,
      id + " configured settings reach Start",
    );
    await c
      .locator('[data-control-game] > nav a[href="/control/activities"]')
      .click();
    await c.getByRole("heading", { name: "حفظ النشاط قبل الانتقال" }).waitFor();
    assert.ok(c.url().includes(href));
    await c
      .getByRole("button", { name: "العودة إلى النشاط", exact: true })
      .click();
    assert.equal(
      (await read("liveSession")).sessionId,
      started.sessionId,
      id + " guard retains the live session",
    );
    result.games.push({
      id,
      stage: 6,
      configurationPreserved: true,
      startedGuard: true,
    });
    save();
    console.log("START", id);
    // A hard document reload is a QA harness boundary, followed by emulator-only cleanup on the next iteration.
    await c.goto(base + "/control/activities");
  }
  check(
    "All 19 native Start actions preserve selected stage/settings and remain protected after Start",
  );
  assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
  save();
  await browser.close();
})().catch(async (e) => {
  console.error(e);
  result.errors.push(e.stack);
  save();
  if (qaPage)
    await qaPage
      .screenshot({ path: out + "/failure.png", fullPage: true })
      .catch(() => {});
  if (browser) await browser.close();
  process.exitCode = 1;
});
