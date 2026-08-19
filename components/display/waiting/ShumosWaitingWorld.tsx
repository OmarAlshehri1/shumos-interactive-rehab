"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { BalloonColor } from "@/lib/game";
import { BALLOON_COLOR_THEME } from "../colorPalette";
import { BalloonArt } from "../balloon/BalloonArt";

/**
 * PLATFORM WAITING WORLD — /display's home screen whenever no canonical
 * game session is active (see components/display/DisplayScreen.tsx's game
 * resolver). Replaces the old, minimal WaitingScene: "the projector shows
 * a beautiful animated interactive waiting world for children," not a
 * loading placeholder — the child may watch this for several minutes while
 * the therapist picks an activity in the Game Library.
 *
 * Deliberately reuses rather than reinvents: Environment (sky/hills/sun/
 * clouds/birds — already rendered by DisplayShell around every screen, see
 * DisplayScreen.tsx) is the shared backdrop for both this world AND
 * Balloon Quest, which is what makes the platform -> game transition feel
 * continuous rather than a scene change. On top of that, this file only
 * adds: platform branding, decorative (non-interactive) rising balloons
 * (WelcomeScene's own rise animation/class, just a larger set), a gentle
 * star field, and two long-cycle, mostly-invisible shooting stars — see
 * app/display/balloon-quest.css for their keyframes. Everything here is a
 * FIXED, hand-placed array (same rationale as Environment's own CLOUDS/
 * LEAVES/BIRDS): deterministic, no render-time Math.random(), no risk of a
 * hydration mismatch, and a bounded/constant DOM size for a screen that may
 * stay mounted for a long time (see the report's Performance section).
 *
 * Doubles as the projector's one-time audio-unlock + fullscreen gesture,
 * exactly like the WaitingScene it replaces — the whole screen is tappable,
 * with an explicit "بدء العرض" pill as the discoverable call to action.
 * Individual decorative balloons are plain non-button divs (never
 * individually tappable) specifically so this never reads as "Balloon
 * Quest has already started."
 */

const WAITING_BALLOONS = [
  { color: BalloonColor.BLUE, left: "8%", size: "8vmin", delay: "0s", duration: "21s" },
  { color: BalloonColor.YELLOW, left: "19%", size: "5.5vmin", delay: "-9s", duration: "17s" },
  { color: BalloonColor.PURPLE, left: "31%", size: "7vmin", delay: "-4s", duration: "24s" },
  { color: BalloonColor.RED, left: "48%", size: "6vmin", delay: "-14s", duration: "19s" },
  { color: BalloonColor.GREEN, left: "63%", size: "8.5vmin", delay: "-2s", duration: "26s" },
  { color: BalloonColor.ORANGE, left: "77%", size: "5vmin", delay: "-11s", duration: "18s" },
  { color: BalloonColor.BLUE, left: "90%", size: "7vmin", delay: "-6s", duration: "23s" },
] as const;

const STARS = [
  { top: "10%", left: "6%", size: "1vmin", twinkle: "3.6s", twinkleDelay: "0s", drift: "24s", driftDelay: "0s" },
  { top: "16%", left: "22%", size: "0.7vmin", twinkle: "4.4s", twinkleDelay: "-1.2s", drift: "31s", driftDelay: "-8s" },
  { top: "8%", left: "38%", size: "1.2vmin", twinkle: "5.2s", twinkleDelay: "-2.5s", drift: "27s", driftDelay: "-15s" },
  { top: "20%", left: "52%", size: "0.8vmin", twinkle: "3.9s", twinkleDelay: "-0.6s", drift: "35s", driftDelay: "-4s" },
  { top: "12%", left: "68%", size: "1.1vmin", twinkle: "4.8s", twinkleDelay: "-3.1s", drift: "22s", driftDelay: "-11s" },
  { top: "24%", left: "81%", size: "0.7vmin", twinkle: "3.4s", twinkleDelay: "-1.8s", drift: "29s", driftDelay: "-19s" },
  { top: "6%", left: "92%", size: "1vmin", twinkle: "5.6s", twinkleDelay: "-2.2s", drift: "33s", driftDelay: "-6s" },
  { top: "30%", left: "12%", size: "0.9vmin", twinkle: "4.1s", twinkleDelay: "-3.6s", drift: "26s", driftDelay: "-13s" },
  { top: "34%", left: "44%", size: "0.7vmin", twinkle: "3.7s", twinkleDelay: "-0.9s", drift: "30s", driftDelay: "-21s" },
  { top: "28%", left: "60%", size: "1vmin", twinkle: "4.6s", twinkleDelay: "-2.9s", drift: "24s", driftDelay: "-9s" },
  { top: "38%", left: "90%", size: "0.8vmin", twinkle: "5.1s", twinkleDelay: "-1.4s", drift: "28s", driftDelay: "-17s" },
  { top: "40%", left: "26%", size: "0.9vmin", twinkle: "4.3s", twinkleDelay: "-3.9s", drift: "32s", driftDelay: "-3s" },
] as const;

