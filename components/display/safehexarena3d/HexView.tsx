'use client';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { layoutOf, tileStates, type State } from '@/lib/safehexarena3d/engine';
import { STAGES } from '@/lib/safehexarena3d/stages';
import { HexCanvas } from './HexCanvas';
import { useCue } from './useCue';
import styles from './hex.module.css';

/**
 * Child-facing arena. Presentation only: it renders the state Control sent and never decides an outcome.
 * `connected` false (Control stopped writing) shows every tile as safe: the arena never keeps dimming tiles
 * while nobody is in charge.
 */
export function HexView({ state, full = false, connected = true }: { state: State; full?: boolean; connected?: boolean }) {
  const def = STAGES[state.stage];
  const states = useMemo(() => tileStates(state), [state]);
  const layout = layoutOf(state);
  // Progress is extrapolated from the elapsed time in the received state using THIS device's clock only,
  // so a clock difference between the iPad and the projector laptop never matters.
  const received = useRef({ state, at: 0 });
  const connectedRef = useRef(connected);
  useEffect(() => {
    received.current = { state, at: performance.now() };
  }, [state]);
  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);
  const getProgress = useCallback(() => {
    const { state: s, at } = received.current;
    if (s.phase === 'inactive') return 1;
    if (s.phase !== 'warning') return 0;
    const live = s.status === 'running' && connectedRef.current ? performance.now() - at : 0;
    return Math.max(0, Math.min(1, (s.elapsed + live) / s.config.warnMs));
  }, []);

  useCue(state.config.sound && connected, `${state.stage}:${state.round}:${state.status === 'running' ? state.phase : 'idle'}`);

  const overlay = !connected
    ? { icon: '⌛', title: 'بانتظار المعالج', text: 'الأرضية آمنة، خذ وقتك', cls: '' }
    : state.status === 'paused'
      ? state.safety
        ? { icon: '🛡', title: 'توقّف للأمان', text: 'المعالج معك، لا شيء يتغيّر الآن', cls: styles.safety }
        : { icon: '⏸', title: 'وقت الراحة', text: 'خذ وقتك، نحن معك', cls: '' }
      : state.status === 'ready'
        ? { icon: '⬡', title: 'هيا نبدأ', text: 'ابقَ على البلاطة الزرقاء الآمنة', cls: '' }
        : state.status === 'stage-complete'
          ? { icon: '★', title: 'أحسنت!', text: 'أكملنا هذه المرحلة معًا', cls: '' }
          : state.status === 'ended'
            ? { icon: '★', title: 'رحلة رائعة!', text: 'شكرًا لك', cls: '' }
            : null;

  return (
    <section
      className={`${styles.world} ${full ? styles.full : ''} ${state.config.highContrast ? styles.hc : ''}`}
      lang="ar"
      dir="rtl"
      data-testid="hex-display"
      data-status={state.status}
      data-phase={state.phase}
      data-stage={state.stage}
      data-round={state.round}
      data-tiles={states.join(',')}
      data-layout={`${layout.tiles}:${layout.rows.join('-')}`}
      data-child={state.childTile ?? ''}
      data-safety={state.safety ? '1' : '0'}
      data-connected={connected ? '1' : '0'}
      data-view={state.config.view}
    >
      <div className={styles.canvas}>
        <HexCanvas layout={layout} states={states} getProgress={getProgress} childTile={state.childTile} allSafe={!connected} config={state.config} />
      </div>
      <div className={styles.badge}>
        <span>المستوى {def.level} · المرحلة {def.stage}</span>
        <span className={styles.dots} aria-hidden="true">
          {Array.from({ length: def.rounds }, (_, i) => (
            <span key={i} className={`${styles.dot} ${state.events.some((e) => e.stage === state.stage && e.round === i) ? styles.dotDone : ''} ${i === state.round && state.status === 'running' ? styles.dotNow : ''}`} />
          ))}
        </span>
      </div>
      <div className={styles.brand}>SHUMOS CARE</div>
      {overlay && (
        <div className={styles.overlay} role="status">
          <div className={`${styles.card} ${overlay.cls}`}>
            <div className={styles.icon} aria-hidden="true">{overlay.icon}</div>
            <h2>{overlay.title}</h2>
            <p>{overlay.text}</p>
          </div>
        </div>
      )}
    </section>
  );
}
