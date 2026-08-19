import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMunsitVoiceProvider } from "../munsitProvider";

/**
 * These run in Node (vitest's default environment lacks a real
 * HTMLAudioElement), so `window`/`Audio`/`URL.createObjectURL` are
 * stubbed just enough to exercise the caching and fallback logic without
 * needing a live Munsit key or an actual browser. End-to-end playback is
 * covered by the Playwright verification in the Task 4.2 report instead.
 */

function installBrowserStubs() {
  const audioInstances: FakeAudio[] = [];

  class FakeAudio {
    volume = 1;
    onplay: (() => void) | null = null;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public src: string) {
      audioInstances.push(this);
    }
    play() {
      queueMicrotask(() => {
        this.onplay?.();
        this.onended?.();
      });
      return Promise.resolve();
    }
    pause() {}
  }

  const revokedUrls: string[] = [];
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => `blob:fake-${Math.random()}`),
    revokeObjectURL: vi.fn((url: string) => revokedUrls.push(url)),
  });

  return { audioInstances, revokedUrls };
}

describe("createMunsitVoiceProvider caching", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    installBrowserStubs();
    fetchMock = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(["fake-audio"]),
    }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("only fetches once for the same text spoken twice — the second hits the client cache", async () => {
    const provider = createMunsitVoiceProvider();

    await new Promise<void>((resolve) => {
      provider.speak("مرحبا", { onEnd: resolve });
    });
    await new Promise<void>((resolve) => {
      provider.speak("مرحبا", { onEnd: resolve });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("posts to the same-origin /api/tts route, never to Munsit directly", async () => {
    const provider = createMunsitVoiceProvider();
    await new Promise<void>((resolve) => provider.speak("مرحبا", { onEnd: resolve }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tts",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ text: "مرحبا" }) }),
    );
  });

  it("calls onError (so AudioManager can retry a critical line or skip an optional one) when the endpoint responds non-OK", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    const provider = createMunsitVoiceProvider();
    let errored = false;

    await new Promise<void>((resolve) => {
      provider.speak("مرحبا", {
        onError: () => {
          errored = true;
        },
        onEnd: resolve,
      });
    });

    expect(errored).toBe(true);
  });

  it("silently settles disabled-TTS responses without audio playback, warnings, or repeated requests", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "X-TTS-Disabled": "true" }),
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    const provider = createMunsitVoiceProvider();
    let errored = false;

    const first = new Promise<void>((resolve) => provider.speak("مرحبا", { onError: () => { errored = true; }, onEnd: resolve }));
    const alreadyQueued = provider.prefetch?.("تعليمة كانت في الطابور");
    await first;
    await alreadyQueued;
    await new Promise<void>((resolve) => provider.speak("جملة أخرى", { onEnd: resolve }));

    expect(errored).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warning).not.toHaveBeenCalled();
  });

  it("after a 5xx failure, skips the network entirely for the cooldown window instead of retrying every call — a 5xx plausibly means the service itself is down", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    const provider = createMunsitVoiceProvider();

    await new Promise<void>((resolve) => provider.speak("جملة واحدة", { onEnd: resolve }));
    await new Promise<void>((resolve) => provider.speak("جملة مختلفة", { onEnd: resolve }));
    await new Promise<void>((resolve) => provider.speak("جملة ثالثة", { onEnd: resolve }));

    // Only the first attempt should have actually reached fetch(); the rest short-circuit via the cooldown.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("after a 402 (insufficient balance) failure, still tries the very next distinct line on the network — a real production incident (Task 8.1) showed one 402 for a long uncached line blanking out an entire session's worth of other lines, including short/cheap ones that would have succeeded", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 402 });
    fetchMock.mockResolvedValueOnce({ ok: true, blob: async () => new Blob(["fake-audio"]) });
    const provider = createMunsitVoiceProvider();

    await new Promise<void>((resolve) => provider.speak("جملة طويلة يحتاج نقاط كثيرة", { onEnd: resolve }));
    await new Promise<void>((resolve) => provider.speak("لا", { onEnd: resolve }));

    // Both distinct lines actually reached fetch() — no blanket cooldown from the 402.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a 429 still cools down (this account's real 'one concurrent request' limit), unlike a 402", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });
    const provider = createMunsitVoiceProvider();

    await new Promise<void>((resolve) => provider.speak("جملة أولى", { onEnd: resolve }));
    await new Promise<void>((resolve) => provider.speak("جملة ثانية", { onEnd: resolve }));

    // The second, distinct line short-circuited via the (short) 429 cooldown instead of hitting the network again immediately.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("prefetch() warms the cache without ever calling onStart/onEnd (it never plays anything), and its returned promise resolves once the fetch completes", async () => {
    const provider = createMunsitVoiceProvider();
    await provider.prefetch?.("سلام");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("prefetch() resolves sequentially — a caller awaiting each one never has two in flight at once", async () => {
    const provider = createMunsitVoiceProvider();
    let concurrent = 0;
    let maxConcurrent = 0;
    fetchMock.mockImplementation(async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 5));
      concurrent -= 1;
      return { ok: true, blob: async () => new Blob(["fake-audio"]) };
    });

    for (const text of ["واحد", "اثنان", "ثلاثة"]) {
      await provider.prefetch?.(text);
    }

    expect(maxConcurrent).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("prefetch() queues behind an in-flight real speak() call rather than skipping — still never competes for the account's single concurrency slot, but still eventually warms the cache (Task 8.1: the old skip-entirely behavior meant a prefetch queued right before a real call never got a second chance)", async () => {
    const provider = createMunsitVoiceProvider();
    let resolveSpeakFetch!: (value: { ok: boolean; blob: () => Promise<Blob> }) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSpeakFetch = resolve;
        }),
    );

    const speakDone = new Promise<void>((resolve) => provider.speak("جملة حقيقية", { onEnd: resolve }));

    let prefetchSettled = false;
    const prefetchDone = provider.prefetch?.("جملة أخرى").then(() => {
      prefetchSettled = true;
    });

    // The real speak() call's fetch is still pending — prefetch must queue behind it, not race it.
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the real speak() call has actually reached fetch() so far
    expect(prefetchSettled).toBe(false); // queued, not skipped

    resolveSpeakFetch({ ok: true, blob: async () => new Blob(["fake-audio"]) });
    await speakDone;
    await prefetchDone;

    expect(prefetchSettled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2); // the queued prefetch ran once the real call's slot freed up
  });

  // CREDIT OPTIMIZATION ROUND 2 — task's explicit required proofs: a cache
  // MISS makes exactly one real request and still plays; a cache HIT makes
  // zero new requests and still plays; two concurrent requests for the
  // identical text in flight together collapse into one upstream request.
  // "Cache miss must mean: request it on demand. NOT: remain silent."

  it("CACHE MISS: speak() makes exactly one Munsit request, then actually plays the returned audio", async () => {
    const { audioInstances } = installBrowserStubs();
    vi.stubGlobal("fetch", fetchMock);
    const provider = createMunsitVoiceProvider();

    let started = false;
    await new Promise<void>((resolve) => {
      provider.speak("نص جديد لم يُطلب من قبل", {
        onStart: () => {
          started = true;
        },
        onEnd: resolve,
      });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(started).toBe(true);
    expect(audioInstances).toHaveLength(1);
  });

  it("CACHE HIT: a second speak() for the identical text plays with ZERO new Munsit requests", async () => {
    const { audioInstances } = installBrowserStubs();
    vi.stubGlobal("fetch", fetchMock);
    const provider = createMunsitVoiceProvider();

    await new Promise<void>((resolve) => provider.speak("نص مكرر", { onEnd: resolve }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    let startedSecondTime = false;
    await new Promise<void>((resolve) => {
      provider.speak("نص مكرر", {
        onStart: () => {
          startedSecondTime = true;
        },
        onEnd: resolve,
      });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1); // still just one real request — the second was a pure cache hit
    expect(startedSecondTime).toBe(true); // and it still actually played
    expect(audioInstances).toHaveLength(2); // a fresh <audio> element per playback, both from the one cached URL
  });

  it("a rejected audio.play() settles as an error, then the cached line can play on the next gesture with no new synthesis", async () => {
    let playAttempt = 0;
    class GestureSensitiveAudio {
      volume = 1;
      onplay: (() => void) | null = null;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public src: string) {}
      play() {
        playAttempt += 1;
        if (playAttempt === 1) return Promise.reject(new DOMException("Autoplay blocked", "NotAllowedError"));
        queueMicrotask(() => {
          this.onplay?.();
          this.onended?.();
        });
        return Promise.resolve();
      }
      pause() {}
    }
    vi.stubGlobal("Audio", GestureSensitiveAudio);
    const provider = createMunsitVoiceProvider();
    let firstErrored = false;

    await new Promise<void>((resolve) =>
      provider.speak("تعليمة محفوظة", {
        onError: () => {
          firstErrored = true;
        },
        onEnd: resolve,
      }),
    );
    expect(firstErrored).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    let secondStarted = false;
    await new Promise<void>((resolve) =>
      provider.speak("تعليمة محفوظة", {
        onStart: () => {
          secondStarted = true;
        },
        onEnd: resolve,
      }),
    );
    expect(secondStarted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("IN-FLIGHT DEDUPLICATION: requesting the same text twice while the first is still loading makes only ONE upstream request", async () => {
    installBrowserStubs();
    vi.stubGlobal("fetch", fetchMock);
    const provider = createMunsitVoiceProvider();

    let resolveFetch!: (value: { ok: boolean; blob: () => Promise<Blob> }) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const first = provider.prefetch?.("نفس النص بالضبط");
    const second = provider.prefetch?.("نفس النص بالضبط");

    // Both are in flight against the same pending fetch — only one should have actually reached fetch() so far.
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch({ ok: true, blob: async () => new Blob(["fake-audio"]) });
    await first;
    await second;

    expect(fetchMock).toHaveBeenCalledTimes(1); // still just one, even after both callers resolved
  });

  it("evicts and revokes the oldest cached object URL once the client cache cap is reached (Task 7 QA: unbounded growth over a long-running /display tab)", async () => {
    const { revokedUrls } = installBrowserStubs();
    vi.stubGlobal("fetch", fetchMock);
    const provider = createMunsitVoiceProvider();

    // MAX_CLIENT_CACHE_ENTRIES is 200 — fetch 201 distinct phrases to force one eviction.
    for (let i = 0; i < 201; i++) {
      await provider.prefetch?.(`جملة رقم ${i}`);
    }

    expect(revokedUrls.length).toBeGreaterThanOrEqual(1);
  });
});
