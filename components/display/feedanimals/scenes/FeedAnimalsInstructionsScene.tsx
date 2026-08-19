"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { STAGES_PER_DIFFICULTY, type StageNumber } from "@/lib/feedanimals";
import type { DisplayEventListener } from "@/components/display/events";
import { AnimalArt } from "../animals/AnimalArt";
import { FoodArt } from "../food/FoodArt";
import { Animal, Food } from "@/lib/feedanimals";

interface FeedAnimalsInstructionsSceneProps {
  childName: string;
  stageNumber: StageNumber;
  onEvent: DisplayEventListener;
}

export function FeedAnimalsInstructionsScene({ childName, stageNumber, onEvent }: FeedAnimalsInstructionsSceneProps) {
  const firedForStageRef = useRef<number | null>(null);
  useEffect(() => {
    if (firedForStageRef.current === stageNumber) return;
    firedForStageRef.current = stageNumber;
    onEvent({ type: "feed_animals_instruction", timestamp: Date.now(), childName, stageNumber });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageNumber, childName]);

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-[3vmin] px-8 text-center">
      <motion.span
        key={`eyebrow-${stageNumber}`}
        className="text-[2.6vmin] font-semibold tracking-widest text-white/85"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        المرحلة {stageNumber} من {STAGES_PER_DIFFICULTY}
      </motion.span>

      <motion.div
        key={`preview-${stageNumber}`}
        className="flex items-end gap-[3vmin]"
        initial={{ opacity: 0, scale: 0.4, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.15 }}
      >
        <div className="h-[16vmin] w-[16vmin]">
          <AnimalArt animal={Animal.MONKEY} />
        </div>
        <div className="h-[9vmin] w-[9vmin]">
          <FoodArt food={Food.BANANA} />
        </div>
      </motion.div>

      <motion.h2
        key={`headline-${stageNumber}`}
        className="text-[6.5vmin] leading-tight font-extrabold text-white drop-shadow-[0_4px_18px_rgba(90,60,10,0.5)]"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.35 }}
      >
        استعد لمساعدة الحيوانات!
      </motion.h2>
    </div>
  );
}
