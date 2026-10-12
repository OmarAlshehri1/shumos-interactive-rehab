import type { InputMode, InputSource } from '@/lib/safehexarena3d/sensorInput';
import { INPUT_MODES } from '@/lib/safehexarena3d/sensorInput';
import type { HintMode } from './stages';

/** Therapist settings. Everything here is serializable, clamped by `sanitizeConfig`, and travels to the Display inside the state. */
export interface Config {
  /** Simplified route: only the main corridor, no dead ends, no side stars, no route-changing events, wider corridors. */
  simple: boolean;
  /** 180 turns the picture around for a child who starts from the other side of the floor. */
  rot: 0 | 180;
  mirror: boolean;
  /** Corridor width in course units; null = the stage's default (wider in simplified mode). */
  width: number | null;
  /** 'auto' = the stage's own guidance level. */
  hint: 'auto' | HintMode;
  /** Friendly guardians and swarms that ask the child to wait (starts only when the child stands confirmed at a waiting zone). */
  guards: boolean;
  /** Dynamic gates, bridges and route switches (same safety rule). Off = every corridor is simply open. */
  events: boolean;
  guardMs: number;
  eventMs: number;
  /** Therapist-approved stance hold during guard waits: the sign says "stand steady" instead of plain "wait". */
  stance: boolean;
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
  /** Fewer on-screen words: only the star count and the stop/go lamp. */
  minimalHud: boolean;
}

export const DEFAULT_CONFIG: Config = {
  simple: false,
  rot: 0,
  mirror: false,
  width: null,
  hint: 'auto',
  guards: true,
  events: true,
  guardMs: 6000,
  eventMs: 3500,
  stance: false,
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
  minimalHud: false,
};

export const LIMITS = {
  width: [1.3, 2.6],
  guardMs: [3000, 15000],
  eventMs: [2000, 8000],
  volume: [0, 1],
  inset: [3, 20],
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const r2 = (v: number) => Math.round(v * 100) / 100;
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const pick = <T extends string | number>(v: unknown, set: readonly T[], d: T): T => (set.includes(v as T) ? (v as T) : d);

/** Canonical form: fixed key order, clamped numbers. Idempotent, so a decoded payload can be compared with its own sanitisation. */
export function sanitizeConfig(raw: unknown, base: Config = DEFAULT_CONFIG): Config {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Config, unknown>>;
  const p = (r.proj && typeof r.proj === 'object' ? r.proj : {}) as Partial<Config['proj']>;
  const pb = base.proj;
  const widthRaw = r.width === undefined ? base.width : r.width;
  return {
    simple: bool(r.simple, base.simple),
    rot: pick(r.rot ?? base.rot, [0, 180] as const, 0),
    mirror: bool(r.mirror, base.mirror),
    width: widthRaw === null ? null : r2(clamp(num(widthRaw, 1.6), LIMITS.width[0], LIMITS.width[1])),
    hint: pick(r.hint ?? base.hint, ['auto', 'always', 'next', 'none'] as const, 'auto'),
    guards: bool(r.guards, base.guards),
    events: bool(r.events, base.events),
    guardMs: Math.round(clamp(num(r.guardMs, base.guardMs), LIMITS.guardMs[0], LIMITS.guardMs[1]) / 500) * 500,
    eventMs: Math.round(clamp(num(r.eventMs, base.eventMs), LIMITS.eventMs[0], LIMITS.eventMs[1]) / 500) * 500,
    stance: bool(r.stance, base.stance),
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
    minimalHud: bool(r.minimalHud, base.minimalHud),
  };
}

/** Settings that change the maze's geometry: allowed only while the stage has not started (never under a walking child). */
export const STRUCTURAL_KEYS: readonly (keyof Config)[] = ['simple', 'rot', 'mirror', 'width', 'proj'];

/** Where the safe-corridor rule is enforced: the therapist's width is never narrowed by the game. */
export const effectiveWidth = (c: Config, stageWidth: number): number =>
  c.width ?? (c.simple ? Math.min(LIMITS.width[1], Math.round((stageWidth + 0.4) * 10) / 10) : stageWidth);
