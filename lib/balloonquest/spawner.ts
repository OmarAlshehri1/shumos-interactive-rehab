/**
 * Deterministic balloon population for one stage, driven ONLY by the
 * simulation clock. Rising balloons share one constant speed per stage, so the
 * spacing verified at spawn time can never turn into an overlap later.
 * Popped balloons never come back; replacements enter later from below
 * (rising) or into a different free slot (static). Nothing here ends a stage.
 */
import { balloonTop, GAP_X, GAP_Y, heightCqh, placeSlots, START_Y, topFromSlot, widthCqw } from "./geometry";
import { mulberry32 } from "./rng";
import { LAYOUT_TUNING } from "./stages";
import type { Balloon, BalloonColor, ResolvedStage, SpawnState, StageRuntime } from "./types";

export const HOUSEKEEPING_MS = 100;
export const POP_MS = 900;
const SPAWN_MIN_MS = 800;
const SPAWN_MAX_MS = 2200;
const URGENT_SPAWN_MS = 600;
/** A rising target stops counting as "available" once it is this far through its trip. */
const USEFUL_LIFE = 0.6;

interface Ctx {
  spec: ResolvedStage;
  target: BalloonColor;
  remaining: number;
  seed: number;
}

const travelMs = (spec: ResolvedStage) => spec.riseSeconds * 1000;

export function isUseful(b: Balloon, spec: ResolvedStage, t: number): boolean {
  if (b.popping) return false;
  return spec.motion === "static" || t - b.spawnedAtMs < travelMs(spec) * USEFUL_LIFE;
}

export function requiredTargets(spec: ResolvedStage, remaining: number): number {
  if (remaining <= 0) return 1;
  return spec.motion === "rising" ? Math.min(2, remaining) : Math.max(1, Math.min(remaining, Math.floor(spec.activeCount / 2)));
}

export function usefulTargetCount(balloons: readonly Balloon[], target: BalloonColor, spec: ResolvedStage, t: number): number {
  return balloons.filter((b) => b.color === target && isUseful(b, spec, t)).length;
}

function needsTarget(balloons: readonly Balloon[], c: Ctx, t: number): boolean {
  return usefulTargetCount(balloons, c.target, c.spec, t) < requiredTargets(c.spec, c.remaining);
}

