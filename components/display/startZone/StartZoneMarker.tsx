"use client";

import { motion } from "motion/react";
import { START_ZONE } from "@/lib/game";

/**
 * TASK 8.2 — the projected Child Start Zone: a soft white square marking
 * where the child stands before every stage. Position/size come from
 * lib/game/startZone.ts's normalized rect — the SAME numbers
 * components/control/live/BalloonMap.tsx uses for its own copy of this
 * marker, and the SAME numbers stageGenerator.ts excludes balloons from —
 * one source of truth, so /display, /control, and the balloon layout can
 * never drift apart. See that file's doc comment for the orientation
 * assumption (y=1 is the child/front edge).
 *
 * Two variants: "prominent" (StartZoneScene — bright, glowing, breathing
 * outline, labeled) and "subdued" (PlayingScene — a quiet, low-opacity
 * reference so the child always knows where "home" is without it competing
 * with the balloons). Purely decorative; there is no camera/floor sensor,
 * so this never reacts to anything — a human (the therapist) is what
 * confirms the child is actually standing here.
 */
export function StartZoneMarker({ variant }: { variant: "prominent" | "subdued" }) {
  const isProminent = variant === "prominent";

  const rectStyle: React.CSSProperties = {
    position: "absolute",
    left: `${START_ZONE.xMin * 100}%`,
    top: `${START_ZONE.yMin * 100}%`,
    width: `${(START_ZONE.xMax - START_ZONE.xMin) * 100}%`,
    height: `${(START_ZONE.yMax - START_ZONE.yMin) * 100}%`,
  };

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <motion.div
        style={rectStyle}
        initial={false}
        animate={{ opacity: isProminent ? 1 : 0.4 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      >
        {/* Soft glow beneath the surface — the "presence" cue, strongest when prominent. */}
        <motion.div
          className="absolute rounded-[6vmin]"
          style={{
            inset: "-18%",
            background: "radial-gradient(ellipse at 50% 55%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 72%)",
          }}
          animate={isProminent ? { opacity: [0.5, 0.85, 0.5] } : { opacity: 0.22 }}
          transition={isProminent ? { duration: 3.4, repeat: Infinity, ease: "easeInOut" } : { duration: 0.6 }}
        />

        {/* The white surface itself. */}
        <div
          className="absolute inset-0 rounded-[3vmin]"
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.88) 100%)",
            boxShadow: isProminent ? "0 10px 34px rgba(60,30,90,0.28)" : "0 4px 16px rgba(60,30,90,0.12)",
          }}
        />

        {/* Gentle breathing outline — only animates while prominent. */}
        <motion.div
          className="absolute inset-0 rounded-[3vmin]"
          style={{ border: "0.55vmin solid rgba(255,255,255,0.95)" }}
          animate={isProminent ? { opacity: [0.35, 0.9, 0.35], scale: [1, 1.012, 1] } : { opacity: 0.5, scale: 1 }}
          transition={isProminent ? { duration: 2.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.4 }}
        />

        {/* Very subtle standing-position indication — two small footprints, never literal/cartoonish. */}
        <div
          className="absolute inset-0 flex items-center justify-center gap-[1.4vmin]"
          style={{ opacity: isProminent ? 0.32 : 0.16 }}
        >
          <Footprint mirrored={false} />
          <Footprint mirrored />
        </div>

        {isProminent && (
          <motion.span
            className="absolute inset-x-0 -top-[6vmin] text-center text-[2.3vmin] font-bold whitespace-nowrap text-white drop-shadow-[0_2px_10px_rgba(60,30,90,0.45)]"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.5 }}
          >
            مكان وقوف الطفل
          </motion.span>
        )}
      </motion.div>
    </div>
  );
}

function Footprint({ mirrored }: { mirrored: boolean }) {
  return (
    <svg
      viewBox="0 0 24 40"
      className="h-[6.5vmin] w-auto"
      style={{ transform: mirrored ? "scaleX(-1)" : undefined }}
      fill="rgba(110,100,145,0.55)"
    >
      <ellipse cx="12" cy="27" rx="8.5" ry="12.5" />
      <circle cx="5.5" cy="8" r="2.8" />
      <circle cx="11.5" cy="4.5" r="3" />
      <circle cx="17.5" cy="6.5" r="2.8" />
      <circle cx="21.5" cy="12" r="2.2" />
    </svg>
  );
}
