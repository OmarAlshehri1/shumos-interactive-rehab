'use client';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { pathOf, stoneStates, type State } from '@/lib/footsteps3d/engine';
import { STAGES, worldOf } from '@/lib/footsteps3d/stages';
import { FootCanvas } from './FootCanvas';
import type { ForestFrame, ForestSpec } from './scene';
import { useChime } from './useChime';
import styles from './foot.module.css';

/**
 * Child-facing Enchanted Forest. Presentation only: it renders the state Control sent and never decides an outcome.
 * `connected` false (Control stopped writing) shows a calm forest with nothing highlighted and a waiting card.
 */
export function FootView({ state, full = false, connected = true }: { state: State; full?: boolean; connected?: boolean }) {
  const def = STAGES[state.stage];
  const path = pathOf(state);
  const world = worldOf(state.stage);
  const c = state.config;
  const states = useMemo(() => stoneStates(state), [state]);
  const specKey = [world, state.stage, state.seed, c.aspect, c.margin, c.stoneScale, c.spacing, c.reach, c.quality, state.run].join(':');
  const spec: ForestSpec = useMemo(() => ({ world, path, stage: state.stage, seed: state.seed, config: c }), [world, path, state.stage, state.seed, c]);

  // A confirmed step celebrates on its stone. The Display detects it from the record (a new accepted event), never from a timer.
  const success = useRef({ n: 0, stone: 0 });
  const seen = useRef({ key: `${state.sessionId}:${state.run}`, len: state.events.length });
  const playChime = useChime(c.sound && connected);
  useEffect(() => {
    const key = `${state.sessionId}:${state.run}`;
    if (seen.current.key !== key) { seen.current = { key, len: state.events.length }; return; }
    if (state.events.length > seen.current.len) {
      const last = state.events[state.events.length - 1];
      if (last.kind !== 'skipped' && last.stage === state.stage) { success.current = { n: success.current.n + 1, stone: last.step }; playChime(); }
    }
    seen.current.len = state.events.length;
  }, [state, playChime]);

  // Preview progress is extrapolated from the elapsed time in the received record with THIS device's clock only.
  const received = useRef({ state, at: 0 });
  const connectedRef = useRef(connected);
  useEffect(() => { received.current = { state, at: performance.now() }; }, [state]);
  useEffect(() => { connectedRef.current = connected; }, [connected]);
  const getFrame = useCallback((): ForestFrame => {
    const { state: s, at } = received.current;
    const running = s.status === 'running' && connectedRef.current;
    const progress = s.phase === 'preview' ? Math.min(1, (s.elapsed + (running ? performance.now() - at : 0)) / s.config.previewMs) : 0;
    const d = STAGES[s.stage];
    return {
      states: stoneStates(s), step: s.step, phase: s.phase, previewProgress: progress, pairStart: s.step - (s.step % 2), isMemory: d.pairs,
      hideTarget: d.pairs && !s.config.memoryAssist && s.phase === 'step', cue: s.cue, success: success.current,
      allIdle: !connectedRef.current || s.status === 'ready' || s.status === 'ended', frozen: s.status === 'paused', config: s.config,
    };
  }, []);

  const overlay = !connected
    ? { icon: '⌛', title: 'بانتظار المعالج', text: 'الغابة هادئة، خذ وقتك', cls: '' }
    : state.status === 'paused'
      ? state.safety
        ? { icon: '🛡', title: 'توقّف للأمان', text: 'المعالج معك، لا شيء يتغيّر الآن', cls: styles.safety }
        : state.rest
          ? { icon: '🌿', title: 'وقت الراحة', text: 'خذ نفسًا هادئًا، نكمل حين تكون مستعدًا', cls: '' }
          : { icon: '⏸', title: 'وقت الراحة', text: 'خذ وقتك، نحن معك', cls: '' }
      : state.status === 'ready'
        ? { icon: '✦', title: 'هيا نمشي على الأحجار', text: 'ابحث عن الحجر المضيء', cls: '' }
        : state.status === 'stage-complete'
          ? { icon: '★', title: 'أحسنت!', text: 'وصلنا إلى آخر حجر معًا', cls: '' }
          : state.status === 'ended'
            ? { icon: '★', title: 'رحلة رائعة في الغابة!', text: 'شكرًا لك', cls: '' }
            : null;

  return (
    <section
      className={`${styles.world} ${full ? styles.full : ''} ${c.highContrast ? styles.hc : ''}`}
      lang="ar"
      dir="rtl"
      data-testid="foot-display"
      data-status={state.status}
      data-phase={state.phase}
      data-stage={state.stage}
      data-step={state.step}
      data-stones={states.join(',')}
      data-world={world}
      data-safety={state.safety ? '1' : '0'}
      data-rest={state.rest ? '1' : '0'}
      data-connected={connected ? '1' : '0'}
      data-view={c.view}
      data-cue={state.cue}
      data-hidden={def.pairs && !c.memoryAssist && state.phase === 'step' ? '1' : '0'}
      data-accepted={state.events.length}
    >
      <div className={styles.canvas}>
        <FootCanvas spec={spec} specKey={specKey} getFrame={getFrame} />
      </div>
      <div className={styles.badge}>
        <span>المستوى {def.level} · المرحلة {def.stage}</span>
        <span className={styles.dots} aria-hidden="true">
          {Array.from({ length: def.steps }, (_, i) => (
            <span key={i} className={`${styles.dot} ${state.events.some((e) => e.stage === state.stage && e.step === i) ? styles.dotDone : ''} ${i === state.step && state.status === 'running' ? styles.dotNow : ''}`} />
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
