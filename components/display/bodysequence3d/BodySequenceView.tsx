'use client';
import { useState } from 'react';
import { guideOf, LANE_ARROW, LANE_SHORT_AR, type GuidePhase } from '@/lib/bodysequence3d/captions';
import { activeStep, currentRound, movesDone, movesTotal, sequencesDone, stat, summary, type State } from '@/lib/bodysequence3d/engine';
import { cmPerUnit } from '@/lib/bodysequence3d/projectionProfile';
import { MODE_LABEL_AR, LEVELS, STAGES } from '@/lib/bodysequence3d/stages';
import { ArrowIcon, FootIcon, StopIcon } from './FootIcon';
import { BodySequenceCanvas } from './BodySequenceCanvas';
import styles from './bodysequence.module.css';

const PHASE_COLOR: Record<GuidePhase, string> = { ready: '#38d9ff', countdown: '#6aa8ff', preview: '#b48cff', go: '#ff9a1f', hold: '#38d9ff', inter: '#35e58b', complete: '#ffc233', ended: '#ffc233' };

/**
 * Child-facing floor view. Presentation only: it renders the state Control sent and never decides an outcome.
 * `connected` false (Control stopped writing) freezes the picture and says so: nothing keeps moving while nobody is in charge.
 */
export function BodySequenceView({ state, full = false, connected = true, muted = false }: { state: State; full?: boolean; connected?: boolean; muted?: boolean }) {
  const [blocked, setBlocked] = useState(false);
  const [clock, setClock] = useState(state.clock);
  const stage = STAGES[state.stage];
  const level = LEVELS[stage.level - 1];
  const running = state.status === 'running';
  const live = running ? { ...state, clock: Math.max(state.clock, clock) } : state;
  const g = guideOf(live);
  const round = currentRound(state);
  const st = stat(state);
  const active = activeStep(state);
  const sum = summary(state);
  const cm = cmPerUnit(state.config.proj);
  const cd = running ? Math.ceil(Math.max(0, state.goAt - clock) / 1000) : 0;
  const holdLeft = state.hold ? Math.max(0, Math.ceil((state.hold.ms - (clock - state.hold.startedAt)) / 1000)) : 0;
  const phase: GuidePhase = !connected && running ? 'ready' : g.phase;
  const stopNow = !!g.step && g.step.move === 'stop' && (g.phase === 'go' || g.phase === 'hold');
  const minimal = state.config.minimalHud;
  const seqDone = sequencesDone(state);
  const seqTotal = stage.rounds.length;
  const color = stopNow ? '#ff4b55' : PHASE_COLOR[phase];
  const revealAll = (round.mode !== 'follow' || round.showAll) && !(round.mode === 'remember' && g.phase === 'go' && !state.config.hints);
  const res = st.res[state.round] ?? [];

  const overlay = !connected
    ? { icon: '⌛', title: 'بانتظار المعالج', text: 'خذ وقتك، ننتظر قليلًا', cls: '' }
    : state.status === 'paused'
      ? state.safety
        ? { icon: '🛡', title: 'توقّف للأمان', text: 'المعالج معك، لا شيء يتحرك الآن', cls: styles.safety }
        : { icon: '⏸', title: 'وقت الراحة', text: 'خذ وقتك، نحن معك', cls: '' }
      : null;

  const chipTone = (i: number) => {
    const o = res[i];
    if (o === 'confirmed' || o === 'assisted') return 'done';
    if (o === 'skipped') return 'skip';
    if (g.phase === 'preview') return i <= g.previewIndex ? 'now' : 'wait';
    if (i === active && (g.phase === 'go' || g.phase === 'hold')) return 'now';
    return 'wait';
  };

  return (
    <section
      className={`${styles.world} ${full ? styles.full : ''} ${state.config.highContrast ? styles.hc : ''}`}
      lang="ar"
      dir="rtl"
      data-testid="bs-display"
      data-status={state.status}
      data-stage={state.stage}
      data-run={state.run}
      data-phase={phase}
      data-lanes={stage.lanes}
      data-mode={round.mode}
      data-round={state.round}
      data-step={active}
      data-step-foot={g.step?.foot ?? ''}
      data-step-lane={g.step?.lane ?? ''}
      data-step-move={g.step?.move ?? ''}
      data-revealed={g.revealed ? '1' : '0'}
      data-preview={g.previewIndex}
      data-moves={movesDone(state)}
      data-total={movesTotal(state)}
      data-seq={seqDone}
      data-hold={state.hold ? '1' : '0'}
      data-connected={connected ? '1' : '0'}
      data-safety={state.safety ? '1' : '0'}
      data-clock={Math.round(state.clock)}
      data-skipped={sum.skipped}
      data-cue={state.cue?.n ?? 0}
      data-cue-kind={state.cue?.kind ?? ''}
      data-reward={stage.reward}
      data-rot={(state.config.rot + state.config.proj.rot) % 360}
      data-mirror={state.config.mirror ? '1' : '0'}
    >
      <div className={styles.stageBox}>
        <div className={styles.canvasHost}>
          <BodySequenceCanvas state={state} connected={connected} muted={muted} onAudioBlocked={setBlocked} onClock={setClock} />
        </div>
        <div className={styles.hud}>
          {!minimal && (
            <div className={styles.badge}>
              <strong>{`المستوى ${stage.level} · المرحلة ${stage.stage}`}</strong>
              <span>{stage.nameAr}</span>
              <span className={styles.mode}>{MODE_LABEL_AR[round.mode]} · {stage.lanes} ممرّات</span>
            </div>
          )}
          <div className={styles.counter} data-testid="bs-seq" aria-label={`الترتيب ${seqDone} من ${seqTotal}`}>
            <span className={styles.dots} aria-hidden="true">
              {stage.rounds.map((_, i) => <i key={i} className={`${styles.dot} ${i < seqDone ? styles.dotDone : ''} ${i === state.round && running ? styles.dotNow : ''}`} />)}
            </span>
            <b>{seqDone}/{seqTotal}</b>
          </div>

          {(state.status === 'running' || state.status === 'paused') && connected && cd === 0 && (
            <div className={styles.topStack}>
              <div className={styles.pill} style={{ ['--c' as string]: color }} data-testid="bs-pill" role="status">
                {stopNow ? <StopIcon className={styles.icon} /> : g.step && g.step.foot !== 'any' && g.revealed && g.phase !== 'inter' && g.phase !== 'preview' ? (
                  <span className={styles.footWrap}>
                    <FootIcon className={styles.icon} foot={g.step.foot} />
                    <ArrowIcon className={styles.arrow} lane={g.step.lane} />
                  </span>
                ) : g.phase === 'preview' && g.step ? <span className={styles.eye} aria-hidden="true">👁</span> : null}
                <div className={styles.pillText}>
                  <b data-testid="bs-label">{g.label}</b>
                  {!minimal && g.sub && <small>{g.sub}</small>}
                </div>
                {phase === 'hold' && <span className={styles.holdNum} data-testid="bs-holdnum">{holdLeft}</span>}
                <div className={styles.light} aria-hidden="true">
                  <i className={`${styles.lamp} ${styles.lampR} ${stopNow ? styles.on : ''}`} />
                  <i className={`${styles.lamp} ${styles.lampG} ${!stopNow && (phase === 'go' || phase === 'preview') ? styles.on : ''}`} />
                </div>
              </div>
              {round.steps.length > 0 && g.phase !== 'inter' && (
                <div className={styles.chips} data-testid="bs-chips" aria-label="ترتيب الحركات">
                  {round.steps.map((step, i) => {
                    const tone = chipTone(i);
                    const hidden = tone === 'wait' && !(revealAll && (g.phase !== 'preview' || i <= g.previewIndex));
                    return (
                      <span key={step.id} className={`${styles.chip} ${styles[`chip_${tone}`]}`} data-tone={tone} data-hidden={hidden ? '1' : '0'}>
                        <em>{i + 1}</em>
                        {hidden ? <b>؟</b> : step.move === 'stop' ? <StopIcon className={styles.chipIcon} /> : step.foot === 'any' ? null : (
                          <>
                            <FootIcon className={styles.chipFoot} foot={step.foot} color="#fff" fill="rgba(255,255,255,0.18)" />
                            <span className={styles.chipLane} aria-label={LANE_SHORT_AR[step.lane]}>{LANE_ARROW[step.lane]}</span>
                          </>
                        )}
                        {tone === 'done' && <u aria-hidden="true">✓</u>}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {state.status === 'ready' && (
            <div className={styles.setup} data-testid="bs-setup" role="status">
              <b>{stage.nameAr}</b>
              <span>{stage.goalAr}</span>
              <span>{cm ? `المقياس التقريبي: الوحدة ≈ ${Math.round(cm)} سم` : 'المسافات غير مقاسة بعد'} · الطفل يقف عند علامة الاستعداد</span>
            </div>
          )}
          <div className={styles.brand}>SHUMOS CARE · تحدي الجسم الذكي</div>
          {blocked && state.config.volume > 0 && state.config.sound && !muted && (
            <button type="button" className={styles.sound} onClick={() => setBlocked(false)}>🔇 اضغط في أي مكان لتفعيل الصوت</button>
          )}
        </div>

        {running && connected && cd > 0 && (
          <div className={styles.overlay} role="status" data-testid="bs-countdown">
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
          <div className={`${styles.overlay} ${styles.late}`} role="status" data-testid="bs-stagecomplete">
            <div className={styles.card}>
              <div className={styles.icon2} aria-hidden="true">⚡</div>
              <h2>أحسنت!</h2>
              <p>أكملنا «{stage.nameAr}» معًا</p>
              <div className={styles.stats}>
                <div className={styles.stat}><b>{movesDone(state)}</b><span>حركة نجحت</span></div>
                <div className={styles.stat}><b>{state.completed.length}</b><span>من ٩ مراحل</span></div>
              </div>
              {state.stage < 8 && <p style={{ marginTop: '2vmin', opacity: 0.8 }}>التالي: {STAGES[state.stage + 1].nameAr}</p>}
            </div>
          </div>
        )}
        {state.status === 'ended' && (
          <div className={styles.overlay} role="status" data-testid="bs-ended">
            <div className={styles.card}>
              <div className={styles.icon2} aria-hidden="true">🏆</div>
              <h2>{state.completed.length === 9 ? 'أنت بطل الحركة!' : 'رحلة رائعة!'}</h2>
              <p>شكرًا لك، تحرّكنا معًا اليوم</p>
              <div className={styles.stats}>
                <div className={styles.stat}><b>{sum.confirmed + sum.assisted}</b><span>حركة نجحت</span></div>
                <div className={styles.stat}><b>{sum.sequences}</b><span>ترتيبًا مكتملًا</span></div>
                <div className={styles.stat}><b>{state.completed.length}</b><span>مراحل مكتملة</span></div>
              </div>
              <p style={{ marginTop: '2vmin', opacity: 0.7, fontSize: '0.8em' }}>{level.nameAr}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
