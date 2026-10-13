import { beforeEach, describe, it, expect, vi } from "vitest";
import { authorizeTherapist, consumeRate, searchVideos } from "../server";
import { POST } from "@/app/api/youtube/search/route";
const mocked = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", mocked);
  mocked.mockReset();
  vi.stubEnv("YOUTUBE_API_KEY", "test-server-secret");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "fake");
  vi.stubEnv(
    "NEXT_PUBLIC_FIREBASE_DATABASE_URL",
    "https://demo.firebaseio.com",
  );
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_EMULATOR_HOST", "");
});
describe("authenticated official search", () => {
  it("rejects anonymous HTTP requests before calling an upstream", async () => {
    const r = await POST(
      new Request("http://localhost/api/youtube/search", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(r.status).toBe(401);
    expect(mocked).not.toHaveBeenCalled();
  });
  it("checks Firebase identity and current staff allowlist", async () => {
    mocked
      .mockResolvedValueOnce(Response.json({ users: [{ localId: "staff" }] }))
      .mockResolvedValueOnce(Response.json(true));
    expect(await authorizeTherapist("signed-token")).toBe("staff");
    expect(mocked.mock.calls[1][0]).toContain("/staff/staff/active.json");
    expect(mocked.mock.calls[0][1].body).toContain("signed-token");
  });
  it("denies inactive staff and invalid tokens", async () => {
    mocked
      .mockResolvedValueOnce(
        Response.json({ users: [{ localId: "disabled" }] }),
      )
      .mockResolvedValueOnce(Response.json(false));
    await expect(authorizeTherapist("token")).rejects.toMatchObject({
      status: 403,
    });
    mocked.mockResolvedValueOnce(Response.json({}, { status: 400 }));
    await expect(authorizeTherapist("token")).rejects.toMatchObject({
      status: 401,
    });
  });
  it("supports Arabic, English, official embed filtering and pagination without returning the secret", async () => {
    mocked.mockImplementation(async () =>
      Response.json({
        items: [
          {
            id: { videoId: "M7lc1UVf-VE" },
            snippet: { title: "أغنية", channelTitle: "Channel" },
          },
        ],
        nextPageToken: "next_123",
      }),
    );
    for (const q of ["أناشيد الاختبار", "english songs test"]) {
      const result = await searchVideos(q, "page_123");
      expect(result.videos[0].title).toBe("أغنية");
      expect(result.nextPageToken).toBe("next_123");
      expect(JSON.stringify(result)).not.toContain("test-server-secret");
    }
    expect(mocked.mock.calls[0][0]).toContain("videoEmbeddable=true");
    expect(mocked.mock.calls[0][0]).toContain("pageToken=page_123");
  });
  it("bounds input, exposes setup state, and reports quota honestly", async () => {
    for (const q of ["", "x".repeat(121), "<html>"])
      await expect(searchVideos(q, undefined)).rejects.toMatchObject({
        status: 400,
      });
    vi.stubEnv("YOUTUBE_API_KEY", "");
    await expect(searchVideos("setup test", undefined)).rejects.toMatchObject({
      code: "setup-required",
    });
    vi.stubEnv("YOUTUBE_API_KEY", "test-server-secret");
    mocked.mockResolvedValueOnce(
      Response.json(
        { error: { errors: [{ reason: "quotaExceeded" }] } },
        { status: 403 },
      ),
    );
    await expect(searchVideos("quota test", undefined)).rejects.toMatchObject({
      code: "quota-exceeded",
    });
  });
  it("caches repeated pages briefly and enforces per-identity request limits", async () => {
    mocked.mockResolvedValue(Response.json({ items: [] }));
    await searchVideos("cache unique query", undefined);
    await searchVideos("cache unique query", undefined);
    expect(mocked).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 6; i++) consumeRate("rate-user", 100);
    expect(() => consumeRate("rate-user", 101)).toThrow("rate-limit");
    expect(() => consumeRate("rate-user", 60200)).not.toThrow();
  });
  it("enforces authentication and bounded bodies at the HTTP boundary", async () => {
    const headers = {
      Authorization: "Bearer abcdefghijklmnopqrstuvwxyz0123456789",
      "Content-Type": "application/json",
    };
    mocked
      .mockResolvedValueOnce(
        Response.json({ users: [{ localId: "route-inactive" }] }),
      )
      .mockResolvedValueOnce(Response.json(false));
    expect(
      (
        await POST(
          new Request("http://localhost/api/youtube/search", {
            method: "POST",
            headers,
            body: JSON.stringify({ query: "songs" }),
          }),
        )
      ).status,
    ).toBe(403);
    mocked.mockReset();
    mocked
      .mockResolvedValueOnce(
        Response.json({ users: [{ localId: "route-active" }] }),
      )
      .mockResolvedValueOnce(Response.json(true));
    expect(
      (
        await POST(
          new Request("http://localhost/api/youtube/search", {
            method: "POST",
            headers,
            body: "x".repeat(4096),
          }),
        )
      ).status,
    ).toBe(400);
    expect(mocked).toHaveBeenCalledTimes(2);
  });
});
