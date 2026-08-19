import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWebSpeechMariamProvider } from "../webSpeechMariamProvider";

/**
 * RELIABILITY FIX ("Mariam randomly not speaking"): Chromium silently drops
 * an utterance passed to speechSynthesis.speak() when it's called in the
 * same synchronous tick as a speechSynthesis.cancel() — and VoiceQueue's
 * priority model calls exactly that cancel-then-speak sequence every time a
 * "high" line interrupts another (every countdown tick, every instruction —
 * see voiceQueue.ts). These tests exercise the fix directly against a fake
 * SpeechSynthesis (vitest's default environment has no real one): the new
 * speak() must be deferred to a fresh macrotask whenever something was
 * already speaking/pending, and only the LATEST deferred call may ever
 * actually reach synth.speak() — an older, superseded one must stay silent
 * rather than speaking stale text after the fact.
 */

class FakeUtterance {
  voice: unknown = null;
  lang = "";
  rate = 1;
  pitch = 1;
  volume = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

const MARIAM_VOICE = { name: "Mariam (Enhanced)", voiceURI: "Mariam (Enhanced)", lang: "ar-001", localService: true, default: false };

function installFakeSpeechSynthesis(options: { speaking?: boolean } = {}) {
  const spokenUtterances: FakeUtterance[] = [];
  const synth = {
    speaking: options.speaking ?? false,
    pending: false,
    paused: false,
    getVoices: () => [MARIAM_VOICE],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    cancel: vi.fn(),
    speak: vi.fn((utterance: FakeUtterance) => {
      spokenUtterances.push(utterance);
    }),
    pause: vi.fn(),
    resume: vi.fn(),
  };
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  (globalThis as unknown as { speechSynthesis: typeof synth }).speechSynthesis = synth;
  return { synth, spokenUtterances };
}

describe("createWebSpeechMariamProvider — cancel-then-speak race fix", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("speaks immediately (no deferral) when nothing is currently speaking", () => {
    const { synth, spokenUtterances } = installFakeSpeechSynthesis({ speaking: false });
    const provider = createWebSpeechMariamProvider();

    provider.speak("مرحبا");

    expect(synth.cancel).not.toHaveBeenCalled();
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(spokenUtterances[0].text).toBe("مرحبا");
  });

  it("defers the new speak() to a fresh macrotask instead of calling it synchronously right after cancel()", async () => {
    const { synth } = installFakeSpeechSynthesis({ speaking: true });
    const provider = createWebSpeechMariamProvider();

    provider.speak("ثلاثة");

    // cancel() runs synchronously, but the new utterance must NOT be handed
    // to speak() in the same tick — that's the exact sequence Chromium drops.
    expect(synth.cancel).toHaveBeenCalledTimes(1);
    expect(synth.speak).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(0);

    expect(synth.speak).toHaveBeenCalledTimes(1);
  });

  it("a newer speak() call supersedes an older still-deferred one — only the latest text is ever actually spoken", async () => {
    const { synth, spokenUtterances } = installFakeSpeechSynthesis({ speaking: true });
    const provider = createWebSpeechMariamProvider();

    const staleOnEnd = vi.fn();
    provider.speak("اثنان", { onEnd: staleOnEnd });
    provider.speak("واحد"); // arrives before "اثنان" ever got a chance to reach synth.speak()

    await vi.advanceTimersByTimeAsync(0);

    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(spokenUtterances[0].text).toBe("واحد");
    // The superseded request's own onEnd never fires — it was silently dropped, not spoken then ended.
    expect(staleOnEnd).not.toHaveBeenCalled();
  });

  it("still calls onEnd for a request that was never superseded, once its deferred speak() actually starts (via the utterance's own onend)", async () => {
    const { spokenUtterances } = installFakeSpeechSynthesis({ speaking: true });
    const provider = createWebSpeechMariamProvider();

    const onEnd = vi.fn();
    provider.speak("ابدأ", { onEnd });
    await vi.advanceTimersByTimeAsync(0);

    expect(spokenUtterances).toHaveLength(1);
    spokenUtterances[0].onend?.(); // simulate the browser finishing playback
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
