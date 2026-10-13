'use client';
import { useEffect, useRef, useState } from 'react';
import { done as doneOf, summary, type State } from '@/lib/achievementcity/engine';
import { LEVELS, levelDef, levelProgress } from '@/lib/achievementcity/milestones';
import { AchievementCityCanvas } from './AchievementCityCanvas';
import styles from './achievementcity.module.css';

/**
 * Child-facing wall view. Presentation only: it renders the state Control sent and never decides an outcome.
 * `connected` false (Control stopped writing) freezes the picture and says so.
 */
export function AchievementCityView({ state, full = false, connected = true, muted = false }: { state: State; full?: boolean; connected?: boolean; muted?: boolean }) {
  const [blocked, setBlocked] = useState(false);
  const [toast, setToast] = useState<{ id: string; text: string; n: number } | null>(null);
  const n = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const def = levelDef(state.level);
  const done = doneOf(state);
  const lp = levelProgress(state.level, done, state.target);
  const minimal = state.config.minimalHud;
  const sum = summary(state);
  const pct = Math.round((Math.min(done, state.target) / state.target) * 100);
  const nextName = lp.completed < lp.total ? def.milestones[lp.completed].nameAr : null;
  const inset = Math.max(0, state.config.proj.inset);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const onBuilt = (id: string, index: number) => {
    const name = levelDef(state.level).milestones[index]?.nameAr;
    if (!name) return;
    n.current++;
    setToast({ id, text: `تم بناء: ${name}`, n: n.current });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3200);
  };

  const overlay = !connected
    ? { icon: '⌛', title: 'بانتظار المعالج', text: 'خذ وقتك، ننتظر قليلًا' }
    : state.status === 'paused'
      ? state.safety ? { icon: '🛡', title: 'توقّف للأمان', text: 'المعالج معك، لا شيء يتحرك الآن' } : { icon: '⏸', title: 'وقت الراحة', text: 'خذ وقتك، نحن معك' }
      : null;

  return (
    <section
      className={`${styles.world} ${full ? styles.full : ''} ${state.config.highContrast ? styles.hc : ''}`}
      style={{ ['--inset' as string]: `${Math.max(3, inset)}vmin` }}
      lang="ar"
      dir="rtl"
      data-testid="ac-display"
      data-status={state.status}
      data-level={state.level}
      data-done={done}
      data-target={state.target}
      data-confirmed={state.confirmed}
      data-assisted={state.assisted}
      data-seq={state.seq}
      data-run={state.run}
      data-milestones={lp.completed}
      data-connected={connected ? '1' : '0'}
      data-safety={state.safety ? '1' : '0'}
    >
      <div className={styles.canvasHost}>
        <AchievementCityCanvas state={state} connected={connected} muted={muted} onAudioBlocked={setBlocked} onBuilt={onBuilt} />
      </div>
      <div className={styles.hud}>
        {!minimal && (
          <div className={styles.levelChip} data-testid="ac-level">
            <b>{def.nameAr}</b>
            <span>المستوى {state.level + 1} من 3</span>
            <span className={styles.dots} aria-hidden="true">
              {def.milestones.map((_, i) => <i key={i} className={`${styles.dot} ${i < lp.completed ? styles.dotOn : ''} ${i === lp.completed && state.status === 'running' ? styles.dotNow : ''}`} />)}
            </span>
          </div>
        )}
        {toast && state.status !== 'ready' && <div key={toast.n} className={styles.toast} role="status" data-testid="ac-toast">✨ {toast.text}</div>}

        {state.status !== 'ready' && state.status !== 'ended' && (
          <div className={styles.progress} data-testid="ac-progress">
            <div className={styles.count} aria-label={`${done} من ${state.target}`}>
              {done}<small> / {state.target}</small>
            </div>
            <div className={styles.bar}>
              <div className={styles.barTrack} role="progressbar" aria-valuemin={0} aria-valuemax={state.target} aria-valuenow={done}><div className={styles.barFill} style={{ width: `${pct}%` }} /></div>
              {!minimal && <div className={styles.next}>{nextName ? `التالي: ${nextName}` : def.doneAr}</div>}
            </div>
          </div>
        )}

        {state.status === 'ready' && (
          <div className={styles.setupCard} data-testid="ac-setup" role="status">
            <b>{def.nameAr}</b>
            <span>{def.blurbAr}</span>
            <span>{state.exercise ? `التمرين: ${state.exercise} · ` : ''}كل إنجاز يؤكّده المعالج يبني جزءًا جديدًا من المدينة</span>
          </div>
        )}
        <div className={styles.brand}>SHUMOS CARE · مدينة الإنجازات</div>
        {blocked && state.config.volume > 0 && state.config.sound && !muted && (
          <button type="button" className={styles.sound} onClick={() => setBlocked(false)}>🔇 اضغط في أي مكان لتفعيل الصوت</button>
        )}
      </div>

      {overlay && (
        <div className={styles.overlay} role="status" data-testid="ac-overlay">
          <div className={styles.card}>
            <div className={styles.icon2} aria-hidden="true">{overlay.icon}</div>
            <h2>{overlay.title}</h2>
            <p>{overlay.text}</p>
          </div>
        </div>
      )}
      {state.status === 'level-complete' && connected && (
        <div className={`${styles.overlay} ${styles.late}`} role="status" data-testid="ac-levelcomplete">
          <div className={styles.card}>
            <div className={styles.icon2} aria-hidden="true">{state.level === 2 ? '🏙️' : '🎉'}</div>
            <h2>{state.level === 2 ? 'مدينتك الكبرى جاهزة!' : `${def.doneAr}`}</h2>
            <p>{state.level === 2 ? 'ما شاء الله! بنيت مدينة كاملة بإنجازاتك' : `التالي: ${LEVELS[state.level + 1].nameAr}`}</p>
          </div>
        </div>
      )}
      {state.status === 'ended' && connected && (
        <div className={styles.overlay} role="status" data-testid="ac-ended">
          <div className={styles.card}>
            <div className={styles.icon2} aria-hidden="true">🏆</div>
            <h2>{sum.levelsCompleted >= 1 ? 'عمل رائع!' : 'رحلة جميلة!'}</h2>
            <p>شكرًا لك، أنجزنا وبنينا معًا اليوم</p>
            <div className={styles.stats}>
              <div className={styles.stat}><b>{sum.achievements}</b><span>إنجازًا</span></div>
              <div className={styles.stat}><b>{sum.levelsCompleted}</b><span>مستويات مكتملة</span></div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
