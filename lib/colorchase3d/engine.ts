/**
 * Color Chase 3D engine: a pure reducer. The therapist's Control is the only place it runs; the child Display only renders
 * the state it is sent. There are no timers at all: nothing times out, nothing fails the child, nothing is penalised.
 *
 * One requested color is the target at a time. The therapist taps the zone the child chose and confirms it (a wrong zone
 * only gives the child a gentle second look at the target), or marks the objective as assisted, or skips it. Sensors
 * can only raise a movement HINT: the engine never decides which zone a child stands on.
 */
import { rolesForMode, type FootRole, type InputMode, type InputSource } from '@/lib/safehexarena3d/sensorInput';
import { COLOR_IDS, isColorId, type ColorId } from './colors';
import { assignment, buildLayout, checkLayout, type Layout } from './layout';
import { STAGES, TOTAL_OBJECTIVES, flatSteps, stepsOf, zoneColors, type FlatStep } from './stages';

export type Status = 'ready' | 'running' | 'paused' | 'stage-complete' | 'ended';
export type ViewMode = 'floor' | 'cinematic';
export type Quality = 'low' | 'medium' | 'high';
export type Assist = 'standard' | 'high';
export const ASPECTS = { '16:9': 16 / 9, '16:10': 16 / 10, '4:3': 4 / 3, '21:9': 21 / 9 } as const;
export type Aspect = keyof typeof ASPECTS;

export interface Config {
  /** Zone size, percent of the comfortable size (70..140). */
  zoneScale: number;
  /** Distance between zones, percent of the widest comfortable spread (60..100). */
  spacing: number;
  /** How much of the floor the zones may span, percent (50..100): the therapist's movement range. */
  reach: number;
  /** Safe margin around the usable area, percent of each side (0..15). */
  margin: number;
  /** How many colors are shown at most (2..5). */
  maxColors: number;
  /** Show a shape on every zone (default on). */
  symbols: boolean;
  /** `high` dims the other zones and keeps a soft hint on the next color of a sequence. */
  assist: Assist;
  aspect: Aspect;
  /** Therapist-entered size of the projected area in cm (0 = not entered); estimates only. */
  floorWidthCm: number;
  floorHeightCm: number;
  calibrationConfirmed: boolean;
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
  zoneScale: 100,
  spacing: 100,
  reach: 100,
  margin: 4,
  maxColors: 5,
  symbols: true,
  assist: 'standard',
  aspect: '16:9',
  floorWidthCm: 0,
  floorHeightCm: 0,
  calibrationConfirmed: false,
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
  zoneScale: [70, 140],
  spacing: [60, 100],
  reach: [50, 100],
  margin: [0, 15],
  maxColors: [2, 5],
  intensity: [50, 100],
  floorCm: [50, 3000],
} as const;

/** One-tap presets: the therapist can still adjust every slider afterwards. */
export const PRESETS = {
  standard: { zoneScale: 100, spacing: 100, reach: 100, maxColors: 5 },
  large: { zoneScale: 135, spacing: 80, reach: 80, maxColors: 4 },
  compact: { zoneScale: 85, spacing: 70, reach: 60, maxColors: 5 },
} as const satisfies Record<string, Partial<Config>>;

export interface ObjectiveEvent {
  key: string;
  stage: number;
  step: number;
  kind: 'confirmed' | 'assisted' | 'skipped';
}

export interface SensorState {
  link: Record<FootRole, 'none' | 'ok' | 'lost'>;
  lastSeq: Record<FootRole, number>;
  /** Accepted movement-onset hints. Hints only: never a zone, never a confirmed selection. */
  movements: number;
  pending: boolean;
  lastRole: FootRole | null;
}

export interface State {
  sessionId: string;
  seed: number;
  run: number;
  stage: number;
  /** Index of the current objective within the stage. */
  step: number;
  status: Status;
  startStage: number;
  startedAt: number;
  endedAt: number;
  /** Paused by the therapist's safety hold (or a lost connection): needs an explicit resume. */
  safety: boolean;
  /** Counts "repeat objective" requests so the Display can pulse the target again. Also the count stored in history. */
  repeats: number;
  /** Counts gentle redirects (a different zone was chosen): the Display only pulses the target again. Never scored. */
  nudge: number;
  config: Config;
  events: ObjectiveEvent[];
  completed: number[];
  skipped: number[];
  sensor: SensorState;
}

