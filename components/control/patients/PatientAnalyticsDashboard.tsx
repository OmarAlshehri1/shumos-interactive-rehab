"use client";

import { useMemo, useState } from "react";
import { buildPatientAnalytics, type AnalyticsWindow, type MetricValue, type TrendPoint } from "@/lib/analytics/patientAnalytics";
import type { AnyStoredSession } from "@/lib/sessions/types";
import { SectionCard } from "@/components/control/ui/SectionCard";

const WINDOW_LABELS: Record<AnalyticsWindow, string> = { "7d": "آخر 7 أيام", "30d": "آخر 30 يوم", all: "كل الوقت" };
const DIFFICULTY_LABELS = ["سهل", "متوسط", "متقدم"];

function formatMetric(item: MetricValue): string {
  if (!Number.isFinite(item.value)) return "—";
  if (item.format === "percent") return `${Math.round(item.value * 100)}٪`;
  if (item.format === "duration") {
    const minutes = Math.floor(item.value / 60_000);
    const seconds = Math.floor((item.value % 60_000) / 1000);
    return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, "0")}` : `${seconds}ث`;
  }
  if (item.format === "milliseconds") return `${(item.value / 1000).toFixed(1)}ث`;
  return String(Math.round(item.value));
}

export function PatientAnalyticsDashboard({ patientId, sessions }: { patientId: string; sessions: AnyStoredSession[] }) {
  const [window, setWindow] = useState<AnalyticsWindow>("all");
  const analytics = useMemo(() => buildPatientAnalytics(sessions, patientId, window), [sessions, patientId, window]);

  return (
    <section className="flex flex-col gap-5" aria-labelledby="patient-analytics-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="patient-analytics-title" className="text-xl font-black text-slate-900">تحليل التقدم</h2>
          <p className="mt-1 text-sm text-slate-500">بيانات موضوعية من الجلسات المسجلة فقط</p>
        </div>
        <div className="grid grid-cols-3 rounded-xl bg-slate-200/70 p-1">
          {(Object.keys(WINDOW_LABELS) as AnalyticsWindow[]).map((value) => (
            <button key={value} type="button" onClick={() => setWindow(value)} className={`min-h-9 rounded-lg px-2 text-xs font-bold ${window === value ? "bg-white text-teal-700 shadow-sm" : "text-slate-500"}`}>{WINDOW_LABELS[value]}</button>
          ))}
        </div>
      </div>

      {analytics.totalSessions === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-400">لا توجد جلسات في هذه الفترة.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard label="إجمالي الجلسات" value={String(analytics.totalSessions)} />
            {analytics.totalActivePlayTimeMs !== null && <MetricCard label="وقت اللعب النشط المسجل" value={formatMetric({ key: "duration", label: "", value: analytics.totalActivePlayTimeMs, format: "duration" })} />}
            <MetricCard label="المراحل المكتملة" value={analytics.completedStages === null ? "—" : String(analytics.completedStages)} />
            {analytics.completionRate !== null && <MetricCard label="نسبة إكمال المحاولات" value={`${Math.round(analytics.completionRate * 100)}٪`} />}
            {analytics.averageStageDurationMs !== null && <MetricCard label="متوسط مدة المرحلة" value={formatMetric({ key: "stageDuration", label: "", value: analytics.averageStageDurationMs, format: "duration" })} />}
          </div>

          <SectionCard title="ملخص التقدم">
            <ul className="flex flex-col gap-2">
              {analytics.insights.map((insight) => <li key={insight} className="rounded-xl bg-teal-50 px-4 py-3 text-sm font-medium leading-6 text-teal-950">{insight}</li>)}
              {!analytics.hasTrendData && <li className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">نحتاج جلسات إضافية لعرض اتجاه التقدم.</li>}
            </ul>
          </SectionCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="الجلسات حسب اللعبة"><GameDistribution rows={analytics.sessionsByGame} /></SectionCard>
            <SectionCard title="المستوى في الجلسات"><DifficultyDistribution rows={analytics.sessionsByDifficulty.map((row) => ({ label: DIFFICULTY_LABELS[row.difficulty === "EASY" ? 0 : row.difficulty === "MEDIUM" ? 1 : 2], count: row.count }))} /></SectionCard>
          </div>

          {analytics.hasTrendData && <SectionCard title={`اتجاه الأداء — ${analytics.trendGameLabel}`}><TrendChart points={analytics.trendPoints} /></SectionCard>}

          <div className="grid gap-4 lg:grid-cols-2">
            {analytics.perGame.map((game) => (
              <SectionCard key={game.gameId} title={game.gameNameAr}>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {game.metrics.map((item) => <MetricCard key={item.key} label={item.label} value={formatMetric(item)} compact />)}
                </div>
              </SectionCard>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function MetricCard({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white text-center shadow-sm ${compact ? "p-3" : "p-4"}`}><div className={`${compact ? "text-xl" : "text-2xl"} font-black text-slate-900`} dir="ltr">{value}</div><div className="mt-1 text-xs font-medium text-slate-500">{label}</div></div>;
}

