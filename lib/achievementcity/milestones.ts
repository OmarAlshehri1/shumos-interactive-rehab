/**
 * The three levels of ONE continuously growing city. There are no stages inside a level: a level is only a list of
 * construction milestones that the therapist-selected target is spread over. Pure data and pure maths, shared by the
 * Control (names, progress strip) and the Display (what to build).
 */
export type LevelIndex = 0 | 1 | 2;

export interface Milestone {
  id: string;
  nameAr: string;
}
export interface LevelDef {
  index: LevelIndex;
  id: 'village' | 'city' | 'grand';
  nameAr: string;
  nameEn: string;
  blurbAr: string;
  /** Spoken / shown when the level is complete. */
  doneAr: string;
  milestones: readonly Milestone[];
}

export const LEVELS: readonly LevelDef[] = [
  {
    index: 0,
    id: 'village',
    nameAr: 'القرية الجميلة',
    nameEn: 'The Beautiful Village',
    blurbAr: 'من أرض خضراء هادئة إلى قرية نابضة: بيوت وطريق ومزرعة وسوق وملعب ونافورة.',
    doneAr: 'اكتملت القرية الجميلة!',
    milestones: [
      { id: 'cottage1', nameAr: 'الكوخ الأول' },
      { id: 'path', nameAr: 'طريق القرية' },
      { id: 'cottage2', nameAr: 'الكوخ الثاني' },
      { id: 'farm', nameAr: 'المزرعة' },
      { id: 'garden', nameAr: 'الأشجار والزهور' },
      { id: 'market', nameAr: 'سوق القرية' },
      { id: 'playground', nameAr: 'ملعب الأطفال' },
      { id: 'fountain', nameAr: 'النافورة' },
      { id: 'houses', nameAr: 'بيوت جديدة' },
      { id: 'festival', nameAr: 'احتفال القرية' },
    ],
  },
  {
    index: 1,
    id: 'city',
    nameAr: 'المدينة المتطورة',
    nameEn: 'The Growing City',
    blurbAr: 'القرية تكبر: طرق واسعة وعمارات ومدرسة ومستشفى وجسر وميناء ومطار.',
    doneAr: 'اكتملت المدينة المتطورة!',
    milestones: [
      { id: 'roads', nameAr: 'الطرق الكبرى' },
      { id: 'apartments', nameAr: 'العمارات السكنية' },
      { id: 'school', nameAr: 'المدرسة' },
      { id: 'hospital', nameAr: 'المستشفى' },
      { id: 'mall', nameAr: 'منطقة التسوق' },
      { id: 'park', nameAr: 'الحديقة العامة' },
      { id: 'bridge', nameAr: 'الجسر' },
      { id: 'port', nameAr: 'الميناء' },
      { id: 'districts', nameAr: 'الأحياء السكنية' },
      { id: 'airport', nameAr: 'المطار' },
      { id: 'clocktower', nameAr: 'برج الساعة' },
    ],
  },
  {
    index: 2,
    id: 'grand',
    nameAr: 'المدينة الكبرى',
    nameEn: 'The Grand City',
    blurbAr: 'مدينة عصرية مضيئة: ناطحات سحاب وبرج شامخ وملعب وقطار وواجهة بحرية.',
    doneAr: 'اكتملت المدينة الكبرى!',
    milestones: [
      { id: 'towers', nameAr: 'ناطحات السحاب' },
      { id: 'landmark', nameAr: 'برج المدينة' },
      { id: 'stadium', nameAr: 'الملعب الكبير' },
      { id: 'metro', nameAr: 'القطار' },
      { id: 'port2', nameAr: 'توسعة الميناء' },
      { id: 'parks', nameAr: 'الحدائق الكبرى' },
      { id: 'bridge2', nameAr: 'الجسر المعلّق' },
      { id: 'skyline', nameAr: 'الأفق التجاري' },
      { id: 'airport2', nameAr: 'المطار المتطور' },
      { id: 'waterfront', nameAr: 'الواجهة البحرية' },
      { id: 'lights', nameAr: 'أضواء المدينة' },
    ],
  },
];

export const levelDef = (l: number): LevelDef => LEVELS[Math.max(0, Math.min(2, l))];

/** How far a level's list of milestones has advanced for `done` of `target` confirmations (integer arithmetic only). */
export function levelProgress(level: number, done: number, target: number): { completed: number; partial: number; total: number } {
  const total = levelDef(level).milestones.length;
  const d = Math.max(0, Math.min(done, target));
  const num = total * d;
  return { completed: Math.floor(num / target), partial: (num % target) / target, total };
}

/** Under-construction milestones never read as finished before they are: a partial build tops out here. */
export const PARTIAL_CAP = 0.9;

/**
 * Target build value (0..1) of every milestone of every level: the single description of "what the world looks like".
 * Levels before the current one are a COMPLETED VISUAL BASELINE (they say nothing about recorded achievements).
 */
export function worldTargets(state: { level: number; done: number; target: number; complete: boolean; ready?: boolean }): number[][] {
  return LEVELS.map((def) => {
    if (def.index < state.level) return def.milestones.map(() => 1);
    if (def.index > state.level) return def.milestones.map(() => 0);
    if (state.complete) return def.milestones.map(() => 1);
    const { completed, partial } = levelProgress(def.index, state.done, state.target);
    return def.milestones.map((_, i) => (i < completed ? 1 : i === completed && partial > 0 ? partial * PARTIAL_CAP : 0));
  });
}

/** Index of the milestone currently being built or most recently completed (for camera focus and the toast). */
export function focusMilestone(level: number, done: number, target: number): number {
  const { completed, partial, total } = levelProgress(level, done, target);
  if (done <= 0) return 0;
  return Math.min(total - 1, partial > 0 ? completed : Math.max(0, completed - 1));
}
