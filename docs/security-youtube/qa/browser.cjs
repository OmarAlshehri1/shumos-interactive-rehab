/* Synthetic Firebase only. Search and player API mocked unless REAL_PLAYER=1. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("fs"),
  assert = require("assert/strict");
const base = "http://127.0.0.1:3399",
  db = "http://127.0.0.1:19940",
  auth = "http://127.0.0.1:19949",
  ns = "demo-shumos-unified-default-rtdb",
  out = "docs/security-youtube/evidence";
fs.mkdirSync(out, { recursive: true });
const report = {
  search: "mocked",
  player:
    process.env.REAL_PLAYER === "1" ? "actual official IFrame API" : "mocked",
  checks: [],
  errors: [],
};
const save = () =>
  fs.writeFileSync(
    out +
      "/browser" +
      (process.env.REAL_PLAYER === "1" ? "-real" : "") +
      ".json",
    JSON.stringify(report, null, 2),
  );
const check = (n) => {
  report.checks.push(n);
  save();
  console.log("PASS", n);
};
const admin = async (p, v) => {
  const r = await fetch(`${db}/${p}.json?ns=${ns}`, {
    method: "PUT",
    headers: {
      Authorization: "Bearer owner",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(v),
  });
  assert.equal(r.status, 200, await r.text());
};
const read = async (p) =>
  (
    await fetch(`${db}/${p}.json?ns=${ns}`, {
      headers: { Authorization: "Bearer owner" },
    })
  ).json();
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw Error("condition timed out");
}
let browser, c;
(async () => {
  await admin(
    ".settings/rules",
    JSON.parse(fs.readFileSync("database.rules.json")),
  );
  await admin("", null);
  const email = `youtube-browser-${Date.now()}@example.test`,
    password = "LocalYoutube123!";
  const response = await fetch(
    auth + "/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const user = await response.json();
  assert.ok(user.localId);
  await admin(`staff/${user.localId}`, { active: true, role: "therapist" });
  browser = await chromium.launch({
    headless: false,
    args: ["--use-angle=metal"],
  });
  const cc = await browser.newContext({
      viewport: { width: 1180, height: 820 },
    }),
    dc = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  c = await cc.newPage();
  const d = await dc.newPage();
  for (const [name, p] of [
    ["Control", c],
    ["Display", d],
  ]) {
    p.setDefaultTimeout(20000);
    p.on("console", (msg) => {
      if (msg.type() === "warning")
        console.log(name + " warning: " + msg.text());
    });
    p.on("pageerror", (e) => {
      report.errors.push(`${name}: ${e.message}`);
      save();
    });
    await p.route("**/api/tts", (r) =>
      r.fulfill({
        status: 200,
        headers: { "X-TTS-Disabled": "true" },
        body: "",
      }),
    );
  }
  if (process.env.REAL_PLAYER !== "1")
    await dc.addInitScript(() => {
      window.__mockPlayer = [];
      class Player {
        constructor(el, options) {
          this.options = options;
          this.position = 0;
          this.muted = false;
          const frame = document.createElement("iframe");
          frame.title = "Mock YouTube player";
          frame.src = "about:blank";
          el.replaceWith(frame);
          this.frame = frame;
          window.__mockPlayer.push(this);
          setTimeout(() => options.events.onReady(), 0);
        }
        loadVideoById(x) {
          this.frame.dataset.videoId = x.videoId;
          this.position = x.startSeconds;
        }
        cueVideoById(x) {
          this.loadVideoById(x);
        }
        playVideo() {
          this.frame.dataset.state = "playing";
          this.options.events.onStateChange({ data: 1 });
        }
        pauseVideo() {
          this.frame.dataset.state = "paused";
          this.options.events.onStateChange({ data: 2 });
        }
        stopVideo() {
          this.frame.dataset.state = "stopped";
        }
        seekTo(n) {
          this.position = n;
          this.frame.dataset.position = String(n);
        }
        setVolume(n) {
          this.frame.dataset.volume = String(n);
        }
        mute() {
          this.muted = true;
          this.frame.dataset.muted = "true";
        }
        unMute() {
          this.muted = false;
          this.frame.dataset.muted = "false";
        }
        getCurrentTime() {
          return this.position;
        }
        isMuted() {
          return this.muted;
        }
        destroy() {
          this.frame.remove();
        }
      }
      window.YT = { Player };
    });
  await c.goto(base + "/control/youtube");
  await c.getByLabel("البريد الإلكتروني").fill(email);
  await c.getByLabel("كلمة المرور").fill(password);
  await c.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await c.getByRole("heading", { name: "يوتيوب YouTube" }).waitFor();
  await c.getByText("التحكم متصل", { exact: false }).waitFor();
  await d.goto(base + "/display");
  await c.getByLabel("البحث في يوتيوب").fill("أغنية أطفال");
  await c.getByRole("button", { name: "بحث", exact: true }).click();
  await c.getByRole("alert").filter({ hasText: "يحتاج إعداد" }).waitFor();
  check(
    "Real authenticated endpoint returns setup-required with no configured key",
  );
  await c.route("**/api/youtube/search", async (r) => {
    const body = r.request().postDataJSON();
    await r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        videos: [
          {
            videoId: body.pageToken ? "aqz-KE-bpKQ" : "M7lc1UVf-VE",
            title: body.pageToken
              ? "فيديو ثانٍ"
              : "YouTube Developers — تجربة الاختبار",
            channel: "YouTube Developers",
          },
        ],
        nextPageToken: body.pageToken ? null : "page_2",
      }),
    });
  });
  await c.getByRole("button", { name: "بحث", exact: true }).click();
  await c
    .getByRole("button", {
      name: "إضافة YouTube Developers — تجربة الاختبار إلى المفضلة",
    })
    .click();
  await until(
    async () =>
      Object.keys((await read(`youtubeFavorites/${user.localId}`)) || {})
        .length === 1,
  );
  await c.getByRole("button", { name: "تحميل المزيد" }).click();
  await c.getByRole("heading", { name: "فيديو ثانٍ", exact: true }).waitFor();
  check("Mock Arabic search, pagination and one-tap favorite");
  await c.reload();
  await c
    .getByRole("heading", {
      name: "YouTube Developers — تجربة الاختبار",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await c
      .locator("section")
      .filter({ has: c.getByRole("heading", { name: "المفضلة ♥" }) })
      .count(),
    1,
  );
  check("Favorites persist after reload and appear below results");
  const tab = await c.evaluate(() =>
    sessionStorage.getItem("shumos.liveGame.controlTabId"),
  );
  const now = Date.now();
  await admin("patients/synthetic-patient", {
    patientNumber: "YT-QA",
    firstName: "ليلى",
    createdAt: now,
    updatedAt: now,
    createdByUid: user.localId,
    active: true,
  });
  const visit = {
    version: 1,
    visitId: "synthetic-visit",
    patientId: "synthetic-patient",
    childName: "ليلى",
    ownerUid: user.localId,
    controlTabId: tab,
    title: "جلسة الاختبار",
    therapistName: "معالج الاختبار",
    initialNotes: "",
    finalNotes: "",
    overallRating: null,
    startedAt: now,
    plannedMs: 45 * 60000,
    pausedMs: 0,
    pausedAt: null,
    endedAt: null,
    revision: 0,
    updatedAt: now,
    entries: {},
    breaks: {},
  };
  await admin("therapyVisits/synthetic-patient/synthetic-visit", visit);
  await admin(`activeTherapyVisits/${user.localId}`, {
    patientId: "synthetic-patient",
    visitId: "synthetic-visit",
    controlTabId: tab,
  });
  await c
    .getByRole("button", {
      name: "تشغيل YouTube Developers — تجربة الاختبار",
      exact: true,
    })
    .click();
  if (process.env.REAL_PLAYER === "1") {
    await d
      .locator('iframe[src*="youtube-nocookie.com"]')
      .waitFor({ timeout: 25000 });
    check("Real official privacy-enhanced embed loaded");
    const unlock = d.getByRole("button", { name: "تفعيل صوت العرض" });
    if (await unlock.isVisible()) await unlock.click();
    await until(async () =>
      ["playing", "blocked", "error"].includes(
        (await read("presence/display/youtubeStatus"))?.state,
      ),
    );
    report.actualPlayback = await read("presence/display/youtubeStatus");
    await d.screenshot({ path: out + "/real-player.png" });
    save();
  } else {
    await d.locator("iframe[data-state=playing]").waitFor();
    const other = await cc.newPage();
    await other.goto(base + "/control/youtube");
    await other
      .getByRole("heading", {
        name: "YouTube Developers — تجربة الاختبار",
        exact: true,
      })
      .waitFor();
    await other
      .getByRole("button", {
        name: "تشغيل YouTube Developers — تجربة الاختبار",
        exact: true,
      })
      .click();
    await other.getByRole("alert").filter({ hasText: "نافذة أخرى" }).waitFor();
    assert.equal(
      (await read("presence/display/youtubeCommand")).controlTabId,
      tab,
    );
    await other.close();
    await d.locator("iframe[data-state=playing]").waitFor();
    check(
      "Same-staff second tab sees favorites but cannot interrupt an owned active video",
    );
    check("Remote selection mounts one mocked player on independent Display");
    await c.getByRole("button", { name: "إيقاف مؤقت", exact: true }).click();
    await d.locator("iframe[data-state=paused]").waitFor();
    await c.getByRole("button", { name: "استئناف", exact: true }).click();
    await d.locator("iframe[data-state=playing]").waitFor();
    await c.getByLabel("ثانية الانتقال").fill("25");
    await c.getByRole("button", { name: "انتقال", exact: true }).click();
    await until(
      async () =>
        Number(await d.locator("iframe").getAttribute("data-position")) >= 25,
    );
    await c.getByRole("button", { name: "كتم", exact: true }).click();
    await d.locator("iframe[data-muted=true]").waitFor();
    await c.getByLabel("مستوى الصوت").fill("30");
    await d.locator('iframe[data-volume="30"]').waitFor();
    check(
      "Pause, resume, seek, mute and volume delivered with acknowledgements",
    );
    await d.reload();
    await d.locator("iframe[data-state=playing]").waitFor();
    assert.equal(await d.locator("iframe").count(), 1);
    check("Display reload recovers desired state without duplicate players");
    await dc.setOffline(true);
    await d
      .locator('iframe[title="Mock YouTube player"]')
      .waitFor({ state: "hidden", timeout: 20000 });
    await dc.setOffline(false);
    await d.locator("iframe[data-state=playing]").waitFor();
    check("Short Display outage safely suspends and reconnects");
    await cc.setOffline(true);
    await d
      .locator('iframe[title="Mock YouTube player"]')
      .waitFor({ state: "hidden", timeout: 25000 });
    await cc.setOffline(false);
    await c.waitForTimeout(2500);
    assert.equal(
      await d.locator('iframe[title="Mock YouTube player"]').count(),
      0,
    );
    await c.getByRole("button", { name: "استئناف", exact: true }).click();
    await d.locator("iframe[data-state=playing]").waitFor();
    check("Long Control outage expires playback and requires explicit resume");
    await c.getByRole("button", { name: "إلغاء الكتم", exact: true }).click();
    await d.locator("iframe[data-muted=false]").waitFor();
    await c
      .getByRole("button", { name: "إعادة من البداية", exact: true })
      .click();
    await until(
      async () =>
        Number(await d.locator("iframe").getAttribute("data-position")) < 5,
    );
    await c.getByLabel("البحث في يوتيوب").fill("English video test");
    await c.getByRole("button", { name: "بحث", exact: true }).click();
    await c.getByRole("button", { name: "تحميل المزيد" }).click();
    await c
      .getByRole("button", { name: "تشغيل فيديو ثانٍ", exact: true })
      .click();
    await d.locator('iframe[data-video-id="aqz-KE-bpKQ"]').waitFor();
    assert.equal(await d.locator("iframe").count(), 1);
    check(
      "English mock search, restart, unmute and switch reuse a single player",
    );
    await d.evaluate(() =>
      window.__mockPlayer.at(-1).options.events.onError({ data: 101 }),
    );
    await c
      .getByText("الفيديو غير متاح أو لا يسمح بتضمينه", { exact: true })
      .waitFor();
    await c
      .getByRole("button", { name: "إعادة من البداية", exact: true })
      .click();
    await d.locator("iframe[data-state=playing]").waitFor();
    check(
      "Embed-error feedback reaches Control and playback remains recoverable",
    );

    await until(async () => {
      const command = await read("presence/display/youtubeCommand"),
        status = await read("presence/display/youtubeStatus");
      return (
        status?.commandId === command?.commandId && status.state === "playing"
      );
    });
    await d.evaluate(() =>
      window.__mockPlayer.at(-1).options.events.onAutoplayBlocked(),
    );
    await c
      .getByText("يلزم تفعيل الصوت من شاشة العرض", { exact: true })
      .waitFor();
    await d
      .getByRole("button", { name: "تفعيل صوت العرض", exact: true })
      .click();
    await c.getByText("قيد التشغيل", { exact: true }).waitFor();
    check(
      "Autoplay-blocked feedback requires an explicit Display gesture (mocked player)",
    );
    await c.evaluate(() => window.scrollTo(0, 0));
    await c.screenshot({ path: out + "/youtube-ipad.png", fullPage: true });
    await c.setViewportSize({ width: 820, height: 1180 });
    await c.evaluate(() => window.scrollTo(0, 0));
    await c.screenshot({ path: out + "/youtube-portrait.png", fullPage: true });
    assert.equal(
      await c.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    check("iPad landscape and portrait layout have no horizontal overflow");
    await d.evaluate(() =>
      window.__mockPlayer.at(-1).options.events.onStateChange({ data: 0 }),
    );
    await until(async () => !(await read("presence/display/youtubeCommand")));
    await d.locator("iframe").waitFor({ state: "hidden" });
    check("Natural video end destroys the player and cleans the owned command");
    await c
      .locator("section")
      .filter({ has: c.getByRole("heading", { name: "المفضلة ♥" }) })
      .getByRole("button", {
        name: "تشغيل YouTube Developers — تجربة الاختبار",
        exact: true,
      })
      .click();
    await d.locator("iframe[data-state=playing]").waitFor();
    await c
      .getByRole("button", { name: "إيقاف والعودة للانتظار", exact: true })
      .click();
    await d.locator("iframe").waitFor({ state: "hidden" });
    check("Stop destroys player and returns to Shumos idle");
  }
  const finalVisit = await read(
    "therapyVisits/synthetic-patient/synthetic-visit",
  );
  assert.equal(finalVisit.startedAt, visit.startedAt);
  assert.equal(finalVisit.plannedMs, visit.plannedMs);
  assert.ok(!finalVisit.pausedAt);
  assert.ok(
    !finalVisit.entries || Object.keys(finalVisit.entries).length === 0,
  );
  check(
    "45-minute parent visit survives media with no fabricated game result or automatic break",
  );
  await c.getByRole("link", { name: "الأنشطة", exact: true }).click();
  await until(async () => !(await read("presence/display/youtubeCommand")));
  check("Client navigation cleans up only owned video command");
  assert.deepEqual(report.errors, []);
  save();
  await browser.close();
})().catch(async (e) => {
  report.failure = e.stack;
  save();
  console.error(e);
  if (c)
    await c
      .screenshot({ path: out + "/failure.png", fullPage: true })
      .catch(() => {});
  await browser?.close();
  process.exitCode = 1;
});
