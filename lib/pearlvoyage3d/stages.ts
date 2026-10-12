import { Difficulty } from '@/lib/game';

/**
 * Pearl Voyage 3D stage data. Single source of truth for the deterministic engine AND the renderer:
 * world metres, x = east, y = north, heading 0 = north and grows clockwise toward east.
 * All art is original and procedural; nothing here is copied from another game.
 */
export type EnvId = 'pearl-beach' | 'coral-bay' | 'golden-archipelago';
export type SpeciesId = 'orange-stripe' | 'royal-blue' | 'butterfly' | 'puffer' | 'parrot' | 'angel' | 'dart' | 'ray' | 'seahorse' | 'dolphin' | 'turtle';

export interface Species {
    id: SpeciesId;
    nameAr: string;
    nameEn: string;
    /** badge colour used by the gallery */
    color: string;
    accent: string;
}
export const SPECIES: Record<SpeciesId, Species> = {
    'orange-stripe': { id: 'orange-stripe', nameAr: 'البرتقالية المخططة', nameEn: 'Marigold Reef Fish', color: '#ff8a2a', accent: '#fff6e6' },
    'royal-blue': { id: 'royal-blue', nameAr: 'الزرقاء الملكية', nameEn: 'Royal Blue Fish', color: '#2f6bff', accent: '#ffd23f' },
    butterfly: { id: 'butterfly', nameAr: 'الفراشة الصفراء', nameEn: 'Sun Butterfly Fish', color: '#ffd23f', accent: '#2a2a3a' },
    puffer: { id: 'puffer', nameAr: 'المنتفخة الوردية', nameEn: 'Rose Puffer', color: '#ff8fb1', accent: '#fff0f5' },
    parrot: { id: 'parrot', nameAr: 'الببغاء الأخضر', nameEn: 'Jade Parrotfish', color: '#27c58b', accent: '#ff7bd0' },
    angel: { id: 'angel', nameAr: 'الملاك البنفسجي', nameEn: 'Violet Angel', color: '#9b5cff', accent: '#ffe27a' },
    dart: { id: 'dart', nameAr: 'السهم الفضي', nameEn: 'Silver Dart', color: '#c9d8e8', accent: '#5fc8ff' },
    ray: { id: 'ray', nameAr: 'الراي الذهبي', nameEn: 'Golden Ray', color: '#f0b445', accent: '#fff3c4' },
    seahorse: { id: 'seahorse', nameAr: 'فرس البحر الفيروزي', nameEn: 'Turquoise Seahorse', color: '#27d3c3', accent: '#ffe27a' },
    dolphin: { id: 'dolphin', nameAr: 'الدلفين الودود', nameEn: 'Friendly Dolphin', color: '#7d9cc0', accent: '#eaf3fb' },
    turtle: { id: 'turtle', nameAr: 'السلحفاة الهادئة', nameEn: 'Calm Turtle', color: '#6cae5b', accent: '#e8c96a' },
};
export const SPECIES_ORDER: SpeciesId[] = ['orange-stripe', 'royal-blue', 'butterfly', 'puffer', 'parrot', 'angel', 'dart', 'ray', 'seahorse', 'dolphin', 'turtle'];

export interface Island {
    x: number;
    y: number;
    r: number;
    kind: 'sand' | 'rocky' | 'lush' | 'karst';
    seed: number;
}
export interface Reef {
    x: number;
    y: number;
    r: number;
    seed: number;
}
export interface MarkerDef {
    x: number;
    y: number;
    species: SpeciesId;
    /** hold-duration multiplier for this encounter (1 = the therapist's chosen hold time) */
    hold: number;
}
export interface Stage {
    name: string;
    nameEn: string;
    level: 1 | 2 | 3;
    env: EnvId;
    start: { x: number; y: number; heading: number };
    markers: MarkerDef[];
    islands: Island[];
    reefs: Reef[];
    /** suggested top speed in m/s before the therapist's cap */
    speed: number;
}

export const ENVIRONMENTS: Record<EnvId, { nameAr: string; nameEn: string }> = {
    'pearl-beach': { nameAr: 'شاطئ اللؤلؤ', nameEn: 'Pearl Beach' },
    'coral-bay': { nameAr: 'خليج المرجان', nameEn: 'Coral Bay' },
    'golden-archipelago': { nameAr: 'الأرخبيل الذهبي', nameEn: 'Golden Archipelago' },
};

