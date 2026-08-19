"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import type { DisplayEventListener } from "@/components/display/events";
import { SpacePilotRocket } from "../rocket/SpacePilotRocket";

interface SpacePilotWelcomeSceneProps {
  childName: string;
  onEvent: DisplayEventListener;
  onStart: () => void;
}

/**
 * Space Pilot's own polished Welcome screen (task's "consistent in QUALITY
 * with the other games... Space identity only. Do not copy Balloon Quest
 * artwork"): the starting (unupgraded) rocket, the bilingual title, a short
 * subtitle, and the "ابدأ الرحلة" CTA. Fires `space_pilot_welcome` (not the
 * shared `welcome`) so AudioManager speaks this game's own intro line.
 */
export function SpacePilotWelcomeScene({ childName, onEvent, onStart }: SpacePilotWelcomeSceneProps) {
  const hasFired = useRef(false);
  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;
    onEvent({ type: "space_pilot_welcome", timestamp: Date.now(), childName });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-6 px-8 text-center">
      <motion.div
        className="h-[18vmin] w-[26vmin]"
        initial={{ opacity: 0, y: 16, scale: 0.7 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 180, damping: 14 }}
      >
        <SpacePilotRocket upgradeLevel={0} />
      </motion.div>

      <motion.div
        className="relative z-10 flex flex-col items-center gap-6"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      >
        <span className="text-[3vmin] font-medium tracking-[0.3em] text-white/80 uppercase">Space Pilot</span>
        <h1 className="text-[9vmin] leading-[1.15] font-extrabold text-white drop-shadow-[0_4px_18px_rgba(10,10,40,0.6)]">قائد الفضاء</h1>
        <p className="max-w-[46vw] text-[3.2vmin] leading-relaxed font-medium text-white/90">قُد صاروخك عبر الفضاء واجمع النجوم!</p>

        <motion.button
          type="button"
          onClick={onStart}
          className="mt-[1vmin] rounded-full bg-white px-[5vmin] py-[1.8vmin] text-[3vmin] font-extrabold text-indigo-700 shadow-[0_10px_30px_rgba(10,10,40,0.5)]"
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
        >
          ابدأ الرحلة
        </motion.button>
      </motion.div>
    </div>
  );
}
