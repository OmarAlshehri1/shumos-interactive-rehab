/** Fixed, hand-placed bubble positions/colors — same reproducibility rationale as the other two thumbnails' fixed sets. */
const THUMBNAIL_BUBBLES = [
  { left: "16%", bottom: "10%", size: "22%", hue: "#3B9FE0" },
  { left: "42%", bottom: "30%", size: "16%", hue: "#F2C94C" },
  { left: "62%", bottom: "14%", size: "18%", hue: "#F2555A" },
  { left: "78%", bottom: "42%", size: "13%", hue: "#3DC98A" },
] as const;

/**
 * Card thumbnail — an underwater world with bubbles, coral, a small fish,
 * and soft light rays, deliberately NOT a garden and NOT footprints (task
 * section 2). Still (no motion), same "professional library card, not the
 * playful in-game feel" reasoning as the other two thumbnails.
 */
export function BubblePopWallThumbnail() {
  return (
    <div
      className="relative aspect-[16/7] w-full overflow-hidden rounded-t-2xl"
      style={{ background: "linear-gradient(150deg, #06283D 0%, #0F6788 55%, #1FB6BE 100%)" }}
      aria-hidden="true"
    >
      <div className="absolute inset-0 opacity-40" style={{ background: "radial-gradient(60% 60% at 30% 0%, rgba(210,245,255,0.35) 0%, transparent 70%)" }} />

      {/* Coral silhouettes. */}
      <div className="absolute bottom-0 left-[2%] h-[34%] w-[10%] rounded-t-full opacity-80" style={{ background: "#E0637A" }} />
      <div className="absolute bottom-0 right-[4%] h-[26%] w-[9%] rounded-t-full opacity-80" style={{ background: "#E08F5A" }} />

      {/* A small friendly fish. */}
      <div className="absolute top-[22%] right-[22%] h-[9%] w-[15%] rounded-[45%] opacity-90" style={{ background: "#F2C94C" }} />

      {THUMBNAIL_BUBBLES.map((b, i) => (
        <svg
          key={i}
          viewBox="0 0 100 100"
          className="absolute drop-shadow-[0_0_6px_rgba(200,240,255,0.4)]"
          style={{ left: b.left, bottom: b.bottom, width: b.size, height: b.size }}
        >
          <defs>
            <radialGradient id={`bp-thumb-${i}`} cx="38%" cy="32%" r="70%">
              <stop offset="0%" stopColor="white" stopOpacity="0.85" />
              <stop offset="28%" stopColor={b.hue} stopOpacity="0.55" />
              <stop offset="100%" stopColor={b.hue} stopOpacity="0.85" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="46" fill={`url(#bp-thumb-${i})`} stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" />
          <ellipse cx="34" cy="30" rx="12" ry="7" fill="rgba(255,255,255,0.7)" transform="rotate(-25 34 30)" />
        </svg>
      ))}
    </div>
  );
}
