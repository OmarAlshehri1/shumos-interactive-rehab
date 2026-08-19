"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { DIFFICULTY_ORDER, StageStatus, type Difficulty } from "@/lib/game";
import { buildSessionInsights } from "@/lib/analytics/patientAnalytics";
import { getGameById } from "@/lib/games/registry";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { getPatient } from "@/lib/patients/patientRepository";
import type { Patient } from "@/lib/patients/types";
import { getSessionHistoryRecord } from "@/lib/sessions/sessionHistoryRepository";
import type { AnyStoredSession, StoredBubblePopStageResult, StoredColorChaseStageResult, StoredFeedAnimalsStageResult, StoredFootstepsStageResult, StoredStageResult } from "@/lib/sessions/types";
import { StatCard } from "@/components/control/StatCard";
import { SectionCard } from "@/components/control/ui/SectionCard";
import { DIFFICULTY_LABELS } from "@/components/control/copy";
import { formatCompletionPercent, formatStepTimeSeconds } from "@/components/control/footsteps/copy";
import { formatAccuracyPercent as formatBubblePopAccuracyPercent, formatCompletionPercent as formatBubblePopCompletionPercent, formatResponseTimeSeconds } from "@/components/control/bubblepop/copy";
import {
  formatAccuracyPercent as formatFeedAnimalsAccuracyPercent,
  formatCompletionPercent as formatFeedAnimalsCompletionPercent,
  formatResponseTimeSeconds as formatFeedAnimalsResponseTimeSeconds,
} from "@/components/control/feedanimals/copy";
import { ControlBreadcrumb, type ControlBreadcrumbItem } from "@/components/control/nav/ControlBreadcrumb";
import { formatAccuracyPercent, formatDurationClock, formatReactionTimeSeconds } from "@/components/display/copy";
import { formatSessionDate, formatSessionTime } from "./formatSessionDate";
import { SessionMetadataDetails } from "@/components/control/session/SessionMetadataDetails";
import { finiteCount, formatCountOrUnavailable, safeRatio } from "@/lib/dataIntegrity/numeric";

/** Groups by difficulty in canonical EASY -> MEDIUM -> ADVANCED order — only the difficulties this session actually played, same convention as SessionSummaryScreen's groupByDifficulty. */
function groupByDifficulty<T extends { difficulty: Difficulty }>(stageResults: T[]): { difficulty: Difficulty; stages: T[] }[] {
  const present = new Set(stageResults.map((r) => r.difficulty));
  return DIFFICULTY_ORDER.filter((d) => present.has(d)).map((difficulty) => ({
    difficulty,
    stages: stageResults.filter((r) => r.difficulty === difficulty),
  }));
}

