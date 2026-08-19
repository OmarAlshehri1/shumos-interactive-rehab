"use client";

import { motion } from "motion/react";

interface JellyfishArtProps {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * REAL JELLYFISH ART (task Part D) — a soft translucent bell and trailing
 * tentacles, each animated with an independent gentle wave so they read as
 * soft and alive, never scary/realistic. The bell itself pulses slowly
 * (its own "gentle vertical float" per task, layered on top of the parent's
 * CSS drift for the actual travel motion).
 */
export function JellyfishArt({ className, style }: JellyfishArtProps) {
  const tentacles = [18, 32, 46, 54, 68, 82];
  return (
    <motion.svg
      viewBox="0 0 100 100"
      className={className}
      style={{ ...style, overflow: "visible" }}
      animate={{ y: [0, -3, 0] }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      aria-hidden="true"
    >
      <motion.path
        d="M10 40 C10 15 30 4 50 4 C70 4 90 15 90 40 C90 48 82 50 74 46 C68 52 60 50 56 44 C52 52 44 52 40 44 C34 50 26 52 20 46 C14 50 10 46 10 40 Z"
        fill="rgba(220,190,255,0.55)"
        stroke="rgba(255,255,255,0.7)"
        strokeWidth="1.5"
        animate={{ scaleY: [1, 1.06, 1], scaleX: [1, 0.97, 1] }}
        style={{ transformOrigin: "50px 25px" }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Inner glow. */}
      <ellipse cx="50" cy="26" rx="26" ry="16" fill="rgba(255,255,255,0.35)" />
      {/* Tentacles sway via a rotation transform (not a "d" path morph — SVG path
          strings aren't a Motion-animatable value type), anchored at their attachment
          point on the bell so each one reads as a gentle, independent wave. */}
      {tentacles.map((x, i) => (
        <motion.path
          key={x}
          d={`M${x} 44 C${x - 4} 60 ${x + 6} 72 ${x - 2} 90`}
          stroke="rgba(220,190,255,0.65)"
          strokeWidth={i % 2 === 0 ? 2.4 : 1.8}
          fill="none"
          strokeLinecap="round"
          style={{ transformOrigin: `${x}px 44px` }}
          animate={{ rotate: [-6, 6, -6] }}
          transition={{ duration: 2.2 + i * 0.15, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </motion.svg>
  );
}