function GameDistribution({ rows }: { rows: Array<{ label: string; count: number }> }) {
  const safeRows = rows.filter((row) => Number.isFinite(row.count) && row.count >= 0);
  const max = safeRows.length ? Math.max(1, ...safeRows.map((row) => row.count)) : 1;
  return <div className="flex flex-col gap-3">{safeRows.map((row) => <div key={row.label} className="grid grid-cols-[minmax(7rem,1fr)_3fr_2rem] items-center gap-2 text-xs"><span className="font-semibold text-slate-700">{row.label}</span><span className="h-2.5 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-teal-500" style={{ width: `${row.count / max * 100}%` }} /></span><strong className="text-center text-slate-700">{row.count}</strong></div>)}</div>;
}

function DifficultyDistribution({ rows }: { rows: Array<{ label: string; count: number }> }) {
  return <GameDistribution rows={rows} />;
}

function TrendChart({ points }: { points: TrendPoint[] }) {
  const accuracy = points.filter((point) => point.accuracy !== null && Number.isFinite(point.accuracy));
  const response = points.filter((point) => point.responseTimeMs !== null && Number.isFinite(point.responseTimeMs));
  return (
    <div className="flex flex-col gap-5">
      {accuracy.length >= 2 && <MiniLineChart title="الدقة عبر الجلسات" values={accuracy.map((point) => point.accuracy! * 100)} suffix="٪" lowerIsBetter={false} />}
      {response.length >= 2 && <MiniLineChart title="زمن الاستجابة عبر الجلسات" values={response.map((point) => point.responseTimeMs! / 1000)} suffix="ث" lowerIsBetter />}
      <div className="flex flex-wrap gap-2 text-xs text-slate-500">{points.slice(-8).map((point) => <span key={point.sessionId} className="rounded-full bg-slate-100 px-2.5 py-1">{DIFFICULTY_LABELS[point.difficultyRank]}</span>)}</div>
    </div>
  );
}

function MiniLineChart({ title, values, suffix, lowerIsBetter }: { title: string; values: number[]; suffix: string; lowerIsBetter: boolean }) {
  const safeValues = values.filter(Number.isFinite);
  if (safeValues.length < 2) return null;
  const min = Math.min(...safeValues);
  const max = Math.max(...safeValues);
  const range = Math.max(1, max - min);
  const points = safeValues.map((value, index) => `${index / (safeValues.length - 1) * 100},${90 - (value - min) / range * 70}`).join(" ");
  return <div><div className="mb-2 flex items-center justify-between text-xs"><span className="font-bold text-slate-700">{title}</span><span className="text-slate-400">{lowerIsBetter ? "الأقل أسرع" : "نسبة اللعب المسجلة"}</span></div><svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-28 w-full overflow-visible rounded-xl bg-slate-50 p-2" role="img" aria-label={title}><polyline points={points} fill="none" stroke="#0d9488" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" /></svg><div className="mt-1 flex justify-between text-[11px] text-slate-400" dir="ltr"><span>{safeValues[0].toFixed(1)}{suffix}</span><span>{safeValues.at(-1)!.toFixed(1)}{suffix}</span></div></div>;
}
