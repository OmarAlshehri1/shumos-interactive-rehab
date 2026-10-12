import { Difficulty } from '@/lib/game';
import { type Layout } from './geometry';

/** 3 levels x 3 stages. `warn[i]` is the number of warning tiles in round i (never above `maxWarn`). */
export interface StageDef {
  index: number;
  level: 1 | 2 | 3;
  stage: 1 | 2 | 3;
  /** Tile count of the STANDARD preset (the approved stage rules). Use `tilesFor` for the active preset. */
  tiles: number;
  rounds: number;
  maxWarn: number;
  warn: readonly number[];
}

const def = (index: number, level: 1 | 2 | 3, stage: 1 | 2 | 3, tiles: number, warn: number[]): StageDef => ({
  index, level, stage, tiles, rounds: warn.length, maxWarn: Math.max(...warn), warn,
});

export const STAGES: readonly StageDef[] = [
  def(0, 1, 1, 9, [1, 1, 1]),
  def(1, 1, 2, 9, [1, 1, 1]),
  def(2, 1, 3, 9, [1, 2, 1, 2]),
  def(3, 2, 1, 12, [2, 2, 2, 2]),
  def(4, 2, 2, 12, [2, 2, 2, 2, 2]),
  def(5, 2, 3, 12, [2, 3, 2, 3, 3]),
  def(6, 3, 1, 16, [2, 3, 2, 3, 3]),
  def(7, 3, 2, 16, [2, 3, 3, 2, 3, 3]),
  def(8, 3, 3, 16, [3, 4, 3, 4, 4, 3]),
];

/**
 * Layout presets (therapist-selected size of the physical target zones).
 *  - STANDARD: the approved stage rules, 9 / 12 / 16 tiles for level 1 / 2 / 3.
 *  - EXTRA_LARGE: an explicit accessibility adaptation with FEWER, larger zones: 6 / 9 / 12 tiles. Rounds, warned-tile
 *    counts and every other rule are unchanged; only the number of tiles on the floor changes.
 *  - COMPACT: MORE, smaller zones for children who can handle them: 12 / 16 / 20 tiles. Same rules otherwise.
 */
export const LAYOUT_PRESETS = ['STANDARD', 'EXTRA_LARGE', 'COMPACT'] as const;
export type LayoutPreset = (typeof LAYOUT_PRESETS)[number];
const PRESET_TILES: Record<LayoutPreset, readonly [number, number, number]> = {
  STANDARD: [9, 12, 16],
  EXTRA_LARGE: [6, 9, 12],
  COMPACT: [12, 16, 20],
};
export const tilesFor = (stageIndex: number, preset: LayoutPreset): number => PRESET_TILES[preset][Math.floor(stageIndex / 3)];
/** Warned tiles never exceed half the layout, so the safe region always dominates. */
export const warnCap = (stageIndex: number, preset: LayoutPreset): number => Math.min(STAGES[stageIndex].maxWarn, Math.floor(tilesFor(stageIndex, preset) / 2));

export const LEVEL_DIFFICULTY = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.ADVANCED] as const;
export const difficultyOf = (stageIndex: number): Difficulty => LEVEL_DIFFICULTY[Math.floor(stageIndex / 3)];

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(...parts: number[]): number {
  let h = 2166136261;
  for (const p of parts) {
    h ^= p | 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface WarningCheck {
  ok: boolean;
  reason?: 'range' | 'duplicates' | 'no-safe' | 'trapped' | 'disconnected';
}

/**
 * The safety contract of a warning set (checked for every generated round and in the tests):
 * - every index exists and appears once, and at least one tile stays safe;
 * - every warned tile touches a safe tile, so a child on it only ever needs a one-tile step
 *   (no forced jump, no long-distance step, no tile whose neighbours are all inactive);
 * - the safe tiles stay one connected region, so every safe tile is reachable over adjacent safe tiles.
 */
export function checkWarning(layout: Layout, warn: readonly number[]): WarningCheck {
  const size = layout.tiles;
  if (warn.some((t) => !Number.isInteger(t) || t < 0 || t >= size)) return { ok: false, reason: 'range' };
  const set = new Set(warn);
  if (set.size !== warn.length) return { ok: false, reason: 'duplicates' };
  const safe: number[] = [];
  for (let t = 0; t < size; t++) if (!set.has(t)) safe.push(t);
  if (safe.length === 0) return { ok: false, reason: 'no-safe' };
  for (const t of set) if (!layout.neighbors[t].some((n) => !set.has(n))) return { ok: false, reason: 'trapped' };
  const seen = new Set<number>([safe[0]]);
  const queue = [safe[0]];
  while (queue.length) {
    const cur = queue.pop()!;
    for (const n of layout.neighbors[cur]) if (!set.has(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
  }
  return seen.size === safe.length ? { ok: true } : { ok: false, reason: 'disconnected' };
}

export interface RoundInput {
  layout: Layout;
  preset: LayoutPreset;
  seed: number;
  stage: number;
  round: number;
  /** The therapist-confirmed tile of the child, or null when unknown. Never guessed. */
  childTile: number | null;
  /** When true and the child's tile is known, that tile is always among the warned tiles (practises a one-tile step). */
  targetChild: boolean;
  previous?: readonly number[];
}

/**
 * Deterministic warning set for one round: same input, same set. Always satisfies `checkWarning`.
 * Tries seeded random sets first (avoiding an exact repeat of the previous round, which gives the
 * "slightly varied positions"), then falls back to a single warned tile, which is valid on every layout.
 */
export function generateWarning(input: RoundInput): number[] {
  const def = STAGES[input.stage];
  const { layout } = input;
  const size = layout.tiles;
  const count = Math.max(1, Math.min(def.warn[input.round] ?? 1, warnCap(input.stage, input.preset), size - 1));
  const forced = input.targetChild && input.childTile !== null && input.childTile >= 0 && input.childTile < size ? input.childTile : null;
  const prev = input.previous ? [...input.previous].sort((a, b) => a - b).join(',') : '';
  const rng = mulberry32(hashSeed(input.seed, input.stage, input.round, forced ?? -1));
  for (let attempt = 0; attempt < 60; attempt++) {
    const pool = Array.from({ length: size }, (_, i) => i).filter((i) => i !== forced);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const warn = (forced === null ? pool.slice(0, count) : [forced, ...pool.slice(0, count - 1)]).sort((a, b) => a - b);
    if (!checkWarning(layout, warn).ok) continue;
    if (attempt < 40 && prev && warn.join(',') === prev) continue;
    return warn;
  }
  const single = [forced ?? Math.floor(rng() * size)];
  return checkWarning(layout, single).ok ? single : [0];
}
