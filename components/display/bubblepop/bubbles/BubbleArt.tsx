"use client";

import { motion } from "motion/react";
import { BubbleColor, BubbleShape } from "@/lib/bubblepop";
import { ShapeGlyph } from "../ShapeGlyph";

interface BubbleArtProps {
  color: BubbleColor;
  shape: BubbleShape;
}

const COLOR_HEX: Record<BubbleColor, string> = {
  [BubbleColor.RED]: "#F2555A",
  [BubbleColor.BLUE]: "#3B9FE0",
  [BubbleColor.YELLOW]: "#F2C94C",
  [BubbleColor.GREEN]: "#3DC98A",
  [BubbleColor.PURPLE]: "#9B7BE0",
  [BubbleColor.ORANGE]: "#F2924C",
  [BubbleColor.PINK]: "#F0629B",
};

/**
 * Premium custom bubble artwork (task section 9/12) — translucent body,
 * colored inner glow, highlight/reflection, subtle rim, gentle floating
 * motion, slight deformation/wobble. Deliberately never a plain flat
 * circle. TASK 33: every unpopped bubble renders with the SAME visual
 * weight regardless of whether it's the current target — no glow/ring here
 * ever hints at "this one" to the child; that information comes from
 * Mariam's spoken request only. (The therapist-side hint lives on /control's
 * BubbleMap instead — see that file's own doc comment.)
 */
export function BubbleArt({ color, shape }: BubbleArtProps) {
  const hex = COLOR_HEX[color];

  return (
    <motion.div
      className="relative h-full w-full"
      animate={{ y: [0, -3, 0, 2, 0], scaleX: [1, 1.03, 1, 0.98, 1], scaleY: [1, 0.97, 1, 1.02, 1] }}
      transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full" style={{ filter: "drop-shadow(0 0.4vmin 1vmin rgba(0,20,30,0.35))" }} aria-hidden="true">
        <defs>
          <radialGradient id={`bp-fill-${color}`} cx="38%" cy="32%" r="70%">
            <stop offset="0%" stopColor="white" stopOpacity="0.85" />
            <stop offset="28%" stopColor={hex} stopOpacity="0.55" />
            <stop offset="100%" stopColor={hex} stopOpacity="0.82" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="46" fill={`url(#bp-fill-${color})`} stroke="rgba(255,255,255,0.75)" strokeWidth="2.2" />
        {/* Highlight/reflection. */}
        <ellipse cx="34" cy="30" rx="12" ry="7" fill="rgba(255,255,255,0.75)" transform="rotate(-25 34 30)" />
        <ellipse cx="66" cy="70" rx="6" ry="3" fill="rgba(255,255,255,0.25)" />
      </svg>

      {shape !== BubbleShape.CIRCLE && (
        <div className="absolute inset-0 flex items-center justify-center">
          <ShapeGlyph shape={shape} />
        </div>
      )}
    </motion.div>
  );
}
