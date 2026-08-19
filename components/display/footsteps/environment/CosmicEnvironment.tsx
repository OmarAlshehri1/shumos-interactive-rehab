/**
 * COSMIC JOURNEY — Follow the Footsteps' own persistent background world:
 * deep navy -> indigo -> violet sky, distant stars, a nebula wash, cosmic
 * dust, and (from stage 2 onward, deterministically by stageNumber — never
 * Math.random() at render) a moon, a ringed planet, and a constellation.
 * Purely decorative (pointer-events-none, aria-hidden), floor-projection
 * oriented (ground-like depth via a soft horizon glow near the bottom, not a
 * vertical-wallpaper composition) — mirrors components/display/environment/Environment.tsx's
 * role for Balloon Quest, but shares NONE of its hills/trees/garden/sun/
 * birds. All positions are hand-placed, not randomized, so this can never
 * hydration-mismatch.
 */

const STARS = [
  { top: "6%", left: "10%", size: "0.35vmin", opacity: 0.9, delay: "0s" },
  { top: "12%", left: "78%", size: "0.3vmin", opacity: 0.7, delay: "-3s" },
  { top: "22%", left: "35%", size: "0.25vmin", opacity: 0.8, delay: "-1.4s" },
  { top: "8%", left: "55%", size: "0.4vmin", opacity: 0.85, delay: "-2.2s" },
  { top: "30%", left: "88%", size: "0.3vmin", opacity: 0.6, delay: "-4s" },
  { top: "18%", left: "5%", size: "0.28vmin", opacity: 0.7, delay: "-0.6s" },
  { top: "40%", left: "62%", size: "0.3vmin", opacity: 0.65, delay: "-3.6s" },
  { top: "48%", left: "18%", size: "0.32vmin", opacity: 0.75, delay: "-1.9s" },
  { top: "15%", left: "92%", size: "0.26vmin", opacity: 0.55, delay: "-2.8s" },
  { top: "35%", left: "45%", size: "0.24vmin", opacity: 0.6, delay: "-0.9s" },
  { top: "5%", left: "28%", size: "0.3vmin", opacity: 0.8, delay: "-3.3s" },
  { top: "26%", left: "70%", size: "0.28vmin", opacity: 0.65, delay: "-1.1s" },
] as const;

const DUST = [
  { top: "55%", left: "15%", scale: 1, delay: "0s", duration: "22s" },
  { top: "65%", left: "80%", scale: 0.7, delay: "-8s", duration: "26s" },
  { top: "48%", left: "50%", scale: 0.55, delay: "-14s", duration: "19s" },
] as const;

export interface CosmicEnvironmentProps {
  /** Deterministic per-stage variation (task section 47) — never a random composition. 1 when no stage is active yet (Welcome). */
  stageNumber?: 1 | 2 | 3 | 4 | 5;
}

export function CosmicEnvironment({ stageNumber = 1 }: CosmicEnvironmentProps) {
  const showMoon = stageNumber >= 2;
  const showRingedPlanet = stageNumber >= 3;
  const showConstellation = stageNumber >= 3;
  const richerTrail = stageNumber >= 4;
  const strongerField = stageNumber >= 5;

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Deep navy -> indigo -> violet sky, per the approved palette. */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, #0B1130 0%, #171B4D 32%, #2B2568 62%, #3B2C6E 84%, #241C4A 100%)" }}
      />

      {/* Nebula wash — soft, controlled saturation so the footprints stay the hero. */}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(45% 35% at 75% 15%, rgba(123,92,214,0.35) 0%, rgba(123,92,214,0) 70%), radial-gradient(40% 30% at 15% 30%, rgba(75,130,214,0.25) 0%, rgba(75,130,214,0) 70%)",
        }}
      />

      {STARS.map((star, i) => (
        <span
          key={i}
          className="fs-star absolute rounded-full bg-white"
          style={{ top: star.top, left: star.left, width: star.size, height: star.size, opacity: star.opacity, animationDelay: star.delay }}
        />
      ))}
      {strongerField &&
        STARS.slice(0, 6).map((star, i) => (
          <span
            key={`extra-${i}`}
            className="fs-star absolute rounded-full bg-white"
            style={{
              top: `${(parseFloat(star.top) + 30) % 90}%`,
              left: `${(parseFloat(star.left) + 40) % 95}%`,
              width: star.size,
              height: star.size,
              opacity: star.opacity * 0.8,
              animationDelay: `-${i}s`,
            }}
          />
        ))}

      {showMoon && (
        <div
          className="fs-drift absolute top-[9%] right-[12%] h-[9vmin] w-[9vmin] rounded-full"
          style={{
            background: "radial-gradient(circle at 35% 35%, #F5F1E6 0%, #D8D0BE 55%, #B7AE96 100%)",
            boxShadow: "0 0 6vmin rgba(245,241,230,0.28)",
          }}
        />
      )}

      {showRingedPlanet && (
        <div className="absolute top-[16%] left-[10%] h-[7vmin] w-[7vmin]">
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: "radial-gradient(circle at 35% 35%, #FFD8A8 0%, #E8A65C 55%, #B97438 100%)" }}
          />
          <div
            className="absolute top-1/2 left-1/2 h-[3vmin] w-[13vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ border: "0.4vmin solid rgba(255,216,168,0.55)", transform: "translate(-50%, -50%) rotate(-18deg)" }}
          />
        </div>
      )}

      {showConstellation && (
        <svg viewBox="0 0 200 120" className="absolute top-[24%] left-[60%] h-[16vmin] w-[26vmin] opacity-70">
          <polyline
            points="10,90 45,40 90,55 130,15 170,35"
            fill="none"
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="1"
            strokeDasharray="2 4"
          />
          {[
            [10, 90],
            [45, 40],
            [90, 55],
            [130, 15],
            [170, 35],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={2.4} fill="white" />
          ))}
        </svg>
      )}

      {DUST.map((d, i) => (
        <span
          key={i}
          className="fs-dust absolute h-[0.6vmin] w-[0.6vmin] rounded-full bg-indigo-200/40"
          style={{ top: d.top, left: d.left, transform: `scale(${d.scale})`, animationDelay: d.delay, animationDuration: d.duration }}
        />
      ))}

      {richerTrail && (
        <div
          className="absolute inset-x-0 bottom-[10%] h-[1px] opacity-40"
          style={{ background: "linear-gradient(90deg, transparent, rgba(180,200,255,0.5), transparent)" }}
        />
      )}

      {/* Ground-like depth cue — a soft glow pool near the near/bottom edge, since this projects onto the floor the child stands on. */}
      <div
        className="absolute inset-x-0 bottom-0 h-[30vh]"
        style={{ background: "linear-gradient(180deg, rgba(30,20,70,0) 0%, rgba(20,14,48,0.55) 100%)" }}
      />
    </div>
  );
}
