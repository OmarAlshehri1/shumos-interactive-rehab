/**
 * Safe Hex Arena game engine: a pure reducer. The therapist's Control is the only place it runs; the child
 * Display only renders the state it is sent. Time enters only through `tick` / command timestamps, so
 * everything here is deterministic and unit-testable.
 *
 * Round lifecycle (phase): prep (all tiles safe) -> warning (warned tiles turn amber) -> inactive (warned tiles
 * dim) -> restoring (tiles return to blue) -> next round's prep. Nothing ever fails the child: a slow response
 * only waits for the therapist, and no phase ends by itself in `inactive`.
 */
import { STAGES, LAYOUT_PRESETS, generateWarning, tilesFor, type LayoutPreset } from './stages';
import { rolesForMode, type FootRole, type InputMode, type InputSource } from './sensorInput';
import { ASPECT_PRESETS, getLayout, type AspectPreset, type Layout } from './geometry';

export type Status = 'ready' | 'running' | 'paused' | 'stage-complete' | 'ended';
export type Phase = 'prep' | 'warning' | 'inactive' | 'restoring';
export type TileState = 'SAFE' | 'WARNING' | 'INACTIVE' | 'RESTORING';
export type ViewMode = 'floor' | 'cinematic';

export interface Config {
  /** Warning duration in ms (default 5 s). */
  warnMs: number;
  /** Preparation time before a warning starts, in ms. */
  prepMs: number;
  /** Automatic prep -> warning -> inactive timing. Off = the therapist advances by hand. */
  auto: boolean;
  /** Include the child's confirmed tile in the warning so a one-tile step is practised. */
  targetChild: boolean;
  inputMode: InputMode;
  inputSource: InputSource;
  view: ViewMode;
  /** Safe margin around the arena, percent of the shorter screen side (0..15). */
  margin: number;
  /** Arena scale, percent (70..110). */
  scale: number;
  grid: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  /** Visual intensity, percent (50..100). */
  intensity: number;
  sound: boolean;
  quality: 'low' | 'high';
  /** Size of the physical target zones: see `LAYOUT_PRESETS` in stages.ts. Changeable only between stages. */
  layoutPreset: LayoutPreset;
  /** Aspect ratio of the projector's image (output). The layout is fitted to it. Changeable only between stages. */
  aspect: AspectPreset;
  /** Therapist-entered size of the projected area on the floor in cm (0 = not entered). Used only for the physical estimate. */
  floorWidthCm: number;
  floorHeightCm: number;
  /** The therapist states the projection was measured and calibrated. Informational: never proof of accuracy. */
  calibrationConfirmed: boolean;
}

export const DEFAULT_CONFIG: Config = {
  warnMs: 5000,
  prepMs: 4000,
  auto: true,
  targetChild: true,
  inputMode: 'MANUAL',
  inputSource: 'manual',
  view: 'floor',
  margin: 3,
  scale: 100,
  grid: false,
  highContrast: false,
  reducedMotion: false,
  intensity: 100,
  sound: false,
  quality: 'high',
  layoutPreset: 'STANDARD',
  aspect: '16:9',
  floorWidthCm: 0,
  floorHeightCm: 0,
  calibrationConfirmed: false,
};

export const LIMITS = {
  warnMs: [2000, 30000],
  prepMs: [1000, 15000],
  margin: [0, 15],
  scale: [70, 110],
  intensity: [50, 100],
  floorCm: [50, 3000],
} as const;
export const RESTORE_MS = 1600;
/** One tick never advances time by more than this, so a stalled tab cannot fast-forward a warning. */
export const MAX_TICK_MS = 250;

export interface RoundEvent {
  key: string;
  stage: number;
  round: number;
  kind: 'confirmed' | 'assisted' | 'skipped';
  tile: number | null;
  /** Tile count of the layout the round was played on (6 / 9 / 12 / 16 / 20). */
  tiles: number;
}

