"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { STAGES_PER_DIFFICULTY, type BalloonColor, type StageNumber } from "@/lib/game";
import { BALLOON_COLOR_THEME } from "../colorPalette";
import { BalloonArt } from "../balloon/BalloonArt";
import type { DisplayEventListener } from "../events";

interface InstructionsSceneProps {
  targetColor: BalloonColor;
  stageNumber: StageNumber;
  onEvent: DisplayEventListener;
}

export function InstructionsScene({ targetColor, stageNumber, onEvent }: InstructionsSceneProps) {
  const theme = BALLOON_COLOR_THEME[targetColor];

  // Guards against React StrictMode's dev-only double-invocation of effects
  // with no cleanup function, which would otherwise fire "instruction"
  // (and its voice line) twice in a row for the same stage.
  const firedForStageRef = useRef<number | null>(null);
  useEffect(() => {
    if (firedForStageRef.current === stageNumber) return;
    firedForStageRef.current = stageNumber;
    onEvent({ type: "instruction", timestamp: Date.now(), targetColor, stageNumber });
    // Fire once per stage's instructions screen, not on every onEvent identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageNumber, targetColor]);

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
        key={`balloon-${stageNumber}`}
        className="h-[22vmin] w-[22vmin]"
        initial={{ opacity: 0, scale: 0.4, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.15 }}
      >
        <BalloonArt theme={theme} />
      </motion.div>

      <motion.h2
        key={`headline-${stageNumber}`}
        className="text-[6.5vmin] leading-tight font-extrabold text-white drop-shadow-[0_4px_18px_rgba(60,30,90,0.35)]"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.35 }}
      >
        ابحث عن البالونات {theme.adjectiveAr}
      </motion.h2>
    </div>
  );
}
