"use client";

import { motion } from "motion/react";
import type { FeedAnimalsObstacleKind } from "@/lib/feedanimals";

interface ObstacleArtProps {
  kind: FeedAnimalsObstacleKind;
  /** Rotates the whole obstacle to sit roughly perpendicular to the trail at this point — purely cosmetic. */
  headingDeg?: number;
  /** True for the one obstacle the animal is actively approaching (task's "make the obstacle clear" visible cue) — a soft pulsing glow, never text. */
  active?: boolean;
  /** True once this obstacle has been crossed — fades to a settled, no-longer-blocking look. */
  cleared?: boolean;
}

/**
 * SAFARI ANIMAL ADVENTURE — custom vector obstacle art (task's explicit "no
 * emoji as final art" for obstacles), one shape per FeedAnimalsObstacleKind:
 * a fallen branch, a small pit, a log, and a decorative rock cluster the
 * trail simply bends around. Legible from projector distance, same warm
 * Safari palette as the rest of the world.
 */
export function ObstacleArt({ kind, headingDeg = 0, active = false, cleared = false }: ObstacleArtProps) {
  // Rounded to 2 decimals — a many-significant-digit CSS `rotate(...deg)` string is exactly the kind
  // of value some browsers round-trip through their own CSSOM with slightly different precision than
  // what was originally rendered, which reliably tripped a (functionally harmless, dev-only) React
  // hydration mismatch warning here. A plain div, not motion.div, since this node's transform/opacity
  // are pure per-render values, never Motion-animated — the pulsing "approach" cue below (a separate
  // motion.span) still fully covers task's "make the obstacle clear" cue.
  const roundedHeadingDeg = Math.round(headingDeg * 100) / 100;
  return (
    <div className="relative h-full w-full" style={{ transform: `rotate(${roundedHeadingDeg}deg)`, opacity: cleared ? 0.55 : 1 }}>
      {active && (
        <motion.span
          className="pointer-events-none absolute inset-[-30%] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(255,214,140,0.55) 0%, rgba(255,214,140,0) 72%)" }}
          animate={{ opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      {kind === "BRANCH" && <FallenBranch />}
      {kind === "PIT" && <Pit />}
      {kind === "LOG" && <Log />}
      {kind === "ROCK" && <RockCluster />}
    </div>
  );
}

function FallenBranch() {
  return (
    <svg viewBox="0 0 100 60" className="h-full w-full" style={{ filter: "drop-shadow(0 0.5vmin 0.8vmin rgba(40,30,10,0.35))" }} aria-hidden="true">
      <path d="M4 40 Q50 16 96 32" stroke="#6B4226" strokeWidth="11" fill="none" strokeLinecap="round" />
      <path d="M4 40 Q50 16 96 32" stroke="#8C5A3A" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M30 27 L22 14 M52 20 L48 6 M74 26 L82 14" stroke="#5E9153" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M30 27 L22 14 M52 20 L48 6 M74 26 L82 14" stroke="#7AAE4A" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function Pit() {
  return (
    <svg viewBox="0 0 100 60" className="h-full w-full" aria-hidden="true">
      <ellipse cx="50" cy="34" rx="42" ry="16" fill="#3A2A18" />
      <ellipse cx="50" cy="30" rx="34" ry="12" fill="#241a10" />
      <ellipse cx="50" cy="34" rx="42" ry="16" fill="none" stroke="#8C5A3A" strokeWidth="3" opacity="0.6" />
    </svg>
  );
}

function Log() {
  return (
    <svg viewBox="0 0 100 60" className="h-full w-full" style={{ filter: "drop-shadow(0 0.5vmin 0.8vmin rgba(40,30,10,0.35))" }} aria-hidden="true">
      <rect x="6" y="20" width="88" height="22" rx="11" fill="#8C5A3A" />
      <rect x="6" y="20" width="88" height="8" rx="4" fill="#A7754E" opacity="0.7" />
      <ellipse cx="10" cy="31" rx="9" ry="11" fill="#C99B72" />
      <ellipse cx="10" cy="31" rx="5" ry="6.5" fill="#8C5A3A" />
      <ellipse cx="90" cy="31" rx="9" ry="11" fill="#C99B72" />
      <ellipse cx="90" cy="31" rx="5" ry="6.5" fill="#8C5A3A" />
    </svg>
  );
}

function RockCluster() {
  return (
    <svg viewBox="0 0 100 60" className="h-full w-full" style={{ filter: "drop-shadow(0 0.5vmin 0.8vmin rgba(40,30,10,0.3))" }} aria-hidden="true">
      <ellipse cx="34" cy="42" rx="26" ry="16" fill="#8C7A63" />
      <ellipse cx="66" cy="40" rx="20" ry="14" fill="#A6947C" />
      <ellipse cx="50" cy="30" rx="16" ry="12" fill="#B9A98F" />
      <path d="M40 24 L46 30 M56 22 L60 28" stroke="#8C7A63" strokeWidth="2" opacity="0.5" strokeLinecap="round" />
    </svg>
  );
}
