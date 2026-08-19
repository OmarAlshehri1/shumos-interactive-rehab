"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import type { Footprint, NormalizedPosition, RouteCheckpoint, StageNumber } from "@/lib/footsteps";
import { stageOrdinalAr } from "@/components/display/copy";
import type { DisplayEventListener } from "@/components/display/events";
import { ConstellationIllumination } from "../celebration/ConstellationIllumination";
import { CosmicSparkleBurst } from "../celebration/CosmicSparkleBurst";
import { PathLightTravel } from "../celebration/PathLightTravel";
import { ShootingStars } from "../celebration/ShootingStars";
import { CheckpointStar } from "../path/CheckpointStar";
import { DestinationStar } from "../path/DestinationStar";

// Task section 53 — a distinct cosmic celebration per stage, mirroring
// Balloon Quest's own per-stage escalation (StageCompleteScene.tsx) but
// sharing none of its visual language (no rising balloons, no confetti).
const CELEBRATION_DURATION_MS: Record<StageNumber, number> = { 1: 4200, 2: 4600, 3: 5600, 4: 5800, 5: 6000 };

interface FootstepsStageCompleteSceneProps {
  childFirstName: string;
  stageNumber: StageNumber;
  stepsCompleted: number;
  footprints: Footprint[];
  checkpoints: RouteCheckpoint[];
  destination: NormalizedPosition;
  onDone: () => void;
  onEvent: DisplayEventListener;
}

export function FootstepsStageCompleteScene({
  childFirstName,
  stageNumber,
  stepsCompleted,
  footprints,
  checkpoints,
  destination,
  onDone,
  onEvent,
}: FootstepsStageCompleteSceneProps) {
  const [destinationActivated, setDestinationActivated] = useState(false);

  const firedForStageRef = useRef<number | null>(null);
  useEffect(() => {
    if (firedForStageRef.current !== stageNumber) {
      firedForStageRef.current = stageNumber;
      onEvent({ type: "footsteps_stage_complete", timestamp: Date.now(), childName: childFirstName, stageNumber });
    }
    const timer = setTimeout(onDone, CELEBRATION_DURATION_MS[stageNumber]);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageNumber]);

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
      <motion.div
        className="absolute inset-0"
        style={{ background: "radial-gradient(circle at 50% 55%, rgba(140,120,220,0.5) 0%, rgba(140,120,220,0) 60%)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      />

      <PathLightTravel points={footprints.map((f) => f.position)} destination={destination} onComplete={() => setDestinationActivated(true)} />

      {/* JOURNEY REDESIGN — every checkpoint this stage had is, by definition, already reached by the time the stage completes; illuminate them together with the destination so the whole journey pays off, not just its final star. */}
      {checkpoints.map((checkpoint) => (
        <div key={checkpoint.id} className="absolute" style={{ left: `${checkpoint.position.x * 100}%`, top: `${checkpoint.position.y * 100}%` }}>
          <CheckpointStar activated={destinationActivated} />
        </div>
      ))}

      <div className="absolute" style={{ left: `${destination.x * 100}%`, top: `${destination.y * 100}%` }}>
        <DestinationStar progress={1} activated={destinationActivated} stageNumber={stageNumber} />
      </div>

      {stageNumber === 1 && <CosmicSparkleBurst />}
      {stageNumber === 2 && <ShootingStars count={3} />}
      {stageNumber >= 3 && (
        <>
          <ConstellationIllumination />
          <CosmicSparkleBurst big={stageNumber >= 4} />
        </>
      )}

      <motion.div
        className="relative z-10 flex flex-col items-center gap-[1.6vmin] px-8 text-center"
        initial={{ opacity: 0, scale: 0.85, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 210, damping: 16, delay: 0.5 }}
      >
        <h2 className="text-[6.5vmin] leading-tight font-extrabold text-white drop-shadow-[0_4px_18px_rgba(20,15,60,0.5)]">
          أحسنت يا {childFirstName}! ⭐
        </h2>
        <p className="text-[3.4vmin] font-semibold text-white/90">أضأت طريق المرحلة {stageOrdinalAr(stageNumber)}</p>
        <p className="text-[2.6vmin] font-bold text-white/80">{stepsCompleted} خطوة مضيئة</p>
      </motion.div>
    </div>
  );
}
