/**
 * SPACE WORLD — Space Pilot's own persistent background: deep navy/black
 * space, distant twinkling stars, a nebula wash, slow planets/moons, an
 * occasional comet, and a far star cluster — task's "premium... multiple
 * depth layers... use parallax." All positions are hand-placed (never
 * Math.random() at render, same convention as CosmicEnvironment/
 * UnderwaterEnvironment), so this can never hydration-mismatch. Drifting
 * layers travel LEFT -> RIGHT (see app/display/space-pilot.css's doc
 * comment for why) at different speeds per depth — far layers slowest,
 * close layers fastest — the parallax that sells "the rocket is flying
 * forward."
 */

const FAR_STARS = [
  { top: "8%", left: "12%", size: "0.3vmin", opacity: 0.7, twinkleDelay: "0s", twinkleDuration: "4.2s" },
  { top: "14%", left: "44%", size: "0.26vmin", opacity: 0.6, twinkleDelay: "-1.2s", twinkleDuration: "3.6s" },
  { top: "5%", left: "68%", size: "0.32vmin", opacity: 0.75, twinkleDelay: "-2.4s", twinkleDuration: "4.8s" },
  { top: "22%", left: "85%", size: "0.24vmin", opacity: 0.55, twinkleDelay: "-0.6s", twinkleDuration: "3.2s" },
  { top: "35%", left: "6%", size: "0.28vmin", opacity: 0.65, twinkleDelay: "-3s", twinkleDuration: "4.5s" },
  { top: "48%", left: "30%", size: "0.22vmin", opacity: 0.5, twinkleDelay: "-1.8s", twinkleDuration: "3.9s" },
  { top: "60%", left: "55%", size: "0.3vmin", opacity: 0.6, twinkleDelay: "-2.9s", twinkleDuration: "4.1s" },
  { top: "72%", left: "20%", size: "0.26vmin", opacity: 0.55, twinkleDelay: "-0.9s", twinkleDuration: "3.4s" },
  { top: "18%", left: "94%", size: "0.24vmin", opacity: 0.5, twinkleDelay: "-3.6s", twinkleDuration: "4.6s" },
  { top: "40%", left: "77%", size: "0.28vmin", opacity: 0.6, twinkleDelay: "-1.5s", twinkleDuration: "3.7s" },
  { top: "82%", left: "40%", size: "0.24vmin", opacity: 0.5, twinkleDelay: "-2.1s", twinkleDuration: "4s" },
  { top: "88%", left: "68%", size: "0.3vmin", opacity: 0.6, twinkleDelay: "-0.3s", twinkleDuration: "3.5s" },
] as const;

/** A handful of stars that DRIFT (far/slow layer) — depth cue #1. */
const DRIFTING_FAR_STARS = [
  { top: "15%", size: "0.3vmin", duration: "58s", delay: "-6s" },
  { top: "38%", size: "0.24vmin", duration: "64s", delay: "-22s" },
  { top: "62%", size: "0.28vmin", duration: "70s", delay: "-40s" },
  { top: "80%", size: "0.24vmin", duration: "52s", delay: "-12s" },
] as const;

/** A few brighter, faster mid-layer stars — depth cue #2. */
const DRIFTING_MID_STARS = [
  { top: "24%", size: "0.5vmin", duration: "30s", delay: "-4s" },
  { top: "52%", size: "0.42vmin", duration: "34s", delay: "-18s" },
  { top: "70%", size: "0.46vmin", duration: "27s", delay: "-9s" },
] as const;

/** Far star cluster — a static soft patch, task's "far star clusters." */
const STAR_CLUSTER = [
  { top: "10%", left: "20%" },
  { top: "12%", left: "24%" },
  { top: "8%", left: "27%" },
  { top: "14%", left: "22%" },
  { top: "11%", left: "30%" },
] as const;

