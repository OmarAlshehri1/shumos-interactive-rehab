"use client";
import { ControlDialog } from "@/components/control/ui/ControlDialog";
import { ControlSlot } from "@/components/control/ui/ControlWorkspace";
import { AchievementForestView } from "@/components/display/achievementforest3d/AchievementForestView";
import { SetupSettingsCard } from "@/components/control/setup/GameSetupLayout";
import Link from "next/link";
import { useState } from "react";
import { useLibraryLaunchAdapter } from "@/components/control/library/launch/LibraryLaunchBoundary";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { canConfirm, canUndo, done, isFinalLevel, summary, TARGET_MAX, TARGET_MIN, type Command, type State } from "@/lib/achievementforest/engine";
import { LEVELS, levelDef, levelProgress } from "@/lib/achievementforest/milestones";
import { useAchievementForestSession } from "@/lib/achievementforest/useSession";
import { Settings } from "./Settings";
import styles from "./control.module.css";

const NAME = "غابة الإنجازات";
const STATUS_AR = { ready: "جاهز للبدء", running: "قيد التنفيذ", paused: "متوقف مؤقتًا", "level-complete": "اكتمل المستوى", ended: "انتهت الجلسة" } as const;
const EXAMPLES = ["الخطو على بصمات القدم", "المشي حول الأقماع", "نشاط مخصص بإشراف الأخصائي", "الوقوف من الجلوس", "تمارين الوصول", "تمارين التوازن"];
const PRESETS = [6, 10, 15, 20];
const LEVEL_IMG = ["/control-stage-previews/achievement-forest/1.webp", "/control-stage-previews/achievement-forest/2.webp", "/control-stage-previews/achievement-forest/3.webp"];

export function AchievementForestControl() {
  return isRealtimeEnabled() ? (
    <LiveControl />
  ) : (
    <main className={styles.page} dir="rtl" lang="ar">
      <div className={styles.inner}>
        <h1>{NAME}</h1>
        <p>يلزم إعداد اتصال المنصة المشتركة لفتح جلسة متزامنة.</p>
        <Link href="/control">مكتبة الأنشطة</Link>
      </div>
    </main>
  );
}

function LiveControl() {
  const session = useAchievementForestSession();
  const { state: s, send } = session;
  if (!s) {
    return (
      <main className={styles.page} dir="rtl" lang="ar">
        <div className={styles.inner}>
          <p role="status">{session.blocked ? "هذه الجلسة تعمل في نافذة أخرى. أغلقها ثم أعد المحاولة." : (session.error ?? "جاري تجهيز الجلسة المشتركة…")}</p>
          <Link href="/control">مكتبة الأنشطة</Link>
        </div>
      </main>
    );
  }
  return <Panel s={s} send={send} session={session} />;
}

type Session = ReturnType<typeof useAchievementForestSession>;
const now = () => Date.now();

function PadBox({ s, send, session, locked }: { s: State; send: (c: Command) => void; session: Session; locked: boolean }) {
  const gp = s.config.inputSource === "gamepad";
  const st = session.pad.status;
  return (
    <div className={styles.field} data-testid="af-input">
      <span className={styles.lab}>طريقة التأكيد</span>
      <div className={styles.seg} role="group" aria-label="طريقة التأكيد">
        <button type="button" className={styles.segBtn} data-testid="af-input-manual" aria-pressed={!gp} onClick={() => send({ type: "configure", config: { inputSource: "manual" } })}>زر التأكيد على الشاشة</button>
        <button type="button" className={styles.segBtn} data-testid="af-input-gamepad" aria-pressed={gp} onClick={() => send({ type: "configure", config: { inputSource: "gamepad" } })}>ذراع تحكم بيد الأخصائي</button>
      </div>
      {gp && (
        <div className={styles.note} data-testid="af-pad">
          <span data-testid="af-pad-status" data-status={st}>
            {st === "connected" ? "● ذراع التحكم متصلة" : st === "lost" ? "○ انقطع اتصال الذراع — استخدم زر التأكيد على الشاشة" : "○ لم يُكتشف ذراع تحكم بعد: اضغط أي زر عليها. زر التأكيد على الشاشة يعمل دائمًا."}
          </span>
          <br />
          الزر المعيّن: رقم {session.pad.mapping.button + 1}{" "}
          <button type="button" className={`${styles.btn} ${styles.btnSm}`} data-testid="af-pad-learn" disabled={locked && s.status === "running"} onClick={() => (session.pad.learning ? session.cancelLearn() : session.learnButton())}>
            {session.pad.learning ? "اضغط الزر المطلوب الآن… (إلغاء)" : "تعيين زر التأكيد"}
          </button>
          <br />
          كل ضغطة = إنجاز واحد يؤكّده الأخصائي. الضغط المطوّل لا يكرّر، والضغطات السريعة جدًا تُعدّ مرة واحدة. الذراع لا تقيس الحركة ولا تثبت صحة التمرين.
        </div>
      )}
    </div>
  );
}

