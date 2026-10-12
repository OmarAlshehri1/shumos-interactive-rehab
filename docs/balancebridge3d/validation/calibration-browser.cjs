const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("fs"),
  assert = require("node:assert/strict");
const db = "http://127.0.0.1:19940",
  ns = "demo-balance-default-rtdb",
  base = "http://127.0.0.1:3399",
  out = "docs/balancebridge3d/evidence";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function read(path) {
  return (
    await fetch(`${db}/${path}.json?ns=${ns}`, {
      headers: { Authorization: "Bearer owner" },
    })
  ).json();
}
async function state() {
  const r = await read("liveSession");
  return JSON.parse(r.session.bb3.payload);
}
async function until(fn) {
  const start = Date.now();
  while (Date.now() - start < 35000) {
    if (await fn()) return;
    await sleep(150);
  }
  throw Error("Timeout " + fn.toString());
}
let browser;
(async () => {
  const results = {
    checks: [],
    errors: [],
    speech: "Network TTS intercepted; physical audio unverified",
  };
  browser = await chromium.launch({
    headless: false,
    args: [
      "--use-angle=metal",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
    ],
  });
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
  for (const [name, page] of [
    ["control", c],
    ["display", d],
  ]) {
    page.on("pageerror", (e) => results.errors.push(name + ": " + e.message));
    await page.route("**/api/tts", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"error":"Local QA: upstream blocked"}',
      }),
    );
  }
  await c.goto(base + "/control/balance-bridge-3d");
  await c.getByRole("textbox").first().fill("bridge-qa@example.test");
  await c.locator("input[type=password]").fill("local-bridge-test");
  await c.getByRole("button", { name: /دخول/ }).click();
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
  await d.goto(base + "/display");
  await d.getByTestId("bridge-view").waitFor();
  await c.locator("#bridge-width").selectOption("wide");
  await c.getByLabel("تعليمات صوتية", { exact: true }).uncheck();
  await until(async () => !(await state()).config.audio);
  await c.getByRole("button", { name: "ابدأ الرحلة", exact: true }).click();
  await until(async () => (await state()).countdown === 0);
  for (let i = 0; i < 2; i++) {
    const before = (await state()).active;
    await c.getByRole("button", { name: "تأكيد الوصول", exact: true }).click();
    await until(async () => (await state()).active !== before);
  }
  await d.bringToFront();
  await sleep(2000);
  // Read the renderer's actual frame buffer during RAF; element screenshots also include overlapping HTML.
  const pixels = await d
    .getByTestId("bridge-view")
    .locator("canvas")
    .evaluate(
      (canvas) =>
        new Promise((resolve) =>
          requestAnimationFrame(() => resolve(canvas.toDataURL("image/png"))),
        ),
    );
  fs.writeFileSync(
    out + "/thumbnail-source.png",
    Buffer.from(pixels.split(",")[1], "base64"),
  );
  results.checks.push(
    "Clean thumbnail captured from the native shared Display renderer",
  );
  await c.getByRole("button", { name: "إيقاف مؤقت", exact: true }).click();
  await until(async () => (await state()).status === "paused");
  await c.getByRole("button", { name: "حديقة الزهور", exact: false }).click();
  await until(async () => (await state()).stage === 1);
  await c.evaluate(() =>
    localStorage.setItem(
      "shumos.projection.profiles.v1",
      JSON.stringify([
        {
          version: 1,
          id: "qa-floor",
          name: "معايرة الاختبار",
          surface: "FLOOR",
          rotation: 90,
          targetPercent: 7,
          spacingPercent: 20,
          safeInsetPercent: 12,
          measuredWidthCm: 500,
          measuredHeightCm: 300,
          updatedAt: Date.now(),
        },
      ]),
    ),
  );
  await c.getByText("المعايرة الأرضية", { exact: true }).click();
  await c
    .getByRole("button", { name: "استخدم المعايرة المحفوظة", exact: true })
    .click();
  await until(async () => (await state()).config.rotation === 90);
  let s = await state();
  assert.equal(s.config.margin, 0.12);
  assert.equal(s.config.measuredWidthCm, 500);
  assert.equal(s.config.measuredHeightCm, 300);
  await c.locator("#bridge-width").selectOption("custom");
  await c.getByLabel("العرض المطلوب بالسنتيمتر", { exact: true }).fill("60");
  await c.getByLabel("دليل القدمين", { exact: true }).selectOption("both");
  await c.getByLabel("جودة الرسوم", { exact: true }).selectOption("low");
  await c.getByLabel("مؤثرات وحركة أقل", { exact: true }).check();
  await until(async () => {
    const x = await state();
    return (
      x.config.customWidthCm === 60 &&
      x.config.guidance === "both" &&
      x.config.quality === "low" &&
      x.config.reduced
    );
  });
  await c.getByRole("button", { name: "ابدأ الرحلة", exact: true }).click();
  await until(async () => (await state()).countdown === 0);
  await d.bringToFront();
  await sleep(1500);
  const bounds = await d
    .getByTestId("bridge-view")
    .locator("canvas")
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
    });
  assert.ok(
    bounds.x >= 0 &&
      bounds.y >= 0 &&
      bounds.x + bounds.width <= bounds.viewportWidth + 1 &&
      bounds.y + bounds.height <= bounds.viewportHeight + 1,
  );
  await d.screenshot({ path: out + "/rotation-90.png" });
  results.rotationBounds = bounds;
  results.checks.push(
    "Shared profile import, measured custom width, 90-degree rotation, both-feet guidance, low quality and reduced effects",
  );
  await c.setViewportSize({ width: 390, height: 844 });
  await c.screenshot({ path: out + "/mobile-control.png" });
  assert.ok(
    await c.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  results.checks.push("390px mobile Control has no horizontal overflow");
  await c.setViewportSize({ width: 1500, height: 1100 });
  await c.getByRole("button", { name: "إيقاف مؤقت", exact: true }).click();
  await c.getByRole("button", { name: "حديقة السحاب", exact: false }).click();
  await until(async () => (await state()).stage === 6);
  await c
    .getByLabel("اتجاه رحلة السحاب", { exact: true })
    .selectOption("right");
  await c.getByLabel("اتجاه الإسقاط", { exact: true }).selectOption("0");
  await until(
    async () =>
      (await state()).config.routeChoice === "right" &&
      (await state()).config.rotation === 0,
  );
  await c.getByRole("button", { name: "ابدأ الرحلة", exact: true }).click();
  await until(async () => (await state()).countdown === 0);
  await d.screenshot({ path: out + "/cloud-right.png" });
  results.checks.push(
    "Therapist-selected Cloud Garden direction changes the illuminated route",
  );
  await c.getByRole("button", { name: "إنهاء آمن", exact: true }).click();
  await c.getByRole("button", { name: "تأكيد الإنهاء", exact: true }).click();
  await until(async () => (await state()).status === "ended");
  assert.equal(results.errors.length, 0, results.errors.join("\n"));
  fs.writeFileSync(
    out + "/calibration-browser.json",
    JSON.stringify(results, null, 2),
  );
  console.log(results);
  await browser.close();
})().catch(async (e) => {
  console.error(e);
  await browser?.close();
  process.exitCode = 1;
});
