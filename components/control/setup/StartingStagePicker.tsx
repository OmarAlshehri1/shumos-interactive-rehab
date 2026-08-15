import { STAGES_PER_DIFFICULTY, type StageNumber } from "@/lib/game";

interface StartingStagePickerProps {
  value: StageNumber;
  onChange: (stageNumber: StageNumber) => void;
}

const STAGE_NUMBERS = Array.from({ length: STAGES_PER_DIFFICULTY }, (_, i) => (i + 1) as StageNumber);

/**
 * TASK 12 — "مرحلة البداية": lets the therapist manually pick which stage of
 * the ALREADY-selected difficulty this session begins at (e.g. "this child
 * reached Medium 3 last time, no need to restart from 1"). Deliberately the
 * same small-circle visual language as the in-session StageStrip
 * (components/control/live/StageStrip.tsx) for a consistent feel, but
 * simpler: every cell is always selectable (nothing has been played yet),
 * so there's no completed/skipped state here — just plain single-select.
 * Manual only — see DraftConfig.startingStage's doc comment for why this is
 * intentionally NOT wired to any persisted history yet.
 */
export function StartingStagePicker({ value, onChange }: StartingStagePickerProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="text-xs font-medium text-slate-500">مرحلة البداية</h3>
      <div role="radiogroup" aria-label="مرحلة البداية" className="flex items-center gap-2.5" dir="ltr">
        {STAGE_NUMBERS.map((stageNumber) => {
          const selected = stageNumber === value;
          return (
            <button
              key={stageNumber}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(stageNumber)}
              className={`flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full border-2 text-base font-bold transition-all active:scale-[0.94] ${
                selected
                  ? "border-teal-600 bg-teal-600 text-white shadow-md shadow-teal-900/15"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 active:bg-slate-50"
              }`}
            >
              {stageNumber}
            </button>
          );
        })}
      </div>
    </div>
  );
}
