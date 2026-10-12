'use client';
import { useMemo, useState } from 'react';
import { ASPECTS } from '@/lib/rhythmsteps3d/config';
import { currentStep, isSpawned, summary, type State, type Step } from '@/lib/rhythmsteps3d/engine';
import { LEVELS, STAGES } from '@/lib/rhythmsteps3d/stages';
import { FOOT_AR, laneHex, laneName } from '@/lib/rhythmsteps3d/captions';
import { FootIcon } from './FootIcon';
import { RhythmCanvas } from './RhythmCanvas';
import styles from './rhythm.module.css';

function StepChips({ step }: { step: Step }) {
  return (
    <>
      {step.targets.map((t, i) => (
        <span key={i} className={`${styles.chip} ${t.role === 'stay' ? styles.chipStay : ''}`} style={{ ['--c' as string]: laneHex(t.lane) }}>
          <FootIcon foot={t.foot} size={38} stay={t.role === 'stay'} />
          <span>
            {t.role === 'stay' ? 'ثبّت ' : t.role === 'hold' ? 'ثبّت ' : ''}
            {FOOT_AR[t.foot]}
          </span>
          <i aria-hidden="true" />
          <span>{laneName(t.lane)}</span>
        </span>
      ))}
    </>
  );
}

/**
 * Child-facing arena. Presentation only: it renders the state Control sent and never decides an outcome.
 * `connected` false (Control stopped writing) freezes the arena and says so: the stream never keeps moving while nobody is in charge.
 */