export type Command =
  | { type: 'configure'; config: Partial<Config> }
  | { type: 'start'; at: number }
  | { type: 'pause' }
  | { type: 'safety' }
  | { type: 'resume'; at: number }
  | { type: 'select'; stage: number; step: number; color: ColorId }
  | { type: 'assist'; stage: number; step: number }
  | { type: 'skip'; stage: number; step: number }
  | { type: 'repeat' }
  | { type: 'skipStage' }
  | { type: 'next'; at: number }
  | { type: 'stage'; stage: number }
  | { type: 'restart' }
  | { type: 'end'; at: number }
  | { type: 'sensor'; role: FootRole; event: 'onset' | 'rest' | 'lost' | 'resumed'; seq: number; at: number };

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.max(lo, Math.min(hi, Math.round(Number.isFinite(v) ? v : lo)));

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
    zoneScale: clamp(c.zoneScale, LIMITS.zoneScale),
    spacing: clamp(c.spacing, LIMITS.spacing),
    reach: clamp(c.reach, LIMITS.reach),
    margin: clamp(c.margin, LIMITS.margin),
    maxColors: clamp(c.maxColors, LIMITS.maxColors),
    symbols: c.symbols !== false,
    assist: c.assist === 'high' ? 'high' : 'standard',
    aspect: c.aspect in ASPECTS ? c.aspect : '16:9',
    floorWidthCm: cm ? clamp(c.floorWidthCm, LIMITS.floorCm) : 0,
    floorHeightCm: cm ? clamp(c.floorHeightCm, LIMITS.floorCm) : 0,
    calibrationConfirmed: !!c.calibrationConfirmed && cm,
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
    startStage: 0,
    startedAt: 0,
    endedAt: 0,
    safety: false,
    repeats: 0,
    nudge: 0,
    config: sanitizeConfig({ ...DEFAULT_CONFIG, ...config }),
    events: [],
    completed: [],
    skipped: [],
    sensor: freshSensor(),
  };
}

export const stageDef = (s: State) => STAGES[s.stage];
export const stepCount = (s: State, stage = s.stage) => stepsOf(STAGES[stage]);
export const stepKey = (s: State, stage = s.stage, step = s.step) => `${s.run}:${stage}:${step}`;
export const isResolved = (s: State, stage = s.stage, step = s.step) => s.events.some((e) => e.key === stepKey(s, stage, step));

const stepsCache = new Map<string, FlatStep[]>();
/** The stage's objectives in order, with the therapist's color cap applied. */
export function stepsOfStage(stage: number, cap: number): FlatStep[] {
  const key = `${stage}:${cap}`;
  let hit = stepsCache.get(key);
  if (!hit) {
    hit = flatSteps(STAGES[stage], cap);
    stepsCache.set(key, hit);
  }
  return hit;
}
export const stepsFor = (s: State) => stepsOfStage(s.stage, s.config.maxColors);
/** The requested color right now (null once the stage is over). */
export const targetOf = (s: State): FlatStep | null => (s.status === 'stage-complete' || s.status === 'ended' ? null : stepsFor(s)[s.step] ?? null);

const layoutCache = new Map<string, Layout>();
/** Zone slots of a stage for the given config: identical on Control and Display (pure function of shared state). */
export function layoutFor(stage: number, c: Config): Layout {
  const def = STAGES[stage];
  const n = zoneColors(def, c.maxColors).length;
  const key = [def.layout, n, c.aspect, c.margin, c.zoneScale, c.spacing, c.reach].join(':');
  let hit = layoutCache.get(key);
  if (!hit) {
    hit = buildLayout(def.layout, n, { aspect: ASPECTS[c.aspect], margin: c.margin, zoneScale: c.zoneScale, spacing: c.spacing, reach: c.reach });
    if (layoutCache.size > 64) layoutCache.clear();
    layoutCache.set(key, hit);
  }
  return hit;
}
export const layoutOf = (s: State) => layoutFor(s.stage, s.config);

