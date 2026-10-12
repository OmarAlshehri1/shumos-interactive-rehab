import { PREVIEW_COLORS, PREVIEW_COLOR_ORDER, type PreviewColor, type PreviewSymbol } from "./previewConfig";

/**
 * Shared SVG gradient definitions. Rendered ONCE per page (zero-size, not
 * display:none, so url(#...) references keep resolving); every balloon then
 * references them, which keeps the per-balloon DOM to a handful of shapes and
 * avoids any SVG filters or blur.
 */
export function BalloonDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
      <defs>
        {PREVIEW_COLOR_ORDER.map((id) => {
          const c = PREVIEW_COLORS[id];
          return (
            <radialGradient key={id} id={`bq3-body-${id}`} cx="0.36" cy="0.3" r="0.85">
              <stop offset="0" stopColor={c.light} />
              <stop offset="0.5" stopColor={c.base} />
              <stop offset="1" stopColor={c.dark} />
            </radialGradient>
          );
        })}
        <radialGradient id="bq3-rim" cx="0.5" cy="0.45" r="0.58">
          <stop offset="0.7" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.2" />
        </radialGradient>
        <linearGradient id="bq3-spec" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.8" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="bq3-bounce" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff" stopOpacity="0.24" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bq3-cloud" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#E3F2FD" />
        </linearGradient>
      </defs>
    </svg>
  );
}

const BODY_PATH = "M50 4 C77 4 94 24 94 50 C94 78 70 104 50 112 C30 104 6 78 6 50 C6 24 23 4 50 4 Z";

/** Simple, bold glyphs centred on (0,0) — a non-colour cue for future colour-blind support. */
function SymbolGlyph({ symbol }: { symbol: PreviewSymbol }) {
  switch (symbol) {
    case "star":
      return <polygon points="0,-12 2.9,-4 11.4,-3.7 4.8,1.6 7,9.7 0,5 -7,9.7 -4.8,1.6 -11.4,-3.7 -2.9,-4" />;
    case "dot":
      return <circle r="9" />;
    case "triangle":
      return <polygon points="0,-11 11,9 -11,9" />;
    case "square":
      return <rect x="-9" y="-9" width="18" height="18" rx="2" />;
    case "diamond":
      return <polygon points="0,-12 10,0 0,12 -10,0" />;
    case "plus":
      return <path d="M-3-11h6v8h8v6h-8v8h-6v-8h-8v-6h8z" />;
    case "heart":
      return <path d="M0 10C-14 0-10-11 0-5C10-11 14 0 0 10Z" />;
  }
}

interface BalloonArt3DProps {
  color: PreviewColor;
  showSymbol?: boolean;
  /** Draw the knot and string (omitted for tiny HUD icons). */
  withString?: boolean;
}

/** One volumetric balloon: gradient body, soft rim shading, specular highlight, knot and a restrained string. */
export function BalloonArt3D({ color, showSymbol = false, withString = true }: BalloonArt3DProps) {
  const c = PREVIEW_COLORS[color];
  return (
    <svg viewBox={withString ? "0 0 100 150" : "0 0 100 124"} className="bq3-art" aria-hidden="true" focusable="false">
      {withString && <path d="M50 121 C44 130 56 138 49 149" fill="none" stroke="rgba(40,60,90,0.38)" strokeWidth="1.3" strokeLinecap="round" />}
      <path d="M50 109 L42.5 121 Q50 117.5 57.5 121 Z" fill={c.dark} stroke={c.outline} strokeWidth="0.8" strokeLinejoin="round" />
      {c.halo && <path d={BODY_PATH} fill="none" stroke={c.halo} strokeWidth="5.5" strokeLinejoin="round" />}
      <path d={BODY_PATH} fill={`url(#bq3-body-${color})`} stroke={c.outline} strokeWidth={c.outlineWidth} strokeLinejoin="round" />
      <path d={BODY_PATH} fill="url(#bq3-rim)" />
      <ellipse cx="66" cy="86" rx="17" ry="10" transform="rotate(-38 66 86)" fill="url(#bq3-bounce)" />
      {showSymbol && (
        <g transform="translate(50 56)" fill={c.symbolFill} fillOpacity="0.92" stroke={c.symbolStroke} strokeWidth="1">
          <SymbolGlyph symbol={c.symbol} />
        </g>
      )}
      <ellipse cx="32" cy="30" rx="10" ry="18" transform="rotate(-28 32 30)" fill="url(#bq3-spec)" />
      <ellipse cx="22" cy="55" rx="2.6" ry="5.5" transform="rotate(-12 22 55)" fill="#fff" fillOpacity="0.32" />
    </svg>
  );
}
