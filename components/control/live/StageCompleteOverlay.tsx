"use client";

import { motion } from "motion/react";
import { formatDurationClock, formatAccuracyPercent, formatReactionTimeSeconds } from "@/components/display/copy";
import { getAdjacentDifficulty, type Difficulty, type StageResult } from "@/lib/game";
import type { DifficultyDecision } from "@/lib/control/useLocalControllerSession";
import { DIFFICULTY_LABELS } from "../copy";
import { StatCard } from "../StatCard";

interface StageCompleteOverlayProps {
  result: StageResult;
  currentDifficulty: Difficulty;
  onAdvance: (decision: DifficultyDecision) => void;
}

/**
 * TASK 9 — the therapist's per-stage result view. Shows every metric the
 * approved engine actually measures (lib/game/scoring.ts's StageResult):
 * correct, incorrect, accuracy, duration, and average recorded response
 * time. Nothing here is a clinical claim — see formatReactionTimeSeconds's
 * doc comment — it's the same interaction-timing number the family report
 * and session summary use, never invented or independently recalculated.
 *
 * TASK 11 — the old single "المرحلة التالية"/"عرض الملخص" button is now the
 * therapist's one explicit decision: continue in the same difficulty
 * ("نفس المستوى"), or step to the adjacent easier/harder difficulty AT THE
 * SAME stage number ("أسهل"/"أصعب" — see lib/game/session.ts's
 * advanceToStage doc comment for exactly what that maps to). "نفس المستوى"
 * is hidden once stage 5 is this difficulty's last (there is no stage 6);
 * "أسهل"/"أصعب" are hidden at EASY/ADVANCED respectively, where no such
 * tier exists. At least one option is always available.
 */
export function StageCompleteOverlay({ result, currentDifficulty, onAdvance }: StageCompleteOverlayProps) {
  const canContinue = result.stageNumber < 5;
  const easier = getAdjacentDifficulty(currentDifficulty, "easier");
  const harder = getAdjacentDifficulty(currentDifficulty, "harder");

  return (
    <motion.div
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-white/97 px-6 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="flex flex-col items-center gap-1.5 text-center">
        <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">اكتملت المرحلة {result.stageNumber} ✓</h2>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-2.5">
        <div className="grid grid-cols-3 gap-2.5">
          <StatCard label="إجابات صحيحة" value={String(result.correctCount)} tone="positive" />
          <StatCard label="محاولة غير صحيحة" value={String(result.incorrectCount)} />
          <StatCard label="الدقة" value={formatAccuracyPercent(result.accuracy)} />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <StatCard label="مدة المرحلة" value={formatDurationClock(result.durationMs)} ltr />
          <StatCard label="متوسط زمن الاستجابة المسجل" value={formatReactionTimeSeconds(result.averageReactionTimeMs)} />
        </div>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-2.5">
        {canContinue && (
          <button
            type="button"
            onClick={() => onAdvance("continue")}
            className="min-h-16 w-full touch-manipulation rounded-2xl bg-teal-600 text-xl font-bold text-white shadow-lg shadow-teal-900/15 transition-all active:scale-[0.98]"
          >
            نفس المستوى — المرحلة {result.stageNumber + 1}
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
