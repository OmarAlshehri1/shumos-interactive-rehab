"use client";

import { motion } from "motion/react";

const PALETTE = ["#FFE3A3", "#FDFBF6", "#BEE3F8", "#D9C8F5"]; // gold, soft white, pale blue, subtle violet

/**
 * The per-step celebration (task sections 27-30): a clearly visible, LOCAL
 * burst of stars from the just-confirmed footprint's own position — not a
 * full-screen flash, not 3 faint particles. Sibling to CosmicSparkleBurst
 * (stage/session-complete's own effect), not a modification of it, so those
 * call sites keep their existing counts/timings untouched. `big` is used
 * for milestone steps (e.g. the halfway point) — a larger shower, task
 * section 33. Deterministic per-index jitter (no Math.random() during
 * render), fixed particle count, transform+opacity only, and every particle
 * unmounts with the parent (no accumulation) — task section 50.
 *
 * Reduced motion: this whole /display tree renders under
 * `<MotionConfig reducedMotion="user">` (see DisplayScreen.tsx), which
 * already collapses transform (position/rotation/scale) keyframes to an
 * instant snap while still animating opacity when the OS-level
 * prefers-reduced-motion is on — exactly "reduce travel distance/rotation,
 * never remove the feedback entirely" (task section 51), with no extra
 * per-component logic needed here.
 */
export function StepStarBurst({ big = false }: { big?: boolean }) {
  const count = big ? 30 : 20;
  const durationMs = big ? 950 : 800;
  const particles = Array.from({ length: count }, (_, i) => {
    const jitter = ((i * 37) % 100) / 100 - 0.5; // deterministic pseudo-randomness in [-0.5, 0.5]
    const angle = (i / count) * Math.PI * 2 + jitter * 0.5;
    const distance = (big ? 20 : 14) + ((i * 11) % (big ? 16 : 11));
    const delay = ((i * 7) % 30) / 100;
    const size = (big ? 1.1 : 0.9) + (((i * 13) % 10) / 10) * (big ? 1.1 : 0.8);
    const rotate = ((i * 53) % 360) - 180;
    const color = PALETTE[i % PALETTE.length];
    return { angle, distance, delay, size, rotate, color };
  });

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
      {/* One bright local pulse at the origin, under the scattering particles. */}
      <motion.div
        className="absolute h-[60%] w-[60%] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,240,205,0.85) 0%, rgba(255,240,205,0) 70%)" }}
        initial={{ opacity: 0, scale: 0.3 }}
        animate={{ opacity: [0, 0.9, 0], scale: [0.3, 1.5, 1.8] }}
        transition={{ duration: durationMs / 1000, ease: "easeOut" }}
      />
      {particles.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{ width: `${p.size}vmin`, height: `${p.size}vmin`, background: p.color, boxShadow: `0 0 1vmin ${p.color}` }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.3, rotate: 0 }}
          animate={{
            x: Math.cos(p.angle) * p.distance + "vmin",
            y: Math.sin(p.angle) * p.distance + "vmin",
            opacity: [0, 1, 0],
            scale: [0.3, 1, 0.5],
            rotate: p.rotate,
          }}
          transition={{ duration: durationMs / 1000, delay: p.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}
