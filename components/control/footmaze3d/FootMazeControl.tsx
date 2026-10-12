'use client';
import { useLibraryLaunchAdapter } from '@/components/control/library/launch/LibraryLaunchBoundary';
import Link from 'next/link';
import { useState } from 'react';
import { isRealtimeEnabled } from '@/lib/realtime/firebaseClient';
import { at, canMove, countdownLeft, exits, onward, actPose, prevNode, routeToFinish, stat, starsCollected, summary, targetOf, worldOf, type Command, type State } from '@/lib/footmaze3d/engine';
import { guideOf, KIND_LABEL_AR, nodeNameAr, TURN_AR, turnOf } from '@/lib/footmaze3d/captions';
import { LEVELS, STAGES } from '@/lib/footmaze3d/stages';
import { useFootMazeSession } from '@/lib/footmaze3d/useSession';
import { MazeMap } from './MazeMap';
import { Settings } from './Settings';
import styles from './control.module.css';

const STATUS_AR = { ready: 'جاهز للبدء', running: 'يعمل', paused: 'متوقف مؤقتًا', 'stage-complete': 'اكتملت المرحلة', ended: 'انتهت الجلسة' } as const;

export function FootMazeControl() {
  return isRealtimeEnabled() ? (
    <LiveFootMazeControl />
  ) : (
    <main className={styles.page} dir="rtl" lang="ar">
      <div className={styles.inner}>
        <h1 className={styles.title}>متاهة القدمين</h1>
        <p>يلزم إعداد اتصال المنصة المشتركة لفتح جلسة متزامنة.</p>
        <Link href="/control">مكتبة الأنشطة</Link>
      </div>
    </main>
  );
}

function LiveFootMazeControl() {
  const session = useFootMazeSession();
  const { state: s, send } = session;
  if (!s) {
    return (
      <main className={styles.page} dir="rtl" lang="ar">
        <div className={styles.inner}>
          <h1 className={styles.title}>متاهة القدمين</h1>
          <p role="status">{session.blocked ? 'هذه الجلسة تعمل في نافذة أخرى. أغلقها ثم أعد المحاولة.' : session.error ?? 'جاري تجهيز الجلسة المشتركة…'}</p>
          <Link href="/control">مكتبة الأنشطة</Link>
        </div>
      </main>
    );
  }
  return <Panel s={s} send={send} session={session} />;
}

