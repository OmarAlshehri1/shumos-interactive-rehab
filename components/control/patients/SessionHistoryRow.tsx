"use client";
import { isRingHistory } from '@/lib/spacepilot3d/history';

import Link from "next/link";
import { getHistoricalGameNameAr } from "@/lib/sessions/historicalGames";
import type { AnyStoredSession } from "@/lib/sessions/types";
import { formatAccuracyPercent, formatDurationClock } from "@/components/display/copy";
import { DIFFICULTY_LABELS } from "@/components/control/copy";
import { formatCompletionPercent } from "@/components/control/footsteps/copy";
import { formatSessionDate } from "./formatSessionDate";
import { formatCountOrUnavailable } from "@/lib/dataIntegrity/numeric";

/**
 * SESSION HISTORY TASK — one compact row in the session history list (task
 * section 9): date, game, difficulty, completed-stage count, a game-specific
 * secondary metric, duration. Deliberately NOT a full report card. Tap ->
 * the full read-only detail (SessionDetailScreen).
 *
 * MULTI-GAME PLATFORM — task section 35's "Do NOT show Balloon Quest
 * accuracy terminology if it does not apply": branches on `session.gameId`
 * for the ONE field that genuinely differs in meaning (دقة for Balloon
 * Quest vs. نسبة إكمال for Follow the Footsteps, which has no
 * incorrect/failure scoring at all) — every other field (date, game name,
 * difficulty, completed-stage count, duration) is already common to both
 * session shapes.
 */
export function SessionHistoryRow({ patientId, session }: { patientId: string; session: AnyStoredSession }) {
  const gameName = getHistoricalGameNameAr(session.gameId);
  return (
    <Link
      href={`/control/patients/${patientId}/sessions/${session.sessionId}`}
      className="flex touch-manipulation flex-col gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-[0_2px_8px_rgba(30,41,59,0.05)] transition-all active:scale-[0.99] active:bg-slate-50"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-slate-900">{formatSessionDate(session.completedAt)}</span>
        <span className="text-xs font-semibold text-slate-400">{gameName}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span className="font-semibold text-teal-700">{DIFFICULTY_LABELS[session.endingDifficulty].name}</span>
        <span>{formatCountOrUnavailable(session.completedStageCount)} مراحل مكتملة</span>
        {session.gameId === "harvest-valley-3d" ? (
          <span>{session.harvestedCells} خلايا محصودة · {session.assistedActions} بمساعدة</span>
        ) : session.gameId === "blooming-world-3d" ? (
          <span>{session.restoredRegions} مناطق مزهرة · {session.assistedRegions} بمساعدة</span>
        ) : session.gameId === "pearl-voyage-3d" ? (
          <span>{session.fishDiscovered} أسماك مكتشفة · {session.assistedEncounters} بمساعدة</span>
        ) : session.gameId === "fire-rescue-3d" ? (
          <span>{session.drivingObjectives} أهداف قيادة · {session.fireTargetsExtinguished} مناطق أُطفئت · {session.assistedObjectives} بمساعدة</span>
        ) : session.gameId === "safe-hex-arena-3d" ? (
          <span className="font-medium text-emerald-600">{formatCountOrUnavailable(session.totalRoundsCompleted)} جولة · {formatCountOrUnavailable(session.totalAssists)} بمساعدة</span>
        ) : session.gameId === "mirror-quest-3d" ? (
          <span className="font-medium text-emerald-600">{formatCountOrUnavailable(session.totalPoses)} حركة · {formatCountOrUnavailable(session.totalAssists)} بمساعدة</span>
        ) : session.gameId === "build-quest-3d" ? (
          <span className="font-medium text-emerald-600">{formatCountOrUnavailable(session.totalPiecesPlaced)} قطعة موضوعة</span>
        ) : session.gameId === "follow-the-footsteps" ? (
          <span className="font-medium text-emerald-600">{formatCompletionPercent(session.completionRate)} إكمال</span>
        ) : session.gameId === "runner-quest-3d" ? (
          <span className="font-medium text-amber-600">★ {formatCountOrUnavailable(session.totalStars)} نجمة</span>
        ) : session.gameId === "space-pilot" ? (
          <span className="font-medium text-emerald-600">{formatCompletionPercent(session.collectionRate)} {isRingHistory(session) ? "جمع الحلقات" : "جمع النجوم"}</span>
        ) : session.gameId === "color-chase" && "engine" in session && session.engine === "cc3-garden" ? (
          <span className="font-medium text-emerald-600">{session.objectivesCompleted} هدفًا · {session.assistedObjectives} بمساعدة</span>
        ) : session.gameId === "bubble-pop-wall" && session.engine === "dome3" ? (
          <span className="font-medium text-emerald-600">{session.objectivesCompleted} أهداف · {session.assistedObjectives} بمساعدة</span>
        ) : session.gameId === "bubble-pop-wall" || session.gameId === "feed-the-animals" ? (
          <span className="font-medium text-emerald-600">{formatAccuracyPercent(session.accuracy)} دقة</span>
        ) : (
          <span className="font-medium text-emerald-600">{formatAccuracyPercent(session.accuracy)} دقة</span>
        )}
        <span dir="ltr" className="font-mono">
          {formatDurationClock(session.durationMs)}
        </span>
      </div>
      {(session.therapistName || session.therapistNote) && (
        <div className="flex flex-wrap gap-2 pt-0.5 text-xs text-slate-500">
          {session.therapistName && <span>الأخصائي: {session.therapistName}</span>}
          {session.therapistNote && <span className="rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-800">توجد ملاحظة للأخصائي</span>}
        </div>
      )}
    </Link>
  );
}
