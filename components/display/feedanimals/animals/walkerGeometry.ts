import { Animal } from "@/lib/feedanimals";

interface WalkerGeometry {
  viewBoxWidth: number;
  viewBoxHeight: number;
  /** Horizontal midpoint between the two natural foot contacts. */
  contactX: number;
  /** Lowest natural foot/ground contact coordinate in the walker SVG. */
  contactY: number;
}

/**
 * Centralized art geometry, not CSS tuning: each SVG has a different
 * viewBox and a different amount of transparent space below its feet.
 * AnimalWalker uses this metadata to place every visual foot contact at
 * the common bottom-center anchor consumed by the path scene.
 */
export const WALKER_GEOMETRY: Record<Animal, WalkerGeometry> = {
  [Animal.MONKEY]: { viewBoxWidth: 100, viewBoxHeight: 140, contactX: 50, contactY: 133 },
  [Animal.RABBIT]: { viewBoxWidth: 100, viewBoxHeight: 140, contactX: 50, contactY: 128 },
  [Animal.PANDA]: { viewBoxWidth: 100, viewBoxHeight: 140, contactX: 50, contactY: 128 },
  [Animal.ELEPHANT]: { viewBoxWidth: 100, viewBoxHeight: 140, contactX: 50, contactY: 135 },
  [Animal.GIRAFFE]: { viewBoxWidth: 100, viewBoxHeight: 160, contactX: 48, contactY: 146 },
};

export function walkerContactTranslationPercent(animal: Animal, facing: "left" | "right" = "right"): { x: number; y: number } {
  const geometry = WALKER_GEOMETRY[animal];
  const displayedContactX = facing === "left" ? geometry.viewBoxWidth - geometry.contactX : geometry.contactX;
  return {
    x: ((geometry.viewBoxWidth / 2 - displayedContactX) / geometry.viewBoxWidth) * 100,
    y: ((geometry.viewBoxHeight - geometry.contactY) / geometry.viewBoxHeight) * 100,
  };
}
