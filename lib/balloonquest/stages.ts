import { hashSeed, mulberry32 } from "./rng";
import {
  DEFAULT_SETTINGS,
  DIFFICULTIES,
  type BalloonColor,
  type Difficulty,
  type Layout,
  type Motion,
  type ResolvedStage,
  type StageNumber,
  type TherapistSettings,
  TOTAL_STAGES,
} from "./types";

export interface StageSpec {
  difficulty: Difficulty;
  stage: StageNumber;
  motion: Motion;
  /** Correct selections needed to complete the stage. */
  goal: number;
  /** Palette size. */
  colors: number;
  activeCount: number;
  /** Balloon width, cqh. */
  sizeCqh: number;
  /** Seconds for one full below-to-above trip (0 when static). */
  riseSeconds: number;
}

/**
 * The nine stages. Progression inside a level is deliberately gentle:
 *   stage 1 familiarisation, stage 2 a little more to select,
 *   stage 3 slightly more density (and, in Advanced, a slightly faster rise).
 * Nothing here is time-limited: `goal` is a count of correct selections.
 */
export const STAGE_SPECS: readonly StageSpec[] = [
  { difficulty: "EASY", stage: 1, motion: "static", goal: 3, colors: 3, activeCount: 5, sizeCqh: 22, riseSeconds: 0 },
  { difficulty: "EASY", stage: 2, motion: "static", goal: 4, colors: 3, activeCount: 6, sizeCqh: 21.5, riseSeconds: 0 },
  { difficulty: "EASY", stage: 3, motion: "static", goal: 5, colors: 3, activeCount: 6, sizeCqh: 21, riseSeconds: 0 },
  { difficulty: "MEDIUM", stage: 1, motion: "rising", goal: 4, colors: 5, activeCount: 6, sizeCqh: 17.5, riseSeconds: 42 },
  { difficulty: "MEDIUM", stage: 2, motion: "rising", goal: 5, colors: 5, activeCount: 7, sizeCqh: 17, riseSeconds: 40 },
  { difficulty: "MEDIUM", stage: 3, motion: "rising", goal: 6, colors: 5, activeCount: 7, sizeCqh: 17, riseSeconds: 38 },
  { difficulty: "ADVANCED", stage: 1, motion: "rising", goal: 5, colors: 7, activeCount: 7, sizeCqh: 15, riseSeconds: 33 },
  { difficulty: "ADVANCED", stage: 2, motion: "rising", goal: 6, colors: 7, activeCount: 8, sizeCqh: 14.5, riseSeconds: 31 },
  { difficulty: "ADVANCED", stage: 3, motion: "rising", goal: 7, colors: 7, activeCount: 8, sizeCqh: 14.5, riseSeconds: 29 },
];

/** Colour order used when a stage uses fewer than all palette colours. Advanced's seven are exactly these. */
export const PALETTE_ORDER: readonly BalloonColor[] = ["red", "blue", "green", "yellow", "purple", "black", "white"];
/** Easy's three are the most distinct trio. */
const EASY_PALETTE: readonly BalloonColor[] = ["red", "blue", "yellow"];
const MEDIUM_PALETTE: readonly BalloonColor[] = ["red", "blue", "green", "yellow", "purple"];

export const COLOR_COUNT_BOUNDS: Record<Difficulty, { min: number; max: number }> = {
  EASY: { min: 2, max: 3 },
  MEDIUM: { min: 3, max: 5 },
  ADVANCED: { min: 4, max: 7 },
};

export const SETTING_BOUNDS = {
  sizeScale: { min: 0.85, max: 1.3 },
  speedScale: { min: 0.6, max: 1.4 },
  countOffset: { min: -2, max: 2 },
  contactTolerance: { min: 0, max: 0.5 },
} as const;

export const MIN_SIZE_CQH = 13;
export const MAX_SIZE_CQH = 27;
export const MIN_ACTIVE = 4;
export const MAX_ACTIVE = 10;
export const MIN_RISE_SECONDS = 18;

