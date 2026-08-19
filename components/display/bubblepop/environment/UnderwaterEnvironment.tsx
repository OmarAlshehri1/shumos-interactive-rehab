import { Difficulty, getBubbleStagePlan, type StageNumber } from "@/lib/bubblepop";
import { FishArt } from "../creatures/FishArt";
import { JellyfishArt } from "../creatures/JellyfishArt";
import { SeahorseArt } from "../creatures/SeahorseArt";
import { TurtleArt } from "../creatures/TurtleArt";

/**
 * UNDERWATER WORLD — Bubble Pop Wall's own persistent background world: a
 * deep-ocean-to-turquoise water gradient, caustic light rays, a soft
 * seabed, coral silhouettes, sea plants, real sea life, and rising
 * background bubbles. Purely decorative (pointer-events-none, aria-hidden)
 * — WALL-projection oriented (a face-on vertical composition with light
 * filtering down from the top, never a floor's ground-plane depth cue).
 *
 * REAL CREATURE ART (task Part D) — every animal here is a proper SVG
 * silhouette (FishArt/TurtleArt/JellyfishArt/SeahorseArt), never a plain
 * circle/blob. Positions/variants are hand-placed, not randomized, so this
 * can never hydration-mismatch and every count stays fixed (task's
 * performance budget).
 *
 * SINGLE SOURCE OF TRUTH (task Part H) — which creatures appear is read
 * straight from getBubbleStagePlan(difficulty, stageNumber).seaLife, the
 * exact same plan the generator/Stage Cards use, never a separate ad-hoc
 * threshold.
 */

const FISH_SLOTS = [
  { top: "30%", left: "12%", variant: 0, scale: 0.9, delay: "0s", duration: "16s" },
  { top: "48%", left: "82%", variant: 1, scale: 1.0, delay: "-6s", duration: "19s" },
  { top: "62%", left: "20%", variant: 2, scale: 0.8, delay: "-11s", duration: "17s" },
  { top: "22%", left: "68%", variant: 3, scale: 1.1, delay: "-3s", duration: "21s" },
  { top: "70%", left: "55%", variant: 4, scale: 0.85, delay: "-15s", duration: "18s" },
  { top: "16%", left: "38%", variant: 1, scale: 0.75, delay: "-9s", duration: "20s" },
  { top: "56%", left: "8%", variant: 3, scale: 0.95, delay: "-2s", duration: "23s" },
] as const;

const DECORATIVE_BUBBLES = [
  { left: "8%", size: "1.2vmin", delay: "0s", duration: "9s" },
  { left: "22%", size: "0.9vmin", delay: "-3s", duration: "11s" },
  { left: "40%", size: "1.4vmin", delay: "-6s", duration: "8s" },
  { left: "58%", size: "1vmin", delay: "-2s", duration: "10s" },
  { left: "74%", size: "1.3vmin", delay: "-8s", duration: "9.5s" },
  { left: "88%", size: "0.9vmin", delay: "-5s", duration: "12s" },
] as const;

const CORAL_POSITIONS = [
  { left: "4%", height: "12vmin", hue: "#E0637A" },
  { left: "92%", height: "10vmin", hue: "#E08F5A" },
] as const;

export interface UnderwaterEnvironmentProps {
  /** Deterministic per-stage variation, never a random composition. 1 when no stage is active yet (Welcome). */
  stageNumber?: StageNumber;
  difficulty?: Difficulty;
}

export function UnderwaterEnvironment({ stageNumber = 1, difficulty = Difficulty.EASY }: UnderwaterEnvironmentProps) {
  const plan = getBubbleStagePlan(difficulty, stageNumber);
  const seaLife = plan.seaLife;
  const fishCount = seaLife.fish === "SCHOOL" ? FISH_SLOTS.length : seaLife.fish === "FEW" ? 2 : 0;
  const richerCoral = fishCount >= 5;
  const prominentTreasure = plan.features.treasure;

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Deep ocean -> turquoise water gradient. */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, #06283D 0%, #0A4258 28%, #0F6788 55%, #1596A9 78%, #1FB6BE 100%)" }}
      />

      {/* Caustic light rays filtering down from the surface. */}
      <div
        className="absolute inset-0 opacity-50"
        style={{
          background:
            "linear-gradient(105deg, rgba(255,255,255,0.12) 0%, transparent 12%, transparent 22%, rgba(255,255,255,0.08) 30%, transparent 42%, rgba(255,255,255,0.1) 55%, transparent 65%)",
        }}
      />
      <div
        className="absolute inset-x-0 top-0 h-[45%] opacity-40"
        style={{ background: "radial-gradient(60% 60% at 50% 0%, rgba(210,245,255,0.35) 0%, rgba(210,245,255,0) 70%)" }}
      />

      {FISH_SLOTS.slice(0, fishCount).map((fish, i) => (
        <FishArt
          key={i}
          variant={fish.variant}
          sizeScale={fish.scale}
          className="bp-fish absolute"
          style={
            {
              top: fish.top,
              left: fish.left,
              width: "9vmin",
              height: "5.4vmin",
              "--bp-fish-delay": fish.delay,
              "--bp-fish-duration": fish.duration,
            } as React.CSSProperties
          }
        />
      ))}

      {seaLife.turtle && <TurtleArt className="bp-turtle-drift absolute top-[36%]" style={{ width: "12vmin", height: "8.4vmin" }} />}

      {seaLife.jellyfish && <JellyfishArt className="bp-jelly-drift absolute top-[22%]" style={{ width: "11vmin", height: "11vmin" }} />}

      {seaLife.seahorse && <SeahorseArt className="bp-seahorse-drift absolute top-[52%]" style={{ width: "6vmin", height: "10vmin" }} />}

      {CORAL_POSITIONS.map((coral, i) => (
        <div
          key={i}
          className="absolute bottom-0 w-[6vmin] rounded-t-full opacity-80"
          style={{ left: coral.left, height: richerCoral ? `calc(${coral.height} * 1.3)` : coral.height, background: coral.hue }}
        />
      ))}

      {DECORATIVE_BUBBLES.map((bubble, i) => (
        <span
          key={i}
          className="bp-rise absolute rounded-full border border-white/30 bg-white/10"
          style={{ left: bubble.left, width: bubble.size, height: bubble.size, animationDelay: bubble.delay, animationDuration: bubble.duration }}
        />
      ))}

      {prominentTreasure && (
        <div
          className="absolute bottom-[6%] left-1/2 h-[5vmin] w-[5vmin] -translate-x-1/2 rounded-full opacity-70"
          style={{ background: "radial-gradient(circle, rgba(255,224,140,0.9) 0%, rgba(255,224,140,0) 70%)" }}
        />
      )}

      {/* Seabed depth cue near the bottom edge. */}
      <div className="absolute inset-x-0 bottom-0 h-[16vh]" style={{ background: "linear-gradient(180deg, rgba(6,40,61,0) 0%, rgba(4,28,42,0.6) 100%)" }} />
    </div>
  );
}
