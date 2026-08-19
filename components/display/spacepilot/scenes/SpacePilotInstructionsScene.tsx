"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { Difficulty } from "@/lib/spacepilot";
import type { DisplayEventListener } from "@/components/display/events";
import { CollectibleStarArt } from "../stars/CollectibleStarArt";
import { AsteroidArt } from "../hazards/AsteroidArt";

interface SpacePilotInstructionsSceneProps {
  childName: string;
  difficulty: Difficulty;
  onEvent: DisplayEventListener;
}

const INSTRUCTION_LINE_AR: Record<Difficulty, string> = {
  [Difficulty.EASY]: "اجمع النجوم!",
  [Difficulty.MEDIUM]: "أطلق على الصخور واجمع النجوم!",
  [Difficulty.ADVANCED]: "أطلق على الصخور، واجمع النجوم، واعبر البوابة!",
};

/** One coherent visible + spoken instruction. Never emits two competing HIGH voice lines from the same effect. */
export function SpacePilotInstructionsScene({ childName, difficulty, onEvent }: SpacePilotInstructionsSceneProps) {
  const hasFired = useRef(false);
  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;
    onEvent({ type: "space_pilot_instruction", timestamp: Date.now(), childName, difficulty });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childName, difficulty]);

  const showAsteroid = difficulty !== Difficulty.EASY;

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-[3vmin] px-8 text-center">
      <motion.div
        className="flex items-end gap-[3vmin]"
        initial={{ opacity: 0, scale: 0.4, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.1 }}
      >
        <div className="h-[12vmin] w-[12vmin]">
          <CollectibleStarArt />
        </div>
        <div className="h-[16vmin] w-[16vmin]">
          <CollectibleStarArt />
        </div>
        {showAsteroid ? (
          <div className="h-[13vmin] w-[13vmin]">
            <AsteroidArt />
          </div>
        ) : (
          <div className="h-[12vmin] w-[12vmin]">
            <CollectibleStarArt />
          </div>
        )}
      </motion.div>

      <motion.h2
        className="text-[6.5vmin] leading-tight font-extrabold text-white drop-shadow-[0_4px_18px_rgba(10,10,40,0.6)]"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.35 }}
      >
        {INSTRUCTION_LINE_AR[difficulty]}
      </motion.h2>
    </div>
  );
}
