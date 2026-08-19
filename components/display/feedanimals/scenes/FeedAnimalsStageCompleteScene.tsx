"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import type { StageNumber } from "@/lib/feedanimals";
import { stageOrdinalAr } from "@/components/display/copy";
import type { DisplayEventListener } from "@/components/display/events";
import { LeafStarBurst } from "../celebration/LeafStarBurst";
import { ButterflyCrossing } from "../celebration/ButterflyCrossing";
import { HappyAnimalGroup } from "../celebration/HappyAnimalGroup";
import { SafariSparkleWave } from "../celebration/SafariSparkleWave";
import { AnimalParade } from "../celebration/AnimalParade";

const CELEBRATION_DURATION_MS: Record<StageNumber, number> = { 1: 3600, 2: 4000, 3: 4200, 4: 4400, 5: 5400 };

interface FeedAnimalsStageCompleteSceneProps {
  childFirstName: string;
  stageNumber: StageNumber;
  roundsCompleted: number;
  onDone: () => void;
  onEvent: DisplayEventListener;
}

/**
 * Feed the Animals' own per-stage celebration (task section 47) — a
 * DIFFERENT safari moment per stage, never another game's identity: stage 1
 * a leaf/star burst, stage 2 butterflies crossing, stage 3 a happy animal
 * group, stage 4 a warm sparkle wave, stage 5 the animal parade.
 */
export function FeedAnimalsStageCompleteScene({ childFirstName, stageNumber, roundsCompleted, onDone, onEvent }: FeedAnimalsStageCompleteSceneProps) {
  const firedForStageRef = useRef<number | null>(null);
  useEffect(() => {
    if (firedForStageRef.current !== stageNumber) {
      firedForStageRef.current = stageNumber;
      onEvent({ type: "feed_animals_stage_complete", timestamp: Date.now(), childName: childFirstName, stageNumber });
    }
    const timer = setTimeout(onDone, CELEBRATION_DURATION_MS[stageNumber]);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageNumber]);

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
      <motion.div
        className="absolute inset-0"
        style={{ background: "radial-gradient(circle at 50% 55%, rgba(230,150,60,0.45) 0%, rgba(230,150,60,0) 60%)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      />

      {stageNumber === 1 && <LeafStarBurst />}
      {stageNumber === 2 && <ButterflyCrossing />}
      {stageNumber === 3 && <HappyAnimalGroup />}
      {stageNumber === 4 && <SafariSparkleWave />}
      {stageNumber === 5 && <AnimalParade />}

      <motion.div
        className="relative z-10 flex flex-col items-center gap-[1.6vmin] px-8 text-center"
        initial={{ opacity: 0, scale: 0.85, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 210, damping: 16, delay: 0.4 }}
      >
        <h2 className="text-[6.5vmin] leading-tight font-extrabold text-white drop-shadow-[0_4px_18px_rgba(90,60,10,0.5)]">
          أحسنت يا {childFirstName}! 🦁
        </h2>
        <p className="text-[3.4vmin] font-semibold text-white/90">أنهيت المرحلة {stageOrdinalAr(stageNumber)}</p>
        <p className="text-[2.6vmin] font-bold text-white/85">
          {roundsCompleted} {roundsCompleted === 1 ? "حيوان ساعدته" : "حيوانات ساعدتها"}
        </p>
      </motion.div>
    </div>
  );
}
