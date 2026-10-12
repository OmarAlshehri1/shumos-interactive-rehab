import { AREA_H, AREA_W, COURSE_IDS, SELECTABLE_COURSES, type CourseId, type Pt, type PlanConfig } from './courses';
import type { InputMode, InputSource } from '@/lib/safehexarena3d/sensorInput';
import { INPUT_MODES } from '@/lib/safehexarena3d/sensorInput';

/** Therapist settings. Everything here is serializable, clamped by `sanitizeConfig`, and travels to the Display inside the state. */
export interface Config {
  /** 'auto' = the stage's own course; otherwise the therapist's layout choice. */
  course: 'auto' | CourseId;
  rot: 0 | 90 | 180 | 270;
  mirror: boolean;
  /** Corridor width in course units; null = the stage's default. */
  width: number | null;
  spacing: number;
  density: 0 | 1 | 2;
  stopMs: number;
  stops: boolean;
  events: boolean;
  eventMs: number;
  /** Manual moves of cones / checkpoints / start / finish, stored in the BASE frame (so a rotation never invalidates them). */
  cones: Record<string, Pt>;
  cpPos: Record<string, Pt>;
  start: Pt | null;
  finish: Pt | null;
  /** Copy of the chosen shared projection profile (software layout only; never a measured alignment claim). */
  proj: { name: string | null; rot: 0 | 90 | 180 | 270; inset: number; wCm: number | null; hCm: number | null };
  inputMode: InputMode;
  inputSource: InputSource;
  sound: boolean;
  music: boolean;
  voice: boolean;
  volume: number;
  reducedMotion: boolean;
  reducedEffects: boolean;
  highContrast: boolean;
  quality: 'high' | 'balanced' | 'low';
  /** 'ring' draws only a glowing footprint where each real cone stands (nothing is projected onto the cone itself). */
  coneStyle: 'cone' | 'ring';
  /** Fewer on-screen words: only the star count and the stop/go light. */
  minimalHud: boolean;
}

export const DEFAULT_CONFIG: Config = {
  course: 'auto',
  rot: 0,
  mirror: false,
  width: null,
  spacing: 1,
  density: 1,
  stopMs: 3000,
  stops: true,
  events: true,
  eventMs: 3500,
  cones: {},
  cpPos: {},
  start: null,
  finish: null,
  proj: { name: null, rot: 0, inset: 6, wCm: null, hCm: null },
  inputMode: 'MANUAL',
  inputSource: 'manual',
  sound: true,
  music: true,
  voice: true,
  volume: 0.7,
  reducedMotion: false,
  reducedEffects: false,
  highContrast: false,
  quality: 'balanced',
  coneStyle: 'cone',
  minimalHud: false,
};

