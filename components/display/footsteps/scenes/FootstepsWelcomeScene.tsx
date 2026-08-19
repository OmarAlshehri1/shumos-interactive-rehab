"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import type { DisplayEventListener } from "@/components/display/events";
import { Foot } from "@/lib/footsteps";
import { FootprintArt } from "../footprints/FootprintArt";

interface FootstepsWelcomeSceneProps {
  childName: string;
  onEvent: DisplayEventListener;
  onStart: () => void;
}

/**
 * Follow the Footsteps' own intro — "رحلة النجوم" (task section 43/55): a
 * glowing footprint, the bilingual title, and a short magical framing line,
 * entirely distinct from Balloon Quest's WelcomeScene.tsx (no balloons, no
 * garden). Fires `footsteps_welcome` (not `welcome`) so AudioManager speaks
 * this game's own intro line.
 */
export function FootstepsWelcomeScene({ childName, onEvent, onStart }: FootstepsWelcomeSceneProps) {
  const hasFired = useRef(false);
  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;
    onEvent({ type: "footsteps_welcome", timestamp: Date.now(), childName });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-6 px-8 text-center">
      <motion.div
        className="h-[16vmin] w-[16vmin]"
        initial={{ opacity: 0, y: 16, scale: 0.7 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 180, damping: 14 }}
      >
        <FootprintArt foot={Foot.LEFT} state="current" />
      </motion.div>

      <motion.div
        className="relative z-10 flex flex-col items-center gap-6"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      >
        <span className="text-[3vmin] font-medium tracking-[0.3em] text-white/80 uppercase">Follow the Footsteps</span>
        <h1 className="text-[9vmin] leading-[1.15] font-extrabold text-white drop-shadow-[0_4px_18px_rgba(20,15,60,0.5)]">اتبع الخطوات</h1>
        <p className="max-w-[46vw] text-[3.2vmin] leading-relaxed font-medium text-white/90">رحلة نجوم مضيئة تنتظرك خطوة خطوة!</p>

        <motion.button
          type="button"
          onClick={onStart}
          className="mt-[1vmin] rounded-full bg-white px-[5vmin] py-[1.8vmin] text-[3vmin] font-extrabold text-indigo-700 shadow-[0_10px_30px_rgba(20,15,60,0.45)]"
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
