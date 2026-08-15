/**
 * Independent volume levels per channel, mirroring the Master/Ambience/
 * Voice/Effects concept from the spec. No UI controls these individually
 * yet (that's a future /control task) — the levels exist internally so the
 * mix is centralized in one place instead of magic numbers scattered
 * across effect/ambience code.
 */
export interface ChannelVolumes {
  master: number;
  ambience: number;
  voice: number;
  effects: number;
}

export const DEFAULT_CHANNEL_VOLUMES: ChannelVolumes = {
  master: 1,
  // Kept deliberately quiet: ambience is a background texture, never competing with voice or effects.
  ambience: 0.32,
  voice: 1,
  effects: 0.75,
};

/**
 * high  — instructions, countdown, stage/session complete: must always be heard, may interrupt anything.
 * normal — encouragement: nice to have, never interrupts a high-priority line.
 * low   — optional incidental feedback (incorrect): drops silently if anything else is already speaking.
 */
export type VoicePriority = "high" | "normal" | "low";
