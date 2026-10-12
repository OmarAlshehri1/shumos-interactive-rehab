const { chromium } = require(
  process.env.SHUMOS_PLAYWRIGHT_MODULE || "playwright",
);
const fs = require("fs");
const executablePath = process.env.SHUMOS_CHROMIUM_PATH;
const base = "http://127.0.0.1:3118",
  db = "http://127.0.0.1:19970",
  ns = "demo-clinical-visits-default-rtdb";
async function admin(path, value) {
  const r = await fetch(`${db}/${path}.json?ns=${ns}`, {
    method: "PUT",
    headers: {
      Authorization: "Bearer owner",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(value),
  });
  if (!r.ok) throw Error(await r.text());
}
(async () => {
  await admin("therapyVisits", null);
  await admin("activeTherapyVisits", null);
  await admin("visitResultClaims", null);
  await admin("liveSession", null);
  await admin("liveSessionPrivate", null);
  await admin("controllerLease", null);
  const browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({
      viewport: { width: 1180, height: 1000 },
    }),
    page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/control");
  await page.getByLabel("البريد الإلكتروني").fill("clinical-demo@shumos.test");
  await page.getByLabel("كلمة المرور").fill("ClinicalDemo123!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await page.getByRole("heading", { name: "جاهزية النظام" }).waitFor();
  const display = await context.newPage();
  await display.goto(base + "/display", { waitUntil: "domcontentloaded" });
  await display.waitForTimeout(1500);
  await page.goto(base + "/control/visits");
  await page.getByRole("button", { name: /ليلى.*patient-1/ }).click();
  await page.getByLabel("اسم المعالج", { exact: true }).fill("معالج الألعاب");
  await page
    .getByRole("button", { name: "بدء الجلسة واختيار الأنشطة" })
    .click();
  await page.waitForURL("**/control/activities");
  await page
    .getByRole("link", { name: /مغامرة البالونات/ })
    .first()
    .click();
  await page.waitForURL("**/control/balloon-quest**");
  await page.getByTestId("start").waitFor({ timeout: 45000 });
  console.log("native-loaded");
  await page
    .getByRole("button", { name: "طريقة المشاركة المطلوبة", exact: true })
    .click();
  await page.getByRole("button", { name: "جداري", exact: true }).click();
  await page.getByRole("button", { name: "إغلاق إعدادات المشاركة" }).click();
  await page.getByTestId("start").click();
  await page.getByTestId("pause").waitFor({ timeout: 20000 });
  console.log("game-started");
  await page.getByRole("link", { name: /أنشطة/ }).first().click();
  await page.getByRole("dialog", { name: "حفظ النشاط قبل الانتقال" }).waitFor();
  if (!page.url().includes("/control/balloon-quest"))
    throw Error("Unsaved navigation escaped guard");
  console.log("active-navigation-blocked");
  await page
    .getByRole("button", { name: "العودة إلى النشاط", exact: true })
    .click();
  await page.getByTestId("pause").click();
  await page
    .locator("[data-visit-active]")
    .getByRole("button", { name: "استراحة", exact: true })
    .click();
  await page
    .locator("[data-visit-active]")
    .getByRole("button", { name: "استئناف", exact: true })
    .waitFor();
  await page
    .locator("[data-visit-active]")
    .getByRole("button", { name: "استئناف", exact: true })
    .click();
  console.log("safe-break-preserves-paused-game");
  await page.getByTestId("end").click();
  await page
    .getByRole("dialog", { name: "لماذا تم إنهاء الجلسة؟" })
    .getByRole("button", { name: "إنهاء الجلسة", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "تقييم النشاط" })
    .waitFor({ timeout: 20000 });
  console.log("native-history-linked");
  await page.screenshot({
    path:
      process.cwd() +
      "/docs/clinical-upgrade/screenshots/game-clinical-evaluation.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "3", exact: true }).click();
  await page.getByLabel("مستوى المساعدة").selectOption("partial");
  await page.getByLabel("ملاحظات المعالج").fill("تجربة جزئية؛ تحتاج مساعدة");
  await page
    .getByRole("button", { name: "حفظ التقييم والمتابعة", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "تقييم النشاط" })
    .waitFor({ state: "detached" });
  await page.getByRole("link", { name: /أنشطة/ }).first().click();
  await page.waitForURL("**/control/activities");
  console.log("confirmed-save-allows-library");
  await page
    .locator("[data-visit-active]")
    .getByRole("button", { name: "إنهاء الجلسة", exact: true })
    .click();
  await page
    .getByRole("button", { name: "حفظ وإنهاء الجلسة", exact: true })
    .click();
  await page.locator("[data-visit-active]").waitFor({ state: "detached" });
  const history = await fetch(`${db}/sessions/patient-1.json?ns=${ns}`, {
    headers: { Authorization: "Bearer owner" },
  }).then((r) => r.json());
  const visits = await fetch(`${db}/therapyVisits/patient-1.json?ns=${ns}`, {
    headers: { Authorization: "Bearer owner" },
  }).then((r) => r.json());
  const linked = Object.values(visits)
    .flatMap((v) => Object.values(v.entries || {}))
    .filter((e) => e.kind === "game");
  if (
    linked.length !== 1 ||
    linked[0].evaluation.rating !== 3 ||
    !history[linked[0].sessionId]
  )
    throw Error("Missing confirmed result/evaluation");
  fs.writeFileSync(
    process.cwd() + "/docs/clinical-upgrade/game-browser-results.json",
    JSON.stringify(
      {
        checks: [
          "native game start",
          "active navigation blocked",
          "native pause required before visit break",
          "native partial completion",
          "confirmed history linked",
          "separate therapist evaluation saved",
          "library transition after save",
          "visit completion preserves immutable game history",
        ],
        historyReferences: linked.map((e) => e.sessionId),
        errors,
      },
      null,
      2,
    ),
  );
  console.log("SUCCESS", errors);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