const m = (x: number, y: number, species: SpeciesId, hold = 1): MarkerDef => ({ x, y, species, hold });

export const STAGES: readonly Stage[] = [
    // LEVEL 1 — PEARL BEACH
    { name: 'أول اكتشاف', nameEn: 'First Discovery', level: 1, env: 'pearl-beach', start: { x: 0, y: 0, heading: 0 }, speed: 3.6,
        markers: [m(6, 38, 'orange-stripe')],
        islands: [{ x: -40, y: 26, r: 13, kind: 'sand', seed: 11 }, { x: 46, y: 72, r: 17, kind: 'lush', seed: 12 }, { x: -30, y: 110, r: 22, kind: 'rocky', seed: 13 }],
        reefs: [{ x: 22, y: 20, r: 12, seed: 3 }] },
    { name: 'سمكتان في البحيرة', nameEn: 'Two Friends', level: 1, env: 'pearl-beach', start: { x: 0, y: 0, heading: 0 }, speed: 3.6,
        markers: [m(-14, 36, 'royal-blue'), m(18, 78, 'butterfly')],
        islands: [{ x: -52, y: 52, r: 15, kind: 'sand', seed: 21 }, { x: 52, y: 40, r: 13, kind: 'lush', seed: 22 }, { x: -6, y: 128, r: 24, kind: 'lush', seed: 23 }],
        reefs: [{ x: -20, y: 30, r: 11, seed: 4 }, { x: 28, y: 90, r: 10, seed: 5 }] },
    { name: 'قرب المرجان', nameEn: 'Near the Reef', level: 1, env: 'pearl-beach', start: { x: 0, y: 0, heading: 0 }, speed: 3.6,
        markers: [m(24, 34, 'puffer'), m(-8, 72, 'orange-stripe'), m(-34, 110, 'parrot')],
        islands: [{ x: -50, y: 30, r: 14, kind: 'sand', seed: 31 }, { x: 54, y: 90, r: 18, kind: 'lush', seed: 32 }, { x: 14, y: 140, r: 22, kind: 'rocky', seed: 33 }],
        reefs: [{ x: 30, y: 30, r: 13, seed: 6 }, { x: -12, y: 68, r: 12, seed: 7 }, { x: -38, y: 104, r: 13, seed: 8 }] },
    // LEVEL 2 — CORAL BAY
    { name: 'الخليج الواسع', nameEn: 'Wide Lagoon', level: 2, env: 'coral-bay', start: { x: 0, y: 0, heading: 0 }, speed: 4,
        markers: [m(-28, 44, 'angel'), m(30, 88, 'royal-blue'), m(-8, 132, 'seahorse')],
        islands: [{ x: 50, y: 30, r: 15, kind: 'rocky', seed: 41 }, { x: -62, y: 100, r: 18, kind: 'lush', seed: 42 }, { x: 62, y: 142, r: 20, kind: 'sand', seed: 43 }],
        reefs: [{ x: -30, y: 40, r: 14, seed: 9 }, { x: 34, y: 86, r: 13, seed: 10 }, { x: -10, y: 128, r: 14, seed: 11 }] },
    { name: 'الجزيرة الصغيرة', nameEn: 'Little Island', level: 2, env: 'coral-bay', start: { x: 0, y: 0, heading: 0 }, speed: 4,
        markers: [m(-32, 48, 'turtle', 1.15), m(36, 84, 'dart', 1.3), m(-6, 128, 'puffer', 1.4)],
        islands: [{ x: 62, y: 116, r: 15, kind: 'lush', seed: 51 }, { x: -64, y: 110, r: 16, kind: 'rocky', seed: 52 }, { x: 56, y: 24, r: 12, kind: 'sand', seed: 53 }],
        reefs: [{ x: -34, y: 46, r: 12, seed: 12 }, { x: 40, y: 80, r: 12, seed: 13 }, { x: -2, y: 124, r: 13, seed: 14 }] },
    { name: 'حول الشعاب', nameEn: 'Around the Reefs', level: 2, env: 'coral-bay', start: { x: 0, y: 0, heading: 0 }, speed: 4,
        markers: [m(30, 40, 'parrot'), m(-20, 80, 'angel'), m(34, 118, 'butterfly'), m(-14, 158, 'seahorse')],
        islands: [{ x: -58, y: 36, r: 14, kind: 'rocky', seed: 61 }, { x: 66, y: 86, r: 16, kind: 'lush', seed: 62 }, { x: -54, y: 130, r: 17, kind: 'sand', seed: 63 }],
        reefs: [{ x: 34, y: 38, r: 13, seed: 15 }, { x: -24, y: 78, r: 14, seed: 16 }, { x: 38, y: 116, r: 13, seed: 17 }, { x: -16, y: 154, r: 13, seed: 18 }] },
    // LEVEL 3 — GOLDEN ARCHIPELAGO
    { name: 'جزيرتان ذهبيتان', nameEn: 'Two Golden Islands', level: 3, env: 'golden-archipelago', start: { x: 0, y: 0, heading: 0 }, speed: 4.2,
        markers: [m(-30, 40, 'ray'), m(26, 82, 'dolphin'), m(-26, 124, 'royal-blue'), m(30, 166, 'orange-stripe')],
        islands: [{ x: 38, y: 36, r: 17, kind: 'karst', seed: 71 }, { x: -50, y: 98, r: 19, kind: 'lush', seed: 72 }, { x: 62, y: 130, r: 16, kind: 'rocky', seed: 73 }],
        reefs: [{ x: -34, y: 38, r: 12, seed: 19 }, { x: -30, y: 120, r: 12, seed: 20 }] },
    { name: 'أسماك مختلفة', nameEn: 'Varied Friends', level: 3, env: 'golden-archipelago', start: { x: 0, y: 0, heading: 0 }, speed: 4.2,
        markers: [m(28, 42, 'turtle', 0.7), m(-26, 86, 'angel', 1), m(30, 130, 'dolphin', 1.35), m(-12, 172, 'seahorse', 0.85)],
        islands: [{ x: -52, y: 40, r: 16, kind: 'lush', seed: 81 }, { x: 62, y: 98, r: 19, kind: 'karst', seed: 82 }, { x: -58, y: 140, r: 18, kind: 'sand', seed: 83 }],
        reefs: [{ x: 30, y: 40, r: 12, seed: 21 }, { x: -28, y: 84, r: 12, seed: 22 }, { x: -14, y: 168, r: 12, seed: 23 }] },
    { name: 'الرحلة الكبرى', nameEn: 'The Grand Voyage', level: 3, env: 'golden-archipelago', start: { x: 0, y: 0, heading: 0 }, speed: 4.4,
        markers: [m(-30, 44, 'dart'), m(28, 88, 'parrot'), m(-24, 132, 'ray'), m(34, 176, 'dolphin'), m(0, 222, 'turtle')],
        islands: [{ x: 44, y: 34, r: 15, kind: 'lush', seed: 91 }, { x: -62, y: 100, r: 20, kind: 'karst', seed: 92 }, { x: 66, y: 140, r: 17, kind: 'rocky', seed: 93 }, { x: -50, y: 190, r: 18, kind: 'lush', seed: 94 }, { x: 56, y: 214, r: 16, kind: 'sand', seed: 95 }],
        reefs: [{ x: -34, y: 42, r: 12, seed: 24 }, { x: 32, y: 86, r: 12, seed: 25 }, { x: -28, y: 130, r: 12, seed: 26 }] },
];
export const STAGE_COUNT = STAGES.length;
export const MAX_MARKERS = 5;
/** soft world limit: beyond this the boat is gently turned back, never stopped or punished */
export const WORLD_BOUND = 240;
export const WORLD_CENTER_Y = 100;
/** boats are softly pushed away from islands closer than r + ISLAND_MARGIN */
export const ISLAND_MARGIN = 4.5;
export const difficultyOf = (i: number): Difficulty => i < 3 ? Difficulty.EASY : i < 6 ? Difficulty.MEDIUM : Difficulty.ADVANCED;
export const stageNumberOf = (i: number) => (i % 3 + 1) as 1 | 2 | 3;
export const totalMarkers = () => STAGES.reduce((a, s) => a + s.markers.length, 0);
