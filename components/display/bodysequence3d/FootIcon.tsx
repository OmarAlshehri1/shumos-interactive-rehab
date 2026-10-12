import type { Foot, Lane } from '@/lib/bodysequence3d/sequence';
import { footTransform, SOLE_PATH, TOES, TREAD } from './glyph';

/** Vector footprint for the DOM: same shape as the floor glyph, so the instruction and the floor always agree. */
export function FootIcon({ foot, color = '#ffb347', fill = 'rgba(255,154,31,0.3)', className, title }: { foot: Foot; color?: string; fill?: string; className?: string; title?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 190" role="img" aria-label={title ?? (foot === 'R' ? 'القدم اليمنى' : 'القدم اليسرى')} data-foot={foot}>
      <g transform={footTransform(foot)} fill={fill} stroke={color} strokeWidth="6" strokeLinejoin="round" strokeLinecap="round">
        <path d={SOLE_PATH} />
        {TOES.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} />)}
        <g fill="none" strokeWidth="3.4">{TREAD.map((d, i) => <path key={i} d={d} />)}</g>
      </g>
    </svg>
  );
}

const ARROW: Record<Lane, string> = { L: 'M82 50 H20 M44 26 L18 50 L44 74', R: 'M18 50 H80 M56 26 L82 50 L56 74', C: 'M50 84 V18 M26 42 L50 16 L74 42', H: 'M50 14 V80 M26 58 L50 84 L74 58' };

/** Direction arrow from the child's side (never mirrored): left = ←, right = →, centre = ↑, neutral = ↓. */
export function ArrowIcon({ lane, color = '#fff', className }: { lane: Lane; color?: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <path d={ARROW[lane]} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <polygon points="31,8 69,8 92,31 92,69 69,92 31,92 8,69 8,31" fill="#e63946" stroke="#fff" strokeWidth="6" />
      <rect x="24" y="44" width="52" height="12" rx="6" fill="#fff" />
    </svg>
  );
}
