/**
 * The persistent background world: sky, sun glow, hills, clouds, leaves,
 * birds. Purely decorative (pointer-events-none, aria-hidden) and
 * deliberately lower-saturation than the balloons so it never competes with
 * the actual game targets. All positions are hand-placed (not randomized)
 * to keep the composition art-directed and avoid any render-time
 * randomness that could cause a hydration mismatch.
 */

const CLOUDS = [
  { top: "8%", left: "12%", scale: 1.1, opacity: 0.85, delay: "0s" },
  { top: "16%", left: "68%", scale: 0.85, opacity: 0.7, delay: "-40s" },
  { top: "5%", left: "45%", scale: 0.65, opacity: 0.6, delay: "-90s" },
  { top: "22%", left: "85%", scale: 0.75, opacity: 0.55, delay: "-130s" },
];

const LEAVES = [
  { top: "20%", left: "8%", scale: 0.9, hue: "#9AEFC4", delay: "0s", duration: "13s" },
  { top: "34%", left: "92%", scale: 0.7, hue: "#FFE29A", delay: "-4s", duration: "16s" },
  { top: "60%", left: "5%", scale: 0.8, hue: "#8FC1FF", delay: "-8s", duration: "12s" },
  { top: "75%", left: "95%", scale: 0.6, hue: "#D3B3FF", delay: "-2s", duration: "15s" },
];

const BIRDS = [
  { top: "14%", left: "20%", scale: 1, delay: "0s" },
  { top: "10%", left: "75%", scale: 0.75, delay: "-9s" },
];

function Cloud({ style }: { style: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 200 90" className="bq-cloud absolute h-auto w-[16vw] min-w-[140px]" style={style} aria-hidden>
      <ellipse cx="60" cy="55" rx="55" ry="32" fill="white" />
      <ellipse cx="115" cy="40" rx="50" ry="38" fill="white" />
      <ellipse cx="150" cy="58" rx="42" ry="28" fill="white" />
      <ellipse cx="90" cy="65" rx="70" ry="24" fill="white" />
    </svg>
  );
}

function Leaf({ style, hue }: { style: React.CSSProperties; hue: string }) {
  return (
    <svg viewBox="0 0 40 40" className="bq-leaf absolute h-[3vw] w-[3vw] min-h-6 min-w-6" style={style} aria-hidden>
      <path d="M20 2 C34 8 34 28 20 38 C6 28 6 8 20 2 Z" fill={hue} opacity="0.55" />
      <path d="M20 6 L20 34" stroke="white" strokeOpacity="0.4" strokeWidth="1.5" />
    </svg>
  );
}

function Bird({ style }: { style: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 40 20" className="bq-bird absolute h-[1.4vw] w-[2.8vw] min-h-3 min-w-6" style={style} aria-hidden>
      <path
        d="M2 12 C8 4 14 4 20 10 C26 4 32 4 38 12"
        fill="none"
        stroke="#4A5A78"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

export function Environment() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Sky gradient: soft dusk/dawn palette, deliberately desaturated so balloons pop forward. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #7C93D6 0%, #A2A0DE 28%, #D2A7D9 52%, #F0BFB3 74%, #F7D7B8 100%)",
        }}
      />

      {/* Sun glow */}
      <div
        className="bq-sun absolute left-1/2 top-[10%] h-[26vmin] w-[26vmin] -translate-x-1/2 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(255,244,214,0.9) 0%, rgba(255,244,214,0) 70%)",
        }}
      />

      {CLOUDS.map((cloud, i) => (
        <Cloud
          key={i}
          style={{
            top: cloud.top,
            left: cloud.left,
            opacity: cloud.opacity,
            transform: `scale(${cloud.scale})`,
            animationDelay: cloud.delay,
          }}
        />
      ))}

      {BIRDS.map((bird, i) => (
        <Bird
          key={i}
          style={{ top: bird.top, left: bird.left, transform: `scale(${bird.scale})`, animationDelay: bird.delay }}
        />
      ))}

      {LEAVES.map((leaf, i) => (
        <Leaf
          key={i}
          hue={leaf.hue}
          style={{
            top: leaf.top,
            left: leaf.left,
            transform: `scale(${leaf.scale})`,
            animationDelay: leaf.delay,
            animationDuration: leaf.duration,
          }}
        />
      ))}

      {/* Distant hills, layered for soft depth. */}
      <svg
        viewBox="0 0 1000 300"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-[26vh] w-full"
      >
        <path d="M0 180 Q 180 90 400 150 T 1000 120 V300 H0 Z" fill="#C9A8D6" opacity="0.35" />
        <path d="M0 220 Q 220 140 520 200 T 1000 180 V300 H0 Z" fill="#E7B7A8" opacity="0.4" />
        <path d="M0 260 Q 260 210 560 245 T 1000 230 V300 H0 Z" fill="#F4CDA6" opacity="0.55" />
      </svg>
    </div>
  );
}
