import { Difficulty } from '@/lib/game';
import type { MazeId } from './mazes';

export type ThemeId = 'garden' | 'beach' | 'house' | 'forest' | 'festival' | 'butterfly' | 'crystal' | 'town' | 'palace';
export type StarFx = 'sparkle' | 'bubbles' | 'petals' | 'fireflies' | 'confetti' | 'butterflies' | 'crystals' | 'bells' | 'grand' | 'fireworks';
export type HintMode = 'always' | 'next' | 'none';

export interface StageDef {
  id: number;
  level: 1 | 2 | 3;
  stage: 1 | 2 | 3;
  nameAr: string;
  nameEn: string;
  goalAr: string;
  theme: ThemeId;
  fx: StarFx;
  maze: MazeId;
  /** Default corridor width (course units). */
  width: number;
  /** Route guidance the stage starts with (the therapist can override it). */
  hint: HintMode;
}

export const LEVELS = [
  { level: 1, nameAr: 'مستكشف صغير', nameEn: 'Little Explorer' },
  { level: 2, nameAr: 'مستكشف ذكي', nameEn: 'Smart Explorer' },
  { level: 3, nameAr: 'سيّد المتاهات', nameEn: 'Maze Master' },
] as const;

export const STAGES: readonly StageDef[] = [
  { id: 0, level: 1, stage: 1, nameAr: 'الحديقة المشمسة', nameEn: 'Sunny Garden', goalAr: 'امشِ في الممر الواسع وانعطف مرة واحدة حتى الوجهة', theme: 'garden', fx: 'sparkle', maze: 'garden', width: 2.4, hint: 'always' },
  { id: 1, level: 1, stage: 2, nameAr: 'الشاطئ الاستوائي', nameEn: 'Tropical Beach', goalAr: 'اختر أحد الطريقين: واحد فقط يصل إلى الوجهة', theme: 'beach', fx: 'bubbles', maze: 'beach', width: 2.0, hint: 'always' },
  { id: 2, level: 1, stage: 3, nameAr: 'البيت السحري', nameEn: 'Magical House', goalAr: 'تنقّل بين الغرف حتى تصل إلى غرفة النوم المضيئة', theme: 'house', fx: 'petals', maze: 'house', width: 1.7, hint: 'always' },
  { id: 3, level: 2, stage: 1, nameAr: 'الغابة الودودة', nameEn: 'Friendly Forest', goalAr: 'اتبع الأسهم عبر المنعطفات والمفترقات', theme: 'forest', fx: 'fireflies', maze: 'forest', width: 1.6, hint: 'always' },
  { id: 4, level: 2, stage: 2, nameAr: 'ملعب المهرجان', nameEn: 'Festival Playground', goalAr: 'قف في منطقة الانتظار حتى يبتعد الحارس الودود، ثم تابع', theme: 'festival', fx: 'confetti', maze: 'festival', width: 1.6, hint: 'next' },
  { id: 5, level: 2, stage: 3, nameAr: 'حديقة الفراشات', nameEn: 'Butterfly Garden', goalAr: 'اختر طريقك، وانتظر حين تعبر الفراشات', theme: 'butterfly', fx: 'butterflies', maze: 'butterfly', width: 1.6, hint: 'next' },
  { id: 6, level: 3, stage: 1, nameAr: 'عالم الكريستال', nameEn: 'Crystal World', goalAr: 'بوابات تُفتح بعد الانتظار، وطرق بديلة تتغيّر عند المحطات الآمنة', theme: 'crystal', fx: 'crystals', maze: 'crystal', width: 1.6, hint: 'none' },
  { id: 7, level: 3, stage: 2, nameAr: 'المدينة المصغّرة', nameEn: 'Miniature Town', goalAr: 'شوارع كثيرة وحارسان ودودان: خطّط طريقك وانتظر دورك', theme: 'town', fx: 'bells', maze: 'town', width: 1.6, hint: 'none' },
  { id: 8, level: 3, stage: 3, nameAr: 'قصر الألوان', nameEn: 'Color Palace', goalAr: 'الرحلة الكبرى: خطّط، انعطف، انتظر، وصِل إلى عرش الألوان', theme: 'palace', fx: 'grand', maze: 'palace', width: 1.5, hint: 'none' },
];

export const difficultyOf = (stage: number): Difficulty => [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.ADVANCED][STAGES[stage].level - 1];
