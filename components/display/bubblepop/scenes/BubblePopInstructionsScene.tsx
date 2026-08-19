"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { BubbleColor, BubbleShape, STAGES_PER_DIFFICULTY, type StageNumber } from "@/lib/bubblepop";
import type { DisplayEventListener } from "@/components/display/events";
import { BubbleArt } from "../bubbles/BubbleArt";

interface BubblePopInstructionsSceneProps {
  childName: string;
  stageNumber: StageNumber;
  onEvent: DisplayEventListener;
}

export function BubblePopInstructionsScene({ childName, stageNumber, onEvent }: BubblePopInstructionsSceneProps) {
  const firedForStageRef = useRef<number | null>(null);
  useEffect(() => {
    if (firedForStageRef.current === stageNumber) return;
    firedForStageRef.current = stageNumber;
    onEvent({ type: "bubblepop_instruction", timestamp: Date.now(), childName, stageNumber });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageNumber, childName]);

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-[3vmin] px-8 text-center">
      <motion.span
        key={`eyebrow-${stageNumber}`}
        className="text-[2.6vmin] font-semibold tracking-widest text-white/80"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        المرحلة {stageNumber} من {STAGES_PER_DIFFICULTY}
      </motion.span>

      <motion.div
        key={`bubbles-${stageNumber}`}
        className="flex items-end gap-[2.5vmin]"
        initial={{ opacity: 0, scale: 0.4, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.15 }}
      >
        <div className="h-[14vmin] w-[14vmin]">
          <BubbleArt color={BubbleColor.BLUE} shape={BubbleShape.CIRCLE} />
        </div>
        <div className="h-[16vmin] w-[16vmin]">
          <BubbleArt color={BubbleColor.YELLOW} shape={BubbleShape.STAR} />
        </div>
        <div className="h-[13vmin] w-[13vmin]">
          <BubbleArt color={BubbleColor.RED} shape={BubbleShape.CIRCLE} />
        </div>
      </motion.div>

      <motion.h2
        key={`headline-${stageNumber}`}
        className="text-[6.5vmin] leading-tight font-extrabold text-white drop-shadow-[0_4px_18px_rgba(6,40,61,0.5)]"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.35 }}
      >
        استعد لفرقعة الفقاعات!
      </motion.h2>
    </div>
  );
}
