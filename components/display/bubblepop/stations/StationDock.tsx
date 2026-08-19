"use client";

import type { BubbleColor, StationToken } from "@/lib/bubblepop";
import { PearlStation } from "./PearlStation";

interface StationDockProps {
  /** Fixed color palette for a plain color stage — ignored (stationTokens takes over) when a color+shape mission is active. */
  stations: readonly BubbleColor[];
  /** The CURRENT mission's own per-mission candidate token set (task Part G) — set only while that mission `requiresShape`; renders (color, shape) pearls instead of the fixed color palette. */
  stationTokens: readonly StationToken[] | null;
  pulsingColor: BubbleColor | null;
  wobblingColor: BubbleColor | null;
}

/**
 * REACHABLE AREA (task section 2) — the fixed lower band of the wall where
 * every station lives, large and evenly spaced regardless of station count
 * (2 for Easy 1, up to 6 candidate pearls for Advanced's color+shape
 * missions). Deliberately never scattered across the whole wall.
 */
export function StationDock({ stations, stationTokens, pulsingColor, wobblingColor }: StationDockProps) {
  const items: { key: string; color: BubbleColor; shape?: StationToken["shape"] }[] =
    stationTokens && stationTokens.length > 0
      ? stationTokens.map((t, i) => ({ key: `${t.color}-${t.shape}-${i}`, color: t.color, shape: t.shape }))
      : stations.map((color) => ({ key: color, color }));

  return (
    <div className="absolute inset-x-0 bottom-0 flex h-[24%] items-end justify-center gap-[4vmin] px-[6vw] pb-[3vh]">
      {items.map((item) => (
        <div key={item.key} className="h-full" style={{ width: `min(20vmin, ${Math.floor(80 / items.length)}%)` }}>
          <PearlStation color={item.color} shape={item.shape} pulsing={pulsingColor === item.color} wobbling={wobblingColor === item.color} />
        </div>
      ))}
    </div>
  );
}
