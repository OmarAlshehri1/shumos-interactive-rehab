"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { Difficulty, totalStarsFor } from "@/lib/spacepilot";
import type { DisplayEventListener } from "@/components/display/events";
import { SpacePilotRocket } from "../rocket/SpacePilotRocket";

const CELEBRATION_DURATION_MS = 4600;

interface SpacePilotStageCompleteSceneProps {
  childFirstName: string;
  difficulty: Difficulty;
  starsCollected: number;
  onDone: () => void;
  onEvent: DisplayEventListener;
}

const SPARKLES = [
  { top: "18%", left: "20%", delay: 0 },
  { top: "24%", left: "78%", delay: 0.15 },
  { top: "62%", left: "14%", delay: 0.3 },
  { top: "70%", left: "82%", delay: 0.45 },
  { top: "12%", left: "52%", delay: 0.6 },
  { top: "80%", left: "48%", delay: 0.75 },
] as const;

/**
 * Space Pilot's own level-complete celebration (task's "Show the fully
 * upgraded rocket proudly" + "camera/world gives stronger flight feeling").
 * The rocket flies in from off-screen with a bright trail and settles
 * center-stage at its final `starsCollected`-level upgrade, surrounded by a
 * burst of star sparkles — never Bubble Pop Wall's treasure chest or any
 * other game's own celebration composition.
 */
export function SpacePilotStageCompleteScene({ childFirstName, difficulty, starsCollected, onDone, onEvent }: SpacePilotStageCompleteSceneProps) {
  const totalStars = totalStarsFor(difficulty);
  const hasFired = useRef(false);
  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;
    onEvent({ type: "space_pilot_stage_complete", timestamp: Date.now(), childName: childFirstName, difficulty });
    const timer = setTimeout(onDone, CELEBRATION_DURATION_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
      <motion.div
        className="absolute inset-0"
        style={{ background: "radial-gradient(circle at 50% 45%, rgba(99,102,241,0.5) 0%, rgba(99,102,241,0) 60%)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      />

      {SPARKLES.map((s, i) => (
        <motion.svg
          key={i}
          viewBox="0 0 24 24"
          className="absolute h-[4vmin] w-[4vmin]"
          style={{ top: s.top, left: s.left }}
          initial={{ opacity: 0, scale: 0.3 }}
          animate={{ opacity: [0, 1, 0], scale: [0.3, 1, 0.6] }}
          transition={{ duration: 1.8, delay: 0.4 + s.delay, repeat: Infinity, repeatDelay: 1.4 }}
        >
          <path d="M12 1.5l2.9 6.3 6.9.7-5.2 4.7 1.5 6.8L12 16.7l-6.1 3.3 1.5-6.8-5.2-4.7 6.9-.7z" fill="#FDE68A" />
        </motion.svg>
      ))}

      <motion.div
        className="relative z-10 h-[22vmin] w-[34vmin]"
        initial={{ x: "-60vw", opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 90, damping: 14, delay: 0.15 }}
      >
        <SpacePilotRocket upgradeLevel={starsCollected} boosting />
      </motion.div>

      <motion.div
        className="absolute bottom-[14%] z-10 flex flex-col items-center gap-[1.4vmin] px-8 text-center"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 210, damping: 16, delay: 0.7 }}
      >
        <h2 className="text-[6.5vmin] leading-tight font-extrabold text-white drop-shadow-[0_4px_18px_rgba(10,10,40,0.6)]">أحسنت يا {childFirstName}!</h2>
        <p className="text-[3vmin] font-bold text-white/90">
          جمعت {starsCollected} من {totalStars} نجوم
        </p>
      </motion.div>
    </div>
  );
}
