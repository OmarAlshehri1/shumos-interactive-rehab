'use client';
import { pathOf, stoneStates, type State } from '@/lib/footsteps3d/engine';
import { STAGES } from '@/lib/footsteps3d/stages';
import styles from './control.module.css';

const FILL = { DONE: '#2f9e6a', SKIPPED: '#5a6478', TARGET: '#f2b632', NEXT: '#a58a46', IDLE: '#8a8f99' } as const;
const LABEL = { DONE: 'تمّت', SKIPPED: 'تُجوِّزت', TARGET: 'الهدف الحالي', NEXT: 'التالي', IDLE: 'قادمة' } as const;

/**
 * Therapist map of the stepping stones. It draws the SAME path the Display draws (same pure function of the shared
 * state, same coordinates, same orientation), so stone N is in the same place on both. Display only: the therapist
 * confirms the child's step with the dedicated buttons, never by tapping the map.
 */
export function StoneMap({ state }: { state: State }) {
  const path = pathOf(state);
  const states = stoneStates(state);
  const def = STAGES[state.stage];
  const { usable: u } = path;
  return (
    <svg className={styles.map} viewBox={`0 0 ${path.worldW} ${path.worldH}`} role="group" aria-label="خريطة الأحجار" data-testid="stone-map" data-stones={states.join(',')} data-count={path.stones.length} data-pattern={def.pattern} style={{ direction: 'ltr', maxHeight: '58vh' }}>
      <rect x="0" y="0" width={path.worldW} height={path.worldH} rx="0.3" fill="#12301f" />
      <rect x={u.x0} y={u.y0} width={u.x1 - u.x0} height={u.y1 - u.y0} fill="none" stroke="#6fae45" strokeWidth="0.05" strokeDasharray="0.25 0.18" opacity="0.7" />
      <polyline points={path.stones.map((s) => `${s.x},${s.y}`).join(' ')} fill="none" stroke="#d8c37a" strokeWidth="0.09" strokeDasharray="0.3 0.22" opacity="0.55" />
      {path.stones.map((s, i) => {
        const st = states[i];
        const current = st === 'TARGET';
        return (
          <g key={i} data-stone={i} data-state={st} aria-label={`الحجر ${i + 1}، ${LABEL[st]}`}>
            <circle cx={s.x} cy={s.y} r={path.radius} fill={FILL[st]} stroke={current ? '#fff3cf' : 'rgba(255,255,255,0.35)'} strokeWidth={current ? 0.16 : 0.05} opacity={st === 'SKIPPED' ? 0.55 : 1} />
            {current && <circle cx={s.x} cy={s.y} r={path.radius * 1.18} fill="none" stroke="#ffd36a" strokeWidth="0.06" opacity="0.8" />}
            <text x={s.x} y={s.y + path.radius * 0.18} textAnchor="middle" fontSize={path.radius * 0.8} fontWeight="700" fill={current ? '#2a1c00' : '#ffffff'} style={{ pointerEvents: 'none' }}>{i + 1}</text>
            {st === 'DONE' && <text x={s.x} y={s.y - path.radius * 0.35} textAnchor="middle" fontSize={path.radius * 0.5} fill="#fff" style={{ pointerEvents: 'none' }}>✓</text>}
            {s.foot && <text x={s.x} y={s.y + path.radius * 0.78} textAnchor="middle" fontSize={path.radius * 0.38} fill={current ? '#2a1c00' : '#e8ffe8'} style={{ pointerEvents: 'none' }}>{s.foot === 'RIGHT' ? 'يمين' : 'يسار'}</text>}
          </g>
        );
      })}
    </svg>
  );
}
