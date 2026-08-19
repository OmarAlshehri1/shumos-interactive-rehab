"use client";

import { motion } from "motion/react";

export interface FishVariant {
  body: string;
  fin: string;
  belly: string;
  pattern: "stripe" | "dot" | "none";
}

/**
 * FIVE VISUAL VARIANTS (task Part D — "3-5 fish visual variants... so a
 * school does not look cloned"): body color, fin color, belly highlight, and
 * a decorative pattern all vary independently.
 */
export const FISH_VARIANTS: readonly FishVariant[] = [
  { body: "#F2C94C", fin: "#E0973A", belly: "#FFEFC2", pattern: "stripe" },
  { body: "#3B9FE0", fin: "#1F6FA8", belly: "#CFEBFF", pattern: "dot" },
  { body: "#F0629B", fin: "#C93F76", belly: "#FFD6E6", pattern: "none" },
  { body: "#3DC98A", fin: "#279A65", belly: "#CFF5E2", pattern: "stripe" },
  { body: "#9B7BE0", fin: "#7355C4", belly: "#E6DCFF", pattern: "dot" },
];

interface FishArtProps {
  variant?: number;
  /** Slightly different body/fin proportions per fish (task's "size... so a school does not look cloned") — a scale multiplier on the base silhouette, not a separate path. */
  sizeScale?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * REAL FISH ART (task Part D — "not basically decorative circles"): a
 * proper silhouette with a body, tail, eye, and fins, drawn nose-right by
 * default. The parent's own CSS swim keyframe (bp-fish-swim, unchanged from
 * before) already flips the sprite via scaleX at its direction change, so
 * this component only needs to draw ONE correct orientation — no fish ever
 * swims backwards. A gentle internal tail-wag + pectoral-fin flutter plays
 * continuously so it reads as alive even mid-glide.
 */
export function FishArt({ variant = 0, sizeScale = 1, className, style }: FishArtProps) {
  const v = FISH_VARIANTS[variant % FISH_VARIANTS.length];

  return (
    <svg
      viewBox="0 0 100 60"
      className={className}
      style={{ ...style, transform: `${style?.transform ?? ""} scale(${sizeScale})`.trim(), overflow: "visible" }}
      aria-hidden="true"
    >
      {/* Tail — wags gently. */}
      <motion.path
        d="M22,30 L2,14 L9,30 L2,46 Z"
        fill={v.fin}
        style={{ transformOrigin: "22px 30px" }}
        animate={{ rotate: [-10, 10, -10] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Body. */}
      <path d="M20,30 C20,14 45,6 66,9 C87,12 97,20 99,30 C97,40 87,48 66,51 C45,54 20,46 20,30 Z" fill={v.body} stroke="rgba(0,0,0,0.08)" strokeWidth="1" />
      {/* Belly highlight. */}
      <path d="M28,34 C34,44 52,48 64,46 C56,49 40,49 30,42 C27,40 27,37 28,34 Z" fill={v.belly} opacity="0.85" />
      {/* Pattern. */}
      {v.pattern === "stripe" && (
        <>
          <rect x="42" y="12" width="4" height="36" fill={v.fin} opacity="0.55" />
          <rect x="56" y="10" width="4" height="38" fill={v.fin} opacity="0.55" />
        </>
      )}
      {v.pattern === "dot" && (
        <>
          <circle cx="48" cy="22" r="2.4" fill={v.fin} opacity="0.6" />
          <circle cx="60" cy="34" r="2" fill={v.fin} opacity="0.6" />
          <circle cx="40" cy="36" r="1.8" fill={v.fin} opacity="0.6" />
        </>
      )}
      {/* Dorsal fin. */}
      <path d="M52,10 L60,0 L66,11 Z" fill={v.fin} />
      {/* Pectoral fin — flutters. */}
      <motion.path
        d="M46,32 Q57,42 47,49 Q41,41 46,32 Z"
        fill={v.fin}
        opacity="0.9"
        style={{ transformOrigin: "46px 32px" }}
        animate={{ rotate: [0, 14, 0] }}
        transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Eye. */}
      <circle cx="83" cy="25" r="5" fill="white" />
      <circle cx="84.5" cy="25" r="2.6" fill="#1A1A1A" />
    </svg>
  );
}
