/**
 * Follow the Footsteps 3D engine: a pure reducer. The therapist's Control is the only place it runs; the child Display
 * only renders the state it is sent. Time enters only through `tick` / command timestamps.
 *
 * One stepping stone is the target at a time. The therapist confirms the child's physical step (or marks it assisted,
 * or skips it); the engine never decides that a step happened, never times a step out, and never fails the child.
 */
import { STAGES, TOTAL_STEPS } from './stages';
import { buildPath, checkPath, type FloorPath } from './world';
import { rolesForMode, type FootRole, type InputMode, type InputSource } from '@/lib/safehexarena3d/sensorInput';
import { hashSeed } from './rng';

export type Status = 'ready' | 'running' | 'paused' | 'stage-complete' | 'ended';
export type Phase = 'preview' | 'step';
export type ViewMode = 'floor' | 'cinematic';
export type Quality = 'low' | 'medium' | 'high';
export const ASPECTS = { '16:9': 16 / 9, '16:10': 16 / 10, '4:3': 4 / 3, '21:9': 21 / 9 } as const;
export type Aspect = keyof typeof ASPECTS;

export interface Config {
  /** Stone size, percent of the comfortable size (70..120). */
  stoneScale: number;
  /** Distance between consecutive stones, percent of the largest comfortable distance (60..100). */
  spacing: number;
  /** How much of the usable floor the whole path may span, percent (50..100): the therapist's movement range. */
  reach: number;
  /** Safe margin around the usable area, percent of each side (0..15). */
  margin: number;
  /** Projector image ratio. */
  aspect: Aspect;
  /** Therapist-entered size of the projected area in cm (0 = not entered); estimates only. */
  floorWidthCm: number;
  floorHeightCm: number;
  calibrationConfirmed: boolean;
  /** Subtle preview of the next stone (default off: exactly one stone is strongly highlighted). */
  previewNext: boolean;
  /** Memory stage: keep the active stone lit after the preview. Off = the child must remember the pair. */
  memoryAssist: boolean;
  /** Memory preview duration in ms. */
  previewMs: number;
  /** Offer the optional rest pauses of the stages that have them. */
  restPauses: boolean;
  inputMode: InputMode;
  inputSource: InputSource;
  view: ViewMode;
  grid: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  /** Visual intensity, percent (50..100). */
  intensity: number;
  sound: boolean;
  quality: Quality;
}

export const DEFAULT_CONFIG: Config = {
  stoneScale: 100,
  spacing: 100,
  reach: 100,
  margin: 4,
  aspect: '16:9',
  floorWidthCm: 0,
  floorHeightCm: 0,
  calibrationConfirmed: false,
  previewNext: false,
  memoryAssist: true,
  previewMs: 5000,
  restPauses: true,
  inputMode: 'MANUAL',
  inputSource: 'manual',
  view: 'floor',
  grid: false,
  highContrast: false,
  reducedMotion: false,
  intensity: 100,
  sound: true,
  quality: 'high',
};

export const LIMITS = {
  stoneScale: [70, 120],
  spacing: [60, 100],
  reach: [50, 100],
  margin: [0, 15],
  intensity: [50, 100],
  previewMs: [2000, 12000],
  floorCm: [50, 3000],
} as const;
export const MAX_TICK_MS = 250;

export interface StepEvent {
  key: string;
  stage: number;
  step: number;
  kind: 'confirmed' | 'assisted' | 'skipped';
}

export interface SensorState {
  link: Record<FootRole, 'none' | 'ok' | 'lost'>;
  lastSeq: Record<FootRole, number>;
  /** Accepted movement-onset hints. Hints only: never a stone, never a confirmed step. */
  movements: number;
  pending: boolean;
  lastRole: FootRole | null;
}

