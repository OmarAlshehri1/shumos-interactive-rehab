/**
 * Thin wrapper around the browser's SpeechSynthesis (Web Speech API).
 *
 * TASK 8.1: AudioManager no longer wires this in as an automatic fallback
 * for the child-facing session — a real listening test found the child
 * hearing this exact voice (a robotic male browser voice) mid-session,
 * which is unacceptable once "Lama" (Munsit, lib/audio/munsitProvider.ts)
 * has been established as the session's one character. If Munsit fails,
 * AudioManager now retries Munsit itself (critical lines) or simply skips
 * the line (optional lines) — never switches voice. This file is kept as a
 * plain, independently-testable VoiceProvider implementation, available for
 * a future explicit development diagnostic, but nothing wires it in by
 * default anymore. See the Task 4.1 report for two Chrome-specific bugs
 * fixed here (see inline comments: a garbage-collection bug and a
 * queue-pausing bug) — still correct, just currently unused in production.
 *
 * This is exposed as a VoiceProvider — a minimal, provider-agnostic
 * interface also implemented by munsitProvider.ts, so any future backend
 * drops in with no change to AudioManager, VoiceQueue, or any scene
 * component.
 */

export interface SpeakOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  onStart?: () => void;
  /** Always called eventually, whether this attempt succeeded or failed — safe to use for restoring ducked ambience. */
  onEnd?: () => void;
  /** Called (before onEnd) if this provider specifically failed to produce/play audio — FallbackVoiceProvider uses this to retry on the next provider in the chain. */
  onError?: () => void;
}

export interface VoiceProvider {
  /** True once we know whether this provider can plausibly speak Arabic right now. */
  isAvailable(): boolean;
  speak(text: string, options?: SpeakOptions): void;
  cancel(): void;
  /**
   * Optional: best-effort background cache warm-up. Resolves once the
   * attempt finishes (success or failure) so a caller that needs to warm
   * several lines one at a time — e.g. because the provider only allows one
   * request in flight — can await each before starting the next. Providers
   * with no meaningful prefetch (like this one) simply omit it.
   */
  prefetch?(text: string): Promise<void>;
}

const DEFAULT_RATE = 0.95;
const DEFAULT_PITCH = 1.05;
/** Chrome has a long-standing bug where the speech queue silently pauses after ~15s of a tab being idle/backgrounded; a periodic pause/resume kick keeps it alive. */
const CHROME_RESUME_HEARTBEAT_MS = 12000;

export function createSpeechSynthesisVoiceProvider(): VoiceProvider {
  if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") {
    return {
      isAvailable: () => false,
      speak: (_text, options) => {
        // Nothing can play, but onEnd must still fire eventually (e.g. to restore ducked ambience) — never leave a caller hanging.
        options?.onError?.();
        options?.onEnd?.();
      },
      cancel: () => {},
    };
  }

  const synth = window.speechSynthesis;
  let arabicVoice: SpeechSynthesisVoice | null = null;
  // Chrome/Chromium can garbage-collect a SpeechSynthesisUtterance mid-speech
  // if nothing in JS still references it (the browser's internal queue
  // reference isn't always enough to prevent this) — the utterance goes
  // silent with no error event. Holding a reference here for the duration
  // of the utterance is the standard, widely-documented fix.
  let activeUtterance: SpeechSynthesisUtterance | null = null;

  function refreshVoice(): void {
    try {
      const voices = synth.getVoices();
      arabicVoice = voices.find((voice) => voice.lang?.toLowerCase().startsWith("ar")) ?? null;
    } catch {
      arabicVoice = null;
    }
  }

  refreshVoice();
  try {
    synth.addEventListener("voiceschanged", refreshVoice);
  } catch {
    // Some environments (older WebViews) don't support this event — refreshVoice() was still tried once above.
  }

  if (typeof window.setInterval === "function") {
    window.setInterval(() => {
      try {
        if (synth.speaking && !synth.paused) {
          synth.pause();
          synth.resume();
        }
      } catch {
        // Best-effort only — never let this workaround itself throw.
      }
    }, CHROME_RESUME_HEARTBEAT_MS);
  }

  return {
    isAvailable() {
      return arabicVoice !== null;
    },

    speak(text, options) {
      if (!text) return;
      try {
        synth.cancel(); // enforce: never more than one utterance in flight
        const utterance = new SpeechSynthesisUtterance(text);
        activeUtterance = utterance; // keep alive until it finishes — see comment above
        utterance.lang = "ar-SA";
        if (arabicVoice) utterance.voice = arabicVoice;
        utterance.rate = options?.rate ?? DEFAULT_RATE;
        utterance.pitch = options?.pitch ?? DEFAULT_PITCH;
        utterance.volume = options?.volume ?? 1;
        utterance.onstart = () => options?.onStart?.();
        const release = () => {
          if (activeUtterance === utterance) activeUtterance = null;
        };
        // Treat an error as "finished" so callers waiting on onEnd (e.g. to restore ducked ambience) never hang.
        utterance.onend = () => {
          release();
          options?.onEnd?.();
        };
        utterance.onerror = () => {
          release();
          options?.onError?.();
          options?.onEnd?.();
        };
        synth.speak(utterance);
      } catch {
        activeUtterance = null;
        options?.onError?.();
        options?.onEnd?.();
      }
    },

    cancel() {
      try {
        synth.cancel();
        activeUtterance = null;
      } catch {
        // Nothing to clean up.
      }
    },
  };
}
