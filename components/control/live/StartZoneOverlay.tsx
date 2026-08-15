"use client";

import { motion } from "motion/react";
import type { StageNumber } from "@/lib/game";
import { stageOrdinalAr } from "@/components/display/copy";

interface StartZoneOverlayProps {
  /** The stage about to begin — stage 1 means "before Stage 1"; anything else means "returning between stages." */
  stageNumber: StageNumber;
  onChildReady: () => void;
}

/**
 * TASK 8.2 — shown whenever the session is at GameState.START_ZONE, both
 * before Stage 1 and between every stage. There is no camera/floor sensor:
 * the therapist visually confirms the child is standing in the projected
 * Start Zone and taps "الطفل جاهز" themselves — this overlay never claims
 * or implies automatic detection. See BalloonMap's own Start Zone marker
 * (rendered underneath this overlay) for the therapist's spatial reference.
 */
export function StartZoneOverlay({ stageNumber, onChildReady }: StartZoneOverlayProps) {
  const isFirstStage = stageNumber === 1;

  return (
    <motion.div
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-white/97 px-6 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-4xl" aria-hidden="true">
          🧍
        </span>
        <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">بانتظار وقوف الطفل في منطقة البداية</h2>
        <p className="max-w-xs text-sm leading-relaxed text-slate-500">
          {isFirstStage
            ? "تأكد من وقوف الطفل داخل المربع الأبيض على الأرضية المعروضة قبل البدء."
            : `تأكد من عودة الطفل إلى المربع الأبيض قبل بدء المرحلة ${stageOrdinalAr(stageNumber)}.`}
        </p>
      </div>

      <button
        type="button"
        onClick={onChildReady}
        className="min-h-16 w-full max-w-xs touch-manipulation rounded-2xl bg-teal-600 text-xl font-bold text-white shadow-lg shadow-teal-900/15 transition-all active:scale-[0.98]"
      >
        الطفل جاهز ✓
      </button>
    </motion.div>
  );
}
