import type { SpeakOptions, VoiceProvider } from "./speech";

/**
 * Client-side VoiceProvider for Munsit's "Lama" voice (Saudi Hijazi
 * female) — the ONLY voice AudioManager speaks with during a normal child
 * session as of Task 8.1 (see the Task 8.1 report: browser SpeechSynthesis
 * is no longer wired in as an automatic fallback). This file never talks to
 * Munsit directly and never sees MUNSIT_API_KEY — it only calls our own
 * same-origin /api/tts route, which holds the secret server-side (see
 * app/api/tts/route.ts). If that route is unreachable, times out, or Munsit
 * itself errors, speak() reports failure via onError; AudioManager decides
 * what happens next (one retry for a critical line, or silently skipping an
 * optional one) — this file never blocks gameplay waiting on it and never
 * falls back to a different voice itself.
 */

const TTS_ENDPOINT = "/api/tts";
const FETCH_TIMEOUT_MS = 6000;
/**
 * Cooldown applied only for failures that plausibly mean "Munsit/the /api/tts
 * route itself is unreachable right now" — a network error, a timeout, or a
 * 5xx from either our route or Munsit. There's no reason to repeat a request
 * we already know will fail the same way for every subsequent phrase while
 * that's true. Short enough to self-heal quickly if a transient outage
 * clears mid-session.
 *
 * Deliberately NOT applied to a definitive per-request 4xx (400/401/402/404
 * — see RequestFailedError handling below): a real production incident
 * (Task 8.1) showed one 402 "insufficient balance" response for a single
 * long, uncached phrase blanking out an ENTIRE 3-stage session's worth of
 * every OTHER phrase onto SpeechSynthesis, even short/cheap/already-cached
 * ones that would have succeeded. A 4xx tells us this specific request
 * failed, not that the service is down — cooling down for it punishes every
 * other line for no reason a wait can fix.
 */
const UNAVAILABLE_COOLDOWN_MS = 60000;
/**
 * A 429 from our own /api/tts route means Munsit's real answer was
 * "concurrency limit exceeded" (this account allows only 1 request in
 * flight — a real error seen during Task 4.2 debugging), not "this key/
 * deployment is broken". It's a race between two genuinely time-critical
 * lines (e.g. welcome and the instruction right after it), and the slot
 * frees up as soon as the other request finishes — almost immediately, not
 * 60 seconds later. Cooling down for the long window here was blanking out
 * an entire session's worth of subsequent lines over one transient race.
 */
const RATE_LIMIT_COOLDOWN_MS = 300;
/**
 * Caps how many distinct phrases' object URLs this tab keeps alive at once.
 * Without a bound, every uniquely-worded line (e.g. "أحسنت يا {name}!" for
 * each different child across a clinic day) accumulates in memory for as
 * long as the /display tab stays open — which in real use could be hours.
 * Found via Task 7 QA's long-session review; mirrors app/api/tts/route.ts's
 * own MAX_CACHE_ENTRIES for the same reason on the server side.
 */
const MAX_CLIENT_CACHE_ENTRIES = 200;

class RequestFailedError extends Error {
  constructor(public status: number) {
    super(`TTS endpoint responded ${status}`);
  }
}

class KnownUnavailableError extends Error {}

