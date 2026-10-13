/* Unified production-build QA. Loopback demo services only; speech upstream intercepted. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("fs"),
  assert = require("assert/strict");
const base = "http://127.0.0.1:3399",
  db = "http://127.0.0.1:19940",
  auth = "http://127.0.0.1:19949",
  ns = "demo-shumos-unified-default-rtdb",
  out = "docs/control-ux/evidence";
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

  const capture = async (name) => {
    await c.evaluate(() => {
      window.scrollTo(0, 0);
      document.querySelectorAll("main").forEach((el) => el.scrollTo(0, 0));
    });
    await c.waitForTimeout(200);
    await c.screenshot({ path: out + "/" + name + ".png", fullPage: true });
  };
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
  assert.equal(Object.keys(cards).length, 19);
  assert.equal(await c.locator("[data-library-section]").count(), 4);
  assert.equal(await c.locator("[data-game-card]").count(), 29);
  check(
    "All library: four canonical device sections, 29 appearances, 19 unique games",
  );
  await capture("desktop-all");
  await c.locator('[data-library-filter="FOOT"]').click();
  await c.waitForURL("**filter=FOOT");
  assert.equal(await c.locator("[data-library-section]").count(), 1);
  assert.equal(await c.locator("[data-game-card]").count(), 13);
  for (const href of await c
    .locator("[data-game-card]")
    .evaluateAll((es) => es.map((e) => e.getAttribute("href"))))
    assert.ok(href.endsWith("input=FOOT"));
  check("Foot filter: only its 13 games, input preference preserved");
  await capture("desktop-foot");
  for (const [id, href] of Object.entries(cards)) {
    await c.goto(base + href);
    await c.locator('[data-control-game="' + id + '"]').waitFor();
    await c
      .locator("[data-progressive-stages]")
      .first()
      .waitFor({ timeout: 30000 });
    await c.waitForTimeout(900);
    const picker = c.locator("[data-progressive-stages]").first();
    assert.equal(
      await picker.locator('[aria-label="مستوى الصعوبة"] button').count(),
      3,
      id,
    );
    assert.equal(await picker.locator("[data-stage-choice]").count(), 3, id);
    assert.equal(
      await picker.locator("[data-stage-choice] img").count(),
      3,
      id,
    );
    for (const level of [1, 2, 0]) {
      const b = picker
        .locator('[aria-label="مستوى الصعوبة"] button')
        .nth(level);
      if (await b.isEnabled()) {
        await b.click();
        await c.waitForTimeout(300);
        assert.equal(
          await picker.locator("[data-stage-choice]").count(),
          3,
          id,
        );
      }
    }
    const live = await read("liveSession");
    if (live)
      assert.equal(
        live.session.gameState,
        "START_ZONE",
        id + " stage browsing must not start",
      );
    const overflow = await c.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    assert.equal(overflow, false, id + " horizontal overflow");
    if (
      [
        "balloon-quest",
        "balance-bridge-3d",
        "turn-and-go-3d",
        "body-sequence-3d",
      ].includes(id)
    )
      await capture("desktop-" + id);
    await c
      .locator('[data-control-game] > nav a[href="/control/activities"]')
      .click();
    await c.waitForURL("**/control/activities");
    await c.waitForTimeout(400);
    assert.equal(
      await c.getByRole("heading", { name: "حفظ النشاط قبل الانتقال" }).count(),
      0,
      id,
    );
    await until(async () => !(await read("liveSession")), 6000);
    const history = await read("sessionHistory");
    assert.equal(history, null, id + " setup browsing must not create history");
    result.launches.push(id);
    save();
    console.log("SETUP", id);
  }
  check(
    "All 19 setup routes: 3 levels, 3 image cards, no browsing launch, safe link navigation, no stale session or history",
  );
  for (const [size, w, h] of [
    ["desktop", 1440, 1000],
    ["ipad-landscape", 1180, 820],
    ["ipad-portrait", 820, 1180],
    ["small-tablet", 768, 1024],
  ]) {
    await c.setViewportSize({ width: w, height: h });
    for (const [name, route] of [
      ["home", "/control"],
      ["all", "/control/activities"],
      ["foot", "/control/activities?filter=FOOT"],
      ["older-balloon", "/control/balloon-quest"],
      ["balance", "/control/balance-bridge-3d"],
      ["turn", "/control/turn-and-go-3d"],
      ["body", "/control/body-sequence-3d"],
    ]) {
      await c.goto(base + route);
      await c.waitForTimeout(1300);
      assert.equal(
        await c.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
        size + " " + name,
      );
      await capture(size + "-" + name);
      if (route.includes("3d") || name === "older-balloon") {
        await c
          .locator('[data-control-game] > nav a[href="/control/activities"]')
          .click();
        await c.waitForURL("**/control/activities");
        await until(async () => !(await read("liveSession")), 6000);
      }
    }
    check(size + " screenshots and no horizontal overflow");
  }
  await c.goto(base + "/control/turn-and-go-3d");
  await c.getByTestId("tg-start").waitFor();
  await c.getByTestId("tg-start").click();
  await until(async () => {
    const l = await read("liveSession");
    return l?.session.gameState === "PLAYING";
  });
  await c
    .locator('[data-control-game] > nav a[href="/control/activities"]')
    .click();
  await c.getByRole("heading", { name: "حفظ النشاط قبل الانتقال" }).waitFor();
  assert.ok(c.url().includes("turn-and-go-3d"));
  check("Started gameplay remains protected by the safe-navigation dialog");
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
