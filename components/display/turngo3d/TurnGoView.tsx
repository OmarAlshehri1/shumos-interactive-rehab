'use client';
import { useMemo, useState } from 'react';
import { guideOf, type Phase } from '@/lib/turngo3d/captions';
import { summary, starsCollected, stat, schedule, type State } from '@/lib/turngo3d/engine';
import { dist, routePoints, type Pt } from '@/lib/turngo3d/courses';
import { LEVELS, STAGES } from '@/lib/turngo3d/stages';
import { cmPerUnit } from '@/lib/turngo3d/projectionProfile';
import { TurnGoCanvas } from './TurnGoCanvas';
import styles from './turngo.module.css';

const PHASE_COLOR: Record<Phase, string> = { ready: '#7ff4ff', countdown: '#4aa8ff', go: '#3ddc84', wait: '#ffb020', hold: '#ff5a5f', complete: '#ffd23f', ended: '#ffd23f' };

/** Direction icons are drawn, not typed: the child reads shapes first, words second. */
function DirIcon({ kind }: { kind: 'straight' | 'left' | 'right' | 'stop' | 'wait' | 'star' }) {
  const stroke = { fill: 'none', stroke: '#fff', strokeWidth: 11, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <svg className={styles.icon} viewBox="0 0 100 100" aria-hidden="true">
      {kind === 'straight' && <><path d="M50 88 V20" {...stroke} /><path d="M26 42 L50 18 L74 42" {...stroke} /></>}
      {kind === 'left' && <><path d="M64 88 V56 Q64 34 40 34 H22" {...stroke} /><path d="M40 12 L18 34 L40 56" {...stroke} /></>}
      {kind === 'right' && <><path d="M36 88 V56 Q36 34 60 34 H78" {...stroke} /><path d="M60 12 L82 34 L60 56" {...stroke} /></>}
      {kind === 'stop' && <><polygon points="34,10 66,10 90,34 90,66 66,90 34,90 10,66 10,34" fill="#e63946" stroke="#fff" strokeWidth="6" /><rect x="26" y="44" width="48" height="12" rx="6" fill="#fff" /></>}
      {kind === 'wait' && <><path d="M30 14 H70 M30 86 H70 M34 14 Q34 50 50 50 Q66 50 66 14 M34 86 Q34 50 50 50 Q66 50 66 86" {...stroke} /></>}
      {kind === 'star' && <polygon points="50,8 61,38 93,38 67,57 77,89 50,70 23,89 33,57 7,38 39,38" fill="#ffc42e" stroke="#fff3b8" strokeWidth="5" strokeLinejoin="round" />}
    </svg>
  );
}

type Slot = 'bc' | 'tc' | 'bl' | 'br';
/**
 * The status pill goes to whichever floor edge slot the course uses least (bottom centre, top centre, bottom left,
 * bottom right), so it covers as little of the route, the stars and the cones as possible.
 */
function pillSlot(state: State): Slot {
  const plan = schedule(state).plan;
  const pts = routePoints(plan, state.route);
  const samples: Pt[] = [];
  for (let i = 1; i < pts.length; i++) { const n = Math.max(1, Math.ceil(dist(pts[i - 1], pts[i]) / 0.5)); for (let k = 0; k <= n; k++) samples.push([pts[i - 1][0] + ((pts[i][0] - pts[i - 1][0]) * k) / n, pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * k) / n]); }
  const half = plan.width / 2;
  const rects: Record<Slot, { x: [number, number]; top: boolean }> = { bc: { x: [-2.6, 2.6], top: false }, tc: { x: [-2.6, 2.6], top: true }, bl: { x: [-7.4, -2.2], top: false }, br: { x: [2.2, 7.4], top: false } };
  let best: Slot = 'bc', bestScore = Infinity;
  for (const slot of ['bc', 'tc', 'bl', 'br'] as Slot[]) {
    const r = rects[slot];
    const inside = (p: Pt, pad: number) => p[0] > r.x[0] - pad && p[0] < r.x[1] + pad && (r.top ? p[1] > 3.1 - pad : p[1] < -3.1 + pad);
    const score = samples.filter((p) => inside(p, half)).length + plan.cps.filter((p) => inside(p, 0.7)).length * 6 + plan.cones.filter((p) => inside(p, 0.6)).length * 4 + (inside(plan.start, 1.2) ? 6 : 0);
    if (score < bestScore - 0.5) { bestScore = score; best = slot; }
  }
  return best;
}

