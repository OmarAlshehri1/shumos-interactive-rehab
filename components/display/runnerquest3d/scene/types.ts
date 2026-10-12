import type { Encounter, Lane, StageSpec } from "@/lib/runnerquest3d/types";

export type Quality = "low" | "medium" | "high";
export const QUALITY_ORDER: Quality[] = ["low", "medium", "high"];

export interface QualityPreset {
  dpr: number;
  shadows: 0 | 1024 | 2048;
  /** Number of scenery cells kept alive ahead of the runner. */
  cells: number;
  particles: number;
  antialias: boolean;
}
export const QUALITY: Record<Quality, QualityPreset> = {
  low: { dpr: 0.85, shadows: 0, cells: 34, particles: 0, antialias: false },
  medium: { dpr: 1.25, shadows: 1024, cells: 48, particles: 40, antialias: true },
  high: { dpr: 1.75, shadows: 2048, cells: 64, particles: 90, antialias: true },
};

/** Everything the scene needs to draw one frame. The Display derives it from authoritative state. */
export interface SceneFrame {
  distance: number;
  speed: number;
  lane: Lane;
  holding: boolean;
  /** run: moving, idle: ready/paused, celebrate: stage/session complete moment. */
  mood: "run" | "idle" | "celebrate";
  /** Bumped by Control on checkpoint/marker success. */
  celebrateSeq: number;
  /** Total stars earned this stage; an increase spawns a soft sparkle burst. */
  stars: number;
  /** Per-encounter flags, same order as `encounters`. */
  armed: readonly boolean[];
  resolved: readonly boolean[];
  footLiftRequired: boolean;
  reducedMotion: boolean;
}

export interface SceneStageInput {
  spec: StageSpec;
  encounters: readonly Encounter[];
  length: number;
}

export interface SceneStats {
  fps: number;
  frameMsAvg: number;
  frameMsMax: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  quality: Quality;
  pixelRatio: number;
  shadows: boolean;
  assetLoadMs: number;
  frames: number;
}
