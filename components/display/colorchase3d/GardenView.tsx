'use client';
import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { COLOR_IDS, COLORS, type ColorId } from '@/lib/colorchase3d/colors';
import { layoutOf, objectiveStates, restoration, stepsFor, stepsOfStage, targetOf, zonesFor, zonesOf, type State } from '@/lib/colorchase3d/engine';
import { STAGES, WORLD_NAMES, worldOf } from '@/lib/colorchase3d/stages';
import { GardenCanvas } from './GardenCanvas';
import type { GardenFrame, GardenSpec } from './scene';
import { SymbolIcon } from './SymbolIcon';
import { useChime } from './useChime';
import styles from './garden.module.css';

const cssColor = (c: ColorId) => ({ '--c': COLORS[c].hex }) as CSSProperties;

/**
 * Child-facing Lost Colors garden. Presentation only: it renders the state Control sent and never decides an outcome.
 * `connected` false (Control stopped writing) shows a calm garden with nothing highlighted and a waiting card.
 */
export function GardenView({ state, full = false, connected = true }: { state: State; full?: boolean; connected?: boolean }) {
  const def = STAGES[state.stage];
  const layout = layoutOf(state);
  const world = worldOf(state.stage);
  const c = state.config;
  const steps = stepsFor(state);
  const target = targetOf(state);
  const rest = useMemo(() => restoration(state), [state]);
  const states = useMemo(() => objectiveStates(state), [state]);
  const zones = useMemo(() => zonesOf(state), [state]);
  const specKey = [world, state.stage, state.seed, c.aspect, c.margin, c.zoneScale, c.spacing, c.reach, c.maxColors, c.quality, state.run].join(':');
  const spec: GardenSpec = useMemo(() => ({ world, layout, stage: state.stage, seed: state.seed, config: c }), [world, layout, state.stage, state.seed, c]);

  // A completed objective celebrates where it was chosen. The Display detects it from the record (a new accepted event), never from a timer.
  const success = useRef<{ n: number; slot: number; color: ColorId }>({ n: 0, slot: 0, color: 'red' });
  const seen = useRef({ key: `${state.sessionId}:${state.run}`, len: state.events.length });
  const playChime = useChime(c.sound && connected);
  useEffect(() => {
    const key = `${state.sessionId}:${state.run}`;
    if (seen.current.key !== key) { seen.current = { key, len: state.events.length }; return; }
    if (state.events.length > seen.current.len) {
      const last = state.events[state.events.length - 1];
      if (last.kind !== 'skipped' && last.stage === state.stage) {
        const st = stepsOfStage(last.stage, c.maxColors)[last.step];
        const at = zonesFor(last.stage, state.seed, c, st.round);
        success.current = { n: success.current.n + 1, slot: Math.max(0, at.findIndex((z) => z.color === st.color)), color: st.color };
        playChime();
      }
    }
    seen.current.len = state.events.length;
  }, [state, c, playChime]);

  const latest = useRef({ state, connected });
  useEffect(() => { latest.current = { state, connected }; }, [state, connected]);
  const getFrame = useCallback((): GardenFrame => {
    const { state: s, connected: online } = latest.current;
    const st = stepsFor(s);
    const cur = st[Math.min(s.step, st.length - 1)];
    const next = cur && cur.pos < cur.roundLength - 1 ? st[s.step + 1] : null;
    const tgt = targetOf(s);
    const r = restoration(s);
    return {
      zones: zonesOf(s).map((z) => z.color),
      target: tgt ? tgt.color : null,
      hint: tgt && next ? next.color : null,
      restore: r.colors,
      overall: r.overall,
      cue: s.repeats + s.nudge,
      success: success.current,
      allIdle: !online || s.status === 'ready' || s.status === 'ended',
      frozen: s.status === 'paused',
      config: s.config,
    };
  }, []);

  const overlay = !connected
    ? { icon: '⌛', title: 'بانتظار المعالج', text: 'الحديقة هادئة، خذ وقتك', cls: '' }
    : state.status === 'paused'
      ? state.safety
        ? { icon: '🛡', title: 'توقّف للأمان', text: 'المعالج معك، لا شيء يتغيّر الآن', cls: styles.safety }
        : { icon: '⏸', title: 'وقت الراحة', text: 'خذ وقتك، نحن معك', cls: '' }
      : state.status === 'ready'
        ? { icon: '🌈', title: 'الألوان ضاعت من الحديقة', text: 'هيا نعيدها معًا، لونًا بعد لون', cls: '' }
        : state.status === 'stage-complete'
          ? { icon: '★', title: 'عادت الألوان!', text: state.completed.includes(state.stage) ? 'الحديقة تنبض بالحياة من جديد' : 'أحسنت، أكملنا هذه المرحلة معًا', cls: '' }
          : state.status === 'ended'
            ? { icon: '★', title: 'رحلة رائعة في الحديقة!', text: 'شكرًا لك', cls: '' }
            : null;

  const ask = connected && target && (state.status === 'running') ? target : null;
  const round = ask ? steps.filter((x) => x.round === ask.round) : [];
  const roundStart = ask ? steps.findIndex((x) => x.round === ask.round) : 0;

  return (
    <section
      className={`${styles.world} ${full ? styles.full : ''} ${c.highContrast ? styles.hc : ''}`}
      lang="ar"
      dir="rtl"
      data-testid="garden-display"
      data-status={state.status}
      data-stage={state.stage}
      data-step={state.step}
      data-world={world}
      data-target={target?.color ?? ''}
      data-zones={zones.map((z) => z.color).join(',')}
      data-objectives={states.join(',')}
      data-restored={COLOR_IDS.map((x) => rest.colors[x].toFixed(2)).join(',')}
      data-overall={rest.overall.toFixed(2)}
      data-safety={state.safety ? '1' : '0'}
      data-connected={connected ? '1' : '0'}
      data-view={c.view}
      data-cue={state.repeats + state.nudge}
      data-accepted={state.events.length}
      data-symbols={c.symbols ? '1' : '0'}
    >
      <div className={styles.canvas}>
        <GardenCanvas spec={spec} specKey={specKey} getFrame={getFrame} />
      </div>
      <div className={styles.badge}>
        <span>{WORLD_NAMES[world]} · المرحلة {def.level}-{def.stage} · {def.nameAr}</span>
        <span className={styles.dots} aria-hidden="true">
          {steps.map((_, i) => (
            <span key={i} className={`${styles.dot} ${i === state.step && state.status === 'running' ? styles.dotNow : ''}`} style={states[i] === 'DONE' ? { background: COLORS[steps[i].color].hex } : undefined} />
          ))}
        </span>
      </div>
      {ask && (
        <div className={styles.ask} style={cssColor(ask.color)} data-testid="ask" data-color={ask.color} role="status" aria-live="polite">
          <SymbolIcon color={ask.color} className={styles.askSym} />
          <span className={styles.askText}>اختر {COLORS[ask.color].nameAr}</span>
          {round.length > 1 && (
            <span className={styles.pips} data-testid="pips">
              {round.map((r, i) => {
                const idx = roundStart + i;
                const done = states[idx] === 'DONE';
                const now = idx === state.step;
                const hint = !done && !now && c.assist === 'high';
                return (
                  <span key={i} className={`${styles.pip} ${done ? styles.pipDone : ''} ${now ? styles.pipNow : ''} ${hint ? styles.pipHint : ''}`} style={cssColor(r.color)} data-pip={done ? 'done' : now ? 'now' : hint ? 'hint' : 'later'}>
                    {done || now || hint ? '' : '؟'}
                  </span>
                );
              })}
            </span>
          )}
        </div>
      )}
      <div className={styles.restored} aria-hidden="true">
        {COLOR_IDS.map((x) => <span key={x} className={`${styles.rdot} ${rest.colors[x] >= 0.99 ? styles.rdotOn : ''}`} style={cssColor(x)} />)}
      </div>
      <div className={styles.brand}>SHUMOS CARE</div>
      {overlay && (
        <div className={`${styles.overlay} ${state.status === 'ready' && connected ? styles.soft : ''}`} role="status">
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
