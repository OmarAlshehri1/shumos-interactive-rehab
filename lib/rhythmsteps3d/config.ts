/**
 * Rhythm Steps 3D configuration: every therapist-adjustable value, with its limits and a sanitiser.
 * Nothing here is a clinical threshold: speeds, spacing, hold lengths and distances are interface ranges the
 * therapist chooses per child. Physical distances exist only when the therapist enters a measured floor size.
 */
export const LANE_IDS = [0, 1, 2, 3] as const;

/** Lane identity -> colour (and Arabic name). Colour is never the only instruction: every target carries a foot symbol. */
export const LANES = [
  { id: 0, nameAr: 'أحمر', nameEn: 'Red', hex: '#ff4d5e' },
  { id: 1, nameAr: 'أزرق', nameEn: 'Blue', hex: '#19c8ff' },
  { id: 2, nameAr: 'أخضر', nameEn: 'Green', hex: '#27e08a' },
  { id: 3, nameAr: 'أصفر', nameEn: 'Gold', hex: '#ffc233' },
] as const;

/** Only contiguous lane sets, so "adjacent" always means physically next to each other. */
export const LANE_SETS = {
  '4': { label: 'أربعة مسارات', lanes: [0, 1, 2, 3] },
  '3L': { label: 'ثلاثة مسارات · يسار', lanes: [0, 1, 2] },
  '3R': { label: 'ثلاثة مسارات · يمين', lanes: [1, 2, 3] },
  '2L': { label: 'مساران · يسار', lanes: [0, 1] },
  '2C': { label: 'مساران · وسط', lanes: [1, 2] },
  '2R': { label: 'مساران · يمين', lanes: [2, 3] },
} as const;
export type LaneSet = keyof typeof LANE_SETS;

export const SPEED_PROFILES = {
  gentle: { label: 'هادئة', speed: 0.55 },
  comfortable: { label: 'مريحة', speed: 0.8 },
  active: { label: 'نشطة', speed: 1.05 },
  custom: { label: 'مخصّصة', speed: 0.8 },
} as const;
export type SpeedProfile = keyof typeof SPEED_PROFILES;

export type Flow = 'continuous' | 'assisted';
export type Limbs = 'both' | 'left' | 'right';
/** 'auto' fits the whole browser window (normal); a ratio letterboxes the arena to a projector image of that shape. */
export type Aspect = 'auto' | '16:9' | '16:10' | '4:3' | '21:9';
export const ASPECTS: Record<Exclude<Aspect, 'auto'>, number> = { '16:9': 16 / 9, '16:10': 16 / 10, '4:3': 4 / 3, '21:9': 21 / 9 };
export type InputMode = 'MANUAL' | 'RIGHT_FOOT' | 'LEFT_FOOT' | 'DUAL_FOOT';
export type InputSource = 'manual' | 'simulated';

export interface Allow {
  single: boolean;
  both: boolean;
  dual: boolean;
  split: boolean;
  hold: boolean;
}

export interface Config {
  flow: Flow;
  speedProfile: SpeedProfile;
  /** Clock rate used when speedProfile is "custom". */
  customSpeed: number;
  /** Multiplier on the gap between targets. */
  spacing: number;
  /** How long a target waits at the line (game ms) before it is recorded as unconfirmed, in continuous flow. */
  graceMs: number;
  laneSet: LaneSet;
  limbs: Limbs;
  allow: Allow;
  /** 1 = neighbouring lanes only; 2 = one lane between the feet (needs three or more lanes). */
  stanceWidth: 1 | 2;
  /** Use left/right foot targets for single steps (otherwise "either foot"). */
  sided: boolean;
  holdMs: number;
  /** Therapist-enabled optional jump targets. Off by default; every jump has a step alternative. */
  jumping: boolean;
  /** Stage 9 only: shorter gaps between targets. */
  fast: boolean;
  /** Preferred lane position (index in the active lanes) for the foot that stays put in Split Rhythm. */
  anchor: number;
  intensity: number;
  reducedEffects: boolean;
  highContrast: boolean;
  quality: 'low' | 'high';
  music: boolean;
  sfx: boolean;
  /** 0..100, 0 = silent. */
  volume: number;
  // ---- projection calibration (the therapist's setup, never measured by the game) ----
  margin: number;
  targetSize: number;
  laneSpacing: number;
  nearY: number;
  perspective: number;
  aspect: Aspect;
  floorWidthCm: number;
  floorHeightCm: number;
  calibrationConfirmed: boolean;
  /** Draw the calibration grid and zone outlines on the floor. */
  grid: boolean;
  inputMode: InputMode;
  inputSource: InputSource;
}

export const DEFAULT_CONFIG: Config = {
  flow: 'continuous',
  speedProfile: 'comfortable',
  customSpeed: 0.8,
  spacing: 1,
  graceMs: 3500,
  laneSet: '4',
  limbs: 'both',
  allow: { single: true, both: true, dual: true, split: true, hold: true },
  stanceWidth: 1,
  sided: false,
  holdMs: 2000,
  jumping: false,
  fast: false,
  anchor: 1,
  intensity: 85,
  reducedEffects: false,
  highContrast: false,
  quality: 'high',
  music: true,
  sfx: true,
  volume: 70,
  margin: 4,
  targetSize: 100,
  laneSpacing: 100,
  nearY: 16,
  perspective: 82,
  aspect: 'auto',
  floorWidthCm: 0,
  floorHeightCm: 0,
  calibrationConfirmed: false,
  grid: false,
  inputMode: 'MANUAL',
  inputSource: 'manual',
};

