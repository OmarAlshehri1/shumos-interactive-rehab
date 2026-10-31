import type { AnyStoredSession } from "@/lib/sessions/types";
import { SessionHistoryRow } from "./SessionHistoryRow";
import styles from "./history.module.css";

/** SESSION HISTORY TASK — `sessions` must already be newest-first (see subscribeToPatientSessions) — this component only lays the rows out. MULTI-GAME PLATFORM: renders every game's sessions in one combined, newest-first list — see SessionHistoryRow's own per-game branching. */
export function SessionHistoryList({ patientId, sessions }: { patientId: string; sessions: AnyStoredSession[] }) {
  return (
    <section className={styles.section} aria-label="سجل الأنشطة">
      <h2 className={styles.heading}>سجل الأنشطة <span>{sessions.length.toLocaleString("ar-SA")}</span></h2>
      <div className={styles.activityGrid} data-activity-history-grid>
        {sessions.map((session) => (
          <SessionHistoryRow key={session.sessionId} patientId={patientId} session={session} />
        ))}
      </div>
    </section>
  );
}
