"use client";

interface TurtleArtProps {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * REAL TURTLE ART (task Part D) — shell (with segment pattern), head, and
 * four flippers, clearly a turtle silhouette. Slow/calm — no independent
 * animation of its own beyond the parent's existing gentle `.bp-turtle-drift`
 * CSS drift, matching task's "slow calm movement."
 */
export function TurtleArt({ className, style }: TurtleArtProps) {
  return (
    <svg viewBox="0 0 100 70" className={className} style={style} aria-hidden="true">
      {/* Back flippers. */}
      <ellipse cx="18" cy="52" rx="10" ry="6" fill="#2E6B48" transform="rotate(25 18 52)" />
      <ellipse cx="80" cy="52" rx="10" ry="6" fill="#2E6B48" transform="rotate(-25 80 52)" />
      {/* Front flippers. */}
      <ellipse cx="24" cy="24" rx="11" ry="6.5" fill="#3B8259" transform="rotate(-30 24 24)" />
      <ellipse cx="76" cy="24" rx="11" ry="6.5" fill="#3B8259" transform="rotate(30 76 24)" />
      {/* Shell. */}
      <ellipse cx="50" cy="35" rx="34" ry="24" fill="#4E9A6E" stroke="#2E6B48" strokeWidth="2" />
      <path d="M50 14 L50 56 M22 35 L78 35 M30 20 L50 35 L70 20 M30 50 L50 35 L70 50" stroke="#2E6B48" strokeWidth="1.6" fill="none" opacity="0.8" />
      {/* Head. */}
      <ellipse cx="90" cy="30" rx="10" ry="8" fill="#4E9A6E" stroke="#2E6B48" strokeWidth="1.6" />
      <circle cx="94" cy="27" r="1.8" fill="#1A1A1A" />
    </svg>
  );
}
