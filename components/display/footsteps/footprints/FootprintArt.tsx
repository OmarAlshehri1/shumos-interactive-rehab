"use client";

import { motion } from "motion/react";
import { Foot } from "@/lib/footsteps";

export type FootprintVisualState = "current" | "completed";

interface FootprintArtProps {
  foot: Foot;
  state: FootprintVisualState;
}

/**
 * Premium custom footprint artwork — clearly distinguishes LEFT/RIGHT
 * (mirrored silhouette + a small color tint difference), reads as
 * magical/dimensional rather than a flat clinical icon or road-sign marker.
 *
 * ONE-FOOTPRINT-AT-A-TIME (task sections 7-9): DISPLAY only ever asks for
 * two states now — "current" (the single obvious destination: strongest
 * glow, luminous edge, breathing pulse, orbiting star particles, a pool of
 * light, and a brief "gather and draw in" reveal on mount) and "completed"
 * (settles into a soft glowing trail/star marker, never a footprint shape
 * that could be mistaken for another target). There is no "next"/"preview"
 * rendering left to opt out of — CONTROL's own map (FootMap.tsx) is where a
 * therapist can still see the fuller picture; the child only ever sees one.
 */
export function FootprintArt({ foot, state }: FootprintArtProps) {
  const mirrored = foot === Foot.RIGHT;

  if (state === "completed") {
    return (
      <div className="relative flex h-full w-full items-center justify-center">
        <motion.div
          className="absolute h-[55%] w-[55%] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(180,200,255,0.55) 0%, rgba(180,200,255,0) 70%)" }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 0.7, scale: 1 }}
          transition={{ duration: 0.5 }}
        />
        <span className="relative text-[42%]" aria-hidden="true">
          ✦
        </span>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {/* Pool of light underneath, breathing pulse. */}
      <motion.div
        className="absolute h-[135%] w-[135%] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,225,150,0.52) 0%, rgba(255,225,150,0) 70%)" }}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: [0.55, 0.92, 0.55], scale: [1, 1.09, 1] }}
        transition={{ opacity: { duration: 2.2, repeat: Infinity, ease: "easeInOut", delay: 0.3 }, scale: { duration: 2.2, repeat: Infinity, ease: "easeInOut", delay: 0.3 } }}
      />
      <OrbitingParticles />

      {/* Reveal (task section 26): a point of light gathers, then the footprint draws in and its glow expands — ~380ms. The continuous "life" afterward comes from the pool of light + orbiting particles above, not a separate loop here. */}
      <motion.svg
        viewBox="0 0 24 34"
        className="relative h-[78%] w-[78%]"
        style={{
          transform: mirrored ? "scaleX(-1)" : undefined,
          filter: "drop-shadow(0 0 1.8vmin rgba(255,225,150,0.95)) drop-shadow(0 0 3.6vmin rgba(255,225,150,0.6))",
        }}
        initial={{ opacity: 0, scale: 0.15 }}
        animate={{ opacity: 1, scale: [0.15, 1.15, 1] }}
        transition={{ duration: 0.38, times: [0, 0.75, 1], ease: "easeOut" }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`fs-foot-gradient-${foot}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={foot === Foot.LEFT ? "#FFE3A3" : "#A8E9F0"} />
            <stop offset="100%" stopColor={foot === Foot.LEFT ? "#E8B454" : "#5FB9C9"} />
          </linearGradient>
        </defs>
        <path
          d="M12 2c3.5 0 5.5 3 5.5 7 0 2.4-.8 3.6-.4 6.2.4 2.6 2 5 2 9 0 4.6-2.8 8-7.1 8S5 28.8 5 24.2c0-4 1.6-6.4 2-9 .4-2.6-.4-3.8-.4-6.2 0-4 2-7 5.4-7Z"
          fill={`url(#fs-foot-gradient-${foot})`}
          stroke="rgba(255,255,255,0.6)"
          strokeWidth="0.6"
        />
      </motion.svg>
    </div>
  );
}

function OrbitingParticles() {
  const particles = [0, 1, 2];
  return (
    <>
      {particles.map((i) => (
        <motion.span
          key={i}
          className="absolute h-[6%] w-[6%] rounded-full bg-amber-100"
          style={{ boxShadow: "0 0 0.6vmin rgba(255,240,200,0.9)" }}
          animate={{
            x: [0, 14, 0, -14, 0],
            y: [-14, 0, 14, 0, -14],
            opacity: [0.9, 0.5, 0.9, 0.5, 0.9],
          }}
          transition={{ duration: 3 + i * 0.4, repeat: Infinity, ease: "linear", delay: i * 0.5 }}
        />
      ))}
    </>
  );
}