function StageDetailRow({ result }: { result: StoredStageResult }) {
  const isSkipped = result.status === StageStatus.SKIPPED;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <span className="text-sm font-semibold text-slate-800">المرحلة {result.stageNumber}</span>
      {isSkipped ? (
        <span className="text-xs font-semibold text-slate-400">— تم التخطي</span>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="font-medium text-emerald-600">{formatCountOrUnavailable(result.correct)} صحيح</span>
          <span>{formatCountOrUnavailable(result.incorrect)} خطأ</span>
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

/** MULTI-GAME PLATFORM — Follow the Footsteps' own historical stage row (task section 36): steps completed, duration, average step time, status. No "دقة"/accuracy language. */
function FootstepsStageDetailRow({ result }: { result: StoredFootstepsStageResult }) {
  const isSkipped = result.status === StageStatus.SKIPPED;
  const completionRate = safeRatio(result.stepsCompleted, result.stepsPresented);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <span className="text-sm font-semibold text-slate-800">المرحلة {result.stageNumber}</span>
      {isSkipped ? (
        <span className="text-xs font-semibold text-slate-400">— تم التخطي</span>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="font-medium text-emerald-600">
            {formatCountOrUnavailable(result.stepsCompleted)} / {formatCountOrUnavailable(result.stepsPresented)} خطوة
          </span>
          <span>{formatCompletionPercent(completionRate)}</span>
          <span dir="ltr" className="font-mono">
            {formatDurationClock(result.durationMs)}
          </span>
          <span>{formatStepTimeSeconds(result.averageStepTimeMs)}</span>
        </div>
      )}
    </div>
  );
}

/** MULTI-GAME PLATFORM — Bubble Pop Wall's own historical stage row: targets completed/presented, incorrect count, completion rate, duration, average response time, status. Genuinely has both a completion metric AND an incorrect count — see lib/bubblepop/types.ts's BubblePopSessionSummary doc comment. */
function BubblePopStageDetailRow({ result }: { result: StoredBubblePopStageResult }) {
  const isSkipped = result.status === StageStatus.SKIPPED;
  const completionRate = safeRatio(result.targetsCompleted, result.targetsPresented);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <span className="text-sm font-semibold text-slate-800">المرحلة {result.stageNumber}</span>
      {isSkipped ? (
        <span className="text-xs font-semibold text-slate-400">— تم التخطي</span>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="font-medium text-emerald-600">
            {formatCountOrUnavailable(result.targetsCompleted)} / {formatCountOrUnavailable(result.targetsPresented)} هدف
          </span>
          <span>{formatCountOrUnavailable(result.incorrectCount)} غير صحيح</span>
          <span>{formatBubblePopCompletionPercent(completionRate)}</span>
          <span dir="ltr" className="font-mono">
            {formatDurationClock(result.durationMs)}
          </span>
          <span>{formatResponseTimeSeconds(result.averageResponseTimeMs)}</span>
        </div>
      )}
    </div>
  );
}

/** MULTI-GAME PLATFORM — Feed the Animals' own historical stage row: rounds completed/presented, incorrect count, completion rate, duration, average response time, status. Genuinely has both a completion metric AND an incorrect count — see lib/feedanimals/types.ts's FeedAnimalsSessionSummary doc comment. */
function FeedAnimalsStageDetailRow({ result }: { result: StoredFeedAnimalsStageResult }) {
  const isSkipped = result.status === StageStatus.SKIPPED;
  const completionRate = safeRatio(result.roundsCompleted, result.roundsPresented);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <span className="text-sm font-semibold text-slate-800">المرحلة {result.stageNumber}</span>
      {isSkipped ? (
        <span className="text-xs font-semibold text-slate-400">— تم التخطي</span>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="font-medium text-emerald-600">
            {formatCountOrUnavailable(result.roundsCompleted)} / {formatCountOrUnavailable(result.roundsPresented)} حيوان
          </span>
          <span>{formatCountOrUnavailable(result.incorrectCount)} غير صحيح</span>
          <span>{formatFeedAnimalsCompletionPercent(completionRate)}</span>
          <span dir="ltr" className="font-mono">
            {formatDurationClock(result.durationMs)}
          </span>
          <span>{formatFeedAnimalsResponseTimeSeconds(result.averageResponseTimeMs)}</span>
        </div>
      )}
    </div>
  );
}

function ColorChaseStageDetailRow({ result }: { result: StoredColorChaseStageResult }) {
  const isSkipped = result.status === StageStatus.SKIPPED;
  return <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3"><span className="text-sm font-semibold text-slate-800">المرحلة {result.stageNumber}</span>{isSkipped ? <span className="text-xs font-semibold text-slate-400">— تم التخطي</span> : <div className="flex flex-wrap gap-4 text-xs text-slate-500"><span className="font-medium text-emerald-600">{formatCountOrUnavailable(result.correctCount)} هدف ناجح</span><span>{formatCountOrUnavailable(result.incorrectCount)} غير صحيح</span><span>{formatCountOrUnavailable(result.dangerPressCount)} خطر</span><span>{formatAccuracyPercent(result.accuracy)}</span><span>{formatResponseTimeSeconds(result.averageResponseTimeMs)}</span></div>}</div>;
}

