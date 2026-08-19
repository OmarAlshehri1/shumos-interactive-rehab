"use client";

import { motion } from "motion/react";

/**
 * A scattering of small star-sparkle particles bursting outward once — the
 * cosmic equivalent of Balloon Quest's StarBurst.tsx, but sharing none of
 * its code (own timing/shape/palette). Sensory-safe: capped particle count,
 * no strobe, one-shot. Deterministic per-index jitter (not Math.random(),
 * which is impure during render — see components/display/balloon/Sparkles.tsx
 * for the same established pattern) so this stays a pure render.
 */
export function CosmicSparkleBurst({ big = false }: { big?: boolean }) {
  const count = big ? 14 : 8;
  const particles = Array.from({ length: count }, (_, i) => {
    const jitter = i % 2 === 0 ? 0.18 : -0.18;
    const angle = (i / count) * Math.PI * 2 + jitter;
    const distance = (big ? 26 : 16) + ((i * 7) % (big ? 10 : 6));
    const delay = ((i * 5) % 25) / 100;
    return { angle, distance, delay, size: big ? 1.6 : 1.1 };
  });

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
      {particles.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full bg-amber-100"
          style={{ width: `${p.size}vmin`, height: `${p.size}vmin`, boxShadow: "0 0 1vmin rgba(255,238,190,0.9)" }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
          animate={{
            x: Math.cos(p.angle) * p.distance + "vmin",
            y: Math.sin(p.angle) * p.distance + "vmin",
            opacity: [0, 1, 0],
            scale: [0.4, 1, 0.6],
          }}
          transition={{ duration: 1.3, delay: p.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}
