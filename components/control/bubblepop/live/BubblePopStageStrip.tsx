"use client";

import { useState } from "react";
import { type BubblePopStageResult, BubblePopStageStatus, Difficulty, STAGES_PER_DIFFICULTY, type StageNumber } from "@/lib/bubblepop";
import { DIFFICULTY_LABELS } from "@/components/control/copy";
import { ConfirmSheet } from "@/components/control/live/ConfirmSheet";

interface BubblePopStageStripProps {
  difficulty: Difficulty;
  currentStageNumber: StageNumber;
  results: readonly BubblePopStageResult[];
  disabled?: boolean;
  hasMeaningfulProgress?: boolean;
  onJumpToStage: (stageNumber: StageNumber) => void;
}

type CellState = "completed" | "skipped" | "current" | "upcoming";

/** Bubble Pop Wall's own compact stage navigator — same "[1 ✓] [2 ✓] [3 ●] [4] [5]" visual language and forward-jump-only semantics as the other two games' stage strips. */
export function BubblePopStageStrip({ difficulty, currentStageNumber, results, disabled, hasMeaningfulProgress = false, onJumpToStage }: BubblePopStageStripProps) {
  const [pendingJump, setPendingJump] = useState<StageNumber | null>(null);

  const resultByStage = new Map<StageNumber, BubblePopStageResult>();
  for (const result of results) {
    if (result.difficulty === difficulty) resultByStage.set(result.stageNumber, result);
  }

  function cellState(stageNumber: StageNumber): CellState {
    const result = resultByStage.get(stageNumber);
    if (result) return result.status === BubblePopStageStatus.COMPLETED ? "completed" : "skipped";
    if (stageNumber === currentStageNumber) return "current";
    return "upcoming";
  }

  const stageNumbers = Array.from({ length: STAGES_PER_DIFFICULTY }, (_, i) => (i + 1) as StageNumber);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-slate-500">{DIFFICULTY_LABELS[difficulty].name}</span>
      <div className="flex items-center gap-1.5" dir="ltr">
        {stageNumbers.map((stageNumber) => {
          const state = cellState(stageNumber);
          const canJump = !disabled && stageNumber !== currentStageNumber;
          return (
            <StageCell
              key={stageNumber}
              stageNumber={stageNumber}
              state={state}
              interactive={canJump}
              onTap={canJump ? () => (hasMeaningfulProgress ? setPendingJump(stageNumber) : onJumpToStage(stageNumber)) : undefined}
            />
          );
        })}
      </div>

      <ConfirmSheet
        open={pendingJump !== null}
        title={pendingJump !== null ? `الانتقال إلى المرحلة ${pendingJump}؟` : ""}
        description="سيتم حفظ تقدم المرحلة الحالية."
        confirmLabel="الانتقال"
        onConfirm={() => {
          if (pendingJump !== null) onJumpToStage(pendingJump);
          setPendingJump(null);
        }}
        onCancel={() => setPendingJump(null)}
      />
    </div>
  );
}

const CELL_CLASSES: Record<CellState, string> = {
  completed: "border-emerald-300 bg-emerald-50 text-emerald-700",
  skipped: "border-slate-200 bg-slate-100 text-slate-400",
  current: "border-cyan-500 bg-cyan-600 text-white shadow-sm shadow-cyan-900/20",
  upcoming: "border-slate-200 bg-white text-slate-400",
};

function StageCell({
  stageNumber,
  state,
  interactive,
  onTap,
}: {
  stageNumber: StageNumber;
  state: CellState;
  interactive: boolean;
  onTap?: () => void;
}) {
  const content = state === "completed" ? "✓" : state === "skipped" ? "–" : String(stageNumber);

  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={onTap}
      aria-label={`bubblepop-stage-${stageNumber}-${state}`}
      className={`flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full border-2 text-sm font-bold transition-transform disabled:cursor-default ${CELL_CLASSES[state]} ${
        interactive ? "active:scale-90" : ""
      }`}
    >
      {content}
    </button>
  );
}