export interface SensorState {
  link: Record<FootRole, 'none' | 'ok' | 'lost'>;
  lastSeq: Record<FootRole, number>;
  /** Accepted movement-onset hints in this run. Hints only: never a tile, never a safe transition. */
  movements: number;
  /** A movement hint arrived since the last round change and awaits the therapist's confirmation. */
  pending: boolean;
  lastRole: FootRole | null;
}

export interface State {
  sessionId: string;
  seed: number;
  run: number;
  stage: number;
  round: number;
  status: Status;
  phase: Phase;
  /** Warned tiles of the current round; empty until a warning starts. */
  warn: number[];
  /** Time spent in the current phase, advanced only while running. */
  elapsed: number;
  lastTick: number;
  startedAt: number;
  endedAt: number;
  /** The pause was a therapist safety hold (or a lost connection) and needs an explicit resume. */
  safety: boolean;
  /** Therapist-confirmed tile of the child, or null when unknown. */
  childTile: number | null;
  config: Config;
  events: RoundEvent[];
  completed: number[];
  skipped: number[];
  sensor: SensorState;
}

export type Command =
  | { type: 'configure'; config: Partial<Config> }
  | { type: 'start'; at: number }
  | { type: 'tick'; at: number }
  | { type: 'pause' }
  | { type: 'safety' }
  | { type: 'resume'; at: number }
  | { type: 'child'; tile: number | null }
  | { type: 'warn' }
  | { type: 'hide' }
  | { type: 'extend'; ms: number }
  | { type: 'confirm'; tile: number; assisted: boolean }
  | { type: 'repeat' }
  | { type: 'skipRound' }
  | { type: 'skipStage' }
  | { type: 'next'; at: number }
  | { type: 'stage'; stage: number }
  | { type: 'restart' }
  | { type: 'end'; at: number }
  | { type: 'sensor'; role: FootRole; event: 'onset' | 'rest' | 'lost' | 'resumed'; seq: number; at: number };

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.max(lo, Math.min(hi, Math.round(v)));

export function seedFor(sessionId: string, run: number): number {
  let h = 2166136261;
  for (let i = 0; i < sessionId.length; i++) h = Math.imul(h ^ sessionId.charCodeAt(i), 16777619);
  return (h ^ Math.imul(run + 1, 2654435761)) >>> 0;
}

export const freshSensor = (): SensorState => ({
  link: { RIGHT_FOOT: 'none', LEFT_FOOT: 'none' },
  lastSeq: { RIGHT_FOOT: 0, LEFT_FOOT: 0 },
  movements: 0,
  pending: false,
  lastRole: null,
});

export function createState(sessionId: string, config: Partial<Config> = {}, run = 0): State {
  return {
    sessionId,
    seed: seedFor(sessionId, run),
    run,
    stage: 0,
    round: 0,
    status: 'ready',
    phase: 'prep',
    warn: [],
    elapsed: 0,
    lastTick: 0,
    startedAt: 0,
    endedAt: 0,
    safety: false,
    childTile: null,
    config: sanitizeConfig({ ...DEFAULT_CONFIG, ...config }),
    events: [],
    completed: [],
    skipped: [],
    sensor: freshSensor(),
  };
}

