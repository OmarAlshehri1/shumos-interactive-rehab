"use client";

import { motion } from "motion/react";
import type { StageNumber } from "@/lib/footsteps";

interface DestinationStarProps {
  /** 0-1 — how close the stage is to complete; the destination glows brighter as it climbs. */
  progress: number;
  /** True once every footprint is confirmed — triggers the "light travels through the path -> destination activates" moment (handled by the parent scene's timing; this just renders the activated look). */
  activated: boolean;
  /** Modest presentation variety across stages (task section 25) — same visual language, not a redesign per stage. Defaults to the plain star if omitted. */
  stageNumber?: StageNumber;
}

/** نجمة الهدف — the stage's magical destination. Glows softly at stage start and brightens as the child advances; fully activates on the final step. */
export function DestinationStar({ progress, activated, stageNumber = 1 }: DestinationStarProps) {
  const glowScale = 0.7 + Math.min(1, progress) * 0.5;
  const glowOpacity = activated ? 1 : 0.35 + Math.min(1, progress) * 0.5;
  const hasGate = stageNumber >= 2;
  const isPortal = stageNumber >= 5;

  return (
    <div className="pointer-events-none absolute" style={{ transform: "translate(-50%, -50%)" }} aria-hidden="true">
      <motion.div
        className="absolute rounded-full"
        style={{
          inset: isPortal ? "-190%" : "-140%",
          // STAR-GLOW FIX: `closest-side` ties the fade to this box's own
          // near edge (guaranteed no visible cutoff regardless of aspect
          // ratio) instead of the default farthest-corner sizing, which —
          // combined with the wrapper's non-square box before the
          // lineHeight fix below — was clipping the glow's left/right edges
          // mid-fade, reading as a visible rectangular boundary.
          background: "radial-gradient(circle closest-side, rgba(255,236,180,0.9) 0%, rgba(255,236,180,0) 100%)",
        }}
        animate={{ opacity: activated ? [0.7, 1, 0.7] : glowOpacity, scale: activated ? [1, 1.25, 1] : glowScale }}
        transition={activated ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.5 }}
      />

      {/* A thin rotating ring — stage 2+'s "gate," a little grander again from stage 5 ("portal"). */}
      {hasGate && (
        <motion.div
          className="absolute rounded-full border-2"
          style={{
            inset: isPortal ? "-95%" : "-65%",
            borderColor: "rgba(200,215,255,0.55)",
            borderStyle: isPortal ? "double" : "solid",
          }}
          animate={{ rotate: 360, opacity: activated ? [0.5, 0.9, 0.5] : 0.5 }}
          transition={{
            rotate: { duration: isPortal ? 14 : 22, repeat: Infinity, ease: "linear" },
            opacity: activated ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.5 },
          }}
        />
      )}
      {isPortal && (
        <motion.div
          className="absolute rounded-full border"
          style={{ inset: "-135%", borderColor: "rgba(220,200,255,0.4)" }}
          animate={{ rotate: -360 }}
          transition={{ duration: 26, repeat: Infinity, ease: "linear" }}
        />
      )}

      <motion.span
        className="relative block text-[clamp(20px,4.5vmin,54px)]"
        // STAR-GLOW FIX: without an explicit line-height, Tailwind's
        // preflight leaves this at 1.5× font-size, making the span's box
        // ~1em wide × 1.5em tall — every absolutely-positioned glow/ring
        // layer above inherits that non-square shrink-to-fit box, so their
        // `inset: X%` (resolved against width vs height separately per the
        // CSS spec) produced a visibly non-circular glow. lineHeight: 1
        // makes the box ~square, so every layer above renders as a true
        // circle/ellipse-free glow.
        style={{ lineHeight: 1 }}
        animate={{ scale: activated ? [1, 1.18, 1] : 1, rotate: activated ? [0, 8, -8, 0] : 0 }}
        transition={activated ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" } : { duration: 0.4 }}
      >
        {isPortal ? "🌟" : "⭐"}
      </motion.span>
    </div>
  );
}
