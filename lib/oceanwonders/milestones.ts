/**
 * The three levels of ONE continuously growing ocean. There are no stages inside a level: a level is only a list of
 * growth milestones that the therapist-selected target is spread over. Pure data and pure maths, shared by the
 * Control (names, progress strip) and the Display (what to grow).
 */
export type LevelIndex = 0 | 1 | 2;

export interface Milestone {
  id: string;
  nameAr: string;
}
export interface LevelDef {
  index: LevelIndex;
  id: 'coral' | 'deep' | 'legend';
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
    id: 'coral',
    nameAr: 'الحديقة المرجانية',
    nameEn: 'The Coral Garden',
    blurbAr: 'من قاع رملي هادئ إلى حديقة مرجانية نابضة: مرجان ونباتات بحرية وأسماك استوائية وأصداف.',
    doneAr: 'اكتملت الحديقة المرجانية!',
    milestones: [
      { id: 'coral1', nameAr: 'مرجان صغير ينمو' },
      { id: 'plants', nameAr: 'نباتات بحرية ملونة' },
      { id: 'fish1', nameAr: 'أسماك استوائية' },
      { id: 'coral2', nameAr: 'مجموعة مرجانية جديدة' },
      { id: 'anemones', nameAr: 'شقائق البحر' },
      { id: 'school1', nameAr: 'أسماك ملونة تتجمع' },
      { id: 'shells', nameAr: 'أصداف زينة' },
      { id: 'reef1', nameAr: 'توسّع الشعاب' },
      { id: 'garden2', nameAr: 'نباتات وأسماك أكثر' },
      { id: 'bloom', nameAr: 'احتفال الحديقة' },
    ],
  },
  {
    index: 1,
    id: 'deep',
    nameAr: 'مملكة الأعماق',
    nameEn: 'Kingdom of the Deep',
    blurbAr: 'الحديقة تكبر: شعاب أكبر وسلاحف ودلافين وكهف مضيء وسفينة غارقة وأقواس حجرية.',
    doneAr: 'اكتملت مملكة الأعماق!',
    milestones: [
      { id: 'bigreef', nameAr: 'الشعاب الكبرى' },
      { id: 'turtle', nameAr: 'السلحفاة البحرية' },
      { id: 'dolphins', nameAr: 'الدلافين الودودة' },
      { id: 'cave', nameAr: 'الكهف المضيء' },
      { id: 'school2', nameAr: 'أسراب الأسماك' },
      { id: 'ship', nameAr: 'السفينة الغارقة' },
      { id: 'arch', nameAr: 'القوس الحجري' },
      { id: 'glow1', nameAr: 'النباتات المتوهجة' },
      { id: 'kelp', nameAr: 'غابة الأعشاب' },
      { id: 'friend', nameAr: 'صديق بحري جديد' },
      { id: 'panorama', nameAr: 'مشهد المملكة' },
    ],
  },
  {
    index: 2,
    id: 'legend',
    nameAr: 'المحيط الأسطوري',
    nameEn: 'The Legendary Ocean',
    blurbAr: 'محيط سحري مضيء: حوت ودود وقصر مرجاني وشعاب عملاقة ولآلئ متوهجة ومعلم كبير.',
    doneAr: 'اكتمل المحيط الأسطوري!',
    milestones: [
      { id: 'whale', nameAr: 'الحوت الودود' },
      { id: 'palace', nameAr: 'قصر المرجان' },
      { id: 'giants', nameAr: 'الشعاب العملاقة' },
      { id: 'school3', nameAr: 'أسراب لامعة' },
      { id: 'magic', nameAr: 'الحدائق السحرية' },
      { id: 'arches2', nameAr: 'أقواس البحر الكبرى' },
      { id: 'pearls', nameAr: 'اللآلئ المتوهجة' },
      { id: 'glow2', nameAr: 'نباتات متوهجة أكبر' },
      { id: 'dance', nameAr: 'رقصة الدلافين' },
      { id: 'landmark', nameAr: 'المعلم الأكبر' },
      { id: 'finale', nameAr: 'احتفال المحيط' },
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

/** Under-growth milestones never read as finished before they are: a partial build tops out here. */
export const PARTIAL_CAP = 0.9;

/**
 * Target growth value (0..1) of every milestone of every level: the single description of "what the world looks like".
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
