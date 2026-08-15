"use client";

import { motion } from "motion/react";

/**
 * TASK 9 — Stage 3 / session celebrations only ("controlled confetti").
 * Deliberately small and cheap: a fixed, capped piece count (never
 * "hundreds"), animating only `transform`/`opacity` (no filters, no
 * canvas/WebGL), one-shot — no piece ever loops. Positions/timings are
 * computed from each piece's index rather than Math.random(), matching
 * Environment.tsx's existing "no render-time randomness" rule (avoids any
 * hydration mismatch) while still reading as organic, not gridded.
 */
const PIECE_COUNT = 22;

interface ConfettiPiece {
  left: number;
  color: string;
  delay: number;
  duration: number;
  driftVw: number;
  rotateDeg: number;
}

function buildPieces(colors: readonly string[]): ConfettiPiece[] {
  const pieces: ConfettiPiece[] = [];
  for (let i = 0; i < PIECE_COUNT; i++) {
    pieces.push({
      left: ((i * 41) % 100) + 1,
      color: colors[i % colors.length],
      delay: (i % 8) * 0.07,
      duration: 1.7 + ((i * 13) % 8) / 10,
      driftVw: (i % 2 === 0 ? 1 : -1) * (3 + (i % 6)),
      rotateDeg: 160 + (i % 5) * 70,
    });
  }
  return pieces;
}

export function Confetti({ colors }: { colors: readonly string[] }) {
  const pieces = buildPieces(colors);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className="absolute top-0 block rounded-[0.5px]"
          style={{ left: `${p.left}%`, width: "0.9vmin", height: "2vmin", backgroundColor: p.color }}
          initial={{ y: "-12vh", rotate: 0, opacity: 0 }}
          animate={{ y: "110vh", x: `${p.driftVw}vw`, rotate: p.rotateDeg, opacity: [0, 1, 1, 0] }}
          transition={{ duration: p.duration, delay: p.delay, ease: "easeIn" }}
        />
      ))}
    </div>
  );
}
