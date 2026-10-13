/* Local synthetic patients only. No production endpoints or game-engine actions. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("fs"),
  assert = require("assert/strict");
const base = "http://127.0.0.1:3399",
  db = "http://127.0.0.1:19940",
  auth = "http://127.0.0.1:19949";
const ns = "demo-shumos-unified-default-rtdb",
  out = "docs/patient-visit-history/evidence";
fs.mkdirSync(out, { recursive: true });
const report = { checks: [], errors: [], syntheticOnly: true };
const save = () =>
  fs.writeFileSync(`${out}/browser.json`, JSON.stringify(report, null, 2));
const check = (name) => {
  report.checks.push(name);
  save();
  console.log("PASS", name);
};
async function admin(path, value) {
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
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw Error("condition timed out");
}
const evaluation = (uid, t, completion = "completed") => ({
  rating: 4,
  assistance: "verbal",
  completion,
  notes: "مساعدة لفظية مسجلة",
  updatedAt: t,
  updatedByUid: uid,
});
function visit(uid, patientId, id, t, number) {
  return {
    version: 1,
    visitId: id,
    patientId,
    childName: "طفل اختباري",
    ownerUid: uid,
    controlTabId: "synthetic-history-tab",
    title: `تدريب الوصول ${number}`,
    therapistName: "معالج الاختبار",
    initialNotes: "هدف الوصول",
    finalNotes: "ملاحظة محفوظة",
    overallRating: number % 3 === 0 ? null : 3,
    startedAt: t,
    plannedMs: 1800000,
    pausedMs: 0,
    pausedAt: null,
    endedAt: t + 120000,
    revision: 0,
    updatedAt: t + 120000,
    entries: {
      exercise: {
        kind: "exercise",
        title: "الوصول باليد",
        goal: "الوصول إلى هدف قريب",
        repetitions: number === 20 ? 4 : 3,
        holdSeconds: 2,
        confirmed: true,
        recordedAt: t + 10000,
        evaluation: evaluation(uid, t + 10000),
      },
    },
    breaks: {},
  };
}
function result(uid, id, t) {
  return {
    sessionId: id,
    patientId: "p20",
    gameId: "balloon-quest",
    createdByUid: uid,
    startedAt: t + 2000,
    completedAt: t + 70000,
    startingDifficulty: "EASY",
    startingStage: 1,
    endingDifficulty: "EASY",
    endingStage: 2,
    completedStageCount: 2,
    skippedStageCount: 0,
    totalCorrect: 8,
    totalIncorrect: 2,
    durationMs: 68000,
    accuracy: 0.8,
    averageReactionTimeMs: 1500,
    bestStage: { difficulty: "EASY", stageNumber: 2 },
    stageResults: [],
    therapistNote: "ملاحظة النتيجة المحفوظة",
  };
}
let browser, page;
(async () => {
  await admin(
    ".settings/rules",
    JSON.parse(fs.readFileSync("database.rules.json")),
  );
  await admin("", null);
  const email = `history-browser-${Date.now()}@example.test`,
    password = "LocalHistory123!";
  const user = await (
    await fetch(
      `${auth}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      },
    )
  ).json();
  assert.ok(user.localId);
  const uid = user.localId,
    now = Date.now() - 86400000;
  await admin(`staff/${uid}`, { active: true, role: "therapist" });
  for (const count of [1, 6, 8, 12, 20]) {
    const pid = `p${count}`,
      visits = {};
    await admin(`patients/${pid}`, {
      patientNumber: `HISTORY-${count}`,
      firstName: `طفل ${count}`,
      createdAt: now - 30 * 86400000,
      updatedAt: now,
      createdByUid: uid,
      active: true,
    });
    for (let i = 1; i <= count; i++) {
      const id = `legacy-${String(i).padStart(2, "0")}`;
      visits[id] = visit(uid, pid, id, now - (count - i) * 86400000, i);
    }
    if (count === 20) {
      const v = visits["legacy-20"];
      v.overallRating = 4;
      v.entries.linked = {
        kind: "game",
        sessionId: "linked",
        gameId: "balloon-quest",
        linkedAt: v.startedAt + 71000,
        evaluation: evaluation(uid, v.startedAt + 72000),
      };
      v.entries.interrupted = {
        kind: "exercise",
        title: "تمرين توقف",
        goal: "راحة",
        repetitions: 0,
        holdSeconds: 0,
        confirmed: true,
        recordedAt: v.startedAt + 80000,
        evaluation: evaluation(uid, v.startedAt + 80000, "interrupted"),
      };
      const legacyUnknown = result(uid, "unknown-level", v.startedAt);
      delete legacyUnknown.startingStage;
      delete legacyUnknown.startingDifficulty;
      delete legacyUnknown.endingStage;
      delete legacyUnknown.endingDifficulty;
      v.entries["unknown-level"] = {
        kind: "game",
        sessionId: "unknown-level",
        gameId: "balloon-quest",
        linkedAt: v.startedAt + 73000,
        evaluation: evaluation(uid, v.startedAt + 74000),
      };
      await admin("sessions/p20", {
        linked: result(uid, "linked", v.startedAt),
        pending: result(uid, "pending", v.startedAt + 1000),
        independent: result(uid, "independent", v.startedAt - 200000),
        "unknown-level": legacyUnknown,
      });
      await admin("visitResultClaims/p20", {
        linked: v.visitId,
        pending: v.visitId,
        "unknown-level": v.visitId,
      });
    }
    await admin(`therapyVisits/${pid}`, visits);
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1180, height: 820 },
  });
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => {
    report.errors.push(e.message);
    save();
  });
  await page.route("**/api/tts", (r) =>
    r.fulfill({ status: 200, headers: { "X-TTS-Disabled": "true" }, body: "" }),
  );
  await page.goto(`${base}/control/patients/p1`);
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await page.getByRole("heading", { name: "طفل 1", exact: true }).waitFor();
  for (const count of [1, 6, 8, 12, 20]) {
    await page.goto(`${base}/control/patients/p${count}`);
    const section = page.getByRole("region", {
      name: "الجلسات العلاجية",
      exact: true,
    });
    await section
      .getByText(`الجلسة ${count}`, { exact: true })
      .first()
      .waitFor();
    const cards = section.locator(':scope > div > a[href*="/visits/"]');
    assert.equal(await cards.count(), count);
    const numbers = await cards.locator("strong").allTextContents();
    assert.deepEqual(
      numbers,
      Array.from({ length: count }, (_, i) => `الجلسة ${count - i}`),
    );
    const index = await read(`therapyVisits/p${count}/_numbering`);
    assert.equal(Object.keys(index.byVisit).length, count);
    await page.reload();
    await section
      .getByText(`الجلسة ${count}`, { exact: true })
      .first()
      .waitFor();
    assert.deepEqual(
      (await read(`therapyVisits/p${count}/_numbering`)).byVisit,
      index.byVisit,
    );
    check(
      `${count} legacy visits: persisted numbers, newest-first, unchanged identities and reload`,
    );
  }
  assert.equal(
    await page.locator('a[href$="/sessions/independent"]').count(),
    1,
  );
  assert.equal(await page.locator('a[href$="/sessions/linked"]').count(), 0);
  assert.equal(await page.locator('a[href$="/sessions/pending"]').count(), 1);
  await page
    .getByRole("heading", { name: "نتائج محفوظة تحتاج مراجعة ربط الجلسة" })
    .waitFor();
  check(
    "independent result separated from linked visit result and pending recovery claim",
  );
  const history = page.getByRole("region", {
    name: "الجلسات العلاجية",
    exact: true,
  });
  await page.screenshot({ path: `${out}/profile-ipad-landscape.png` });
  await history.screenshot({ path: `${out}/profile-20-visits.png` });
  await history.locator(':scope > div > a[href$="/visits/legacy-20"]').click();
  await page.getByRole("heading", { name: "الجلسة 20", exact: true }).waitFor();
  await page
    .getByRole("heading", { name: "تقييم المعالج", exact: true })
    .waitFor();
  assert.ok(
    (await page.locator("main").innerText()).indexOf("تقييم المعالج") <
      (await page.locator("main").innerText()).indexOf("الألعاب والتمارين"),
  );
  await page.getByText("الوصول باليد", { exact: true }).first().click();
  await page
    .getByText("الثبات المحدد لكل تكرار", { exact: true })
    .first()
    .waitFor();
  assert.ok(
    (await page.locator("main").innerText()).includes("مدة التنفيذ: غير مسجل"),
  );
  const gameArticle = page
    .locator("article")
    .filter({ hasText: "المرحلة:" })
    .first();
  await gameArticle.locator("summary").click();
  assert.ok(
    (await page.locator("article summary").allTextContents()).some((text) =>
      /المرحلة:\s*غير مسجل/.test(text),
    ),
  );
  check(
    "legacy replay fallback stages are not displayed as recorded clinical levels",
  );
  assert.equal(
    await gameArticle
      .locator("dl")
      .innerText()
      .then((t) => t.includes("نجاحات داخل اللعبة\n8")),
    true,
  );
  assert.ok(
    (await page.locator("main").innerText()).includes("سابقاً 3، حالياً 4"),
  );
  assert.ok(
    (await page.locator("main").innerText()).includes(
      "3/5 في الجلسة السابقة، و4/5",
    ),
  );
  assert.equal(await page.locator('a[href$="/visits/legacy-19"]').count(), 1);
  check(
    "visit detail, optional rating, exercise target, clinical game drilldown, factual comparable summary",
  );
  await page.screenshot({
    path: `${out}/detail-ipad-landscape.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.screenshot({
    path: `${out}/detail-ipad-portrait.png`,
    fullPage: true,
  });
  const recordsBefore = await read("sessions/p20"),
    indexBefore = await read("therapyVisits/p20/_numbering");
  await page
    .getByRole("button", { name: "تعديل تقييم الجلسة والملاحظات" })
    .click();
  await page.getByLabel("تقييم الجلسة من خمسة").selectOption("0");
  await page.getByLabel(/^ملاحظات المعالج/).fill("ملاحظة معدلة آمنة");
  await page.getByRole("button", { name: "حفظ التقييم", exact: true }).click();
  await until(
    async () =>
      (await read("therapyVisits/p20/legacy-20")).finalNotes ===
      "ملاحظة معدلة آمنة",
  );
  await page.reload();
  await page
    .getByText("ملاحظات المعالج: ملاحظة معدلة آمنة", { exact: true })
    .waitFor();
  assert.equal((await read("therapyVisits/p20/legacy-20")).overallRating, 0);
  assert.deepEqual(await read("therapyVisits/p20/_numbering"), indexBefore);
  assert.deepEqual(await read("sessions/p20"), recordsBefore);
  check(
    "owner notes and zero rating persist on reload without renumbering or history mutation",
  );
  await page
    .getByRole("button", { name: "تعديل تقييم الجلسة والملاحظات" })
    .click();
  await page.getByLabel(/^ملاحظات المعالج/).fill("مسودة محفوظة عند التعارض");
  const concurrent = await read("therapyVisits/p20/legacy-20");
  await admin("therapyVisits/p20/legacy-20", {
    ...concurrent,
    finalNotes: "ملاحظة من نافذة أخرى",
    revision: concurrent.revision + 1,
    updatedAt: Date.now(),
  });
  await page.getByRole("button", { name: "حفظ التقييم", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "تغيّر السجل" }).waitFor();
  assert.equal(
    await page.getByLabel(/^ملاحظات المعالج/).inputValue(),
    "مسودة محفوظة عند التعارض",
  );
  assert.equal(
    (await read("therapyVisits/p20/legacy-20")).finalNotes,
    "ملاحظة من نافذة أخرى",
  );
  await page.getByRole("button", { name: "إلغاء", exact: true }).click();
  check(
    "concurrent clinical edit rejected without overwriting server notes or losing the draft",
  );
  await page
    .getByRole("button", { name: "استعادة رابط النتيجة المحفوظة" })
    .click();
  await until(
    async () => !!(await read("therapyVisits/p20/legacy-20")).entries.pending,
  );
  await page.reload();
  await page.getByRole("heading", { name: "الجلسة 20", exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "استعادة رابط النتيجة المحفوظة" })
      .count(),
    0,
  );
  assert.deepEqual(await read("sessions/p20"), recordsBefore);
  check(
    "interrupted claim recovered exactly once without creating or overwriting any result",
  );
  await page.goto(`${base}/control/patients/p20/visits/legacy-18`);
  await page.getByRole("heading", { name: "الجلسة 18", exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("تقييم المعالج العام").innerText(),
    "غير مسجل",
  );
  check("legacy missing rating shown as unrecorded");
  await page.goto(`${base}/control/patients/p20`);
  await page
    .getByRole("button", { name: "بدء نشاط مستقل", exact: true })
    .click();
  await page.waitForURL("**/control/activities");
  assert.equal((await read("therapyVisits/p20/_numbering")).lastNumber, 20);
  assert.equal(await read(`activeTherapyVisits/${uid}`), null);
  assert.equal(
    await page
      .locator("[data-game-card]")
      .evaluateAll((es) => new Set(es.map((e) => e.dataset.gameCard)).size),
    19,
  );
  check(
    "independent activity navigation creates no therapy visit; all 19 games remain registered",
  );
  await page.goto(`${base}/control/patients/p20`);
  await page
    .getByRole("button", { name: "بدء جلسة علاجية", exact: true })
    .click();
  await page.waitForURL("**/control/visits");
  const selected = page.getByRole("button", { name: /طفل 20.*HISTORY-20/ });
  await selected.waitFor();
  assert.equal(await selected.getAttribute("aria-pressed"), "true");
  await page.getByLabel("اسم المعالج", { exact: true }).fill("معالج الاختبار");
  await page
    .getByRole("button", { name: "بدء الجلسة واختيار الأنشطة", exact: true })
    .click();
  await page.waitForURL("**/control/activities");
  const pointer = await read(`activeTherapyVisits/${uid}`);
  assert.ok(pointer.visitId);
  const indexAfter = await read("therapyVisits/p20/_numbering");
  assert.equal(indexAfter.lastNumber, 21);
  assert.equal(indexAfter.byVisit[pointer.visitId], "21");
  assert.equal(
    (await read(`therapyVisits/p20/${pointer.visitId}`)).endedAt,
    undefined,
  );
  await page.reload();
  await until(
    async () => (await page.locator("[data-visit-active=true]").count()) > 0,
  );
  check(
    "profile prefills existing visit setup; new visit and number 21 save atomically and recover on reload",
  );
  const otherEmail = `history-other-${Date.now()}@example.test`;
  const other = await (
    await fetch(
      `${auth}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: otherEmail,
          password,
          returnSecureToken: true,
        }),
      },
    )
  ).json();
  assert.ok(other.localId);
  await admin(`staff/${other.localId}`, { active: true, role: "therapist" });
  const otherContext = await browser.newContext({
    viewport: { width: 820, height: 1180 },
  });
  const otherPage = await otherContext.newPage();
  await otherPage.goto(`${base}/control/patients/p20/visits/legacy-20`);
  await otherPage.getByLabel("البريد الإلكتروني").fill(otherEmail);
  await otherPage.getByLabel("كلمة المرور").fill(password);
  await otherPage
    .getByRole("button", { name: "تسجيل الدخول", exact: true })
    .click();
  await otherPage
    .getByRole("heading", { name: "الجلسة 20", exact: true })
    .waitFor();
  assert.equal(
    await otherPage
      .getByRole("button", { name: "تعديل تقييم الجلسة والملاحظات" })
      .count(),
    0,
  );
  assert.equal(
    await otherPage.getByRole("button", { name: "تعديل تقييم النشاط" }).count(),
    0,
  );
  check(
    "other authorized staff can read under existing policy but cannot edit another owner's evaluations",
  );
  await otherContext.close();
  assert.deepEqual(report.errors, []);
  save();
})()
  .catch(async (e) => {
    report.failure = e.stack;
    save();
    console.error(e);
    if (page)
      await page
        .screenshot({ path: `${out}/failure.png`, fullPage: true })
        .catch(() => {});
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
  });
