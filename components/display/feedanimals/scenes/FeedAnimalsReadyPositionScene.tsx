"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import type { StageNumber } from "@/lib/feedanimals";
import type { DisplayEventListener } from "@/components/display/events";

interface FeedAnimalsReadyPositionSceneProps {
  childName: string;
  stageNumber: StageNumber;
  startingStage: StageNumber;
  onEvent: DisplayEventListener;
}

/**
 * WALL-PROJECTION READY POSITION (task section 6) — this game's own
 * analogue to Bubble Pop Wall's Ready Position scene: the child stands BACK
 * from this wall and reaches toward it, so no floor marker is drawn. A
 * simple calm center marker, no camera/wall sensor, same therapist-confirms
 * model as every other game. Fires its own `feed_animals_ready_position`
 * event (task's suggested line: "يلا يا {name}، وقف قدام الشاشة وخلك
 * جاهز!").
 */
export function FeedAnimalsReadyPositionScene({ childName, stageNumber, startingStage, onEvent }: FeedAnimalsReadyPositionSceneProps) {
  const isFirstStage = stageNumber === startingStage;

  const firedForStageRef = useRef<number | null>(null);
  useEffect(() => {
    if (firedForStageRef.current === stageNumber) return;
    firedForStageRef.current = stageNumber;
    onEvent({ type: "feed_animals_ready_position", timestamp: Date.now(), childName, isFirstStage });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childName, stageNumber]);

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-[5vmin] px-8 text-center">
      {/* Marker gets a beat to register on its own before the text follows (see delay below) — same
          "marker stays visually dominant" sequencing as the other two games' ready/start scenes. */}
      <motion.div
        className="relative flex h-[22vmin] w-[22vmin] items-center justify-center rounded-full border-2 border-dashed border-white/55 bg-white/10"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(255,214,140,0.4) 0%, rgba(255,214,140,0) 70%)" }}
          animate={{ opacity: [0.5, 0.9, 0.5], scale: [1, 1.08, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
        <span className="relative text-[9vmin]" aria-hidden="true">
          🧍
        </span>
      </motion.div>

      <motion.div
        className="flex flex-col items-center gap-[1.6vmin]"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.35 }}
      >
        <h2 className="text-[6vmin] leading-tight font-extrabold text-white drop-shadow-[0_4px_18px_rgba(90,60,10,0.5)]">
          {isFirstStage ? "يلا بنا نقف قدام الشاشة!" : "ارجع لمكانك قدام الشاشة!"}
        </h2>
        <p className="max-w-[46vw] text-[2.8vmin] leading-relaxed font-medium text-white/90">استعد لمساعدة الحيوانات الجائعة</p>
      </motion.div>
    </div>
  );
}