export const LIMITS = {
  customSpeed: [0.4, 1.4],
  spacing: [0.75, 2],
  graceMs: [1500, 8000],
  holdMs: [1000, 8000],
  intensity: [40, 100],
  volume: [0, 100],
  margin: [0, 15],
  targetSize: [70, 120],
  laneSpacing: [80, 140],
  nearY: [8, 30],
  perspective: [0, 100],
  floorCm: [50, 3000],
} as const;

const clamp = (v: unknown, [lo, hi]: readonly [number, number] | readonly number[], fallback: number, step = 0) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  const c = Math.min(hi, Math.max(lo, n));
  return step ? Math.min(hi, Math.max(lo, Number((Math.round(c / step) * step).toFixed(6)))) : c;
};
const oneOf = <T extends string | number>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

/** Clamp and coerce every field. Pure: the Display decodes remote config through this, so a bad record never reaches the renderer. */
export function sanitizeConfig(raw: Partial<Config> | null | undefined, base: Config = DEFAULT_CONFIG): Config {
  const c = (raw ?? {}) as Partial<Config>;
  const allowRaw = (c.allow ?? base.allow) as Partial<Allow>;
  const laneSet = oneOf(c.laneSet, Object.keys(LANE_SETS) as LaneSet[], base.laneSet);
  const laneCount = LANE_SETS[laneSet].lanes.length;
  const limbs = oneOf(c.limbs, ['both', 'left', 'right'] as const, base.limbs);
  const inputMode = oneOf(c.inputMode, ['MANUAL', 'RIGHT_FOOT', 'LEFT_FOOT', 'DUAL_FOOT'] as const, base.inputMode);
  return {
    flow: oneOf(c.flow, ['continuous', 'assisted'] as const, base.flow),
    speedProfile: oneOf(c.speedProfile, Object.keys(SPEED_PROFILES) as SpeedProfile[], base.speedProfile),
    customSpeed: clamp(c.customSpeed, LIMITS.customSpeed, base.customSpeed, 0.05),
    spacing: clamp(c.spacing, LIMITS.spacing, base.spacing, 0.25),
    graceMs: clamp(c.graceMs, LIMITS.graceMs, base.graceMs, 500),
    laneSet,
    limbs,
    allow: {
      single: bool(allowRaw.single, base.allow.single),
      both: bool(allowRaw.both, base.allow.both),
      dual: bool(allowRaw.dual, base.allow.dual),
      split: bool(allowRaw.split, base.allow.split),
      hold: bool(allowRaw.hold, base.allow.hold),
    },
    stanceWidth: laneCount >= 3 && c.stanceWidth === 2 ? 2 : 1,
    sided: bool(c.sided, base.sided),
    holdMs: clamp(c.holdMs, LIMITS.holdMs, base.holdMs, 500),
    jumping: bool(c.jumping, base.jumping),
    fast: bool(c.fast, base.fast),
    anchor: Math.round(clamp(c.anchor, [0, 3], base.anchor)) % laneCount,
    intensity: clamp(c.intensity, LIMITS.intensity, base.intensity, 5),
    reducedEffects: bool(c.reducedEffects, base.reducedEffects),
    highContrast: bool(c.highContrast, base.highContrast),
    quality: oneOf(c.quality, ['low', 'high'] as const, base.quality),
    music: bool(c.music, base.music),
    sfx: bool(c.sfx, base.sfx),
    volume: clamp(c.volume, LIMITS.volume, base.volume, 5),
    margin: clamp(c.margin, LIMITS.margin, base.margin, 1),
    targetSize: clamp(c.targetSize, LIMITS.targetSize, base.targetSize, 5),
    laneSpacing: clamp(c.laneSpacing, LIMITS.laneSpacing, base.laneSpacing, 5),
    nearY: clamp(c.nearY, LIMITS.nearY, base.nearY, 1),
    perspective: clamp(c.perspective, LIMITS.perspective, base.perspective, 2),
    aspect: oneOf(c.aspect, Object.keys(ASPECTS) as Aspect[], base.aspect),
    floorWidthCm: typeof c.floorWidthCm === 'number' && c.floorWidthCm >= LIMITS.floorCm[0] ? clamp(c.floorWidthCm, LIMITS.floorCm, 0) : 0,
    floorHeightCm: typeof c.floorHeightCm === 'number' && c.floorHeightCm >= LIMITS.floorCm[0] ? clamp(c.floorHeightCm, LIMITS.floorCm, 0) : 0,
    calibrationConfirmed: bool(c.calibrationConfirmed, base.calibrationConfirmed),
    grid: bool(c.grid, base.grid),
    inputMode,
    inputSource: inputMode === 'MANUAL' ? 'manual' : oneOf(c.inputSource, ['manual', 'simulated'] as const, base.inputSource),
  };
}

/** Effective clock rate (game ms per real ms). */
export function speedOf(c: Pick<Config, 'speedProfile' | 'customSpeed'>): number {
  return c.speedProfile === 'custom' ? c.customSpeed : SPEED_PROFILES[c.speedProfile].speed;
}

export const activeLanes = (c: Pick<Config, 'laneSet'>): readonly number[] => LANE_SETS[c.laneSet].lanes;
