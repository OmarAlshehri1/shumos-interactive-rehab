const { chromium } = require(
  process.env.SHUMOS_PLAYWRIGHT_MODULE || "playwright",
);
const fs = require("fs");
(async () => {
  for (const path of ["liveSession", "liveSessionPrivate"])
    await fetch(
      `http://127.0.0.1:19970/${path}.json?ns=demo-clinical-visits-default-rtdb`,
      {
        method: "PUT",
        headers: {
          Authorization: "Bearer owner",
          "Content-Type": "application/json",
        },
        body: "null",
      },
    );
  const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.SHUMOS_CHROMIUM_PATH,
    }),
    context = await browser.newContext({
      viewport: { width: 1180, height: 900 },
    }),
    control = await context.newPage();
  const errors = [];
  control.on("pageerror", (e) => errors.push(e.message));
  await control.goto("http://127.0.0.1:3118/control");
  await control
    .getByLabel("البريد الإلكتروني")
    .fill("clinical-demo@shumos.test");
  await control.getByLabel("كلمة المرور").fill("ClinicalDemo123!");
  await control
    .getByRole("button", { name: "تسجيل الدخول", exact: true })
    .click();
  await control.getByRole("heading", { name: "جاهزية النظام" }).waitFor();
  const display = await context.newPage();
  display.on("pageerror", (e) => errors.push(e.message));
  await display.goto("http://127.0.0.1:3118/display", {
    waitUntil: "domcontentloaded",
  });
  await display.waitForTimeout(2000);
  console.log(
    "Display buttons:",
    await display.getByRole("button").allTextContents(),
  );
  const presence = async () =>
    fetch(
      "http://127.0.0.1:19970/presence/display.json?ns=demo-clinical-visits-default-rtdb",
      { headers: { Authorization: "Bearer owner" } },
    ).then((r) => r.json());
  console.log("initial-audio", JSON.stringify((await presence()).audioStatus));
  await control
    .getByRole("button", { name: "طلب تشغيل / اختبار الصوت", exact: true })
    .click();
  await control.waitForTimeout(1500);
  const remote = (await presence()).audioStatus;
  console.log("after-remote", JSON.stringify(remote));
  const unlock = display
    .getByRole("button", { name: /تشغيل.*صوت|تفعيل.*صوت/ })
    .first();
  if (await unlock.count()) await unlock.click();
  else
    await display
      .getByRole("button", { name: /بدء العرض|ابدأ التجربة/ })
      .first()
      .click();
  await display.waitForTimeout(2000);
  await control.getByText("جاهز", { exact: true }).waitFor({ timeout: 15000 });
  const manual = (await presence()).audioStatus;
  console.log("after-display-interaction", JSON.stringify(manual));
  if (manual?.state !== "ready" || manual?.contextState !== "running")
    throw Error("Display audio was not proven running after interaction");
  await control.getByText("جاهز", { exact: true }).waitFor();
  await control.screenshot({
    path:
      process.cwd() +
      "/docs/clinical-upgrade/screenshots/dashboard-audio-ready.png",
    fullPage: true,
  });
  fs.writeFileSync(
    process.cwd() + "/docs/clinical-upgrade/audio-browser-results.json",
    JSON.stringify(
      {
        remoteAttempt: remote,
        displayInteraction: manual,
        checks: [
          "Remote audio request handled",
          "Readiness based on actual Display AudioContext running",
          "Control dashboard reflects Display acknowledgement",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  await browser.close();
  console.log("SUCCESS");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
