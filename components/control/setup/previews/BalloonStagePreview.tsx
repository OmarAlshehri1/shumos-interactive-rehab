"use client";

import { useMemo } from "react";
import type { Difficulty, StageNumber } from "@/lib/game";
import { getStagePreset } from "@/lib/control/stagePreset";
import { BALLOON_COLOR_THEME } from "@/components/display/colorPalette";

interface BalloonStagePreviewProps {
  difficulty: Difficulty;
  stageNumber: StageNumber;
}

/**
 * THERAPIST SETUP SIMPLIFICATION — non-interactive miniature of a real
 * Balloon Quest stage, so a therapist can see roughly what the child will
 * see before starting it. Renders the SAME generateStage output the actual
 * session will use (via getStagePreset, a fixed preview seed) — never a
 * decorative stand-in. No click handlers, no audio, no timers, no isTarget
 * styling (matches the live display, which doesn't visually flag the
 * target color on the balloons themselves either).
 */
export function BalloonStagePreview({ difficulty, stageNumber }: BalloonStagePreviewProps) {
  const preset = useMemo(() => getStagePreset(difficulty, stageNumber), [difficulty, stageNumber]);

  return (
    <div className="pointer-events-none absolute inset-0" style={{ containerType: "size" }} aria-hidden="true">
      {preset.stage.balloons.map((balloon) => {
        const theme = BALLOON_COLOR_THEME[balloon.color];
        return (
          <span
            key={balloon.id}
            className="absolute rounded-full border border-black/10 shadow-sm"
            style={{
              left: `${balloon.position.x * 100}%`,
              top: `${balloon.position.y * 100}%`,
              width: `clamp(10px, ${balloon.size * 100}cqmin, 20vmin)`,
              height: `clamp(10px, ${balloon.size * 100}cqmin, 20vmin)`,
              transform: "translate(-50%, -50%)",
              backgroundColor: theme.base,
            }}
          />
        );
      })}
    </div>
  );
}