function pickColor(rng: () => number, balloons: readonly Balloon[], spawn: SpawnState, c: Ctx, need: boolean): BalloonColor {
  if (need) return c.target;
  const palette = c.spec.palette;
  const avoid = new Set(spawn.recentColors.slice(-(palette.length <= 3 ? 1 : 2)));
  const live = balloons.filter((b) => !b.popping);
  const weights = palette.map((color) => {
    if (avoid.has(color)) return 0;
    if (color === c.target && c.spec.motion === "static") return 0; // static layouts add targets only when needed
    return 1 / Math.pow(1 + live.filter((b) => b.color === color).length, 1.5);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return palette[Math.floor(rng() * palette.length)];
  let roll = rng() * total;
  for (let i = 0; i < palette.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return palette[i];
  }
  return palette[palette.length - 1];
}

function nextDelay(rng: () => number): number {
  return SPAWN_MIN_MS + rng() * (SPAWN_MAX_MS - SPAWN_MIN_MS);
}

function makeBalloon(index: number, idPrefix: string, color: BalloonColor, x: number, topY: number, slot: number, spawnedAtMs: number): Balloon {
  return { id: `${idPrefix}.${index}`, spawnIndex: index, color, x, topY, slot, spawnedAtMs, popping: false, poppedAtMs: 0, wrongCueCount: 0, lastWrongAtMs: -1e9 };
}

interface Population {
  balloons: Balloon[];
  spawn: SpawnState;
}

function trySpawn(pop: Population, c: Ctx, idPrefix: string, slots: StageRuntime["slots"], spawnedAt: number, now: number, need: boolean): Population | null {
  const { spec } = c;
  const rng = mulberry32((c.seed + pop.spawn.spawnCount * 7919 + 13) >>> 0);
  const color = pickColor(rng, pop.balloons, pop.spawn, c, need);
  let balloon: Balloon;

  if (spec.motion === "rising") {
    const t = LAYOUT_TUNING[spec.layout];
    const w = widthCqw(spec.sizeCqh);
    const h = heightCqh(spec.sizeCqh);
    const xMin = t.xMargin + w / 2;
    const xMax = 100 - t.xMargin - w / 2;
    let chosen: number | null = null;
    for (let attempt = 0; attempt < 30 && chosen === null; attempt++) {
      const x = xMin + rng() * (xMax - xMin);
      if (Math.abs(x - pop.spawn.lastX) < w * 1.1) continue;
      const clash = pop.balloons.some((b) => Math.abs(b.x - x) < w + GAP_X && Math.abs(balloonTop(b, spec, spawnedAt) - START_Y) < h + GAP_Y);
      if (!clash) chosen = x;
    }
    if (chosen === null) return null;
    balloon = makeBalloon(pop.spawn.spawnCount, idPrefix, color, chosen, START_Y, -1, spawnedAt);
  } else {
    const occupied = new Set(pop.balloons.map((b) => b.slot));
    let free = slots.map((_, i) => i).filter((i) => !occupied.has(i));
    const others = free.filter((i) => i !== pop.spawn.lastSlot);
    if (others.length > 0) free = others; // a popped balloon's slot is not reused while another is free
    if (free.length === 0) return null;
    const slot = free[Math.floor(rng() * free.length)];
    balloon = makeBalloon(pop.spawn.spawnCount, idPrefix, color, slots[slot].x, topFromSlot(slots[slot], spec.sizeCqh), slot, spawnedAt);
  }

  return {
    balloons: [...pop.balloons, balloon],
    spawn: {
      ...pop.spawn,
      spawnCount: pop.spawn.spawnCount + 1,
      recentColors: [...pop.spawn.recentColors, color].slice(-3),
      lastX: balloon.x,
      lastSpawnAtMs: now,
      nextSpawnAtMs: now + nextDelay(rng),
    },
  };
}

export const stageIdPrefix = (runId: number, index: number, attempt: number) => `r${runId}s${index}a${attempt}`;

const MIN_FIT_SIZE = 13;
/**
 * Static layouts must always hold `activeCount + 2` non-overlapping slots, so a
 * replacement can go into a free slot OTHER than the one just popped. If the
 * therapist's size (or the floor layout) is too large for that, shrink the
 * balloons in small steps until it fits; as a last resort lower the count.
 */
export function fitStaticSpec(spec: ResolvedStage, seed: number): ResolvedStage {
  let size = spec.sizeCqh;
  let slots = placeSlots(seed, spec.activeCount + 2, size, spec.layout);
  while (slots.length < spec.activeCount + 2 && size > MIN_FIT_SIZE) {
    size = Math.max(MIN_FIT_SIZE, size * 0.96);
    slots = placeSlots(seed, spec.activeCount + 2, size, spec.layout);
  }
  const activeCount = slots.length >= spec.activeCount + 2 ? spec.activeCount : Math.max(2, slots.length - 2);
  return size === spec.sizeCqh && activeCount === spec.activeCount ? spec : { ...spec, sizeCqh: size, activeCount };
}

/** Fresh population at simulation time 0: rising stages start mid-flight (never empty), static stages fill their slots. */
export function initPopulation(requested: ResolvedStage, target: BalloonColor, seed: number, idPrefix: string): { spec: ResolvedStage; balloons: Balloon[]; spawn: SpawnState; slots: StageRuntime["slots"] } {
  const spec = requested.motion === "static" ? fitStaticSpec(requested, seed) : requested;
  const ctx: Ctx = { spec, target, remaining: spec.goal, seed };
  let pop: Population = { balloons: [], spawn: { nextSpawnAtMs: 1000, lastSpawnAtMs: 0, spawnCount: 0, recentColors: [], lastSlot: -1, lastX: -100 } };
  const n = spec.activeCount;

  if (spec.motion === "rising") {
    for (let i = 0; i < n; i++) {
      const fraction = 0.7 - 0.62 * (i / (n - 1));
      const at = -travelMs(spec) * fraction;
      const stillUseful = fraction < USEFUL_LIFE;
      const next = trySpawn(pop, ctx, idPrefix, [], at, 0, stillUseful && needsTarget(pop.balloons, ctx, 0));
      if (next) pop = next;
    }
    return { ...pop, spec, spawn: { ...pop.spawn, nextSpawnAtMs: 1000, lastSpawnAtMs: 0 }, slots: [] };
  }

  const slots = placeSlots(seed, spec.activeCount + 2, spec.sizeCqh, spec.layout);
  const count = Math.min(n, slots.length);
  const colors: BalloonColor[] = [];
  const draftSpawn: SpawnState = { ...pop.spawn };
  let draft: Balloon[] = [];
  for (let i = 0; i < count; i++) {
    const need = needsTarget(draft, ctx, 0);
    const color = pickColor(mulberry32((seed + i * 31) >>> 0), draft, draftSpawn, ctx, need);
    colors.push(color);
    draft = [...draft, makeBalloon(i, idPrefix, color, 0, 0, i, 0)];
    draftSpawn.recentColors = [...draftSpawn.recentColors, color].slice(-3);
  }
  // Shuffle so the guaranteed targets are not always in the first slots.
  const rng = mulberry32((seed + 5) >>> 0);
  for (let i = colors.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [colors[i], colors[j]] = [colors[j], colors[i]];
  }
  const balloons = colors.map((color, i) => makeBalloon(i, idPrefix, color, slots[i].x, topFromSlot(slots[i], spec.sizeCqh), i, 0));
  return { spec, balloons, spawn: { ...pop.spawn, spawnCount: count, recentColors: colors.slice(-3), nextSpawnAtMs: 1000, lastSpawnAtMs: 0 }, slots };
}

/** One housekeeping step at simulation time `now`: retire finished balloons, then spawn if due. Returns the same stage when nothing changed. */
export function housekeep(stage: StageRuntime, now: number): StageRuntime {
  const { spec } = stage;
  const kept = stage.balloons.filter((b) => (b.popping ? now - b.poppedAtMs < POP_MS : spec.motion === "static" || now - b.spawnedAtMs < travelMs(spec)));
  let balloons = kept;
  let spawn = stage.spawn;
  const liveCount = kept.filter((b) => !b.popping).length;
  const ctx: Ctx = { spec, target: stage.target, remaining: Math.max(0, spec.goal - stage.goalDone), seed: stage.seed };
  const need = needsTarget(kept, ctx, now);
  const due = now >= spawn.nextSpawnAtMs || (need && now - spawn.lastSpawnAtMs >= URGENT_SPAWN_MS);
  const wants = spec.motion === "rising" ? liveCount < spec.activeCount + (need ? 1 : 0) : need || liveCount < Math.ceil(spec.activeCount * 0.6);
  if (due && wants) {
    const spawned = trySpawn({ balloons, spawn }, ctx, stage.idPrefix, stage.slots, now, now, need);
    if (spawned) {
      balloons = spawned.balloons;
      spawn = spawned.spawn;
    }
  }
  if (balloons === stage.balloons && spawn === stage.spawn) return stage;
  if (balloons.length === stage.balloons.length && spawn === stage.spawn && balloons.every((b, i) => b === stage.balloons[i])) return stage;
  return { ...stage, balloons, spawn };
}
