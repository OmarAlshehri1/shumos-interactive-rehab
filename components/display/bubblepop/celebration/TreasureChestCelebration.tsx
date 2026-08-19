"use client";

import { motion } from "motion/react";

interface TreasureChestCelebrationProps {
  /** A bigger, more prominent glow for the session-complete finale than the plain stage-5 moment. */
  big?: boolean;
}

/** Stage 5's celebration, and the session-complete finale (task section 49/50) — a treasure chest opens and a giant glowing pearl rises. */
export function TreasureChestCelebration({ big = false }: TreasureChestCelebrationProps) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
      <motion.div
        className="relative"
        initial={{ scale: 0.5, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 180, damping: 14 }}
      >
        <svg viewBox="0 0 100 70" className={big ? "h-[20vmin] w-[28vmin]" : "h-[14vmin] w-[20vmin]"}>
          <rect x="10" y="34" width="80" height="30" rx="6" fill="#8B5A2B" stroke="#5E3A1A" strokeWidth="2" />
          <path d="M10 34 a40 22 0 0 1 80 0 Z" fill="#A9702F" stroke="#5E3A1A" strokeWidth="2" />
          <rect x="44" y="30" width="12" height="10" rx="2" fill="#F2C94C" />
        </svg>
        <motion.div
          className="absolute left-1/2 top-0 h-[6vmin] w-[6vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(255,245,220,0.95) 0%, rgba(255,224,160,0.5) 55%, rgba(255,224,160,0) 75%)" }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: [0, 1, 0.9], y: [8, -14, -10], scale: [0.6, 1.2, 1] }}
          transition={{ duration: 1.6, delay: 0.4, ease: "easeOut" }}
        />
      </motion.div>
    </div>
  );
}
