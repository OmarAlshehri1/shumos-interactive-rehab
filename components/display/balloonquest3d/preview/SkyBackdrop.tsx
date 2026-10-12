interface CloudSpec {
  top: number;
  width: number;
  seconds: number;
  /** Negative-delay fraction (0..1) so the sky is populated on first paint. */
  phase: number;
  opacity: number;
}

// Three depth layers: far = small/pale/slow, near = larger/brighter/slightly faster. All very slow.
const CLOUDS: CloudSpec[] = [
  { top: 14, width: 16, seconds: 300, phase: 0.1, opacity: 0.55 },
  { top: 42, width: 14, seconds: 320, phase: 0.62, opacity: 0.5 },
  { top: 24, width: 22, seconds: 220, phase: 0.35, opacity: 0.8 },
  { top: 58, width: 20, seconds: 240, phase: 0.85, opacity: 0.75 },
  { top: 76, width: 30, seconds: 170, phase: 0.5, opacity: 0.9 },
];

function CloudShape() {
  return (
    <svg viewBox="0 0 200 80" className="bq3-cloud-art" aria-hidden="true" focusable="false">
      <g fill="url(#bq3-cloud)">
        <ellipse cx="100" cy="56" rx="86" ry="20" />
        <circle cx="58" cy="44" r="24" />
        <circle cx="96" cy="34" r="30" />
        <circle cx="138" cy="44" r="22" />
      </g>
    </svg>
  );
}

/** Quiet sky: gradient, a faint sun glow, and slowly drifting cloud layers. No foliage, birds or markers. */
export function SkyBackdrop() {
  return (
    <div className="bq3-sky" aria-hidden="true">
      <div className="bq3-sun" />
      {CLOUDS.map((cloud, i) => (
        <div
          key={i}
          className="bq3-cloud"
          style={
            {
              top: `${cloud.top}%`,
              width: `${cloud.width}%`,
              opacity: cloud.opacity,
              "--cloud-seconds": `${cloud.seconds}s`,
              "--cloud-delay": `${-cloud.seconds * cloud.phase}s`,
              "--cloud-rest": `${cloud.phase * 90 - 10}cqw`,
            } as React.CSSProperties
          }
        >
          <CloudShape />
        </div>
      ))}
    </div>
  );
}
