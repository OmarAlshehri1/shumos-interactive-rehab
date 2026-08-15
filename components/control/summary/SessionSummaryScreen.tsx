"use client";

import { formatAccuracyPercent, formatDurationClock, formatReactionTimeSeconds } from "@/components/display/copy";
import { StageStatus, type Difficulty, type SessionSummary, type StageResult } from "@/lib/game";
import { DIFFICULTY_LABELS } from "../copy";
import { StatCard } from "../StatCard";

interface SessionSummaryScreenProps {
  summary: SessionSummary;
  /** CONTROL UX POLISH TASK — the finished session's own pinned patientId (null for a walk-in). Decides which next-action set below is shown — task section 14. */
  sessionPatientId: string | null;
  /** Walk-in PRIMARY / saved-patient's underlying reset — see useRealtimeControllerSession.ts's newSession(). */
  onNewSession: () => void;
  /** TASK 9: replays the SESSION_COMPLETE celebration on /display — presentation-only, never touches score/metrics/Firebase game state. */
  onReplayCelebration: () => void;
  /** Saved-patient PRIMARY — "العودة لملف المريض." */
  onReturnToPatientProfile: () => void;
  /** Saved-patient SECONDARY — "جلسة أخرى لنفس المريض": preserves patient selection, returns to Activities. */
  onStartAnotherForSamePatient: () => void;
  /** Walk-in SECONDARY — "الأنشطة." */
  onGoToActivities: () => void;
  /** TERTIARY on both branches — "الرئيسية." */
  onGoHome: () => void;
}

/** Groups stageResults by difficulty, in the summary's own canonical difficultiesPlayed order — never all 3 difficulties, only the ones actually played. */
function groupByDifficulty(summary: SessionSummary): { difficulty: Difficulty; stages: StageResult[] }[] {
  return summary.difficultiesPlayed.map((difficulty) => ({
    difficulty,
    stages: summary.stageResults.filter((r) => r.difficulty === difficulty),
  }));
}

function StageRow({ result }: { result: StageResult }) {
  const isSkipped = result.status === StageStatus.SKIPPED;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <span className="text-sm font-semibold text-slate-800">المرحلة {result.stageNumber}</span>
      {isSkipped ? (
        // TASK 11: neutral, never "فشل"/"لم ينجح"/"خطأ" — skipping is a therapist decision, not a judgment of the child. See the Task 11 report's "Skip behavior" section.
        <span className="text-xs font-semibold text-slate-400">— تم التخطي</span>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="font-medium text-emerald-600">{result.correctCount} صحيح</span>
          <span>{result.incorrectCount} خطأ</span>
          <span>{formatAccuracyPercent(result.accuracy)}</span>
          <span dir="ltr" className="font-mono">
            {formatDurationClock(result.durationMs)}
          </span>
          <span>{formatReactionTimeSeconds(result.averageReactionTimeMs)}</span>
        </div>
      )}
    </div>
  );
}

/**
 * TASK 9: the therapist's own session summary — same canonical
 * SessionSummary as the /display family report (SessionCompleteScene), no
 * separate calculation. This surface "may contain slightly more detail"
 * per spec, which here means the per-stage average response time row that
 * the more photo-focused family report leaves out for space.
 *
 * TASK 11: restructured to group stages by DIFFICULTY (a session can now
 * span more than one — see the "أسهل"/"أصعب" decision on
 * StageCompleteOverlay) rather than assuming a single fixed difficulty and
 * exactly 3 stages. Only difficulties/stages actually played are shown —
 * never all 15 possible stages. SKIPPED stages show "تم التخطي" with no
 * stats, never a failure label — see StageRow above.
 *
 * CONTROL UX POLISH TASK — "after completing a session, the report appears
 * but it is unclear what to do next" (task section 14, verbatim client
 * observation). The bottom action area is now a clear, branching next-step
 * hierarchy instead of one generic "جلسة جديدة" button: SAVED PATIENT
 * (sessionPatientId != null) gets العودة لملف المريض (primary) / جلسة أخرى
 * لنفس المريض (secondary) / الرئيسية (tertiary); WALK-IN gets جلسة جديدة
 * (primary) / الأنشطة (secondary) / الرئيسية (tertiary). "إعادة الاحتفال" is
 * a different KIND of action (a presentation replay, not navigation) — kept
 * visually separate below the navigation block, per task section 18's "one
 * obvious primary action per state."
 */
