import { Difficulty } from '@/lib/game';
import type { Config } from './config';
import { planConfigOf } from './config';
import { buildPlan, COURSES, type CourseId, type CpKind, type EventKind, type Plan, ROUTE_EVENTS } from './courses';

export type ThemeId = 'garden' | 'playground' | 'flowers' | 'beach' | 'festivalPark' | 'forest' | 'luminous' | 'town' | 'finale';
export type StarFx = 'sparkle' | 'confetti' | 'petals' | 'bubbles' | 'fireworks' | 'fireflies' | 'lanterns' | 'bells' | 'grand';

export interface StageDef {
  id: number;
  level: 1 | 2 | 3;
  stage: 1 | 2 | 3;
  nameAr: string;
  nameEn: string;
  goalAr: string;
  theme: ThemeId;
  fx: StarFx;
  course: CourseId;
  /** Default corridor width (course units). */
  width: number;
  /** Base checkpoint indexes of the stage's course that are stop markers. */
  stops: number[];
  /** Stop markers that are short optional holds (always shorter than a full stop). */
  optionalHolds: number[];
  /** Dynamic events: fire right after the checkpoint with this BASE index is confirmed. */
  events: { after: number; kind: EventKind }[];
}

export const LEVELS = [
  { level: 1, nameAr: 'الخطوات الأولى', nameEn: 'First Steps' },
  { level: 2, nameAr: 'مستكشف الطرق', nameEn: 'Path Explorer' },
  { level: 3, nameAr: 'سيّد الدوران', nameEn: 'Turning Master' },
] as const;

export const STAGES: readonly StageDef[] = [
  { id: 0, level: 1, stage: 1, nameAr: 'الحديقة المشمسة', nameEn: 'Sunny Garden', goalAr: 'امشِ للأمام على الممر الواسع واجمع نجمتين', theme: 'garden', fx: 'sparkle', course: 'straight', width: 4.4, stops: [], optionalHolds: [], events: [] },
  { id: 1, level: 1, stage: 2, nameAr: 'ملعب الألوان', nameEn: 'Colorful Playground', goalAr: 'امشِ حول المخروط وانعطف انعطافة لطيفة', theme: 'playground', fx: 'confetti', course: 'one', width: 3.2, stops: [], optionalHolds: [], events: [] },
  { id: 2, level: 1, stage: 3, nameAr: 'ممر الزهور', nameEn: 'Flower Walkway', goalAr: 'امشِ بين المخروطين بانعطافات متبادلة', theme: 'flowers', fx: 'petals', course: 'two', width: 2.8, stops: [], optionalHolds: [], events: [] },
  { id: 3, level: 2, stage: 1, nameAr: 'الشاطئ الذهبي', nameEn: 'Golden Beach', goalAr: 'اتبع المسار المنحني، يمينًا ثم يسارًا', theme: 'beach', fx: 'bubbles', course: 'curve', width: 3.2, stops: [], optionalHolds: [], events: [] },
  { id: 4, level: 2, stage: 2, nameAr: 'حديقة المهرجان', nameEn: 'Festival Park', goalAr: 'اتبع الدرب على شكل S حول عدة أقماع', theme: 'festivalPark', fx: 'fireworks', course: 'sShape', width: 3, stops: [], optionalHolds: [], events: [{ after: 1, kind: 'switch' }] },
  { id: 5, level: 2, stage: 3, nameAr: 'الغابة الودودة', nameEn: 'Friendly Forest', goalAr: 'قف عند العلامات ثم تابع بهدوء', theme: 'forest', fx: 'fireflies', course: 'stopgo', width: 2.8, stops: [1, 3], optionalHolds: [], events: [{ after: 0, kind: 'character' }, { after: 1, kind: 'gate' }] },
  { id: 6, level: 3, stage: 1, nameAr: 'الحديقة المضيئة', nameEn: 'Luminous Garden', goalAr: 'دوران عند عدة نقاط، مع وقفات قصيرة اختيارية', theme: 'luminous', fx: 'lanterns', course: 'turns', width: 2.8, stops: [], optionalHolds: [2, 4], events: [{ after: 1, kind: 'block' }, { after: 3, kind: 'light' }] },
  { id: 7, level: 3, stage: 2, nameAr: 'المدينة المصغّرة', nameEn: 'Miniature Town', goalAr: 'اختر الاتجاه الذي تدلّك عليه الأسهم الكبيرة', theme: 'town', fx: 'bells', course: 'town', width: 2.8, stops: [], optionalHolds: [], events: [{ after: 0, kind: 'character' }, { after: 1, kind: 'switch' }, { after: 3, kind: 'block' }] },
  { id: 8, level: 3, stage: 3, nameAr: 'مهرجان شمّوس', nameEn: 'Shumos Festival', goalAr: 'امشِ وانعطف وقف واجمع النجوم حتى الاحتفال الكبير', theme: 'finale', fx: 'grand', course: 'festival', width: 2.8, stops: [1, 5], optionalHolds: [], events: [{ after: 0, kind: 'light' }, { after: 1, kind: 'gate' }, { after: 2, kind: 'switch' }, { after: 4, kind: 'block' }, { after: 5, kind: 'character' }] },
];

