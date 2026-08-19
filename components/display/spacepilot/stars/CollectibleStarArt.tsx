"use client";

import { motion } from "motion/react";

export interface CollectibleStarArtProps {
  /** Plays the outcome burst instead of the idle pulse — "collect" (bright compress+sparkle burst) or "miss" (a soft fade, never a failure visual). */
  outcome?: "collect" | "miss" | null;
}

/**
 * The level's LARGE collectible star — visually unmistakable from the tiny
 * decorative background stars (task's "The child should immediately
 * understand: هذه أجمعها"): much larger, bright golden/white, a strong soft
 * glow, a gentle pulse, and small orbiting sparkles.
 */
export function CollectibleStarArt({ outcome = null }: CollectibleStarArtProps) {
  return (
    <motion.div
      className="relative h-full w-full"
      animate={
        outcome === "collect"
          ? { scale: [1, 1.35, 0], opacity: [1, 1, 0] }
          : outcome === "miss"
            ? { opacity: [1, 0.5, 0], scale: [1, 0.9, 0.8] }
            : { scale: [1, 1.08, 1] }
      }
      transition={outcome ? { duration: outcome === "collect" ? 0.55 : 0.5, ease: "easeOut" } : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* Soft outer glow. */}
      <div
        className="pointer-events-none absolute inset-[-60%] rounded-full opacity-80"
        style={{ background: "radial-gradient(circle, rgba(255,236,163,0.55) 0%, rgba(255,236,163,0) 70%)" }}
      />

      {/* Orbiting sparkles. */}
      {outcome !== "miss" && (
        <motion.div className="pointer-events-none absolute inset-0" animate={{ rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: "linear" }}>
          {[0, 120, 240].map((deg) => (
            <span
              key={deg}
              className="absolute top-1/2 left-1/2 h-[12%] w-[12%] rounded-full bg-white opacity-90"
              style={{ transform: `rotate(${deg}deg) translate(85%) rotate(-${deg}deg)`, boxShadow: "0 0 6px 2px rgba(255,255,255,0.8)" }}
            />
          ))}
        </motion.div>
      )}

      <svg viewBox="0 0 100 100" className="relative h-full w-full" style={{ filter: "drop-shadow(0 0 10px rgba(251,191,36,0.85))" }}>
        <defs>
          <radialGradient id="sp-star-fill" cx="38%" cy="32%" r="70%">
            <stop offset="0%" stopColor="#FFFDF5" />
            <stop offset="45%" stopColor="#FFE58A" />
            <stop offset="100%" stopColor="#F5B93D" />
          </radialGradient>
        </defs>
        <path
          d="M50 4 L61.8 36.5 L96.5 38.2 L69.4 59.6 L79 92.8 L50 73.2 L21 92.8 L30.6 59.6 L3.5 38.2 L38.2 36.5 Z"
          fill="url(#sp-star-fill)"
          stroke="#FFFFFF"
          strokeWidth="1.5"
          strokeOpacity="0.7"
        />
      </svg>
    </motion.div>
  );
}
