import { useId } from "react";
import type { BalloonColorTheme } from "../colorPalette";

/**
 * The dimensional balloon SVG artwork itself, with no animation or
 * interaction logic — a gradient body (light -> base -> dark) for volume, a
 * soft gloss highlight, a knot, a short curled string, and a ground contact
 * glow. Kept separate from Balloon.tsx so the artwork can be reasoned about
 * (and tweaked) independently of the pop/shake/idle choreography.
 *
 * The string is deliberately short (not a long trailing line): this is a
 * floor projection viewed roughly top-down, where a balloon reads as
 * sitting on the ground rather than hanging in the air, so a long tail
 * would look physically wrong.
 */
export function BalloonArt({ theme }: { theme: BalloonColorTheme }) {
  const gradientId = useId();

  return (
    <svg viewBox="0 0 100 124" className="h-full w-full overflow-visible" aria-hidden="true">
      <defs>
        <radialGradient id={`${gradientId}-body`} cx="36%" cy="28%" r="78%">
          <stop offset="0%" stopColor={theme.light} />
          <stop offset="55%" stopColor={theme.base} />
          <stop offset="100%" stopColor={theme.dark} />
        </radialGradient>
      </defs>

      <ellipse cx="50" cy="119" rx="24" ry="5.5" fill={theme.dark} opacity="0.22" />

      <path
        d="M50,6 C74,6 92,28 92,52 C92,78 72,98 54,102 C52,103 48,103 46,102 C28,98 8,78 8,52 C8,28 26,6 50,6 Z"
        fill={`url(#${gradientId}-body)`}
      />

      <ellipse cx="35" cy="32" rx="13" ry="19" fill="white" opacity="0.32" />
      <circle cx="30" cy="24" r="4" fill="white" opacity="0.55" />

      <path d="M45,101 L55,101 L50,109 Z" fill={theme.dark} />
      <path
        d="M50,109 C 48,112 53,115 50,119"
        fill="none"
        stroke={theme.dark}
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}
