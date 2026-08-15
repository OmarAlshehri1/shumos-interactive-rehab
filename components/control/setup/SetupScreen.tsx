"use client";

import { Difficulty, PlayArea, TargetSize, TargetSpacing, type StageNumber } from "@/lib/game";
import type { DraftConfig } from "@/lib/control/useLocalControllerSession";
import { DIFFICULTY_LABELS, PLAY_AREA_LABELS, TARGET_SIZE_LABELS, TARGET_SPACING_LABELS } from "../copy";
import { DevQuickFill } from "./DevQuickFill";
import { SegmentedControl } from "./SegmentedControl";
import { StartingStagePicker } from "./StartingStagePicker";

const DIFFICULTY_OPTIONS = Object.values(Difficulty).map((value) => ({
  value,
  label: DIFFICULTY_LABELS[value].name,
  description: DIFFICULTY_LABELS[value].description,
}));
const TARGET_SIZE_OPTIONS = Object.values(TargetSize).map((value) => ({ value, label: TARGET_SIZE_LABELS[value] }));
const TARGET_SPACING_OPTIONS = Object.values(TargetSpacing).map((value) => ({
  value,
  label: TARGET_SPACING_LABELS[value],
}));
const PLAY_AREA_OPTIONS = Object.values(PlayArea).map((value) => ({ value, label: PLAY_AREA_LABELS[value] }));

interface SetupScreenProps {
  draft: DraftConfig;
  onChildNameChange: (value: string) => void;
  onDifficultyChange: (value: Difficulty) => void;
  onStartingStageChange: (value: StageNumber) => void;
  onTargetSizeChange: (value: TargetSize) => void;
  onTargetSpacingChange: (value: TargetSpacing) => void;
  onPlayAreaChange: (value: PlayArea) => void;
  onStart: () => void;
}

export function SetupScreen({
  draft,
  onChildNameChange,
  onDifficultyChange,
  onStartingStageChange,
  onTargetSizeChange,
  onTargetSpacingChange,
  onPlayAreaChange,
  onStart,
}: SetupScreenProps) {
  const canStart = draft.childFirstName.trim().length > 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-5 py-8 sm:px-8 sm:py-12">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">مغامرة البالونات</h1>
        <p className="text-base text-slate-500">إعداد جلسة جديدة</p>
      </header>

      <section className="flex flex-col gap-2.5">
        <label htmlFor="child-name" className="text-sm font-semibold text-slate-700">
          اسم الطفل
        </label>
        <input
          id="child-name"
          type="text"
          inputMode="text"
          autoComplete="off"
          value={draft.childFirstName}
          onChange={(e) => onChildNameChange(e.target.value)}
          placeholder="اكتب الاسم الأول"
          maxLength={30}
          className="min-h-14 touch-manipulation rounded-2xl border-2 border-slate-200 bg-white px-5 text-lg font-medium text-slate-900 outline-none transition-colors select-text placeholder:text-slate-400 focus:border-teal-600"
        />
        <DevQuickFill onFill={() => onChildNameChange("محمد")} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-700">مستوى الصعوبة</h2>
        <SegmentedControl
          aria-label="مستوى الصعوبة"
          options={DIFFICULTY_OPTIONS}
          value={draft.difficulty}
          onChange={onDifficultyChange}
        />
        <StartingStagePicker value={draft.startingStage} onChange={onStartingStageChange} />
      </section>

      <section className="flex flex-col gap-5 rounded-3xl border border-slate-200 bg-slate-50/60 p-5">
        <h2 className="text-sm font-semibold text-slate-700">إعدادات اللعبة العلاجية</h2>

        <div className="flex flex-col gap-2.5">
          <h3 className="text-xs font-medium text-slate-500">حجم الأهداف</h3>
          <SegmentedControl
            aria-label="حجم الأهداف"
            options={TARGET_SIZE_OPTIONS}
            value={draft.targetSize}
            onChange={onTargetSizeChange}
          />
        </div>

        <div className="flex flex-col gap-2.5">
          <h3 className="text-xs font-medium text-slate-500">المسافات</h3>
          <SegmentedControl
            aria-label="المسافات"
            options={TARGET_SPACING_OPTIONS}
            value={draft.targetSpacing}
            onChange={onTargetSpacingChange}
          />
        </div>

        <div className="flex flex-col gap-2.5">
          <h3 className="text-xs font-medium text-slate-500">منطقة اللعب</h3>
          <SegmentedControl
            aria-label="منطقة اللعب"
            columns={4}
            options={PLAY_AREA_OPTIONS}
            value={draft.playArea}
            onChange={onPlayAreaChange}
          />
        </div>
      </section>

      <button
        type="button"
        disabled={!canStart}
        onClick={onStart}
        className="min-h-16 touch-manipulation rounded-2xl bg-teal-600 text-xl font-bold text-white shadow-lg shadow-teal-900/15 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
      >
        ابدأ الجلسة
      </button>
    </div>
  );
}
