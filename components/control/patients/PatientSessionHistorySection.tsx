"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BALLOON_QUEST_GAME_ID, BUBBLE_POP_WALL_GAME_ID, COLOR_CHASE_GAME_ID, FEED_THE_ANIMALS_GAME_ID, FOLLOW_THE_FOOTSTEPS_GAME_ID, getGameById } from "@/lib/games/registry";
import { usePatientContext } from "@/lib/patients/PatientSessionContext";
import type { Patient } from "@/lib/patients/types";
import { suggestResumePoint } from "@/lib/sessions/resumeSuggestion";
import { subscribeToPatientSessions } from "@/lib/sessions/sessionHistoryRepository";
import type { AnyStoredSession, StoredBubblePopSession, StoredColorChaseSession, StoredFeedAnimalsSession, StoredFootstepsSession, StoredSession } from "@/lib/sessions/types";
import { SectionCard } from "@/components/control/ui/SectionCard";
import { formatSessionDate, formatSessionTime } from "./formatSessionDate";
import { LastProgressCard } from "./LastProgressCard";
import { PatientAnalyticsDashboard } from "./PatientAnalyticsDashboard";
import { SessionHistoryList } from "./SessionHistoryList";
import { getStaffDb } from "@/lib/realtime/firebaseClient";
import { subscribeToLiveSession } from "@/lib/realtime/sessionRepository";
import type { LiveSessionRecord } from "@/lib/realtime/types";
import { incompleteSessionForPatient } from "@/lib/sessions/incompleteSession";

/**
 * SESSION HISTORY TASK — the real "الجلسات السابقة" section (task section
 * 7), replacing the previous task's prepared-but-empty placeholder. Owns
 * the one live subscription (subscribeToPatientSessions) that the
 * overview/last-progress/trend/list sub-components all render from — a
 * single source of truth so they can never disagree about which sessions
 * exist.
 */
export function PatientSessionHistorySection({ patient }: { patient: Patient }) {
  const [sessions, setSessions] = useState<AnyStoredSession[] | null>(null);
  const [liveRecord, setLiveRecord] = useState<LiveSessionRecord | null>(null);
  const { selectPatient } = usePatientContext();
  const router = useRouter();

  useEffect(() => subscribeToPatientSessions(patient.patientId, setSessions), [patient.patientId]);
  useEffect(() => subscribeToLiveSession(getStaffDb(), setLiveRecord), []);

  if (sessions === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-6 text-slate-400">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-teal-600" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <SectionCard title="الجلسات السابقة">
        <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 py-10 text-center">
          <span className="text-slate-300" aria-hidden="true">
            📋
          </span>
          <p className="text-sm text-slate-400">لا توجد جلسات مسجلة حتى الآن</p>
        </div>
      </SectionCard>
    );
  }

  // `sessions` is already newest-first (see subscribeToPatientSessions).
  const balloonQuestSessions = sessions.filter((s): s is StoredSession => s.gameId === BALLOON_QUEST_GAME_ID);
  const mostRecentBalloonQuest = balloonQuestSessions[0] ?? null;
  // MULTI-GAME PLATFORM — task section 38: resume progress is PER GAME, never conflated across games. Follow the Footsteps and Bubble Pop Wall each get their own "آخر تقدم" card and their own resume suggestion, independent of the other games'.
  const footstepsSessions = sessions.filter((s): s is StoredFootstepsSession => s.gameId === FOLLOW_THE_FOOTSTEPS_GAME_ID);
  const mostRecentFootsteps = footstepsSessions[0] ?? null;
  const bubblePopSessions = sessions.filter((s): s is StoredBubblePopSession => s.gameId === BUBBLE_POP_WALL_GAME_ID);
  const mostRecentBubblePop = bubblePopSessions[0] ?? null;
  const feedAnimalsSessions = sessions.filter((s): s is StoredFeedAnimalsSession => s.gameId === FEED_THE_ANIMALS_GAME_ID);
  const mostRecentFeedAnimals = feedAnimalsSessions[0] ?? null;
  const colorChaseSessions = sessions.filter((s): s is StoredColorChaseSession => s.gameId === COLOR_CHASE_GAME_ID);
  const mostRecentColorChase = colorChaseSessions[0] ?? null;
  const incomplete = incompleteSessionForPatient(liveRecord, patient.patientId);
  const incompleteGame = incomplete?.gameId ? getGameById(incomplete.gameId) : null;

  const handleResumeBalloonQuest = () => {
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

  const handleResumeFootsteps = () => {
    if (!mostRecentFootsteps) return;
    const suggestion = suggestResumePoint(mostRecentFootsteps);
    selectPatient({
      patientId: patient.patientId,
      patientNumber: patient.patientNumber,
      firstName: patient.firstName,
      resumeSuggestion: suggestion,
    });
    router.push("/control/activities");
  };

  const handleResumeBubblePop = () => {
    if (!mostRecentBubblePop) return;
    const suggestion = suggestResumePoint(mostRecentBubblePop);
    selectPatient({
      patientId: patient.patientId,
      patientNumber: patient.patientNumber,
      firstName: patient.firstName,
      resumeSuggestion: suggestion,
    });
    router.push("/control/activities");
  };

  const handleResumeFeedAnimals = () => {
    if (!mostRecentFeedAnimals) return;
    const suggestion = suggestResumePoint(mostRecentFeedAnimals);
    selectPatient({
      patientId: patient.patientId,
      patientNumber: patient.patientNumber,
      firstName: patient.firstName,
      resumeSuggestion: suggestion,
    });
    router.push("/control/activities");
  };

  const handleResumeColorChase = () => {
    if (!mostRecentColorChase) return;
    selectPatient({ patientId: patient.patientId, patientNumber: patient.patientNumber, firstName: patient.firstName, resumeSuggestion: suggestResumePoint(mostRecentColorChase) });
    router.push("/control/activities");
  };

  return (
    <>
      {incomplete && (
        <SectionCard title="جلسة غير مكتملة">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
            <div className="flex flex-col gap-0.5">
              <span className="font-bold text-amber-900">{incompleteGame?.nameAr ?? "نشاط"}</span>
              <span className="text-amber-700">بدأت {formatSessionDate(incomplete.session.createdAt)} — {formatSessionTime(incomplete.session.createdAt)}</span>
            </div>
            <span className="rounded-full bg-white px-3 py-1 font-bold text-amber-800">غير مكتملة</span>
          </div>
        </SectionCard>
      )}
      <PatientAnalyticsDashboard patientId={patient.patientId} sessions={sessions} />
      {mostRecentBalloonQuest && <LastProgressCard session={mostRecentBalloonQuest} onResume={handleResumeBalloonQuest} />}
      {mostRecentFootsteps && <LastProgressCard session={mostRecentFootsteps} onResume={handleResumeFootsteps} />}
      {mostRecentBubblePop && <LastProgressCard session={mostRecentBubblePop} onResume={handleResumeBubblePop} />}
      {mostRecentFeedAnimals && <LastProgressCard session={mostRecentFeedAnimals} onResume={handleResumeFeedAnimals} />}
      {mostRecentColorChase && <LastProgressCard session={mostRecentColorChase} onResume={handleResumeColorChase} />}
      <SectionCard>
        <SessionHistoryList patientId={patient.patientId} sessions={sessions} />
      </SectionCard>
    </>
  );
}
