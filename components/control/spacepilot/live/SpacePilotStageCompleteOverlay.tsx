"use client";

import { motion } from "motion/react";
import { formatDurationClock } from "@/components/display/copy";
import { Difficulty, isEncounterStage, stageAsteroidsCleared, stageAsteroidsAvoided, stageStarsCollected, totalStarsFor, type SpacePilotAnyStageRuntime } from "@/lib/spacepilot";
import { StatCard } from "@/components/control/StatCard";
import { formatSpacePilotCollectionPercent } from "../copy";

const STAGE_TITLE_AR: Record<Difficulty, string> = {
  [Difficulty.EASY]: "اكتملت رحلة النجوم ✓",
  [Difficulty.MEDIUM]: "اكتمل حزام النيازك ✓",
  [Difficulty.ADVANCED]: "اكتملت مهمة المجرة ✓",
};

interface SpacePilotStageCompleteOverlayProps {
  stage: SpacePilotAnyStageRuntime;
  difficulty: Difficulty;
  onEndSession: () => void;
}

/**
 * Space Pilot's own stage-complete view — every star/asteroid/alien in the
 * current difficulty's fixed sequence has resolved. Deliberately has NO
 * "continue"/"easier"/"harder" advance choice: each of EASY/MEDIUM/ADVANCED
 * is a single self-contained stage the therapist picked at setup, so the
 * only sanctioned next action is ending the session and viewing the
 * summary.
 */
export function SpacePilotStageCompleteOverlay({ stage, difficulty, onEndSession }: SpacePilotStageCompleteOverlayProps) {
  const durationMs = stage.completedAt !== null && stage.startedAt !== null ? stage.completedAt - stage.startedAt - stage.totalPausedMs : null;
  const totalStars = totalStarsFor(difficulty);
  const collected = stageStarsCollected(stage);
  const collectionRate = totalStars === 0 ? null : collected / totalStars;

  return (
    <motion.div
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-white/97 px-6 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="flex flex-col items-center gap-1.5 text-center">
        <span className="text-4xl" aria-hidden="true">
          🚀
        </span>
        <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">{STAGE_TITLE_AR[difficulty]}</h2>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-2.5">
        <div className="grid grid-cols-3 gap-2.5">
          <StatCard label="نجوم مجمّعة" value={String(collected)} tone="positive" ltr />
          <StatCard label="إجمالي النجوم" value={String(totalStars)} ltr />
          <StatCard label="نسبة الجمع" value={formatSpacePilotCollectionPercent(collectionRate ?? 0)} />
        </div>
        {isEncounterStage(stage) && (
          <div className="grid grid-cols-2 gap-2.5">
            <StatCard label="نيازك دُمّرت" value={String(stageAsteroidsCleared(stage) ?? 0)} tone="positive" ltr />
            <StatCard label="نيازك تم تفاديها" value={String(stageAsteroidsAvoided(stage) ?? 0)} ltr />
          </div>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <StatCard label="مستوى ترقية الصاروخ" value={`${collected} / ${totalStars}`} tone="positive" />
          <StatCard label="مدة الرحلة" value={formatDurationClock(durationMs ?? 0)} ltr />
        </div>
      </div>

      <button
        type="button"
        onClick={onEndSession}
        className="min-h-16 w-full max-w-xs touch-manipulation rounded-2xl bg-indigo-600 text-xl font-bold text-white shadow-lg shadow-indigo-900/15 transition-all active:scale-[0.98]"
      >
        إنهاء الجلسة وعرض الملخص
      </button>
    </motion.div>
  );
}
