"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import type { StageNumber } from "@/lib/game";
import { StartZoneMarker } from "../startZone/StartZoneMarker";
import type { DisplayEventListener } from "../events";

interface StartZoneSceneProps {
  /** The stage about to begin — stage 1 means "before Stage 1 ever starts"; anything else means "returning between stages." */
  stageNumber: StageNumber;
  onEvent: DisplayEventListener;
}

/**
 * TASK 8.2 — shown whenever GameState.START_ZONE is active: before Stage 1,
 * and again between every stage. Purely presentational: no button, no
 * timer, nothing for the child to tap. /display never begins the next
 * stage on its own — see DisplayScreen.tsx and the Task 8.2 report. The
 * therapist is the one who confirms readiness, on /control.
 */
export function StartZoneScene({ stageNumber, onEvent }: StartZoneSceneProps) {
  const isFirstStage = stageNumber === 1;

  // Guards against React StrictMode's dev-only double-invocation of effects
  // (same pattern as InstructionsScene) — keyed by stageNumber, not the
  // isFirstStage boolean, so the "return between stages" wording correctly
  // re-fires for stage 2 -> stage 3 too, not just once ever.
  const firedForStageRef = useRef<number | null>(null);
  useEffect(() => {
    if (firedForStageRef.current === stageNumber) return;
    firedForStageRef.current = stageNumber;
    onEvent({ type: "start_zone", timestamp: Date.now(), isFirstStage });
    // Fires once per stage's Start Zone screen, not on every onEvent identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageNumber]);

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center px-8 text-center">
      <StartZoneMarker variant="prominent" />

      <motion.div
        className="relative z-10 flex flex-col items-center gap-[1.6vmin]"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <h2 className="text-[6vmin] leading-tight font-extrabold text-white drop-shadow-[0_4px_18px_rgba(60,30,90,0.35)]">
          {isFirstStage ? "يلا بنا نقف في المربع الأبيض!" : "ارجع للمربع الأبيض!"}
        </h2>
        <p className="max-w-[46vw] text-[2.8vmin] leading-relaxed font-medium text-white/90">
          {isFirstStage ? "استعد للمغامرة" : "استعد للمرحلة الجاية"}
        </p>
      </motion.div>
    </div>
  );
}
