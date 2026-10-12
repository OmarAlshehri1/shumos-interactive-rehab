/**
 * Preview-only balloon spawner (NOT the B3 game engine). Pure, deterministic
 * given (seed, clock, inputs) and free of React, so it can be unit tested.
 *
 * Rising modes: every balloon in a mode rises at the SAME constant speed, so
 * the spacing checked at spawn time can never turn into an overlap later.
 * Spawns enter from below the bottom edge; popped balloons are gone for good
 * and replaced later by fresh spawns; balloons that leave the top are also
 * replaced. Nothing here ends a stage: there is no timer or failure.
 *
 * Static (Easy, or reduced motion): balloons sit on seeded non-overlapping
 * slots. A popped balloon's slot is not reused straight away; new balloons
 * appear in other free slots whenever the target colour would run short.
 */
import type { PreviewColor, PreviewModeConfig } from "./previewConfig";

export const START_Y = 112; // cqh — top edge of a freshly spawned balloon, fully below the stage
export const END_Y = -40; // cqh — fully above the stage for every size
export const TRAVEL_CQH = START_Y - END_Y;
export const POP_MS = 900;

const MARGIN_X = 8; // cqw kept clear at each side so every balloon is reachable
const HUD_BOTTOM = 19; // cqh — top HUD clearance for static layouts
const GOAL_TOP = 89; // cqh — goal bar clearance for static layouts
const GAP_X = 2.5;
const GAP_Y = 3;
const SPAWN_MIN_MS = 800;
const SPAWN_MAX_MS = 2200;
const URGENT_SPAWN_MS = 600;
/** A rising target stops counting as "available" once it is this far through its trip. */
const USEFUL_LIFE = 0.6;

export type Motion = "rising" | "static";

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

export const widthCqw = (sizeCqh: number) => (sizeCqh * 9) / 16;
/** Balloon + string, matching the 100x150 SVG aspect. */
export const heightCqh = (sizeCqh: number) => sizeCqh * 1.5;

export interface Slot {
  x: number;
  y: number;
}

function placeSlotsOnce(seed: number, count: number, sizeCqh: number): Slot[] {
  const rng = mulberry32(seed);
  const w = widthCqw(sizeCqh);
  const h = heightCqh(sizeCqh);
  const xMin = MARGIN_X + w / 2;
  const xMax = 100 - MARGIN_X - w / 2;
  const yMin = HUD_BOTTOM + h / 2;
  const yMax = GOAL_TOP - h / 2;
  // Balloons are tall, so the play area holds a few loose rows. Positions vary
  // within and between rows (x freely, y by a small row-local jitter) while the
  // row separation itself guarantees no vertical overlap between rows.
  const span = yMax - yMin;
  const rows = Math.max(1, Math.floor(span / (h + GAP_Y)) + 1);
  const spacing = rows > 1 ? span / (rows - 1) : 0;
  const jitter = rows > 1 ? Math.min(6, Math.max(0, (spacing - (h + GAP_Y)) / 2)) : Math.min(6, span / 2);
  const slots: Slot[] = [];
  for (let i = 0; i < count; i++) {
    let best: Slot | null = null;
    let bestScore = -1;
    for (let attempt = 0; attempt < 80; attempt++) {
      const row = Math.floor(rng() * rows);
      const centre = rows > 1 ? yMin + row * spacing : (yMin + yMax) / 2;
      const cand = { x: xMin + rng() * (xMax - xMin), y: centre + (rng() * 2 - 1) * jitter };
      let score = Infinity;
      let clash = false;
      for (const s of slots) {
        const dx = Math.abs(s.x - cand.x);
        const dy = Math.abs(s.y - cand.y);
        if (dx < w + GAP_X && dy < h + GAP_Y) {
          clash = true;
          break;
        }
        score = Math.min(score, Math.hypot(dx / (w + GAP_X), dy / (h + GAP_Y)));
      }
      if (!clash && score > bestScore) {
        best = cand;
        bestScore = score;
      }
    }
    if (!best) break;
    slots.push(best);
  }
  return slots;
}

/** Seeded, non-overlapping layout slots; retries nearby seeds until `count` fit. */
export function placeSlots(seed: number, count: number, sizeCqh: number): Slot[] {
  let best: Slot[] = [];
  for (let k = 0; k < 24; k++) {
    const slots = placeSlotsOnce(seed + k * 101, count, sizeCqh);
    if (slots.length === count) return slots;
    if (slots.length > best.length) best = slots;
  }
  return best;
}

