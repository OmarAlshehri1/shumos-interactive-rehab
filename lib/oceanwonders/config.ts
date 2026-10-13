/** Therapist settings. Serializable, clamped by `sanitizeConfig`, and carried to the Display inside the state. */
export interface Config {
  /** How the therapist confirms. Informational only: it never changes what a confirmation means. */
  inputSource: 'manual' | 'gamepad';
  /** Saved WALL projection profile name and safe inset (percent); the scene itself needs no calibration. */
  proj: { name: string | null; inset: number };
  sound: boolean;
  music: boolean;
  voice: boolean;
  volume: number;
  reducedMotion: boolean;
  reducedEffects: boolean;
  highContrast: boolean;
  quality: 'high' | 'balanced' | 'low';
  minimalHud: boolean;
  /** Slow, gentle camera drift on the Display. */
  cinematic: boolean;
}

export const DEFAULT_CONFIG: Config = {
  inputSource: 'manual',
  proj: { name: null, inset: 4 },
  sound: true,
  music: true,
  voice: true,
  volume: 0.7,
  reducedMotion: false,
  reducedEffects: false,
  highContrast: false,
  quality: 'balanced',
  minimalHud: false,
  cinematic: true,
};

export const LIMITS = { inset: [0, 15], volume: [0, 1] } as const;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const r2 = (v: number) => Math.round(v * 100) / 100;
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const pick = <T extends string>(v: unknown, set: readonly T[], d: T): T => (set.includes(v as T) ? (v as T) : d);

/** Canonical form: fixed key order, clamped numbers. Idempotent, so a decoded payload can be compared with its own sanitisation. */
export function sanitizeConfig(raw: unknown, base: Config = DEFAULT_CONFIG): Config {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Config, unknown>>;
  const p = (r.proj && typeof r.proj === 'object' ? r.proj : {}) as Partial<Config['proj']>;
  return {
    inputSource: pick(r.inputSource ?? base.inputSource, ['manual', 'gamepad'] as const, 'manual'),
    proj: {
      name: p.name === undefined ? base.proj.name : typeof p.name === 'string' && p.name.length > 0 ? p.name.slice(0, 60) : null,
      inset: r2(clamp(num(p.inset, base.proj.inset), LIMITS.inset[0], LIMITS.inset[1])),
    },
    sound: bool(r.sound, base.sound),
    music: bool(r.music, base.music),
    voice: bool(r.voice, base.voice),
    volume: r2(clamp(num(r.volume, base.volume), LIMITS.volume[0], LIMITS.volume[1])),
    reducedMotion: bool(r.reducedMotion, base.reducedMotion),
    reducedEffects: bool(r.reducedEffects, base.reducedEffects),
    highContrast: bool(r.highContrast, base.highContrast),
    quality: pick(r.quality ?? base.quality, ['high', 'balanced', 'low'] as const, 'balanced'),
    minimalHud: bool(r.minimalHud, base.minimalHud),
    cinematic: bool(r.cinematic, base.cinematic),
  };
}
