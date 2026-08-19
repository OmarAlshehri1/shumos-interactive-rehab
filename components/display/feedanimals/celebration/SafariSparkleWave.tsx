"use client";

import { motion } from "motion/react";

const SPARKLES = Array.from({ length: 11 }, (_, i) => ({
  left: `${4 + i * 9}%`,
  delay: (i % 4) * 0.12,
}));

/** Stage 4's celebration (task section 47) — a warm wave of golden sparkles sweeps across the savanna grass at the base of the wall. */
export function SafariSparkleWave() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[26vh] overflow-hidden" aria-hidden="true">
      {SPARKLES.map((s, i) => (
        <motion.span
          key={i}
          className="absolute bottom-[12%] h-[1.5vmin] w-[1.5vmin] rounded-full bg-amber-200"
          style={{ left: s.left, boxShadow: "0 0 1.1vmin rgba(255,214,140,0.9)" }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: [0, 1, 0], y: [8, -12, -20] }}
          transition={{ duration: 1.3, delay: s.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}
