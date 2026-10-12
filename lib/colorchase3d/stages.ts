import { Difficulty } from '@/lib/game';
import type { ColorId } from './colors';

export type LayoutKind = 'row' | 'arc' | 'ring' | 'path';

/** 3 levels x 3 stages. An objective is one requested color; a round is the group of objectives shown together. */
export interface StageDef {
  index: number;
  level: 1 | 2 | 3;
  stage: 1 | 2 | 3;
  nameAr: string;
  nameEn: string;
  /** The zone colors of the stage (the therapist may show fewer, never more). */
  colors: readonly ColorId[];
  /** Rounds of requested colors. A round with two colors is a sequence: the second is shown only after the first is done. */
  rounds: readonly (readonly ColorId[])[];
  /** Zones trade places only BETWEEN rounds, never while a child is moving. */
  shuffle: boolean;
  layout: LayoutKind;
  /** Stage where the therapist is expected to keep visual assistance on. */
  assisted: boolean;
}

const R: ColorId = 'red', B: ColorId = 'blue', G: ColorId = 'green', Y: ColorId = 'yellow', P: ColorId = 'purple';

export const STAGES: readonly StageDef[] = [
  { index: 0, level: 1, stage: 1, nameAr: 'الألوان الأولى', nameEn: 'First Colors', colors: [R, B], rounds: [[R], [B], [R], [B]], shuffle: false, layout: 'row', assisted: false },
  { index: 1, level: 1, stage: 2, nameAr: 'ثلاثة ألوان', nameEn: 'Three Colors', colors: [R, B, G], rounds: [[R], [G], [B], [R], [G]], shuffle: false, layout: 'arc', assisted: false },
  { index: 2, level: 1, stage: 3, nameAr: 'استيقاظ الحديقة', nameEn: 'Garden Awakening', colors: [G, R, B], rounds: [[G], [R], [B]], shuffle: false, layout: 'arc', assisted: false },
  { index: 3, level: 2, stage: 1, nameAr: 'أربعة ألوان', nameEn: 'Four Colors', colors: [R, B, G, Y], rounds: [[R], [Y], [B], [G], [Y], [R]], shuffle: false, layout: 'arc', assisted: false },
  { index: 4, level: 2, stage: 2, nameAr: 'تسلسل الألوان', nameEn: 'Color Sequence', colors: [R, B, G, Y], rounds: [[R, B], [G, Y], [B, G]], shuffle: false, layout: 'arc', assisted: false },
  { index: 5, level: 2, stage: 3, nameAr: 'ممرات الحديقة', nameEn: 'Garden Paths', colors: [R, B, P, G, Y], rounds: [[R], [B], [P], [G], [Y], [P]], shuffle: false, layout: 'path', assisted: false },
  { index: 6, level: 3, stage: 1, nameAr: 'مواضع متغيّرة', nameEn: 'Changing Positions', colors: [R, B, G, Y, P], rounds: [[Y], [P], [R], [G], [B], [P], [Y]], shuffle: true, layout: 'ring', assisted: false },
  { index: 7, level: 3, stage: 2, nameAr: 'خطوتان متتاليتان', nameEn: 'Two-Step Sequence', colors: [R, B, G, Y, P], rounds: [[R, P], [B, Y], [G, R], [P, G]], shuffle: false, layout: 'ring', assisted: true },
  { index: 8, level: 3, stage: 3, nameAr: 'أعِد الحديقة كاملة', nameEn: 'Restore the Garden', colors: [R, B, G, Y, P], rounds: [[R], [B, G], [Y, P]], shuffle: true, layout: 'ring', assisted: true },
];

export const stepsOf = (def: StageDef) => def.rounds.reduce((a, r) => a + r.length, 0);
export const TOTAL_OBJECTIVES = STAGES.reduce((a, s) => a + stepsOf(s), 0);

export const LEVEL_DIFFICULTY = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.ADVANCED] as const;
export const difficultyOf = (stageIndex: number): Difficulty => LEVEL_DIFFICULTY[Math.floor(stageIndex / 3)];

/** Visual world of each level. */
export const WORLD_NAMES = ['الحديقة المنسيّة', 'النافورة النائمة', 'الملاذ المسحور'] as const;
export const WORLD_NAMES_EN = ['The Forgotten Garden', 'The Sleeping Fountain', 'The Enchanted Sanctuary'] as const;
export const worldOf = (stageIndex: number): 0 | 1 | 2 => Math.floor(stageIndex / 3) as 0 | 1 | 2;

/**
 * The colors the therapist chooses to show (2..5). Colors beyond the cap are folded onto visible ones, so a stage always
 * stays completable with fewer targets.
 */
export function zoneColors(def: StageDef, cap: number): ColorId[] {
  return def.colors.slice(0, Math.max(2, Math.min(def.colors.length, cap)));
}
export function foldColor(def: StageDef, cap: number, c: ColorId): ColorId {
  const z = zoneColors(def, cap);
  return z.includes(c) ? c : z[def.colors.indexOf(c) % z.length];
}

export interface FlatStep {
  color: ColorId;
  round: number;
  /** Position inside its round (0 = first). */
  pos: number;
  roundLength: number;
}
/** The stage's objectives in order, with the cap applied. */
export function flatSteps(def: StageDef, cap: number): FlatStep[] {
  const out: FlatStep[] = [];
  def.rounds.forEach((round, r) => round.forEach((c, pos) => out.push({ color: foldColor(def, cap, c), round: r, pos, roundLength: round.length })));
  return out;
}
