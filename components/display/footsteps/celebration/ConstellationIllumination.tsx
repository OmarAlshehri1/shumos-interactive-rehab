"use client";

import { motion } from "motion/react";

const POINTS: readonly [number, number][] = [
  [15, 70],
  [30, 40],
  [55, 55],
  [72, 25],
  [88, 45],
];

/** Stage 3+'s own celebration flourish (task section 53): a small constellation draws itself, star by star. Fixed shape (not randomized) so it never hydration-mismatches; purely decorative and one-shot. */
export function ConstellationIllumination() {
  const pathD = POINTS.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full opacity-80" aria-hidden="true">
      <motion.path
        d={pathD}
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth={0.35}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.4, ease: "easeInOut", delay: 0.2 }}
      />
      {POINTS.map(([x, y], i) => (
        <motion.circle
          key={i}
          cx={x}
          cy={y}
          r={1.1}
          fill="white"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 + (i / POINTS.length) * 1.2, duration: 0.4 }}
        />
      ))}
    </svg>
  );
}