function Current({ s, send, can }: { s: State; send: (c: Command) => void; can: boolean }) {
  const w = worldOf(s);
  const { maze } = w;
  const g = guideOf(s);
  const cur = at(s);
  const live = s.status === 'running' || s.status === 'paused';
  if (!live || !cur) return null;
  const tgt = targetOf(s, w);
  const cd = Math.ceil(countdownLeft(s) / 1000);
  const ok = canMove(s) && can;
  const ways = exits(s, w), on = onward(s, w), back = prevNode(s);
  const guardHere = maze.guards.find((x) => x.at === cur) ?? null;
  const evHere = maze.events.find((x) => x.at === cur) ?? null;
  const act = s.act;
  const gd = act ? maze.guards.find((x) => x.id === act.id) : undefined;
  const pose = act ? actPose(act, s.clock, !!gd?.alt) : null;
  const left = act ? Math.max(0, Math.ceil((act.leaveAt - s.clock) / 1000)) : 0;
  const headingName = s.heading ? nodeNameAr(maze, s.heading) : '';
  const turn = s.heading ? turnOf(s) : null;
  return (
    <div className={styles.current} data-testid="fm-current" data-at={cur} data-heading={s.heading ?? ''} data-act={act?.kind ?? ''} data-phase={g.phase}>
      <div className={styles.currentTitle}>الطفل (حسب تأكيدك) عند: {nodeNameAr(maze, cur)}{tgt ? ` · الوجهة التالية: ${tgt.finish ? 'نهاية المتاهة' : `نجمة (${nodeNameAr(maze, tgt.node)})`}` : ''}</div>
      <div className={styles.currentText}>
        <span className={styles.pill} style={{ ['--c' as string]: g.phase === 'wait' ? '#ffb020' : g.phase === 'choose' || g.phase === 'countdown' ? '#4aa8ff' : '#3ddc84' }} data-testid="fm-phase">{g.label}</span>
        {turn && !act && <span style={{ fontSize: 16, opacity: 0.85 }}>{TURN_AR[turn]}</span>}
      </div>
      {cd > 0 && <div className={styles.banner} role="status">العدّ التنازلي {cd}… تُفتح التأكيدات بعده.</div>}

      {act && (
        <div className={styles.actBox} role="status" data-testid="fm-act" data-kind={act.kind} data-phase={pose?.phase}>
          <div>{KIND_LABEL_AR[act.kind]}: {pose?.phase === 'enter' ? 'يتحرك إلى مكانه' : pose?.phase === 'hold' ? 'الانتظار جارٍ' : 'ينسحب'} · {left} ث. الطفل واقف في منطقة الانتظار ولا تُقبل أي حركة الآن (الإيقاف المؤقت يجمّد الانتظار).</div>
          <div className={styles.actions} style={{ marginTop: 0 }}>
            <button type="button" className={`${styles.btn} ${styles.good}`} style={{ minHeight: 56 }} data-testid="fm-release" disabled={!can || s.status !== 'running'} onClick={() => send({ type: 'release' })}>اسمح بالمرور الآن ✓</button>
            <button type="button" className={styles.btn} data-testid="fm-extend" disabled={!can || s.status !== 'running'} onClick={() => send({ type: 'extend', ms: 2000 })}>مدّد الانتظار +٢ ث</button>
          </div>
        </div>
      )}

      {!act && ways.length > 0 && (
        <>
          <div className={styles.note}>{s.heading ? 'الطفل متجه نحو:' : on.length > 1 ? 'مفترق: اختر الطريق الذي سلكه الطفل (أو اضغط عليه في الخريطة).' : 'اختر الاتجاه:'}</div>
          <div className={styles.exits} data-testid="fm-exits">
            {ways.map((id) => {
              const t = turnOf(s, id);
              return (
                <button key={id} type="button" className={`${styles.exitBtn} ${s.heading === id ? styles.exitOn : ''}`} data-testid={`fm-exit-${id}`} aria-pressed={s.heading === id} disabled={!ok} onClick={() => send({ type: 'choose', to: id })}>
                  <span>{t ? TURN_AR[t] : id}{id === back ? ' (رجوع)' : ''}</span>
                  <small>{nodeNameAr(maze, id)}</small>
                </button>
              );
            })}
          </div>
        </>
      )}

      {!act && s.heading && <div className={styles.note} data-testid="fm-heading-note">اتجاه الطفل: {headingName}{turn ? ` · ${TURN_AR[turn]}` : ''}. عند وصوله اضغط «وصل».</div>}
      {!act && guideOf(s).phase !== 'countdown' && guardHere && !s.fired.includes(guardHere.id) && s.config.guards && (guardHere.kind === 'guard' || guardHere.kind === 'swarm') && <div className={styles.note}>هنا يظهر «{KIND_LABEL_AR[guardHere.kind]}» عند تأكيد الوصول.</div>}

      <div className={styles.actions}>
        <button type="button" className={`${styles.btn} ${styles.good}`} data-testid="fm-arrive" disabled={!ok || !s.heading} onClick={() => send({ type: 'arrive', assisted: false })}>✓ وصل الطفل{s.heading ? ` إلى: ${headingName}` : ''}</button>
        <button type="button" className={`${styles.btn} ${styles.assist}`} data-testid="fm-arrive-assist" disabled={!ok || !s.heading} onClick={() => send({ type: 'arrive', assisted: true })}>وصل بمساعدة المعالج</button>
      </div>
      <div className={styles.actions} style={{ marginTop: 4 }}>
        <button type="button" className={styles.btn} data-testid="fm-repeat" disabled={!can || s.status !== 'running' || !!act} onClick={() => send({ type: 'repeat', prev: false })}>أعد هذه الخطوة</button>
        <button type="button" className={styles.btn} data-testid="fm-back" disabled={!can || s.status !== 'running' || !!act || s.trail.length < 2} onClick={() => send({ type: 'repeat', prev: true })}>تراجع: أعد النقطة السابقة</button>
        <button type="button" className={styles.btn} data-testid="fm-skip" disabled={!ok || !tgt || tgt.finish} onClick={() => send({ type: 'skip' })}>تخطَّ النجمة التالية</button>
        <button type="button" className={styles.btn} data-testid="fm-hint-btn" disabled={!ok} onClick={() => send({ type: 'hint' })}>💡 تلميح الطريق (٧ ث)</button>
        <button type="button" className={`${styles.btn} ${styles.warn}`} data-testid="fm-trigger" disabled={!ok || !(guardHere || evHere)} onClick={() => send({ type: 'trigger' })}>{guardHere ? (s.fired.includes(guardHere.id) ? 'أعد تشغيل الانتظار هنا' : `شغّل «${KIND_LABEL_AR[guardHere.kind]}» الآن`) : evHere && !s.fired.includes(evHere.id) ? 'شغّل تغيّر الطريق الآن' : 'لا حدث هنا'}</button>
      </div>
      <p className={styles.note}>لا تُجمع أي نجمة إلا بضغطك «وصل» عند النجمة الفعلية، ولا تُمنح نفس النجمة مرتين. الإعادة والتراجع والتخطي والرجوع من طريق مسدود ليست إخفاقًا ولا تخصم شيئًا.</p>
    </div>
  );
}