export interface ZoneView {
  slot: number;
  color: ColorId;
  x: number;
  y: number;
  r: number;
}
/** Which color sits in each slot during `round` (zones trade places only between rounds). */
export function zonesFor(stage: number, seed: number, config: Config, round: number): ZoneView[] {
  const def = STAGES[stage];
  const layout = layoutFor(stage, config);
  const colors = assignment(stage, seed, round, zoneColors(def, config.maxColors), def.shuffle);
  return layout.slots.map((p, slot) => ({ slot, color: colors[slot], x: p.x, y: p.y, r: layout.radius }));
}
export function zonesOf(s: State): ZoneView[] {
  const cur = stepsFor(s)[Math.min(s.step, stepCount(s) - 1)];
  return zonesFor(s.stage, s.seed, s.config, cur ? cur.round : 0);
}
export const layoutIsSafe = (s: State) => checkLayout(layoutOf(s)).length === 0;

export type ObjectiveState = 'DONE' | 'SKIPPED' | 'TARGET' | 'LATER';
export function objectiveStates(s: State): ObjectiveState[] {
  return stepsFor(s).map((_, i) => {
    const ev = s.events.find((e) => e.key === stepKey(s, s.stage, i));
    if (ev) return ev.kind === 'skipped' ? 'SKIPPED' : 'DONE';
    return s.status !== 'stage-complete' && s.status !== 'ended' && i === s.step ? 'TARGET' : 'LATER';
  });
}

/**
 * How much of each garden color has returned in the current stage (0..1), derived ONLY from the shared state, so a reloaded
 * Display or Control rebuilds the identical garden. A color returns as its objectives are completed (skipped ones do not
 * restore). Colors the stage does not ask for return gently with overall progress; a fully completed stage restores everything.
 */
export function restoration(s: State): { colors: Record<ColorId, number>; overall: number } {
  const steps = stepsFor(s);
  const total: Record<ColorId, number> = { red: 0, blue: 0, green: 0, yellow: 0, purple: 0 };
  const done: Record<ColorId, number> = { red: 0, blue: 0, green: 0, yellow: 0, purple: 0 };
  let doneAll = 0;
  steps.forEach((st, i) => {
    total[st.color]++;
    const ev = s.events.find((e) => e.key === stepKey(s, s.stage, i));
    if (ev && ev.kind !== 'skipped') {
      done[st.color]++;
      doneAll++;
    }
  });
  const overall = steps.length ? doneAll / steps.length : 0;
  const clean = s.completed.includes(s.stage);
  const colors = {} as Record<ColorId, number>;
  for (const c of COLOR_IDS) colors[c] = clean ? 1 : total[c] > 0 ? done[c] / total[c] : overall * 0.6;
  return { colors, overall: clean ? 1 : overall };
}

/** Settings that move or resize zones: changed only while no objective is being attempted. */
const LAYOUT_KEYS = ['zoneScale', 'spacing', 'reach', 'margin', 'aspect', 'floorWidthCm', 'floorHeightCm', 'maxColors'] as const;

const clearPending = (s: State): SensorState => (s.sensor.pending ? { ...s.sensor, pending: false } : s.sensor);
const isLive = (s: State) => s.status === 'running' || s.status === 'paused';

function resolve(s: State, kind: ObjectiveEvent['kind']): State {
  const key = stepKey(s);
  if (s.events.some((e) => e.key === key)) return s;
  const total = stepCount(s);
  const events = [...s.events, { key, stage: s.stage, step: s.step, kind }];
  const stageEvents = events.filter((e) => e.stage === s.stage);
  const base: State = { ...s, events, sensor: clearPending(s) };
  if (stageEvents.length >= total) {
    const clean = stageEvents.every((e) => e.kind !== 'skipped');
    return {
      ...base,
      step: total,
      status: 'stage-complete',
      completed: clean && !s.completed.includes(s.stage) ? [...s.completed, s.stage] : s.completed,
      skipped: !clean && !s.skipped.includes(s.stage) ? [...s.skipped, s.stage] : s.skipped,
    };
  }
  return { ...base, step: s.step + 1 };
}

