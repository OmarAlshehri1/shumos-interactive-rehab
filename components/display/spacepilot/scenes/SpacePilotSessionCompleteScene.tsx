"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { totalStarsFor, type SpacePilotSessionSummary } from "@/lib/spacepilot";
import { formatAccuracyPercent, formatDurationClock } from "@/components/display/copy";
import type { DisplayEventListener } from "@/components/display/events";
import { SpacePilotRocket } from "../rocket/SpacePilotRocket";

interface SpacePilotSessionCompleteSceneProps {
  summary: SpacePilotSessionSummary;
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

/**
 * Space Pilot's own final celebration — the fully (or however-far)
 * upgraded rocket proudly centered, a family/photo-keepsake framing shared
 * with every other game's session-complete scene, but every metric drawn
 * from THIS game's own summary (starsCollected/starsPresented/
 * collectionRate/duration — task's suggested minimal set).
 */
export function SpacePilotSessionCompleteScene({ summary, onEvent }: SpacePilotSessionCompleteSceneProps) {
  const hasFired = useRef(false);
  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;
    onEvent({ type: "space_pilot_session_complete", timestamp: Date.now(), childName: summary.childFirstName });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-[1.6vmin] overflow-hidden px-[4vmin] py-[2.4vmin] text-center">
      <motion.div
        className="absolute inset-0"
        style={{ background: "radial-gradient(circle at 50% 38%, rgba(99,102,241,0.55) 0%, rgba(99,102,241,0) 65%)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      />

      <motion.div
        className="relative z-10 flex flex-col items-center gap-[0.3vmin]"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <span className="text-[1.9vmin] font-bold tracking-[0.15em] text-white/85 uppercase">Shumos Care</span>
        <span className="text-[1.6vmin] font-medium text-white/70">Space Pilot — قائد الفضاء</span>
      </motion.div>

      <motion.div
        className="relative z-10 h-[18vmin] w-[28vmin]"
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 160, damping: 14, delay: 0.15 }}
      >
        <SpacePilotRocket upgradeLevel={summary.finalUpgradeLevel} />
      </motion.div>

      <motion.div
        className="relative z-10 flex flex-col items-center gap-[0.8vmin]"
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.25 }}
      >
        <h1 className="text-[6.4vmin] leading-tight font-extrabold text-white drop-shadow-[0_4px_18px_rgba(10,10,40,0.6)]">{summary.childFirstName}</h1>
        <p className="text-[3vmin] font-bold text-white drop-shadow-[0_3px_14px_rgba(10,10,40,0.5)]">
          جمع {summary.starsCollected} من {totalStarsFor(summary.difficulty)} نجوم
        </p>
      </motion.div>

      <motion.div
        className="relative z-10 grid w-full max-w-[70vmin] grid-cols-3 gap-[1.2vmin]"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.45 }}
      >
        <OverallStat value={String(summary.starsCollected)} label="نجوم مجمّعة" />
        <OverallStat value={formatAccuracyPercent(summary.collectionRate)} label="نسبة الجمع" />
        <OverallStat value={formatDurationClock(summary.totalDurationMs)} label="مدة الرحلة" />
      </motion.div>
    </div>
  );
}
