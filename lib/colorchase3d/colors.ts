/**
 * The five garden colors. Every color also has its own SHAPE, so a child who cannot tell colors apart can still identify
 * a zone by its symbol. Colors are well separated in hue and lightness (no near-identical pairs).
 */
export const COLOR_IDS = ['red', 'blue', 'green', 'yellow', 'purple'] as const;
export type ColorId = (typeof COLOR_IDS)[number];
export type SymbolId = 'flower' | 'drop' | 'leaf' | 'sun' | 'gem';

export interface ColorDef {
  id: ColorId;
  nameAr: string;
  nameEn: string;
  hex: string;
  /** Darker edge tone used for rims and symbol outlines. */
  deep: string;
  symbol: SymbolId;
  symbolAr: string;
  /** What returns to the garden when this color is chosen. */
  restoresAr: string;
}

export const COLORS: Record<ColorId, ColorDef> = {
  red: { id: 'red', nameAr: 'الأحمر', nameEn: 'Red', hex: '#e63946', deep: '#8f1d2c', symbol: 'flower', symbolAr: 'زهرة', restoresAr: 'عادت الزهور الحمراء' },
  blue: { id: 'blue', nameAr: 'الأزرق', nameEn: 'Blue', hex: '#2f78f0', deep: '#173f93', symbol: 'drop', symbolAr: 'قطرة', restoresAr: 'عاد ماء النافورة الأزرق' },
  green: { id: 'green', nameAr: 'الأخضر', nameEn: 'Green', hex: '#2ea84f', deep: '#14612b', symbol: 'leaf', symbolAr: 'ورقة', restoresAr: 'عادت الأشجار والعشب الأخضر' },
  yellow: { id: 'yellow', nameAr: 'الأصفر', nameEn: 'Yellow', hex: '#f7b500', deep: '#9a6a00', symbol: 'sun', symbolAr: 'شمس', restoresAr: 'عاد الضوء الذهبي إلى الحديقة' },
  purple: { id: 'purple', nameAr: 'البنفسجي', nameEn: 'Purple', hex: '#8e44d8', deep: '#4e1c8a', symbol: 'gem', symbolAr: 'جوهرة', restoresAr: 'عادت الزهور السحرية البنفسجية' },
};

export const isColorId = (v: unknown): v is ColorId => typeof v === 'string' && (COLOR_IDS as readonly string[]).includes(v);

const f = (n: number) => Math.round(n * 100) / 100;
function star(points: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    pts.push(`${f(50 + Math.cos(a) * r)} ${f(50 + Math.sin(a) * r)}`);
  }
  return `M${pts.join(' L')} Z`;
}
function petals(n: number, dist: number, r: number): string {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const cx = 50 + Math.cos(a) * dist, cy = 50 + Math.sin(a) * dist;
    d += `M${f(cx + r)} ${f(cy)} A${r} ${r} 0 1 0 ${f(cx - r)} ${f(cy)} A${r} ${r} 0 1 0 ${f(cx + r)} ${f(cy)} Z `;
  }
  return d + `M${f(50 + 12)} 50 A12 12 0 1 0 ${f(50 - 12)} 50 A12 12 0 1 0 ${f(50 + 12)} 50 Z`;
}

/** Symbol outlines in a 100 x 100 box, shared by the Display (canvas Path2D) and Control (SVG). */
export const SYMBOL_PATHS: Record<SymbolId, string> = {
  flower: petals(5, 21, 17),
  drop: 'M50 8 C50 8 19 46 19 65 A31 31 0 0 0 81 65 C81 46 50 8 50 8 Z',
  leaf: 'M50 92 C18 72 10 38 16 12 C48 14 88 30 88 58 C88 78 70 90 50 92 Z',
  sun: star(10, 46, 30),
  gem: 'M50 6 L90 38 L50 94 L10 38 Z',
};
