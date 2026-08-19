"use client";

import { motion } from "motion/react";

const SPARKLES = Array.from({ length: 10 }, (_, i) => ({
  left: `${5 + i * 9.5}%`,
  delay: (i % 4) * 0.12,
}));

/** Stage 4's celebration (task section 49) — a wave of sparkles sweeps across the coral at the base of the wall. */
export function CoralSparkleWave() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[24vh] overflow-hidden" aria-hidden="true">
      {SPARKLES.map((s, i) => (
        <motion.span
          key={i}
          className="absolute bottom-[10%] h-[1.4vmin] w-[1.4vmin] rounded-full bg-amber-100"
          style={{ left: s.left, boxShadow: "0 0 1vmin rgba(255,240,200,0.9)" }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: [0, 1, 0], y: [6, -10, -18] }}
          transition={{ duration: 1.2, delay: s.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}
