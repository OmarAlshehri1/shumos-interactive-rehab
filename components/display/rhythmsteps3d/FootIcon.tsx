import type { Foot } from '@/lib/rhythmsteps3d/stages';

/** The same footprint the 3D targets use, as SVG for captions and the Control: left and right are mirror images, so they cannot be confused. */
function Print({ side, outline = false, x = 0, scale = 1 }: { side: 'L' | 'R'; outline?: boolean; x?: number; scale?: number }) {
  const m = side === 'L' ? 1 : -1;
  const stroke = outline ? { fill: 'none', stroke: '#f6f9ff', strokeWidth: 5 } : { fill: '#f6f9ff', stroke: '#0e082c', strokeWidth: 5 };
  return (
    <g transform={`translate(${x} 0) translate(50 100) scale(${m * scale} ${scale}) translate(-50 -100)`} {...stroke} strokeLinejoin="round">
      <ellipse cx="50" cy="128" rx="25" ry="40" />
      <ellipse cx="52" cy="98" rx="22" ry="34" />
      <ellipse cx="50" cy="70" rx="33" ry="40" />
      <circle cx="66" cy="24" r="14" />
      <circle cx="46" cy="17" r="10.5" />
      <circle cx="32" cy="24" r="9.5" />
      <circle cx="21" cy="36" r="8.5" />
      <circle cx="14" cy="50" r="7.5" />
    </g>
  );
}

export function FootIcon({ foot, size = 40, stay = false }: { foot: Foot; size?: number; stay?: boolean }) {
  const wide = foot === 'ANY' || foot === 'BOTH';
  return (
    <svg width={wide ? size * 1.35 : size * 0.62} height={size} viewBox={wide ? '-30 0 160 200' : '0 0 100 200'} aria-hidden="true" style={{ opacity: stay ? 0.85 : 1, flex: 'none' }}>
      {foot === 'L' && <Print side="L" outline={stay} />}
      {foot === 'R' && <Print side="R" outline={stay} />}
      {foot === 'BOTH' && (
        <>
          <Print side="L" x={-14} scale={0.92} />
          <Print side="R" x={14} scale={0.92} />
        </>
      )}
      {foot === 'ANY' && (
        <>
          <Print side="L" outline x={-14} scale={0.92} />
          <Print side="R" outline x={14} scale={0.92} />
        </>
      )}
    </svg>
  );
}
