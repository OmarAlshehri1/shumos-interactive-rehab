"use client";

import { useState } from "react";
import { STAGES_PER_DIFFICULTY, StageStatus, type Difficulty, type StageNumber, type StageResult } from "@/lib/game";
import { DIFFICULTY_LABELS } from "../copy";
import { ConfirmSheet } from "./ConfirmSheet";

interface StageStripProps {
  difficulty: Difficulty;
  /** The currently-active stage number — not yet in `results` while it's still being played. */
  currentStageNumber: StageNumber;
  /** This session's full played-stage history (may span other difficulties too) — filtered internally to `difficulty`. */
  results: readonly StageResult[];
  disabled?: boolean;
  onJumpToStage: (stageNumber: StageNumber) => void;
}

type CellState = "completed" | "skipped" | "current" | "upcoming";

/**
 * TASK 11 — the therapist's compact stage navigator: ONE difficulty's 5
 * stages, never all 15. "سهل [1 ✓] [2 ✓] [3 ●] [4] [5]" per spec — a single
 * row of small cells, not a dashboard. Tapping any stage AHEAD of the
 * current one asks for confirmation ("الانتقال إلى المرحلة 4؟") and, once
 * confirmed, jumps forward — see lib/game/session.ts's jumpToStage for what
 * that records for the stages skipped over. Completed/current/not-yet-reached
 * cells are deliberately inert: no backward navigation into already-played
 * content during a live session (see the Task 11 report's "Do NOT allow
 * chaotic navigation" section) — replaying a stage is a possible future
 * feature, not this one.
 */
export function StageStrip({ difficulty, currentStageNumber, results, disabled, onJumpToStage }: StageStripProps) {
  const [pendingJump, setPendingJump] = useState<StageNumber | null>(null);

  const resultByStage = new Map<StageNumber, StageResult>();
  for (const result of results) {
    if (result.difficulty === difficulty) resultByStage.set(result.stageNumber, result);
  }

  function cellState(stageNumber: StageNumber): CellState {
    const result = resultByStage.get(stageNumber);
    if (result) return result.status === StageStatus.COMPLETED ? "completed" : "skipped";
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
          const canJump = !disabled && stageNumber > currentStageNumber;
          return (
            <StageCell
              key={stageNumber}
              stageNumber={stageNumber}
              state={state}
              interactive={canJump}
              onTap={canJump ? () => setPendingJump(stageNumber) : undefined}
            />
          );
        })}
      </div>

      <ConfirmSheet
        open={pendingJump !== null}
        title={pendingJump !== null ? `الانتقال إلى المرحلة ${pendingJump}؟` : ""}
        description="سيتم تسجيل أي مرحلة بينهما كمرحلة تم تخطيها، وليست كمرحلة فشل فيها الطفل."
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
  current: "border-teal-500 bg-teal-600 text-white shadow-sm shadow-teal-900/20",
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
      aria-label={`stage-${stageNumber}-${state}`}
      className={`flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-full border-2 text-sm font-bold transition-transform disabled:cursor-default ${CELL_CLASSES[state]} ${
        interactive ? "active:scale-90" : ""
      }`}
    >
      {content}
    </button>
  );
}
