"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import type { StageNumber } from "@/lib/game";
import { stageOrdinalAr } from "../copy";
import { Confetti } from "../celebration/Confetti";
import { RisingBalloons } from "../celebration/RisingBalloons";
import { StarBurst } from "../celebration/StarBurst";
import type { DisplayEventListener } from "../events";

// TASK 9: each stage gets its own celebration language and its own hold
// time — Stage 3's richer combination (balloons + stars + confetti) needs a
// little longer to actually read before the therapist can move on. This is
// a display/timing adjustment only; no engine rule changed.
// TASK 11: stages 4-5 (added when every difficulty grew from 3 to 5 stages)
// reuse stage 3's own "biggest tier" combination rather than inventing a
// new visual design — see the stageNumber >= 3 checks below — with a
// slightly longer hold each time, continuing the same escalation.
const CELEBRATION_DURATION_MS: Record<StageNumber, number> = { 1: 4200, 2: 4600, 3: 5600, 4: 5800, 5: 6000 };

const CONFETTI_COLORS = ["#FFC94A", "#3E8EF7", "#F2555A", "#3DD68C", "#A66DF2", "#FFFFFF"] as const;

interface StageCompleteSceneProps {
  childFirstName: string;
  stageNumber: StageNumber;
  /** The just-finished stage's own correct-pop count — see lib/game/session.ts's finalizeCurrentStage, always already appended to session.results by the time this scene renders. */
  correctCount: number;
  onDone: () => void;
  onEvent: DisplayEventListener;
}

/**
 * TASK 9 — a distinct celebration feeling per stage, per the spec:
 *  Stage 1 ("great start"): a tasteful star burst + gentle golden light. No
 *    rising balloons, no confetti — deliberately the lightest of the three,
 *    "do not overload the screen."
 *  Stage 2 ("you're progressing"): several balloons rise with a gentle
 *    float, plus a light sparkle — "slightly stronger than Stage 1."
 *  Stage 3 ("YOU DID IT"): the full combination — more rising balloons, a
 *    bigger star burst, and controlled confetti (a fixed ~20-piece cap, see
 *    Confetti.tsx) — the biggest of the three, flowing straight into the
 *    family report once the therapist advances.
 * The child-facing text stays deliberately simple throughout (no stats
 * table) — richer metrics are the therapist's StageCompleteOverlay's job.
 */
export function StageCompleteScene({ childFirstName, stageNumber, correctCount, onDone, onEvent }: StageCompleteSceneProps) {
  // Guards only the onEvent() call against StrictMode's dev-only double
  // setup-invocation — the setTimeout still needs to be (re)scheduled on
  // every invocation, since StrictMode's fake cleanup clears the first one.
  const firedForStageRef = useRef<number | null>(null);
  useEffect(() => {
    if (firedForStageRef.current !== stageNumber) {
      firedForStageRef.current = stageNumber;
      onEvent({ type: "stage_complete", timestamp: Date.now(), childName: childFirstName, stageNumber });
    }
    const timer = setTimeout(onDone, CELEBRATION_DURATION_MS[stageNumber]);
    return () => clearTimeout(timer);
    // Runs once per stage-complete screen; onDone/onEvent identities are stable enough for this brief, self-timed celebration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageNumber]);

  const glowOpacity = stageNumber === 1 ? 0.45 : stageNumber === 2 ? 0.55 : 0.65;

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
      <motion.div
        className="absolute inset-0"
        style={{ background: "radial-gradient(circle at 50% 55%, rgba(255,224,150,0.55) 0%, rgba(255,224,150,0) 60%)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: glowOpacity }}
        transition={{ duration: 0.6 }}
      />

      {stageNumber === 1 && <StarBurst />}
      {stageNumber === 2 && (
        <>
          <RisingBalloons count={3} />
          <StarBurst />
        </>
      )}
      {stageNumber >= 3 && (
        <>
          <RisingBalloons count={5} />
          <StarBurst big />
          <Confetti colors={CONFETTI_COLORS} />
        </>
      )}

      <motion.div
        className="relative z-10 flex flex-col items-center gap-[1.6vmin] px-8 text-center"
        initial={{ opacity: 0, scale: 0.85, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 210, damping: 16 }}
      >
        <h2 className="text-[6.5vmin] leading-tight font-extrabold text-white drop-shadow-[0_4px_18px_rgba(60,30,90,0.35)]">
          أحسنت يا {childFirstName}! ⭐
        </h2>
        <p className="text-[3.4vmin] font-semibold text-white/90">أنهيت المرحلة {stageOrdinalAr(stageNumber)}</p>
        <p className="text-[2.6vmin] font-bold text-white/80">{correctCount} بالونات صحيحة</p>
      </motion.div>
    </div>
  );
}