export function createMunsitVoiceProvider(): VoiceProvider {
  if (typeof window === "undefined") {
    return { isAvailable: () => false, speak: () => {}, cancel: () => {} };
  }

  // text -> object URL, cached for this page session so a repeated phrase
  // (e.g. the same target color on two different stages) never re-fetches.
  // Iteration order doubles as recency order (see touchCache below), so the
  // *least-recently-used* entry — not just the first ever inserted — is what
  // gets evicted once the cap is reached. Without that distinction, a
  // frequently-reused line (a countdown word, cached in the first few
  // seconds of the very first session) would be the first thing evicted
  // hours into a long clinic day, while one-off personalized lines used
  // exactly once would survive far longer.
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

  /** Moves `text` to the most-recently-used end of the cache's iteration order. */
  function touchCache(text: string, url: string): void {
    cache.delete(text);
    cache.set(text, url);
  }

  // Evicts the least-recently-used cached entry once the cap is reached,
  // revoking its object URL so the underlying blob memory is actually
  // released — createObjectURL() otherwise holds it for the page's entire
  // lifetime, never garbage collected on its own. Never evicts the entry
  // that's actively playing right now, even if it happens to be the
  // least-recently-used one (e.g. a very long line right at the cap).
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

  // Serializes EVERY network call this provider makes — real speak() calls
  // AND background prefetch() calls alike — so at most one is ever in
  // flight, matching this account's hard "1 concurrent request" limit
  // exactly. Without this, two genuinely time-critical lines fired close
  // together — e.g. the welcome line, then the very next stage's
  // instruction right after the user clicks start, before welcome's fetch
  // has resolved — would start fetching immediately and race for the single
  // slot, guaranteeing a 429 for whichever loses (observed deterministically
  // during Task 4.2 debugging). A background prefetch already in flight when
  // a real line needs to speak is the same race from a different pair of
  // callers, so it shares this exact queue rather than a separate one: a
  // real call may have to wait out one already-started prefetch fetch
  // (bounded by FETCH_TIMEOUT_MS, typically under a second in practice), but
  // that's a small, bounded delay versus a guaranteed 429.
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
    // Requests can already be queued when the first response establishes a
    // disabled/outage cooldown. Stop those queued jobs before they create a
    // browser request (or get aborted during navigation/page close).
    if (isCoolingDown()) throw new KnownUnavailableError("TTS unavailable");

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
        if (response.headers?.get?.("X-TTS-Disabled") === "true") {
          // Consume the successful empty body before settling. Abandoning a
          // Response after headers makes Chromium report net::ERR_ABORTED in
          // request instrumentation even though the server returned 200.
          await response.arrayBuffer();
          markUnavailable(UNAVAILABLE_COOLDOWN_MS);
          throw new KnownUnavailableError("TTS disabled");
        }
        if (!response.ok) {
          throw new RequestFailedError(response.status);
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        cacheAudioUrl(text, url);
        return url;
      } catch (error) {
        if (error instanceof KnownUnavailableError) throw error;
        const status = error instanceof RequestFailedError ? error.status : null;
        if (status === 429) {
          markUnavailable(RATE_LIMIT_COOLDOWN_MS);
        } else if (status === null || status >= 500) {
          // Network error/timeout (status === null) or a 5xx — both
          // plausibly mean the service itself is unreachable right now.
          markUnavailable(UNAVAILABLE_COOLDOWN_MS);
        }
        // Any other 4xx (400/401/402/404/...) is a definitive per-request
        // failure — see UNAVAILABLE_COOLDOWN_MS's comment for why that does
        // NOT cool down every other line too.
        console.warn(
          `[munsit] request failed for a ${text.length}-char line: ${
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
    // We don't know server-side key/health status from the client without
    // an extra round trip — stay optimistic (unless we're in a cooldown
    // from a just-failed attempt) and let a failed speak() call report
    // onError, which is what AudioManager uses to decide whether to retry
    // (critical lines) or just skip (optional lines) — see AudioManager.ts.
    isAvailable: () => !isCoolingDown(),

    speak(text: string, options?: SpeakOptions) {
      if (!text) return;
      stopCurrentAudio();
      const requestId = ++currentRequestId;

      if (isCoolingDown() && !cache.has(text)) {
        // Known-unavailable right now and nothing cached for this exact
        // line — fail over immediately without another network round trip.
        options?.onError?.();
        options?.onEnd?.();
        return;
      }

      void enqueueFetch(text)
        .then((url) => {
          if (requestId !== currentRequestId) return; // superseded by a newer speak()/cancel() while this was in flight
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
      currentRequestId++; // invalidate any in-flight fetch's result
      stopCurrentAudio();
    },

    async prefetch(text: string) {
      if (!text || cache.has(text) || inFlight.has(text) || isCoolingDown()) return;
      try {
        await enqueueFetch(text);
      } catch {
        // Best-effort only — the next real speak() call for this text will just try Munsit again itself.
      }
    },
  };
}
