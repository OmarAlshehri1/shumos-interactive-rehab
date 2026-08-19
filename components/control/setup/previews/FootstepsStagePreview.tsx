"use client";

import { useMemo } from "react";
import { Foot, START_ZONE, type Difficulty, type StageNumber } from "@/lib/footsteps";
import { getFootstepsStagePreset } from "@/lib/control/footsteps/stagePreset";
import { ObstacleArt } from "@/components/display/footsteps/obstacles/ObstacleArt";

interface FootstepsStagePreviewProps {
  difficulty: Difficulty;
  stageNumber: StageNumber;
}

/**
 * THERAPIST SETUP SIMPLIFICATION — non-interactive miniature of a real
 * Follow the Footsteps stage, so a therapist can see roughly what the child
 * will walk before starting it. Renders the SAME generateFootstepsPath
 * output the actual session will use (via getFootstepsStagePreset, a fixed
 * preview seed) — never a decorative stand-in. No click handlers, no audio,
 * no timers.
 *
 * Deliberately shows the FULL path (start marker, every footprint,
 * destination star) at once — unlike components/control/footsteps/live/
 * FootMap.tsx (the live therapist map) and the child-facing /display, both
 * of which only ever reveal one active footprint at a time. A therapist
 * setup preview showing the whole route is explicitly allowed by the task —
 * this is a NEW standalone component, not a repurposed FootMap.
 *
 * Visual conventions (dark starfield backdrop, amber LEFT / cyan RIGHT foot
 * color, destination ⭐) are matched from FootMap.tsx so a therapist
 * recognizes the same "cosmic floor" at setup time as during the live
 * session, but nothing here is imported from FootMap — it's a fresh, purely
 * decorative rendering.
 */
/**
 * Trig-derived floats (pathGenerator.ts uses Math.atan2/Math.sin/Math.tan to
 * compute headings and rotations) aren't guaranteed bit-identical between
 * Node's V8 build (SSR) and the browser's V8 build (hydration) — a known
 * cross-engine floating-point portability gap, last-ULP only, invisible at
 * this component's render scale. Rounding to a fixed precision before
 * embedding in the style string guarantees server and client always produce
 * the exact same string regardless of that noise. Presentational fix only —
 * does not touch pathGenerator.ts's actual deterministic generation.
 */
function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function FootstepsStagePreview({ difficulty, stageNumber }: FootstepsStagePreviewProps) {
  const preset = useMemo(() => getFootstepsStagePreset(difficulty, stageNumber), [difficulty, stageNumber]);
  const { path } = preset;
  const startX = (START_ZONE.xMin + START_ZONE.xMax) / 2;
  const startY = START_ZONE.yMin;

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden bg-gradient-to-b from-indigo-950 to-slate-900"
      style={{ containerType: "size" }}
      aria-hidden="true"
    >
      {/* Faint starfield backdrop, matching FootMap's "cosmic floor" framing. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(1px 1px at 20% 30%, white, transparent), radial-gradient(1px 1px at 60% 70%, white, transparent), radial-gradient(1px 1px at 80% 20%, white, transparent), radial-gradient(1px 1px at 40% 85%, white, transparent)",
        }}
      />

      {/* مكان الطفل — where the route departs from. */}
      <span
        className="absolute rounded-full border border-white/50 bg-white/80"
        style={{
          left: `${round(startX * 100)}%`,
          top: `${round(startY * 100)}%`,
          width: "clamp(6px, 6cqmin, 12vmin)",
          height: "clamp(6px, 6cqmin, 12vmin)",
          transform: "translate(-50%, -50%)",
        }}
      />

      {path.footprints.map((footprint) => (
        <span
          key={footprint.id}
          className="absolute rounded-[40%]"
          style={{
            left: `${round(footprint.position.x * 100)}%`,
            top: `${round(footprint.position.y * 100)}%`,
            width: "clamp(8px, 7cqmin, 14vmin)",
            height: "clamp(8px, 7cqmin, 14vmin)",
            transform: `translate(-50%, -50%) rotate(${round(footprint.rotationDeg)}deg)`,
            backgroundColor: footprint.foot === Foot.LEFT ? "#F0B429" : "#6EE7F0",
            opacity: 0.9,
          }}
        />
      ))}

      {/* Checkpoint stars: smaller than the final destination (task section 7's "small star = milestone, big star = final goal"). */}
      {path.checkpoints.map((checkpoint) => (
        <span
          key={checkpoint.id}
          className="absolute flex items-center justify-center"
          style={{
            left: `${round(checkpoint.position.x * 100)}%`,
            top: `${round(checkpoint.position.y * 100)}%`,
            transform: "translate(-50%, -50%)",
          }}
        >
          <span className="text-[clamp(9px,3.5cqmin,16px)] opacity-80">⭐</span>
        </span>
      ))}

      {/* ROUTE ARCHITECTURE REWRITE — cosmic obstacles (ADVANCED only), replacing the old SINGLE/PAIR stance rings. */}
      {path.obstacles.map((obstacle) => (
        <span
          key={obstacle.id}
          className="absolute"
          style={{
            left: `${round(obstacle.position.x * 100)}%`,
            top: `${round(obstacle.position.y * 100)}%`,
            width: "clamp(11px, 6cqmin, 15vmin)",
            height: "clamp(11px, 6cqmin, 15vmin)",
            transform: `translate(-50%, -50%) rotate(${round(obstacle.rotationDeg)}deg)`,
          }}
        >
          <ObstacleArt kind={obstacle.kind} />
        </span>
      ))}

      {/* نجمة الهدف */}
      <span
        className="absolute flex items-center justify-center"
        style={{
          left: `${round(path.destination.x * 100)}%`,
          top: `${round(path.destination.y * 100)}%`,
          transform: "translate(-50%, -50%)",
        }}
      >
        <span className="text-[clamp(12px,5cqmin,22px)]">⭐</span>
      </span>
    </div>
  );
}
