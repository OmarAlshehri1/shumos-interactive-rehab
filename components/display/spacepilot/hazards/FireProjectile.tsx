"use client";

import { motion } from "motion/react";

export interface FireProjectileProps {
  /** Vertical lane position (in % of the scene's height) — always the rocket's CURRENT lane at the moment FIRE was pressed, from the shared canonical LANE_Y_PERCENT map. */
  yPercent: number;
  /** Where the shot starts (the rocket's muzzle) and ends (either the asteroid it hits, or off-screen left on a miss), both in % of the scene's width. */
  originXPercent: number;
  targetXPercent: number;
  onComplete: () => void;
}

const TRAVEL_MS = 220;

/**
 * MEDIUM/ADVANCED's FIRE mechanic's traveling shot (task's "rocket
 * immediately reacts -> short energy projectile/beam launches forward
 * toward LEFT -> travels through current lane"). Purely a visual — canonical
 * state already resolved the hit/miss the instant FIRE was pressed (see
 * fireSpacePilotWeapon), this component only ever plays the short travel
 * animation and then calls onComplete once, never itself deciding an
 * outcome. The actual impact crack/fragments live on AsteroidArt's
 * "cleared" outcome, not here, so a hit never doubles up two separate burst
 * effects at the same spot.
 */
export function FireProjectile({ yPercent, originXPercent, targetXPercent, onComplete }: FireProjectileProps) {
  return (
    <motion.div
      className="pointer-events-none absolute h-[1.4vmin] w-[6vmin] -translate-y-1/2 rounded-full"
      style={{
        top: `${yPercent}%`,
        background: "linear-gradient(90deg, rgba(34,211,238,0) 0%, rgba(94,234,212,0.9) 45%, #ECFEFF 100%)",
        boxShadow: "0 0 10px 2px rgba(45,212,191,0.85)",
      }}
      initial={{ left: `${originXPercent}%`, opacity: 0 }}
      animate={{ left: `${targetXPercent}%`, opacity: [0, 1, 1, 0] }}
      transition={{ duration: TRAVEL_MS / 1000, ease: "easeIn" }}
      onAnimationComplete={onComplete}
    />
  );
}
