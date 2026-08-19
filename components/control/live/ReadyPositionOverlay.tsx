"use client";

import { motion } from "motion/react";
import type { StageNumber } from "@/lib/game";
import { stageOrdinalAr } from "@/components/display/copy";

interface ReadyPositionOverlayProps {
  /** The stage about to begin. */
  stageNumber: StageNumber;
  startingStage: StageNumber;
  onChildReady: () => void;
  /** Same escape-hatch role as StartZoneOverlay's — this overlay is `absolute inset-0` over the entire live-session screen, including the sidebar's "إنهاء الجلسة" button underneath it. */
  onRequestEndSession: () => void;
}

/**
 * WALL-PROJECTION READY POSITION — Bubble Pop Wall's own analogue to the
 * floor games' StartZoneOverlay, shown whenever the session is at
 * GameState.START_ZONE (this game just presents that state as "الاستعداد"
 * rather than a floor "منطقة البداية" — see task section 7: "do NOT force
 * the white floor Start Zone... unlike floor games, do not pretend the wall
 * detects the child"). There is no camera/wall sensor here either: the
 * therapist visually confirms the child is standing back from the
 * projected wall, facing it, and taps "الطفل جاهز" themselves — same
 * therapist-authoritative model as every other game, just worded for a
 * child who stands AWAY from the surface and reaches toward it, rather
 * than one who stands ON it.
 */
export function ReadyPositionOverlay({ stageNumber, startingStage, onChildReady, onRequestEndSession }: ReadyPositionOverlayProps) {
  const isFirstStage = stageNumber === startingStage;

  return (
    <motion.div
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-white/97 px-6 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <button
        type="button"
        onClick={onRequestEndSession}
        className="absolute top-4 end-4 min-h-11 touch-manipulation rounded-full px-4 py-2 text-sm font-semibold text-rose-400 transition-colors active:text-rose-600"
      >
        إنهاء الجلسة
      </button>

      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-4xl" aria-hidden="true">
          🙆
        </span>
        <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">بانتظار وقوف الطفل مقابل الجدار</h2>
        <p className="max-w-xs text-sm leading-relaxed text-slate-500">
          {isFirstStage
            ? "تأكد من وقوف الطفل في مكان آمن مقابل الشاشة، مستعدًا للوصول إلى الفقاعات."
            : `تأكد من عودة الطفل إلى مكانه أمام الجدار قبل بدء المرحلة ${stageOrdinalAr(stageNumber)}.`}
        </p>
      </div>

      <button
        type="button"
        onClick={onChildReady}
        className="min-h-16 w-full max-w-xs touch-manipulation rounded-2xl bg-cyan-600 text-xl font-bold text-white shadow-lg shadow-cyan-900/15 transition-all active:scale-[0.98]"
      >
        الطفل جاهز ✓
      </button>
    </motion.div>
  );
}
