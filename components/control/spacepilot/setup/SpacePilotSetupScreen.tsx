"use client";

import { Difficulty } from "@/lib/spacepilot";
import type { SpacePilotDraftConfig } from "@/lib/control/spacepilot/useLocalSpacePilotControllerSession";
import { SetupIdentityCard } from "@/components/control/session/SetupIdentityCard";

interface SpacePilotSetupScreenProps {
  draft: SpacePilotDraftConfig;
  patientName: string | null;
  therapistName: string | null | undefined;
  onChildNameChange: (value: string) => void;
  onDifficultyChange: (value: Difficulty) => void;
  onStart: () => void;
}

interface StageCard {
  difficulty: Difficulty;
  titleAr: string;
  subtitleAr: string;
  bullets: string[];
}

/**
 * Space Pilot's own three stage cards (task's "Space Pilot only has 3
 * stages. Make the three cards clearly communicate" what each one is) — one
 * per difficulty, each mapping to exactly ONE stage (never 5 like the
 * balloon-style games). Picking a card is the only "difficulty" concept
 * this game has.
 */
const STAGE_CARDS: StageCard[] = [
  {
    difficulty: Difficulty.EASY,
    titleAr: "رحلة النجوم",
    subtitleAr: "سهل",
    bullets: ["3 مسارات: أعلى، وسط، أسفل", "8 نجوم لترقية الصاروخ", "بدون عوائق أو فشل"],
  },
  {
    difficulty: Difficulty.MEDIUM,
    titleAr: "حزام النيازك",
    subtitleAr: "متوسط",
    bullets: ["نجوم + نيازك", "تفادى بالمسار أو أطلق لتدميرها", "تحكم UP / FIRE / DOWN"],
  },
  {
    difficulty: Difficulty.ADVANCED,
    titleAr: "مهمة المجرة",
    subtitleAr: "متقدم",
    bullets: ["مهمة فضائية كاملة", "نيازك + سفينة فضائية صديقة", "أقوى ترقية للصاروخ"],
  },
];

export function SpacePilotSetupScreen({ draft, patientName, therapistName, onChildNameChange, onDifficultyChange, onStart }: SpacePilotSetupScreenProps) {
  const canStart = draft.childFirstName.trim().length > 0;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-8 px-5 py-8 sm:px-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-xs font-semibold tracking-wide text-indigo-600 uppercase">قائد الفضاء</span>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">إعداد الجلسة</h1>
      </div>

      <div className="flex w-full flex-col gap-2">
        <label htmlFor="space-pilot-child-name" className="text-sm font-semibold text-slate-700">
          اسم الطفل
        </label>
        <input
          id="space-pilot-child-name"
          type="text"
          value={draft.childFirstName}
          onChange={(e) => onChildNameChange(e.target.value)}
          placeholder="اكتب اسم الطفل"
          className="min-h-14 w-full rounded-2xl border-2 border-slate-200 px-4 text-lg font-semibold text-slate-900 outline-none transition-colors focus:border-indigo-400"
          maxLength={30}
        />
      </div>

      <div className="w-full">
        <SetupIdentityCard childName={draft.childFirstName} patientName={patientName} therapistName={therapistName} />
      </div>

      <div className="flex w-full flex-col gap-3">
        <span className="text-sm font-semibold text-slate-700">اختر المرحلة</span>
        {STAGE_CARDS.map((card) => {
          const selected = draft.difficulty === card.difficulty;
          return (
            <button
              key={card.difficulty}
              type="button"
              onClick={() => onDifficultyChange(card.difficulty)}
              className={`w-full rounded-3xl border-2 p-5 text-start shadow-sm transition-colors ${
                selected ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-800">{card.titleAr}</h2>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${selected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"}`}>{card.subtitleAr}</span>
              </div>
              <ul className="flex flex-col gap-1.5 text-xs font-medium text-slate-600">
                {card.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-center gap-1.5">
                    <span className="h-1 w-1 rounded-full bg-indigo-400" />
                    {bullet}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onStart}
        disabled={!canStart}
        className="min-h-16 w-full touch-manipulation rounded-2xl bg-indigo-600 text-xl font-bold text-white shadow-lg shadow-indigo-900/15 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
      >
        متابعة
      </button>
    </div>
  );
}