export function SessionSummaryScreen({
  summary,
  sessionPatientId,
  onNewSession,
  onReplayCelebration,
  onReturnToPatientProfile,
  onStartAnotherForSamePatient,
  onGoToActivities,
  onGoHome,
}: SessionSummaryScreenProps) {
  const groups = groupByDifficulty(summary);
  const completedCount = summary.stageResults.filter((r) => r.status === StageStatus.COMPLETED).length;
  const skippedCount = summary.stageResults.length - completedCount;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-8 sm:px-8 sm:py-10">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">ملخص الجلسة</h1>
        <p className="text-lg font-semibold text-teal-700">{summary.childFirstName}</p>
      </header>

      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        <StatCard label="المراحل المكتملة" value={String(completedCount)} tone="positive" ltr />
        <StatCard label="المراحل المتخطاة" value={String(skippedCount)} ltr />
        <StatCard
          label="أفضل مرحلة"
          value={summary.bestStage ? `${DIFFICULTY_LABELS[summary.bestStage.difficulty].name} ${summary.bestStage.stageNumber}` : "—"}
        />
        <StatCard label="أهداف صحيحة" value={String(summary.totalCorrect)} tone="positive" />
        <StatCard label="محاولات خاطئة" value={String(summary.totalIncorrect)} />
        <StatCard label="الدقة الإجمالية" value={formatAccuracyPercent(summary.overallAccuracy)} />
        <StatCard label="المدة الإجمالية" value={formatDurationClock(summary.totalDurationMs)} />
        <StatCard label="متوسط زمن الاستجابة المسجل" value={formatReactionTimeSeconds(summary.averageReactionTimeMs)} />
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-slate-700">تفاصيل المراحل</h2>
        {groups.map((group) => (
          <div key={group.difficulty} className="flex flex-col gap-2">
            <h3 className="text-xs font-bold tracking-wide text-teal-700 uppercase">{DIFFICULTY_LABELS[group.difficulty].name}</h3>
            <div className="flex flex-col gap-2">
              {group.stages.map((result) => (
                <StageRow key={`${result.difficulty}-${result.stageNumber}`} result={result} />
              ))}
            </div>
          </div>
        ))}
      </section>

      <div className="flex flex-col gap-2.5">
        {sessionPatientId ? (
          <>
            <button
              type="button"
              onClick={onReturnToPatientProfile}
              className="min-h-16 touch-manipulation rounded-2xl bg-teal-600 text-xl font-bold text-white shadow-lg shadow-teal-900/15 transition-all active:scale-[0.98]"
            >
              العودة لملف المريض
            </button>
            <button
              type="button"
              onClick={onStartAnotherForSamePatient}
              className="min-h-14 touch-manipulation rounded-2xl border-2 border-teal-200 bg-white text-base font-bold text-teal-700 transition-all active:scale-[0.98] active:bg-teal-50"
            >
              جلسة أخرى لنفس المريض
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onNewSession}
              className="min-h-16 touch-manipulation rounded-2xl bg-teal-600 text-xl font-bold text-white shadow-lg shadow-teal-900/15 transition-all active:scale-[0.98]"
            >
              جلسة جديدة
            </button>
            <button
              type="button"
              onClick={onGoToActivities}
              className="min-h-14 touch-manipulation rounded-2xl border-2 border-teal-200 bg-white text-base font-bold text-teal-700 transition-all active:scale-[0.98] active:bg-teal-50"
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
        className="min-h-12 touch-manipulation rounded-2xl text-sm font-medium text-teal-600 transition-colors active:text-teal-800"
      >
        إعادة الاحتفال 🎉
      </button>
    </div>
  );
}
