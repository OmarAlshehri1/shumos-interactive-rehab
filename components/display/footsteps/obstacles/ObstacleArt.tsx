"use client";

import { motion } from "motion/react";
import { RouteObstacleKind } from "@/lib/footsteps";

interface ObstacleArtProps {
  kind: RouteObstacleKind;
}

/**
 * ROUTE ARCHITECTURE REWRITE — cosmic obstacle artwork (replaces the old
 * SINGLE/PAIR stance mechanic, ADVANCED only). Real shapes, not emoji (task
 * section 16) — and deliberately unlike FootprintArt.tsx in every way
 * (jagged/irregular silhouette, warning-toned glow, no "step here" pool of
 * light) so a child never confuses "move past this" with "go here."
 */
export function ObstacleArt({ kind }: ObstacleArtProps) {
  switch (kind) {
    case RouteObstacleKind.METEOR:
      return <MeteorArt />;
    case RouteObstacleKind.ROCK:
      return <RockArt />;
    case RouteObstacleKind.COMET:
      return <CometArt />;
  }
}

function MeteorArt() {
  return (
    <div className="relative flex h-full w-full items-center justify-center" aria-hidden="true">
      <motion.div
        className="absolute h-[150%] w-[150%] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,140,80,0.55) 0%, rgba(255,80,50,0) 70%)" }}
        animate={{ opacity: [0.55, 0.95, 0.55], scale: [1, 1.12, 1] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Trailing streak. */}
      <motion.div
        className="absolute h-[18%] w-[85%] rounded-full"
        style={{ background: "linear-gradient(90deg, rgba(255,200,120,0) 0%, rgba(255,160,90,0.55) 100%)", right: "48%", top: "42%" }}
        animate={{ opacity: [0.4, 0.75, 0.4] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.svg
        viewBox="0 0 40 40"
        className="relative h-[68%] w-[68%]"
        style={{ filter: "drop-shadow(0 0 1.4vmin rgba(255,140,70,0.9))" }}
        animate={{ rotate: [0, 12, -8, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <defs>
          <radialGradient id="obs-meteor-fill" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#FFC98A" />
            <stop offset="55%" stopColor="#E9713A" />
            <stop offset="100%" stopColor="#8B3A1E" />
          </radialGradient>
        </defs>
        <path
          d="M20 3 27 8 34 14 33 24 27 33 18 36 9 30 5 20 8 10 14 5Z"
          fill="url(#obs-meteor-fill)"
          stroke="rgba(255,220,180,0.7)"
          strokeWidth="0.8"
        />
        <path d="M15 14 20 12 24 16 21 21 16 20Z" fill="rgba(140,60,25,0.55)" />
        <path d="M22 22 27 21 29 26 24 29 20 26Z" fill="rgba(140,60,25,0.45)" />
      </motion.svg>
    </div>
  );
}

function RockArt() {
  return (
    <div className="relative flex h-full w-full items-center justify-center" aria-hidden="true">
      <motion.div
        className="absolute h-[130%] w-[130%] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(150,140,210,0.5) 0%, rgba(150,140,210,0) 70%)" }}
        animate={{ opacity: [0.45, 0.75, 0.45] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      />
      <svg viewBox="0 0 40 40" className="relative h-[70%] w-[70%]" style={{ filter: "drop-shadow(0 0 1.2vmin rgba(150,140,210,0.75))" }}>
        <defs>
          <linearGradient id="obs-rock-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#B9AEDD" />
            <stop offset="100%" stopColor="#584E86" />
          </linearGradient>
        </defs>
        <path
          d="M9 30 4 20 10 9 22 5 33 11 36 22 29 33 18 36Z"
          fill="url(#obs-rock-fill)"
          stroke="rgba(220,215,255,0.6)"
          strokeWidth="0.8"
        />
        {/* Cracks — a rock reads as "solid obstacle," never a soft footprint glow. */}
        <path d="M14 12 20 18 17 26 23 32" fill="none" stroke="rgba(30,20,60,0.55)" strokeWidth="1" strokeLinecap="round" />
        <path d="M24 9 22 17 29 22" fill="none" stroke="rgba(30,20,60,0.4)" strokeWidth="0.8" strokeLinecap="round" />
        <motion.circle
          cx="20"
          cy="18"
          r="1.6"
          fill="#E6E0FF"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
      </svg>
    </div>
  );
}

function CometArt() {
  return (
    <div className="relative flex h-full w-full items-center justify-center" aria-hidden="true">
      <motion.div
        className="absolute h-[45%] w-[150%] rounded-full"
        style={{ background: "linear-gradient(90deg, rgba(160,220,255,0) 0%, rgba(160,220,255,0.55) 100%)", right: "40%" }}
        animate={{ opacity: [0.4, 0.85, 0.4], scaleX: [0.9, 1.05, 0.9] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute h-[110%] w-[110%] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(200,240,255,0.85) 0%, rgba(160,220,255,0) 70%)" }}
        animate={{ opacity: [0.6, 1, 0.6], scale: [1, 1.15, 1] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="relative h-[42%] w-[42%] rounded-full"
        style={{ background: "radial-gradient(circle at 35% 30%, #FFFFFF 0%, #BFE9FF 45%, #6FB8E0 100%)", boxShadow: "0 0 1.6vmin rgba(190,235,255,0.95)" }}
        animate={{ y: [0, -3, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
