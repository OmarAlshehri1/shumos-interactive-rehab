'use client';
import { COLORS, SYMBOL_PATHS, type ColorId } from '@/lib/colorchase3d/colors';
import { layoutOf, objectiveStates, restoration, targetOf, zonesOf, type State } from '@/lib/colorchase3d/engine';
import { STAGES } from '@/lib/colorchase3d/stages';
import styles from './control.module.css';

/**
 * Therapist map of the floor zones. It draws the SAME layout the Display draws (same pure function of the shared state,
 * same coordinates, same orientation), so zone N is in the same place on both, and it shows the same restoration.
 * The therapist taps the zone the child chose, then confirms with the dedicated button: a tap alone never resolves anything.
 */
export function ZoneMap({ state, picked, onPick, disabled }: { state: State; picked: ColorId | null; onPick: (c: ColorId) => void; disabled: boolean }) {
  const layout = layoutOf(state);
  const zones = zonesOf(state);
  const target = targetOf(state);
  const rest = restoration(state);
  const states = objectiveStates(state);
  const def = STAGES[state.stage];
  const u = layout.usable;
  return (
    <svg className={styles.map} viewBox={`0 0 ${layout.worldW} ${layout.worldH}`} role="group" aria-label="خريطة المناطق الملوّنة على الأرض" data-testid="zone-map" data-zones={zones.map((z) => z.color).join(',')} data-target={target?.color ?? ''} data-picked={picked ?? ''} data-layout={def.layout} data-restored={Object.values(rest.colors).map((v) => v.toFixed(2)).join(',')} data-objectives={states.join(',')} style={{ direction: 'ltr', maxHeight: '58vh' }}>
      <defs>
        <radialGradient id="cc-garden" cx="50%" cy="45%" r="75%">
          <stop offset="0" stopColor="#5f8f4a" />
          <stop offset="1" stopColor="#2f5a35" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width={layout.worldW} height={layout.worldH} rx="0.3" fill="url(#cc-garden)" />
      <rect x={u.x0} y={u.y0} width={u.x1 - u.x0} height={u.y1 - u.y0} fill="none" stroke="#c8e6a8" strokeWidth="0.05" strokeDasharray="0.25 0.18" opacity="0.6" />
      {[...zones].sort((a, b) => a.x - b.x).map((z, i, arr) => i > 0 && <line key={`l${i}`} x1={arr[i - 1].x} y1={arr[i - 1].y} x2={z.x} y2={z.y} stroke="#d8c9a0" strokeWidth="0.35" strokeLinecap="round" opacity="0.35" />)}
      {zones.map((z) => {
        const c = COLORS[z.color];
        const isTarget = target?.color === z.color && state.status !== 'ready';
        const isPicked = picked === z.color;
        const r = z.r;
        return (
          <g
            key={z.slot}
            className={`${styles.zone} ${isPicked ? styles.picked : ''}`}
            data-testid={`zone-${z.color}`}
            data-slot={z.slot}
            data-color={z.color}
            data-target={isTarget ? '1' : '0'}
            data-picked={isPicked ? '1' : '0'}
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-pressed={isPicked}
            aria-disabled={disabled}
            aria-label={`المنطقة ${c.nameAr}${isTarget ? '، اللون المطلوب الآن' : ''}`}
            onClick={() => !disabled && onPick(z.color)}
            onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPick(z.color); } }}
          >
            {isTarget && <circle cx={z.x} cy={z.y} r={r * 1.12} fill="none" stroke="#fff6c8" strokeWidth="0.16" strokeDasharray="0.45 0.3" />}
            <circle className="hit" cx={z.x} cy={z.y} r={r} fill={c.hex} stroke={isPicked ? '#ffffff' : c.deep} strokeWidth={isPicked ? 0.26 : 0.1} opacity={0.95} />
            <circle cx={z.x} cy={z.y} r={r * 0.86} fill="none" stroke="#ffffff" strokeWidth="0.05" opacity="0.5" />
            <g transform={`translate(${z.x - r * 0.46} ${z.y - r * 0.62}) scale(${(r * 0.92) / 100})`}>
              <path d={SYMBOL_PATHS[c.symbol]} fill="#fff" stroke={c.deep} strokeWidth="7" strokeLinejoin="round" paintOrder="stroke" />
            </g>
            <text x={z.x} y={z.y + r * 0.62} textAnchor="middle" fontSize={r * 0.36} fontWeight="800" fill="#fff" stroke={c.deep} strokeWidth={r * 0.07} paintOrder="stroke" style={{ pointerEvents: 'none' }}>{c.nameAr}</text>
            {isPicked && <text x={z.x} y={z.y - r * 0.78} textAnchor="middle" fontSize={r * 0.34} fill="#fff" style={{ pointerEvents: 'none' }}>✓ مختارة</text>}
          </g>
        );
      })}
    </svg>
  );
}
