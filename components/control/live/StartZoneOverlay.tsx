"use client";

import { motion } from "motion/react";
import type { StageNumber } from "@/lib/game";
import { stageOrdinalAr } from "@/components/display/copy";

interface StartZoneOverlayProps {
  /** The stage about to begin. */
  stageNumber: StageNumber;
  /** TASK 12 fix: the session's configured starting stage — "before the first stage" is `stageNumber === startingStage`, not a hardcoded `=== 1` (see StartZoneScene.tsx's matching fix for why). */
  startingStage: StageNumber;
  onChildReady: () => void;
  /**
   * CONTROL UX POLISH TASK — this overlay is `absolute inset-0` over the
   * ENTIRE live-session screen, including the sidebar's "إنهاء الجلسة"
   * button underneath it (see LiveSessionScreen.tsx) — a real trap the task
   * explicitly called out ("StageCompleteOverlay and StartZoneOverlay can
   * cover the side controls and make إنهاء الجلسة unavailable"). This is the
   * fix: a small, deliberately quiet escape hatch INSIDE the overlay itself,
   * wired to the exact same confirm-then-end flow the sidebar button uses
   * (LiveSessionScreen's pendingConfirm === "end") — never a second,
   * different way to end a session.
   */
  onRequestEndSession: () => void;
}

/**
 * TASK 8.2 — shown whenever the session is at GameState.START_ZONE, both
 * before the session's first stage and between every stage. There is no
 * camera/floor sensor: the therapist visually confirms the child is
 * standing in the projected Start Zone and taps "الطفل جاهز" themselves —
 * this overlay never claims or implies automatic detection. See BalloonMap's
 * own Start Zone marker (rendered underneath this overlay) for the
 * therapist's spatial reference.
 */
export function StartZoneOverlay({ stageNumber, startingStage, onChildReady, onRequestEndSession }: StartZoneOverlayProps) {
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
