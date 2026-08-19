"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import type { StageNumber } from "@/lib/footsteps";
import { StartZoneMarker } from "@/components/display/startZone/StartZoneMarker";
import type { DisplayEventListener } from "@/components/display/events";

interface FootstepsStartZoneSceneProps {
  stageNumber: StageNumber;
  startingStage: StageNumber;
  onEvent: DisplayEventListener;
}

/**
 * Task section 56 — reuses the approved white Start Zone (StartZoneMarker)
 * unchanged, adding only cosmic integration around it: a soft outer glow,
 * tiny stars, and the destination faintly visible ahead — never
 * compromising the square's own clarity. Fires the SAME `start_zone` event
 * Balloon Quest's StartZoneScene fires — the spoken instruction is spec'd
 * with identical wording regardless of game (see AudioManager.ts's
 * `start_zone` case), so this is a genuinely shared platform moment.
 *
 * SPACING — structurally mirrors Balloon Quest's StartZoneScene.tsx: the
 * instruction text is a normal-flow child of a `flex-col items-center
 * justify-center` wrapper, so it centers in the FULL available height,
 * decoupled from StartZoneMarker's own absolute/percentage position (it
 * sits near the bottom of the screen, at START_ZONE.yMin). That's what
 * gives Balloon Quest its generous breathing room, and it's a floor-game
 * layout concern shared by both games — not something Follow the Footsteps
 * needs its own spacing system for. A previous version here instead pinned
 * the text a fixed vmin gap directly above the marker, which stayed
 * cramped no matter how that gap was tuned since it was structurally
 * coupled to the marker's own tight bounds.
 */
export function FootstepsStartZoneScene({ stageNumber, startingStage, onEvent }: FootstepsStartZoneSceneProps) {
  const isFirstStage = stageNumber === startingStage;

  const firedForStageRef = useRef<number | null>(null);
  useEffect(() => {
    if (firedForStageRef.current === stageNumber) return;
    firedForStageRef.current = stageNumber;
    onEvent({ type: "start_zone", timestamp: Date.now(), isFirstStage });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageNumber]);

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center px-8 text-center">
      {/* Cosmic outer glow + tiny stars around the Start Zone, without touching the marker itself. */}
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 h-[38vmin] w-[38vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(123,92,214,0.35) 0%, rgba(123,92,214,0) 70%)" }}
        aria-hidden="true"
      />
      {/* Destination faintly visible ahead, toward the far side of the floor. */}
      <span className="pointer-events-none absolute top-[14%] left-1/2 -translate-x-1/2 text-[3vmin] opacity-40" aria-hidden="true">
        ⭐
      </span>

      {/* The Ready/Start position marker — absolutely positioned at its own START_ZONE percentage rect, so it doesn't take flex layout space. */}
      <StartZoneMarker variant="prominent" />

      {/* SUPPORTING TEXT — a normal flex child, centered in the full available height (same structure as Balloon Quest's StartZoneScene). */}
      <motion.p
        className="relative z-10 max-w-[46vw] text-[2.8vmin] leading-relaxed font-bold text-white drop-shadow-[0_3px_14px_rgba(20,15,60,0.5)]"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        {isFirstStage ? "قف في المربع الأبيض" : "ارجع للمربع الأبيض"}
      </motion.p>
    </div>
  );
}
