import { STAGES_PER_DIFFICULTY } from "@/lib/game";
import { balloonQuestStagesPerDifficulty, isBalloonQuest3DSession } from "@/lib/sessions/balloonQuestVersion";
import { getHistoricalGameNameAr } from "@/lib/sessions/historicalGames";
import type { AnyStoredSession } from "@/lib/sessions/types";
import { DIFFICULTY_LABELS } from "@/components/control/copy";
import { formatSessionDate } from "./formatSessionDate";

interface LastProgressCardProps {
  /** MULTI-GAME PLATFORM: the most recent session FOR ONE SPECIFIC GAME (already filtered/sorted by the caller — see PatientSessionHistorySection). Every field this component reads (gameId/endingDifficulty/endingStage/completedAt) is common to every game's StoredSession shape, so this needs no per-game branching. */
  session: AnyStoredSession;
  onResume: () => void;
}

/**
 * SESSION HISTORY TASK — "آخر تقدم" (task section 7) + "متابعة من آخر
 * تقدم" (task section 8). Shows where the child's most recent session
 * actually ended — `endingDifficulty`/`endingStage`, both copied straight
 * from the stored record, never recomputed here. `onResume` is the
 * caller's job (compute the suggestion via lib/sessions/resumeSuggestion.ts,
 * stash it on the patient context, navigate to the Game Library) — this
 * component is presentation-only.
 */
export function LastProgressCard({ session, onResume }: LastProgressCardProps) {
  const gameName = getHistoricalGameNameAr(session.gameId);
  // Achievement City has three levels and no stages; its record carries no endingDifficulty/endingStage.
  if (session.gameId === "achievement-city-3d") {
    return (
      <section className="flex flex-col gap-3 rounded-2xl border border-teal-100 bg-teal-50/60 p-5">
        <h2 className="text-sm font-semibold text-teal-800">آخر تقدم</h2>
        <div className="flex flex-col gap-1">
          <span className="text-base font-bold text-slate-900">{gameName}</span>
          <span className="text-sm font-semibold text-teal-700">
            المستوى {session.endingLevel} من 3 — {session.confirmedAchievements + session.assistedAchievements} إنجازًا مؤكدًا
          </span>
          <span className="text-xs text-slate-500">آخر جلسة: {formatSessionDate(session.completedAt)}</span>
        </div>
        <button
          type="button"
          onClick={onResume}
          className="min-h-12 touch-manipulation rounded-xl bg-teal-600 text-sm font-bold text-white shadow-sm shadow-teal-900/15 transition-all active:scale-[0.98]"
        >
          متابعة من آخر تقدم
        </button>
      </section>
    );
  }
  const difficultyName = DIFFICULTY_LABELS[session.endingDifficulty].name;
  // Balloon Quest keeps two history shapes under one game id: the original five-stage game (no marker) and the three-stage redesign. Legacy progress is shown as it was recorded and is never mapped onto the new three-stage levels.
  const isBalloonQuest = session.gameId === "balloon-quest";
  const isLegacyBalloonQuest = isBalloonQuest && !isBalloonQuest3DSession(session);
  const stageCount = (session.gameId === "bubble-pop-wall" && session.engine === "dome3") || (session.gameId === "color-chase" && "engine" in session && session.engine === "cc3-garden") ? 3 : isBalloonQuest ? balloonQuestStagesPerDifficulty(session) : STAGES_PER_DIFFICULTY;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-teal-100 bg-teal-50/60 p-5">
      <h2 className="text-sm font-semibold text-teal-800">آخر تقدم</h2>
      <div className="flex flex-col gap-1">
        <span className="text-base font-bold text-slate-900">{gameName}</span>
        <span className="text-sm font-semibold text-teal-700">
          {difficultyName} — المرحلة {session.endingStage} من {stageCount}
        </span>
        <span className="text-xs text-slate-500">آخر جلسة: {formatSessionDate(session.completedAt)}</span>
        {isLegacyBalloonQuest && (
          <span className="text-xs text-amber-700">سُجّلت هذه الجلسة في النسخة السابقة من اللعبة (٥ مراحل لكل مستوى). اللعبة المحدّثة لكل مستوى فيها ٣ مراحل، لذلك ستبدأ من البداية ويمكنك اختيار المستوى.</span>
        )}
      </div>
      <button
        type="button"
        onClick={onResume}
        className="min-h-12 touch-manipulation rounded-xl bg-teal-600 text-sm font-bold text-white shadow-sm shadow-teal-900/15 transition-all active:scale-[0.98]"
      >
        {isLegacyBalloonQuest ? "ابدأ اللعبة المحدّثة" : "متابعة من آخر تقدم"}
      </button>
    </section>
  );
}
