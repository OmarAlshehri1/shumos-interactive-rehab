import { LANES, activeLanes } from '@/lib/rhythmsteps3d/config';
import { currentStep, progressOf, type State } from '@/lib/rhythmsteps3d/engine';
import { FootIcon } from '@/components/display/rhythmsteps3d/FootIcon';
import styles from './control.module.css';

const LINE = 84; // % from the top where targets reach the child

/**
 * A flat schematic of the stream (not a second 3D scene): lanes left to right exactly as the child sees them, the
 * incoming targets moving down toward the line. The therapist reads it at a glance and acts with the buttons.
 */
export function LaneMap({ state }: { state: State }) {
  const lanes = activeLanes(state.config);
  const w = 100 / lanes.length;
  const cur = currentStep(state);
  return (
    <div className={styles.map} data-testid="rs-map" aria-label="خريطة المسارات: اليسار كما يراه الطفل">
      {lanes.map((id, i) => (
        <div key={id} className={styles.lane} style={{ left: `${i * w}%`, width: `${w}%` }}>
          <div className={styles.zone} style={{ ['--c' as string]: LANES[id].hex, top: `${LINE - 4}%`, left: '12%', right: '12%' }} />
          <div className={styles.laneName}>{LANES[id].nameAr}</div>
        </div>
      ))}
      <div className={styles.line} style={{ top: `${LINE}%` }} />
      {state.steps.map((st) => {
        const p = progressOf(st.arrival, state.clock, state.stage);
        if (st.out !== 'pending' || p < 0) return null;
        return st.targets.map((t, ti) => {
          const li = lanes.indexOf(t.lane);
          if (li < 0) return null;
          const top = Math.min(LINE, Math.max(0, p * LINE)) - 2;
          return (
            <div
              key={`${st.id}#${ti}`}
              className={`${styles.tgt} ${st === cur ? styles.tgtNow : ''} ${t.role === 'stay' ? styles.tgtStay : ''}`}
              style={{ ['--c' as string]: LANES[t.lane].hex, top: `${top}%`, left: `${li * w + w * 0.14}%`, width: `${w * 0.72}%` }}
              data-testid="rs-map-target"
            >
              <FootIcon foot={t.foot} size={22} stay={t.role === 'stay'} />
              {st.seq && <span style={{ marginInlineStart: 4 }}>{st.seq[1] + 1}</span>}
              {st.kind === 'hold' && <span style={{ marginInlineStart: 4 }}>⏱</span>}
            </div>
          );
        });
      })}
      <span style={{ position: 'absolute', top: 6, right: 8, fontSize: 11, opacity: 0.6, direction: 'rtl' }}>اليسار ← اليمين كما يراه الطفل</span>
    </div>
  );
}
