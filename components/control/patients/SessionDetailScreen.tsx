"use client";
import { MODE_LABELS } from "@/lib/bloomingworld3d/copy";
import { isRingHistory, isNineStageHistory } from '@/lib/spacepilot3d/history';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { DIFFICULTY_ORDER, StageStatus, type Difficulty } from "@/lib/game";
import { buildSessionInsights } from "@/lib/analytics/patientAnalytics";
import { getHistoricalGameNameAr } from "@/lib/sessions/historicalGames";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { getPatient } from "@/lib/patients/patientRepository";
import type { Patient } from "@/lib/patients/types";
import { getSessionHistoryRecord } from "@/lib/sessions/sessionHistoryRepository";
import type { AnyStoredSession, StoredBubblePopStageResult, StoredColorChaseStageResult, StoredFeedAnimalsStageResult, StoredFootstepsStageResult, StoredRunnerQuestStageResult, StoredStageResult } from "@/lib/sessions/types";
import { StatCard } from "@/components/control/StatCard";
import { SectionCard } from "@/components/control/ui/SectionCard";
import { DIFFICULTY_LABELS } from "@/components/control/copy";
import { formatCompletionPercent, formatStepTimeSeconds } from "@/components/control/footsteps/copy";
import { formatAccuracyPercent as formatBubblePopAccuracyPercent, formatCompletionPercent as formatBubblePopCompletionPercent, formatResponseTimeSeconds } from "@/components/control/bubblepop/copy";
import {
  formatAccuracyPercent as formatFeedAnimalsAccuracyPercent,
  formatCompletionPercent as formatFeedAnimalsCompletionPercent,
  formatResponseTimeSeconds as formatFeedAnimalsResponseTimeSeconds,
} from "@/lib/sessions/retiredFeedAnimals";
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
          <span>{formatCountOrUnavailable(result.incorrect)} {result.engine === "bq3" ? "لمسة ببالون بلون آخر" : "خطأ"}</span>
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
  if (result.engine === "dome3") return <div className="rounded-2xl border border-slate-200 px-4 py-3 text-sm">المرحلة {result.stageNumber} · {result.targetsCompleted} / {result.targetsPresented} أهداف · {result.status === StageStatus.COMPLETED ? "مكتملة" : "غير مكتملة"}</div>;

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

/** MULTI-GAME PLATFORM — Feed the Animals' own historical stage row: rounds completed/presented, incorrect count, completion rate, duration, average response time, status. Genuinely has both a completion metric AND an incorrect count. Read-only compatibility for discontinued sessions. */
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