export interface LiveBalloon {
  id: string;
  color: PreviewColor;
  /** Centre x in cqw (static) or lane centre x in cqw (rising). */
  x: number;
  /** Centre y in cqh (static only). */
  y: number;
  slot: number;
  spawnedAt: number;
  /** CSS animation-delay (negative for balloons already mid-flight at load). */
  delaySec: number;
  popping: boolean;
  poppedAt: number;
  /** True for balloons added after the initial population (they fade in; the first layout does not). */
  fresh: boolean;
}

export interface EngineState {
  balloons: LiveBalloon[];
  nextSpawnAt: number;
  lastSpawnAt: number;
  spawnCount: number;
  recentColors: PreviewColor[];
  lastSlot: number;
  lastX: number;
}

export interface EngineParams {
  config: PreviewModeConfig;
  motion: Motion;
  seed: number;
  slots: Slot[];
}

export interface EngineContext {
  target: PreviewColor;
  /** Correct selections still needed for the goal (>= 0). */
  remaining: number;
}

export function makeParams(config: PreviewModeConfig, motion: Motion, seed: number): EngineParams {
  const slots = motion === "static" ? placeSlots(seed, config.activeCount + 2, config.sizeCqh) : [];
  return { config, motion, seed, slots };
}

export function riseY(b: LiveBalloon, now: number, config: PreviewModeConfig): number {
  return START_Y - ((now - b.spawnedAt) / 1000) * (TRAVEL_CQH / config.riseSeconds);
}

function isUseful(b: LiveBalloon, params: EngineParams, now: number): boolean {
  if (b.popping) return false;
  if (params.motion === "static") return true;
  return now - b.spawnedAt < params.config.riseSeconds * 1000 * USEFUL_LIFE;
}

export function requiredTargets(params: EngineParams, ctx: EngineContext): number {
  if (ctx.remaining <= 0) return 1;
  return params.motion === "rising"
    ? Math.min(2, ctx.remaining)
    : Math.max(1, Math.min(ctx.remaining, Math.floor(params.config.activeCount / 2)));
}

export function usefulTargetCount(state: EngineState, params: EngineParams, ctx: EngineContext, now: number): number {
  return state.balloons.filter((b) => b.color === ctx.target && isUseful(b, params, now)).length;
}

