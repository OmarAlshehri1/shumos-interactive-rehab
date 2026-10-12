'use client';
import { layoutOf, tileStates, safeNeighbors, type State } from '@/lib/safehexarena3d/engine';
import { hexCorners } from '@/lib/safehexarena3d/geometry';
import styles from './control.module.css';

const FILL = { SAFE: '#2f72e6', WARNING: '#ffa21f', INACTIVE: '#1a2850', RESTORING: '#4b86e8' } as const;
const LABEL = { SAFE: 'آمنة', WARNING: 'تحذير', INACTIVE: 'غير فعّالة', RESTORING: 'تعود للأمان' } as const;

/**
 * Therapist tile map. Uses the same `tileCenter` as the Display, with the same orientation, so tile N is in the
 * same place on both screens. Tapping selects a tile; nothing is confirmed until a separate button is pressed.
 */
export function HexMap({ state, selected, onSelect }: { state: State; selected: number | null; onSelect: (tile: number) => void }) {
  const layout = layoutOf(state);
  const states = tileStates(state);
  const b = layout.bounds;
  const pad = 0.3;
  const hints = selected !== null && state.warn.includes(selected) ? new Set(safeNeighbors(state, selected)) : new Set<number>();
  return (
    <svg
      className={styles.map}
      viewBox={`${b.minX - pad} ${b.minY - pad} ${b.width + 2 * pad} ${b.height + 2 * pad}`}
      role="group"
      aria-label="خريطة البلاطات"
      data-testid="hex-map"
      data-layout={`${layout.tiles}:${layout.rows.join('-')}`}
      data-tiles={states.join(',')}
      style={{ direction: 'ltr' }}
    >
      <defs>
        <pattern id="hexWarn" width="0.3" height="0.3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="0.15" height="0.3" fill="rgba(70,32,0,0.55)" />
        </pattern>
      </defs>
      {states.map((st, i) => {
        const c = layout.centers[i];
        const pts = hexCorners(c, 0.94).map((p) => `${p.x},${p.y}`).join(' ');
        const isChild = state.childTile === i;
        const isSel = selected === i;
        const label = `البلاطة ${i + 1}، ${LABEL[st]}${isChild ? '، موقع الطفل' : ''}${isSel ? '، محددة' : ''}`;
        return (
          <g key={i} className={styles.tile} onClick={() => onSelect(i)} role="button" tabIndex={0} aria-label={label} aria-pressed={isSel} data-tile={i} data-state={st} data-child={isChild ? '1' : '0'}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(i); } }}>
            <polygon points={pts} fill={FILL[st]} opacity={st === 'INACTIVE' ? 0.55 : 1} stroke={isSel ? '#ffffff' : hints.has(i) ? '#7dffc4' : 'rgba(180,210,255,0.55)'} strokeWidth={isSel ? 0.1 : hints.has(i) ? 0.1 : 0.04} strokeDasharray={st === 'INACTIVE' ? '0.14 0.1' : hints.has(i) ? '0.12 0.08' : undefined} />
            {st === 'WARNING' && <polygon points={pts} fill="url(#hexWarn)" />}
            <text x={c.x} y={c.y - 0.28} textAnchor="middle" fontSize="0.34" fill="#fff" opacity="0.85" style={{ pointerEvents: 'none', fontWeight: 600 }}>{i + 1}</text>
            <text x={c.x} y={c.y + 0.3} textAnchor="middle" fontSize="0.42" fill="#fff" style={{ pointerEvents: 'none' }}>{st === 'WARNING' ? '⚠' : st === 'INACTIVE' ? '—' : isChild ? '👣' : ''}</text>
            {isChild && <polygon points={hexCorners(c, 0.99).map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#fff" strokeWidth="0.07" style={{ pointerEvents: 'none' }} />}
          </g>
        );
      })}
    </svg>
  );
}
