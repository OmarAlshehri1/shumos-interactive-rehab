/** Fixed, hand-placed footprint positions — same reproducibility rationale as BalloonQuestThumbnail's own fixed balloon set. */
const THUMBNAIL_FOOTPRINTS = [
  { left: "20%", bottom: "6%", size: "16%", tint: "#FFE3A3", rotate: "-8deg" },
  { left: "34%", bottom: "26%", size: "13%", tint: "#A8E9F0", rotate: "10deg" },
  { left: "48%", bottom: "46%", size: "12%", tint: "#FFE3A3", rotate: "-6deg" },
  { left: "62%", bottom: "62%", size: "11%", tint: "#A8E9F0", rotate: "8deg" },
] as const;

/**
 * Card thumbnail — glowing footprints on a cosmic pathway toward a small
 * destination star, deliberately NOT balloons and NOT a stock image (task
 * section 2). Still (no motion), same "professional library card, not the
 * playful in-game feel" reasoning as BalloonQuestThumbnail.tsx.
 */
export function FollowTheFootstepsThumbnail() {
  return (
    <div
      className="relative aspect-[16/7] w-full overflow-hidden rounded-t-2xl"
      style={{ background: "linear-gradient(150deg, #0B1130 0%, #241C4A 55%, #3B2C6E 100%)" }}
      aria-hidden="true"
    >
      <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(circle at 75% 15%, #C6B8FF 0%, transparent 55%)" }} />
      {[
        { top: "14%", left: "12%" },
        { top: "22%", left: "68%" },
        { top: "38%", left: "40%" },
        { top: "10%", left: "84%" },
      ].map((s, i) => (
        <span key={i} className="absolute h-[3px] w-[3px] rounded-full bg-white/80" style={{ top: s.top, left: s.left }} />
      ))}

      <span className="absolute top-[16%] right-[14%] text-[18px]">⭐</span>

      {THUMBNAIL_FOOTPRINTS.map((f, i) => (
        <svg
          key={i}
          viewBox="0 0 24 34"
          className="absolute drop-shadow-[0_0_6px_rgba(255,225,150,0.5)]"
          style={{ left: f.left, bottom: f.bottom, width: f.size, height: f.size, transform: `rotate(${f.rotate})` }}
        >
          <path
            d="M12 2c3.5 0 5.5 3 5.5 7 0 2.4-.8 3.6-.4 6.2.4 2.6 2 5 2 9 0 4.6-2.8 8-7.1 8S5 28.8 5 24.2c0-4 1.6-6.4 2-9 .4-2.6-.4-3.8-.4-6.2 0-4 2-7 5.4-7Z"
            fill={f.tint}
          />
        </svg>
      ))}
    </div>
  );
}