function buildBreadcrumbItems(patientId: string, patient: Patient | null | undefined, session: AnyStoredSession | null | undefined): ControlBreadcrumbItem[] {
  return [
    { label: "الرئيسية", href: "/control" },
    { label: "المرضى", href: "/control/patients" },
    { label: patient?.firstName ?? "...", href: `/control/patients/${patientId}` },
    { label: session ? `جلسة ${formatSessionDate(session.completedAt)}` : "الجلسة" },
  ];
}

/**
 * SESSION HISTORY TASK — the historical session detail (task section 10):
 * `/control/patients/{patientId}/sessions/{sessionId}`. READ ONLY.
 *
 * MULTI-GAME PLATFORM — task section 36: a professional Follow the
 * Footsteps historical report, branching on `session.gameId` for the ONE
 * stat grid/stage-row section that genuinely differs; the shared shell
 * (breadcrumb, header, back button) stays identical for both games.
 */
export function SessionDetailScreen({ patientId, sessionId }: { patientId: string; sessionId: string }) {
  return (
    <main
      dir="rtl"
      lang="ar"
      className="fixed inset-0 flex h-dvh w-dvw touch-manipulation flex-col overflow-y-auto bg-slate-50 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] text-slate-900"
      style={{ fontFamily: "var(--font-control), system-ui, sans-serif" }}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 py-8 sm:px-8 sm:py-10">
        {isRealtimeEnabled() ? (
          <RealtimeSessionDetail patientId={patientId} sessionId={sessionId} />
        ) : (
          <>
            <ControlBreadcrumb items={buildBreadcrumbItems(patientId, undefined, undefined)} />
            <RealtimeUnavailableNotice />
          </>
        )}
      </div>
    </main>
  );
}

function RealtimeUnavailableNotice() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-slate-400">
      <p className="max-w-xs text-sm leading-relaxed">سجل الجلسات يتطلب اتصال Firebase مُهيّأ لهذه النسخة.</p>
    </div>
  );
}

