"use client";

import { useEffect } from "react";
import { motion } from "motion/react";

interface EnergyPulseProps {
  from: { x: number; y: number };
  to: { x: number; y: number };
  hex: string;
  /** Task Part A's "~250-450ms depending on distance" — computed by the caller from the actual station-to-bubble distance, see BubblePopPlayingScene's PULSE_MIN/MAX_MS. */
  durationMs: number;
  onArrive: () => void;
}

/**
 * THE MAGICAL WATER-ENERGY PULSE (task section 7, Phase 2 Part A) — the
 * single most important visual link in the redesign: it makes "I pressed
 * here, and that bubble popped there" legible to the child. `to` is a
 * PREDICTED impact point (the bubble's own deterministic motion function
 * evaluated at "now + durationMs" — see bubbleMotion.ts), so the pulse
 * visibly hits the bubble at the exact moment it arrives there, never a
 * stale destination. A glowing orb with a soft trailing streak travels from
 * the pressed station to that point, then hands off to the water-pop burst
 * via onArrive — the caller is responsible for NOT popping the bubble (or
 * revealing the next mission) until onArrive fires (task's non-negotiable
 * "station -> pulse -> impact -> pop" causal order).
 */
export function EnergyPulse({ from, to, hex, durationMs, onArrive }: EnergyPulseProps) {
  useEffect(() => {
    const timer = setTimeout(onArrive, durationMs);
    return () => clearTimeout(timer);
  }, [onArrive, durationMs]);

  const seconds = durationMs / 1000;

  return (
    <>
      {/* Trailing streak, drawn as a thin glowing line between the two points. */}
      <motion.div
        className="pointer-events-none absolute h-[0.7vmin] origin-left rounded-full"
        style={{
          left: `${from.x * 100}%`,
          top: `${from.y * 100}%`,
          width: `${Math.hypot((to.x - from.x) * 100, (to.y - from.y) * 100)}vmin`,
          background: `linear-gradient(90deg, ${hex}00, ${hex}EE)`,
          rotate: `${(Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI}deg`,
          boxShadow: `0 0 1.2vmin ${hex}99`,
        }}
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: [0, 1, 0.7], scaleX: 1 }}
        transition={{ duration: seconds, ease: "easeIn" }}
      />
      {/* The pulse orb itself. */}
      <motion.div
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ width: "4.6vmin", height: "4.6vmin", background: `radial-gradient(circle, white 0%, ${hex} 55%, ${hex}00 75%)` }}
        initial={{ left: `${from.x * 100}%`, top: `${from.y * 100}%`, opacity: 0.95, scale: 0.45 }}
        animate={{ left: `${to.x * 100}%`, top: `${to.y * 100}%`, opacity: [0.95, 1, 0.85], scale: [0.45, 1.2, 0.95] }}
        transition={{ duration: seconds, ease: "easeIn" }}
      />
    </>
  );
}