export const difficultyOf = (stage: number): Difficulty => [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.ADVANCED][STAGES[stage].level - 1];
export const KIND_LABEL_AR: Record<CpKind, string> = { go: 'نجمة', stop: 'علامة توقّف', finish: 'النهاية' };
export const EVENT_LABEL_AR: Record<EventKind, string> = {
  light: 'إشارة مرور: انتظر ثم تابع',
  character: 'صديق الغابة يطلب الانتظار',
  gate: 'بوابة تُفتح بعد التوقف',
  switch: 'سهم يغيّر الاتجاه قبل المقطع التالي',
  block: 'جزء من الطريق يُغلق مؤقتًا',
  altStar: 'نجمة تظهر في مكان بديل',
};

const OPTIONAL_HOLD_MS = 2000;

export interface Schedule {
  plan: Plan;
  course: CourseId;
  stage: StageDef;
  kinds: CpKind[];
  /** Hold length per checkpoint (0 = none). */
  holdMs: number[];
  optional: boolean[];
  /** Event that fires after confirming checkpoint i (already downgraded to a plain wait when no safe alternate exists). */
  events: (EventKind | null)[];
  coneCount: number;
  customized: boolean;
}

const cache = new Map<string, Schedule>();

export function scheduleFor(stageIndex: number, config: Config): Schedule {
  const key = `${stageIndex}|${JSON.stringify([config.course, config.rot, config.mirror, config.width, config.spacing, config.density, config.stopMs, config.stops, config.events, config.cones, config.cpPos, config.start, config.finish, config.proj.rot, config.proj.inset])}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const stage = STAGES[stageIndex];
  const course: CourseId = config.course === 'auto' ? stage.course : config.course;
  const plan = buildPlan(course, planConfigOf(config, stage.width));
  const n = plan.cps.length;
  const sameCourse = course === stage.course;
  const defCount = COURSES[stage.course].cps.length;

  /** Maps a base index of the stage's own course to a final checkpoint index on whatever course is shown. */
  const map = (base: number): number => {
    if (sameCourse) return base < plan.baseToFinal.length ? plan.baseToFinal[base] : -1;
    if (n < 2) return -1;
    const idx = Math.round((base / Math.max(1, defCount - 1)) * (n - 1));
    return Math.min(idx, n - 2);
  };

  const kinds: CpKind[] = plan.kinds.slice();
  const holdMs = new Array<number>(n).fill(0);
  const optional = new Array<boolean>(n).fill(false);
  if (config.stops) {
    for (const b of stage.stops) {
      const i = map(b);
      if (i >= 0 && i < n - 1) { kinds[i] = 'stop'; holdMs[i] = config.stopMs; }
    }
    for (const b of stage.optionalHolds) {
      const i = map(b);
      if (i >= 0 && i < n - 1) { kinds[i] = 'stop'; holdMs[i] = Math.min(config.stopMs, OPTIONAL_HOLD_MS); optional[i] = true; }
    }
  }
  const events = new Array<EventKind | null>(n).fill(null);
  for (const e of stage.events) {
    const i = map(e.after);
    if (i < 0 || i >= n - 1 || events[i]) continue;
    let kind = e.kind;
    // a route event needs a safe alternate for the NEXT checkpoint; otherwise the child just gets the same wait without a route change
    if (ROUTE_EVENTS.includes(kind) && !plan.alts[i + 1]) kind = 'light';
    if (kind === 'altStar' && i + 1 >= n - 1) kind = 'light';
    events[i] = kind;
  }
  const customized = Object.keys(config.cones).length > 0 || Object.keys(config.cpPos).length > 0 || !!config.start || !!config.finish;
  const out: Schedule = { plan, course, stage, kinds, holdMs, optional, events, coneCount: plan.cones.length, customized };
  if (cache.size > 200) cache.clear();
  cache.set(key, out);
  return out;
}
