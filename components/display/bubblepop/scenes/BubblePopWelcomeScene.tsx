"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import type { DisplayEventListener } from "@/components/display/events";
import { BubbleArt } from "../bubbles/BubbleArt";
import { BubbleColor, BubbleShape } from "@/lib/bubblepop";

interface BubblePopWelcomeSceneProps {
  childName: string;
  onEvent: DisplayEventListener;
  onStart: () => void;
}

/**
 * Bubble Pop Wall's own intro — a glowing bubble, the bilingual title, and a
 * short watery framing line, entirely distinct from the other two games'
 * welcome scenes (no balloons, no footprints). Fires `bubblepop_welcome`
 * (not the shared `welcome`) so AudioManager speaks this game's own intro
 * line.
 */
export function BubblePopWelcomeScene({ childName, onEvent, onStart }: BubblePopWelcomeSceneProps) {
  const hasFired = useRef(false);
  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;
    onEvent({ type: "bubblepop_welcome", timestamp: Date.now(), childName });
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
        <BubbleArt color={BubbleColor.BLUE} shape={BubbleShape.CIRCLE} />
      </motion.div>

      <motion.div
        className="relative z-10 flex flex-col items-center gap-6"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      >
        <span className="text-[3vmin] font-medium tracking-[0.3em] text-white/80 uppercase">Bubble Pop Wall</span>
        <h1 className="text-[9vmin] leading-[1.15] font-extrabold text-white drop-shadow-[0_4px_18px_rgba(6,40,61,0.5)]">فرقع الفقاعات</h1>
        <p className="max-w-[46vw] text-[3.2vmin] leading-relaxed font-medium text-white/90">عالم تحت الماء مليء بالفقاعات بانتظارك!</p>

        <motion.button
          type="button"
          onClick={onStart}
          className="mt-[1vmin] rounded-full bg-white px-[5vmin] py-[1.8vmin] text-[3vmin] font-extrabold text-cyan-700 shadow-[0_10px_30px_rgba(6,40,61,0.45)]"
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
        >
          ابدأ المغامرة
        </motion.button>
      </motion.div>
    </div>
  );
}