/** Long, staggered, unequal cycles so the two never fall into a noticeable shared rhythm — see the keyframe's doc comment in balloon-quest.css. */
const SHOOTING_STARS = [
  { top: "14%", left: "10%", distance: "40vw", duration: "47s", delay: "-6s", rotate: "22deg" },
  { top: "26%", left: "58%", distance: "32vw", duration: "68s", delay: "-32s", rotate: "26deg" },
] as const;

export interface ShumosWaitingWorldProps {
  /** Audio-unlock + fullscreen-request gesture — see file doc comment. Never touches Firebase. */
  onTap: () => void;
  isFullscreenSupported?: boolean;
}

export function ShumosWaitingWorld({ onTap, isFullscreenSupported = true }: ShumosWaitingWorldProps) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden border-0 bg-transparent p-0 text-inherit"
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {STARS.map((star, i) => (
          <div
            key={i}
            className="bq-star absolute rounded-full"
            style={
              {
                top: star.top,
                left: star.left,
                width: star.size,
                height: star.size,
                background: "radial-gradient(circle, #FFFFFF 0%, rgba(255,255,255,0) 72%)",
                "--bq-star-twinkle-duration": star.twinkle,
                "--bq-star-twinkle-delay": star.twinkleDelay,
                "--bq-star-drift-duration": star.drift,
                "--bq-star-drift-delay": star.driftDelay,
              } as React.CSSProperties
            }
          />
        ))}

        {SHOOTING_STARS.map((s, i) => (
          <div
            key={i}
            className="bq-shooting-star absolute h-[0.35vmin] w-[9vmin] rounded-full"
            style={
              {
                top: s.top,
                left: s.left,
                background: "linear-gradient(90deg, #FFFFFF 0%, rgba(255,255,255,0) 100%)",
                transform: `rotate(${s.rotate})`,
                transformOrigin: "left center",
                "--bq-shooting-star-distance": s.distance,
                "--bq-shooting-star-duration": s.duration,
                "--bq-shooting-star-delay": s.delay,
              } as React.CSSProperties
            }
          />
        ))}

        {WAITING_BALLOONS.map((b, i) => (
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
      </div>

      <motion.div
        className="relative z-10 flex flex-col items-center gap-3 px-8 text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: "easeOut" }}
      >
        <Image src="/brand/shumos-care-logo.png" alt="شعار شموس كير" width={495} height={495} priority className="mb-[1vmin] h-[13vmin] w-[13vmin] object-contain drop-shadow-[0_6px_22px_rgba(30,41,59,.25)]" />
        <span className="text-[2.4vmin] font-medium tracking-[0.3em] text-white/70 uppercase">Shumos Interactive Rehab</span>
        <h1 className="text-[9vmin] leading-[1.1] font-extrabold text-white drop-shadow-[0_4px_18px_rgba(60,30,90,0.4)]">شموس كير</h1>
        <p className="text-[4vmin] font-bold text-white/90 drop-shadow-[0_2px_10px_rgba(60,30,90,0.3)]">التأهيل التفاعلي</p>
        <p className="mt-[1vmin] max-w-[50vw] text-[2.8vmin] leading-relaxed font-medium text-white/80">
          بانتظار اختيار النشاط من الأخصائي
        </p>
        <span className="mt-[1.5vmin] rounded-full bg-white px-[5vmin] py-[1.8vmin] text-[3vmin] font-extrabold text-indigo-600 shadow-[0_10px_30px_rgba(60,30,90,0.35)]">
          بدء العرض {isFullscreenSupported ? "⛶" : ""}
        </span>
      </motion.div>
    </button>
  );
}
