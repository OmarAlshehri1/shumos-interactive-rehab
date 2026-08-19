"use client";

import { motion } from "motion/react";

const PARTICLES = [
  { left: "12%", kind: "leaf", delay: 0 },
  { left: "24%", kind: "star", delay: 0.1 },
  { left: "38%", kind: "leaf", delay: 0.05 },
  { left: "50%", kind: "star", delay: 0.2 },
  { left: "62%", kind: "leaf", delay: 0.15 },
  { left: "76%", kind: "star", delay: 0.25 },
  { left: "88%", kind: "leaf", delay: 0.1 },
] as const;

/** Stage 1's celebration (task section 47) — a gentle burst of leaves and stars rising from the base of the wall. */
export function LeafStarBurst() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {PARTICLES.map((p, i) => (
        <motion.span
          key={i}
          className="absolute"
          style={{ left: p.left, bottom: "-6%" }}
          initial={{ y: "6vh", opacity: 0, rotate: 0, scale: 0.6 }}
          animate={{ y: "-115vh", opacity: [0, 0.95, 0.8, 0], rotate: p.kind === "leaf" ? 220 : 0, scale: 1 }}
          transition={{ duration: 3.2, delay: p.delay, ease: "easeOut" }}
        >
          {p.kind === "leaf" ? (
            <svg viewBox="0 0 20 20" className="h-[3.4vmin] w-[3.4vmin]">
              <path d="M10 2 C16 4 18 10 14 16 C12 13 8 8 10 2 Z" fill="#7AAE4A" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" className="h-[2.8vmin] w-[2.8vmin]">
              <path d="M10 1l2.4 5.2 5.6.6-4.2 3.9 1.2 5.6L10 13.4l-4.9 2.9 1.2-5.6-4.2-3.9 5.6-.6z" fill="#F7D373" />
            </svg>
          )}
        </motion.span>
      ))}
    </div>
  );
}
