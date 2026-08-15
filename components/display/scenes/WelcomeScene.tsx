"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { BalloonColor } from "@/lib/game";
import { BALLOON_COLOR_THEME } from "../colorPalette";
import { BalloonArt } from "../balloon/BalloonArt";
import type { DisplayEventListener } from "../events";

const AMBIENT_BALLOONS = [
  { color: BalloonColor.BLUE, left: "12%", size: "9vmin", delay: "0s", duration: "17s" },
  { color: BalloonColor.YELLOW, left: "24%", size: "6vmin", delay: "-6s", duration: "14s" },
  { color: BalloonColor.RED, left: "78%", size: "8vmin", delay: "-3s", duration: "18s" },
  { color: BalloonColor.PURPLE, left: "88%", size: "6.5vmin", delay: "-10s", duration: "15s" },
  { color: BalloonColor.GREEN, left: "6%", size: "5.5vmin", delay: "-13s", duration: "16s" },
] as const;

interface WelcomeSceneProps {
  childName: string;
  onEvent: DisplayEventListener;
  /** Unlocks audio (must run synchronously inside the click handler, per browser autoplay policy) and advances past WELCOME. */
  onStart: () => void;
}

export function WelcomeScene({ childName, onEvent, onStart }: WelcomeSceneProps) {
  // Fired once on mount for consistency with the other scenes' onEvent pattern, even though
  // audio can't actually play yet — AudioManager holds this and replays it once unlock() runs.
  const hasFiredWelcome = useRef(false);
  useEffect(() => {
    if (hasFiredWelcome.current) return;
    hasFiredWelcome.current = true;
    onEvent({ type: "welcome", timestamp: Date.now(), childName });
    // Fire once when this scene mounts, not on every onEvent/childName identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center">
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
        className="relative z-10 flex flex-col items-center gap-6 px-8 text-center"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      >
        <span className="text-[3vmin] font-medium tracking-[0.3em] text-white/80 uppercase">Balloon Quest</span>
        <h1 className="text-[9vmin] leading-[1.15] font-extrabold text-white drop-shadow-[0_4px_18px_rgba(60,30,90,0.35)]">
          مغامرة البالونات
        </h1>
        <p className="max-w-[46vw] text-[3.2vmin] leading-relaxed font-medium text-white/90">
          استعد لمغامرة مليئة بالألوان والحركة!
        </p>

        <motion.button
          type="button"
          onClick={onStart}
          className="mt-[1vmin] rounded-full bg-white px-[5vmin] py-[1.8vmin] text-[3vmin] font-extrabold text-indigo-600 shadow-[0_10px_30px_rgba(60,30,90,0.35)]"
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
        >
          ابدأ التجربة
        </motion.button>
      </motion.div>
    </div>
  );
}
