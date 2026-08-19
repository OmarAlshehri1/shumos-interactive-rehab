"use client";

import { motion } from "motion/react";
import type { NormalizedPosition } from "@/lib/footsteps";

/** The persistent glowing trail left behind completed footprints (task section 48) — grows one segment at a time as the child advances. Static once drawn (no travel animation here — see PathLightTravel.tsx for the one-shot "light travels to destination" moment). */
export function PathTrail({ points }: { points: NormalizedPosition[] }) {
  if (points.length < 2) return null;
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x * 100} ${p.y * 100}`).join(" ");

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      <motion.path
        d={d}
        fill="none"
        stroke="rgba(180,200,255,0.4)"
        strokeWidth={0.35}
        strokeLinecap="round"
        strokeDasharray="0.2 1.6"
        vectorEffect="non-scaling-stroke"
        initial={false}
        animate={{ opacity: 0.6 }}
      />
    </svg>
  );
}