function RealtimeSessionDetail({ patientId, sessionId }: { patientId: string; sessionId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<AnyStoredSession | null | undefined>(undefined);
  const [patient, setPatient] = useState<Patient | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void getSessionHistoryRecord(patientId, sessionId).then((record) => {
      if (!cancelled) setSession(record);
    });
    void getPatient(patientId).then((record) => {
      if (!cancelled) setPatient(record);
    });
    return () => {
      cancelled = true;
    };
  }, [patientId, sessionId]);

  const breadcrumb = <ControlBreadcrumb items={buildBreadcrumbItems(patientId, patient, session)} />;

  if (session === undefined || patient === undefined) {
    return (
      <>
        {breadcrumb}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-teal-600" />
          <span className="text-sm font-medium">جاري تحميل تفاصيل الجلسة...</span>
        </div>
      </>
    );
  }

  if (session === null) {
    return (
      <>
        {breadcrumb}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-slate-400">
          <span className="text-3xl" aria-hidden="true">
            🔍
          </span>
          <p className="text-sm">لم يتم العثور على هذه الجلسة</p>
        </div>
      </>
    );
  }

  const gameName = getGameById(session.gameId)?.nameAr ?? session.gameId;
  const sessionInsights = buildSessionInsights(session);

  return (
    <div className="contents session-report-print">
      <div className="print-hidden">{breadcrumb}</div>

      <div className="print-only print-report-brand" aria-hidden="true">
        <Image src="/brand/shumos-care-logo.png" alt="" width={495} height={495} priority />
        <div>
          <strong>شموس كير للتأهيل الشامل</strong>
          <span>تقرير جلسة</span>
        </div>
      </div>

      <header className="flex flex-col items-center gap-1.5 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">ملخص الجلسة</h1>
        <p className="text-lg font-semibold text-teal-700">{patient?.firstName ?? "—"}</p>
        <p className="text-sm text-slate-400">{gameName}</p>
        <p className="text-xs text-slate-400">
          {formatSessionDate(session.completedAt)} — {formatSessionTime(session.completedAt)}
        </p>
      </header>

      <SectionCard title="ملخص الجلسة">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatCard label="المدة" value={formatDurationClock(session.durationMs)} />
          <StatCard label="المستوى" value={DIFFICULTY_LABELS[session.endingDifficulty].name} />
          <StatCard label="المراحل المكتملة" value={formatCountOrUnavailable(session.completedStageCount)} />
          <StatCard label="المراحل المتخطاة" value={formatCountOrUnavailable(session.skippedStageCount)} />
        </div>
      </SectionCard>

      {(session.therapistName || session.endReason) && (
        <SectionCard title="بيانات الجلسة">
          <SessionMetadataDetails metadata={session} therapistName={session.therapistName} />
        </SectionCard>
      )}

      {session.therapistNote && (
        <SectionCard title="ملاحظات الأخصائي">
          <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{session.therapistNote}</p>
        </SectionCard>
      )}

      {sessionInsights.length > 0 && (
        <SectionCard title="ملاحظات الجلسة">
          <ul className="flex flex-col gap-2">
            {sessionInsights.map((insight) => <li key={insight} className="rounded-xl bg-teal-50 px-4 py-3 text-sm font-medium leading-6 text-teal-950">{insight}</li>)}
          </ul>
        </SectionCard>
      )}

      {session.gameId === "follow-the-footsteps" ? (
        <>
          <SectionCard title="النتائج">
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
              <StatCard label="المراحل المكتملة" value={formatCountOrUnavailable(session.completedStageCount)} tone="positive" ltr />
              <StatCard label="المراحل المتخطاة" value={formatCountOrUnavailable(session.skippedStageCount)} ltr />
              <StatCard
                label="أفضل مرحلة"
                value={session.bestStage ? `${DIFFICULTY_LABELS[session.bestStage.difficulty].name} ${session.bestStage.stageNumber}` : "—"}
              />
              <StatCard label="خطوات مكتملة" value={formatCountOrUnavailable(session.totalStepsCompleted)} tone="positive" />
              <StatCard label="إجمالي الخطوات" value={formatCountOrUnavailable(session.totalStepsPresented)} />
              <StatCard label="نسبة الإكمال" value={formatCompletionPercent(session.completionRate)} />
              <StatCard label="المدة الإجمالية" value={formatDurationClock(session.durationMs)} />
              <StatCard label="متوسط زمن الخطوة المسجل" value={formatStepTimeSeconds(session.averageStepTimeMs)} />
            </div>
          </SectionCard>

          <SectionCard title="تفاصيل المراحل" className="gap-4">
            {groupByDifficulty(session.stageResults).map((group) => (
              <div key={group.difficulty} className="flex flex-col gap-2">
                <h3 className="text-xs font-bold tracking-wide text-teal-700 uppercase">{DIFFICULTY_LABELS[group.difficulty].name}</h3>
                <div className="flex flex-col gap-2">
                  {/* `index` is part of every stage-row key in this file because the same (difficulty, stageNumber) legitimately repeats — e.g. re-skipping or restarting an already-completed stage adds another entry to stageResults rather than replacing the earlier one (real duplicate-key React warning otherwise, QA-caught). */}
                  {group.stages.map((result, index) => (
                    <FootstepsStageDetailRow key={`${result.difficulty}-${result.stageNumber}-${index}`} result={result} />
                  ))}
                </div>
              </div>
            ))}
          </SectionCard>
        </>
      ) : session.gameId === "bubble-pop-wall" ? (
        <>
          <SectionCard title="النتائج">
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
              <StatCard label="المراحل المكتملة" value={formatCountOrUnavailable(session.completedStageCount)} tone="positive" ltr />
              <StatCard label="المراحل المتخطاة" value={formatCountOrUnavailable(session.skippedStageCount)} ltr />
              <StatCard
                label="أفضل مرحلة"
                value={session.bestStage ? `${DIFFICULTY_LABELS[session.bestStage.difficulty].name} ${session.bestStage.stageNumber}` : "—"}
              />
              <StatCard label="أهداف صحيحة" value={formatCountOrUnavailable(session.totalTargetsCompleted)} tone="positive" />
              <StatCard label="اختيارات غير صحيحة" value={formatCountOrUnavailable(session.totalIncorrect)} />
              <StatCard label="نسبة الإكمال" value={formatBubblePopCompletionPercent(session.completionRate)} />
              <StatCard label="نسبة الدقة" value={formatBubblePopAccuracyPercent(session.accuracy)} />
              <StatCard label="المدة الإجمالية" value={formatDurationClock(session.durationMs)} />
              <StatCard label="متوسط زمن الاستجابة المسجل" value={formatResponseTimeSeconds(session.averageResponseTimeMs)} />
            </div>
          </SectionCard>

          <SectionCard title="تفاصيل المراحل" className="gap-4">
            {groupByDifficulty(session.stageResults).map((group) => (
              <div key={group.difficulty} className="flex flex-col gap-2">
                <h3 className="text-xs font-bold tracking-wide text-cyan-700 uppercase">{DIFFICULTY_LABELS[group.difficulty].name}</h3>
                <div className="flex flex-col gap-2">
                  {group.stages.map((result, index) => (
                    <BubblePopStageDetailRow key={`${result.difficulty}-${result.stageNumber}-${index}`} result={result} />
                  ))}
                </div>
              </div>
            ))}
          </SectionCard>
        </>
      ) : session.gameId === "feed-the-animals" ? (
        <>
          <SectionCard title="النتائج">
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
              <StatCard label="المراحل المكتملة" value={formatCountOrUnavailable(session.completedStageCount)} tone="positive" ltr />
              <StatCard label="المراحل المتخطاة" value={formatCountOrUnavailable(session.skippedStageCount)} ltr />
              <StatCard
                label="أفضل مرحلة"
                value={session.bestStage ? `${DIFFICULTY_LABELS[session.bestStage.difficulty].name} ${session.bestStage.stageNumber}` : "—"}
              />
              <StatCard label="حيوانات أُطعمت" value={formatCountOrUnavailable(session.totalRoundsCompleted)} tone="positive" />
              <StatCard label="اختيارات غير صحيحة" value={formatCountOrUnavailable(session.totalIncorrect)} />
              <StatCard label="نسبة الإكمال" value={formatFeedAnimalsCompletionPercent(session.completionRate)} />
              <StatCard label="نسبة الدقة" value={formatFeedAnimalsAccuracyPercent(session.accuracy)} />
              <StatCard label="المدة الإجمالية" value={formatDurationClock(session.durationMs)} />
              <StatCard label="متوسط زمن الاستجابة المسجل" value={formatFeedAnimalsResponseTimeSeconds(session.averageResponseTimeMs)} />
            </div>
          </SectionCard>

          <SectionCard title="تفاصيل المراحل" className="gap-4">
            {groupByDifficulty(session.stageResults).map((group) => (
              <div key={group.difficulty} className="flex flex-col gap-2">
                <h3 className="text-xs font-bold tracking-wide text-amber-700 uppercase">{DIFFICULTY_LABELS[group.difficulty].name}</h3>
                <div className="flex flex-col gap-2">
                  {group.stages.map((result, index) => (
                    <FeedAnimalsStageDetailRow key={`${result.difficulty}-${result.stageNumber}-${index}`} result={result} />
                  ))}
                </div>
              </div>
            ))}
          </SectionCard>
        </>
      ) : session.gameId === "color-chase" ? (
        <>
          <SectionCard title="النتائج"><div className="grid grid-cols-3 gap-2.5 sm:gap-3"><StatCard label="المراحل المكتملة" value={formatCountOrUnavailable(session.completedStageCount)} tone="positive" /><StatCard label="أهداف ناجحة" value={formatCountOrUnavailable(session.totalCorrect)} tone="positive" /><StatCard label="اختيارات غير صحيحة" value={formatCountOrUnavailable(session.totalIncorrect)} /><StatCard label="مناطق خطر" value={formatCountOrUnavailable(session.totalDangerPresses)} /><StatCard label="الدقة" value={formatAccuracyPercent(session.accuracy)} /><StatCard label="المدة الإجمالية" value={formatDurationClock(session.durationMs)} /></div></SectionCard>
          <SectionCard title="تفاصيل المراحل" className="gap-4">{groupByDifficulty(session.stageResults).map((group) => <div key={group.difficulty} className="flex flex-col gap-2"><h3 className="text-xs font-bold text-indigo-700">{DIFFICULTY_LABELS[group.difficulty].name}</h3>{group.stages.map((result, index) => <ColorChaseStageDetailRow key={`${result.difficulty}-${result.stageNumber}-${index}`} result={result} />)}</div>)}</SectionCard>
        </>
      ) : session.gameId === "space-pilot" ? (
        <SectionCard title="النتائج">
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            <StatCard label="النجوم المجمّعة" value={formatCountOrUnavailable(session.totalStarsCollected)} tone="positive" ltr />
            <StatCard label="النجوم المعروضة" value={formatCountOrUnavailable(session.totalStarsPresented)} ltr />
            <StatCard label="نسبة جمع النجوم" value={formatCompletionPercent(session.collectionRate)} />
            <StatCard label="مستوى ترقية الصاروخ" value={finiteCount(session.finalUpgradeLevel) === null ? "—" : `${session.finalUpgradeLevel} / 8`} tone="positive" />
            <StatCard label="المرحلة" value={finiteCount(session.completedStageCount) === null ? "—" : session.completedStageCount! > 0 ? "اكتملت الرحلة" : "أُنهيت مبكرًا"} />
            <StatCard label="المدة الإجمالية" value={formatDurationClock(session.durationMs)} />
          </div>
        </SectionCard>
      ) : (
        <>
          <SectionCard title="النتائج">
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
              <StatCard label="المراحل المكتملة" value={formatCountOrUnavailable(session.completedStageCount)} tone="positive" ltr />
              <StatCard label="المراحل المتخطاة" value={formatCountOrUnavailable(session.skippedStageCount)} ltr />
              <StatCard
                label="أفضل مرحلة"
                value={session.bestStage ? `${DIFFICULTY_LABELS[session.bestStage.difficulty].name} ${session.bestStage.stageNumber}` : "—"}
              />
              <StatCard label="أهداف صحيحة" value={formatCountOrUnavailable(session.totalCorrect)} tone="positive" />
              <StatCard label="محاولات خاطئة" value={formatCountOrUnavailable(session.totalIncorrect)} />
              <StatCard label="الدقة الإجمالية" value={formatAccuracyPercent(session.accuracy)} />
              <StatCard label="المدة الإجمالية" value={formatDurationClock(session.durationMs)} />
              <StatCard label="متوسط زمن الاستجابة المسجل" value={formatReactionTimeSeconds(session.averageReactionTimeMs)} />
            </div>
          </SectionCard>

          <SectionCard title="تفاصيل المراحل" className="gap-4">
            {groupByDifficulty(session.stageResults).map((group) => (
              <div key={group.difficulty} className="flex flex-col gap-2">
                <h3 className="text-xs font-bold tracking-wide text-teal-700 uppercase">{DIFFICULTY_LABELS[group.difficulty].name}</h3>
                <div className="flex flex-col gap-2">
                  {group.stages.map((result, index) => (
                    <StageDetailRow key={`${result.difficulty}-${result.stageNumber}-${index}`} result={result} />
                  ))}
                </div>
              </div>
            ))}
          </SectionCard>
        </>
      )}

      <div className="print-hidden grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="min-h-14 touch-manipulation rounded-2xl border-2 border-teal-200 bg-white text-base font-bold text-teal-700 transition-all active:scale-[0.98]"
        >
          🖨️ طباعة التقرير
        </button>
        <button
          type="button"
          onClick={() => router.push(`/control/patients/${patientId}`)}
          className="min-h-14 touch-manipulation rounded-2xl bg-teal-600 text-base font-bold text-white shadow-sm shadow-teal-900/15 transition-all active:scale-[0.98]"
        >
          العودة لملف المريض
        </button>
      </div>
    </div>
  );
}
