"use client";

import { motion } from "motion/react";
import { BubbleColor, type BubbleShape } from "@/lib/bubblepop";
import { BUBBLE_COLOR_HEX } from "../bubbleColors";
import { ShapeGlyph } from "../ShapeGlyph";

interface PearlStationProps {
  color: BubbleColor;
  /** Set on a color+shape station (task Part G) — renders a shape glyph over the pearl so the candidate reads as "نجمة زرقاء", not just a blue pearl. Undefined for a plain color station. */
  shape?: BubbleShape;
  /** True for the brief moment right after a CORRECT station press — the station "lights up" before the energy pulse launches (task section 1/7). */
  pulsing: boolean;
  /** True for the brief moment right after a WRONG station press — a gentle wobble, never a harsh error (task section 9). */
  wobbling: boolean;
}

/**
 * PEARL / SHELL STATION (task section 1) — a beautiful shell/coral base with
 * a large glowing colored pearl, deliberately NOT a rectangular UI button.
 * The whole element is one magical underwater object; /control's StationBar
 * is the therapist-facing plain equivalent of this exact station set (same
 * getBubbleStagePlan source, so the layouts always agree).
 */
export function PearlStation({ color, shape, pulsing, wobbling }: PearlStationProps) {
  const hex = BUBBLE_COLOR_HEX[color];

  return (
    <motion.div
      className="relative flex aspect-square w-full items-end justify-center"
      animate={wobbling ? { x: [0, -5, 5, -3, 3, 0], rotate: [0, -2, 2, -1, 1, 0] } : { x: 0, rotate: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Glow halo — flares on a correct press, otherwise a soft idle breathe. */}
      <motion.span
        className="pointer-events-none absolute top-[8%] left-1/2 -translate-x-1/2 rounded-full"
        style={{ width: "72%", height: "72%", background: `radial-gradient(circle, ${hex}99 0%, ${hex}00 72%)` }}
        animate={pulsing ? { opacity: [0.5, 1, 0.5], scale: [1, 1.35, 1.1] } : { opacity: [0.35, 0.55, 0.35], scale: [1, 1.05, 1] }}
        transition={pulsing ? { duration: 0.5, ease: "easeOut" } : { duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Shell base. */}
      <svg viewBox="0 0 100 60" className="absolute bottom-0 h-[46%] w-[92%]" style={{ filter: "drop-shadow(0 0.6vmin 0.8vmin rgba(0,20,30,0.4))" }} aria-hidden="true">
        <defs>
          <radialGradient id={`shell-fill-${color}`} cx="50%" cy="10%" r="90%">
            <stop offset="0%" stopColor="#FFF7EC" />
            <stop offset="60%" stopColor="#F3DEC0" />
            <stop offset="100%" stopColor="#D8B78E" />
          </radialGradient>
        </defs>
        <path d="M50 2 C75 2 96 26 96 56 L4 56 C4 26 25 2 50 2 Z" fill={`url(#shell-fill-${color})`} stroke="#B98F5F" strokeWidth="1.5" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <line key={i} x1="50" y1="10" x2={14 + i * 12} y2="55" stroke="#B98F5F" strokeWidth="1" opacity="0.5" />
        ))}
      </svg>

      {/* Pearl. */}
      <motion.svg
        viewBox="0 0 100 100"
        className="relative z-10 h-[64%] w-[64%]"
        style={{ filter: "drop-shadow(0 0.5vmin 1vmin rgba(0,20,30,0.45))" }}
        animate={{ y: [0, -3, 0] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden="true"
      >
        <defs>
          <radialGradient id={`pearl-fill-${color}`} cx="36%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="35%" stopColor={hex} stopOpacity="0.85" />
            <stop offset="100%" stopColor={hex} />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="46" fill={`url(#pearl-fill-${color})`} stroke="rgba(255,255,255,0.8)" strokeWidth="2" />
        <ellipse cx="35" cy="32" rx="13" ry="8" fill="rgba(255,255,255,0.8)" transform="rotate(-25 35 32)" />
      </motion.svg>

      {shape && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <ShapeGlyph shape={shape} className="h-[34%] w-[34%]" fill="rgba(255,255,255,0.95)" />
        </div>
      )}
    </motion.div>
  );
}
