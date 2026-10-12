import { Difficulty } from '@/lib/game';
import type { Config } from './config';
import { buildRound, type BuildOpts, type Mode, type Round, type RoundSpec } from './sequence';

export type RewardKind = 'robot' | 'towers' | 'crystals' | 'core' | 'grand';

export interface StageDef {
  id: number;
  level: 1 | 2 | 3;
  stage: 1 | 2 | 3;
  nameAr: string;
  nameEn: string;
  goalAr: string;
  /** Level 1 is two lanes; levels 2 and 3 are three lanes. Never more. */
  lanes: 2 | 3;
  reward: RewardKind;
  rounds: readonly RoundSpec[];
}

export const LEVELS = [
  { level: 1, nameAr: 'تعلّم الحركة', nameEn: 'Learn the Movement' },
  { level: 2, nameAr: 'نسّق القدمين', nameEn: 'Coordinate the Feet' },
  { level: 3, nameAr: 'سيّد الحركة', nameEn: 'Movement Master' },
] as const;

const r = (mode: Mode, len: number, extra: Partial<RoundSpec> = {}): RoundSpec => ({ mode, len, ...extra });

export const STAGES: readonly StageDef[] = [
  { id: 0, level: 1, stage: 1, nameAr: 'الخطوات الأولى', nameEn: 'First Steps', goalAr: 'ممرّان فقط: حرّك القدم التي تظهر على العلامة نحو الممر المضيء، حركة واحدة في كل مرة', lanes: 2, reward: 'robot', rounds: [r('follow', 2), r('follow', 2), r('follow', 2), r('follow', 2)] },
  { id: 1, level: 1, stage: 2, nameAr: 'يمين ويسار', nameEn: 'Left and Right', goalAr: 'بدّل القدمين بالتناوب: يمين، يسار، يمين، يسار', lanes: 2, reward: 'towers', rounds: [r('alternate', 4), r('alternate', 4), r('alternate', 4), r('alternate', 4)] },
  { id: 2, level: 1, stage: 3, nameAr: 'تذكّر حركتين', nameEn: 'Remember Two', goalAr: 'شاهد حركتين ثم نفّذهما بالترتيب. يمكن الإعادة بلا أي عقاب', lanes: 2, reward: 'crystals', rounds: [r('remember', 2), r('remember', 2), r('remember', 2), r('remember', 2)] },
  { id: 3, level: 2, stage: 1, nameAr: 'ثلاثة اتجاهات', nameEn: 'Three Directions', goalAr: 'ثلاثة ممرّات: يسار ووسط ويمين، بالحركات التي يسمح بها المعالج', lanes: 3, reward: 'core', rounds: [r('follow', 2), r('follow', 2), r('follow', 2), r('follow', 2)] },
  { id: 4, level: 2, stage: 2, nameAr: 'قدم تبقى وقدم تتحرك', nameEn: 'One Foot Stays', goalAr: 'قدم تبقى في مكانها وقدم أخرى تتحرك، مع تبديل الجانبين', lanes: 3, reward: 'robot', rounds: [r('holdmove', 2), r('holdmove', 2), r('holdmove', 3), r('holdmove', 3)] },
  { id: 5, level: 2, stage: 3, nameAr: 'ثلاث حركات بالترتيب', nameEn: 'Three-Movement Sequence', goalAr: 'ثلاث حركات مرقّمة بالترتيب، مع تلميحات اختيارية وإمكانية الإعادة', lanes: 3, reward: 'towers', rounds: [r('follow', 3), r('follow', 3, { returns: true }), r('follow', 3), r('follow', 3, { returns: true })] },
  { id: 6, level: 3, stage: 1, nameAr: 'تحرّك وتوقّف', nameEn: 'Move and Stop', goalAr: 'تحرّك ثم توقّف ثم تابع. بلا أي سرعة، ووقفات قصيرة اختيارية', lanes: 3, reward: 'crystals', rounds: [r('stopgo', 3), r('stopgo', 3), r('stopgo', 3), r('stopgo', 3)] },
  { id: 7, level: 3, stage: 2, nameAr: 'تذكّر ونفّذ', nameEn: 'Remember and Perform', goalAr: 'شاهد ثلاث حركات ثم أعدها من الذاكرة، مع مساعدة اختيارية', lanes: 3, reward: 'core', rounds: [r('remember', 3), r('remember', 3), r('remember', 3, { returns: true }), r('remember', 3)] },
  { id: 8, level: 3, stage: 3, nameAr: 'التحدي الأخير', nameEn: 'Final Coordination Challenge', goalAr: 'يمين ويسار وتبديل ووسط وتذكّر ووقفة، كلها في تحدٍّ واحد', lanes: 3, reward: 'grand', rounds: [r('alternate', 4), r('remember', 3), r('holdmove', 3), r('stopgo', 3), r('remember', 4, { returns: true })] },
];

export const difficultyOf = (stage: number): Difficulty => [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.ADVANCED][STAGES[stage].level - 1];

export const MODE_LABEL_AR: Record<Mode, string> = {
  follow: 'اتبع الحركة',
  remember: 'شاهد وتذكّر',
  alternate: 'بدّل القدمين',
  holdmove: 'قدم تثبت وقدم تتحرك',
  stopgo: 'توقّف وتابع',
};

const cache = new Map<string, Round[]>();

/** The deterministic rounds of a stage under the therapist's settings. Memoised: the same inputs never rebuild. */
export function roundsFor(stage: number, config: Config, seed: number, salt: number): Round[] {
  const def = STAGES[stage];
  const key = `${stage}|${seed}|${salt}|${config.feet}|${config.allow.R}|${config.allow.L}|${config.holds ? config.holdMs : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const o: BuildOpts = { lanes: def.lanes, feet: config.feet, allow: config.allow, holdMs: config.holdMs, holds: config.holds, seed: seed + salt * 7919 };
  const out = def.rounds.map((spec, i) => buildRound(spec, i, stage, o));
  if (cache.size > 300) cache.clear();
  cache.set(key, out);
  return out;
}