/** Runner Quest 3D's own stage row: stars, waiting stops and therapist assists. No accuracy and no "wrong" count exist for this game. */
function RunnerQuestStageDetailRow({ result }: { result: StoredRunnerQuestStageResult }) {
  const isSkipped = result.status === StageStatus.SKIPPED;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <span className="text-sm font-semibold text-slate-800">المرحلة {result.stageNumber}</span>
      {isSkipped ? (
        <span className="text-xs font-semibold text-slate-400">— تم التخطي</span>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="font-medium text-amber-600">★ {formatCountOrUnavailable(result.stars)}</span>
          <span>{formatCountOrUnavailable(result.obstaclesResolved)} / {formatCountOrUnavailable(result.obstaclesTotal)} عائق</span>
          <span>وقفات: {formatCountOrUnavailable(result.holds)}</span>
          <span>مساعدات: {formatCountOrUnavailable(result.assists)}</span>
          <span dir="ltr" className="font-mono">{formatDurationClock(result.durationMs)}</span>
        </div>
      )}
    </div>
  );
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

  const gameName = getHistoricalGameNameAr(session.gameId);
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
      ) : session.gameId === "bubble-pop-wall" && session.engine === "dome3" ? (
        <><SectionCard title="قبة العجائب — المشاركة"><div className="grid grid-cols-3 gap-3"><StatCard label="أهداف مكتملة" value={String(session.objectivesCompleted)} /><StatCard label="بمساعدة" value={String(session.assistedObjectives)} /><StatCard label="تكرارات" value={String(session.repeatedObjectives)} /><StatCard label="مراحل مكتملة" value={`${session.completedStageCount} / 9`} /><StatCard label="الجلسة" value={session.sessionCompleted ? "مكتملة" : "انتهت مبكرًا"} /></div></SectionCard><SectionCard title="تفاصيل المراحل">{session.stageResults.map((r,i)=><BubblePopStageDetailRow key={i} result={r}/>)}</SectionCard></>
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
      ) : session.gameId === "runner-quest-3d" ? (
        <>
          <SectionCard title="النتائج">
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
              <StatCard label="المراحل المكتملة" value={formatCountOrUnavailable(session.completedStageCount)} tone="positive" ltr />
              <StatCard label="المراحل المتخطاة" value={formatCountOrUnavailable(session.skippedStageCount)} ltr />
              <StatCard label="النجوم" value={formatCountOrUnavailable(session.totalStars)} tone="positive" />
              <StatCard label="العوائق" value={`${formatCountOrUnavailable(session.totalObstaclesResolved)} / ${formatCountOrUnavailable(session.totalObstaclesPresented)}`} ltr />
              <StatCard label="وقفات انتظار" value={formatCountOrUnavailable(session.totalHolds)} />
              <StatCard label="مساعدات المعالج" value={formatCountOrUnavailable(session.totalAssists)} />
              <StatCard label="المدة الإجمالية" value={formatDurationClock(session.durationMs)} />
              <StatCard label="مصدر الإدخال" value={session.inputSource ?? "—"} />
            </div>
            <p className="pt-2 text-xs text-slate-500">لا توجد دقة أو أخطاء في هذه اللعبة: وقفة الانتظار تعني أن العدّاء انتظر الطفل أمام عائق، وليست خطأً.</p>
          </SectionCard>
          <SectionCard title="تفاصيل المراحل" className="gap-4">
            {groupByDifficulty(session.stageResults).map((group) => (
              <div key={group.difficulty} className="flex flex-col gap-2">
                <h3 className="text-xs font-bold tracking-wide text-teal-700 uppercase">{DIFFICULTY_LABELS[group.difficulty].name}</h3>
                {group.stages.map((result, index) => <RunnerQuestStageDetailRow key={`${result.difficulty}-${result.stageNumber}-${index}`} result={result} />)}
              </div>
            ))}
          </SectionCard>
        </>
      ) : session.gameId === "harvest-valley-3d" ? (
        <SectionCard title="نتائج موسم الحصاد"><p>{session.harvestedCells} خلايا محصودة من {session.requiredCoverage} هدفًا · {session.assistedActions} بمساعدة · {session.skippedObjectives} أهداف متخطاة</p><p className="text-xs text-slate-500">نتائج نشاط غير سريرية. قيادة المعالج والتوجيه الآلي مسجّلان كمساعدة.</p>{session.stageResults.map(row=><div key={row.stageIndex}>المستوى {Math.floor(row.stageIndex/3)+1} · المرحلة {row.stageNumber}: {row.harvestedCells} / {row.requiredCoverage} خلايا · {row.assistedActions} بمساعدة · {row.status==='COMPLETED'?'مكتملة':row.status==='SKIPPED'?'تم التخطي':'مشاركة جزئية'}</div>)}</SectionCard>
      ) : session.gameId === "blooming-world-3d" ? (
        <SectionCard title="حديقتك المزهرة"><p>{session.restoredRegions} مناطق مزهرة · {session.assistedRegions} بمساعدة · {session.selectedProjection==='WALL'?'جدار':'أرضية'} · {MODE_LABELS[session.participationMode]}</p>{session.stageResults.map(row=><div key={row.stageIndex}>المستوى {Math.floor(row.stageIndex/3)+1} · المرحلة {row.stageNumber}: {row.restoredRegions} مناطق · {row.status==='COMPLETED'?'مكتملة':row.status==='SKIPPED'?'تم التخطي':'مشاركة جزئية'}</div>)}</SectionCard>
      ) : session.gameId === "pearl-voyage-3d" ? (
        <>
          <SectionCard title="نتائج قارب اللؤلؤ"><div className="grid grid-cols-3 gap-3">
            <StatCard label="مراحل مكتملة" value={formatCountOrUnavailable(session.completedStageCount)} tone="positive" />
            <StatCard label="أسماك مكتشفة" value={formatCountOrUnavailable(session.fishDiscovered)} tone="positive" />
            <StatCard label="اكتشافات بمساعدة" value={formatCountOrUnavailable(session.assistedEncounters)} />
            <StatCard label="اكتشافات دون مساعدة" value={formatCountOrUnavailable(session.independentEncounters)} />
            <StatCard label="اكتشافات متخطاة" value={formatCountOrUnavailable(session.skippedEncounters)} />
            <StatCard label="مدة اللعب" value={formatDurationClock(session.durationMs)} />
          </div><p className="text-xs text-slate-500">طريقة المشاركة: {({ MANUAL: "تحكم يدوي من المعالج", WHEEL: "مقود", PEDAL: "دواسة", WHEEL_PEDAL: "مقود ودواسة", MIXED: "مزيج" } as const)[session.participationMode]}. التحكم اليدوي والمساعدة الآلية مسجّلان كمساعدة؛ لا توجد نتيجة سريرية.</p></SectionCard>
          <SectionCard title="تفاصيل المراحل">{session.stageResults.map(row => <div key={row.stageIndex} className="flex justify-between gap-3 py-2 text-sm"><span>{DIFFICULTY_LABELS[row.difficulty].name} · المرحلة {row.stageNumber}</span><span>{row.fishDiscovered} أسماك · {row.assistedEncounters} بمساعدة · {row.skippedEncounters} متخطاة</span></div>)}</SectionCard>
        </>
      ) : session.gameId === "fire-rescue-3d" ? (
        <>
          <SectionCard title="نتائج مهمة الإطفاء"><div className="grid grid-cols-3 gap-3">
            <StatCard label="مراحل مكتملة" value={formatCountOrUnavailable(session.completedStageCount)} tone="positive" />
            <StatCard label="أهداف قيادة" value={formatCountOrUnavailable(session.drivingObjectives)} />
            <StatCard label="مناطق أُطفئت" value={formatCountOrUnavailable(session.fireTargetsExtinguished)} />
            <StatCard label="أهداف بمساعدة" value={formatCountOrUnavailable(session.assistedObjectives)} />
            <StatCard label="أهداف متخطاة" value={formatCountOrUnavailable(session.skippedObjectives)} />
            <StatCard label="مدة اللعب" value={formatDurationClock(session.durationMs)} />
          </div><p className="text-xs text-slate-500">التحكم اليدوي والمساعدة الآلية مسجّلان كمساعدة؛ لا توجد نتيجة سريرية.</p></SectionCard>
          <SectionCard title="تفاصيل المراحل">{session.stageResults.map(row => <div key={row.stageIndex} className="flex justify-between gap-3 py-2 text-sm"><span>{DIFFICULTY_LABELS[row.difficulty].name} · المرحلة {row.stageNumber}</span><span>{row.drivingObjectives} قيادة · {row.fireTargetsExtinguished} إطفاء · {row.assistedObjectives} بمساعدة</span></div>)}</SectionCard>
        </>
      ) : session.gameId === "turn-and-go-3d" ? (
        <>
          <SectionCard title="نتائج تحدي الدوران"><div className="grid grid-cols-3 gap-3">
            <StatCard label="المراحل المكتملة" value={formatCountOrUnavailable(session.completedStageCount)} tone="positive" />
            <StatCard label="نجوم مؤكدة" value={formatCountOrUnavailable(session.confirmedCheckpoints + session.assistedCheckpoints)} tone="positive" />
            <StatCard label="بمساعدة المعالج" value={formatCountOrUnavailable(session.assistedCheckpoints)} />
            <StatCard label="نجوم متخطاة" value={formatCountOrUnavailable(session.skippedCheckpoints)} />
            <StatCard label="وقفات مكتملة" value={formatCountOrUnavailable(session.stopHoldsCompleted)} />
            <StatCard label="خروج عن المسار (بتأكيد المعالج)" value={formatCountOrUnavailable(session.routeDeviations)} />
            <StatCard label="لمس مخروط (بتأكيد المعالج)" value={formatCountOrUnavailable(session.coneTouches)} />
            <StatCard label="إعادات" value={formatCountOrUnavailable(session.repeats)} />
            <StatCard label="وقت اللعب الفعلي" value={formatDurationClock(session.activeTimeMs)} />
            <StatCard label="مدة الجلسة" value={formatDurationClock(session.durationMs)} />
          </div><p className="text-xs text-slate-500">عدد الأقماع: {session.settings.coneCount}{session.settings.customLayout ? " · تخطيط عدّله المعالج" : ""} · وقفة التوقف {Math.round(session.settings.stopMs / 100) / 10} ث · كل الأرقام أعداد أحداث لعب أكّدها المعالج؛ لا توجد نتيجة سريرية، والنجوم ليست تقييمًا.</p></SectionCard>
          <SectionCard title="تفاصيل المراحل">{session.stageResults.map((row, index) => <div key={index} className="flex justify-between gap-3 py-2 text-sm"><span>{DIFFICULTY_LABELS[row.difficulty].name} · المرحلة {row.stageNumber}</span><span>{row.confirmed + row.assisted} من {row.total} نجوم · {row.assisted} بمساعدة · {row.coneCount} أقماع · {row.status === StageStatus.COMPLETED ? "مكتملة" : "متخطاة"}</span></div>)}</SectionCard>
        </>
      ) : session.gameId === "safe-hex-arena-3d" ? (
        <>
          <SectionCard title="نتائج الأرض الآمنة"><div className="grid grid-cols-3 gap-3">
            <StatCard label="المراحل المكتملة" value={formatCountOrUnavailable(session.completedStageCount)} tone="positive" />
            <StatCard label="الجولات المكتملة" value={formatCountOrUnavailable(session.totalRoundsCompleted)} tone="positive" />
            <StatCard label="انتقالات آمنة مؤكدة" value={formatCountOrUnavailable(session.totalSafeTransitions)} tone="positive" />
            <StatCard label="بمساعدة المعالج" value={formatCountOrUnavailable(session.totalAssists)} />
            <StatCard label="مدة الجلسة" value={formatDurationClock(session.durationMs)} />
          </div></SectionCard>
          <SectionCard title="تفاصيل المراحل">{session.stageResults.map((row, index) => <div key={index} className="flex justify-between gap-3 py-2 text-sm"><span>{DIFFICULTY_LABELS[row.difficulty].name} · المرحلة {row.stageNumber}</span><span>{row.roundsCompleted} من {row.rounds} جولات · {row.assists} بمساعدة · {row.status === StageStatus.COMPLETED ? "مكتملة" : "متخطاة"}</span></div>)}</SectionCard>
        </>
      ) : session.gameId === "mirror-quest-3d" ? (
        <>
          <SectionCard title="نتائج المرآة السحرية"><div className="grid grid-cols-3 gap-3">
            <StatCard label="المراحل المكتملة" value={formatCountOrUnavailable(session.completedStageCount)} tone="positive" />
            <StatCard label="الحركات المقبولة" value={formatCountOrUnavailable(session.totalPoses)} tone="positive" />
            <StatCard label="بمساعدة المعالج" value={formatCountOrUnavailable(session.totalAssists)} />
            <StatCard label="مدة الجلسة" value={formatDurationClock(session.durationMs)} />
          </div></SectionCard>
          <SectionCard title="تفاصيل المراحل">{session.stageResults.map((row,index)=><div key={index} className="flex justify-between gap-3 py-2 text-sm"><span>{DIFFICULTY_LABELS[row.difficulty].name} · المرحلة {row.stageNumber}</span><span>{row.poses} حركة · {row.assists} بمساعدة</span></div>)}</SectionCard>
        </>
      ) : session.gameId === "build-quest-3d" ? (
        <>
          <SectionCard title="نتائج عالم البناء">
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="المباني المكتملة" value={formatCountOrUnavailable(session.completedStageCount)} tone="positive" />
              <StatCard label="المراحل المتخطاة" value={formatCountOrUnavailable(session.skippedStageCount)} />
              <StatCard label="القطع الموضوعة" value={formatCountOrUnavailable(session.totalPiecesPlaced)} tone="positive" />
              <StatCard label="مدة الجلسة" value={formatDurationClock(session.durationMs)} />
            </div>
          </SectionCard>
          <SectionCard title="تفاصيل مراحل البناء">
            {session.stageResults.map(row => <div key={row.stageId} className="flex justify-between gap-3 py-2 text-sm">
              <span>{DIFFICULTY_LABELS[row.difficulty].name} · المرحلة {row.stageNumber}</span>
              <span>{row.status === StageStatus.COMPLETED ? "مكتملة" : "متخطاة"} · {row.piecesPlaced} قطعة</span>
            </div>)}
          </SectionCard>
        </>
      ) : session.gameId === "color-chase" && "engine" in session && session.engine === "cc3-garden" ? (
        <><SectionCard title="مطاردة الألوان — عالم الألوان المفقودة"><div className="grid grid-cols-3 gap-3"><StatCard label="أهداف مكتملة" value={String(session.objectivesCompleted)} /><StatCard label="بمساعدة" value={String(session.assistedObjectives)} /><StatCard label="تكرارات" value={String(session.repeatedObjectives)} /><StatCard label="مراحل مكتملة" value={`${session.completedStageCount} / 9`} /><StatCard label="الجلسة" value={session.sessionCompleted ? "مكتملة" : "انتهت مبكرًا"} /></div></SectionCard><SectionCard title="تفاصيل المراحل">{session.stageResults.map((r, i) => <div key={i} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm">المستوى {r.difficulty === "EASY" ? 1 : r.difficulty === "MEDIUM" ? 2 : 3} · المرحلة {r.stageNumber} · {r.objectivesCompleted} / {r.objectivesPresented} أهداف · {r.status === StageStatus.COMPLETED ? "مكتملة" : "غير مكتملة"}</div>)}</SectionCard></>
      ) : session.gameId === "color-chase" ? (
        <>
          <SectionCard title="النتائج"><div className="grid grid-cols-3 gap-2.5 sm:gap-3"><StatCard label="المراحل المكتملة" value={formatCountOrUnavailable(session.completedStageCount)} tone="positive" /><StatCard label="أهداف ناجحة" value={formatCountOrUnavailable(session.totalCorrect)} tone="positive" /><StatCard label="اختيارات غير صحيحة" value={formatCountOrUnavailable(session.totalIncorrect)} /><StatCard label="مناطق خطر" value={formatCountOrUnavailable(session.totalDangerPresses)} /><StatCard label="الدقة" value={formatAccuracyPercent(session.accuracy)} /><StatCard label="المدة الإجمالية" value={formatDurationClock(session.durationMs)} /></div></SectionCard>
          <SectionCard title="تفاصيل المراحل" className="gap-4">{groupByDifficulty(session.stageResults).map((group) => <div key={group.difficulty} className="flex flex-col gap-2"><h3 className="text-xs font-bold text-indigo-700">{DIFFICULTY_LABELS[group.difficulty].name}</h3>{group.stages.map((result, index) => <ColorChaseStageDetailRow key={`${result.difficulty}-${result.stageNumber}-${index}`} result={result} />)}</div>)}</SectionCard>
        </>
      ) : session.gameId === "space-pilot" ? (
        <SectionCard title="النتائج">
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            <StatCard label={isRingHistory(session) ? "الحلقات المجمعة" : "النجوم المجمّعة"} value={formatCountOrUnavailable(isRingHistory(session) ? session.totalRingsCollected : session.totalStarsCollected)} tone="positive" ltr />
            <StatCard label={isRingHistory(session) ? "الحلقات المعروضة" : "النجوم المعروضة"} value={formatCountOrUnavailable(isRingHistory(session) ? session.totalRingsPresented : session.totalStarsPresented)} ltr />
            <StatCard label={isRingHistory(session) ? "نسبة جمع الحلقات" : "نسبة جمع النجوم"} value={formatCompletionPercent(session.collectionRate)} />
            <StatCard label="مستوى ترقية الصاروخ" value={finiteCount(session.finalUpgradeLevel) === null ? "—" : `${session.finalUpgradeLevel} / ${isRingHistory(session) ? 3 : 8}`} tone="positive" />
            <StatCard label="المرحلة" value={isNineStageHistory(session)?`${session.completedStageCount} مكتملة · ${session.skippedStageCount} متخطاة من ٩`:finiteCount(session.completedStageCount) === null ? "—" : session.completedStageCount! > 0 ? "اكتملت الرحلة" : "أُنهيت مبكرًا"} />
            <StatCard label="المدة الإجمالية" value={formatDurationClock(session.durationMs)} />
            {isNineStageHistory(session)&&<StatCard label="مراحل بمساعدة" value={String(session.assistedStageCount)} />}
          </div>
          {isNineStageHistory(session)&&<ol className="grid gap-2 sm:grid-cols-3">{Object.values(session.stageResults).map(r=><li key={r.stageIndex}>المستوى {Math.floor(r.stageIndex/3)+1} · المرحلة {r.stageIndex%3+1} · {r.status==='skipped'?'متخطاة':r.assisted?'اكتملت بمساعدة':'اكتملت'} · {r.ringsCollected} حلقات</li>)}</ol>}
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
