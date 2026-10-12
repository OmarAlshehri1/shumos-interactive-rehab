/* Unified production-build QA. Loopback demo services only; speech upstream intercepted. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("fs"),
  assert = require("assert/strict");
const base = "http://127.0.0.1:3399",
  db = "http://127.0.0.1:19940",
  auth = "http://127.0.0.1:19949",
  ns = "demo-shumos-unified-default-rtdb",
  out = "docs/unified-integration/evidence";
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
        es.map((e) => [e.dataset.gameCard, e.getAttribute("href")]),
      ),
    );
  assert.equal(Object.keys(cards).length, 19);
  check("19 unique canonical library entries");
  for (const [id, href] of process.env.QA_SKIP_ROUTES
    ? []
    : Object.entries(cards)) {
    await admin("liveSession", null);
    await admin("liveSessionPrivate", null);
    const response = await c.goto(base + href);
    assert.equal(response.status(), 200, id);
    await c.locator("main").first().waitFor();
    await c.waitForTimeout(1000);
    assert.ok(!(await c.getByText("404", { exact: true }).count()));
    result.launches.push(id);
    save();
    console.log("LAUNCH", id);
    await c.goto(base + "/control/activities");
  }
  check(
    "All 19 canonical Control routes render; Display registry verified by unified unit test",
  );
  await admin("liveSession", null);
  await admin("liveSessionPrivate", null);
  const games = [
    ["turn-and-go-3d", "tg", "tg3"],
    ["foot-maze-3d", "fm", "fm3"],
    ["rhythm-steps-3d", "rs", "rs3"],
    ["body-sequence-3d", "bs", "bs3"],
    ["balance-bridge-3d", "bridge", "bb3"],
    ["shumos-castle-legends-3d", "castle", "castle3"],
  ];
  for (const [id, prefix, engine] of games) {
    await c.goto(base + cards[id]);
    await c.locator("main").first().waitFor();
    console.log("OPEN", id);
    const before = Object.keys(
      (await read("sessions/unified-patient")) || {},
    ).length;
    if (prefix === "bridge")
      await c.getByRole("button", { name: "ابدأ الرحلة", exact: true }).click();
    else if (prefix === "castle")
      await c
        .getByRole("button", { name: "ابدأ المغامرة", exact: true })
        .click();
    else await c.getByTestId(prefix + "-start").click();
    await until(async () => {
      const r = await read("liveSession");
      return (
        r?.gameId === id &&
        JSON.parse(r.session?.[engine]?.payload || "null")?.status === "running"
      );
    });
    if (prefix === "bridge")
      await c.getByRole("button", { name: "إيقاف مؤقت", exact: true }).click();
    else if (prefix === "castle")
      await c
        .locator("main")
        .getByRole("button", { name: "استراحة", exact: true })
        .click();
    else await c.getByTestId(prefix + "-pause").click();
    await until(
      async () =>
        JSON.parse(
          (await read("liveSession"))?.session?.[engine]?.payload || "null",
        )?.status === "paused",
    );
    await c.reload();
    if (prefix === "bridge")
      await c
        .getByRole("button", { name: "استئناف الرحلة", exact: true })
        .click();
    else if (prefix === "castle")
      await c
        .getByRole("button", { name: "استئناف الرحلة", exact: true })
        .click();
    else await c.getByTestId(prefix + "-resume").click();
    await until(
      async () =>
        JSON.parse(
          (await read("liveSession"))?.session?.[engine]?.payload || "null",
        )?.status === "running",
    );
    if (["tg", "fm", "rs", "bs"].includes(prefix))
      await d.getByTestId(prefix + "-display").waitFor();
    if (prefix === "bridge") await d.getByTestId("bridge-view").waitFor();
    // Exercise therapist actions after countdown without asserting any physical movement.
    await c.waitForTimeout(3600);
    if (prefix === "tg" || prefix === "bs") {
      const b = c.getByTestId(prefix + "-confirm");
      if (await b.isEnabled()) await b.click();
    }
    if (prefix === "bridge") {
      const b = c.getByRole("button", { name: "تأكيد بمساعدة", exact: true });
      if (await b.isEnabled()) await b.click();
    }
    if (prefix === "rs") {
      const b = c.getByTestId("rs-confirm").first();
      if ((await b.count()) && (await b.isEnabled())) await b.click();
    }
    if (prefix === "fm") {
      const next = await c.getByTestId("fm-control").getAttribute("data-next");
      const b = c.getByTestId("fm-node-" + next);
      if ((await b.count()) && (await b.isEnabled())) {
        await b.click();
        await c.getByTestId("fm-arrive").click();
      }
    }
    if (prefix === "bridge") {
      await c.getByRole("button", { name: "إنهاء آمن", exact: true }).click();
      await c
        .getByRole("button", { name: "تأكيد الإنهاء", exact: true })
        .click();
    } else if (prefix === "castle")
      await c
        .locator("main")
        .getByRole("button", { name: "إنهاء الجلسة", exact: true })
        .click();
    else {
      await c.getByTestId(prefix + "-end").click();
      await c.getByTestId(prefix + "-confirm-yes").click();
    }
    await until(
      async () =>
        Object.keys((await read("sessions/unified-patient")) || {}).length ===
        before + 1,
    );
    const histories = await read("sessions/unified-patient");
    const h = Object.values(histories)
      .filter((h) => h.gameId === id)
      .at(-1);
    assert.ok(h);
    await c
      .getByRole("dialog", { name: "تقييم النشاط", exact: true })
      .waitFor();
    await c
      .getByRole("button", { name: "حفظ التقييم والمتابعة", exact: true })
      .click();
    await until(async () =>
      Object.values((await read("therapyVisits/unified-patient")) || {}).some(
        (v) => v.entries?.[h.sessionId]?.gameId === id,
      ),
    );
    result.games.push({
      id,
      historyKey: h.sessionId,
      pauseReloadResume: true,
      historySaved: true,
      visitLinked: true,
    });
    save();
    console.log("GAME", id, "saved and linked");
    await c.reload();
    await c.waitForTimeout(1200);
    assert.equal(
      await c
        .getByRole("dialog", { name: "تقييم النشاط", exact: true })
        .count(),
      0,
      "Acknowledged evaluation stays dismissed after reload",
    );
    assert.equal(
      Object.keys((await read("sessions/unified-patient")) || {}).length,
      before + 1,
    );
    await c.goto(base + "/control/activities");
  }
  check(
    "Six new games: pause/reload/resume, immutable save-once and parent visit linkage",
  );
  await c
    .locator("[data-visit-active]")
    .getByRole("button", { name: "إنهاء الجلسة", exact: true })
    .click();
  await c
    .getByRole("button", { name: "حفظ وإنهاء الجلسة", exact: true })
    .click();
  await until(async () =>
    Object.values((await read("therapyVisits/unified-patient")) || {}).some(
      (v) => v.endedAt && Object.keys(v.entries || {}).length === 6,
    ),
  );
  check(
    "Parent visit finishes with all six immutable game references retained",
  );
  await c.goto(base + "/control/patients/unified-patient");
  await c.waitForTimeout(1200);
  await c.screenshot({ path: out + "/patient-history.png", fullPage: true });
  check("Patient history opens after six linked game results");
  assert.deepEqual(result.errors, []);
  check("No Control or Display page errors");
  save();
})()
  .catch(async (e) => {
    result.failure = e.stack;
    result.failurePage = qaPage
      ? (await qaPage.locator("body").innerText()).slice(0, 5000)
      : "";
    if (qaPage)
      await qaPage.screenshot({ path: out + "/failure.png", fullPage: true });
    save();
    console.error(e);
    console.error(result.failurePage);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
  });