export interface State {
  sessionId: string;
  seed: number;
  run: number;
  stage: number;
  /** Index of the current target stone within the stage. */
  step: number;
  status: Status;
  /** Memory stage only: the pair is being shown (`preview`) or the child steps (`step`). */
  phase: Phase;
  elapsed: number;
  lastTick: number;
  startedAt: number;
  endedAt: number;
  /** Paused by the therapist's safety hold (or a lost connection): needs an explicit resume. */
  safety: boolean;
  /** Paused at an optional rest point. */
  rest: boolean;
  /** Counts "repeat cue" requests so the Display can pulse the target again without any state change. */
  cue: number;
  config: Config;
  events: StepEvent[];
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
  | { type: 'confirm'; stage: number; step: number; assisted: boolean }
  | { type: 'skip'; stage: number; step: number }
  | { type: 'repeat' }
  | { type: 'preview' }
  | { type: 'startSteps' }
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

export function sanitizeConfig(c: Config): Config {
  const cm = Number.isFinite(c.floorWidthCm) && Number.isFinite(c.floorHeightCm) && c.floorWidthCm >= LIMITS.floorCm[0] && c.floorHeightCm >= LIMITS.floorCm[0];
  return {
    stoneScale: clamp(c.stoneScale, LIMITS.stoneScale),
    spacing: clamp(c.spacing, LIMITS.spacing),
    reach: clamp(c.reach, LIMITS.reach),
    margin: clamp(c.margin, LIMITS.margin),
    aspect: c.aspect in ASPECTS ? c.aspect : '16:9',
    floorWidthCm: cm ? clamp(c.floorWidthCm, LIMITS.floorCm) : 0,
    floorHeightCm: cm ? clamp(c.floorHeightCm, LIMITS.floorCm) : 0,
    calibrationConfirmed: !!c.calibrationConfirmed && cm,
    previewNext: !!c.previewNext,
    memoryAssist: !!c.memoryAssist,
    previewMs: clamp(c.previewMs, LIMITS.previewMs),
    restPauses: !!c.restPauses,
    inputMode: (['MANUAL', 'RIGHT_FOOT', 'LEFT_FOOT', 'DUAL_FOOT'] as const).includes(c.inputMode) ? c.inputMode : 'MANUAL',
    inputSource: c.inputSource === 'simulated' && c.inputMode !== 'MANUAL' ? 'simulated' : 'manual',
    view: c.view === 'cinematic' ? 'cinematic' : 'floor',
    grid: !!c.grid,
    highContrast: !!c.highContrast,
    reducedMotion: !!c.reducedMotion,
    intensity: clamp(c.intensity, LIMITS.intensity),
    sound: !!c.sound,
    quality: c.quality === 'low' || c.quality === 'medium' ? c.quality : 'high',
  };
}

export function createState(sessionId: string, config: Partial<Config> = {}, run = 0): State {
  return {
    sessionId,
    seed: seedFor(sessionId, run),
    run,
    stage: 0,
    step: 0,
    status: 'ready',
    phase: STAGES[0].pairs ? 'preview' : 'step',
    elapsed: 0,
    lastTick: 0,
    startedAt: 0,
    endedAt: 0,
    safety: false,
    rest: false,
    cue: 0,
    config: sanitizeConfig({ ...DEFAULT_CONFIG, ...config }),
    events: [],
    completed: [],
    skipped: [],
    sensor: freshSensor(),
  };
}

const pathCache = new Map<string, FloorPath>();
/** The stepping-stone path of a stage for the given config: identical on Control and Display (pure function of shared state). */
export function pathFor(stage: number, seed: number, c: Config): FloorPath {
  const key = [stage, seed, c.aspect, c.margin, c.stoneScale, c.spacing, c.reach].join(':');
  const hit = pathCache.get(key);
  if (hit) return hit;
  const def = STAGES[stage];
  const path = buildPath(def.pattern, def.steps, { stage, seed: hashSeed(seed, stage), aspect: ASPECTS[c.aspect], margin: c.margin, stoneScale: c.stoneScale, spacing: c.spacing, reach: c.reach });
  if (pathCache.size > 64) pathCache.clear();
  pathCache.set(key, path);
  return path;
}
export const pathOf = (s: State): FloorPath => pathFor(s.stage, s.seed, s.config);
export const stageDef = (s: State) => STAGES[s.stage];
export const stepKey = (s: State, stage = s.stage, step = s.step) => `${s.run}:${stage}:${step}`;
export const isResolved = (s: State, stage = s.stage, step = s.step) => s.events.some((e) => e.key === stepKey(s, stage, step));
export const pathIsSafe = (s: State) => checkPath(pathOf(s), STAGES[s.stage].steps).length === 0;

/** Settings that move or resize stones: changed only while no step is being stepped. */
const LAYOUT_KEYS = ['stoneScale', 'spacing', 'reach', 'margin', 'aspect', 'floorWidthCm', 'floorHeightCm'] as const;

/** Visual state of every stone, derived from the state: the single source the Display and the map both use. */
export type StoneState = 'DONE' | 'SKIPPED' | 'TARGET' | 'NEXT' | 'IDLE';
export function stoneStates(s: State): StoneState[] {
  const def = stageDef(s);
  return Array.from({ length: def.steps }, (_, i) => {
    const ev = s.events.find((e) => e.key === stepKey(s, s.stage, i));
    if (ev) return ev.kind === 'skipped' ? 'SKIPPED' : 'DONE';
    if (s.status === 'stage-complete' || s.status === 'ended') return 'IDLE';
    if (i === s.step) return 'TARGET';
    if (s.config.previewNext && i === s.step + 1) return 'NEXT';
    return 'IDLE';
  });
}

const clearPending = (s: State): SensorState => (s.sensor.pending ? { ...s.sensor, pending: false } : s.sensor);
const isLive = (s: State) => s.status === 'running' || s.status === 'paused';
const freshPhase = (stage: number, step: number): Phase => (STAGES[stage].pairs && step % 2 === 0 ? 'preview' : 'step');

function resolve(s: State, kind: StepEvent['kind']): State {
  const key = stepKey(s);
  if (s.events.some((e) => e.key === key)) return s;
  const def = stageDef(s);
  const events = [...s.events, { key, stage: s.stage, step: s.step, kind }];
  const nextStep = s.step + 1;
  const stageEvents = events.filter((e) => e.stage === s.stage);
  const base: State = { ...s, events, sensor: clearPending(s), elapsed: 0 };
  if (stageEvents.length >= def.steps) {
    const clean = stageEvents.every((e) => e.kind !== 'skipped');
    return {
      ...base,
      step: def.steps,
      status: 'stage-complete',
      phase: 'step',
      rest: false,
      completed: clean && !s.completed.includes(s.stage) ? [...s.completed, s.stage] : s.completed,
      skipped: !clean && !s.skipped.includes(s.stage) ? [...s.skipped, s.stage] : s.skipped,
    };
  }
  const restHere = s.config.restPauses && def.rests.includes(s.step) && kind !== 'skipped';
  return {
    ...base,
    step: nextStep,
    phase: freshPhase(s.stage, nextStep),
    status: restHere && s.status === 'running' ? 'paused' : s.status,
    rest: restHere && s.status === 'running',
  };
}

export function reduce(s: State, c: Command): State {
  if (s.status === 'ended' && c.type !== 'restart') return s;
  switch (c.type) {
    case 'configure': {
      const patch = { ...c.config };
      // Stones never move or resize under a step in progress.
      if (s.status === 'running') for (const k of LAYOUT_KEYS) delete patch[k];
      const config = sanitizeConfig({ ...s.config, ...patch });
      const inputChanged = config.inputMode !== s.config.inputMode || config.inputSource !== s.config.inputSource;
      return { ...s, config, sensor: inputChanged ? freshSensor() : s.sensor };
    }
    case 'start':
      return s.status === 'ready' ? { ...s, status: 'running', phase: freshPhase(s.stage, s.step), elapsed: 0, lastTick: c.at, startedAt: s.startedAt || c.at, safety: false, rest: false } : s;
    case 'pause':
      return s.status === 'running' ? { ...s, status: 'paused', lastTick: 0 } : s;
    case 'safety':
      if (s.status === 'running') return { ...s, status: 'paused', lastTick: 0, safety: true };
      if (s.status === 'paused' || s.status === 'ready') return { ...s, safety: true };
      return s;
    case 'resume':
      return s.status === 'paused' ? { ...s, status: 'running', lastTick: c.at, safety: false, rest: false } : s;
    case 'tick': {
      if (s.status !== 'running') return s;
      const dt = s.lastTick > 0 ? Math.max(0, Math.min(MAX_TICK_MS, c.at - s.lastTick)) : 0;
      const t: State = { ...s, lastTick: c.at, elapsed: s.elapsed + dt };
      if (t.phase === 'preview' && t.elapsed >= t.config.previewMs) return { ...t, phase: 'step', elapsed: 0 };
      return t;
    }
    case 'confirm': {
      // The command names the step it confirms: a stale or duplicate command can never confirm a different one.
      if (!isLive(s) || c.stage !== s.stage || c.step !== s.step || s.step >= stageDef(s).steps) return s;
      return resolve(s, c.assisted ? 'assisted' : 'confirmed');
    }
    case 'skip':
      return isLive(s) && c.stage === s.stage && c.step === s.step && s.step < stageDef(s).steps ? resolve(s, 'skipped') : s;
    case 'repeat':
      return isLive(s) ? { ...s, cue: s.cue + 1 } : s;
    case 'preview':
      return isLive(s) && stageDef(s).pairs && s.step < stageDef(s).steps ? { ...s, phase: 'preview', elapsed: 0, cue: s.cue + 1 } : s;
    case 'startSteps':
      return isLive(s) && s.phase === 'preview' ? { ...s, phase: 'step', elapsed: 0 } : s;
    case 'skipStage': {
      if (!(isLive(s) || s.status === 'ready')) return s;
      const done = s.completed.includes(s.stage);
      return { ...s, status: 'stage-complete', step: stageDef(s).steps, phase: 'step', rest: false, elapsed: 0, skipped: done || s.skipped.includes(s.stage) ? s.skipped : [...s.skipped, s.stage] };
    }
    case 'next': {
      if (s.status !== 'stage-complete') return s;
      if (s.stage >= STAGES.length - 1) return { ...s, status: 'ended', endedAt: c.at, rest: false };
      return { ...s, stage: s.stage + 1, step: 0, status: 'ready', phase: freshPhase(s.stage + 1, 0), elapsed: 0, lastTick: 0, rest: false };
    }
    case 'stage': {
      if (!Number.isInteger(c.stage) || c.stage < 0 || c.stage >= STAGES.length) return s;
      if (!(s.status === 'ready' || s.status === 'paused' || s.status === 'stage-complete')) return s;
      if (s.events.some((e) => e.stage === c.stage) || s.completed.includes(c.stage) || s.skipped.includes(c.stage)) return s;
      return { ...s, stage: c.stage, step: 0, status: 'ready', phase: freshPhase(c.stage, 0), elapsed: 0, lastTick: 0, safety: false, rest: false };
    }
    case 'restart': {
      const fresh = createState(s.sessionId, s.config, s.run + 1);
      return { ...fresh, sensor: { ...freshSensor(), link: s.sensor.link } };
    }
    case 'end':
      return { ...s, status: 'ended', endedAt: c.at, safety: false, rest: false };
    case 'sensor': {
      if (!rolesForMode(s.config.inputMode).includes(c.role)) return s;
      if (!Number.isInteger(c.seq) || c.seq <= s.sensor.lastSeq[c.role]) return s;
      const lastSeq = { ...s.sensor.lastSeq, [c.role]: c.seq };
      const link = { ...s.sensor.link, [c.role]: c.event === 'lost' ? 'lost' : 'ok' } as SensorState['link'];
      const onset = c.event === 'onset' && s.status === 'running';
      return {
        ...s,
        sensor: { ...s.sensor, lastSeq, link, movements: s.sensor.movements + (onset ? 1 : 0), pending: s.sensor.pending || onset, lastRole: onset ? c.role : s.sensor.lastRole },
      };
    }
  }
}

/** Counts only: no failure, no penalty. */
export function summary(s: State) {
  const done = s.events.filter((e) => e.kind !== 'skipped');
  return {
    presented: s.events.length,
    completed: done.length,
    confirmed: s.events.filter((e) => e.kind === 'confirmed').length,
    assisted: s.events.filter((e) => e.kind === 'assisted').length,
    skipped: s.events.filter((e) => e.kind === 'skipped').length,
    stagesCompleted: s.completed.length,
    totalSteps: TOTAL_STEPS,
  };
}
