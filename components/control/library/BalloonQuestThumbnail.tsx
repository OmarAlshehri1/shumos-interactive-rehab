import { BalloonColor } from "@/lib/game";
import { BALLOON_COLOR_THEME } from "@/components/display/colorPalette";
import { BalloonArt } from "@/components/display/balloon/BalloonArt";

/** Fixed, hand-placed (not randomized) — same rationale as WelcomeScene's own ambient balloon set: reproducible, no hydration mismatch risk. Sized for a short/compact thumbnail (see aspect ratio below). */
const THUMBNAIL_BALLOONS = [
  { color: BalloonColor.BLUE, left: "18%", bottom: "0%", size: "30%" },
  { color: BalloonColor.YELLOW, left: "56%", bottom: "26%", size: "22%" },
  { color: BalloonColor.RED, left: "74%", bottom: "-4%", size: "26%" },
] as const;

/**
 * Card thumbnail — a lightweight, static composition of the SAME balloon
 * artwork used in the real game (BalloonArt.tsx), not a stock image or a
 * new illustration system. Deliberately still (no motion): this sits in a
 * grid of activity cards, so a looping animation here would compete with
 * the "professional library" framing the task asks for, not the playful
 * in-game feel. COMPACT LIBRARY TASK: a shorter aspect ratio than the
 * original card — the thumbnail should read at a glance, not dominate.
 */
export function BalloonQuestThumbnail() {
  return (
    <div
      className="relative aspect-[16/7] w-full overflow-hidden rounded-t-2xl"
      style={{ background: "linear-gradient(150deg, #5B6FE8 0%, #7C4CC7 55%, #2AA6A0 100%)" }}
      aria-hidden="true"
    >
      <div className="absolute inset-0 opacity-25" style={{ background: "radial-gradient(circle at 30% 20%, #FFFFFF 0%, transparent 55%)" }} />
      {THUMBNAIL_BALLOONS.map((b, i) => (
        <div key={i} className="absolute" style={{ left: b.left, bottom: b.bottom, width: b.size, height: b.size }}>
          <BalloonArt theme={BALLOON_COLOR_THEME[b.color]} />
        </div>
      ))}
    </div>
  );
}
