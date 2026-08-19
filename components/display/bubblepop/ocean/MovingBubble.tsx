"use client";

import { useEffect, useState } from "react";
import type { Bubble } from "@/lib/bubblepop";
import { BubbleArt } from "../bubbles/BubbleArt";
import { bubbleMotionX, elapsedActiveMs } from "./bubbleMotion";

interface MovingBubbleProps {
  bubble: Bubble;
  targetStartedAt: number | null;
  targetPausedMs: number;
  pausedAt: number | null;
}

/**
 * The ONE active mission bubble (task section 5-7), animated by a plain
 * requestAnimationFrame loop rather than a fire-and-forget CSS/Motion
 * keyframe loop — this lets pause freeze it EXACTLY in place (task section
 * 16) and lets a fresh mount (a therapist refresh, task section 18) start
 * from the true canonical elapsed time instead of restarting at the edge.
 */
export function MovingBubble({ bubble, targetStartedAt, targetPausedMs, pausedAt }: MovingBubbleProps) {
  const [x, setX] = useState(() => bubbleMotionX(bubble.direction, bubble.travelMs, elapsedActiveMs(Date.now(), targetStartedAt, targetPausedMs, pausedAt)));

  useEffect(() => {
    let raf: number | undefined;
    function tick() {
      const elapsed = elapsedActiveMs(Date.now(), targetStartedAt, targetPausedMs, pausedAt);
      setX(bubbleMotionX(bubble.direction, bubble.travelMs, elapsed));
      if (pausedAt === null) raf = requestAnimationFrame(tick);
    }
    tick();
    return () => {
      if (raf !== undefined) cancelAnimationFrame(raf);
    };
  }, [bubble.id, bubble.direction, bubble.travelMs, targetStartedAt, targetPausedMs, pausedAt]);

  return (
    <div
      className="absolute"
      style={{
        left: `${x * 100}%`,
        top: `${bubble.lane * 100}%`,
        width: `clamp(30px, ${bubble.size * 100}cqmin, 22vmin)`,
        height: `clamp(30px, ${bubble.size * 100}cqmin, 22vmin)`,
        transform: "translate(-50%, -50%)",
      }}
    >
      <BubbleArt color={bubble.color} shape={bubble.shape} />
    </div>
  );
}