function Panel({ s, send, session }: { s: State; send: (c: Command) => void; session: ReturnType<typeof useFootMazeSession> }) {
  const stage = STAGES[s.stage];
  const w = worldOf(s);
  const st = stat(s);
  const [confirm, setConfirm] = useState<null | 'restart' | 'end' | 'skipStage' | 'restartStage'>(null);
  const can = session.connected && !session.blocked;
  const live = s.status === 'running' || s.status === 'paused';
  const sum = summary(s);
  const cfg = s.config;
  useLibraryLaunchAdapter('foot-maze-3d', {
    modes: ['MANUAL'],
    apply: () => {
      if (!session.connected || session.blocked || !['ready', 'paused'].includes(s.status)) return false;
      send({ type: 'configure', config: { inputMode: 'MANUAL', inputSource: 'manual' } });
      return true;
    },
  });
  const pendingHint = s.sensor.pending && s.status === 'running';
  const selectable = s.status === 'ready' || s.status === 'stage-complete';
  const progressCount = starsCollected(s);
  const junctions = w.maze.nodes.filter((n) => n.deg >= 3).length;

  return (
    <main className={styles.page} lang="ar" dir="rtl" data-testid="fm-control" data-status={s.status} data-stage={s.stage} data-run={s.run} data-clock={Math.round(s.clock)} data-stars={progressCount} data-total={st.res.length || w.maze.stars.length} data-at={at(s) ?? ''} data-act={s.act?.kind ?? ''} data-safety={s.safety ? '1' : '0'} data-fired={s.fired.join(',')} data-nodes={w.maze.nodes.length} data-junctions={junctions} data-next={routeToFinish(s, w)[1] ?? ''} data-heading={s.heading ?? ''} data-choices={st.choices} data-correct={st.correct} data-detours={st.detours} data-waits={st.waits} data-waitsdone={st.waitsDone} data-closed={[...w.closed].join(',')}>
      {s.status !== 'ended' && s.status !== 'stage-complete' && s.status !== 'ready' && (
        <button className={`${styles.btn} ${styles.safety} ${styles.floatSafety}`} data-testid="fm-safety" onClick={() => send({ type: 'safety' })} aria-label="إيقاف الأمان">⛔ إيقاف الأمان</button>
      )}
      <div className={styles.inner}>
        <header className={styles.header}>
          <div>
            <div className={styles.eyebrow}>SHUMOS CARE · FLOOR PROJECTION</div>
            <h1 className={styles.title}>متاهة القدمين</h1>
            <div className={styles.sub}>Foot Maze 3D · يمشي الطفل في متاهة مضيئة على الأرض ويؤكّد المعالج كل وصول؛ الحساسات اختيارية</div>
          </div>
          <div className={styles.links}>
            <Link href="/control">مكتبة الأنشطة</Link>
            <a href="/display" target="_blank" rel="noopener">فتح شاشة الأرض ↗</a>
          </div>
        </header>

        <div className={styles.grid}>
          <div className={styles.stack}>
            <div className={styles.card}>
              <div className={styles.chips}>
                <span className={styles.chip}>المستوى {stage.level} · المرحلة {stage.stage}: {stage.nameAr}</span>
                <span className={styles.chip}>{LEVELS[stage.level - 1].nameAr}</span>
                <span className={`${styles.chip} ${s.status === 'running' ? styles.chipOk : s.status === 'paused' ? styles.chipWarn : ''}`}>{STATUS_AR[s.status]}{s.safety && s.status === 'paused' ? ' · إيقاف أمان' : ''}</span>
                <span className={styles.chip}>{w.maze.nodes.length} محطات · {junctions} مفترقات{cfg.simple ? ' · مبسّط' : ''}</span>
                <span className={styles.chip}>★ {progressCount}/{st.res.length || w.maze.stars.length}</span>
                {!cfg.events && <span className={`${styles.chip} ${styles.chipWarn}`}>الأحداث متوقفة</span>}
                {!cfg.guards && <span className={`${styles.chip} ${styles.chipWarn}`}>الحرّاس متوقفون</span>}
                <span className={styles.chip}>{cfg.inputSource === 'simulated' ? 'محاكاة حساسات' : 'تأكيد يدوي'}</span>
              </div>
              <p className={styles.note} style={{ marginTop: 8 }}>{stage.goalAr}</p>
              {pendingHint && (
                <div className={styles.banner} role="status" data-testid="fm-sensor-hint" style={{ marginTop: 10 }}>
                  رُصدت حركة قدم أثناء انتظار الحارس (تلميح فقط، من محاكاة). الحساس لا يعرف أين يقف الطفل؛ لاحظ بنفسك.
                  <button type="button" className={`${styles.btn} ${styles.btnSm}`} style={{ marginInlineStart: 8 }} onClick={() => send({ type: 'dismissHint' })}>تجاهل</button>
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                <MazeMap s={s} send={send} enabled={can} />
              </div>
              <div className={styles.legend}>
                <span><i style={{ background: '#3ddc84' }} />البداية</span><span><i style={{ background: '#ffc42e' }} />نجمة</span><span><i style={{ background: '#ffb020' }} />منطقة انتظار آمنة</span><span><i style={{ background: '#4aa8ff' }} />آخر موضع أكّدته للطفل</span><span>🤖🦆🐻🦋 حارس ودود · ⛩ بوابة · 🌉 جسر · 🏁 الوجهة</span>
              </div>
              <p className={styles.note}>الخريطة تُظهر المتاهة بنفس اتجاهها على الأرض. المعاينة قبل البدء تعرض كل الممرات والحرّاس والبوابات. الدائرة الزرقاء ليست تتبّعًا للطفل بل آخر مكان أكّدته أنت، ووحدات الرسم ليست سنتيمترات.</p>
              {w.layout.warnings.length > 0 && <ul className={styles.warnList} data-testid="fm-layout-warnings">{w.layout.warnings.map((x, i) => <li key={i}>{x}</li>)}</ul>}
            </div>

            <Current s={s} send={send} can={can} />

            <div className={styles.card}>
              <div className={styles.actions} style={{ marginTop: 0 }}>
                {s.status === 'ready' && <button className={`${styles.btn} ${styles.primary}`} data-testid="fm-start" disabled={!can} onClick={() => send({ type: 'start', at: Date.now() })}>ابدأ المرحلة</button>}
                {s.status === 'running' && <button className={styles.btn} data-testid="fm-pause" onClick={() => send({ type: 'pause' })}>إيقاف مؤقت</button>}
                {s.status === 'paused' && <button className={`${styles.btn} ${s.safety ? styles.resumeSafe : styles.primary}`} data-testid="fm-resume" disabled={!can} onClick={() => send({ type: 'resume', at: Date.now() })}>{s.safety ? 'استئناف بعد إيقاف الأمان' : 'متابعة'}</button>}
                {s.status === 'stage-complete' && <button className={`${styles.btn} ${styles.primary}`} data-testid="fm-next" onClick={() => send({ type: 'next', at: Date.now() })}>{s.stage === 8 ? 'إنهاء الجلسة وعرض النتائج' : 'المرحلة التالية'}</button>}
                {live && <button className={styles.btn} data-testid="fm-skipstage" onClick={() => setConfirm('skipStage')}>تجاوز المرحلة</button>}
                {s.status !== 'ended' && s.status !== 'ready' && <button className={styles.btn} data-testid="fm-restartstage" onClick={() => setConfirm('restartStage')}>أعد ضبط هذه المرحلة</button>}
              </div>
              <div className={styles.actions}>
                <button className={styles.btn} data-testid="fm-restart" onClick={() => setConfirm('restart')}>إعادة البدء</button>
                {s.status !== 'ended' && <button className={styles.btn} data-testid="fm-end" onClick={() => setConfirm('end')}>إنهاء الجلسة</button>}
              </div>
              {confirm && (
                <div className={styles.confirm} role="alertdialog" data-testid="fm-confirm-box" style={{ marginTop: 10 }}>
                  <span>{confirm === 'restart' ? 'إعادة البدء تمسح تقدّم هذه الجولة (لا تُحفظ نتائجها). متأكد؟' : confirm === 'end' ? 'إنهاء الجلسة الآن وحفظ النتائج؟' : confirm === 'restartStage' ? 'إعادة ضبط المرحلة الحالية وتصفير نجومها؟' : 'تجاوز المرحلة الحالية والانتقال إلى التالية؟'}</span>
                  <button className={`${styles.btn} ${styles.primary}`} style={{ minHeight: 44 }} data-testid="fm-confirm-yes" onClick={() => { send(confirm === 'restart' ? { type: 'restart' } : confirm === 'end' ? { type: 'end', at: Date.now() } : confirm === 'restartStage' ? { type: 'restartStage' } : { type: 'skipStage', at: Date.now() }); setConfirm(null); }}>نعم</button>
                  <button className={styles.btn} style={{ minHeight: 44 }} data-testid="fm-confirm-no" onClick={() => setConfirm(null)}>لا</button>
                </div>
              )}
              <div className={styles.progress} aria-label={`${s.completed.length} من 9 مراحل مكتملة`}>
                {STAGES.map((_, i) => <span key={i} className={`${styles.step} ${s.completed.includes(i) ? styles.done : s.skipped.includes(i) ? styles.skipped : ''} ${i === s.stage ? styles.here : ''}`} title={STAGES[i].nameAr} />)}
                <span className={styles.note}>{s.completed.length}/9 مراحل</span>
              </div>
            </div>

            <div className={styles.card} data-testid="fm-stages">
              <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>المستوى والمرحلة</h2>
              <div className={styles.stageGrid}>
                {LEVELS.map((lv) => (
                  <div key={lv.level} className={styles.stageRow}>
                    <span className={styles.levelName}>{lv.level}. {lv.nameAr}</span>
                    {STAGES.filter((x) => x.level === lv.level).map((x) => (
                      <button key={x.id} type="button" data-testid={`fm-stage-${x.id}`} className={`${styles.stageBtn} ${x.id === s.stage ? styles.stageOn : ''} ${s.completed.includes(x.id) ? styles.stageDone : ''}`} disabled={!selectable || !can} aria-pressed={x.id === s.stage} onClick={() => send({ type: 'selectStage', stage: x.id })}>{x.nameAr}</button>
                    ))}
                  </div>
                ))}
              </div>
              <p className={styles.note}>اختيار المستوى والمرحلة متاح قبل البدء أو بين المراحل. الصعوبة هنا في تعقيد المتاهة والتخطيط لا في السرعة؛ لا جري ولا قفز ولا حدّ زمني.</p>
            </div>

            <div className={styles.card} data-testid="fm-results">
              <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>{s.status === 'ended' ? 'نتائج الجلسة' : 'ملخص الجلسة حتى الآن'}</h2>
              <div className={styles.chips}>
                <span className={`${styles.chip} ${styles.chipOk}`}>نجوم مؤكدة {sum.confirmed}</span>
                <span className={styles.chip}>بمساعدة {sum.assisted}</span>
                <span className={styles.chip}>متخطاة {sum.skipped}</span>
                <span className={styles.chip}>اختيارات الطريق {sum.choices}</span>
                <span className={styles.chip}>طرق جانبية {sum.detours}</span>
                <span className={styles.chip}>انتظارات مكتملة {sum.waitsDone}/{sum.waits}</span>
                <span className={styles.chip}>أحداث مسار {sum.events}</span>
                <span className={styles.chip}>وصول بمساعدة {sum.assistedMoves}</span>
                <span className={styles.chip}>تلميحات {sum.hints}</span>
                <span className={styles.chip}>إعادات {sum.repeats}</span>
                <span className={styles.chip}>وقت اللعب {Math.round(sum.activeMs / 1000)} ث</span>
              </div>
              <p className={styles.note}>أعداد أحداث لعب فقط أكّدتها أنت: النجوم تغذية راجعة للعبة وليست تقييمًا سريريًا، ولا توجد درجة. لا الإعادة ولا التخطّي ولا الدخول في طريق مسدود إخفاق.</p>
              <div className={styles.status} role="status" data-testid="fm-status">
                {session.error ?? (session.connected ? '● التحكم متصل' : '○ التحكم غير متصل')}
                <br />
                {session.displayConnected ? '● شاشة الأرض متصلة' : '○ افتح شاشة الأرض'}
                <br />
                {session.history === 'saved' ? '✓ حُفظت الجلسة' : session.history === 'walk-in' ? 'جلسة زائر · دون سجل مريض' : session.history === 'retry' ? 'تعذّر الحفظ، تجري إعادة المحاولة' : session.history === 'saving' ? 'جارٍ الحفظ…' : ''}
              </div>
            </div>
          </div>

          <Settings s={s} send={send} sim={session.sim} setSim={session.setSimulated} />
        </div>
      </div>
    </main>
  );
}
