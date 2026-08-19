"use client";

import { motion } from "motion/react";

const SHOWER_BUBBLES = [
  { left: "8%", size: 3.2, delay: 0 },
  { left: "18%", size: 2.4, delay: 0.15 },
  { left: "30%", size: 3.8, delay: 0.05 },
  { left: "42%", size: 2.6, delay: 0.3 },
  { left: "54%", size: 3.4, delay: 0.1 },
  { left: "66%", size: 2.8, delay: 0.25 },
  { left: "78%", size: 3.6, delay: 0.2 },
  { left: "90%", size: 2.5, delay: 0.35 },
] as const;

/** Stage 1's celebration (task section 49) — a gentle shower of bubbles rising from the bottom of the wall. */
export function BubbleShower() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {SHOWER_BUBBLES.map((b, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full border border-white/50 bg-white/15"
          style={{ left: b.left, bottom: "-10%", width: `${b.size}vmin`, height: `${b.size}vmin` }}
          initial={{ y: "10vh", opacity: 0 }}
          animate={{ y: "-120vh", opacity: [0, 0.8, 0.6, 0] }}
          transition={{ duration: 3.6, delay: b.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}