export function SpaceEnvironment() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Deep navy/black space base. */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, #04050f 0%, #0a0d2b 40%, #131a4a 75%, #0d1338 100%)" }} />

      {/* Nebula/cloud color wash — controlled saturation so the rocket/stars stay the hero. */}
      <div
        className="absolute inset-0 opacity-50"
        style={{
          background:
            "radial-gradient(40% 32% at 80% 20%, rgba(129,90,214,0.32) 0%, rgba(129,90,214,0) 70%), radial-gradient(38% 28% at 10% 65%, rgba(58,110,214,0.24) 0%, rgba(58,110,214,0) 70%)",
        }}
      />
      <div className="sp-nebula-drift absolute top-[10%] h-[50%] w-[45vw] rounded-full opacity-40 blur-3xl" style={{ background: "radial-gradient(circle, rgba(147,112,219,0.5) 0%, transparent 70%)" }} />

      {/* Distant twinkling stars — static, hand-placed. */}
      {FAR_STARS.map((star, i) => (
        <span
          key={`fixed-${i}`}
          className="absolute rounded-full bg-white"
          style={{
            top: star.top,
            left: star.left,
            width: star.size,
            height: star.size,
            opacity: star.opacity,
            animation: `sp-twinkle ${star.twinkleDuration} ease-in-out infinite`,
            animationDelay: star.twinkleDelay,
          }}
        />
      ))}

      {/* Far star cluster. */}
      {STAR_CLUSTER.map((s, i) => (
        <span key={`cluster-${i}`} className="absolute h-[0.22vmin] w-[0.22vmin] rounded-full bg-white opacity-60" style={{ top: s.top, left: s.left }} />
      ))}

      {/* Slow distant moon. */}
      <div
        className="sp-moon-drift absolute top-[12%] h-[9vmin] w-[9vmin] rounded-full opacity-80"
        style={{ background: "radial-gradient(circle at 35% 30%, #E5E9F0 0%, #A9B2C6 55%, #6B7488 100%)", ["--sp-drift-duration" as string]: "52s" }}
      />

      {/* Slow distant planet with a soft ring — task's "slow planets." */}
      <div
        className="sp-moon-drift sp-planet-glow absolute top-[55%] h-[13vmin] w-[13vmin] rounded-full opacity-90"
        style={{
          background: "radial-gradient(circle at 32% 28%, #FBBF7A 0%, #E08A3D 55%, #A85A22 100%)",
          ["--sp-drift-duration" as string]: "78s",
          ["--sp-drift-delay" as string]: "-20s",
        }}
      >
        {/* No Tailwind translate utility class here — the inline transform alone already centers both axes; combining the two double-shifts under Tailwind v4 (see SpacePilotPlayingScene.tsx's matching comment). */}
        <div
          className="pointer-events-none absolute top-1/2 left-1/2 h-[4vmin] w-[22vmin] rounded-full opacity-50"
          style={{ background: "linear-gradient(90deg, transparent, rgba(240,220,180,0.55), transparent)", transform: "translate(-50%, -50%) rotate(-18deg)" }}
        />
      </div>

      {/* Drifting far/mid parallax stars. */}
      {DRIFTING_FAR_STARS.map((s, i) => (
        <span
          key={`drift-far-${i}`}
          className="sp-star-far absolute rounded-full bg-white"
          style={{ top: s.top, width: s.size, height: s.size, ["--sp-drift-duration" as string]: s.duration, ["--sp-drift-delay" as string]: s.delay }}
        />
      ))}
      {DRIFTING_MID_STARS.map((s, i) => (
        <span
          key={`drift-mid-${i}`}
          className="sp-star-mid absolute rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.7)]"
          style={{ top: s.top, width: s.size, height: s.size, ["--sp-drift-duration" as string]: s.duration, ["--sp-drift-delay" as string]: s.delay }}
        />
      ))}

      {/* An occasional comet — rare, long cycle. */}
      <div className="sp-comet-drift absolute top-[28%] h-[0.5vmin] w-[10vmin]" style={{ ["--sp-drift-duration" as string]: "42s", ["--sp-drift-delay" as string]: "-14s" }}>
        <div className="h-full w-full rounded-full" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.9))" }} />
      </div>
    </div>
  );
}
