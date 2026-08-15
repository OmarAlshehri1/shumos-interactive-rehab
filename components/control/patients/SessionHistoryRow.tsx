"use client";

import Link from "next/link";
import { getGameById } from "@/lib/games/registry";
import type { StoredSession } from "@/lib/sessions/types";
import { formatAccuracyPercent, formatDurationClock } from "@/components/display/copy";
import { DIFFICULTY_LABELS } from "@/components/control/copy";
import { formatSessionDate } from "./formatSessionDate";

/**
 * SESSION HISTORY TASK — one compact row in the session history list (task
 * section 9): date, game, difficulty, completed-stage count, accuracy,
 * duration. Deliberately NOT a full report card — "the clinic may
 * eventually have many sessions... do not render giant report cards for
 * every session." Tap -> the full read-only detail (SessionHistoryScreen).
 */
export function SessionHistoryRow({ patientId, session }: { patientId: string; session: StoredSession }) {
  const gameName = getGameById(session.gameId)?.nameAr ?? session.gameId;

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
        <span>{session.completedStageCount} مراحل مكتملة</span>
        <span className="font-medium text-emerald-600">{formatAccuracyPercent(session.accuracy)} دقة</span>
        <span dir="ltr" className="font-mono">
          {formatDurationClock(session.durationMs)}
        </span>
      </div>
    </Link>
  );
}
