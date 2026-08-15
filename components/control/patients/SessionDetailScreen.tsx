"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DIFFICULTY_ORDER, StageStatus, type Difficulty } from "@/lib/game";
import { getGameById } from "@/lib/games/registry";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { getPatient } from "@/lib/patients/patientRepository";
import type { Patient } from "@/lib/patients/types";
import { getSessionHistoryRecord } from "@/lib/sessions/sessionHistoryRepository";
import type { StoredSession, StoredStageResult } from "@/lib/sessions/types";
import { StatCard } from "@/components/control/StatCard";
import { DIFFICULTY_LABELS } from "@/components/control/copy";
import { ControlBreadcrumb, type ControlBreadcrumbItem } from "@/components/control/nav/ControlBreadcrumb";
import { formatAccuracyPercent, formatDurationClock, formatReactionTimeSeconds } from "@/components/display/copy";
import { formatSessionDate, formatSessionTime } from "./formatSessionDate";

/** Groups by difficulty in canonical EASY -> MEDIUM -> ADVANCED order — only the difficulties this session actually played, same convention as SessionSummaryScreen's groupByDifficulty. */
function groupByDifficulty(stageResults: StoredStageResult[]): { difficulty: Difficulty; stages: StoredStageResult[] }[] {
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
          <span className="font-medium text-emerald-600">{result.correct} صحيح</span>
          <span>{result.incorrect} خطأ</span>
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

function buildBreadcrumbItems(patientId: string, patient: Patient | null | undefined, session: StoredSession | null | undefined): ControlBreadcrumbItem[] {
  return [
    { label: "الرئيسية", href: "/control" },
    { label: "المرضى", href: "/control/patients" },
    { label: patient?.firstName ?? "...", href: `/control/patients/${patientId}` },
    { label: session ? `جلسة ${formatSessionDate(session.completedAt)}` : "الجلسة" },
  ];
}

/**
 * SESSION HISTORY TASK — the historical session detail (task section 10):
 * `/control/patients/{patientId}/sessions/{sessionId}`. READ ONLY — this
 * screen only ever calls `get`-style reads (getSessionHistoryRecord,
 * getPatient), never anything that writes/mutates game or session state.
 * Reuses the exact same visual language as the live therapist report
 * (components/control/summary/SessionSummaryScreen.tsx: StatCard grid,
 * stages grouped by difficulty) adapted to StoredSession's field names —
 * the live screen itself is untouched.
 *
 * CONTROL UX POLISH TASK: this page used to be a near dead-end (just a top
 * back arrow). It now has the same breadcrumb pattern as Patient Profile
 * ("المرضى / <name> / جلسة <date>" — task section 17's own example) AND a
 * clear "العودة لملف المريض" button at the bottom, so a therapist who
 * scrolled through a long report never has to scroll back up or guess.
 */
export function SessionDetailScreen({ patientId, sessionId }: { patientId: string; sessionId: string }) {
  return (
    <main
      dir="rtl"
      lang="ar"
      className="fixed inset-0 flex h-dvh w-dvw touch-manipulation flex-col overflow-y-auto bg-slate-50 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] text-slate-900"
      style={{ fontFamily: "var(--font-control), system-ui, sans-serif" }}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 py-8 sm:px-8 sm:py-10">
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
  const [session, setSession] = useState<StoredSession | null | undefined>(undefined);
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

  const groups = groupByDifficulty(session.stageResults);
  const gameName = getGameById(session.gameId)?.nameAr ?? session.gameId;

  return (
    <>
      {breadcrumb}

      <header className="flex flex-col items-center gap-1.5 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">ملخص الجلسة</h1>
        <p className="text-lg font-semibold text-teal-700">{patient?.firstName ?? "—"}</p>
        <p className="text-sm text-slate-400">{gameName}</p>
        <p className="text-xs text-slate-400">
          {formatSessionDate(session.completedAt)} — {formatSessionTime(session.completedAt)}
        </p>
      </header>

      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        <StatCard label="المراحل المكتملة" value={String(session.completedStageCount)} tone="positive" ltr />
        <StatCard label="المراحل المتخطاة" value={String(session.skippedStageCount)} ltr />
        <StatCard
          label="أفضل مرحلة"
          value={session.bestStage ? `${DIFFICULTY_LABELS[session.bestStage.difficulty].name} ${session.bestStage.stageNumber}` : "—"}
        />
        <StatCard label="أهداف صحيحة" value={String(session.totalCorrect)} tone="positive" />
        <StatCard label="محاولات خاطئة" value={String(session.totalIncorrect)} />
        <StatCard label="الدقة الإجمالية" value={formatAccuracyPercent(session.accuracy)} />
        <StatCard label="المدة الإجمالية" value={formatDurationClock(session.durationMs)} />
        <StatCard label="متوسط زمن الاستجابة المسجل" value={formatReactionTimeSeconds(session.averageReactionTimeMs)} />
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-slate-700">تفاصيل المراحل</h2>
        {groups.map((group) => (
          <div key={group.difficulty} className="flex flex-col gap-2">
            <h3 className="text-xs font-bold tracking-wide text-teal-700 uppercase">{DIFFICULTY_LABELS[group.difficulty].name}</h3>
            <div className="flex flex-col gap-2">
              {group.stages.map((result) => (
                <StageDetailRow key={`${result.difficulty}-${result.stageNumber}`} result={result} />
              ))}
            </div>
          </div>
        ))}
      </section>

      <button
        type="button"
        onClick={() => router.push(`/control/patients/${patientId}`)}
        className="min-h-14 touch-manipulation rounded-2xl bg-teal-600 text-base font-bold text-white shadow-sm shadow-teal-900/15 transition-all active:scale-[0.98]"
      >
        العودة لملف المريض
      </button>
    </>
  );
}