export function RhythmView({ state, full = false, connected = true }: { state: State; full?: boolean; connected?: boolean }) {
  const [blocked, setBlocked] = useState(false);
  const stage = STAGES[state.stage];
  const level = LEVELS[stage.level - 1];
  const cur = currentStep(state);
  const upcoming = state.steps.filter((s) => s.out === 'pending' && s !== cur && (!cur || s.arrival > cur.arrival));
  const nextStep = upcoming.find((s) => isSpawned(state, s)) ?? upcoming[0] ?? null;
  const caption = cur ?? (state.status === 'running' ? upcoming[0] ?? null : null);
  const sum = summary(state);
  const done = sum.confirmed + sum.assisted;
  const ratio = state.config.aspect === 'auto' ? null : ASPECTS[state.config.aspect];
  const dots = useMemo(() => {
    const byIndex = new Map<number, Step>();
    for (const s of state.steps) if (s.rep === 0 || !byIndex.has(s.i)) byIndex.set(s.i, s);
    return [...byIndex.values()].sort((a, b) => a.i - b.i);
  }, [state.steps]);
  const holding = cur?.kind === 'hold' && cur.holdAt >= 0;

  const overlay = !connected
    ? { icon: '⌛', title: 'بانتظار المعالج', text: 'خذ وقتك، ننتظر قليلًا', cls: '' }
    : state.status === 'paused'
      ? state.safety
        ? { icon: '🛡', title: 'توقّف للأمان', text: 'المعالج معك، لا شيء يتحرك الآن', cls: styles.safety }
        : { icon: '⏸', title: 'وقت الراحة', text: 'خذ وقتك، نحن معك', cls: '' }
      : state.status === 'ready'
        ? { icon: '✦', title: state.stage === 0 && state.stats[0].total === 0 ? 'نبض الألوان' : stage.nameAr, text: `المستوى ${stage.level} · المرحلة ${stage.stage} — ${stage.goalAr}`, cls: '' }
        : null;

  const inner = (
    <div className={styles.stageBox} style={ratio ? { aspectRatio: String(ratio), width: `min(100%, ${ratio * 100}vh)`, height: 'auto', maxHeight: '100%' } : undefined}>
      <div className={styles.canvasHost}>
        <RhythmCanvas state={state} connected={connected} onAudioBlocked={setBlocked} />
      </div>
      <div className={styles.hud}>
        <div className={styles.badge}>
          <strong>{`المستوى ${stage.level} · المرحلة ${stage.stage}`}</strong>
          <span>{stage.nameAr}</span>
          <span className={styles.dots} aria-hidden="true">
            {dots.map((s) => (
              <span key={s.id} className={`${styles.dot} ${s.out === 'confirmed' || s.out === 'assisted' ? styles.dotDone : s.out === 'skipped' || s.out === 'missed' ? styles.dotSkip : ''} ${s === cur ? styles.dotNow : ''}`} />
            ))}
          </span>
        </div>
        {state.status === 'running' && caption && connected && (
          <div className={styles.caption} data-testid="rs-caption">
            <StepChips step={caption} />
            {caption.kind === 'hold' && <span className={styles.hold}>{holding ? 'ثبّت…' : `${Math.round(caption.holdMs / 100) / 10} ث`}</span>}
            {caption.kind === 'jump' && <span className={styles.hold}>أو خطوة بالقدمين</span>}
          </div>
        )}
        {state.status === 'running' && nextStep && connected && (
          <div className={styles.next} aria-label="الهدف التالي">
            <small>التالي</small>
            {nextStep.targets.map((t, i) => (
              <span key={i} className={styles.nextDot} style={{ ['--c' as string]: laneHex(t.lane) }} />
            ))}
            <FootIcon foot={nextStep.targets.length > 1 ? 'BOTH' : nextStep.targets[0].foot} size={26} />
          </div>
        )}
        <div className={styles.brand}>SHUMOS CARE · نبض الألوان</div>
        {blocked && state.config.volume > 0 && (state.config.music || state.config.sfx) && (
          <button type="button" className={styles.sound} onClick={() => setBlocked(false)}>🔇 اضغط في أي مكان لتفعيل الصوت</button>
        )}
      </div>
      {overlay && (
        <div className={styles.overlay} role="status">
          <div className={`${styles.card} ${overlay.cls}`}>
            <div className={styles.icon} aria-hidden="true">{overlay.icon}</div>
            <h2>{overlay.title}</h2>
            <p>{overlay.text}</p>
          </div>
        </div>
      )}
      {state.status === 'stage-complete' && (
        <div className={styles.overlay} role="status">
          <div className={styles.card}>
            <div className={styles.icon} aria-hidden="true">★</div>
            <h2>أحسنت!</h2>
            <p>أكملنا «{stage.nameAr}» معًا</p>
            <div className={styles.stats}>
              <div className={styles.stat}><b>{state.stats[state.stage].confirmed + state.stats[state.stage].assisted}</b><span>حركة أنجزناها</span></div>
              <div className={styles.stat}><b>{state.completed.length}</b><span>من ٩ مراحل</span></div>
            </div>
            {state.stage < 8 && <p style={{ marginTop: '2vmin', opacity: 0.8 }}>التالي: {STAGES[state.stage + 1].nameAr}</p>}
          </div>
        </div>
      )}
      {state.status === 'ended' && (
        <div className={styles.overlay} role="status">
          <div className={styles.card}>
            <div className={styles.icon} aria-hidden="true">🏆</div>
            <h2>{state.completed.length === 9 ? 'أنت بطل النيون!' : 'رحلة رائعة!'}</h2>
            <p>شكرًا لك، تحرّكنا معًا اليوم</p>
            <div className={styles.stats}>
              <div className={styles.stat}><b>{done}</b><span>حركة أنجزناها</span></div>
              <div className={styles.stat}><b>{state.completed.length}</b><span>مراحل مكتملة</span></div>
              <div className={styles.stat}><b>{sum.twoFoot}</b><span>حركات بالقدمين</span></div>
              <div className={styles.stat}><b>{sum.hold}</b><span>ثبات</span></div>
            </div>
            <p style={{ marginTop: '2vmin', opacity: 0.7, fontSize: '0.8em' }}>{level.nameAr}</p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <section
      className={`${styles.world} ${full ? styles.full : ''} ${state.config.highContrast ? styles.hc : ''}`}
      lang="ar"
      dir="rtl"
      data-testid="rs-display"
      data-status={state.status}
      data-stage={state.stage}
      data-run={state.run}
      data-flow={state.config.flow}
      data-connected={connected ? '1' : '0'}
      data-safety={state.safety ? '1' : '0'}
      data-targets={state.steps.filter((s) => s.out === 'pending').length}
      data-clock={Math.round(state.clock)}
      data-confirmed={sum.confirmed}
      data-assisted={sum.assisted}
      data-current={cur?.id ?? ''}
      data-lanes={state.config.laneSet}
    >
      {inner}
    </section>
  );
}
