/** Synthetic data, hardcoded loopback services only. */
import { beforeAll, describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const on = process.env.YOUTUBE_RULES_EMULATOR === "1",
  db = "http://127.0.0.1:19940",
  auth = "http://127.0.0.1:19949",
  ns = "demo-youtube-default-rtdb";
const url = (p: string, t = "") =>
  `${db}/${p}.json?ns=${ns}${t ? "&auth=" + t : ""}`;
async function write(
  p: string,
  v: unknown,
  t = "",
  admin = false,
  method = "PUT",
) {
  return (
    await fetch(url(p, t), {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(admin ? { Authorization: "Bearer owner" } : {}),
      },
      body: JSON.stringify(v),
    })
  ).status;
}
async function signup(email?: string) {
  const r = await fetch(
    `${auth}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(email ? { email, password: "LocalTest123!" } : {}),
        returnSecureToken: true,
      }),
    },
  );
  const b = await r.json();
  return { uid: b.localId as string, token: b.idToken as string };
}
describe.skipIf(!on)(
  "YouTube and Display command security (local emulators)",
  () => {
    let a: { uid: string; token: string },
      b: typeof a,
      anon: typeof a,
      inactive: typeof a;
    const video = {
      videoId: "M7lc1UVf-VE",
      title: "فيديو اختباري",
      channel: "YouTube Developers",
    };
    const cmd = () => ({
      sessionId: "media-1",
      commandId: "command-1",
      ownerId: a.uid,
      controlTabId: "tab-1",
      revision: 1,
      videoId: video.videoId,
      state: "playing",
      position: 0,
      volume: 60,
      muted: false,
      issuedAt: Date.now(),
      heartbeatAt: Date.now(),
    });
    beforeAll(async () => {
      expect(
        await write(
          ".settings/rules",
          JSON.parse(readFileSync("database.rules.json", "utf8")),
          "",
          true,
        ),
      ).toBe(200);
      await write("", null, "", true);
      const t = Date.now();
      a = await signup(`yt-a-${t}@example.test`);
      b = await signup(`yt-b-${t}@example.test`);
      anon = await signup();
      inactive = await signup(`yt-inactive-${t}@example.test`);
      for (const u of [a, b])
        await write(
          `staff/${u.uid}`,
          { active: true, role: "therapist" },
          "",
          true,
        );
      await write(
        `staff/${inactive.uid}`,
        { active: false, role: "therapist" },
        "",
        true,
      );
      await write(
        "controllerLease",
        { ownerId: a.uid, claimedAt: Date.now(), updatedAt: Date.now() },
        "",
        true,
      );
      // Anonymous identity alone has not authorized Display telemetry since
      // scoped Display approvals were introduced. Model a real approved Display.
      await write(`presence/displayAccess/${anon.uid}`, {
        approvedBy: a.uid, issuedAt: Date.now(), expiresAt: Date.now() + 60000,
      }, "", true);
    });
    it("persists staff-specific favorites, prevents duplicates and permits removal", async () => {
      const p = `youtubeFavorites/${a.uid}/${video.videoId}`;
      expect(await write(p, video, a.token)).toBe(200);
      expect(await write(p, video, a.token)).toBe(200);
      const r = await fetch(url(`youtubeFavorites/${a.uid}`, a.token));
      expect(Object.keys(await r.json())).toHaveLength(1);
      expect(await write(p, null, a.token)).toBe(200);
    });
    it("denies cross-staff, anonymous and inactive access", async () => {
      const p = `youtubeFavorites/${a.uid}/${video.videoId}`;
      for (const t of [b.token, anon.token, inactive.token, ""]) {
        expect(await write(p, video, t)).toBe(401);
        expect((await fetch(url(`youtubeFavorites/${a.uid}`, t))).status).toBe(
          401,
        );
      }
    });
    it("rejects invalid IDs, HTML, URLs, extra fields, patient data and long metadata", async () => {
      for (const patch of [
        { videoId: "bad" },
        { title: "<b>x</b>" },
        { title: "x".repeat(201) },
        { url: "https://evil.test" },
        { patientId: "patient" },
        { channel: "<script>" },
      ])
        expect(
          await write(
            `youtubeFavorites/${a.uid}/${video.videoId}`,
            { ...video, ...patch },
            a.token,
          ),
        ).toBe(401);
    });
    it("allows authenticated Display telemetry while denying forged therapist commands and subtree deletion", async () => {
      const unapproved = await signup();
      expect(await write("presence/display", { connected: true }, unapproved.token, false, "PATCH")).toBe(401);
      expect(
        await write(
          "presence/display",
          { connected: true },
          anon.token,
          false,
          "PATCH",
        ),
      ).toBe(200);
      expect(
        await write(
          "presence/display/audioEnableCommand",
          { id: "audio", requestedAt: Date.now() },
          a.token,
        ),
      ).toBe(200);
      expect(
        await write(
          "presence/display/audioEnableCommand",
          { id: "forged", requestedAt: Date.now() },
          anon.token,
        ),
      ).toBe(401);
      expect(await write("presence/display", null, anon.token)).toBe(401);
      expect(
        await write(
          "presence/display",
          { connected: false, updatedAt: Date.now() },
          anon.token,
          false,
          "PATCH",
        ),
      ).toBe(200);
      expect(
        (
          await (
            await fetch(url("presence/display/audioEnableCommand", a.token))
          ).json()
        ).id,
      ).toBe("audio");
    });
    it("only current staff lease owner can play; duplicate/stale/reordered commands are rejected", async () => {
      const p = "presence/display/youtubeCommand",
        c = cmd();
      for (const t of [anon.token, b.token, inactive.token])
        expect(await write(p, c, t)).toBe(401);
      expect(await write(p, c, a.token)).toBe(200);
      expect(await write(p, { ...c, commandId: "other" }, a.token)).toBe(401);
      expect(await write(p, { ...c, revision: 0 }, a.token)).toBe(401);
      expect(
        await write(
          p,
          { ...c, revision: 2, issuedAt: Date.now() - 60000 },
          a.token,
        ),
      ).toBe(401);
      expect(await write(p, { ...c, heartbeatAt: Date.now() }, a.token)).toBe(
        200,
      );
      expect(
        await write(
          p,
          { ...c, revision: 2, commandId: "next", controlTabId: "other-tab" },
          a.token,
        ),
      ).toBe(401);
      expect(
        await write(
          p,
          { ...c, revision: 2, commandId: "next", state: "paused" },
          a.token,
        ),
      ).toBe(200);
    });
    it("does not replace any game, saved or unsaved, at the rules boundary", async () => {
      await write("liveSession", { sessionId: "synthetic-game" }, "", true);
      expect(
        await write(
          "presence/display/youtubeCommand",
          { ...cmd(), revision: 3, commandId: "replace-game" },
          a.token,
        ),
      ).toBe(401);
      await write("liveSession", null, "", true);
    });
    it("allows owned command cleanup even after the last acknowledgement is old", async () => {
      const status = {
        sessionId: "media-1",
        commandId: "next",
        state: "paused",
        position: 0,
        updatedAt: Date.now(),
      };
      expect(
        await write("presence/display/youtubeStatus", status, anon.token),
      ).toBe(200);
      expect(
        await write(
          "presence/display/youtubeStatus",
          { ...status, commandId: "stale" },
          anon.token,
        ),
      ).toBe(401);
      expect(
        await write(
          "presence/display/youtubeCommand",
          { ...cmd(), revision: 3, commandId: "stopped", state: "stopped" },
          a.token,
        ),
      ).toBe(200);
      expect(
        await write("presence/display/youtubeCommand", null, a.token),
      ).toBe(200);
    });
    it("rejects forged future/missing lease heartbeats and stale Display acknowledgements", async () => {
      expect(
        await write(
          "controllerLease",
          {
            ownerId: a.uid,
            claimedAt: Date.now(),
            updatedAt: Date.now() + 3600000,
          },
          a.token,
        ),
      ).toBe(401);
      expect(
        await write(
          "controllerLease",
          { ownerId: a.uid, claimedAt: Date.now() },
          a.token,
        ),
      ).toBe(401);
      expect(
        await write(
          "presence/display/countdownComplete",
          { sessionId: "old-session", revision: 1 },
          anon.token,
        ),
      ).toBe(401);
      expect(
        await write(
          "presence/display/audioStatus",
          {
            state: "ready",
            contextState: "running",
            updatedAt: Date.now(),
            patientNotes: "private",
          },
          anon.token,
        ),
      ).toBe(401);
    });
  },
);
