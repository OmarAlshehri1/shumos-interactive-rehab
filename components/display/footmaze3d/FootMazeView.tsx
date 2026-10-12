'use client';
import { useMemo, useState } from 'react';
import { guideOf, type Phase } from '@/lib/footmaze3d/captions';
import { dist, type Pt } from '@/lib/footmaze3d/mazes';
import { starsCollected, stat, summary, worldOf, type State } from '@/lib/footmaze3d/engine';
import { LEVELS, STAGES } from '@/lib/footmaze3d/stages';
import { cmPerUnit } from '@/lib/footmaze3d/projectionProfile';
import { FootMazeCanvas } from './FootMazeCanvas';
import styles from './footmaze.module.css';

const PHASE_COLOR: Record<Phase, string> = { ready: '#7ff4ff', countdown: '#4aa8ff', go: '#3ddc84', choose: '#4aa8ff', wait: '#ffb020', continue: '#3ddc84', complete: '#ffd23f', ended: '#ffd23f' };

/** Direction icons are drawn, not typed: the child reads shapes first, words second. */
function Icon({ kind }: { kind: 'straight' | 'left' | 'right' | 'back' | 'wait' | 'star' | 'choose' | 'go' }) {
  const stroke = { fill: 'none', stroke: '#fff', strokeWidth: 11, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <svg className={styles.icon} viewBox="0 0 100 100" aria-hidden="true">
      {kind === 'straight' && <><path d="M50 88 V20" {...stroke} /><path d="M26 42 L50 18 L74 42" {...stroke} /></>}
      {kind === 'left' && <><path d="M64 88 V56 Q64 34 40 34 H22" {...stroke} /><path d="M40 12 L18 34 L40 56" {...stroke} /></>}
      {kind === 'right' && <><path d="M36 88 V56 Q36 34 60 34 H78" {...stroke} /><path d="M60 12 L82 34 L60 56" {...stroke} /></>}
      {kind === 'back' && <><path d="M62 20 V54 Q62 76 40 76 H22" {...stroke} /><path d="M40 54 L18 76 L40 98" {...stroke} transform="translate(0,-10)" /></>}
      {kind === 'choose' && <><path d="M50 90 V52 M50 52 L22 24 M50 52 L78 24" {...stroke} /><path d="M12 36 L22 22 L36 30 M64 30 L78 22 L88 36" {...stroke} /></>}
      {kind === 'wait' && <path d="M30 14 H70 M30 86 H70 M34 14 Q34 50 50 50 Q66 50 66 14 M34 86 Q34 50 50 50 Q66 50 66 86" {...stroke} />}
      {kind === 'go' && <><path d="M18 50 H78" {...stroke} /><path d="M54 24 L80 50 L54 76" {...stroke} /></>}
      {kind === 'star' && <polygon points="50,8 61,38 93,38 67,57 77,89 50,70 23,89 33,57 7,38 39,38" fill="#ffc42e" stroke="#fff3b8" strokeWidth="5" strokeLinejoin="round" />}
    </svg>
  );
}

type Slot = 'bc' | 'tc' | 'bl' | 'br';
/**
 * The status pill goes to whichever floor slot the maze uses least, so it hides as little of the corridors as possible.
 * In a crowded maze it shrinks into a thin bar in the top or bottom margin.
 */
