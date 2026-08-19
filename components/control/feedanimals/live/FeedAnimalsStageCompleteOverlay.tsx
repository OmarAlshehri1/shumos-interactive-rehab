"use client";

import { motion } from "motion/react";
import { formatDurationClock } from "@/components/display/copy";
import { type FeedAnimalsStageResult, Difficulty, getAdjacentDifficulty } from "@/lib/feedanimals";
import { getNextStageTarget } from "@/lib/game";
import type { FeedAnimalsDifficultyDecision } from "@/lib/control/feedanimals/useLocalFeedAnimalsControllerSession";
import { DIFFICULTY_LABELS } from "@/components/control/copy";
import { StatCard } from "@/components/control/StatCard";
import { formatAccuracyPercent, formatCompletionPercent, formatResponseTimeSeconds } from "../copy";

interface FeedAnimalsStageCompleteOverlayProps {
  result: FeedAnimalsStageResult;
  currentDifficulty: Difficulty;
  onAdvance: (decision: FeedAnimalsDifficultyDecision) => void;
  onRequestEndSession: () => void;
}

/**
 * Feed the Animals' own per-stage result view — shows this game's own
 * metrics (animals fed/presented, incorrect count, completion rate,
 * accuracy, duration, average response time). Same three-way continue/
 * easier/harder decision as every other game.
 */
export function FeedAnimalsStageCompleteOverlay({ result, currentDifficulty, onAdvance, onRequestEndSession }: FeedAnimalsStageCompleteOverlayProps) {
  const nextTarget = getNextStageTarget(currentDifficulty, result.stageNumber);
  const easier = getAdjacentDifficulty(currentDifficulty, "easier");
  const harder = getAdjacentDifficulty(currentDifficulty, "harder");
  const completionRate = result.roundsPresented === 0 ? null : result.roundsCompleted / result.roundsPresented;
  const accuracyRate = result.roundsCompleted + result.incorrectCount === 0 ? null : result.roundsCompleted / (result.roundsCompleted + result.incorrectCount);

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

      <div className="flex flex-col items-center gap-1.5 text-center">
        <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">اكتملت المرحلة {result.stageNumber} ✓</h2>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-2.5">
        <div className="grid grid-cols-3 gap-2.5">
          <StatCard label="حيوانات أُطعمت" value={String(result.roundsCompleted)} tone="positive" ltr />
          <StatCard label="حيوانات المرحلة" value={String(result.roundsPresented)} ltr />
          <StatCard label="اختيارات غير صحيحة" value={String(result.incorrectCount)} ltr />
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <StatCard label="نسبة الإكمال" value={formatCompletionPercent(completionRate)} />
          <StatCard label="نسبة الدقة" value={formatAccuracyPercent(accuracyRate)} />
          <StatCard label="مدة المرحلة" value={formatDurationClock(result.durationMs)} ltr />
        </div>
        <StatCard label="متوسط زمن الاستجابة المسجل" value={formatResponseTimeSeconds(result.averageResponseTimeMs)} />
      </div>

      <div className="flex w-full max-w-xs flex-col gap-2.5">
        {nextTarget && (
          <button
            type="button"
            onClick={() => onAdvance("continue")}
            className="min-h-16 w-full touch-manipulation rounded-2xl bg-amber-600 text-xl font-bold text-white shadow-lg shadow-amber-900/15 transition-all active:scale-[0.98]"
          >
            {nextTarget.difficulty === currentDifficulty
              ? `المرحلة التالية — ${nextTarget.stageNumber}`
              : `التالي — ${DIFFICULTY_LABELS[nextTarget.difficulty].name} المرحلة 1`}
          </button>
        )}
        <div className="flex gap-2.5">
          {easier && (
            <button
              type="button"
              onClick={() => onAdvance("easier")}
              className="min-h-14 flex-1 touch-manipulation rounded-2xl border-2 border-slate-200 bg-white text-base font-bold text-slate-700 transition-all active:scale-[0.98] active:bg-slate-50"
            >
              أسهل — {DIFFICULTY_LABELS[easier].name}
            </button>
          )}
          {harder && (
            <button
              type="button"
              onClick={() => onAdvance("harder")}
              className="min-h-14 flex-1 touch-manipulation rounded-2xl border-2 border-amber-200 bg-white text-base font-bold text-amber-700 transition-all active:scale-[0.98] active:bg-amber-50"
            >
              أصعب — {DIFFICULTY_LABELS[harder].name}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
