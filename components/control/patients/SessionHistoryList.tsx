import type { AnyStoredSession } from "@/lib/sessions/types";
import { SessionHistoryRow } from "./SessionHistoryRow";

/** SESSION HISTORY TASK — `sessions` must already be newest-first (see subscribeToPatientSessions) — this component only lays the rows out. MULTI-GAME PLATFORM: renders every game's sessions in one combined, newest-first list — see SessionHistoryRow's own per-game branching. */
export function SessionHistoryList({ patientId, sessions }: { patientId: string; sessions: AnyStoredSession[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-slate-700">الجلسات السابقة</h2>
      <div className="flex flex-col gap-2.5">
        {sessions.map((session) => (
          <SessionHistoryRow key={session.sessionId} patientId={patientId} session={session} />
        ))}
      </div>
    </section>
  );
}
