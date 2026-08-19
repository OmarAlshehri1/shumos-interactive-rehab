"use client";

import { motion } from "motion/react";

export interface AsteroidArtProps {
  /** "cleared" plays the FIRE-impact crack/break burst; "avoided" is a soft harmless fade (never an explosion) — task's "No punishment... No scary explosion." */
  outcome?: "cleared" | "avoided" | null;
}

/**
 * MEDIUM/ADVANCED's rocky obstacle — a custom irregular vector silhouette
 * with craters and soft space-lit shading (task's "proper custom SVG/vector
 * asteroids... rocky irregular silhouette, craters, subtle rotation, space
 * lighting. No emoji."). Deliberately reads as visually distinct from
 * CollectibleStarArt's bright golden five-point star: cool grey/brown rock
 * tones, no glow, a slow constant spin instead of a pulse.
 */
export function AsteroidArt({ outcome = null }: AsteroidArtProps) {
  return (
    <motion.div
      className="relative h-full w-full"
      animate={
        outcome === "cleared"
          ? { scale: [1, 1.15, 0], opacity: [1, 1, 0] }
          : outcome === "avoided"
            ? { opacity: [1, 0.6, 0], scale: [1, 0.92, 0.85] }
            : { rotate: 360 }
      }
      transition={outcome ? { duration: outcome === "cleared" ? 0.5 : 0.55, ease: "easeOut" } : { duration: 14, repeat: Infinity, ease: "linear" }}
    >
      {outcome !== "cleared" && (
        <svg viewBox="0 0 100 100" className="relative h-full w-full" style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.45))" }}>
          <defs>
            <radialGradient id="sp-asteroid-fill" cx="34%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#A8A296" />
              <stop offset="55%" stopColor="#786F62" />
              <stop offset="100%" stopColor="#453F37" />
            </radialGradient>
          </defs>
          <path
            d="M50 6 L68 14 L86 26 L94 46 L88 66 L74 84 L52 94 L30 88 L12 72 L6 50 L14 28 L30 12 Z"
            fill="url(#sp-asteroid-fill)"
            stroke="#2E2A24"
            strokeWidth="1.5"
          />
          <ellipse cx="40" cy="38" rx="9" ry="7" fill="#5B5347" opacity="0.8" />
          <ellipse cx="64" cy="55" rx="7" ry="6" fill="#5B5347" opacity="0.75" />
          <ellipse cx="46" cy="68" rx="6" ry="5" fill="#4A4438" opacity="0.7" />
          <ellipse cx="70" cy="30" rx="4.5" ry="4" fill="#4A4438" opacity="0.65" />
        </svg>
      )}

      {outcome === "cleared" && (
        <div className="relative h-full w-full">
          {/* Rocky fragments breaking apart with a glowing crack — never a violent explosion, just a soft energy break (task's "asteroid cracks -> breaks into harmless glowing fragments -> fragments fade"). */}
          {[
            { x: -18, y: -14, rot: -20 },
            { x: 16, y: -10, rot: 25 },
            { x: -12, y: 16, rot: 60 },
            { x: 14, y: 14, rot: -45 },
          ].map((frag, i) => (
            <motion.svg
              key={i}
              viewBox="0 0 24 24"
              className="absolute top-1/2 left-1/2 h-[38%] w-[38%]"
              initial={{ x: "-50%", y: "-50%", opacity: 1 }}
              animate={{ x: `calc(-50% + ${frag.x}px)`, y: `calc(-50% + ${frag.y}px)`, opacity: 0, rotate: frag.rot }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <path d="M4 4 L16 2 L20 12 L14 20 L2 16 Z" fill="#8B8375" stroke="#332F28" strokeWidth="1" />
            </motion.svg>
          ))}
          <motion.div
            className="pointer-events-none absolute inset-[-30%] rounded-full"
            style={{ background: "radial-gradient(circle, rgba(34,211,238,0.55) 0%, rgba(34,211,238,0) 70%)" }}
            initial={{ opacity: 0.9, scale: 0.5 }}
            animate={{ opacity: 0, scale: 1.4 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      )}
    </motion.div>
  );
}
