"use client";

import { motion } from "motion/react";

const FISH = [
  { top: "25%", hue: "#F2C94C", delay: 0, duration: 2.6 },
  { top: "45%", hue: "#F2924C", delay: 0.3, duration: 3 },
  { top: "62%", hue: "#F2C94C", delay: 0.15, duration: 2.8 },
] as const;

/** Stage 2's celebration (task section 49) — a small friendly school of fish swims across the wall. */
export function FishSwimThrough() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {FISH.map((fish, i) => (
        <motion.div
          key={i}
          className="absolute h-[3vmin] w-[5vmin] rounded-[45%]"
          style={{ top: fish.top, background: fish.hue, opacity: 0.9 }}
          initial={{ left: "-10%" }}
          animate={{ left: "110%" }}
          transition={{ duration: fish.duration, delay: fish.delay, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}
