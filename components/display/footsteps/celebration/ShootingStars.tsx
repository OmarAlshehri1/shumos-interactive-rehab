"use client";

import { motion } from "motion/react";

const STREAKS = [
  { top: "18%", left: "20%", angle: 24, length: 22, delay: 0 },
  { top: "12%", left: "62%", angle: 18, length: 18, delay: 0.35 },
  { top: "30%", left: "40%", angle: 30, length: 20, delay: 0.7 },
];

/** A gentle scattering of shooting stars streaking across the sky, once — Stage 2's own celebration flourish (task section 53). Capped at 3 streaks, one-shot, never a strobe. */
export function ShootingStars({ count = 3 }: { count?: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {STREAKS.slice(0, count).map((s, i) => (
        <motion.div
          key={i}
          className="absolute h-[0.25vmin] w-[10vmin] rounded-full"
          style={{
            top: s.top,
            left: s.left,
            background: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.95) 100%)",
            transform: `rotate(${s.angle}deg)`,
          }}
          initial={{ opacity: 0, x: "-6vmin" }}
          animate={{ opacity: [0, 1, 0], x: `${s.length}vmin` }}
          transition={{ duration: 1, delay: s.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}
