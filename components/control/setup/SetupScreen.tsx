"use client";

import { Difficulty, STAGES_PER_DIFFICULTY, type StageNumber } from "@/lib/game";
import type { DraftConfig } from "@/lib/control/useLocalControllerSession";
import { getStageCopy } from "@/lib/control/stageCopy";
import { SectionCard } from "@/components/control/ui/SectionCard";
import { DIFFICULTY_LABELS } from "../copy";
import { DevQuickFill } from "./DevQuickFill";
import { SegmentedControl } from "./SegmentedControl";
import { StageCard } from "./StageCard";
import { BalloonStagePreview } from "./previews/BalloonStagePreview";
import { SetupIdentityCard } from "@/components/control/session/SetupIdentityCard";

const DIFFICULTY_OPTIONS = Object.values(Difficulty).map((value) => ({
  value,
  label: DIFFICULTY_LABELS[value].name,
  description: DIFFICULTY_LABELS[value].description,
}));

const STAGE_NUMBERS = Array.from({ length: STAGES_PER_DIFFICULTY }, (_, i) => (i + 1) as StageNumber);

interface SetupScreenProps {
  draft: DraftConfig;
  patientName: string | null;
  therapistName: string | null | undefined;
  onChildNameChange: (value: string) => void;
  onDifficultyChange: (value: Difficulty) => void;
  onStartingStageChange: (value: StageNumber) => void;
  onStart: () => void;
}

export function SetupScreen({ draft, patientName, therapistName, onChildNameChange, onDifficultyChange, onStartingStageChange, onStart }: SetupScreenProps) {
  const canStart = draft.childFirstName.trim().length > 0;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-5 py-8 pb-16 sm:px-8 sm:py-12 sm:pb-20">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">مغامرة البالونات</h1>
        <p className="text-base text-slate-500">إعداد جلسة جديدة</p>
      </header>

      <SectionCard title="بيانات الطفل" className="gap-2.5">
        <label htmlFor="child-name" className="sr-only">
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
      </SectionCard>

      <SetupIdentityCard childName={draft.childFirstName} patientName={patientName} therapistName={therapistName} />

      <SectionCard title="اختر المستوى">
        <SegmentedControl
          aria-label="مستوى الصعوبة"
          options={DIFFICULTY_OPTIONS}
          value={draft.difficulty}
          onChange={onDifficultyChange}
        />
      </SectionCard>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-700">اختر المرحلة</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STAGE_NUMBERS.map((stageNumber) => {
            const copy = getStageCopy(draft.difficulty, stageNumber);
            return (
              <StageCard
                key={stageNumber}
                label={`المرحلة ${stageNumber}`}
                title={copy.title}
                description={copy.description}
                characteristics={copy.characteristics}
                selected={draft.startingStage === stageNumber}
                onSelect={() => onStartingStageChange(stageNumber)}
                preview={<BalloonStagePreview difficulty={draft.difficulty} stageNumber={stageNumber} />}
              />
            );
          })}
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
