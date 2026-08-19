"use client";

import { motion } from "motion/react";

interface CheckpointStarProps {
  /** True once the child has confirmed the target this checkpoint sits on. */
  activated: boolean;
}

/**
 * JOURNEY REDESIGN — a milestone star along MEDIUM/ADVANCED routes,
 * deliberately smaller and calmer than DestinationStar.tsx (task section 7:
 * "small star = milestone, big star = final goal"). No gate/portal rings —
 * those are reserved for the stage's one true destination. Built with the
 * same closest-side-gradient + lineHeight:1 technique DestinationStar.tsx
 * uses (see its own comments) so this component never has the square-glow
 * bug to begin with.
 */
export function CheckpointStar({ activated }: CheckpointStarProps) {
  return (
    <div className="pointer-events-none absolute" style={{ transform: "translate(-50%, -50%)" }} aria-hidden="true">
      <motion.div
        className="absolute rounded-full"
        style={{
          inset: "-90%",
          background: "radial-gradient(circle closest-side, rgba(210,225,255,0.75) 0%, rgba(210,225,255,0) 100%)",
        }}
        animate={{ opacity: activated ? [0.55, 0.8, 0.55] : 0.3, scale: activated ? [1, 1.35, 1] : 0.85 }}
        transition={activated ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" } : { duration: 0.4 }}
      />

      <motion.span
        className="relative block text-[clamp(12px,2.6vmin,30px)]"
        style={{ lineHeight: 1 }}
        initial={false}
        animate={activated ? { scale: [0.8, 1.3, 1], opacity: 1 } : { scale: 0.8, opacity: 0.55 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        ⭐
      </motion.span>
    </div>
  );
}
