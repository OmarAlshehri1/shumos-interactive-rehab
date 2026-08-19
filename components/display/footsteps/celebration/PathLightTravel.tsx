"use client";

import { motion } from "motion/react";
import type { NormalizedPosition } from "@/lib/footsteps";

interface PathLightTravelProps {
  points: NormalizedPosition[];
  destination: NormalizedPosition;
  onComplete?: () => void;
}

/**
 * Task section 16/48/49/53 — "as the child advances, the path itself should
 * gradually illuminate... final step: light travels through the completed
 * path -> destination activates." Renders a glowing point that travels along
 * every confirmed footprint in order, then on to the destination, once —
 * pure SVG/Motion, no canvas/physics.
 */
export function PathLightTravel({ points, destination, onComplete }: PathLightTravelProps) {
  const route = [...points, destination];
  if (route.length < 2) return null;

  const pathD = route.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x * 100} ${p.y * 100}`).join(" ");

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      <motion.path
        d={pathD}
        fill="none"
        stroke="rgba(255,236,180,0.85)"
        strokeWidth={0.4}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        initial={{ pathLength: 0, opacity: 0.9 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: "easeInOut" }}
        onAnimationComplete={onComplete}
      />
    </svg>
  );
}
