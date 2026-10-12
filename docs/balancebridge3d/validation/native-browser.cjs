const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("fs"),
  assert = require("assert/strict");
const db = "http://127.0.0.1:19940",
  auth = "http://127.0.0.1:19949",
  ns = "demo-balance-default-rtdb",
  base = "http://127.0.0.1:3399",
  out = "docs/balancebridge3d/evidence";
async function put(path, value) {
  const r = await fetch(`${db}/${path}.json?ns=${ns}`, {
    method: "PUT",
    headers: {
      Authorization: "Bearer owner",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(value),
  });
  assert.equal(r.status, 200, await r.text());
}
async function read(path) {
  return (
    await fetch(`${db}/${path}.json?ns=${ns}`, {
      headers: { Authorization: "Bearer owner" },
    })
  ).json();
}
let qaBrowser;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function state() {
  const r = await read("liveSession");
  return r?.session?.bb3 ? JSON.parse(r.session.bb3.payload) : null;
}
async function until(fn, ms = 30000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const v = await fn();
    if (v) return v;
    await sleep(150);
  }
  throw Error("Timed out: " + fn.toString());
}
(async () => {
  const result = {
    checks: [],
    stages: [],
    errors: [],
    metrics: [],
    audio: "TTS requests intercepted locally; physical audibility unverified",
  };
  const save = () =>
    fs.writeFileSync(
      `${out}/native-browser.json`,
      JSON.stringify(result, null, 2),
    );
  const check = (name) => {
    result.checks.push(name);
    save();
    console.log("PASS", name);
  };
  const response = await fetch(
    auth + "/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "bridge-qa@example.test",
        password: "local-bridge-test",
        returnSecureToken: true,
      }),
    },
  );
  let account = await response.json();
  if (!account.localId)
    account = await (
      await fetch(
        auth +
          "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "bridge-qa@example.test",
            password: "local-bridge-test",
            returnSecureToken: true,
          }),
        },
      )
    ).json();
  assert.ok(account.localId);
  await put("liveSession", null);
  await put("liveSessionPrivate", null);
  await put("controllerLease", null);
  await put("sessions/bridge-patient", null);
  await put("staff/" + account.localId, { active: true });
  const now = Date.now();
  await put("patients/bridge-patient", {
    patientNumber: "bridge-qa",
    firstName: "بطل",
    active: true,
    createdAt: now,
    updatedAt: now,
    createdByUid: account.localId,
  });
  const browser = (qaBrowser = await chromium.launch({
    headless: false,
    args: [
      "--use-angle=metal",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
    ],
  }));
  const cc = await browser.newContext({
      viewport: { width: 1500, height: 1100 },
    }),
    dc = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await cc.addInitScript(() =>
    sessionStorage.setItem(
      "shumos.control.selectedPatient",
      JSON.stringify({
        patientId: "bridge-patient",
        patientNumber: "bridge-qa",
        firstName: "بطل",
      }),
    ),
  );
  const c = await cc.newPage(),
    d = await dc.newPage();
  c.setDefaultTimeout(45000);
  d.setDefaultTimeout(45000);
  for (const [name, p] of [
    ["control", c],
    ["display", d],
  ]) {
    p.on("pageerror", (e) => {
      result.errors.push(name + ": " + e.message);
      save();
    });
    await p.route("**/api/tts", (r) =>
      r.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"error":"Local QA: speech upstream blocked"}',
      }),
    );
  }
  await c.goto(base + "/control/balance-bridge-3d");
  await c.getByRole("textbox").first().fill("bridge-qa@example.test");
  await c.locator("input[type=password]").fill("local-bridge-test");
  await c.getByRole("button", { name: /دخول/ }).click();
  await c.getByRole("button", { name: "ابدأ الرحلة", exact: true }).waitFor();
  await d.goto(base + "/display");
  await c.screenshot({ path: out + "/debug-control.png" });
  await d.screenshot({ path: out + "/debug-display.png" });
  console.log("CONTROL", (await c.locator("body").innerText()).slice(0, 600));
  console.log("DISPLAY", (await d.locator("body").innerText()).slice(0, 600));
  await d.getByTestId("bridge-view").waitFor();
  check(
    "Shared publisher and read-only Display on independent browser contexts",
  );
  for (let stage = 0; stage < 9; stage++) {
    await c
      .locator("#bridge-width")
      .selectOption(["wide", "standard", "narrower"][stage % 3]);
    await until(
      async () =>
        (await state())?.config.pathWidth ===
        ["wide", "standard", "narrower"][stage % 3],
    );
    if (stage === 1) {
      await c.getByLabel("الثبات الاختياري", { exact: true }).fill("2");
      await until(async () => (await state())?.config.holdSeconds === 2);
    }
    if (stage === 2) {
      await c.getByLabel("الثبات الاختياري", { exact: true }).fill("0");
      await until(async () => (await state())?.config.holdSeconds === 0);
    }
    await c.getByRole("button", { name: "ابدأ الرحلة", exact: true }).click();
    await until(async () => (await state())?.countdown === 0);
    await d.bringToFront();
    await sleep(2300);
    await d.screenshot({ path: `${out}/stage-${stage + 1}.png` });
    result.metrics.push({
      stage: stage + 1,
      ...(await d
        .getByTestId("bridge-view")
        .evaluate((e) => ({ ...e.dataset }))),
    });
    if (stage === 0) {
      await c.bringToFront();
      await c
        .getByRole("button", { name: "تأكيد خروج عن المسار", exact: true })
        .click();
      await until(async () => (await state())?.deviations === 1);
      await d.getByText("ارجع للمسار بهدوء", { exact: true }).waitFor();
      check("Therapist-confirmed gentle deviation feedback");
      await c
        .getByRole("button", { name: "كرّر العلامة", exact: true })
        .click();
      await until(async () => (await state())?.repeats === 1);
      await c.getByRole("button", { name: "إيقاف مؤقت", exact: true }).click();
      await until(async () => (await state())?.status === "paused");
      const elapsed = (await state()).elapsed;
      await sleep(600);
      assert.equal((await state()).elapsed, elapsed);
      await c.reload();
      await c
        .getByRole("button", { name: "استئناف الرحلة", exact: true })
        .waitFor();
      assert.equal((await state()).status, "paused");
      await d.reload();
      await d.getByTestId("bridge-view").waitFor();
      check("Pause freezes time; Control and Display reload recover paused");
      await c
        .getByRole("button", { name: "استئناف الرحلة", exact: true })
        .click();
    }
    let guard = 30;
    while (guard-- > 0) {
      let s = await state();
      if (s.status === "stage-complete") break;
      const active = s.active;
      if (stage === 1 && [2,4].includes(active)) {
        assert.equal(
          await c
            .getByRole("button", { name: "تأكيد الوصول", exact: true })
            .isDisabled(),
          true,
        );
        await c
          .getByRole("button", { name: "بدء الثبات عند الوصول", exact: true })
          .click();
        await sleep(2300);
      }
      if (stage === 2 && active === 1)
        await c
          .getByRole("button", { name: "تخطّ العلامة", exact: true })
          .click();
      else {
        const button = c.getByRole("button", {
          name: active === 2 ? "تأكيد بمساعدة" : "تأكيد الوصول",
          exact: true,
        });
        await button.waitFor();
        await expectEnabled(button);
        await button.click();
      }
      await until(async () => {
        const x = await state();
        return x.active !== active || x.status === "stage-complete";
      });
    }
    assert.ok(guard > 0);
    const done = await state();
    assert.equal(done.status, "stage-complete");
    result.stages.push({
      stage: stage + 1,
      pathWidth: done.config.pathWidth,
      confirmed: done.checkpoints.filter((p) =>
        ["confirmed", "assisted"].includes(p.outcome),
      ).length,
      assisted: done.checkpoints.filter((p) => p.outcome === "assisted").length,
      skipped: done.checkpoints.filter((p) => p.outcome === "skipped").length,
      holds: done.checkpoints.filter((p) => p.holdCompleted).length,
    });
    check("Manual stage " + (stage + 1));
    if (stage < 8) {
      await c
        .getByRole("button", { name: "المرحلة التالية", exact: true })
        .click();
      await until(async () => (await state())?.stage === stage + 1);
    }
  }
  await c.getByRole("button", { name: "إنهاء آمن", exact: true }).click();
  await c.getByRole("button", { name: "تأكيد الإنهاء", exact: true }).click();
  await until(
    async () =>
      Object.keys((await read("sessions/bridge-patient")) || {}).length === 1,
  );
  let h = Object.values(await read("sessions/bridge-patient"))[0];
  assert.equal(h.assistedCheckpoints, 9);
  assert.equal(h.skippedCheckpoints, 1);
  assert.equal(h.pathDeviations, 1);
  assert.equal(h.completedStageCount, 8);
  assert.equal(h.sessionCompleted, false);
  await c.reload();
  await sleep(2500);
  assert.equal(Object.keys(await read("sessions/bridge-patient")).length, 1);
  check(
    "Immutable save-once history after all nine stages, no duplicate after reload",
  );
  await c.getByRole("button", { name: "إعادة الرحلة", exact: true }).click();
  await c.getByRole("button", { name: "تأكيد الإعادة", exact: true }).click();
  await until(async () => (await state())?.run === 1);
  check("Safe restart uses new run identity");
  await c.getByRole("button", { name: "إنهاء آمن", exact: true }).click();
  await c.getByRole("button", { name: "تأكيد الإنهاء", exact: true }).click();
  await until(
    async () =>
      Object.keys((await read("sessions/bridge-patient")) || {}).length === 2,
  );
  check("Restart history uses suffixed key");
  await c.goto(
    base + "/control/patients/bridge-patient/sessions/" + h.sessionId,
  );
  await c.getByText("تفاصيل الأداء والمراحل", { exact: true }).click();
  await c.getByText("رحلة الجسر المتوازن", { exact: true }).waitFor();
  check("Patient history detail renders checkpoint metrics");
  await c.screenshot({ path: out + "/patient-history.png" });
  await c.setViewportSize({ width: 390, height: 844 });
  await c.screenshot({ path: `${out}/mobile-history.png` });
  assert.equal(result.errors.length, 0, result.errors.join("\n"));
  save();
  await browser.close();
})().catch(async (e) => {
  console.error(e);
  await qaBrowser?.close();
  process.exitCode = 1;
});
async function expectEnabled(b) {
  await until(async () => !(await b.isDisabled()), 10000);
}
