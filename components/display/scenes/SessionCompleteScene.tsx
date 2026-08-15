"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { STAGES_PER_DIFFICULTY, StageStatus, type Difficulty, type SessionSummary, type StageNumber } from "@/lib/game";
import { DIFFICULTY_LABELS } from "@/components/control/copy";
import { formatAccuracyPercent, formatDurationClock } from "../copy";
import { Confetti } from "../celebration/Confetti";
import { RisingBalloons } from "../celebration/RisingBalloons";
import { StarBurst } from "../celebration/StarBurst";
import type { DisplayEventListener } from "../events";

interface SessionCompleteSceneProps {
  summary: SessionSummary;
  onEvent: DisplayEventListener;
}

const CONFETTI_COLORS = ["#FFC94A", "#3E8EF7", "#F2555A", "#3DD68C", "#A66DF2", "#FFFFFF"] as const;

function OverallStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-[0.4vmin] rounded-[1.6vmin] bg-white/90 px-[2vmin] py-[1.6vmin] shadow-[0_6px_20px_rgba(60,30,90,0.15)]">
      <span className="text-[3.4vmin] leading-none font-extrabold text-slate-800">{value}</span>
      <span className="text-[1.5vmin] leading-tight font-semibold text-slate-500">{label}</span>
    </div>
  );
}

/**
 * TASK 11 — one difficulty's progress as simple filled/empty dots ("سهل ●
 * ● ● ○ ○ — 3 من 5"), never a per-stage stats table — the family report
 * stays photo-simple, per spec. A dot is filled only for a stage that was
 * genuinely COMPLETED (popped every target); a SKIPPED stage stays empty —
 * "3 من 5" always means 3 real completions, never counting a skip as
 * progress.
 */
function DifficultyProgressRow({ summary, difficulty }: { summary: SessionSummary; difficulty: Difficulty }) {
  const completedStageNumbers = new Set(
    summary.stageResults.filter((r) => r.difficulty === difficulty && r.status === StageStatus.COMPLETED).map((r) => r.stageNumber),
  );
  const completedCount = completedStageNumbers.size;

  return (
    <div className="flex flex-1 flex-col items-center gap-[0.6vmin] rounded-[1.8vmin] bg-white/90 px-[2vmin] py-[1.6vmin] shadow-[0_6px_20px_rgba(60,30,90,0.15)]">
      <span className="text-[1.9vmin] font-bold text-slate-700">{DIFFICULTY_LABELS[difficulty].name}</span>
      <div className="flex items-center gap-[0.8vmin]" aria-hidden="true">
        {Array.from({ length: STAGES_PER_DIFFICULTY }, (_, i) => (i + 1) as StageNumber).map((stageNumber) => (
          <span
            key={stageNumber}
            className="h-[2vmin] w-[2vmin] rounded-full transition-colors duration-300"
            style={{ background: completedStageNumbers.has(stageNumber) ? "#3DD68C" : "rgba(100,100,120,0.2)" }}
          />
        ))}
      </div>
      <span className="text-[1.5vmin] font-semibold text-slate-500">
        {completedCount} من {STAGES_PER_DIFFICULTY}
      </span>
    </div>
  );
}

/**
 * TASK 9 — the family-facing session report: "the family can take a photo
 * of it." Deliberately card/keepsake in tone, not a dashboard — every
 * number here comes straight from the canonical SessionSummary (lib/game's
 * approved scoring engine), never recalculated. The therapist's own
 * SessionSummaryScreen (/control) reads the exact same object; this is
 * only a different, more celebratory presentation of it.
 *
 * Replay support: `key` on the wrapping element (set by DisplayScreen from
 * the realtime celebrationReplayToken) forces this whole scene to remount
 * on "إعادة الاحتفال," which — via the effect below — re-fires the
 * session_complete event (replaying Lama's line + celebration audio) and
 * restarts every entrance animation. Nothing here mutates summary/score;
 * it only ever re-displays it.
 */
export function SessionCompleteScene({ summary, onEvent }: SessionCompleteSceneProps) {
  // Guards against React StrictMode's dev-only double-invocation of effects
  // with no cleanup function — this must fire exactly once per mount
  // (including a fresh mount caused by a replay's changed `key` upstream).
  const hasFired = useRef(false);
  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;
    onEvent({ type: "session_complete", timestamp: Date.now(), childName: summary.childFirstName });
    // Fire once when this screen appears, not on every onEvent identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completedCount = summary.stageResults.filter((r) => r.status === StageStatus.COMPLETED).length;

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-[1.6vmin] overflow-hidden px-[4vmin] py-[2.4vmin] text-center">
      <motion.div
        className="absolute inset-0"
        style={{ background: "radial-gradient(circle at 50% 38%, rgba(255,224,150,0.6) 0%, rgba(255,224,150,0) 65%)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      />

      <RisingBalloons count={4} />
      <StarBurst big />
      <Confetti colors={CONFETTI_COLORS} />

      {/* Brand header — small and unobtrusive, but always present in the photo. */}
      <motion.div
        className="relative z-10 flex flex-col items-center gap-[0.3vmin]"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <span className="text-[1.9vmin] font-bold tracking-[0.15em] text-white/85 uppercase">Shumos Care</span>
        <span className="text-[1.6vmin] font-medium text-white/70">Balloon Quest — مغامرة البالونات</span>
      </motion.div>

      <motion.div
        className="relative z-10 flex flex-col items-center gap-[0.8vmin]"
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.1 }}
      >
        <h1 className="text-[6.4vmin] leading-tight font-extrabold text-white drop-shadow-[0_4px_18px_rgba(60,30,90,0.35)]">
          {summary.childFirstName}
        </h1>
        <p className="text-[3vmin] font-bold text-white drop-shadow-[0_3px_14px_rgba(60,30,90,0.3)]">
          أكملت {completedCount} {completedCount === 1 ? "مرحلة" : "مراحل"} بنجاح ⭐
        </p>
      </motion.div>

      {/* TASK 11: per-difficulty progress dots — only difficulties actually played, never a per-stage stats table on this photo-focused report. */}
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

      {/* Overall session metrics — every field genuinely measured by lib/game/scoring.ts. Kept to the 3 the family report needs; the therapist's own SessionSummaryScreen has the richer breakdown. */}
      <motion.div
        className="relative z-10 grid w-full max-w-[70vmin] grid-cols-3 gap-[1.2vmin]"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.45 }}
      >
        <OverallStat value={String(summary.totalCorrect)} label="الأهداف الصحيحة" />
        <OverallStat value={formatAccuracyPercent(summary.overallAccuracy)} label="الدقة" />
        <OverallStat value={formatDurationClock(summary.totalDurationMs)} label="مدة المغامرة" />
      </motion.div>
    </div>
  );
}
