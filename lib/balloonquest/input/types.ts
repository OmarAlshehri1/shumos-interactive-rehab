import type { InputMode, SourceId } from "../types";

/**
 * A pointer sample from ANY source, already in stage coordinates (0..1 of the
 * projected image, x right, y down). `atMs` is the monotonic receive time on
 * the Control machine (the same clock the hub is asked about), never a device clock.
 */
export interface PointerSample {
  sourceId: SourceId;
  x: number;
  y: number;
  visible: boolean;
  /** Per-source, increasing. */
  seq: number;
  atMs: number;
}

/**
 * Narrow adapter every input provider implements. Real hardware adapters
 * (WT901 hands today; foot sensors and handheld controllers in future) live
 * OUTSIDE this module and only ever call `emit` with an already-normalised
 * pointer. Nothing here knows about BLE, calibration or sensor fusion.
 */
export interface PointerAdapter {
  readonly sourceId: SourceId;
  /** True only for adapters backed by verified physical hardware. Simulated adapters must report false. */
  readonly hardwareVerified: boolean;
  start(emit: (sample: PointerSample) => void): void;
  stop(): void;
}

export const STALE_MS = 250;
export const FUTURE_SKEW_MS = 50;

export function sourcesForMode(mode: InputMode): SourceId[] {
  switch (mode) {
    case "right-hand":
      return ["RIGHT_HAND"];
    case "left-hand":
      return ["LEFT_HAND"];
    case "both-hands":
      return ["RIGHT_HAND", "LEFT_HAND"];
    case "foot":
      return ["RIGHT_FOOT", "LEFT_FOOT"];
    case "handheld":
      return ["HANDHELD"];
    case "keyboard":
      return ["KEYBOARD"];
    case "therapist":
      return [];
  }
}

/** Sensor-style modes must have live input to play; the keyboard (a development aid) is always live. */
export const requiresLiveInput = (mode: InputMode): boolean => mode !== "keyboard" && mode !== "therapist";

/** Modes whose real-hardware behaviour has NOT been validated in this project. */
export const EXPERIMENTAL_MODES: readonly InputMode[] = ["left-hand", "both-hands", "foot", "handheld"];
