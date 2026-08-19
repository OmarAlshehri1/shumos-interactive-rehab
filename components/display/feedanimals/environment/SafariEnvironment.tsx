/**
 * SAFARI ADVENTURE WORLD — Feed the Animals' own persistent background
 * world: a warm golden savanna gradient, soft sun rays, distant rolling
 * hills, acacia tree silhouettes, tall grass, drifting leaves, butterflies,
 * and warm dust motes. Purely decorative (pointer-events-none, aria-hidden)
 * — WALL-projection oriented (a face-on vertical composition), and shares
 * NONE of Balloon Quest's magical garden (Environment.tsx), Follow the
 * Footsteps' cosmic world (CosmicEnvironment.tsx), or Bubble Pop Wall's
 * underwater world (UnderwaterEnvironment.tsx). All positions are
 * hand-placed, not randomized, so this can never hydration-mismatch.
 *
 * STAGE ENVIRONMENT VARIATION (task section 46) — deterministic by
 * stageNumber, never Math.random() at render: stage 1 is a simple warm
 * savanna; more butterflies + richer grass from stage 2; distant animal
 * silhouettes from stage 3; a richer sunset + more leaves at stage 4; a
 * warm safari-camp glow at stage 5.
 */

const ACACIA_TREES = [
  { left: "6%", height: "22vmin", width: "16vmin" },
  { left: "88%", height: "18vmin", width: "13vmin" },
] as const;

const GRASS_TUFTS = [
  { left: "2%", height: "9vmin" },
  { left: "14%", height: "7vmin" },
  { left: "30%", height: "6vmin" },
  { left: "48%", height: "8vmin" },
  { left: "64%", height: "6.5vmin" },
  { left: "80%", height: "7.5vmin" },
  { left: "94%", height: "9vmin" },
] as const;

const BUTTERFLIES = [
  { top: "28%", left: "18%", hue: "#F2924C", delay: "0s", duration: "13s" },
  { top: "40%", left: "76%", hue: "#F2C94C", delay: "-5s", duration: "15s" },
  { top: "20%", left: "55%", hue: "#E86FA0", delay: "-9s", duration: "12s" },
] as const;

const DRIFTING_LEAVES = [
  { left: "10%", size: "2.2vmin", delay: "0s", duration: "11s" },
  { left: "35%", size: "1.6vmin", delay: "-4s", duration: "13s" },
  { left: "60%", size: "2vmin", delay: "-7s", duration: "12s" },
  { left: "82%", size: "1.7vmin", delay: "-2s", duration: "14s" },
] as const;

const DUST_MOTES = [
  { left: "20%", top: "55%", delay: "0s" },
  { left: "50%", top: "40%", delay: "-4s" },
  { left: "72%", top: "62%", delay: "-8s" },
  { left: "35%", top: "70%", delay: "-2s" },
] as const;

export interface SafariEnvironmentProps {
  /** Deterministic per-stage variation (task section 46) — never a random composition. 1 when no stage is active yet (Welcome). */
  stageNumber?: 1 | 2 | 3 | 4 | 5;
}

export function SafariEnvironment({ stageNumber = 1 }: SafariEnvironmentProps) {
  const showButterflies = stageNumber >= 2;
  const richerGrass = stageNumber >= 2;
  const showDistantAnimals = stageNumber >= 3;
  const richerSunset = stageNumber >= 4;
  const campGlow = stageNumber >= 5;

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Warm golden savanna sky -> earthy ground gradient. */}
      <div
        className="absolute inset-0"
        style={{
          background: richerSunset
            ? "linear-gradient(180deg, #F2924C 0%, #F2A65C 22%, #E8B15E 42%, #C79A4E 64%, #8A6B3A 100%)"
            : "linear-gradient(180deg, #F7C873 0%, #F2B25C 26%, #E0A85C 48%, #B99658 70%, #7C6238 100%)",
        }}
      />

      {/* Warm sun rays. */}
      <div
        className="absolute inset-x-0 top-0 h-[42%] opacity-50"
        style={{ background: "radial-gradient(55% 55% at 50% 0%, rgba(255,244,214,0.55) 0%, rgba(255,244,214,0) 70%)" }}
      />

      {/* Distant rolling hills. */}
      <div className="absolute inset-x-0 bottom-[18%] h-[14vh] opacity-60" style={{ background: "linear-gradient(180deg, transparent 0%, #7A6339 100%)", borderRadius: "50% 50% 0 0 / 100% 100% 0 0" }} />

      {campGlow && (
        <div
          className="absolute bottom-[16%] left-1/2 h-[10vmin] w-[26vmin] -translate-x-1/2 rounded-full opacity-70"
          style={{ background: "radial-gradient(ellipse, rgba(255,214,140,0.55) 0%, rgba(255,214,140,0) 75%)" }}
        />
      )}

      {showDistantAnimals && (
        <>
          <div className="absolute bottom-[20%] left-[14%] h-[3vmin] w-[5vmin] rounded-t-full opacity-40" style={{ background: "#4A3A22" }} />
          <div className="absolute bottom-[20%] right-[18%] h-[3.4vmin] w-[4vmin] rounded-t-full opacity-40" style={{ background: "#4A3A22" }} />
        </>
      )}

      {ACACIA_TREES.map((tree, i) => (
        <div key={i} className="absolute bottom-[16%]" style={{ left: tree.left }}>
          <div className="mx-auto h-[60%] w-[10%] rounded-sm opacity-80" style={{ background: "#5A4126" }} />
          <div
            className="absolute -top-[2%] left-1/2 -translate-x-1/2 rounded-[50%_50%_45%_45%] opacity-85"
            style={{ width: tree.width, height: `calc(${tree.height} * 0.55)`, background: "#3F6B2E" }}
          />
        </div>
      ))}

      {GRASS_TUFTS.map((tuft, i) => (
        (richerGrass || i % 2 === 0) && (
          <div
            key={i}
            className="fa-grass absolute bottom-0 w-[1.4vmin] rounded-t-full opacity-80"
            style={{ left: tuft.left, height: tuft.height, background: "#6B8A3A", animationDelay: `${i * 0.3}s` }}
          />
        )
      ))}

      {showButterflies &&
        BUTTERFLIES.map((b, i) => (
          <span
            key={i}
            className="fa-butterfly absolute h-[1.8vmin] w-[1.8vmin] opacity-85"
            style={{ top: b.top, left: b.left, background: b.hue, borderRadius: "50% 50% 50% 0%", animationDelay: b.delay, animationDuration: b.duration }}
          />
        ))}

      {DRIFTING_LEAVES.map((leaf, i) => (
        <span
          key={i}
          className="fa-leaf absolute rounded-[60%_10%] opacity-70"
          style={{ left: leaf.left, width: leaf.size, height: leaf.size, background: "#7AAE4A", animationDelay: leaf.delay, animationDuration: leaf.duration }}
        />
      ))}

      {DUST_MOTES.map((mote, i) => (
        <span
          key={i}
          className="fa-dust absolute h-[0.5vmin] w-[0.5vmin] rounded-full bg-amber-100/70"
          style={{ left: mote.left, top: mote.top, animationDelay: mote.delay }}
        />
      ))}

      {/* Ground depth cue near the bottom edge. */}
      <div className="absolute inset-x-0 bottom-0 h-[14vh]" style={{ background: "linear-gradient(180deg, rgba(70,50,20,0) 0%, rgba(50,36,16,0.55) 100%)" }} />
    </div>
  );
}