export const stageIndexOf = (difficulty: Difficulty, stage: StageNumber): number => DIFFICULTIES.indexOf(difficulty) * 3 + (stage - 1);
export const specAt = (index: number): StageSpec => STAGE_SPECS[index];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/** Validates and clamps any settings object (including ones that arrive over a channel). */
export function sanitizeSettings(raw: Partial<TherapistSettings> | undefined | null): TherapistSettings {
  const s = raw ?? {};
  const b = SETTING_BOUNDS;
  const d = DEFAULT_SETTINGS;
  return {
    sizeScale: clamp(num(s.sizeScale, d.sizeScale), b.sizeScale.min, b.sizeScale.max),
    speedScale: clamp(num(s.speedScale, d.speedScale), b.speedScale.min, b.speedScale.max),
    countOffset: Math.round(clamp(num(s.countOffset, d.countOffset), b.countOffset.min, b.countOffset.max)),
    colorCount: s.colorCount === null || s.colorCount === undefined ? null : Math.round(clamp(num(s.colorCount, 7), 2, 7)),
    contactTolerance: clamp(num(s.contactTolerance, d.contactTolerance), b.contactTolerance.min, b.contactTolerance.max),
    layout: s.layout === "FLOOR" ? "FLOOR" : "WALL",
    reducedMotion: s.reducedMotion === true,
    inputMode: (["therapist", "keyboard", "right-hand", "left-hand", "both-hands", "foot", "handheld"] as const).includes(s.inputMode as never) ? (s.inputMode as TherapistSettings["inputMode"]) : d.inputMode,
    autoAdvance: s.autoAdvance !== false,
    scope: s.scope === "level" ? "level" : "all",
    allowNoDisplay: s.allowNoDisplay === true,
  };
}

/** Floor projection: larger and slower targets, kept off the near edge where the child stands. */
export const LAYOUT_TUNING: Record<Layout, { sizeMul: number; speedMul: number; xMargin: number; yTop: number; yBottom: number }> = {
  WALL: { sizeMul: 1, speedMul: 1, xMargin: 8, yTop: 19, yBottom: 89 },
  FLOOR: { sizeMul: 1.15, speedMul: 0.85, xMargin: 14, yTop: 20, yBottom: 88 },
};

/** Applies therapist settings + layout to a stage spec, clamping everything into the safe envelope. */
export function resolveStage(index: number, settings: TherapistSettings): ResolvedStage {
  const spec = specAt(index);
  const tuning = LAYOUT_TUNING[settings.layout];
  const motion: Motion = spec.motion === "rising" && !settings.reducedMotion ? "rising" : "static";
  const bounds = COLOR_COUNT_BOUNDS[spec.difficulty];
  const colors = clamp(settings.colorCount ?? spec.colors, bounds.min, bounds.max);
  const base = spec.difficulty === "EASY" ? EASY_PALETTE : spec.difficulty === "MEDIUM" ? MEDIUM_PALETTE : PALETTE_ORDER;
  const palette = base.slice(0, colors) as BalloonColor[];
  const sizeCqh = clamp(spec.sizeCqh * settings.sizeScale * tuning.sizeMul, MIN_SIZE_CQH, MAX_SIZE_CQH);
  // Speed scale > 1 means faster, i.e. fewer seconds for the same trip.
  const baseRise = spec.riseSeconds > 0 ? spec.riseSeconds : 40;
  const riseSeconds = motion === "rising" ? Math.max(MIN_RISE_SECONDS, baseRise / (settings.speedScale * tuning.speedMul)) : 0;
  const activeCount = clamp(spec.activeCount + settings.countOffset, MIN_ACTIVE, MAX_ACTIVE);
  return { index, difficulty: spec.difficulty, stage: spec.stage, motion, layout: settings.layout, goal: spec.goal, sizeCqh, riseSeconds, activeCount, palette };
}

/** Deterministic target colour; never the same as the previous stage's target when the palette allows. */
export function pickTarget(seed: number, index: number, attempt: number, palette: readonly BalloonColor[], previous: BalloonColor | null): BalloonColor {
  const rng = mulberry32(hashSeed(seed, "target", index, attempt));
  const options = palette.length > 1 ? palette.filter((c) => c !== previous) : palette;
  return options[Math.floor(rng() * options.length)];
}

export function isValidIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < TOTAL_STAGES;
}
