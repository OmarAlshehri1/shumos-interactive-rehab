"use client";

import { useState } from "react";
import { Difficulty, STAGES_PER_DIFFICULTY, type StageNumber } from "@/lib/game";
import { ConfirmSheet } from "./ConfirmSheet";

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  [Difficulty.EASY]: "سهل",
  [Difficulty.MEDIUM]: "متوسط",
  [Difficulty.ADVANCED]: "متقدم",
};

interface PendingNavigation {
  difficulty: Difficulty;
  stageNumber: StageNumber;
}

interface LiveNavigationControlsProps {
  currentDifficulty: Difficulty;
  currentStageNumber?: StageNumber;
  stageCount?: number;
  hasMeaningfulProgress: boolean;
  disabled?: boolean;
  onStageChange?: (stage: StageNumber) => void;
  onDifficultyChange: (difficulty: Difficulty) => void;
}

/** One canonical therapist navigation surface shared by all game control screens. */
export function LiveNavigationControls({
  currentDifficulty,
  currentStageNumber,
  stageCount = STAGES_PER_DIFFICULTY,
  hasMeaningfulProgress,
  disabled = false,
  onStageChange,
  onDifficultyChange,
}: LiveNavigationControlsProps) {
  const [pending, setPending] = useState<PendingNavigation | null>(null);

  const request = (target: PendingNavigation) => {
    if (disabled) return;
    if (target.difficulty === currentDifficulty && target.stageNumber === currentStageNumber) return;
    if (hasMeaningfulProgress) setPending(target);
    else apply(target);
  };

  const apply = (target: PendingNavigation) => {
    if (target.difficulty !== currentDifficulty) onDifficultyChange(target.difficulty);
    else onStageChange?.(target.stageNumber);
    setPending(null);
  };

  return (
    <section aria-label="التنقل المباشر" className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-slate-500">المستوى</span>
        <div className="grid grid-cols-3 gap-1.5">
          {Object.values(Difficulty).map((difficulty) => (
            <button
              key={difficulty}
              type="button"
              disabled={disabled || difficulty === currentDifficulty}
              onClick={() => request({ difficulty, stageNumber: 1 })}
              className={`min-h-10 rounded-xl px-2 text-sm font-bold transition-colors disabled:cursor-default ${difficulty === currentDifficulty ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"}`}
            >
              {DIFFICULTY_LABELS[difficulty]}
            </button>
          ))}
        </div>
      </div>

      {currentStageNumber !== undefined && onStageChange && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-slate-500">المراحل</span>
          <div className="grid grid-cols-5 gap-1.5" dir="ltr">
            {Array.from({ length: stageCount }, (_, index) => (index + 1) as StageNumber).map((stage) => (
              <button
                key={stage}
                type="button"
                disabled={disabled || stage === currentStageNumber}
                onClick={() => request({ difficulty: currentDifficulty, stageNumber: stage })}
                aria-label={`الانتقال إلى المرحلة ${stage}`}
                className={`aspect-square min-h-9 rounded-xl text-sm font-black transition-colors disabled:cursor-default ${stage === currentStageNumber ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"}`}
              >
                {stage}
              </button>
            ))}
          </div>
        </div>
      )}

      <ConfirmSheet
        open={pending !== null}
        title="الانتقال إلى مرحلة أخرى؟"
        description="سيتم حفظ تقدم المرحلة الحالية."
        confirmLabel="انتقال"
        onConfirm={() => pending && apply(pending)}
        onCancel={() => setPending(null)}
      />
    </section>
  );
}
