"use client";
import { isRingHistory } from '@/lib/spacepilot3d/history';

import Link from "next/link";
import { getHistoricalGameNameAr } from "@/lib/sessions/historicalGames";
import type { AnyStoredSession } from "@/lib/sessions/types";
import { formatAccuracyPercent, formatDurationClock } from "@/components/display/copy";
import { DIFFICULTY_LABELS } from "@/components/control/copy";
import { formatCompletionPercent } from "@/components/control/footsteps/copy";
import { formatSessionDate } from "./formatSessionDate";
import styles from "./history.module.css";
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
      className={styles.activityCard}
      data-activity-history-card={session.sessionId}
    >
      <div className={styles.cardHeading}><h3>{gameName}</h3><time>{formatSessionDate(session.completedAt)}</time></div>
      <div className={styles.metrics}>
        {(session.gameId === "achievement-city-3d" || session.gameId === "ocean-wonders-3d" || session.gameId === "achievement-forest-3d") ? (
          <span className="font-semibold text-teal-700">المستوى {session.endingLevel} من 3 · {formatCountOrUnavailable(session.levelsCompleted)} مستويات مكتملة</span>
        ) : (
          <>
            <span className="font-semibold text-teal-700">{DIFFICULTY_LABELS[session.endingDifficulty].name}</span>
            <span>{formatCountOrUnavailable(session.completedStageCount)} مراحل مكتملة</span>
          </>
        )}
        {session.gameId === "shumos-castle-legends-3d" ? (
          <span>{session.totalConfirmations} تأكيد ناجح · {session.totalAssists} بمساعدة</span>
        ) : session.gameId === "harvest-valley-3d" ? (
          <span>{session.harvestedCells} خلايا محصودة · {session.assistedActions} بمساعدة</span>
        ) : session.gameId === "balance-bridge-3d" ? (
          <span>{session.checkpointsConfirmed} تأكيدًا · {session.assistedCheckpoints} بمساعدة</span>
        ) : session.gameId === "blooming-world-3d" ? (
          <span>{session.restoredRegions} مناطق مزهرة · {session.assistedRegions} بمساعدة</span>
        ) : session.gameId === "pearl-voyage-3d" ? (
          <span>{session.fishDiscovered} أسماك مكتشفة · {session.assistedEncounters} بمساعدة</span>
        ) : session.gameId === "fire-rescue-3d" ? (
          <span>{session.drivingObjectives} أهداف قيادة · {session.fireTargetsExtinguished} مناطق أُطفئت · {session.assistedObjectives} بمساعدة</span>
        ) : session.gameId === "turn-and-go-3d" ? (
          <span className="font-medium text-amber-600">★ {formatCountOrUnavailable(session.confirmedCheckpoints + session.assistedCheckpoints)} نجمة · {formatCountOrUnavailable(session.assistedCheckpoints)} بمساعدة</span>
        ) : session.gameId === "foot-maze-3d" ? (
          <span className="font-medium text-amber-600">★ {formatCountOrUnavailable(session.confirmedCheckpoints + session.assistedCheckpoints)} نجمة · {formatCountOrUnavailable(session.routeChoices)} اختيار</span>
        ) : (session.gameId === "achievement-city-3d" || session.gameId === "ocean-wonders-3d" || session.gameId === "achievement-forest-3d") ? (
          <span className="font-medium text-amber-700">المستوى {session.endingLevel} · {formatCountOrUnavailable(session.confirmedAchievements + session.assistedAchievements)} إنجازًا · {formatCountOrUnavailable(session.assistedAchievements)} بمساعدة</span>
        ) : session.gameId === "body-sequence-3d" ? (
          <span className="font-medium text-cyan-700">{formatCountOrUnavailable(session.confirmedMovements + session.assistedMovements)} حركة مؤكدة · {formatCountOrUnavailable(session.assistedMovements)} بمساعدة</span>
        ) : session.gameId === "safe-hex-arena-3d" ? (
          <span className="font-medium text-emerald-600">{formatCountOrUnavailable(session.totalRoundsCompleted)} جولة · {formatCountOrUnavailable(session.totalAssists)} بمساعدة</span>
        ) : session.gameId === "rhythm-steps-3d" ? (
          <span className="font-medium text-emerald-600">{formatCountOrUnavailable(session.confirmedEvents + session.assistedEvents)} هدفًا مؤكدًا · {formatCountOrUnavailable(session.assistedEvents)} بمساعدة</span>
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
      </div>
      {(session.therapistName || session.therapistNote) && (
        <div className="flex flex-wrap gap-2 pt-0.5 text-xs text-slate-500">
          {session.therapistName && <span>الأخصائي: {session.therapistName}</span>}
          {session.therapistNote && <span className="rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-800">توجد ملاحظة للأخصائي</span>}
        </div>
      )}
      <div className={styles.cardFooter}><span>المدة <bdi>{formatDurationClock(session.durationMs)}</bdi></span><strong>عرض التفاصيل ←</strong></div>
    </Link>
  );
}
