"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import type { DisplayEventListener } from "@/components/display/events";
import { AnimalArt } from "../animals/AnimalArt";
import { Animal } from "@/lib/feedanimals";

interface FeedAnimalsWelcomeSceneProps {
  childName: string;
  onEvent: DisplayEventListener;
  onStart: () => void;
}

/**
 * Feed the Animals' own intro (task section 7) — a friendly monkey peeking
 * in, the bilingual title, and a short safari-framing line, entirely
 * distinct from the other three games' welcome scenes (no balloons, no
 * footprints, no bubbles). Fires `feed_animals_welcome` (not the shared
 * `welcome`) so AudioManager speaks this game's own intro line.
 */
export function FeedAnimalsWelcomeScene({ childName, onEvent, onStart }: FeedAnimalsWelcomeSceneProps) {
  const hasFired = useRef(false);
  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;
    onEvent({ type: "feed_animals_welcome", timestamp: Date.now(), childName });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-6 px-8 text-center">
      <motion.div
        className="h-[18vmin] w-[18vmin]"
        initial={{ opacity: 0, y: 20, scale: 0.7 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 170, damping: 14 }}
      >
        <AnimalArt animal={Animal.MONKEY} />
      </motion.div>

      <motion.div
        className="relative z-10 flex flex-col items-center gap-6"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      >
        <span className="text-[3vmin] font-medium tracking-[0.3em] text-white/85 uppercase">Safari Adventure</span>
        <h1 className="text-[9vmin] leading-[1.15] font-extrabold text-white drop-shadow-[0_4px_18px_rgba(90,60,10,0.5)]">أطعم الحيوانات</h1>
        <p className="max-w-[46vw] text-[3.2vmin] leading-relaxed font-medium text-white/90">رحلة سفاري مليئة بالحيوانات الجائعة بانتظارك!</p>

        <motion.button
          type="button"
          onClick={onStart}
          className="mt-[1vmin] rounded-full bg-white px-[5vmin] py-[1.8vmin] text-[3vmin] font-extrabold text-amber-800 shadow-[0_10px_30px_rgba(90,60,10,0.45)]"
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
