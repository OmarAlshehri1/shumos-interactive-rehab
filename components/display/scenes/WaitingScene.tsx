"use client";

import { motion } from "motion/react";
import { BalloonColor } from "@/lib/game";
import { BALLOON_COLOR_THEME } from "../colorPalette";
import { BalloonArt } from "../balloon/BalloonArt";

const AMBIENT_BALLOONS = [
  { color: BalloonColor.BLUE, left: "12%", size: "9vmin", delay: "0s", duration: "17s" },
  { color: BalloonColor.YELLOW, left: "24%", size: "6vmin", delay: "-6s", duration: "14s" },
  { color: BalloonColor.RED, left: "78%", size: "8vmin", delay: "-3s", duration: "18s" },
  { color: BalloonColor.PURPLE, left: "88%", size: "6.5vmin", delay: "-10s", duration: "15s" },
  { color: BalloonColor.GREEN, left: "6%", size: "5.5vmin", delay: "-13s", duration: "16s" },
] as const;

interface WaitingSceneProps {
  /** Local audio-unlock + fullscreen-request gesture (see report) — never touches Firebase; the therapist's device is what actually starts a session. */
  onTap: () => void;
  /** TASK 9 PART 4: whether the browser Fullscreen API is available at all — purely cosmetic (hides the ⛶ glyph when it would be misleading). requestFullscreen() is always safe to call regardless. */
  isFullscreenSupported?: boolean;
}

/**
 * TASK 6: shown on /display whenever there is no active Firebase session —
 * on first load, and again after "جلسة جديدة" clears the previous one.
 * Reuses WelcomeScene's approved ambient-balloons visual language (same
 * component, same rising-balloon animation) rather than inventing a new
 * look, per "this is a functional state adaptation, not a redesign."
 *
 * Doubles as the projector's one-time audio-unlock gesture: browser
 * autoplay policy requires a real user gesture on THIS device before any
 * audio can play here, and once the therapist starts a session remotely
 * from the iPad, there is no further opportunity for the projector's own
 * page to receive a click. Whoever sets up the room taps anywhere on this
 * screen once; every subsequent Munsit/SpeechSynthesis line for the rest of
 * this tab's lifetime plays normally.
 *
 * TASK 9 PART 4: the SAME tap also requests browser fullscreen — the
 * Fullscreen API requires a genuine user gesture too, so this is the one
 * opportunity to ask. The whole screen stays tappable (robustness — a tap
 * that lands slightly off the button still works), but the explicit
 * "بدء العرض" pill is the clear, discoverable call to action per spec.
 */
export function WaitingScene({ onTap, isFullscreenSupported = true }: WaitingSceneProps) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="relative flex h-full w-full flex-col items-center justify-center border-0 bg-transparent p-0 text-inherit"
    >
      {AMBIENT_BALLOONS.map((b, i) => (
        <div
          key={i}
          className="bq-welcome-balloon absolute bottom-0"
          style={
            {
              left: b.left,
              width: b.size,
              height: b.size,
              "--bq-rise-delay": b.delay,
              "--bq-rise-duration": b.duration,
            } as React.CSSProperties
          }
        >
          <BalloonArt theme={BALLOON_COLOR_THEME[b.color]} />
        </div>
      ))}

      <motion.div
        className="relative z-10 flex flex-col items-center gap-4 px-8 text-center"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      >
        <h1 className="text-[7vmin] leading-tight font-extrabold text-white drop-shadow-[0_4px_18px_rgba(60,30,90,0.35)]">
          جاهزين للمغامرة 🎈
        </h1>
        <p className="max-w-[50vw] text-[2.8vmin] leading-relaxed font-medium text-white/85">
          بانتظار بدء الجلسة من الأخصائي
        </p>
        <span className="mt-[1vmin] rounded-full bg-white px-[5vmin] py-[1.8vmin] text-[3vmin] font-extrabold text-indigo-600 shadow-[0_10px_30px_rgba(60,30,90,0.35)]">
          بدء العرض {isFullscreenSupported ? "⛶" : ""}
        </span>
      </motion.div>
    </button>
  );
}
