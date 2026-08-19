import { CollectibleStarStatus, type CollectibleStar } from "@/lib/spacepilot";

interface StarProgressDotsProps {
  stars: CollectibleStar[];
}

/** Task's "Show a simple child-friendly progress indicator... proper SVG stars, not emoji... keep it secondary — the main reward is the ROCKET transformation." Small, unobtrusive, corner-of-screen only. */
export function StarProgressDots({ stars }: StarProgressDotsProps) {
  return (
    <div className="pointer-events-none absolute top-[3vh] left-1/2 flex -translate-x-1/2 items-center gap-[0.8vmin]" aria-hidden="true">
      {stars.map((star) => (
        <svg key={star.id} viewBox="0 0 24 24" className="h-[2.4vmin] w-[2.4vmin]">
          <path
            d="M12 1.5l2.9 6.3 6.9.7-5.2 4.7 1.5 6.8L12 16.7l-6.1 3.3 1.5-6.8-5.2-4.7 6.9-.7z"
            fill={star.status === CollectibleStarStatus.COLLECTED ? "#FBBF24" : "none"}
            stroke={star.status === CollectibleStarStatus.MISSED ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.55)"}
            strokeWidth={star.status === CollectibleStarStatus.COLLECTED ? 0 : 1.5}
            style={star.status === CollectibleStarStatus.COLLECTED ? { filter: "drop-shadow(0 0 3px rgba(251,191,36,0.9))" } : undefined}
          />
        </svg>
      ))}
    </div>
  );
}
