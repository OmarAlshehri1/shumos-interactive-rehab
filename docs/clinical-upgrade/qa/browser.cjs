const { chromium } = require(
  process.env.SHUMOS_PLAYWRIGHT_MODULE || "playwright",
);
const fs = require("fs");
const base = "http://127.0.0.1:3118",
  db = "http://127.0.0.1:19970",
  ns = "demo-clinical-visits-default-rtdb";
const evidence = process.cwd() + "/docs/clinical-upgrade/screenshots";
fs.mkdirSync(evidence, { recursive: true });
async function admin(path, value, method = "PUT") {
  const r = await fetch(`${db}/${path}.json?ns=${ns}`, {
    method,
    headers: {
      Authorization: "Bearer owner",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(value),
  });
  if (!r.ok) throw Error(await r.text());
  return r.json();
}
(async () => {
  const sign = await fetch(
    "http://127.0.0.1:19979/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "clinical-demo@shumos.test",
        password: "ClinicalDemo123!",
        returnSecureToken: true,
      }),
    },
  );
  const user = await sign.json();
  await admin("therapyVisits", null);
  await admin("activeTherapyVisits", null);
  await admin("visitResultClaims", null);
  await admin("liveSession", null);
  await admin("liveSessionPrivate", null);
  await admin("presence", null);
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.SHUMOS_CHROMIUM_PATH,
  });
  const context = await browser.newContext({
    viewport: { width: 1180, height: 900 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/control");
  await page.getByLabel("البريد الإلكتروني").fill("clinical-demo@shumos.test");
  await page.getByLabel("كلمة المرور").fill("ClinicalDemo123!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await page
    .getByRole("heading", { name: "جاهزية النظام" })
    .waitFor({ timeout: 60000 });
  await page.screenshot({
    path: evidence + "/dashboard-desktop.png",
    fullPage: true,
  });
  const result = { checks: [], errors };
  const check = (name, ok) => {
    result.checks.push({ name, ok });
    if (!ok) throw Error(name);
  };
  check(
    "Home has no duplicated game cards",
    (await page.locator("[data-game-card]").count()) === 0,
  );
  await page.getByRole("link", { name: /جلسة سريعة/ }).click();
  await page.waitForURL("**/control/activities");
  check("Quick session goes directly to library", true);
  await page.goto(base + "/control/visits");
  await page.getByLabel("المدة المخططة").selectOption("60");
  check(
    "60-minute setup available",
    (await page.getByLabel("المدة المخططة").inputValue()) === "60",
  );
  await page.getByLabel("المدة المخططة").selectOption("custom");
  await page.getByLabel("الدقائق", { exact: true }).fill("17");
  check(
    "Custom duration editable",
    (await page.getByLabel("الدقائق", { exact: true }).inputValue()) === "17",
  );
  await page.getByLabel("المدة المخططة").selectOption("45");
  await page.getByRole("button", { name: "طفل ضيف", exact: true }).click();
  await page.getByLabel("الاسم الأول أو الاسم المفضّل").fill("ضيف الاختبار");
  await page.getByLabel("اسم المعالج", { exact: true }).fill("معالج الاختبار");
  await page
    .getByRole("button", { name: "بدء الجلسة واختيار الأنشطة" })
    .click();
  await page.waitForURL("**/control/activities");
  await page.locator("[data-visit-active]").waitFor();
  check("Guest visit starts", true);
  await page.getByRole("button", { name: "تفاصيل", exact: true }).click();
  await page.getByText("إضافة تمرين بين الألعاب", { exact: true }).click();
  await page.getByLabel("عدد التكرارات").fill("5");
  await page.getByLabel("أؤكد نتيجة التمرين بالملاحظة المباشرة").check();
  await page.getByRole("button", { name: "حفظ التمرين", exact: true }).click();
  await page.getByText("توازن الوقوف", { exact: true }).last().waitFor();
  await page.screenshot({
    path: evidence + "/guest-visit-review.png",
    fullPage: true,
  });
  check("Therapist-confirmed exercise added", true);
  await page
    .getByRole("button", { name: "تعديل التقييم والملاحظات", exact: true })
    .click();
  await page.getByRole("button", { name: "2", exact: true }).click();
  await page.getByLabel("ملاحظات المعالج").fill("تم تأكيد التمرين");
  await page
    .getByRole("button", { name: "حفظ التقييم والمتابعة", exact: true })
    .click();
  await page.getByText("تم تأكيد التمرين", { exact: true }).waitFor();
  check("Exercise evaluation remains editable", true);
  await page.getByRole("button", { name: "إغلاق", exact: true }).click();
  await page.getByRole("button", { name: "استراحة", exact: true }).click();
  await page.getByRole("button", { name: "استئناف", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "استئناف", exact: true }).waitFor();
  check("Guest pause survives reload", true);
  await page.getByRole("button", { name: "استئناف", exact: true }).click();
  await page.getByRole("button", { name: "إنهاء الجلسة", exact: true }).click();
  await page.getByLabel("الملاحظات الختامية").fill("انتهت تجربة الضيف");
  await page
    .getByRole("button", { name: "حفظ وإنهاء الجلسة", exact: true })
    .click();
  await page.locator("[data-visit-active]").waitFor({ state: "detached" });
  check("Guest ended without permanent patient", true);
  const visits = await fetch(`${db}/therapyVisits.json?ns=${ns}`, {
    headers: { Authorization: "Bearer owner" },
  }).then((r) => r.json());
  check("Guest created no permanent visit records", visits === null);
  await page.goto(base + "/control/visits");
  await page.getByRole("button", { name: /ليلى.*patient-1/ }).click();
  await page.getByLabel("اسم المعالج", { exact: true }).fill("معالج الاختبار");
  await page.getByLabel("المدة المخططة").selectOption("30");
  await page
    .getByRole("button", { name: "بدء الجلسة واختيار الأنشطة" })
    .click();
  await page.waitForURL("**/control/activities");
  await page.locator("[data-visit-active]").waitFor();
  check("Saved-patient visit starts after server ack", true);
  await page.reload();
  await page.locator("[data-visit-active]").waitFor();
  check("Saved-patient visit recovers after reload", true);
  await page.getByRole("button", { name: "تفاصيل", exact: true }).click();
  await page
    .getByRole("button", { name: "تمديد ٥ دقائق", exact: true })
    .click();
  await page.getByText("35:00", { exact: true }).waitFor();
  check("Duration extension persisted", true);
  await page.getByRole("button", { name: "إغلاق", exact: true }).click();
  await page.getByRole("button", { name: "إنهاء الجلسة", exact: true }).click();
  await page.getByLabel("الملاحظات الختامية").fill("مراجعة الزيارة المحفوظة");
  await page
    .getByRole("button", { name: "حفظ وإنهاء الجلسة", exact: true })
    .click();
  await page.locator("[data-visit-active]").waitFor({ state: "detached" });
  check("Patient visit ends after server ack", true);
  await page.goto(base + "/control/patients/patient-1");
  await page.getByRole("heading", { name: "الزيارات العلاجية" }).waitFor();
  await page.getByRole("button", { name: /جلسة علاج طبيعي/ }).click();
  await page.getByText("ملاحظات ختامية: مراجعة الزيارة المحفوظة").waitFor();
  await page.screenshot({
    path: evidence + "/patient-visit-history.png",
    fullPage: true,
  });
  check("Completed visit appears with final notes", true);
  await page.goto(base + "/control/visits");
  await page.getByRole("button", { name: "مريض جديد", exact: true }).click();
  await page.getByLabel("اسم الطفل", { exact: true }).fill("طفل جديد للاختبار");
  await page.getByLabel("رقم المريض", { exact: true }).fill(String(Date.now()));
  await page.getByRole("button", { name: "حفظ المريض", exact: true }).click();
  await page.getByText("المريض المختار: طفل جديد للاختبار").waitFor();
  await page.getByLabel("اسم المعالج", { exact: true }).fill("معالج الاختبار");
  await page
    .getByRole("button", { name: "بدء الجلسة واختيار الأنشطة" })
    .click();
  await page.waitForURL("**/control/activities");
  check("New patient uses canonical creation and starts linked visit", true);
  await page
    .locator("[data-visit-active]")
    .getByRole("button", { name: "إنهاء الجلسة", exact: true })
    .click();
  await page
    .getByRole("button", { name: "حفظ وإنهاء الجلسة", exact: true })
    .click();
  await page.locator("[data-visit-active]").waitFor({ state: "detached" });
  await page.goto(base + "/control/calibration");
  await page
    .getByRole("heading", { name: "معايرة الإسقاط", exact: true })
    .waitFor();
  await page.getByLabel("اسم الملف").fill("معايرة الاختبار");
  await page.getByRole("button", { name: "حفظ الملف", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: /معايرة الاختبار/ }).click();
  check(
    "Calibration profile reloads",
    (await page.getByLabel("اسم الملف").inputValue()) === "معايرة الاختبار",
  );
  await page.screenshot({
    path: evidence + "/projector-calibration.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.goto(base + "/control");
  await page.getByRole("heading", { name: "جاهزية النظام" }).waitFor();
  await page.screenshot({
    path: evidence + "/dashboard-ipad.png",
    fullPage: true,
  });
  check(
    "iPad has no horizontal overflow",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.locator("main").evaluate((el) => el.scrollTo(0, 600));
  await page.screenshot({
    path: evidence + "/dashboard-ipad-session-entry.png",
    fullPage: true,
  });
  await page.locator("main").evaluate((el) => el.scrollTo(0, 0));
  const display = await context.newPage();
  await display.goto(base + "/display");
  await display.waitForTimeout(3000);
  await page.reload();
  await page.getByRole("heading", { name: "جاهزية النظام" }).waitFor();
  await page.waitForTimeout(2000);
  check(
    "Separate Display connected status",
    (await page.getByText("متصلة", { exact: true }).count()) > 0,
  );
  await page.screenshot({
    path: evidence + "/dashboard-display-connected.png",
    fullPage: true,
  });
  fs.writeFileSync(
    process.cwd() + "/docs/clinical-upgrade/browser-results.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
