"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { DisplayEvent, DisplayEventListener } from "../events";

export const TICKS = ["3", "2", "1", "ابدأ!"] as const;

const TICK_VOICE = ["3", "2", "1", "start"] as const;

/**
 * TASK 8.1 — pacing was rewritten from a blind fixed-950ms-per-tick timer to
 * being driven by Lama's actual audio playback (a real listening test found
 * the old fixed pacing rushed past each spoken number before a child could
 * process it). Each tick now waits for speakCountdownTick() to resolve
 * (Lama's audio actually ending, or failing and being given up on) plus a
 * short comfortable pause, floored so a tick never flashes by even faster
 * than before if audio is muted/instant, and capped so a stalled network
 * response can never freeze the game.
 *
 * TICK_DURATION_MS is the safety-timeout CEILING now, not a fixed duration —
 * still exported so lib/control/useRealtimeControllerSession.ts can size its
 * own (audio-blind, cross-device) COUNTDOWN -> PLAYING timer generously
 * enough to never publish PLAYING before this scene could plausibly still be
 * on-screen. Real per-tick duration is normally well under this ceiling
 * (Lama's actual playback is typically under a second per number), so in the
 * common case the display finishes its countdown noticeably before the
 * controller's timer elapses — an accepted, documented gap given the
 * realtime controller and display are different devices with no completion
 * round-trip between them (see the Task 8.1 report).
 *
 * The 4 countdown words are prefetched at session start (see
 * AudioManager.prefetchForSession) well before any INSTRUCTIONS/COUNTDOWN
 * scene is reached, so by the time a tick actually needs to speak, Lama's
 * clip is normally already cached — the real per-tick cost is just playback
 * (~0.8-1.2s for a single word, measured during Task 8.1's instrumented
 * sessions), not a fresh fetch. This ceiling is sized for that common case
 * plus real margin, not for "fetch-from-cold-plus-retry-plus-play", which is
 * the rarer case (e.g. prefetch hasn't reached a word yet) — that rarer case
 * can occasionally still get audibly interrupted by the next tick rather
 * than clipped silently; a materially larger ceiling would protect it fully
 * but was rejected because THIS constant directly sizes the controller's
 * blind (audio-unaware) COUNTDOWN_TOTAL_MS wait too, and quadrupling it was
 * observed, during Task 8.1 testing, to leave the display frozen on "ابدأ!"
 * for several extra seconds whenever a tick failed outright (Munsit down,
 * or — as hit for real during this task — an exhausted account balance) and
 * settled well under the ceiling on its own. See the Task 8.1 report's
 * "Countdown pacing implementation" section for the measurements behind
 * this number.
 */
export const TICK_DURATION_MS = 2000;
/**
 * RELIABILITY FIX — countdown/audio desync: this floor was found while a
 * since-retired browser-SpeechSynthesis test provider (a "TEMPORARY TEST
 * PROVIDER" locking macOS's "Mariam (Enhanced)" voice, no longer wired into
 * AudioManager — Munsit is the active/only voice again) resolved
 * speakCountdownTick() on SpeechSynthesisUtterance.onend — well documented
 * to fire early/unreliably for macOS Enhanced-tier voices specifically,
 * well before real audio playback had actually finished. When that
 * happened,
 * voiceSettledRef resolves almost immediately, so every tick used to fall
 * through to one blind uniform floor regardless of the word's real length —
 * and since each tick's speak() call unconditionally cancels whatever is
 * still playing, advancing before real playback finished was cutting the
 * previous word off mid-syllable. A single per-word minimum, one entry per
 * TICKS/TICK_VOICE index, replaces that uniform floor so a longer word
 * ("ثلاثة") isn't held to the same minimum as a shorter one ("واحد") — a
 * genuinely slow utterance can still win (onend arriving LATER than its
 * floor still governs pacing via the Promise.race below), this only
 * compensates for onend arriving suspiciously early. Tune these if live QA
 * still finds a word's audio outlasting its tick.
 */
