import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";

const TTS_URL = "http://localhost/api/tts";

function postRequest(body: unknown): NextRequest {
  return new NextRequest(TTS_URL, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

/**
 * PRE-DEMO AUDIO FIX — focused coverage for the server-side Munsit proxy:
 * this is the ONE place MUNSIT_API_KEY is read and the ONE place that
 * decides how a Munsit failure (quota exhausted, rate-limited, unreachable)
 * turns into an HTTP response munsitProvider.ts's client-side cooldown
 * policy can act on correctly (see that file's doc comment for exactly
 * which status codes it treats as "cool down" vs "just this request").
 */
describe("POST /api/tts", () => {
  const originalKey = process.env.MUNSIT_API_KEY;
  const originalEnabled = process.env.MUNSIT_TTS_ENABLED;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.MUNSIT_API_KEY = "test-key";
    process.env.MUNSIT_TTS_ENABLED = "true";
  });

  afterEach(() => {
    process.env.MUNSIT_API_KEY = originalKey;
    process.env.MUNSIT_TTS_ENABLED = originalEnabled;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("makes zero upstream Munsit requests when MUNSIT_TTS_ENABLED=false", async () => {
    process.env.MUNSIT_TTS_ENABLED = "false";
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const response = await POST(postRequest({ text: "مرحبا" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("X-TTS-Disabled")).toBe("true");
    expect(await response.text()).toBe("");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 503 without ever calling Munsit when MUNSIT_API_KEY is not configured", async () => {
    delete process.env.MUNSIT_API_KEY;
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const response = await POST(postRequest({ text: "مرحبا" }));
    expect(response.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 400 for missing/empty text without calling Munsit", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    expect((await POST(postRequest({}))).status).toBe(400);
    expect((await POST(postRequest({ text: "" }))).status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 400 for text over the length cap without calling Munsit", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const response = await POST(postRequest({ text: "أ".repeat(501) }));
    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls Munsit's real endpoint with x-api-key auth and the documented request shape, returning audio/wav on success", async () => {
    const wavBytes = new Uint8Array([1, 2, 3, 4]);
    const fetchSpy = vi.fn().mockResolvedValue(new Response(wavBytes, { status: 200, headers: { "Content-Type": "audio/wav" } }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const response = await POST(postRequest({ text: "مرحبا يا بطل" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/wav");
    const body = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(body)).toEqual(Array.from(wavBytes));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.munsit.com/api/v1/text-to-speech/faseeh-v1-preview");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("test-key");
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody).toMatchObject({ voice_id: "ar-hijazi-female-1", text: "مرحبا يا بطل", streaming: false });
  });

  it("never leaks MUNSIT_API_KEY into the response on success or failure", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 })) as unknown as typeof fetch;
    const okResponse = await POST(postRequest({ text: "test" }));
    const okText = await okResponse.clone().text().catch(() => "");
    expect(okText.includes("test-key")).toBe(false);

    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ errorCode: "402xx", errorMessage: "Insufficient balance" }), { status: 402 })) as unknown as typeof fetch;
    const failResponse = await POST(postRequest({ text: "test" }));
    const failText = await failResponse.text();
    expect(failText.includes("test-key")).toBe(false);
  });

  it("never logs reflected clinical text or provider secrets and redacts reflected keys from errors", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ errorMessage: "test-key patient-secret-name" }), { status: 402 })) as unknown as typeof fetch;
    const response = await POST(postRequest({ text: "patient-secret-name" }));
    expect(await response.text()).not.toContain("test-key");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("patient-secret-name");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("test-key");
    global.fetch = vi.fn().mockRejectedValue(new Error("test-key patient-secret-name")) as unknown as typeof fetch;
    await POST(postRequest({ text: "patient-secret-name" }));
    expect(JSON.stringify(warn.mock.calls)).not.toContain("patient-secret-name");
    warn.mockRestore();
  });

  it("passes a Munsit 402 (insufficient balance) straight through — a definitive per-request failure, not a service-wide outage", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ errorCode: "402xx", errorMessage: "Insufficient wallet balance" }), { status: 402 })) as unknown as typeof fetch;

    const response = await POST(postRequest({ text: "مرحبا" }));
    expect(response.status).toBe(402);
  });

  it("passes a Munsit 429 (rate/concurrency limit) straight through", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ errorMessage: "Too many requests" }), { status: 429 })) as unknown as typeof fetch;

    const response = await POST(postRequest({ text: "مرحبا" }));
    expect(response.status).toBe(429);
  });

  it("returns 503 (never hangs, never throws) when Munsit is unreachable", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network error")) as unknown as typeof fetch;

    const response = await POST(postRequest({ text: "مرحبا" }));
    expect(response.status).toBe(503);
  });

  it("returns 503 when the request to Munsit times out", async () => {
    global.fetch = vi.fn().mockImplementation(() => {
      const err = new Error("aborted");
      err.name = "AbortError";
      return Promise.reject(err);
    }) as unknown as typeof fetch;

    const response = await POST(postRequest({ text: "مرحبا" }));
    expect(response.status).toBe(503);
  });

  it("returns 400 for invalid JSON body", async () => {
    const request = new NextRequest(TTS_URL, { method: "POST", body: "not json", headers: { "Content-Type": "application/json" } });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
