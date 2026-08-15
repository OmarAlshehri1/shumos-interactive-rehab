import type { SpeakOptions, VoiceProvider } from "./speech";

/**
 * TASK 10 — client-side VoiceProvider for the local Audar-TTS-V1-Flash
 * service (demo_female_3 — "female, airy, dreamy"). Replaces Munsit as the
 * production voice: no per-request cost, no account balance, no network
 * dependency beyond this machine. This file never talks to the Python
 * service directly — it POSTs plain `{ text }` to our own same-origin
 * /api/tts route (app/api/tts/route.ts), which proxies to
 * http://127.0.0.1:8890 (the local service — see scripts/start-tts.sh).
 * That indirection is unchanged from the Munsit era, so the client-side
 * caching/cancellation/retry contract below is deliberately almost
 * identical to the old munsitProvider.ts (see git history) — the local
 * service is just a different backend behind the exact same VoiceProvider
 * shape. AudioManager/VoiceQueue and every scene component have no idea
 * which provider is plugged in.
 */

const TTS_ENDPOINT = "/api/tts";
/**
 * Local CPU/GPU generation can genuinely take several seconds for a longer
 * line (unlike Munsit's cloud round trip) — generous relative to the old
 * 6s cloud timeout so a real-but-slow generation isn't mistaken for a dead
 * service.
 */
const FETCH_TIMEOUT_MS = 20000;
/**
 * Applied only when the service itself seems unreachable (connection
 * refused/timeout) or still loading its model (503) — genuinely transient,
 * self-heals once `scripts/start-tts.sh` finishes starting. Short: this is
 * a local process on the same machine, not a remote outage — if it's
 * going to come back, it'll be within seconds, not the minute-scale
 * cooldown that made sense for a shared cloud account.
 */
const UNAVAILABLE_COOLDOWN_MS = 8000;
/**
 * A 400/500 for one specific line (bad input, or the model genuinely
 * failed on this text) says nothing about every OTHER line — never
 * blanket-cools down for these, for the exact reason Task 8.1 documented
 * for Munsit's 402: one bad phrase must never blank out an entire session.
 */
const MAX_CLIENT_CACHE_ENTRIES = 200;

class RequestFailedError extends Error {
  constructor(public status: number) {
    super(`TTS endpoint responded ${status}`);
  }
}

export function createAudarLocalVoiceProvider(): VoiceProvider {
  if (typeof window === "undefined") {
    return { isAvailable: () => false, speak: () => {}, cancel: () => {} };
  }

  const cache = new Map<string, string>();
  const inFlight = new Map<string, Promise<string>>();
  let currentAudio: HTMLAudioElement | null = null;
  let currentPlayingText: string | null = null;
  let currentRequestId = 0;
  let unavailableUntil = 0;

  function isCoolingDown(): boolean {
    return Date.now() < unavailableUntil;
  }

  function markUnavailable(cooldownMs: number = UNAVAILABLE_COOLDOWN_MS): void {
    unavailableUntil = Date.now() + cooldownMs;
  }

  function touchCache(text: string, url: string): void {
    cache.delete(text);
    cache.set(text, url);
  }

  function cacheAudioUrl(text: string, url: string): void {
    if (cache.size >= MAX_CLIENT_CACHE_ENTRIES) {
      for (const [candidateText, candidateUrl] of cache) {
        if (candidateText === currentPlayingText) continue;
        URL.revokeObjectURL(candidateUrl);
        cache.delete(candidateText);
        break;
      }
    }
    cache.set(text, url);
  }

  function stopCurrentAudio(): void {
    if (currentAudio) {
      currentAudio.onplay = null;
      currentAudio.onended = null;
      currentAudio.onerror = null;
      currentAudio.pause();
      currentAudio = null;
    }
    currentPlayingText = null;
  }

  // Same reasoning as the old munsitProvider.ts: serialize every network
  // call (real speak() AND background prefetch()) so at most one is ever
  // in flight — here specifically because "do not overwhelm the local
  // model" (this task's own instruction): a single local CPU/GPU can only
  // usefully run one generation at a time anyway, so parallel requests
  // would just queue inside the Python service regardless.
  let fetchQueue: Promise<unknown> = Promise.resolve();

  function enqueueFetch(text: string): Promise<string> {
    const result = fetchQueue.then(
      () => fetchAudioUrl(text),
      () => fetchAudioUrl(text),
    );
    fetchQueue = result.catch(() => {});
    return result;
  }

  async function fetchAudioUrl(text: string): Promise<string> {
    const cached = cache.get(text);
    if (cached) {
      touchCache(text, cached);
      return cached;
    }

    const pending = inFlight.get(text);
    if (pending) return pending;

    const request = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const response = await fetch(TTS_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new RequestFailedError(response.status);
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        cacheAudioUrl(text, url);
        return url;
      } catch (error) {
        const status = error instanceof RequestFailedError ? error.status : null;
        if (status === null || status === 503) {
          // Network error/timeout (service not running at all) or 503
          // (model still loading) — both mean "not ready right now,"
          // plausibly true for every other line too.
          markUnavailable(UNAVAILABLE_COOLDOWN_MS);
        }
        // A 400/500 is specific to this one line — see the const's doc comment above.
        console.warn(
          `[audar-tts] request failed for a ${text.length}-char line: ${
            status !== null ? `HTTP ${status}` : (error as Error)?.name === "AbortError" ? "timeout" : "network error"
          }`,
        );
        throw error;
      } finally {
        clearTimeout(timeout);
        inFlight.delete(text);
      }
    })();

    inFlight.set(text, request);
    return request;
  }

  return {
    isAvailable: () => !isCoolingDown(),

    speak(text: string, options?: SpeakOptions) {
      if (!text) return;
      stopCurrentAudio();
      const requestId = ++currentRequestId;

      if (isCoolingDown() && !cache.has(text)) {
        options?.onError?.();
        options?.onEnd?.();
        return;
      }

      void enqueueFetch(text)
        .then((url) => {
          if (requestId !== currentRequestId) return;
          const audio = new Audio(url);
          audio.volume = options?.volume ?? 1;
          currentAudio = audio;
          currentPlayingText = text;
          audio.onplay = () => options?.onStart?.();
          audio.onended = () => {
            if (currentAudio === audio) {
              currentAudio = null;
              currentPlayingText = null;
            }
            options?.onEnd?.();
          };
          audio.onerror = () => {
            if (currentAudio === audio) {
              currentAudio = null;
              currentPlayingText = null;
            }
            options?.onError?.();
            options?.onEnd?.();
          };
          void audio.play().catch(() => {
            if (currentAudio === audio) {
              currentAudio = null;
              currentPlayingText = null;
            }
            options?.onError?.();
            options?.onEnd?.();
          });
        })
        .catch(() => {
          if (requestId !== currentRequestId) return;
          options?.onError?.();
          options?.onEnd?.();
        });
    },

    cancel() {
      currentRequestId++;
      stopCurrentAudio();
    },

    async prefetch(text: string) {
      if (!text || cache.has(text) || inFlight.has(text) || isCoolingDown()) return;
      try {
        await enqueueFetch(text);
      } catch {
        // Best-effort only — the next real speak() call for this text will just try again itself.
      }
    },
  };
}
