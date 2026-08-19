/** Fixed, hand-placed star/planet positions — same reproducibility rationale as the other thumbnails' fixed sets. */
const THUMBNAIL_STARS = [
  { left: "18%", top: "22%", size: "10%" },
  { left: "62%", top: "14%", size: "7%" },
  { left: "78%", top: "48%", size: "9%" },
  { left: "40%", top: "62%", size: "6%" },
] as const;

/**
 * Card thumbnail — a deep-space world with a small rocket, distant stars,
 * and a soft planet, deliberately distinct from every other game's card art
 * (no balloons, no footprints, no bubbles, no safari). Still (no motion),
 * same "professional library card, not the playful in-game feel" reasoning
 * as the other thumbnails.
 */
export function SpacePilotThumbnail() {
  return (
    <div
      className="relative aspect-[16/7] w-full overflow-hidden rounded-t-2xl"
      style={{ background: "linear-gradient(150deg, #05061a 0%, #0f1442 55%, #2a2f7a 100%)" }}
      aria-hidden="true"
    >
      <div className="absolute inset-0 opacity-40" style={{ background: "radial-gradient(55% 55% at 75% 15%, rgba(180,190,255,0.35) 0%, transparent 70%)" }} />

      {/* A soft distant planet. */}
      <div
        className="absolute top-[10%] left-[6%] h-[30%] w-[30%] rounded-full opacity-80"
        style={{ background: "radial-gradient(circle at 35% 30%, #F2C94C 0%, #C97A3D 60%, #8A4A2A 100%)" }}
      />

      {THUMBNAIL_STARS.map((s, i) => (
        <svg key={i} viewBox="0 0 24 24" className="absolute drop-shadow-[0_0_4px_rgba(255,255,255,0.6)]" style={{ left: s.left, top: s.top, width: s.size, height: s.size }}>
          <path d="M12 1.5l2.9 6.3 6.9.7-5.2 4.7 1.5 6.8L12 16.7l-6.1 3.3 1.5-6.8-5.2-4.7 6.9-.7z" fill="#FBBF24" />
        </svg>
      ))}

      {/* A small rocket silhouette, nose pointing left — matches the game's own right-to-left flight direction. */}
      <svg viewBox="0 0 100 60" className="absolute bottom-[14%] left-[38%] h-[26%] w-[34%]">
        <ellipse cx="55" cy="30" rx="34" ry="11" fill="#E2E8F0" />
        <path d="M21 30 L2 24 L10 30 L2 36 Z" fill="#E2E8F0" />
        <circle cx="60" cy="30" r="6" fill="#60A5FA" />
        <path d="M85 24 Q98 30 85 36 Z" fill="#F97316" opacity="0.85" />
      </svg>

      {/* A small asteroid — hints at MEDIUM/ADVANCED's own object type, distinct from the golden stars above. */}
      <svg viewBox="0 0 40 40" className="absolute top-[52%] right-[10%] h-[12%] w-[12%] opacity-80">
        <path d="M20 3 L28 8 L34 20 L28 32 L14 36 L4 26 L6 12 Z" fill="#786F62" stroke="#332F28" strokeWidth="1.5" />
      </svg>
    </div>
  );
}
