"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import type { StageNumber } from "@/lib/bubblepop";
import type { DisplayEventListener } from "@/components/display/events";

interface BubblePopReadyPositionSceneProps {
  childName: string;
  stageNumber: StageNumber;
  startingStage: StageNumber;
  onEvent: DisplayEventListener;
}

/**
 * WALL-PROJECTION READY POSITION (task section 7) — this game's own
 * analogue to the floor games' Start Zone scene, but deliberately NOT a
 * floor marker: the child stands BACK from this wall and reaches toward
 * it, so there is nothing to draw "on the ground" here. A simple calm
 * center marker instead — no camera/wall sensor, no automatic detection,
 * same therapist-confirms-readiness model as every other game. Fires its
 * own `bubblepop_ready_position` event (not the shared `start_zone`) since
 * the wording is genuinely this game's own (task's suggested line: "يلا يا
 * {name}، وقف قدام الشاشة وخلك جاهز!").
 */
export function BubblePopReadyPositionScene({ childName, stageNumber, startingStage, onEvent }: BubblePopReadyPositionSceneProps) {
  const isFirstStage = stageNumber === startingStage;

  const firedForStageRef = useRef<number | null>(null);
  useEffect(() => {
    if (firedForStageRef.current === stageNumber) return;
    firedForStageRef.current = stageNumber;
    onEvent({ type: "bubblepop_ready_position", timestamp: Date.now(), childName, isFirstStage });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childName, stageNumber]);

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-[5vmin] px-8 text-center">
      {/* A simple calm center marker — task section 7's "display a simple calm center marker if useful."
          Given a beat to register on its own before the text follows (see delay below) so the marker
          reads as the dominant element, not a simultaneous competitor with the headline. */}
      <motion.div
        className="relative flex h-[22vmin] w-[22vmin] items-center justify-center rounded-full border-2 border-dashed border-white/50 bg-white/10"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(180,230,255,0.35) 0%, rgba(180,230,255,0) 70%)" }}
          animate={{ opacity: [0.5, 0.9, 0.5], scale: [1, 1.08, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
        <svg viewBox="0 0 24 24" className="relative h-[9vmin] w-[9vmin]" fill="rgba(255,255,255,0.85)" aria-hidden="true">
          <circle cx="12" cy="5.2" r="2.8" />
          <path d="M12 9.5c-3 0-5.4 2.1-5.9 5l-.6 3.4c-.15.85.5 1.6 1.35 1.6H10l.4 3.1c.05.35.35.6.7.6h1.8c.35 0 .65-.25.7-.6l.4-3.1h3.15c.85 0 1.5-.75 1.35-1.6l-.6-3.4c-.5-2.9-2.9-5-5.9-5z" />
        </svg>
      </motion.div>

      <motion.div
        className="flex flex-col items-center gap-[1.6vmin]"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.35 }}
      >
        <h2 className="text-[6vmin] leading-tight font-extrabold text-white drop-shadow-[0_4px_18px_rgba(6,40,61,0.5)]">
          {isFirstStage ? "يلا بنا نقف قدام الشاشة!" : "ارجع لمكانك قدام الشاشة!"}
        </h2>
        <p className="max-w-[46vw] text-[2.8vmin] leading-relaxed font-medium text-white/90">استعد لفرقعة الفقاعات</p>
      </motion.div>
    </div>
  );
}
