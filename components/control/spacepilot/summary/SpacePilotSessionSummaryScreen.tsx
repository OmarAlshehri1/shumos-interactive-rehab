"use client";

import { formatDurationClock } from "@/components/display/copy";
import { Difficulty, totalStarsFor, type SpacePilotSessionSummary } from "@/lib/spacepilot";
import { StatCard } from "@/components/control/StatCard";
import { SectionCard } from "@/components/control/ui/SectionCard";
import { formatSpacePilotCollectionPercent } from "../copy";
import { SessionSummaryWorkflowPanel } from "@/components/control/session/SessionSummaryWorkflowPanel";
import type { SessionWorkflowMetadata } from "@/lib/sessions/workflowMetadata";

const STAGE_TITLE_AR: Record<Difficulty, string> = {
  [Difficulty.EASY]: "ملخص رحلة النجوم",
  [Difficulty.MEDIUM]: "ملخص حزام النيازك",
  [Difficulty.ADVANCED]: "ملخص مهمة المجرة",
};

interface SpacePilotSessionSummaryScreenProps {
  summary: SpacePilotSessionSummary;
  sessionPatientId: string | null;
  workflow?: SessionWorkflowMetadata;
  therapistName?: string | null;
  onNewSession: () => void;
  onReplayCelebration: () => void;
  onReturnToPatientProfile: () => void;
  onStartAnotherForSamePatient: () => void;
  onGoToActivities: () => void;
  onGoHome: () => void;
}

/** Space Pilot's own therapist session summary — same visual language and next-action hierarchy as every other game's summary screen, showing only this game's own honest metrics (task's suggested starsPresented/starsCollected/collectionRate/duration). */
export function SpacePilotSessionSummaryScreen({
  summary,
  sessionPatientId,
  workflow,
  therapistName,
  onNewSession,
  onReplayCelebration,
  onReturnToPatientProfile,
  onStartAnotherForSamePatient,
  onGoToActivities,
  onGoHome,
}: SpacePilotSessionSummaryScreenProps) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-5 py-8 sm:px-8 sm:py-10">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{STAGE_TITLE_AR[summary.difficulty]}</h1>
        <p className="text-lg font-semibold text-indigo-700">{summary.childFirstName}</p>
      </header>

      <SectionCard title="النتائج">
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          <StatCard label="نجوم مجمّعة" value={String(summary.starsCollected)} tone="positive" ltr />
          <StatCard label="نجوم معروضة" value={String(summary.starsPresented)} ltr />
          <StatCard label="نسبة جمع النجوم" value={formatSpacePilotCollectionPercent(summary.collectionRate)} />
          <StatCard label="مستوى ترقية الصاروخ" value={`${summary.finalUpgradeLevel} / ${totalStarsFor(summary.difficulty)}`} tone="positive" />
          <StatCard label="المدة الإجمالية" value={formatDurationClock(summary.totalDurationMs)} />
          {summary.asteroidsCleared !== null && <StatCard label="نيازك دُمّرت" value={String(summary.asteroidsCleared)} tone="positive" ltr />}
          {summary.asteroidsAvoided !== null && <StatCard label="نيازك تم تفاديها" value={String(summary.asteroidsAvoided)} ltr />}
        </div>
      </SectionCard>

      <SessionSummaryWorkflowPanel
        workflow={workflow}
        therapistName={therapistName}
        patientId={sessionPatientId}
        sessionId={summary.sessionId}
      />

      <div className="flex flex-col gap-2.5">
        {sessionPatientId ? (
          <>
            <button
              type="button"
              onClick={onReturnToPatientProfile}
              className="min-h-16 touch-manipulation rounded-2xl bg-indigo-600 text-xl font-bold text-white shadow-lg shadow-indigo-900/15 transition-all active:scale-[0.98]"
            >
              العودة لملف المريض
            </button>
            <button
              type="button"
              onClick={onStartAnotherForSamePatient}
              className="min-h-14 touch-manipulation rounded-2xl border-2 border-indigo-200 bg-white text-base font-bold text-indigo-700 transition-all active:scale-[0.98] active:bg-indigo-50"
            >
              جلسة أخرى لنفس المريض
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onNewSession}
              className="min-h-16 touch-manipulation rounded-2xl bg-indigo-600 text-xl font-bold text-white shadow-lg shadow-indigo-900/15 transition-all active:scale-[0.98]"
            >
              جلسة جديدة
            </button>
            <button
              type="button"
              onClick={onGoToActivities}
              className="min-h-14 touch-manipulation rounded-2xl border-2 border-indigo-200 bg-white text-base font-bold text-indigo-700 transition-all active:scale-[0.98] active:bg-indigo-50"
            >
              الأنشطة
            </button>
          </>
        )}
        <button type="button" onClick={onGoHome} className="min-h-10 touch-manipulation text-sm font-medium text-slate-400 transition-colors active:text-slate-600">
          الرئيسية
        </button>
      </div>

      <button
        type="button"
        onClick={onReplayCelebration}
        className="min-h-12 touch-manipulation rounded-2xl text-sm font-medium text-indigo-600 transition-colors active:text-indigo-800"
      >
        إعادة الاحتفال 🚀
      </button>
    </div>
  );
}
