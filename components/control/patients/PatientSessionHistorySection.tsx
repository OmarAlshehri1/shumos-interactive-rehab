"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BALLOON_QUEST_GAME_ID } from "@/lib/games/registry";
import { usePatientContext } from "@/lib/patients/PatientSessionContext";
import type { Patient } from "@/lib/patients/types";
import { suggestResumePoint } from "@/lib/sessions/resumeSuggestion";
import { subscribeToPatientSessions } from "@/lib/sessions/sessionHistoryRepository";
import type { StoredSession } from "@/lib/sessions/types";
import { LastProgressCard } from "./LastProgressCard";
import { PatientSessionOverview } from "./PatientSessionOverview";
import { SessionHistoryList } from "./SessionHistoryList";
import { SessionPerformanceTrend } from "./SessionPerformanceTrend";

/**
 * SESSION HISTORY TASK — the real "الجلسات السابقة" section (task section
 * 7), replacing the previous task's prepared-but-empty placeholder. Owns
 * the one live subscription (subscribeToPatientSessions) that the
 * overview/last-progress/trend/list sub-components all render from — a
 * single source of truth so they can never disagree about which sessions
 * exist.
 */
export function PatientSessionHistorySection({ patient }: { patient: Patient }) {
  const [sessions, setSessions] = useState<StoredSession[] | null>(null);
  const { selectPatient } = usePatientContext();
  const router = useRouter();

  useEffect(() => subscribeToPatientSessions(patient.patientId, setSessions), [patient.patientId]);

  if (sessions === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-6 text-slate-400">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-teal-600" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-700">الجلسات السابقة</h2>
        <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 py-10 text-center">
          <span className="text-slate-300" aria-hidden="true">
            📋
          </span>
          <p className="text-sm text-slate-400">لا توجد جلسات مسجلة حتى الآن</p>
        </div>
      </section>
    );
  }

  // `sessions` is already newest-first (see subscribeToPatientSessions).
  const balloonQuestSessions = sessions.filter((s) => s.gameId === BALLOON_QUEST_GAME_ID);
  const mostRecentBalloonQuest = balloonQuestSessions[0] ?? null;

  const handleResume = () => {
    if (!mostRecentBalloonQuest) return;
    const suggestion = suggestResumePoint(mostRecentBalloonQuest);
    selectPatient({
      patientId: patient.patientId,
      patientNumber: patient.patientNumber,
      firstName: patient.firstName,
      resumeSuggestion: suggestion,
    });
    router.push("/control/activities");
  };

  return (
    <>
      <PatientSessionOverview sessions={sessions} />
      {mostRecentBalloonQuest && <LastProgressCard session={mostRecentBalloonQuest} onResume={handleResume} />}
      {balloonQuestSessions.length >= 2 && <SessionPerformanceTrend sessions={balloonQuestSessions} />}
      <SessionHistoryList patientId={patient.patientId} sessions={sessions} />
    </>
  );
}
