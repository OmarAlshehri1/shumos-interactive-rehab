"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import type { StageNumber } from "@/lib/bubblepop";
import { stageOrdinalAr } from "@/components/display/copy";
import type { DisplayEventListener } from "@/components/display/events";
import { BubbleShower } from "../celebration/BubbleShower";
import { CoralSparkleWave } from "../celebration/CoralSparkleWave";
import { FishSwimThrough } from "../celebration/FishSwimThrough";
import { PearlGlow } from "../celebration/PearlGlow";
import { TreasureChestCelebration } from "../celebration/TreasureChestCelebration";

const CELEBRATION_DURATION_MS: Record<StageNumber, number> = { 1: 3800, 2: 4200, 3: 4000, 4: 4600, 5: 5200 };

interface BubblePopStageCompleteSceneProps {
  childFirstName: string;
  stageNumber: StageNumber;
  targetsCompleted: number;
  onDone: () => void;
  onEvent: DisplayEventListener;
}

/**
 * Bubble Pop Wall's own per-stage celebration (task section 49) — a
 * DIFFERENT underwater moment per stage, never Balloon Quest's confetti or
 * Follow the Footsteps' cosmic identity: stage 1 a bubble shower, stage 2 a
 * fish swim-through, stage 3 a pearl glow, stage 4 a coral sparkle wave,
 * stage 5 the treasure chest.
 */
export function BubblePopStageCompleteScene({ childFirstName, stageNumber, targetsCompleted, onDone, onEvent }: BubblePopStageCompleteSceneProps) {
  const firedForStageRef = useRef<number | null>(null);
  useEffect(() => {
    if (firedForStageRef.current !== stageNumber) {
      firedForStageRef.current = stageNumber;
      onEvent({ type: "bubblepop_stage_complete", timestamp: Date.now(), childName: childFirstName, stageNumber });
    }
    const timer = setTimeout(onDone, CELEBRATION_DURATION_MS[stageNumber]);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageNumber]);

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
      <motion.div
        className="absolute inset-0"
        style={{ background: "radial-gradient(circle at 50% 55%, rgba(20,150,170,0.5) 0%, rgba(20,150,170,0) 60%)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      />

      {stageNumber === 1 && <BubbleShower />}
      {stageNumber === 2 && <FishSwimThrough />}
      {stageNumber === 3 && <PearlGlow />}
      {stageNumber === 4 && <CoralSparkleWave />}
      {stageNumber === 5 && <TreasureChestCelebration />}

      <motion.div
        className="relative z-10 flex flex-col items-center gap-[1.6vmin] px-8 text-center"
        initial={{ opacity: 0, scale: 0.85, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 210, damping: 16, delay: 0.4 }}
      >
        <h2 className="text-[6.5vmin] leading-tight font-extrabold text-white drop-shadow-[0_4px_18px_rgba(6,40,61,0.5)]">
          أحسنت يا {childFirstName}!
        </h2>
        <p className="text-[3.4vmin] font-semibold text-white/90">أنهيت المرحلة {stageOrdinalAr(stageNumber)}</p>
        <p className="text-[2.6vmin] font-bold text-white/80">{targetsCompleted} فقاعة مفرقعة</p>
      </motion.div>
    </div>
  );
}