function pillSlot(state: State): { slot: Slot; compact: boolean } {
  const w = worldOf(state);
  const samples: Pt[] = [];
  for (const e of w.maze.edges) {
    const a = w.layout.pos[e.a], b = w.layout.pos[e.b], n = Math.max(1, Math.ceil(dist(a, b) / 0.4));
    for (let k = 0; k <= n; k++) samples.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  const hw = w.width / 2 + 0.1;
  const rects: Record<Slot, { x: [number, number]; y: [number, number] }> = {
    bc: { x: [-2, 2], y: [-4.5, -3.3] }, tc: { x: [-2, 2], y: [3.3, 4.5] },
    bl: { x: [-7.9, -3.8], y: [-4.5, -3.3] }, br: { x: [3.8, 7.9], y: [-4.5, -3.3] },
  };
  let best: Slot = 'bc', bestScore = Infinity;
  for (const slot of Object.keys(rects) as Slot[]) {
    const r = rects[slot];
    const score = samples.filter((p) => p[0] > r.x[0] - hw && p[0] < r.x[1] + hw && p[1] > r.y[0] - hw && p[1] < r.y[1] + hw).length + w.maze.nodes.filter((n) => { const p = w.layout.pos[n.id]; return p[0] > r.x[0] - 0.8 && p[0] < r.x[1] + 0.8 && p[1] > r.y[0] - 0.8 && p[1] < r.y[1] + 0.8; }).length * 5;
    if (score < bestScore - 0.5) { bestScore = score; best = slot; }
  }
  return { slot: best, compact: bestScore > 4 };
}

/**
 * Child-facing floor view. Presentation only: it renders the state Control sent and never decides an outcome.
 * `connected` false (Control stopped writing) freezes the maze and says so: nothing keeps moving while nobody is in charge.
 */
export function FootMazeView({ state, full = false, connected = true, muted = false }: { state: State; full?: boolean; connected?: boolean; muted?: boolean }) {
  const [blocked, setBlocked] = useState(false);
  const [clock, setClock] = useState(state.clock);
  const stage = STAGES[state.stage];
  const level = LEVELS[stage.level - 1];
  const sView = state.status === 'running' ? { ...state, clock: Math.max(state.clock, clock) } : state;
  const g = guideOf(sView);
  const st = stat(state);
  const stars = starsCollected(state);
  const w = worldOf(state);
  const total = st.res.length || w.maze.stars.length;
  const place = useMemo(() => pillSlot(state), [state.stage, state.config, state.fired]); // eslint-disable-line react-hooks/exhaustive-deps
  const top = place.slot === 'tc';
  const sum = summary(state);
  const cm = cmPerUnit(state.config.proj);
  const running = state.status === 'running';
  const cd = running ? Math.ceil(Math.max(0, state.goAt - clock) / 1000) : 0;
  const phase: Phase = !connected && running ? 'wait' : g.phase;
  const iconKind = phase === 'wait' ? 'wait' : phase === 'continue' ? 'go' : phase === 'choose' ? 'choose' : phase === 'complete' || phase === 'ended' ? 'star' : (g.turn ?? 'straight');
  const minimal = state.config.minimalHud;
  const warnings = w.layout.warnings;

  const overlay = !connected
    ? { icon: '⌛', title: 'بانتظار المعالج', text: 'خذ وقتك، ننتظر قليلًا', cls: '' }
    : state.status === 'paused'
      ? state.safety
        ? { icon: '🛡', title: 'توقّف للأمان', text: 'المعالج معك، لا شيء يتحرك الآن', cls: styles.safety }
        : { icon: '⏸', title: 'وقت الراحة', text: 'خذ وقتك، نحن معك', cls: '' }
      : null;

  return (
    <section
      className={`${styles.world} ${full ? styles.full : ''} ${state.config.highContrast ? styles.hc : ''}`}
      lang="ar"
      dir="rtl"
      data-testid="fm-display"
      data-status={state.status}
      data-stage={state.stage}
      data-run={state.run}
      data-phase={phase}
      data-stars={stars}
      data-total={total}
      data-at={state.trail.at(-1) ?? ''}
      data-heading={state.heading ?? ''}
      data-turn={g.turn ?? ''}
      data-act={state.act?.kind ?? ''}
      data-connected={connected ? '1' : '0'}
      data-safety={state.safety ? '1' : '0'}
      data-clock={Math.round(state.clock)}
      data-skipped={sum.skipped}
      data-theme={stage.theme}
      data-width={w.width}
      data-fired={state.fired.join(',')}
      data-closed={[...w.closed].join(',')}
      data-cue={state.cue?.n ?? 0}
      data-slot={place.slot}
      data-hint={w.hint}
    >
      <div className={styles.stageBox}>
        <div className={styles.canvasHost}>
          <FootMazeCanvas state={state} connected={connected} muted={muted} onAudioBlocked={setBlocked} onClock={setClock} />
        </div>
        <div className={styles.hud}>
          {!minimal && (
            <div className={styles.badge}>
              <strong>{`المستوى ${stage.level} · المرحلة ${stage.stage}`}</strong>
              <span>{stage.nameAr}</span>
              <span className={styles.dots} aria-hidden="true">
                {st.res.map((r, i) => (
                  <span key={i} className={`${styles.dot} ${r === 'confirmed' || r === 'assisted' ? styles.dotDone : r === 'skipped' ? styles.dotSkip : ''}`} />
                ))}
              </span>
            </div>
          )}
          <div className={styles.starCount} data-testid="fm-stars" aria-label={`النجوم ${stars} من ${total}`}>
            <i aria-hidden="true">★</i>
            <span>{total ? `${stars}/${total}` : '—'}</span>
          </div>

          {(state.status === 'running' || state.status === 'paused') && connected && cd === 0 && (
            <div className={`${styles.pill} ${place.compact ? styles.compact : ''} ${top ? styles.atTop : ''} ${place.slot === 'bl' ? styles.slotL : place.slot === 'br' ? styles.slotR : ''}`} style={{ ['--c' as string]: PHASE_COLOR[phase] }} data-testid="fm-pill" role="status">
              <Icon kind={iconKind} />
              <div className={styles.pillText}>
                <b>{g.label}</b>
                {!minimal && g.sub && <small>{g.sub}</small>}
              </div>
              <div className={styles.light} aria-hidden="true">
                <i className={`${styles.lamp} ${styles.lampR}`} />
                <i className={`${styles.lamp} ${styles.lampA} ${phase === 'wait' ? styles.on : ''}`} />
                <i className={`${styles.lamp} ${styles.lampG} ${phase === 'go' || phase === 'continue' || phase === 'choose' ? styles.on : ''}`} />
              </div>
            </div>
          )}

          {state.status === 'ready' && (
            <div className={styles.setup} data-testid="fm-setup" role="status">
              <b>{stage.nameAr} · معاينة المتاهة</b>
              <span>
                {cm ? `الوحدة ≈ ${Math.round(cm)} سم` : 'المسافات غير مقاسة بعد'}
                {warnings.length ? ` · ${warnings[0]}` : ''}
              </span>
            </div>
          )}
          <div className={styles.brand}>SHUMOS CARE · متاهة القدمين</div>
          {blocked && state.config.volume > 0 && state.config.sound && !muted && (
            <button type="button" className={styles.sound} onClick={() => setBlocked(false)}>🔇 اضغط في أي مكان لتفعيل الصوت</button>
          )}
        </div>

        {running && connected && cd > 0 && (
          <div className={styles.overlay} role="status" data-testid="fm-countdown">
            <div className={styles.countdown} key={cd}>{cd}</div>
          </div>
        )}
        {overlay && (
          <div className={styles.overlay} role="status">
            <div className={`${styles.card} ${overlay.cls}`}>
              <div className={styles.icon2} aria-hidden="true">{overlay.icon}</div>
              <h2>{overlay.title}</h2>
              <p>{overlay.text}</p>
            </div>
          </div>
        )}
        {state.status === 'stage-complete' && (
          <div className={styles.overlay} role="status" data-testid="fm-stagecomplete">
            <div className={styles.card}>
              <div className={styles.icon2} aria-hidden="true">★</div>
              <h2>أحسنت!</h2>
              <p>وصلنا إلى وجهة «{stage.nameAr}» معًا</p>
              <div className={styles.stats}>
                <div className={styles.stat}><b>{stars}</b><span>نجمة جمعناها</span></div>
                <div className={styles.stat}><b>{state.completed.length}</b><span>من ٩ مراحل</span></div>
              </div>
              {state.stage < 8 && <p style={{ marginTop: '2vmin', opacity: 0.8 }}>التالي: {STAGES[state.stage + 1].nameAr}</p>}
            </div>
          </div>
        )}
        {state.status === 'ended' && (
          <div className={styles.overlay} role="status" data-testid="fm-ended">
            <div className={styles.card}>
              <div className={styles.icon2} aria-hidden="true">🏆</div>
              <h2>{state.completed.length === 9 ? 'أنت سيّد المتاهات!' : 'رحلة رائعة!'}</h2>
              <p>شكرًا لك، مشينا معًا اليوم</p>
              <div className={styles.stats}>
                <div className={styles.stat}><b>{sum.confirmed + sum.assisted}</b><span>نجمة جمعناها</span></div>
                <div className={styles.stat}><b>{state.completed.length}</b><span>مراحل مكتملة</span></div>
                <div className={styles.stat}><b>{sum.waitsDone}</b><span>انتظارات</span></div>
              </div>
              <p style={{ marginTop: '2vmin', opacity: 0.7, fontSize: '0.8em' }}>{level.nameAr}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
