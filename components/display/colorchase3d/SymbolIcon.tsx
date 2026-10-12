import { COLORS, SYMBOL_PATHS, type ColorId } from '@/lib/colorchase3d/colors';

/** A color's shape on a plain round chip: the same symbol the floor zone shows, so a child can match shape as well as color. */
export function SymbolIcon({ color, className, title }: { color: ColorId; className?: string; title?: string }) {
  const c = COLORS[color];
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label={title ?? c.nameAr} data-color={color}>
      <circle cx="50" cy="50" r="48" fill={c.hex} stroke={c.deep} strokeWidth="4" />
      <path d={SYMBOL_PATHS[c.symbol]} transform="translate(17 17) scale(0.66)" fill="#fff" stroke={c.deep} strokeWidth="6" strokeLinejoin="round" paintOrder="stroke" />
    </svg>
  );
}
