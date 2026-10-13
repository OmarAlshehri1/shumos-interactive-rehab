/** Three continuous areas. Milestones describe scenery, never exercise performance. */
export type LevelIndex = 0 | 1 | 2;
export interface Milestone { id: string; nameAr: string }
export interface LevelDef { index: LevelIndex; id: string; nameAr: string; nameEn: string; blurbAr: string; doneAr: string; milestones: readonly Milestone[] }
const milestones = (ids: string[], names: string[]): Milestone[] => ids.map((id, i) => ({ id, nameAr: names[i] }));
export const LEVELS: readonly LevelDef[] = [
 { index: 0, id: 'garden', nameAr: 'الحديقة الصغيرة', nameEn: 'The Little Garden', blurbAr: 'بذرة صغيرة، أزهار ملونة، وفراشات عند جدول هادئ.', doneAr: 'أزهرت حديقتك الصغيرة!', milestones: milestones(['sprout','sapling','flowers','blossom','butterflies','path','mushrooms','pond','meadow','garden'], ['البذرة تنبت','الشجرة الصغيرة','الأزهار الملونة','شجرة الورد','الفراشات','درب الزهور','الفطر الملون','بركة الماء','مرج أخضر','احتفال الحديقة']) },
 { index: 1, id: 'forest', nameAr: 'الغابة الساحرة', nameEn: 'The Enchanted Forest', blurbAr: 'تتسع حديقتك إلى غابة حية، بشلال وجسر وأصدقاء صغار.', doneAr: 'اكتملت غابتك الساحرة!', milestones: milestones(['woodland','waterfall','bridge','rabbits','deer','birds','clearing','ferns','grove','forest'], ['أشجار الغابة','الشلال','الجسر الخشبي','الأرانب','الغزال','الطيور','فسحة الزهور','السرخس','بستان الأشجار','حياة الغابة']) },
 { index: 2, id: 'kingdom', nameAr: 'مملكة الطبيعة', nameEn: 'The Kingdom of Nature', blurbAr: 'بحيرة متلألئة وشجرة عتيقة مضيئة في مملكة تنمو بإنجازاتك.', doneAr: 'أضاءت مملكة الطبيعة!', milestones: milestones(['lake','ancients','heart','glowflowers','falls','bridges','friends','fireflies','sanctuary','illumination'], ['البحيرة المتلألئة','الأشجار العتيقة','شجرة الحياة','زهور مضيئة','شلالات المملكة','جسور الطبيعة','أصدقاء الغابة','اليراعات','حدائق المملكة','الشجرة تضيء']) },
];
export const levelDef = (level: number) => LEVELS[Math.max(0, Math.min(2, Math.trunc(level)))];
export function levelProgress(level: number, done: number, target: number) {
 const total = levelDef(level).milestones.length;
 const t = Math.max(1, Number.isFinite(target) ? Math.trunc(target) : 10);
 const n = total * Math.max(0, Math.min(done, t));
 return { completed: Math.floor(n / t), partial: (n % t) / t, total };
}
export const PARTIAL_CAP = 0.9;
export function worldTargets(s: { level: number; done: number; target: number; complete: boolean; ready?: boolean }): number[][] {
 return LEVELS.map(def => {
  if (def.index < s.level) return def.milestones.map(() => 1);
  if (def.index > s.level) return def.milestones.map(() => 0);
  if (s.complete) return def.milestones.map(() => 1);
  const p = levelProgress(def.index, s.done, s.target);
  return def.milestones.map((_, i) => i < p.completed ? 1 : i === p.completed ? p.partial * PARTIAL_CAP : 0);
 });
}
export function focusMilestone(level: number, done: number, target: number) {
 const p = levelProgress(level, done, target);
 return Math.min(p.total - 1, p.partial > 0 ? p.completed : Math.max(0, p.completed - 1));
}