export const LIMITS = {
  width: [1.6, 4.8],
  spacing: [0.7, 1.3],
  stopMs: [2000, 10000],
  eventMs: [2000, 8000],
  volume: [0, 1],
  inset: [3, 20],
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const r2 = (v: number) => Math.round(v * 100) / 100;
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const pick = <T extends string | number>(v: unknown, set: readonly T[], d: T): T => (set.includes(v as T) ? (v as T) : d);

function cleanPt(v: unknown): Pt | null {
  if (!Array.isArray(v) || v.length !== 2 || !v.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  return [r2(clamp(v[0], -AREA_W / 2, AREA_W / 2)), r2(clamp(v[1], -AREA_H / 2, AREA_H / 2))];
}

function cleanMap(v: unknown, max: number): Record<string, Pt> {
  const out: Record<string, Pt> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  const src = v as Record<string, unknown>;
  for (let i = 0; i < max; i++) {
    const p = cleanPt(src[String(i)]);
    if (p) out[String(i)] = p;
  }
  return out;
}

/** Canonical form: fixed key order, clamped numbers. Idempotent, so a decoded payload can be compared with its own sanitisation. */
export function sanitizeConfig(raw: unknown, base: Config = DEFAULT_CONFIG): Config {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Config, unknown>>;
  const p = (r.proj && typeof r.proj === 'object' ? r.proj : {}) as Partial<Config['proj']>;
  const pb = base.proj;
  const course = r.course === undefined ? base.course : r.course === 'auto' || (COURSE_IDS as readonly string[]).includes(r.course as string) ? (r.course as Config['course']) : base.course;
  const widthRaw = r.width === undefined ? base.width : r.width;
  return {
    course,
    rot: pick(r.rot ?? base.rot, [0, 90, 180, 270] as const, 0),
    mirror: bool(r.mirror, base.mirror),
    width: widthRaw === null ? null : r2(clamp(num(widthRaw, 3.2), LIMITS.width[0], LIMITS.width[1])),
    spacing: r2(clamp(num(r.spacing, base.spacing), LIMITS.spacing[0], LIMITS.spacing[1])),
    density: pick(r.density ?? base.density, [0, 1, 2] as const, 1),
    stopMs: Math.round(clamp(num(r.stopMs, base.stopMs), LIMITS.stopMs[0], LIMITS.stopMs[1]) / 500) * 500,
    stops: bool(r.stops, base.stops),
    events: bool(r.events, base.events),
    eventMs: Math.round(clamp(num(r.eventMs, base.eventMs), LIMITS.eventMs[0], LIMITS.eventMs[1]) / 500) * 500,
    cones: r.cones === undefined ? cleanMap(base.cones, 6) : cleanMap(r.cones, 6),
    cpPos: r.cpPos === undefined ? cleanMap(base.cpPos, 20) : cleanMap(r.cpPos, 20),
    start: r.start === undefined ? cleanPt(base.start) : cleanPt(r.start),
    finish: r.finish === undefined ? cleanPt(base.finish) : cleanPt(r.finish),
    proj: {
      name: p.name === undefined ? pb.name : typeof p.name === 'string' && p.name.length > 0 ? p.name.slice(0, 60) : null,
      rot: pick(p.rot ?? pb.rot, [0, 90, 180, 270] as const, 0),
      inset: r2(clamp(num(p.inset, pb.inset), LIMITS.inset[0], LIMITS.inset[1])),
      wCm: p.wCm === undefined ? pb.wCm : typeof p.wCm === 'number' && p.wCm > 0 && p.wCm <= 2000 ? r2(p.wCm) : null,
      hCm: p.hCm === undefined ? pb.hCm : typeof p.hCm === 'number' && p.hCm > 0 && p.hCm <= 2000 ? r2(p.hCm) : null,
    },
    inputMode: pick(r.inputMode ?? base.inputMode, INPUT_MODES, 'MANUAL'),
    inputSource: pick(r.inputSource ?? base.inputSource, ['manual', 'simulated'] as const, 'manual'),
    sound: bool(r.sound, base.sound),
    music: bool(r.music, base.music),
    voice: bool(r.voice, base.voice),
    volume: r2(clamp(num(r.volume, base.volume), 0, 1)),
    reducedMotion: bool(r.reducedMotion, base.reducedMotion),
    reducedEffects: bool(r.reducedEffects, base.reducedEffects),
    highContrast: bool(r.highContrast, base.highContrast),
    quality: pick(r.quality ?? base.quality, ['high', 'balanced', 'low'] as const, 'balanced'),
    coneStyle: pick(r.coneStyle ?? base.coneStyle, ['cone', 'ring'] as const, 'cone'),
    minimalHud: bool(r.minimalHud, base.minimalHud),
  };
}

/** Settings that change the geometry or checkpoint list: allowed only while the stage has not started. */
export const STRUCTURAL_KEYS: readonly (keyof Config)[] = ['course', 'rot', 'mirror', 'spacing', 'density', 'cones', 'cpPos', 'start', 'finish', 'proj'];

/** Course units to PlanConfig, with the stage's default corridor width when the therapist has not set one. */
export function planConfigOf(c: Config, stageWidth: number): PlanConfig {
  return {
    rot: ((c.rot + c.proj.rot) % 360) as PlanConfig['rot'],
    mirror: c.mirror,
    width: c.width ?? stageWidth,
    spacing: c.spacing,
    density: c.density,
    inset: c.proj.inset,
    cones: c.cones,
    cpPos: c.cpPos,
    start: c.start,
    finish: c.finish,
  };
}

export const COURSE_CHOICES: readonly ('auto' | CourseId)[] = ['auto', ...SELECTABLE_COURSES];
