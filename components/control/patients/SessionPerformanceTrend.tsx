import { DIFFICULTY_ORDER, type Difficulty, type StageNumber } from "@/lib/game";
import type { StoredSession } from "@/lib/sessions/types";
import { StatCard } from "@/components/control/StatCard";
import { DIFFICULTY_LABELS } from "@/components/control/copy";
import { formatAccuracyPercent, formatDurationClock, formatReactionTimeSeconds } from "@/components/display/copy";

const RECENT_TREND_COUNT = 5;
const BAR_MIN_HEIGHT_PX = 8;
const BAR_MAX_HEIGHT_PX = 64;

function highestStageReached(sessions: StoredSession[]): { difficulty: Difficulty; stageNumber: StageNumber } | null {
  let best: { difficulty: Difficulty; stageNumber: StageNumber } | null = null;
  for (const session of sessions) {
    const candidate = { difficulty: session.endingDifficulty, stageNumber: session.endingStage };
    if (!best) {
      best = candidate;
      continue;
    }
    const bestRank = DIFFICULTY_ORDER.indexOf(best.difficulty);
    const candidateRank = DIFFICULTY_ORDER.indexOf(candidate.difficulty);
    if (candidateRank > bestRank || (candidateRank === bestRank && candidate.stageNumber > best.stageNumber)) {
      best = candidate;
    }
  }
  return best;
}

/**
 * SESSION HISTORY TASK — "أداء الجلسات" (task sections 12-13): restrained
 * GAME-performance comparisons only — accuracy trend, average duration,
 * average recorded response time, highest stage reached, sessions
 * completed. Deliberately never claims "تحسن طبي/تطور علاجي/تحسن الحركة" —
 * see the task's explicit list of what NOT to claim, since none of that is
 * actually measured here.
 *
 * The trend itself is plain CSS bars (no chart library) over the last
 * {@link RECENT_TREND_COUNT} Balloon Quest sessions, oldest -> newest —
 * `dir="ltr"` on just that row so the bars read left-to-right the same way
 * the task's own "78% → 84% → 91%" example does, nested inside the page's
 * normal RTL flow.
 */
export function SessionPerformanceTrend({ sessions }: { sessions: StoredSession[] }) {
  const recentChronological = sessions.slice(0, RECENT_TREND_COUNT).slice().reverse();
  const best = highestStageReached(sessions);
  const avgDurationMs = sessions.reduce((sum, s) => sum + s.durationMs, 0) / sessions.length;
  const reactionSamples = sessions.map((s) => s.averageReactionTimeMs).filter((ms): ms is number => ms !== null);
  const avgReactionMs = reactionSamples.length > 0 ? reactionSamples.reduce((a, b) => a + b, 0) / reactionSamples.length : null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-slate-700">أداء الجلسات</h2>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard label="الجلسات المكتملة" value={String(sessions.length)} ltr />
        <StatCard label="أعلى مرحلة" value={best ? `${DIFFICULTY_LABELS[best.difficulty].name} ${best.stageNumber}` : "—"} />
        <StatCard label="متوسط المدة" value={formatDurationClock(avgDurationMs)} ltr />
        <StatCard label="متوسط زمن الاستجابة" value={formatReactionTimeSeconds(avgReactionMs)} />
      </div>

      {recentChronological.length >= 2 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4">
          <span className="text-xs font-medium text-slate-400">الدقة — آخر {recentChronological.length} جلسات</span>
          <div dir="ltr" className="flex items-end justify-center gap-4 pt-2">
            {recentChronological.map((session) => (
              <div key={session.sessionId} className="flex flex-col items-center gap-1.5">
                <span className="text-xs font-bold text-slate-700">{formatAccuracyPercent(session.accuracy)}</span>
                <div
                  className="w-6 rounded-full bg-teal-500"
                  style={{ height: `${Math.round(BAR_MIN_HEIGHT_PX + session.accuracy * (BAR_MAX_HEIGHT_PX - BAR_MIN_HEIGHT_PX))}px` }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
