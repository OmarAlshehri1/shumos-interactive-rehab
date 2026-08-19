"use client";

import { formatDurationClock } from "@/components/display/copy";
import { type BubblePopSessionSummary, type BubblePopStageResult, BubblePopStageStatus, Difficulty } from "@/lib/bubblepop";
import { DIFFICULTY_LABELS } from "@/components/control/copy";
import { StatCard } from "@/components/control/StatCard";
import { SectionCard } from "@/components/control/ui/SectionCard";
import { formatAccuracyPercent, formatCompletionPercent, formatResponseTimeSeconds } from "../copy";
import { SessionSummaryWorkflowPanel } from "@/components/control/session/SessionSummaryWorkflowPanel";
import type { SessionWorkflowMetadata } from "@/lib/sessions/workflowMetadata";

interface BubblePopSessionSummaryScreenProps {
  summary: BubblePopSessionSummary;
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

function groupByDifficulty(summary: BubblePopSessionSummary): { difficulty: Difficulty; stages: BubblePopStageResult[] }[] {
  return summary.difficultiesPlayed.map((difficulty) => ({
    difficulty,
    stages: summary.stageResults.filter((r) => r.difficulty === difficulty),
  }));
}

function StageRow({ result }: { result: BubblePopStageResult }) {
  const isSkipped = result.status === BubblePopStageStatus.SKIPPED;
  const completionRate = result.targetsPresented === 0 ? null : result.targetsCompleted / result.targetsPresented;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <span className="text-sm font-semibold text-slate-800">المرحلة {result.stageNumber}</span>
      {isSkipped ? (
        <span className="text-xs font-semibold text-slate-400">— تم التخطي</span>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="font-medium text-emerald-600">
            {result.targetsCompleted} / {result.targetsPresented} هدف
          </span>
          <span>{formatCompletionPercent(completionRate)}</span>
          <span dir="ltr" className="font-mono">
            {formatDurationClock(result.durationMs)}
          </span>
          <span>{formatResponseTimeSeconds(result.averageResponseTimeMs)}</span>
        </div>
      )}
    </div>
  );
}

/** Bubble Pop Wall's own therapist session summary — same visual language and next-action hierarchy as the other two games' summary screens, showing only this game's own metrics. */
export function BubblePopSessionSummaryScreen({
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
}: BubblePopSessionSummaryScreenProps) {
  const groups = groupByDifficulty(summary);
  const completedCount = summary.stageResults.filter((r) => r.status === BubblePopStageStatus.COMPLETED).length;
  const skippedCount = summary.stageResults.length - completedCount;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-5 py-8 sm:px-8 sm:py-10">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">ملخص المغامرة تحت الماء</h1>
        <p className="text-lg font-semibold text-cyan-700">{summary.childFirstName}</p>
      </header>

      <SectionCard title="النتائج">
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          <StatCard label="المراحل المكتملة" value={String(completedCount)} tone="positive" ltr />
          <StatCard label="المراحل المتخطاة" value={String(skippedCount)} ltr />
          <StatCard
            label="أفضل مرحلة"
            value={summary.bestStage ? `${DIFFICULTY_LABELS[summary.bestStage.difficulty].name} ${summary.bestStage.stageNumber}` : "—"}
          />
          <StatCard label="أهداف صحيحة" value={String(summary.totalTargetsCompleted)} tone="positive" />
          <StatCard label="إجمالي الأهداف" value={String(summary.totalTargetsPresented)} />
          <StatCard label="اختيارات غير صحيحة" value={String(summary.totalIncorrect)} />
          <StatCard label="نسبة الإكمال" value={formatCompletionPercent(summary.completionRate)} />
          <StatCard label="نسبة الدقة" value={formatAccuracyPercent(summary.accuracy)} />
          <StatCard label="المدة الإجمالية" value={formatDurationClock(summary.totalDurationMs)} />
        </div>
        <StatCard label="متوسط زمن الاستجابة المسجل" value={formatResponseTimeSeconds(summary.averageResponseTimeMs)} />
      </SectionCard>

      <SectionCard title="تفاصيل المراحل" className="gap-4">
        {groups.map((group) => (
          <div key={group.difficulty} className="flex flex-col gap-2">
            <h3 className="text-xs font-bold tracking-wide text-cyan-700 uppercase">{DIFFICULTY_LABELS[group.difficulty].name}</h3>
            <div className="flex flex-col gap-2">
              {/* `index` is part of the key because the same (difficulty, stageNumber) legitimately repeats — e.g. restarting or re-skipping an already-completed stage adds another entry to stageResults rather than replacing the earlier one (real duplicate-key React warning otherwise, QA-caught). */}
              {group.stages.map((result, index) => (
                <StageRow key={`${result.difficulty}-${result.stageNumber}-${index}`} result={result} />
              ))}
            </div>
          </div>
        ))}
      </SectionCard>

      <SessionSummaryWorkflowPanel workflow={workflow} therapistName={therapistName} patientId={sessionPatientId} sessionId={summary.sessionId} />

      <div className="flex flex-col gap-2.5">
        {sessionPatientId ? (
          <>
            <button
              type="button"
              onClick={onReturnToPatientProfile}
              className="min-h-16 touch-manipulation rounded-2xl bg-cyan-600 text-xl font-bold text-white shadow-lg shadow-cyan-900/15 transition-all active:scale-[0.98]"
            >
              العودة لملف المريض
            </button>
            <button
              type="button"
              onClick={onStartAnotherForSamePatient}
              className="min-h-14 touch-manipulation rounded-2xl border-2 border-cyan-200 bg-white text-base font-bold text-cyan-700 transition-all active:scale-[0.98] active:bg-cyan-50"
            >
              جلسة أخرى لنفس المريض
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onNewSession}
              className="min-h-16 touch-manipulation rounded-2xl bg-cyan-600 text-xl font-bold text-white shadow-lg shadow-cyan-900/15 transition-all active:scale-[0.98]"
            >
              جلسة جديدة
            </button>
            <button
              type="button"
              onClick={onGoToActivities}
              className="min-h-14 touch-manipulation rounded-2xl border-2 border-cyan-200 bg-white text-base font-bold text-cyan-700 transition-all active:scale-[0.98] active:bg-cyan-50"
            >
              الأنشطة
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onGoHome}
          className="min-h-10 touch-manipulation text-sm font-medium text-slate-400 transition-colors active:text-slate-600"
        >
          الرئيسية
        </button>
      </div>

      <button
        type="button"
        onClick={onReplayCelebration}
        className="min-h-12 touch-manipulation rounded-2xl text-sm font-medium text-cyan-600 transition-colors active:text-cyan-800"
      >
        إعادة الاحتفال 🫧
      </button>
    </div>
  );
}
