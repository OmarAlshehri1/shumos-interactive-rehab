"use client";

import { motion } from "motion/react";

const BUTTERFLIES = [
  { top: "22%", hue: "#F2924C", delay: 0, duration: 2.4 },
  { top: "40%", hue: "#E86FA0", delay: 0.25, duration: 2.7 },
  { top: "58%", hue: "#F2C94C", delay: 0.1, duration: 2.5 },
  { top: "72%", hue: "#F2924C", delay: 0.35, duration: 2.9 },
] as const;

/** Stage 2's celebration (task section 47) — a small flutter of butterflies crosses the wall. */
export function ButterflyCrossing() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {BUTTERFLIES.map((b, i) => (
        <motion.svg
          key={i}
          viewBox="0 0 20 14"
          className="absolute h-[3.2vmin] w-[4.4vmin]"
          style={{ top: b.top, opacity: 0.92 }}
          initial={{ left: "-8%" }}
          animate={{ left: "108%" }}
          transition={{ duration: b.duration, delay: b.delay, ease: "easeInOut" }}
        >
          <motion.g animate={{ scaleX: [1, 0.7, 1] }} transition={{ duration: 0.35, repeat: Infinity }}>
            <path d="M10 7 C10 2 4 0 2 3 C0 6 4 8 10 7 Z" fill={b.hue} />
            <path d="M10 7 C10 12 4 14 2 11 C0 8 4 6 10 7 Z" fill={b.hue} opacity="0.85" />
            <path d="M10 7 C10 2 16 0 18 3 C20 6 16 8 10 7 Z" fill={b.hue} />
            <path d="M10 7 C10 12 16 14 18 11 C20 8 16 6 10 7 Z" fill={b.hue} opacity="0.85" />
          </motion.g>
          <rect x="9.3" y="4" width="1.4" height="6" rx="0.7" fill="#3A2415" />
        </motion.svg>
      ))}
    </div>
  );
}
