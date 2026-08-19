import { getGameById } from "@/lib/games/registry";
import type { AnyStoredSession } from "@/lib/sessions/types";
import { StatCard } from "@/components/control/StatCard";
import { formatRelativeArabic, formatSessionDate } from "./formatSessionDate";

/**
 * SESSION HISTORY TASK — Patient Profile's compact overview strip: عدد
 * الجلسات / آخر جلسة / آخر نشاط (task section 7). `sessions` is expected
 * already sorted newest-first (see subscribeToPatientSessions) and non-
 * empty — the caller renders the "لا توجد جلسات مسجلة حتى الآن" empty state
 * instead of this component when there's nothing yet.
 */
export function PatientSessionOverview({ sessions }: { sessions: AnyStoredSession[] }) {
  const mostRecent = sessions[0];
  const gamesPlayed = Array.from(new Set(sessions.map((s) => s.gameId)))
    .map((id) => getGameById(id)?.nameAr)
    .filter((name): name is string => Boolean(name));

  return (
    <section className="flex flex-col gap-2.5">
      <div className="grid grid-cols-3 gap-2.5">
        <StatCard label="عدد الجلسات" value={String(sessions.length)} ltr />
        <StatCard label="آخر جلسة" value={formatSessionDate(mostRecent.completedAt)} />
        <StatCard label="آخر نشاط" value={formatRelativeArabic(mostRecent.completedAt)} />
      </div>
      {gamesPlayed.length > 0 && (
        <p className="text-center text-xs text-slate-400">
          الأنشطة التي لعبها: <span className="font-medium text-slate-600">{gamesPlayed.join("، ")}</span>
        </p>
      )}
    </section>
  );
}
