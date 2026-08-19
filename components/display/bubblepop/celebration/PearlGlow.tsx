"use client";

import { motion } from "motion/react";

/** Stage 3's celebration (task section 49) — a warm pearl glows and pulses at the center of the wall. */
export function PearlGlow() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
      <motion.div
        className="h-[16vmin] w-[16vmin] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,245,220,0.95) 0%, rgba(255,224,160,0.5) 55%, rgba(255,224,160,0) 75%)" }}
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: [0.4, 1.15, 1], opacity: [0, 1, 0.85] }}
        transition={{ duration: 1.4, ease: "easeOut" }}
      />
    </div>
  );
}