export function reduce(s: State, c: Command): State {
  if (s.status === 'ended' && c.type !== 'restart') return s;
  switch (c.type) {
    case 'configure': {
      const patch = { ...c.config };
      // Zones never move or resize under an objective in progress.
      if (s.status === 'running') for (const k of LAYOUT_KEYS) delete patch[k];
      const config = sanitizeConfig({ ...s.config, ...patch });
      const inputChanged = config.inputMode !== s.config.inputMode || config.inputSource !== s.config.inputSource;
      return { ...s, config, sensor: inputChanged ? freshSensor() : s.sensor };
    }
    case 'start':
      return s.status === 'ready' ? { ...s, status: 'running', startedAt: s.startedAt || c.at, startStage: s.startedAt ? s.startStage : s.stage, safety: false } : s;
    case 'pause':
      return s.status === 'running' ? { ...s, status: 'paused' } : s;
    case 'safety':
      if (s.status === 'running') return { ...s, status: 'paused', safety: true };
      if (s.status === 'paused' || s.status === 'ready') return { ...s, safety: true };
      return s;
    case 'resume':
      return s.status === 'paused' ? { ...s, status: 'running', safety: false } : s;
    case 'select': {
      // The command names the objective it answers: a stale or duplicate command can never resolve a different one.
      if (!isLive(s) || c.stage !== s.stage || c.step !== s.step || s.step >= stepCount(s) || !isColorId(c.color)) return s;
      if (isResolved(s)) return s;
      const target = stepsFor(s)[s.step];
      // a different zone is never a failure: the target just pulses again for a second look
      if (c.color !== target.color) return { ...s, nudge: s.nudge + 1 };
      return resolve(s, 'confirmed');
    }
    case 'assist':
      return isLive(s) && c.stage === s.stage && c.step === s.step && s.step < stepCount(s) ? resolve(s, 'assisted') : s;
    case 'skip':
      return isLive(s) && c.stage === s.stage && c.step === s.step && s.step < stepCount(s) ? resolve(s, 'skipped') : s;
    case 'repeat':
      return isLive(s) && s.step < stepCount(s) ? { ...s, repeats: s.repeats + 1 } : s;
    case 'skipStage': {
      if (!(isLive(s) || s.status === 'ready')) return s;
      const done = s.completed.includes(s.stage);
      return { ...s, status: 'stage-complete', step: stepCount(s), skipped: done || s.skipped.includes(s.stage) ? s.skipped : [...s.skipped, s.stage] };
    }
    case 'next': {
      if (s.status !== 'stage-complete') return s;
      if (s.stage >= STAGES.length - 1) return { ...s, status: 'ended', endedAt: c.at };
      return { ...s, stage: s.stage + 1, step: 0, status: 'ready' };
    }
    case 'stage': {
      if (!Number.isInteger(c.stage) || c.stage < 0 || c.stage >= STAGES.length) return s;
      if (!(s.status === 'ready' || s.status === 'paused' || s.status === 'stage-complete')) return s;
      if (s.events.some((e) => e.stage === c.stage) || s.completed.includes(c.stage) || s.skipped.includes(c.stage)) return s;
      return { ...s, stage: c.stage, step: 0, status: 'ready', safety: false };
    }
    case 'restart': {
      const fresh = createState(s.sessionId, s.config, s.run + 1);
      return { ...fresh, sensor: { ...freshSensor(), link: s.sensor.link } };
    }
    case 'end':
      return { ...s, status: 'ended', endedAt: c.at, safety: false };
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

/** Counts only: no failure, no penalty, no accuracy. */
export function summary(s: State) {
  const done = s.events.filter((e) => e.kind !== 'skipped');
  return {
    presented: s.events.length,
    completed: done.length,
    confirmed: s.events.filter((e) => e.kind === 'confirmed').length,
    assisted: s.events.filter((e) => e.kind === 'assisted').length,
    skipped: s.events.filter((e) => e.kind === 'skipped').length,
    stagesCompleted: s.completed.length,
    totalObjectives: TOTAL_OBJECTIVES,
    sessionCompleted: s.status === 'ended' && s.completed.length === STAGES.length,
  };
}
