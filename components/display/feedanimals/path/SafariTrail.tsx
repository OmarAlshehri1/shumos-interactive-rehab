import { sampleFeedAnimalsPathFraction, type FeedAnimalsPathLeg } from "@/lib/feedanimals";
import { pathPositionStyle } from "./pathAlignment";

interface SafariTrailProps {
  leg: FeedAnimalsPathLeg;
}

const TRAIL_SAMPLE_COUNT = 34;
/** Fixed sample indices (out of TRAIL_SAMPLE_COUNT) that get a small stone or grass-tuft accent — hand-picked, not random, so the trail never hydration-mismatches. */
const STONE_INDICES = [4, 11, 19, 27];
const GRASS_INDICES = [7, 14, 22, 29];

/**
 * SAFARI ANIMAL ADVENTURE PROTOTYPE — the Stage 1 trail rendered as an
 * actual visible walkway (task's "the route should LOOK like a Safari
 * path... not an invisible mathematical line"): a warm sand body with soft
 * irregular edges, small stone and grass-tuft accents near the sides. Built
 * from the SAME centerline sampling the monkey's own position uses
 * (lib/feedanimals/pathCurve.ts) — sampled at percentage positions exactly
 * like every other wall element in this app (never an SVG stroke, which
 * would distort under this non-square wall's own aspect ratio) — so the
 * drawn trail and the monkey's actual walked position can never drift
 * apart, whatever the wall's real aspect ratio turns out to be.
 */
export function SafariTrail({ leg }: SafariTrailProps) {
  const samples = Array.from({ length: TRAIL_SAMPLE_COUNT }, (_, i) => {
    const fraction = i / (TRAIL_SAMPLE_COUNT - 1);
    const sample = sampleFeedAnimalsPathFraction(leg, fraction);
    const headingRad = (sample.headingDeg * Math.PI) / 180;
    // Perpendicular unit vector to the direction of travel — same convention as pathCurve.ts's sampleAtDistance (travel = (sin, -cos)).
    const perpX = Math.cos(headingRad);
    const perpY = Math.sin(headingRad);
    return { ...sample, perpX, perpY };
  });

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {/* Soft shadow beneath the path body. */}
      {samples.map((s, i) => (
        <span
          key={`shadow-${i}`}
          className="absolute rounded-full"
          style={{
            ...pathPositionStyle({ x: s.position.x, y: s.position.y + 0.006 }),
            width: "7.6vmin",
            height: "7.6vmin",
            transform: "translate(-50%, -50%)",
            background: "rgba(60,38,14,0.22)",
          }}
        />
      ))}
      {/* Warm sand path body — overlapping blobs, deliberately irregular rather than a perfectly even stroke. */}
      {samples.map((s, i) => (
        <span
          key={`sand-${i}`}
          className="absolute rounded-full"
          style={{
            ...pathPositionStyle(s.position),
            width: `${6.6 + (i % 3) * 0.4}vmin`,
            height: `${6.6 + (i % 3) * 0.4}vmin`,
            transform: "translate(-50%, -50%)",
            background: "linear-gradient(160deg, #E3B577 0%, #C99658 100%)",
          }}
        />
      ))}
      {/* Lighter center highlight so the trail reads as walkable ground, not a flat color. */}
      {samples.map((s, i) => (
        <span
          key={`highlight-${i}`}
          className="absolute rounded-full opacity-70"
          style={{
            ...pathPositionStyle(s.position),
            width: "3.4vmin",
            height: "3.4vmin",
            transform: "translate(-50%, -50%)",
            background: "#F0D19C",
          }}
        />
      ))}

      {/* Small stones near one edge. */}
      {STONE_INDICES.map((i) => {
        const s = samples[i];
        if (!s) return null;
        const offset = 4.2;
        return (
          <span
            key={`stone-${i}`}
            className="absolute rounded-full"
            style={{
              ...pathPositionStyle({ x: s.position.x + s.perpX * offset * 0.01, y: s.position.y + s.perpY * offset * 0.01 }),
              width: "1.4vmin",
              height: "1.1vmin",
              transform: "translate(-50%, -50%)",
              background: "#8C7A63",
              boxShadow: "0 0.2vmin 0.3vmin rgba(50,35,15,0.3)",
            }}
          />
        );
      })}

      {/* Small grass tufts near the other edge. */}
      {GRASS_INDICES.map((i) => {
        const s = samples[i];
        if (!s) return null;
        const offset = -4.6;
        return (
          <span
            key={`grass-${i}`}
            className="absolute rounded-t-full"
            style={{
              ...pathPositionStyle({ x: s.position.x + s.perpX * offset * 0.01, y: s.position.y + s.perpY * offset * 0.01 }),
              width: "1vmin",
              height: "2.6vmin",
              transform: "translate(-50%, -85%)",
              background: "#6B8A3A",
            }}
          />
        );
      })}
    </div>
  );
}