export function sanitizeConfig(c: Config): Config {
  return {
    warnMs: clamp(c.warnMs, LIMITS.warnMs),
    prepMs: clamp(c.prepMs, LIMITS.prepMs),
    auto: !!c.auto,
    targetChild: !!c.targetChild,
    inputMode: (['MANUAL', 'RIGHT_FOOT', 'LEFT_FOOT', 'DUAL_FOOT'] as const).includes(c.inputMode) ? c.inputMode : 'MANUAL',
    inputSource: c.inputSource === 'simulated' && c.inputMode !== 'MANUAL' ? 'simulated' : 'manual',
    view: c.view === 'cinematic' ? 'cinematic' : 'floor',
    margin: clamp(c.margin, LIMITS.margin),
    scale: clamp(c.scale, LIMITS.scale),
    grid: !!c.grid,
    highContrast: !!c.highContrast,
    reducedMotion: !!c.reducedMotion,
    intensity: clamp(c.intensity, LIMITS.intensity),
    sound: !!c.sound,
    quality: c.quality === 'low' ? 'low' : 'high',
    layoutPreset: (LAYOUT_PRESETS as readonly string[]).includes(c.layoutPreset) ? c.layoutPreset : 'STANDARD',
    aspect: c.aspect in ASPECT_PRESETS ? c.aspect : '16:9',
    ...(Number.isFinite(c.floorWidthCm) && Number.isFinite(c.floorHeightCm) && c.floorWidthCm >= LIMITS.floorCm[0] && c.floorHeightCm >= LIMITS.floorCm[0]
      ? { floorWidthCm: clamp(c.floorWidthCm, LIMITS.floorCm), floorHeightCm: clamp(c.floorHeightCm, LIMITS.floorCm) }
      : { floorWidthCm: 0, floorHeightCm: 0 }),
    calibrationConfirmed: !!c.calibrationConfirmed && c.floorWidthCm > 0 && c.floorHeightCm > 0,
  };
}

/**
 * Aspect ratio of the projector's IMAGE, which is what the layout is fitted to (the Display draws into that image).
 * The entered floor size in cm never changes the layout: it only feeds the physical estimate and the stretch check.
 */
export function aspectOf(c: Pick<Config, 'aspect'>): number {
  return Math.round(ASPECT_PRESETS[c.aspect] * 1000) / 1000;
}

/** The layout of a stage for a given config: identical on Control and Display (pure function of the shared state). */
export function layoutFor(stage: number, config: Config): Layout {
  return getLayout(tilesFor(stage, config.layoutPreset), aspectOf(config));
}
export const layoutOf = (s: State): Layout => layoutFor(s.stage, s.config);

export const stageDef = (s: State) => STAGES[s.stage];
export const roundKey = (s: State) => `${s.run}:${s.stage}:${s.round}`;
export const isResolved = (s: State, stage = s.stage, round = s.round) => s.events.some((e) => e.key === `${s.run}:${stage}:${round}`);

/** Visual state of every tile, derived from the phase. This is the single source the Display and the map both use. */
export function tileStates(s: State): TileState[] {
  const size = layoutOf(s).tiles;
  const warned = new Set(s.warn);
  return Array.from({ length: size }, (_, t) => {
    if (!warned.has(t)) return 'SAFE';
    if (s.phase === 'warning') return 'WARNING';
    if (s.phase === 'inactive') return 'INACTIVE';
    if (s.phase === 'restoring') return 'RESTORING';
    return 'SAFE';
  });
}

/** Safe tiles adjacent to `tile` (the one-step destinations the therapist map highlights). */
export function safeNeighbors(s: State, tile: number): number[] {
  const warned = new Set(s.warn);
  return (layoutOf(s).neighbors[tile] ?? []).filter((n) => !warned.has(n));
}

const touchSensorPending = (s: State): SensorState => (s.sensor.pending ? { ...s.sensor, pending: false } : s.sensor);

function arm(s: State): State {
  const warn = generateWarning({
    layout: layoutOf(s), preset: s.config.layoutPreset, seed: s.seed, stage: s.stage, round: s.round, childTile: s.childTile, targetChild: s.config.targetChild,
  });
  return { ...s, phase: 'warning', warn, elapsed: 0, sensor: touchSensorPending(s) };
}

/** Finishes the current round with `event` and moves on (next round, or the stage-complete screen). */
function resolve(s: State, event: RoundEvent): State {
  if (s.events.some((e) => e.key === event.key)) return s;
  const events = [...s.events, event];
  const def = stageDef(s);
  const stageEvents = events.filter((e) => e.stage === s.stage);
  const allResolved = stageEvents.length >= def.rounds;
  const base: State = { ...s, events, childTile: event.tile ?? s.childTile, phase: 'restoring', elapsed: 0, sensor: touchSensorPending(s) };
  if (!allResolved) return base;
  const clean = stageEvents.every((e) => e.kind !== 'skipped');
  return {
    ...base,
    status: 'stage-complete',
    completed: clean && !s.completed.includes(s.stage) ? [...s.completed, s.stage] : s.completed,
    skipped: !clean && !s.skipped.includes(s.stage) ? [...s.skipped, s.stage] : s.skipped,
  };
}

