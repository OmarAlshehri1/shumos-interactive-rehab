"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { FootstepsStageStatus, STAGES_PER_DIFFICULTY, type Difficulty, type FootstepsSessionSummary, type StageNumber } from "@/lib/footsteps";
import { DIFFICULTY_LABELS } from "@/components/control/copy";
import { formatAccuracyPercent, formatDurationClock } from "@/components/display/copy";
import type { DisplayEventListener } from "@/components/display/events";
import { CosmicSparkleBurst } from "../celebration/CosmicSparkleBurst";
import { ShootingStars } from "../celebration/ShootingStars";

interface FootstepsSessionCompleteSceneProps {
  summary: FootstepsSessionSummary;
  onEvent: DisplayEventListener;
}

function OverallStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-[0.4vmin] rounded-[1.6vmin] bg-white/10 px-[2vmin] py-[1.6vmin] backdrop-blur-sm">
      <span className="text-[3.4vmin] leading-none font-extrabold text-white">{value}</span>
      <span className="text-[1.5vmin] leading-tight font-semibold text-white/70">{label}</span>
    </div>
  );
}

function DifficultyProgressRow({ summary, difficulty }: { summary: FootstepsSessionSummary; difficulty: Difficulty }) {
  const completedStageNumbers = new Set(
    summary.stageResults.filter((r) => r.difficulty === difficulty && r.status === FootstepsStageStatus.COMPLETED).map((r) => r.stageNumber),
  );
  const completedCount = completedStageNumbers.size;

  return (
    <div className="flex flex-1 flex-col items-center gap-[0.6vmin] rounded-[1.8vmin] bg-white/10 px-[2vmin] py-[1.6vmin] backdrop-blur-sm">
      <span className="text-[1.9vmin] font-bold text-white/90">{DIFFICULTY_LABELS[difficulty].name}</span>
      <div className="flex items-center gap-[0.8vmin]" aria-hidden="true">
        {Array.from({ length: STAGES_PER_DIFFICULTY }, (_, i) => (i + 1) as StageNumber).map((stageNumber) => (
          <span
            key={stageNumber}
            className="h-[2vmin] w-[2vmin] rounded-full transition-colors duration-300"
            style={{ background: completedStageNumbers.has(stageNumber) ? "#FFE7A6" : "rgba(255,255,255,0.2)" }}
          />
        ))}
      </div>
      <span className="text-[1.5vmin] font-semibold text-white/60">
        {completedCount} من {STAGES_PER_DIFFICULTY}
      </span>
    </div>
  );
}

/**
 * Follow the Footsteps' own final celebration (task section 54, 43, 73) —
 * "completed cosmic trail illuminates -> destination expands/glows ->
 * achievement star -> cosmic particles -> family report." Same
 * photo-keepsake framing as Balloon Quest's SessionCompleteScene.tsx, but a
 * genuinely different palette/composition (dark cosmic card, not a bright
 * garden burst) and every metric drawn from THIS game's own summary — no
 * "دقة"/accuracy language.
 */
export function FootstepsSessionCompleteScene({ summary, onEvent }: FootstepsSessionCompleteSceneProps) {
  const hasFired = useRef(false);
  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;
    onEvent({ type: "footsteps_session_complete", timestamp: Date.now(), childName: summary.childFirstName });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completedCount = summary.stageResults.filter((r) => r.status === FootstepsStageStatus.COMPLETED).length;

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-[1.6vmin] overflow-hidden px-[4vmin] py-[2.4vmin] text-center">
      <motion.div
        className="absolute inset-0"
        style={{ background: "radial-gradient(circle at 50% 38%, rgba(140,120,220,0.55) 0%, rgba(140,120,220,0) 65%)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      />

      <ShootingStars count={3} />
      <CosmicSparkleBurst big />

      <motion.div
        className="relative z-10 flex flex-col items-center gap-[0.3vmin]"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <span className="text-[1.9vmin] font-bold tracking-[0.15em] text-white/85 uppercase">Shumos Care</span>
        <span className="text-[1.6vmin] font-medium text-white/70">Follow the Footsteps — اتبع الخطوات</span>
      </motion.div>

      <motion.div
        className="relative z-10 flex flex-col items-center gap-[0.8vmin]"
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.1 }}
      >
        <h1 className="text-[6.4vmin] leading-tight font-extrabold text-white drop-shadow-[0_4px_18px_rgba(20,15,60,0.5)]">{summary.childFirstName}</h1>
        <p className="text-[3vmin] font-bold text-white drop-shadow-[0_3px_14px_rgba(20,15,60,0.4)]">
          أكملت {completedCount} {completedCount === 1 ? "مرحلة" : "مراحل"} بنجاح ⭐
        </p>
      </motion.div>

      {summary.difficultiesPlayed.length > 0 && (
        <motion.div
          className="relative z-10 flex w-full max-w-[92vmin] gap-[1.4vmin]"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          {summary.difficultiesPlayed.map((difficulty) => (
            <DifficultyProgressRow key={difficulty} summary={summary} difficulty={difficulty} />
          ))}
        </motion.div>
      )}

      <motion.div
        className="relative z-10 grid w-full max-w-[70vmin] grid-cols-3 gap-[1.2vmin]"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.45 }}
      >
        <OverallStat value={String(summary.totalStepsCompleted)} label="خطوة مضيئة" />
        <OverallStat value={formatAccuracyPercent(summary.completionRate)} label="نسبة الإكمال" />
        <OverallStat value={formatDurationClock(summary.totalDurationMs)} label="مدة الرحلة" />
      </motion.div>
    </div>
  );
}