const TURN_ICON = { straight: 'straight', left: 'left', right: 'right' } as const;

/**
 * Child-facing floor view. Presentation only: it renders the state Control sent and never decides an outcome.
 * `connected` false (Control stopped writing) freezes the course and says so: nothing keeps moving while nobody is in charge.
 */
export function TurnGoView({ state, full = false, connected = true, muted = false }: { state: State; full?: boolean; connected?: boolean; muted?: boolean }) {
  const [blocked, setBlocked] = useState(false);
  const [clock, setClock] = useState(state.clock);
  const stage = STAGES[state.stage];
  const level = LEVELS[stage.level - 1];
  // the countdown / phase must follow the Display's own smooth clock, not the last published one (up to ~2 s old)
  const g = guideOf(state.status === 'running' ? { ...state, clock: Math.max(state.clock, clock) } : state);
  const st = stat(state);
  const stars = starsCollected(state);
  const sch = schedule(state);
  const total = st.res.length || sch.plan.cps.length;
  const slot = useMemo(() => pillSlot(state), [state.stage, state.config, state.route]); // eslint-disable-line react-hooks/exhaustive-deps
  const top = slot === 'tc';
  const sum = summary(state);
  const cm = cmPerUnit(state.config.proj);
  const running = state.status === 'running';
  const cd = running ? Math.ceil(Math.max(0, state.goAt - clock) / 1000) : 0;
  const holdLeft = state.hold ? Math.max(0, Math.ceil((state.hold.ms - (clock - state.hold.startedAt)) / 1000)) : 0;
  const phase: Phase = !connected && running ? 'wait' : g.phase;
  const iconKind: 'straight' | 'left' | 'right' | 'stop' | 'wait' | 'star' = phase === 'hold' ? 'stop' : phase === 'wait' ? 'wait' : phase === 'complete' || phase === 'ended' ? 'star' : TURN_ICON[g.turn];
  const minimal = state.config.minimalHud;

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
      data-testid="tg-display"
      data-status={state.status}
      data-stage={state.stage}
      data-run={state.run}
      data-phase={phase}
      data-cp={g.cp}
      data-stars={stars}
      data-total={total}
      data-turn={g.turn}
      data-next={g.next ?? ''}
      data-hold={state.hold ? '1' : '0'}
      data-wait={state.wait?.kind ?? ''}
      data-connected={connected ? '1' : '0'}
      data-safety={state.safety ? '1' : '0'}
      data-clock={Math.round(state.clock)}
      data-skipped={sum.skipped}
      data-theme={stage.theme}
      data-cones={sch.plan.cones.map((p) => p.map((v) => v.toFixed(2)).join(',')).join(';')}
      data-stars-xy={sch.plan.cps.map((p) => p.map((v) => v.toFixed(2)).join(',')).join(';')}
      data-route={Object.keys(state.route).join(',')}
      data-cue={state.cue?.n ?? 0}
      data-slot={slot}
      data-conestyle={state.config.coneStyle}
    >
      <div className={styles.stageBox}>
        <div className={styles.canvasHost}>
          <TurnGoCanvas state={state} connected={connected} muted={muted} onAudioBlocked={setBlocked} onClock={setClock} />
        </div>
        <div className={styles.hud}>
          {!minimal && (
            <div className={styles.badge}>
              <strong>{`المستوى ${stage.level} · المرحلة ${stage.stage}`}</strong>
              <span>{stage.nameAr}</span>
              <span className={styles.dots} aria-hidden="true">
                {st.res.map((r, i) => (
                  <span key={i} className={`${styles.dot} ${r === 'confirmed' || r === 'assisted' ? styles.dotDone : r === 'skipped' ? styles.dotSkip : ''} ${i === g.cp && state.status === 'running' ? styles.dotNow : ''}`} />
                ))}
              </span>
            </div>
          )}
          <div className={styles.starCount} data-testid="tg-stars" aria-label={`النجوم ${stars} من ${total}`}>
            <i aria-hidden="true">★</i>
            <span>{total ? `${stars}/${total}` : '—'}</span>
          </div>

          {(state.status === 'running' || state.status === 'paused') && connected && cd === 0 && (
            <div className={`${styles.pill} ${top ? styles.atTop : ''} ${slot === 'bl' ? styles.slotL : slot === 'br' ? styles.slotR : ''}`} style={{ ['--c' as string]: PHASE_COLOR[phase] }} data-testid="tg-pill" role="status">
              <DirIcon kind={iconKind} />
              <div className={styles.pillText}>
                <b>{g.label}</b>
                {!minimal && g.sub && <small>{g.sub}</small>}
              </div>
              {phase === 'hold' && <span className={styles.holdNum} data-testid="tg-holdnum">{holdLeft}</span>}
              <div className={styles.light} aria-hidden="true">
                <i className={`${styles.lamp} ${styles.lampR} ${phase === 'hold' ? styles.on : ''}`} />
                <i className={`${styles.lamp} ${styles.lampA} ${phase === 'wait' ? styles.on : ''}`} />
                <i className={`${styles.lamp} ${styles.lampG} ${phase === 'go' ? styles.on : ''}`} />
              </div>
            </div>
          )}

          {state.status === 'ready' && (
            <div className={`${styles.setup} ${top ? styles.atTop : ''}`} data-testid="tg-setup" role="status">
              <b>{stage.nameAr} · معاينة الإعداد</b>
              <span>{stage.goalAr}</span>
              <span>
                {st.res.length === 0 && 'ضع الأقماع الحقيقية على الدوائر المرقّمة، ثم يبدأ المعالج التمرين.'}
                {cm ? ` · المقياس التقريبي: الوحدة ≈ ${Math.round(cm)} سم` : ' · المسافات غير مقاسة بعد'}
              </span>
            </div>
          )}
          <div className={styles.brand}>SHUMOS CARE · تحدي الدوران</div>
          {blocked && state.config.volume > 0 && state.config.sound && !muted && (
            <button type="button" className={styles.sound} onClick={() => setBlocked(false)}>🔇 اضغط في أي مكان لتفعيل الصوت</button>
          )}
        </div>

        {running && connected && cd > 0 && (
          <div className={styles.overlay} role="status" data-testid="tg-countdown">
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
          <div className={styles.overlay} role="status" data-testid="tg-stagecomplete">
            <div className={styles.card}>
              <div className={styles.icon2} aria-hidden="true">★</div>
              <h2>أحسنت!</h2>
              <p>أكملنا «{stage.nameAr}» معًا</p>
              <div className={styles.stats}>
                <div className={styles.stat}><b>{stars}</b><span>نجمة جمعناها</span></div>
                <div className={styles.stat}><b>{state.completed.length}</b><span>من ٩ مراحل</span></div>
              </div>
              {state.stage < 8 && <p style={{ marginTop: '2vmin', opacity: 0.8 }}>التالي: {STAGES[state.stage + 1].nameAr}</p>}
            </div>
          </div>
        )}
        {state.status === 'ended' && (
          <div className={styles.overlay} role="status" data-testid="tg-ended">
            <div className={styles.card}>
              <div className={styles.icon2} aria-hidden="true">🏆</div>
              <h2>{state.completed.length === 9 ? 'أنت بطل الدوران!' : 'رحلة رائعة!'}</h2>
              <p>شكرًا لك، تحرّكنا معًا اليوم</p>
              <div className={styles.stats}>
                <div className={styles.stat}><b>{sum.confirmed + sum.assisted}</b><span>نجمة جمعناها</span></div>
                <div className={styles.stat}><b>{state.completed.length}</b><span>مراحل مكتملة</span></div>
                <div className={styles.stat}><b>{sum.holds}</b><span>وقفات</span></div>
              </div>
              <p style={{ marginTop: '2vmin', opacity: 0.7, fontSize: '0.8em' }}>{level.nameAr}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