function pickColor(rng: () => number, state: EngineState, params: EngineParams, ctx: EngineContext, needTarget: boolean): PreviewColor {
  if (needTarget) return ctx.target;
  const palette = params.config.palette;
  const avoid = new Set(state.recentColors.slice(-(palette.length <= 3 ? 1 : 2)));
  const live = state.balloons.filter((b) => !b.popping);
  const weights = palette.map((c) => {
    if (avoid.has(c)) return 0;
    // Static layouts add targets only when needed, so distractors stay distractors.
    if (c === ctx.target && params.motion === "static") return 0;
    const n = live.filter((b) => b.color === c).length;
    return 1 / Math.pow(1 + n, 1.5);
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

function spawnDelay(rng: () => number): number {
  return SPAWN_MIN_MS + rng() * (SPAWN_MAX_MS - SPAWN_MIN_MS);
}

function trySpawn(state: EngineState, params: EngineParams, ctx: EngineContext, spawnedAt: number, now: number, needTarget: boolean): EngineState | null {
  const { config, motion, seed } = params;
  const rng = mulberry32(seed + state.spawnCount * 7919 + 13);
  const color = pickColor(rng, state, params, ctx, needTarget);
  let balloon: LiveBalloon;

  if (motion === "rising") {
    const w = widthCqw(config.sizeCqh);
    const h = heightCqh(config.sizeCqh);
    const xMin = MARGIN_X + w / 2;
    const xMax = 100 - MARGIN_X - w / 2;
    let chosen: number | null = null;
    for (let attempt = 0; attempt < 30 && chosen === null; attempt++) {
      const x = xMin + rng() * (xMax - xMin);
      if (Math.abs(x - state.lastX) < w * 1.1) continue;
      const clash = state.balloons.some((b) => Math.abs(b.x - x) < w + GAP_X && Math.abs(riseY(b, spawnedAt, config) - START_Y) < h + GAP_Y);
      if (!clash) chosen = x;
    }
    if (chosen === null) return null;
    balloon = { id: `b${state.spawnCount}`, color, x: chosen, y: START_Y, slot: -1, spawnedAt, delaySec: -(now - spawnedAt) / 1000, popping: false, poppedAt: 0, fresh: true };
  } else {
    const occupied = new Set(state.balloons.map((b) => b.slot));
    let free = params.slots.map((_, i) => i).filter((i) => !occupied.has(i));
    const others = free.filter((i) => i !== state.lastSlot);
    if (others.length > 0) free = others;
    if (free.length === 0) return null;
    const slot = free[Math.floor(rng() * free.length)];
    balloon = { id: `b${state.spawnCount}`, color, x: params.slots[slot].x, y: params.slots[slot].y, slot, spawnedAt, delaySec: 0, popping: false, poppedAt: 0, fresh: true };
  }

  return {
    ...state,
    balloons: [...state.balloons, balloon],
    spawnCount: state.spawnCount + 1,
    recentColors: [...state.recentColors, color].slice(-3),
    lastX: balloon.x,
    lastSlot: motion === "static" ? state.lastSlot : -1,
    lastSpawnAt: now,
    nextSpawnAt: now + spawnDelay(rng),
  };
}

function needsTarget(state: EngineState, params: EngineParams, ctx: EngineContext, now: number): boolean {
  return usefulTargetCount(state, params, ctx, now) < requiredTargets(params, ctx);
}

/** Fresh state at `now`: rising modes start mid-flight (never empty), static modes fill their slots. */
export function initEngine(params: EngineParams, ctx: EngineContext, now: number): EngineState {
  const { config, motion, seed } = params;
  let state: EngineState = { balloons: [], nextSpawnAt: now + 1000, lastSpawnAt: now, spawnCount: 0, recentColors: [], lastSlot: -1, lastX: -100 };
  const n = config.activeCount;

  if (motion === "rising") {
    for (let i = 0; i < n; i++) {
      const fraction = 0.7 - 0.62 * (i / (n - 1));
      const spawnedAt = now - config.riseSeconds * 1000 * fraction;
      const stillUseful = fraction < USEFUL_LIFE;
      const next = trySpawn(state, params, ctx, spawnedAt, now, stillUseful && needsTarget(state, params, ctx, now));
      if (next) state = next;
    }
    return { ...state, nextSpawnAt: now + 1000, lastSpawnAt: now };
  }

  const colors: PreviewColor[] = [];
  const draft: EngineState = { ...state };
  for (let i = 0; i < Math.min(n, params.slots.length); i++) {
    const need = needsTarget(draft, params, ctx, now);
    const color = pickColor(mulberry32(seed + i * 31), draft, params, ctx, need);
    colors.push(color);
    draft.balloons = [...draft.balloons, { id: "tmp", color, x: 0, y: 0, slot: i, spawnedAt: now, delaySec: 0, popping: false, poppedAt: 0, fresh: false }];
    draft.recentColors = [...draft.recentColors, color].slice(-3);
  }
  // Shuffle colours across slots so the guaranteed targets are not always in the first slots.
  const rng = mulberry32(seed + 5);
  for (let i = colors.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [colors[i], colors[j]] = [colors[j], colors[i]];
  }
  state = {
    ...state,
    balloons: colors.map((color, i) => ({ id: `b${i}`, color, x: params.slots[i].x, y: params.slots[i].y, slot: i, spawnedAt: now, delaySec: 0, popping: false, poppedAt: 0, fresh: false })),
    spawnCount: colors.length,
    recentColors: colors.slice(-3),
  };
  return state;
}

/** Marks a balloon as popped (it disappears for good once its pop animation ends). */
export function popBalloon(state: EngineState, id: string, now: number): EngineState {
  const b = state.balloons.find((x) => x.id === id);
  if (!b || b.popping) return state;
  return {
    ...state,
    balloons: state.balloons.map((x) => (x.id === id ? { ...x, popping: true, poppedAt: now } : x)),
    lastSlot: b.slot,
  };
}

/** One housekeeping step (call a few times per second): retire finished balloons, then spawn if due. Returns the same object when nothing changed. */
export function advance(state: EngineState, params: EngineParams, ctx: EngineContext, now: number): EngineState {
  const { config, motion } = params;
  const travelMs = config.riseSeconds * 1000;
  const kept = state.balloons.filter((b) => (b.popping ? now - b.poppedAt < POP_MS : motion === "static" || now - b.spawnedAt < travelMs));
  let next: EngineState = kept.length === state.balloons.length ? state : { ...state, balloons: kept };

  const liveCount = kept.filter((b) => !b.popping).length;
  const need = needsTarget(next, params, ctx, now);
  const due = now >= next.nextSpawnAt || (need && now - next.lastSpawnAt >= URGENT_SPAWN_MS);
  const wants = motion === "rising" ? liveCount < config.activeCount + (need ? 1 : 0) : need || liveCount < Math.ceil(config.activeCount * 0.6);
  if (due && wants) {
    const spawned = trySpawn(next, params, ctx, now, now, need);
    if (spawned) next = spawned;
  }
  return next;
}