function nextRound(s: State): State {
  return { ...s, round: s.round + 1, phase: 'prep', warn: [], elapsed: 0 };
}

const isLive = (s: State) => s.status === 'running' || s.status === 'paused';

export function reduce(s: State, c: Command): State {
  if (s.status === 'ended' && c.type !== 'restart') return s;
  switch (c.type) {
    case 'configure': {
      // Layout-affecting settings (preset, aspect, floor size) only change between stages: a tile index must never
      // change meaning while a round, a warning or a child position refers to it.
      const layoutOpen = s.status === 'ready' || s.status === 'stage-complete';
      const patch = { ...c.config };
      if (!layoutOpen) for (const k of ['layoutPreset', 'aspect', 'floorWidthCm', 'floorHeightCm'] as const) delete patch[k];
      const config = sanitizeConfig({ ...s.config, ...patch });
      const inputChanged = config.inputMode !== s.config.inputMode || config.inputSource !== s.config.inputSource;
      const geometryChanged = config.layoutPreset !== s.config.layoutPreset || aspectOf(config) !== aspectOf(s.config);
      return { ...s, config, childTile: geometryChanged ? null : s.childTile, sensor: inputChanged ? freshSensor() : s.sensor };
    }
    case 'start': {
      if (s.status !== 'ready') return s;
      return { ...s, status: 'running', phase: 'prep', warn: [], elapsed: 0, lastTick: c.at, startedAt: s.startedAt || c.at, safety: false };
    }
    case 'pause':
      return s.status === 'running' ? { ...s, status: 'paused', lastTick: 0 } : s;
    case 'safety':
      if (s.status === 'running') return { ...s, status: 'paused', lastTick: 0, safety: true };
      if (s.status === 'paused' || s.status === 'ready') return { ...s, safety: true };
      return s;
    case 'resume':
      return s.status === 'paused' ? { ...s, status: 'running', lastTick: c.at, safety: false } : s;
    case 'tick': {
      if (s.status !== 'running') return s;
      const dt = s.lastTick > 0 ? Math.max(0, Math.min(MAX_TICK_MS, c.at - s.lastTick)) : 0;
      const t: State = { ...s, lastTick: c.at, elapsed: s.elapsed + dt };
      if (t.phase === 'prep') return t.config.auto && t.elapsed >= t.config.prepMs ? arm(t) : t;
      if (t.phase === 'warning') return t.config.auto && t.elapsed >= t.config.warnMs ? { ...t, phase: 'inactive', elapsed: 0 } : t;
      if (t.phase === 'restoring') return t.elapsed >= RESTORE_MS && t.status === 'running' && !isStageDone(t) ? nextRound(t) : t;
      return t;
    }
    case 'child': {
      const size = layoutOf(s).tiles;
      if (c.tile !== null && (!Number.isInteger(c.tile) || c.tile < 0 || c.tile >= size)) return s;
      return c.tile === s.childTile ? s : { ...s, childTile: c.tile };
    }
    case 'warn':
      return s.status === 'running' && s.phase === 'prep' ? arm(s) : s;
    case 'hide':
      return isLive(s) && s.phase === 'warning' ? { ...s, phase: 'inactive', elapsed: 0 } : s;
    case 'extend':
      return isLive(s) && s.phase === 'warning' && Number.isFinite(c.ms) && c.ms > 0
        ? { ...s, config: { ...s.config, warnMs: clamp(s.config.warnMs + c.ms, LIMITS.warnMs) } }
        : s;
    case 'confirm': {
      if (!isLive(s) || (s.phase !== 'warning' && s.phase !== 'inactive')) return s;
      if (!Number.isInteger(c.tile) || c.tile < 0 || c.tile >= layoutOf(s).tiles || s.warn.includes(c.tile)) return s;
      return resolve(s, { key: roundKey(s), stage: s.stage, round: s.round, kind: c.assisted ? 'assisted' : 'confirmed', tile: c.tile, tiles: layoutOf(s).tiles });
    }
    case 'repeat':
      return isLive(s) && !isResolved(s) && s.phase !== 'restoring' ? { ...s, phase: 'prep', warn: [], elapsed: 0, sensor: touchSensorPending(s) } : s;
    case 'skipRound':
      return isLive(s) && s.phase !== 'restoring' && !isResolved(s)
        ? resolve(s, { key: roundKey(s), stage: s.stage, round: s.round, kind: 'skipped', tile: null, tiles: layoutOf(s).tiles })
        : s;
    case 'skipStage': {
      if (!(isLive(s) || s.status === 'ready')) return s;
      return { ...s, status: 'stage-complete', phase: 'prep', warn: [], elapsed: 0, skipped: s.skipped.includes(s.stage) || s.completed.includes(s.stage) ? s.skipped : [...s.skipped, s.stage] };
    }
    case 'next': {
      if (s.status !== 'stage-complete') return s;
      if (s.stage >= STAGES.length - 1) return { ...s, status: 'ended', endedAt: c.at, phase: 'prep', warn: [] };
      return { ...s, stage: s.stage + 1, round: 0, status: 'ready', phase: 'prep', warn: [], elapsed: 0, childTile: null, lastTick: 0 };
    }
    case 'stage': {
      if (!Number.isInteger(c.stage) || c.stage < 0 || c.stage >= STAGES.length) return s;
      if (!(s.status === 'ready' || s.status === 'paused' || s.status === 'stage-complete')) return s;
      if (s.events.some((e) => e.stage === c.stage) || s.completed.includes(c.stage) || s.skipped.includes(c.stage)) return s;
      return { ...s, stage: c.stage, round: 0, status: 'ready', phase: 'prep', warn: [], elapsed: 0, childTile: null, lastTick: 0, safety: false };
    }
    case 'restart': {
      const fresh = createState(s.sessionId, s.config, s.run + 1);
      return { ...fresh, sensor: { ...freshSensor(), link: s.sensor.link } };
    }
    case 'end':
      return { ...s, status: 'ended', endedAt: c.at, phase: 'prep', warn: [], safety: false };
    case 'sensor': {
      if (!rolesForMode(s.config.inputMode).includes(c.role)) return s;
      if (!Number.isInteger(c.seq) || c.seq <= s.sensor.lastSeq[c.role]) return s;
      const lastSeq = { ...s.sensor.lastSeq, [c.role]: c.seq };
      const link = { ...s.sensor.link, [c.role]: c.event === 'lost' ? 'lost' : 'ok' } as SensorState['link'];
      const onset = c.event === 'onset' && s.status === 'running' && (s.phase === 'warning' || s.phase === 'inactive');
      return {
        ...s,
        sensor: {
          ...s.sensor, lastSeq, link,
          movements: s.sensor.movements + (onset ? 1 : 0),
          pending: s.sensor.pending || onset,
          lastRole: onset ? c.role : s.sensor.lastRole,
        },
      };
    }
  }
}

function isStageDone(s: State): boolean {
  return s.status === 'stage-complete';
}

/** Scoring that never punishes: counts only, no failure. */
export function summary(s: State) {
  const rounds = s.events.filter((e) => e.kind !== 'skipped');
  return {
    presented: s.events.length,
    completed: rounds.length,
    confirmed: s.events.filter((e) => e.kind === 'confirmed').length,
    assisted: s.events.filter((e) => e.kind === 'assisted').length,
    skipped: s.events.filter((e) => e.kind === 'skipped').length,
    stagesCompleted: s.completed.length,
  };
}
