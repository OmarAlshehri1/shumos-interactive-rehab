"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { Foot, STAGES_PER_DIFFICULTY, type StageNumber } from "@/lib/footsteps";
import type { DisplayEventListener } from "@/components/display/events";
import { FootprintArt } from "../footprints/FootprintArt";

interface FootstepsInstructionsSceneProps {
  childName: string;
  stageNumber: StageNumber;
  onEvent: DisplayEventListener;
}

export function FootstepsInstructionsScene({ childName, stageNumber, onEvent }: FootstepsInstructionsSceneProps) {
  const firedForStageRef = useRef<number | null>(null);
  useEffect(() => {
    if (firedForStageRef.current === stageNumber) return;
    firedForStageRef.current = stageNumber;
    onEvent({ type: "footsteps_instruction", timestamp: Date.now(), childName, stageNumber });
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
        key={`footprints-${stageNumber}`}
        className="flex items-end gap-[2vmin]"
        initial={{ opacity: 0, scale: 0.4, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.15 }}
      >
        <div className="h-[16vmin] w-[16vmin]">
          <FootprintArt foot={Foot.LEFT} state="current" />
        </div>
        <div className="h-[13vmin] w-[13vmin]">
          <FootprintArt foot={Foot.RIGHT} state="current" />
        </div>
      </motion.div>

      <motion.h2
        key={`headline-${stageNumber}`}
        className="text-[6.5vmin] leading-tight font-extrabold text-white drop-shadow-[0_4px_18px_rgba(20,15,60,0.5)]"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.35 }}
      >
        اتبع الخطوات المضيئة
      </motion.h2>
    </div>
  );
}
