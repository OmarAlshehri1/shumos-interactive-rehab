"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isBalloonQuest3DSession } from "@/lib/sessions/balloonQuestVersion";
import { BALLOON_QUEST_GAME_ID, BUBBLE_POP_WALL_GAME_ID, COLOR_CHASE_GAME_ID, FOLLOW_THE_FOOTSTEPS_GAME_ID, getGameById } from "@/lib/games/registry";
import { usePatientContext } from "@/lib/patients/PatientSessionContext";
import type { Patient } from "@/lib/patients/types";
import { suggestResumePoint } from "@/lib/sessions/resumeSuggestion";
import { subscribeToPatientSessions } from "@/lib/sessions/sessionHistoryRepository";
import type { AnyStoredSession, StoredBubblePopSession, StoredColorChaseSession, StoredFootstepsSession, StoredSession } from "@/lib/sessions/types";
import { SectionCard } from "@/components/control/ui/SectionCard";
import { formatSessionDate, formatSessionTime } from "./formatSessionDate";
import { LastProgressCard } from "./LastProgressCard";
import { PatientAnalyticsDashboard } from "./PatientAnalyticsDashboard";
import { SessionHistoryList } from "./SessionHistoryList";
import styles from "./history.module.css";
import { getStaffDb } from "@/lib/realtime/firebaseClient";
import { subscribeToLiveSession } from "@/lib/realtime/sessionRepository";
import type { LiveSessionRecord } from "@/lib/realtime/types";
import { subscribePatientVisits, subscribeVisitResultClaims } from "@/lib/therapyVisits/repository";
import type { Visit } from "@/lib/therapyVisits/model";
import { independentSessions, pendingVisitResults } from "@/lib/therapyVisits/clinicalSummary";
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
  const [allSessions, setSessions] = useState<AnyStoredSession[] | null>(null);
  const [liveRecord, setLiveRecord] = useState<LiveSessionRecord | null>(null);
  const { selectPatient } = usePatientContext();
  const router = useRouter();
  const [visits,setVisits]=useState<Visit[]|null>(null),[claims,setClaims]=useState<Record<string,string>|null>(null),[historyError,setHistoryError]=useState("");
  const sessions=allSessions&&visits&&claims?independentSessions(allSessions,visits,claims):null;
  const pending=allSessions&&visits&&claims?pendingVisitResults(allSessions,visits,claims):[];
  useEffect(()=>{const fail=()=>setHistoryError("تعذّر فصل سجل الألعاب المستقلة. تحقق من الاتصال وصلاحيات الوصول.");const stops=[subscribePatientVisits(patient.patientId,setVisits,fail),subscribeVisitResultClaims(patient.patientId,setClaims,fail)];return()=>stops.forEach(s=>s());},[patient.patientId]);

  useEffect(() => subscribeToPatientSessions(patient.patientId, setSessions), [patient.patientId]);
  useEffect(() => subscribeToLiveSession(getStaffDb(), setLiveRecord), []);

  if (historyError) return <p role="alert" className="text-sm text-rose-700">{historyError}</p>;
  if (sessions === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-6 text-slate-400">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-teal-600" />
      </div>
    );
  }

  const recovery=pending.length>0?<SectionCard title="نتائج محفوظة تحتاج مراجعة ربط الجلسة"><SessionHistoryList patientId={patient.patientId} sessions={pending}/></SectionCard>:null;
  if (sessions.length === 0) {
    return (
      <><SectionCard title="الألعاب المستقلة">
        <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 py-10 text-center">
          <span className="text-slate-300" aria-hidden="true">
            📋
          </span>
          <p className="text-sm text-slate-400">لا توجد ألعاب مستقلة مسجلة خارج الجلسات العلاجية.</p>
        </div>
      </SectionCard>{recovery}</>
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
  const colorChaseSessions = sessions.filter((s): s is StoredColorChaseSession => s.gameId === COLOR_CHASE_GAME_ID);
  const mostRecentColorChase = colorChaseSessions[0] ?? null;
  const incomplete = incompleteSessionForPatient(liveRecord, patient.patientId);
  const incompleteGame = incomplete?.gameId ? getGameById(incomplete.gameId) : null;

  const handleResumeBalloonQuest = () => {
    if (!mostRecentBalloonQuest) return;
    // A legacy five-stage record is never reinterpreted as three-stage progress: the updated game starts fresh (the therapist can still pick a level).
    const suggestion = isBalloonQuest3DSession(mostRecentBalloonQuest) ? suggestResumePoint(mostRecentBalloonQuest) : undefined;
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
    const suggestion = mostRecentBubblePop.engine === "dome3" ? suggestResumePoint(mostRecentBubblePop) : undefined;
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
      <SectionCard>
        <SessionHistoryList patientId={patient.patientId} sessions={sessions} />
      </SectionCard>
      <details className="rounded-2xl border border-slate-200 bg-white p-4">
        <summary className="min-h-11 cursor-pointer font-semibold text-teal-800">تفاصيل سجل الألعاب المستقلة</summary>
        <PatientAnalyticsDashboard patientId={patient.patientId} sessions={sessions} />
      </details>
      <section aria-label="متابعة آخر تقدم"><h2 className={styles.heading}>متابعة آخر تقدم</h2><div className={styles.resumeGrid}>
      {mostRecentBalloonQuest && <LastProgressCard session={mostRecentBalloonQuest} onResume={handleResumeBalloonQuest} />}
      {mostRecentFootsteps && <LastProgressCard session={mostRecentFootsteps} onResume={handleResumeFootsteps} />}
      {mostRecentBubblePop && <LastProgressCard session={mostRecentBubblePop} onResume={handleResumeBubblePop} />}
      {mostRecentColorChase && <LastProgressCard session={mostRecentColorChase} onResume={handleResumeColorChase} />}
      </div></section>
      {recovery}
    </>
  );
}
