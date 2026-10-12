import { BalloonArt3D, BalloonDefs } from "@/components/display/balloonquest3d/preview/BalloonArt3D";
import type { PreviewColor } from "@/components/display/balloonquest3d/preview/previewConfig";

/** Fixed, hand-placed (not randomized): reproducible and free of hydration mismatches. */
const THUMBNAIL_BALLOONS: ReadonlyArray<{ color: PreviewColor; left: string; bottom: string; size: string }> = [
  { color: "blue", left: "14%", bottom: "-6%", size: "26%" },
  { color: "yellow", left: "46%", bottom: "20%", size: "21%" },
  { color: "red", left: "68%", bottom: "-8%", size: "26%" },
];

/**
 * Card thumbnail for the redesigned Balloon Quest: the same volumetric balloon
 * artwork and calm sky as the game itself (no leaves, no birds). Deliberately
 * still: it sits in a grid of activity cards.
 */
export function BalloonQuestThumbnail() {
  return (
    <div className="relative aspect-[16/7] w-full overflow-hidden rounded-t-2xl" style={{ background: "linear-gradient(180deg, #7cc6f7 0%, #b5e1fb 60%, #e6f6ff 100%)" }} aria-hidden="true">
      <BalloonDefs />
      <div className="absolute -top-[30%] right-[-10%] h-[90%] w-[55%]" style={{ background: "radial-gradient(closest-side, rgba(255,244,205,0.7), rgba(255,244,205,0))" }} />
      {THUMBNAIL_BALLOONS.map((b, i) => (
        <div key={i} className="absolute [&_svg]:block [&_svg]:h-auto [&_svg]:w-full" style={{ left: b.left, bottom: b.bottom, width: b.size }}>
          <BalloonArt3D color={b.color} />
        </div>
      ))}
    </div>
  );
}