const MIN_TICK_MS_BY_TICK = [1100, 1000, 900, 900] as const;
/** Short breathing room after Lama finishes a number before the next one appears. */
const PAUSE_AFTER_VOICE_MS = 280;

/** Pulled out for unit testing (see __tests__/CountdownScene.test.ts) — an out-of-range index falls back to the last entry rather than throwing. */
export function resolveMinTickMs(index: number): number {
  return MIN_TICK_MS_BY_TICK[index] ?? MIN_TICK_MS_BY_TICK[MIN_TICK_MS_BY_TICK.length - 1];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Maps a tick index to its semantic event — a switch (not array indexing) so TS narrows each variant correctly. */
function tickEvent(index: number, timestamp: number): DisplayEvent {
  switch (index) {
    case 0:
      return { type: "countdown_3", timestamp };
    case 1:
      return { type: "countdown_2", timestamp };
    case 2:
      return { type: "countdown_1", timestamp };
    default:
      return { type: "start", timestamp };
  }
}

interface CountdownSceneProps {
  onComplete: () => void;
  onEvent: DisplayEventListener;
  /** Speaks one countdown tick and resolves once it's actually settled — see lib/audio/AudioManager.ts's speakCountdownTick. */
  speakCountdownTick: (tick: "3" | "2" | "1" | "start") => Promise<void>;
}

/** 3 -> 2 -> 1 -> ابدأ!, each with a spring pop-in, an expanding ripple, paced against Lama's real voice, then calls onComplete. */
export function CountdownScene({ onComplete, onEvent, speakCountdownTick }: CountdownSceneProps) {
  const [index, setIndex] = useState(0);

  // Guards against React StrictMode's dev-only double-invocation of effects
  // with no cleanup function, which would otherwise fire the same tick's
  // voice event (and speech) twice in a row. voiceSettledRef carries the
  // in-flight speech promise from this effect to the pacing effect below —
  // safe across StrictMode's replay because a skipped second invocation
  // here (guarded by firedForIndexRef) still leaves the first invocation's
  // promise in place for the pacing effect's second invocation to await.
  const firedForIndexRef = useRef<number | null>(null);
  const voiceSettledRef = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    if (firedForIndexRef.current === index) return;
    firedForIndexRef.current = index;
    onEvent(tickEvent(index, Date.now()));
    voiceSettledRef.current = speakCountdownTick(TICK_VOICE[index]);
    // Fires once per tick change; onEvent/speakCountdownTick identity isn't a meaningful dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useEffect(() => {
    let cancelled = false;
    const isLastTick = index >= TICKS.length - 1;

    async function pace() {
      const start = performance.now();
      await Promise.race([voiceSettledRef.current.then(() => delay(PAUSE_AFTER_VOICE_MS)), delay(TICK_DURATION_MS)]);
      if (cancelled) return;
      const elapsed = performance.now() - start;
      const minTickMs = resolveMinTickMs(index);
      if (elapsed < minTickMs) await delay(minTickMs - elapsed);
      if (cancelled) return;
      if (isLastTick) onComplete();
      else setIndex((i) => i + 1);
    }

    void pace();
    return () => {
      cancelled = true;
    };
  }, [index, onComplete]);

  const tick = TICKS[index];
  const isGo = tick === "ابدأ!";

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <AnimatePresence mode="wait">
        <motion.div
          key={tick}
          className="relative flex items-center justify-center"
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.25 }}
          transition={{ type: "spring", stiffness: 260, damping: 16 }}
        >
          <motion.span
            className="absolute rounded-full border-4 border-white/50"
            style={{ width: "26vmin", height: "26vmin" }}
            initial={{ opacity: 0.7, scale: 0.6 }}
            animate={{ opacity: 0, scale: 1.6 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          />
          <span
            className="font-extrabold text-white drop-shadow-[0_6px_22px_rgba(60,30,90,0.4)]"
            style={{ fontSize: isGo ? "10vmin" : "18vmin" }}
          >
            {tick}
          </span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