function Setup({ s, send, session, can }: { s: State; send: (c: Command) => void; session: Session; can: boolean }) {
  return (
    <div className={styles.inner} data-testid="af-setup-screen" data-game-setup data-setup-kind="levels">
      <SetupSettingsCard>
        <p className={styles.lead}>اختر التمرين والهدف. يؤكد الأخصائي كل إنجاز يدويًا.</p>
        <div className={styles.fields}>
          <ControlSlot slot="settings"><div className={styles.field}>
            <label htmlFor="af-exercise">اسم التمرين</label>
            <input id="af-exercise" type="text" list="af-ex" maxLength={60} data-testid="af-exercise" placeholder="مثال: الوقوف من الجلوس" value={s.exercise} disabled={!can} onChange={(e) => send({ type: "setExercise", exercise: e.target.value })} />
            <datalist id="af-ex">{EXAMPLES.map((x) => <option key={x} value={x} />)}</datalist>
            <p className={styles.note}>أمثلة فقط: يختار الأخصائي التمرين المناسب ويشرف عليه.</p>
          </div></ControlSlot>
          <ControlSlot slot="settings"><div className={styles.field}>
            <span className={styles.lab}>عدد الإنجازات المطلوب في كل مستوى</span>
            <div className={styles.stepper}>
              <button type="button" className={styles.stepBtn} aria-label="أنقص" data-testid="af-target-dec" disabled={!can || s.target <= TARGET_MIN} onClick={() => send({ type: "setTarget", target: s.target - 1 })}>−</button>
              <span className={styles.stepVal} data-testid="af-target" aria-live="polite">{s.target}</span>
              <button type="button" className={styles.stepBtn} aria-label="زد" data-testid="af-target-inc" disabled={!can || s.target >= TARGET_MAX} onClick={() => send({ type: "setTarget", target: s.target + 1 })}>+</button>
            </div>
            <div className={styles.seg}>
              {PRESETS.map((p) => <button key={p} type="button" className={styles.segBtn} data-testid={`af-preset-${p}`} aria-pressed={s.target === p} disabled={!can} onClick={() => send({ type: "setTarget", target: p })}>{p}</button>)}
            </div>
            <p className={styles.note}>من {TARGET_MIN} إلى {TARGET_MAX}. النباتات توزَّع تلقائيًا على العدد المختار، فلا يلزم عدد محدد.</p>
          </div></ControlSlot>
          <div className={styles.field}>
            <span className={styles.lab}>الإسقاط</span>
                    <div className={styles.chips}><span className={`${styles.chip} ${styles.chipOk}`} data-testid="af-proj">جداري (الشاشة الجدارية)</span>{s.config.proj.name && <span className={styles.chip}>ملف: {s.config.proj.name}</span>}</div>
            <p className={styles.note}>مشهد بصري للمشاهدة فقط؛ لا يحتاج الطفل لمس الشاشة ولا معايرة أرضية.</p>
          </div>
          <PadBox s={s} send={send} session={session} locked={!can} />
        </div>
      <Settings config={s.config} set={(c) => send({ type: "configure", config: c })} />
      </SetupSettingsCard>

      <section className={styles.card} aria-label="المستويات" data-setup-section="levels">
        <h2>المستويات</h2>
        <div className={styles.levels} role="group" aria-label="مستويات الغابة" data-testid="af-levels">
          {LEVELS.map((lv) => (
            <button key={lv.id} type="button" className={styles.level} data-testid={`af-level-${lv.index}`} aria-pressed={s.level === lv.index} disabled={!can} onClick={() => send({ type: "selectLevel", level: lv.index })}>
              {/* real gameplay capture of this level (see docs/achievementforest3d/screenshots) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.levelImg} src={LEVEL_IMG[lv.index]} alt={`لقطة من ${lv.nameAr}`} width={640} height={360} loading="lazy" />
              <span className={styles.levelBody}>
                <span className={styles.levelNum}>المستوى {lv.index + 1} من 3</span>
                <span className={styles.levelName}>{lv.nameAr}</span>
                <span className={styles.levelEn} lang="en" dir="ltr">{lv.nameEn}</span>
                <span className={styles.levelBlurb}>{lv.blurbAr}</span>
                <span className={styles.levelMeta}>{lv.milestones.length} معلمًا ينمو</span>
              </span>
            </button>
          ))}
        </div>
        <p className={styles.note}>اختيار مستوى متقدم لا يسجّل إنجازات للمستويات السابقة.</p>
      </section>


      <section className={styles.start}>
        <p>{s.exercise ? `التمرين: ${s.exercise} · ` : ""}المستوى {s.level + 1}: {levelDef(s.level).nameAr} · الهدف {s.target} إنجازًا. راجع الإعدادات وتأكد من ظهور العرض.</p>
        <ControlSlot slot="session"><button type="button" className={`${styles.btn} ${styles.primary}`} data-testid="af-start" disabled={!can} onClick={() => send({ type: "start", at: now() })}>ابدأ النشاط</button></ControlSlot>
      </section>
    </div>
  );
}

function Play({ s, send, session, can }: { s: State; send: (c: Command) => void; session: Session; can: boolean }) {
  const [confirm, setConfirm] = useState<null | "restart" | "end">(null);
  const [showResults, setShowResults] = useState(false);
  const def = levelDef(s.level);
  const d = done(s);
  const lp = levelProgress(s.level, d, s.target);
  const sum = summary(s);
  const open = canConfirm(s) && can;
  const ended = s.status === "ended";
  const pct = Math.round((Math.min(d, s.target) / s.target) * 100);
  const gp = s.config.inputSource === "gamepad";
  return (
    <div className={styles.inner} data-testid="af-play"><ControlSlot slot="preview"><AchievementForestView state={s} connected={can} muted /></ControlSlot>
      {!ended && s.status !== "ready" && (
        <ControlSlot slot="session"><button className={`${styles.btn} ${styles.safety} ${styles.floatSafety}`} data-testid="af-safety" onClick={() => send({ type: "safety" })} aria-label="إيقاف الأمان">⛔ إيقاف الأمان</button></ControlSlot>
      )}
      <section className={styles.card}>
        <ControlSlot slot="progress"><div className={styles.chips}>
          <span className={styles.chip} data-testid="af-chip-level">المستوى {s.level + 1}: {def.nameAr}</span>
          <span className={`${styles.chip} ${s.status === "running" ? styles.chipOk : s.status === "paused" ? styles.chipWarn : ""}`} data-testid="af-chip-status">{STATUS_AR[s.status]}{s.safety && s.status === "paused" ? " · إيقاف أمان" : ""}</span>
          {s.exercise && <span className={styles.chip}>التمرين: {s.exercise}</span>}
          <span className={styles.chip}>{gp ? "ذراع تحكم" : "تأكيد على الشاشة"}</span>
          {gp && <span className={`${styles.chip} ${session.pad.status === "connected" ? styles.chipOk : styles.chipWarn}`} data-testid="af-pad-chip">{session.pad.status === "connected" ? "ذراع متصلة" : session.pad.status === "lost" ? "انقطعت الذراع" : "لا توجد ذراع"}</span>}
        </div>
        <div className={styles.counter} style={{ marginTop: 14 }} aria-live="polite">
          <span className={styles.counterNum} data-testid="af-count">{d}</span>
          <span className={styles.counterOf}>من {s.target} إنجازًا في هذا المستوى</span>
        </div>
        <div className={styles.track} role="progressbar" aria-valuemin={0} aria-valuemax={s.target} aria-valuenow={d}><div className={styles.fill} style={{ width: `${pct}%` }} /></div>

</ControlSlot>
        <div className={styles.mile} aria-label="معالم المستوى">
          {def.milestones.map((m, i) => <span key={m.id} className={`${styles.mileItem} ${i < lp.completed ? styles.mileDone : i === lp.completed && s.status !== "level-complete" ? styles.mileNow : ""}`}>{i < lp.completed ? "✓ " : ""}{m.nameAr}</span>)}
        </div>
      </section>

      {!ended && (
        <section className={styles.card}>
          {s.status === "level-complete" ? (
            <>
              <h2>🎉 {def.doneAr}</h2>
              <p className={styles.lead}>{isFinalLevel(s) ? "اكتملت المستويات الثلاثة. يمكنك إنهاء الجلسة وعرض النتائج." : `الغابة تنتظر التالي: ${LEVELS[s.level + 1].nameAr}.`}</p>
              <div className={styles.row}>
                {!isFinalLevel(s) && <ControlSlot slot="assistance"><button className={`${styles.btn} ${styles.primary}`} style={{ minHeight: 72, fontSize: 20 }} data-testid="af-continue" disabled={!can} onClick={() => send({ type: "continue", at: now() })}>المستوى التالي: {LEVELS[s.level + 1].nameAr}</button></ControlSlot>}
                <ControlSlot slot="session"><button className={`${styles.btn} ${isFinalLevel(s) ? styles.primary : ""}`} style={isFinalLevel(s) ? { minHeight: 72, fontSize: 20 } : undefined} data-testid="af-finish" disabled={!can} onClick={() => send({ type: "end", at: now() })}>{isFinalLevel(s) ? "إنهاء وعرض النتائج" : "إنهاء الجلسة هنا"}</button></ControlSlot>
                <ControlSlot slot="assistance"><button className={styles.btn} data-testid="af-undo" disabled={!can || !canUndo(s)} onClick={() => send({ type: "undo", at: now() })}>تراجع عن آخر تأكيد</button></ControlSlot>
              </div>
            </>
          ) : (
            <>
              <ControlSlot slot="assistance"><button type="button" className={styles.confirmBtn} data-testid="af-confirm" disabled={!open} onClick={() => send({ type: "confirm", at: now() })}>
                تأكيد إنجاز
                <small>{s.status === "paused" ? "اللعبة متوقفة — اضغط «متابعة» أولًا" : gp && session.pad.status === "connected" ? "أو اضغط زر الذراع" : "كل ضغطة = إنجاز واحد ينمّي جزءًا من الغابة"}</small>
              </button></ControlSlot>
              <div className={styles.row}>
                <ControlSlot slot="assistance"><button className={`${styles.btn} ${styles.assist}`} data-testid="af-assist" disabled={!open} onClick={() => send({ type: "confirm", assisted: true, at: now() })}>تأكيد إنجاز بمساعدة</button></ControlSlot>
                <ControlSlot slot="assistance"><button className={styles.btn} data-testid="af-undo" disabled={!can || !canUndo(s)} onClick={() => send({ type: "undo", at: now() })}>تراجع عن آخر تأكيد ({s.undos})</button></ControlSlot>
                <ControlSlot slot="assistance"><button className={styles.btn} data-testid="af-skip" disabled={!can || s.status !== "running"} onClick={() => send({ type: "skip", at: now() })}>تخطّي تمرين ({s.skipped})</button></ControlSlot>
              </div>
            </>
          )}
          <div className={styles.row}>
            {s.status === "running" && <ControlSlot slot="session"><button className={styles.btn} data-testid="af-pause" onClick={() => send({ type: "pause" })}>إيقاف مؤقت</button></ControlSlot>}
            {s.status === "paused" && <ControlSlot slot="session"><button className={`${styles.btn} ${styles.primary}`} data-testid="af-resume" disabled={!can} onClick={() => send({ type: "resume", at: now() })}>{s.safety ? "استئناف بعد إيقاف الأمان" : "متابعة"}</button></ControlSlot>}
            <ControlSlot slot="navigation"><button className={styles.btn} data-testid="af-restart" onClick={() => setConfirm("restart")}>إعادة البدء</button></ControlSlot>
            <ControlSlot slot="session"><button className={styles.btn} data-testid="af-end" onClick={() => setConfirm("end")}>إنهاء آمن للجلسة</button></ControlSlot>
            <button className={styles.btn} data-testid="af-results-toggle" aria-pressed={showResults} onClick={() => setShowResults((v) => !v)}>{showResults ? "إخفاء النتائج" : "عرض النتائج"}</button>
          </div>
          {confirm && (
            <ControlSlot slot="dialogs"><ControlDialog open title="تأكيد الإجراء" onClose={() => setConfirm(null)} role="alertdialog"><div className={styles.confirmBox} data-testid="af-confirm-box">
              <span>{confirm === "restart" ? "إعادة البدء تمسح إنجازات هذه الجولة ولا تُحفظ نتائجها. متأكد؟" : "إنهاء الجلسة الآن وحفظ ما تم تأكيده؟"}</span>
              <button className={`${styles.btn} ${styles.primary} ${styles.btnSm}`} data-testid="af-confirm-yes" onClick={() => { send(confirm === "restart" ? { type: "restart" } : { type: "end", at: now() }); setConfirm(null); }}>{confirm === "end" ? "إنهاء وحفظ" : "تأكيد"}</button>
              <button className={`${styles.btn} ${styles.btnSm}`} data-testid="af-confirm-no" onClick={() => setConfirm(null)}>إلغاء</button>
            </div></ControlDialog></ControlSlot>
          )}
        </section>
      )}

      {(showResults || ended) && (
        <section className={styles.card} data-testid="af-results">
          <h2>{ended ? "نتائج الجلسة" : "ملخص الجلسة حتى الآن"}</h2>
          <div className={styles.resBig}>
            <div className={styles.res}><b data-testid="af-res-confirmed">{sum.confirmed}</b><span>إنجازات مؤكدة</span></div>
            <div className={styles.res}><b data-testid="af-res-assisted">{sum.assisted}</b><span>بمساعدة الأخصائي</span></div>
            <div className={styles.res}><b data-testid="af-res-undos">{sum.undos}</b><span>مرّات التراجع</span></div>
            <div className={styles.res}><b data-testid="af-res-skipped">{sum.skipped}</b><span>تمارين متخطاة</span></div>
          </div>
          <p className={styles.note}>أعداد إنجازات أكّدها الأخصائي فقط، ومكافأة نمو الغابة بصرية؛ لا توجد درجة ولا تقييم سريري ولا قياس للحركة. المستويات المكتملة: {sum.levelsCompleted}.</p>
          <div className={styles.field} style={{ marginTop: 12 }}>
            <label htmlFor="af-notes">ملاحظات الأخصائي (اختيارية)</label>
            <textarea id="af-notes" data-testid="af-notes" maxLength={300} value={s.notes} disabled={ended} onChange={(e) => send({ type: "setNotes", notes: e.target.value })} placeholder="تُحفظ مع نتيجة الجلسة" />
          </div>
          {ended && (
            <div className={styles.row}>
              <ControlSlot slot="navigation"><button className={`${styles.btn} ${styles.primary}`} data-testid="af-new" disabled={!can} onClick={() => send({ type: "restart" })}>جلسة جديدة</button></ControlSlot>
              <Link className={styles.btn} href="/control/activities" style={{ display: "grid", placeItems: "center" }}>مكتبة الأنشطة</Link>
            </div>
          )}
        </section>
      )}

      <section className={styles.card}>
        <Settings config={s.config} set={(c) => send({ type: "configure", config: c })} />
        <div className={styles.status} role="status" data-testid="af-status">
          {session.error ?? (session.connected ? "● التحكم متصل" : "○ التحكم غير متصل")}
          <br />
          {session.displayConnected ? "● شاشة العرض متصلة" : "○ افتح شاشة العرض"}
          <br />
          {session.history === "saved" ? "✓ حُفظت الجلسة" : session.history === "walk-in" ? "جلسة زائر · دون سجل مريض" : session.history === "retry" ? "تعذّر الحفظ، تجري إعادة المحاولة" : session.history === "saving" ? "جارٍ الحفظ…" : ""}
        </div>
      </section>
    </div>
  );
}

function Panel({ s, send, session }: { s: State; send: (c: Command) => void; session: Session }) {
  const can = session.connected && !session.blocked;
  useLibraryLaunchAdapter("achievement-forest-3d", {
    modes: ["MANUAL"],
    apply: () => {
      if (!session.connected || session.blocked || !["ready", "paused"].includes(s.status)) return false;
      send({ type: "configure", config: { inputSource: "manual" } });
      return true;
    },
  });
  const setup = s.status === "ready" && !s.startedAt;
  return (
    <main className={styles.page} dir="rtl" lang="ar" data-testid="af-control" data-status={s.status} data-level={s.level} data-done={done(s)} data-target={s.target} data-run={s.run} data-seq={s.seq} data-confirmed={s.confirmed} data-assisted={s.assisted} data-undos={s.undos} data-skipped={s.skipped} data-ignored={s.ignored} data-safety={s.safety ? "1" : "0"} data-pad={session.pad.status}>
      {setup ? <Setup s={s} send={send} session={session} can={can} /> : <Play s={s} send={send} session={session} can={can} />}
    </main>
  );
}
