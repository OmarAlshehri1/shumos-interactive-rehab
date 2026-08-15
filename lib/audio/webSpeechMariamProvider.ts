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
/**
 * BUG FIX (client report): "first Start Zone plays no voice, later ones do."
 * Root cause — Chromium-family browsers return an EMPTY array from the very
 * first synchronous getVoices() call after a fresh page load; the real list
 * only arrives moments later via the async "voiceschanged" event. This
 * provider is constructed (and refreshVoice() runs once, synchronously) the
 * instant the /display tab mounts — well before the operator's one-time
 * unlock tap, let alone before the therapist ever creates a session. If the
 * very first speak() call (in practice, almost always the FIRST Start Zone,
 * since that's the earliest high-priority line a fresh session speaks —
 * see AudioManager.ts's dispatch) lands before "voiceschanged" has fired,
 * mariamVoice is still null and speak() used to give up immediately,
 * permanently skipping that one line (never retried once voices did load —
 * every LATER line worked fine because by then voices had long since
 * loaded). speak() below now waits up to this long for the voice list to
 * actually populate before concluding Mariam truly isn't installed — it
 * still never substitutes a different voice, and still fails silently (no
 * different voice, ever) if this genuinely times out.
 */
const VOICE_LIST_READY_TIMEOUT_MS = 1500;

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

  function speakNow(text: string, options?: SpeakOptions): void {
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
  }

  /** Resolves once getVoices() actually returns something, or after timeoutMs — whichever first. See VOICE_LIST_READY_TIMEOUT_MS's doc comment. */
  function waitForVoiceListReady(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        try {
          synth.removeEventListener("voiceschanged", onReady);
        } catch {
          // Nothing to clean up.
        }
        clearTimeout(timer);
        resolve();
      };
      const onReady = () => {
        try {
          if (synth.getVoices().length > 0) finish();
        } catch {
          finish();
        }
      };
      try {
        synth.addEventListener("voiceschanged", onReady);
      } catch {
        // Some environments don't support this event — the timeout below still fires.
      }
      const timer = setTimeout(finish, timeoutMs);
    });
  }

  return {
    isAvailable() {
      return mariamVoice !== null;
    },

    speak(text: string, options?: SpeakOptions) {
      if (!text) return;
      if (mariamVoice) {
        speakNow(text, options);
        return;
      }
      let voicesSeen = 0;
      try {
        voicesSeen = synth.getVoices().length;
      } catch {
        // Treated as "no voices seen yet" below.
      }
      if (voicesSeen > 0) {
        // The browser's voice list IS loaded and Mariam genuinely isn't in
        // it — a real "not installed" case, fail immediately as before.
        options?.onError?.();
        options?.onEnd?.();
        return;
      }
      // The voice list hasn't loaded AT ALL yet — almost certainly this
      // tab's very first speech request racing Chrome's async voice list
      // (see VOICE_LIST_READY_TIMEOUT_MS's doc comment), not a genuine
      // "not installed" case. Give it a short, bounded chance to arrive.
      void waitForVoiceListReady(VOICE_LIST_READY_TIMEOUT_MS).then(() => {
        refreshVoice();
        speakNow(text, options);
      });
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
