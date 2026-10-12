import type { InputMode, InputSource } from '@/lib/safehexarena3d/sensorInput';
import { INPUT_MODES } from '@/lib/safehexarena3d/sensorInput';
import { DEFAULT_ALLOW, type Allow, type FeetSetting } from './sequence';

/** Therapist settings. Everything here is serializable, clamped by `sanitizeConfig`, and travels to the Display inside the state. */
export interface Config {
  /** Which screen edge the child stands at: 0 = bottom (facing up the picture), 180 = top, 90 = left, 270 = right. */
  rot: 0 | 90 | 180 | 270;
  /** Swap the left/right placement on screen (for a child who faces the projected picture's source). */
  mirror: boolean;
  /** Lane size and spacing multiplier: the therapist sets a safe distance; pixels are never assumed to be centimetres. */
  spacing: number;
  feet: FeetSetting;
  allow: Allow;
  holds: boolean;
  holdMs: number;
  /** Hints: reveal the next movement during memory recall and highlight the current step in a numbered sequence. */
  hints: boolean;
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
  minimalHud: boolean;
}

export const DEFAULT_CONFIG: Config = {
  rot: 0,
  mirror: false,
  spacing: 1,
  feet: 'both',
  allow: DEFAULT_ALLOW,
  holds: true,
  holdMs: 3000,
  hints: false,
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
  spacing: [0.7, 1.3],
  holdMs: [1000, 8000],
  volume: [0, 1],
  inset: [3, 20],
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const r2 = (v: number) => Math.round(v * 100) / 100;
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const pick = <T extends string | number>(v: unknown, set: readonly T[], d: T): T => (set.includes(v as T) ? (v as T) : d);
/** Canonical lane string: only L/C/R, in L-C-R order, no duplicates. */
const lanesOf = (v: unknown, d: string) => (typeof v === 'string' ? (['L', 'C', 'R'] as const).filter((l) => v.includes(l)).join('') : d);

/** Canonical form: fixed key order, clamped numbers. Idempotent, so a decoded payload can be compared with its own sanitisation. */
export function sanitizeConfig(raw: unknown, base: Config = DEFAULT_CONFIG): Config {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Config, unknown>>;
  const p = (r.proj && typeof r.proj === 'object' ? r.proj : {}) as Partial<Config['proj']>;
  const pb = base.proj;
  const a = (r.allow && typeof r.allow === 'object' ? r.allow : {}) as Partial<Allow>;
  return {
    rot: pick(r.rot ?? base.rot, [0, 90, 180, 270] as const, 0),
    mirror: bool(r.mirror, base.mirror),
    spacing: r2(clamp(num(r.spacing, base.spacing), LIMITS.spacing[0], LIMITS.spacing[1])),
    feet: pick(r.feet ?? base.feet, ['both', 'R', 'L'] as const, 'both'),
    allow: { R: lanesOf(a.R, base.allow.R), L: lanesOf(a.L, base.allow.L) },
    holds: bool(r.holds, base.holds),
    holdMs: Math.round(clamp(num(r.holdMs, base.holdMs), LIMITS.holdMs[0], LIMITS.holdMs[1]) / 500) * 500,
    hints: bool(r.hints, base.hints),
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

/** Settings that change which movements are asked or where lanes sit: allowed only before a stage starts. */
export const STRUCTURAL_KEYS: readonly (keyof Config)[] = ['rot', 'mirror', 'spacing', 'feet', 'allow', 'holds', 'holdMs', 'proj'];
