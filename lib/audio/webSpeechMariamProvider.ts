/**
 * TEMPORARY TEST PROVIDER — isolated and reversible. Locks the browser's
 * SpeechSynthesis (Web Speech API) to the specific installed macOS voice
 * "Mariam (Enhanced)" (ar-001), so it can be compared against Audar
 * (lib/audio/audarLocalProvider.ts, currently paused mid-integration — see
 * the Task 10 checkpoint) without any local TTS server running.
 *
 * The exact voice name/voiceURI below was confirmed by actually calling
 * speechSynthesis.getVoices() in a real Chromium instance on this Mac —
 * not guessed:
 *   { name: "Mariam (Enhanced)", voiceURI: "Mariam (Enhanced)",
 *     lang: "ar-001", localService: true, default: false }
 *
 * Deliberately does NOT fall back to "any ar-* voice" the way
 * speech.ts's createSpeechSynthesisVoiceProvider() does — that generic
 * fallback is exactly what a real listening test caught replacing the
 * approved character with a robotic male browser voice mid-session (see
 * speech.ts's doc comment), which is why it was never wired into
 * AudioManager. If "Mariam (Enhanced)" specifically isn't installed,
 * isAvailable() returns false, this logs one console.warn, and
 * AudioManager's existing skip-silently policy takes over — never a
 * different voice.
 *
 * To revert to Audar: in AudioManager.ts, swap the
 * `createWebSpeechMariamProvider` import + instantiation back to
 * `createAudarLocalVoiceProvider` — nothing else references this file.
 */

import type { SpeakOptions, VoiceProvider } from "./speech";

const PREFERRED_VOICE_NAME = "Mariam (Enhanced)";
const DEFAULT_RATE = 0.95;
const DEFAULT_PITCH = 1.0;
/** Same Chrome idle-queue bug worked around in speech.ts — see that file's comment. */
const CHROME_RESUME_HEARTBEAT_MS = 12000;

export function createWebSpeechMariamProvider(): VoiceProvider {
  if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") {
    return {
      isAvailable: () => false,
      speak: (_text, options) => {
        options?.onError?.();
        options?.onEnd?.();
      },
      cancel: () => {},
    };
  }

  const synth = window.speechSynthesis;
  let mariamVoice: SpeechSynthesisVoice | null = null;
  let warnedMissing = false;
  // Same GC-during-playback bug worked around in speech.ts — keep a live reference for the utterance's duration.
  let activeUtterance: SpeechSynthesisUtterance | null = null;

  function refreshVoice(): void {
    try {
      const voices = synth.getVoices();
      mariamVoice = voices.find((voice) => voice.name === PREFERRED_VOICE_NAME) ?? null;
      if (!mariamVoice && voices.length > 0 && !warnedMissing) {
        warnedMissing = true;
        console.warn(
          `[web-speech-mariam-test] "${PREFERRED_VOICE_NAME}" voice not found on this system — ` +
            "speech will be skipped (silent), never falling back to a different system voice. " +
            `Voices seen: ${voices.map((v) => v.name).join(", ")}`,
        );
      }
    } catch {
      mariamVoice = null;
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
      return mariamVoice !== null;
    },

    speak(text: string, options?: SpeakOptions) {
      if (!text) return;
      if (!mariamVoice) {
        // Never substitute a different voice — see file doc comment.
        options?.onError?.();
        options?.onEnd?.();
        return;
      }
      try {
        synth.cancel(); // enforce: never more than one utterance in flight
        const utterance = new SpeechSynthesisUtterance(text);
        activeUtterance = utterance;
        utterance.voice = mariamVoice;
        utterance.lang = mariamVoice.lang;
        utterance.rate = options?.rate ?? DEFAULT_RATE;
        utterance.pitch = options?.pitch ?? DEFAULT_PITCH;
        utterance.volume = options?.volume ?? 1;
        utterance.onstart = () => options?.onStart?.();
        const release = () => {
          if (activeUtterance === utterance) activeUtterance = null;
        };
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
