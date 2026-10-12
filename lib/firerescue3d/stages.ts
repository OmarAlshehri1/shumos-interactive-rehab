import { Difficulty } from '@/lib/game';
export interface Stage {
    name: string;
    nameEn: string;
    level: 1 | 2 | 3;
    environment: 'mountain' | 'forest' | 'countryside';
    length: number;
    curve: number;
    stops: number[];
    targets: number[];
    sequential: boolean;
    speed: number;
}
export const STAGES: readonly Stage[] = [
    { name: 'المهمة الأولى', nameEn: 'First Mission', level: 1, environment: 'mountain', length: 90, curve: 0, stops: [90], targets: [1], sequential: false, speed: 4 },
    { name: 'لف يمين', nameEn: 'Right Turn', level: 1, environment: 'mountain', length: 110, curve: 1, stops: [110], targets: [1], sequential: false, speed: 4 },
    { name: 'لف يسار', nameEn: 'Left Turn', level: 1, environment: 'mountain', length: 110, curve: -1, stops: [110], targets: [1], sequential: false, speed: 4 },
    { name: 'طريق الغابة', nameEn: 'Winding Road', level: 2, environment: 'forest', length: 155, curve: 2, stops: [155], targets: [1], sequential: false, speed: 5 },
    { name: 'وجّه الماء', nameEn: 'Water Control', level: 2, environment: 'forest', length: 95, curve: 0.4, stops: [95], targets: [2], sequential: false, speed: 4 },
    { name: 'إنقاذ مزدوج', nameEn: 'Double Rescue', level: 2, environment: 'forest', length: 125, curve: -0.6, stops: [125], targets: [2], sequential: true, speed: 5 },
    { name: 'رحلة الجبل', nameEn: 'Mountain Route', level: 3, environment: 'countryside', length: 210, curve: 2.4, stops: [210], targets: [2], sequential: false, speed: 5 },
    { name: 'قيادة وإطفاء', nameEn: 'Steering & Hose', level: 3, environment: 'countryside', length: 180, curve: -2, stops: [85, 180], targets: [1, 2], sequential: false, speed: 5 },
    { name: 'مهمة الإنقاذ الأخيرة', nameEn: 'Final Rescue', level: 3, environment: 'countryside', length: 240, curve: 2.6, stops: [75, 155, 240], targets: [1, 2, 2], sequential: true, speed: 5 },
];
export const difficultyOf = (i: number): Difficulty => i < 3 ? Difficulty.EASY : i < 6 ? Difficulty.MEDIUM : Difficulty.ADVANCED;
/** Original road centre; distance in metres, right-positive lateral axis. Same definition for renderer and simulation. */
export function roadX(stage: number, distance: number): number {
    const d = STAGES[stage];
    const u = Math.max(0, Math.min(1.2, distance / d.length));
    return Math.abs(d.curve) <= 1 ? d.curve * 28 * (1 - Math.cos(u * Math.PI)) : d.curve * 12 * Math.sin(u * Math.PI * 1.7) * Math.sin(u * Math.PI * 0.5);
}
export const roadHeading = (stage: number, distance: number) => Math.atan2(roadX(stage, distance + 0.2) - roadX(stage, distance - 0.2), 0.4);
export const targetAim = (index: number, count: number) => ({ x: count === 1 ? 0 : index === 0 ? -0.55 : 0.55, y: 0.12 });
