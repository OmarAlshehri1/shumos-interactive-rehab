"use client";
import Link from "next/link";
import { useState } from "react";
import { useLibraryLaunchAdapter } from "@/components/control/library/launch/LibraryLaunchBoundary";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { canConfirm, canUndo, done, isFinalLevel, summary, TARGET_MAX, TARGET_MIN, type Command, type State } from "@/lib/oceanwonders/engine";
import { LEVELS, levelDef, levelProgress } from "@/lib/oceanwonders/milestones";
import { useOceanWondersSession } from "@/lib/oceanwonders/useSession";
import { Settings } from "./Settings";
import styles from "./control.module.css";

const NAME = "عالم المحيط";
const STATUS_AR = { ready: "جاهز للبدء", running: "قيد التنفيذ", paused: "متوقف مؤقتًا", "level-complete": "اكتمل المستوى", ended: "انتهت الجلسة" } as const;
const EXAMPLES = ["الخطو على بصمات القدم", "المشي حول الأقماع", "قفز بتوجيه المعالج", "الوقوف من الجلوس", "تمارين الوصول", "تمارين التوازن"];
const PRESETS = [6, 10, 15, 20];
const LEVEL_IMG = ["/control-stage-previews/ocean-wonders/1.webp", "/control-stage-previews/ocean-wonders/2.webp", "/control-stage-previews/ocean-wonders/3.webp"];

export function OceanWondersControl() {
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
  const session = useOceanWondersSession();
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

type Session = ReturnType<typeof useOceanWondersSession>;
const now = () => Date.now();

function PadBox({ s, send, session, locked }: { s: State; send: (c: Command) => void; session: Session; locked: boolean }) {
  const gp = s.config.inputSource === "gamepad";
  const st = session.pad.status;
  return (
    <div className={styles.field} data-testid="ow-input">
      <span className={styles.lab}>طريقة التأكيد</span>
      <div className={styles.seg} role="group" aria-label="طريقة التأكيد">
        <button type="button" className={styles.segBtn} data-testid="ow-input-manual" aria-pressed={!gp} onClick={() => send({ type: "configure", config: { inputSource: "manual" } })}>زر التأكيد على الشاشة</button>
        <button type="button" className={styles.segBtn} data-testid="ow-input-gamepad" aria-pressed={gp} onClick={() => send({ type: "configure", config: { inputSource: "gamepad" } })}>ذراع تحكم بيد المعالج</button>
      </div>
      {gp && (
        <div className={styles.note} data-testid="ow-pad">
          <span data-testid="ow-pad-status" data-status={st}>
            {st === "connected" ? "● ذراع التحكم متصلة" : st === "lost" ? "○ انقطع اتصال الذراع — استخدم زر التأكيد على الشاشة" : "○ لم يُكتشف ذراع تحكم بعد: اضغط أي زر عليها. زر التأكيد على الشاشة يعمل دائمًا."}
          </span>
          <br />
          الزر المعيّن: رقم {session.pad.mapping.button + 1}{" "}
          <button type="button" className={`${styles.btn} ${styles.btnSm}`} data-testid="ow-pad-learn" disabled={locked && s.status === "running"} onClick={() => (session.pad.learning ? session.cancelLearn() : session.learnButton())}>
            {session.pad.learning ? "اضغط الزر المطلوب الآن… (إلغاء)" : "تعيين زر التأكيد"}
          </button>
          <br />
          كل ضغطة = إنجاز واحد يؤكّده المعالج. الضغط المطوّل لا يكرّر، والضغطات السريعة جدًا تُعدّ مرة واحدة. الذراع لا تقيس الحركة ولا تثبت صحة التمرين.
        </div>
      )}
    </div>
  );
}

function Setup({ s, send, session, can }: { s: State; send: (c: Command) => void; session: Session; can: boolean }) {
  return (
    <div className={styles.inner} data-testid="ow-setup-screen">
      <section className={styles.card}>
        <h2>{NAME}</h2>
        <p className={styles.lead}>
          مكافأة بصرية لتمرين حقيقي يختاره المعالج. يؤدي الطفل التمرين بجسمه، ويؤكّد المعالج الإنجاز، فينمو محيط واحد متصل عبر ثلاثة مستويات. اللعبة لا تصف تمرينًا علاجيًا ولا تقيس الحركة ولا تقيّم الأداء، ولا تحتاج إلى أي حساس.
        </p>
        <div className={styles.fields}>
          <div className={styles.field}>
            <label htmlFor="ow-exercise">اسم التمرين</label>
            <input id="ow-exercise" type="text" list="ow-ex" maxLength={60} data-testid="ow-exercise" placeholder="مثال: الوقوف من الجلوس" value={s.exercise} disabled={!can} onChange={(e) => send({ type: "setExercise", exercise: e.target.value })} />
            <datalist id="ow-ex">{EXAMPLES.map((x) => <option key={x} value={x} />)}</datalist>
            <p className={styles.note}>أمثلة فقط: يختار المعالج التمرين المناسب ويشرف عليه.</p>
          </div>
          <div className={styles.field}>
            <span className={styles.lab}>عدد الإنجازات المطلوب في كل مستوى</span>
            <div className={styles.stepper}>
              <button type="button" className={styles.stepBtn} aria-label="أنقص" data-testid="ow-target-dec" disabled={!can || s.target <= TARGET_MIN} onClick={() => send({ type: "setTarget", target: s.target - 1 })}>−</button>
              <span className={styles.stepVal} data-testid="ow-target" aria-live="polite">{s.target}</span>
              <button type="button" className={styles.stepBtn} aria-label="زد" data-testid="ow-target-inc" disabled={!can || s.target >= TARGET_MAX} onClick={() => send({ type: "setTarget", target: s.target + 1 })}>+</button>
            </div>
            <div className={styles.seg}>
              {PRESETS.map((p) => <button key={p} type="button" className={styles.segBtn} data-testid={`ow-preset-${p}`} aria-pressed={s.target === p} disabled={!can} onClick={() => send({ type: "setTarget", target: p })}>{p}</button>)}
            </div>
            <p className={styles.note}>من {TARGET_MIN} إلى {TARGET_MAX}. المعالم توزَّع تلقائيًا على العدد المختار، فلا يلزم عدد محدد.</p>
          </div>
          <div className={styles.field}>
            <span className={styles.lab}>الإسقاط</span>
            <div className={styles.chips}><span className={`${styles.chip} ${styles.chipOk}`} data-testid="ow-proj">جداري (الشاشة الجدارية)</span>{s.config.proj.name && <span className={styles.chip}>ملف: {s.config.proj.name}</span>}</div>
            <p className={styles.note}>مشهد بصري للمشاهدة فقط؛ لا يحتاج الطفل لمس الشاشة ولا معايرة أرضية.</p>
          </div>
          <PadBox s={s} send={send} session={session} locked={!can} />
        </div>
      </section>

      <section className={styles.card} aria-label="اختيار المستوى">
        <h2>اختر المستوى</h2>
        <div className={styles.levels} role="group" aria-label="مستويات المحيط" data-testid="ow-levels">
          {LEVELS.map((lv) => (
            <button key={lv.id} type="button" className={styles.level} data-testid={`ow-level-${lv.index}`} aria-pressed={s.level === lv.index} disabled={!can} onClick={() => send({ type: "selectLevel", level: lv.index })}>
              {/* real gameplay capture of this level (see docs/oceanwonders3d/screenshots) */}
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
        <p className={styles.note}>المستويات الثلاثة محيط واحد ينمو: تبدأ بالمستوى الذي تختاره. اختيار المستوى الثاني أو الثالث يعرض ما قبله مكتملًا بصريًا فقط، دون تسجيل أي إنجاز أو نتيجة لم تحدث.</p>
      </section>

      <Settings config={s.config} set={(c) => send({ type: "configure", config: c })} />

      <section className={styles.start}>
        <p>{s.exercise ? `التمرين: ${s.exercise} · ` : ""}المستوى {s.level + 1}: {levelDef(s.level).nameAr} · الهدف {s.target} إنجازًا. راجع الإعدادات وتأكد من ظهور العرض.</p>
        <button type="button" className={`${styles.btn} ${styles.primary}`} data-testid="ow-start" disabled={!can} onClick={() => send({ type: "start", at: now() })}>ابدأ النشاط</button>
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
    <div className={styles.inner} data-testid="ow-play">
      {!ended && s.status !== "ready" && (
        <button className={`${styles.btn} ${styles.safety} ${styles.floatSafety}`} data-testid="ow-safety" onClick={() => send({ type: "safety" })} aria-label="إيقاف الأمان">⛔ إيقاف الأمان</button>
      )}
      <section className={styles.card}>
        <div className={styles.chips}>
          <span className={styles.chip} data-testid="ow-chip-level">المستوى {s.level + 1}: {def.nameAr}</span>
          <span className={`${styles.chip} ${s.status === "running" ? styles.chipOk : s.status === "paused" ? styles.chipWarn : ""}`} data-testid="ow-chip-status">{STATUS_AR[s.status]}{s.safety && s.status === "paused" ? " · إيقاف أمان" : ""}</span>
          {s.exercise && <span className={styles.chip}>التمرين: {s.exercise}</span>}
          <span className={styles.chip}>{gp ? "ذراع تحكم" : "تأكيد على الشاشة"}</span>
          {gp && <span className={`${styles.chip} ${session.pad.status === "connected" ? styles.chipOk : styles.chipWarn}`} data-testid="ow-pad-chip">{session.pad.status === "connected" ? "ذراع متصلة" : session.pad.status === "lost" ? "انقطعت الذراع" : "لا توجد ذراع"}</span>}
        </div>
        <div className={styles.counter} style={{ marginTop: 14 }} aria-live="polite">
          <span className={styles.counterNum} data-testid="ow-count">{d}</span>
          <span className={styles.counterOf}>من {s.target} إنجازًا في هذا المستوى</span>
        </div>
        <div className={styles.track} role="progressbar" aria-valuemin={0} aria-valuemax={s.target} aria-valuenow={d}><div className={styles.fill} style={{ width: `${pct}%` }} /></div>
        <div className={styles.mile} aria-label="معالم المستوى">
          {def.milestones.map((m, i) => <span key={m.id} className={`${styles.mileItem} ${i < lp.completed ? styles.mileDone : i === lp.completed && s.status !== "level-complete" ? styles.mileNow : ""}`}>{i < lp.completed ? "✓ " : ""}{m.nameAr}</span>)}
        </div>
      </section>

      {!ended && (
        <section className={styles.card}>
          {s.status === "level-complete" ? (
            <>
              <h2>🎉 {def.doneAr}</h2>
              <p className={styles.lead}>{isFinalLevel(s) ? "اكتملت مستويات المحيط الثلاثة. يمكنك إنهاء الجلسة وعرض النتائج." : `المحيط ينتظر التالي: ${LEVELS[s.level + 1].nameAr}.`}</p>
              <div className={styles.row}>
                {!isFinalLevel(s) && <button className={`${styles.btn} ${styles.primary}`} style={{ minHeight: 72, fontSize: 20 }} data-testid="ow-continue" disabled={!can} onClick={() => send({ type: "continue", at: now() })}>المستوى التالي: {LEVELS[s.level + 1].nameAr}</button>}
                <button className={`${styles.btn} ${isFinalLevel(s) ? styles.primary : ""}`} style={isFinalLevel(s) ? { minHeight: 72, fontSize: 20 } : undefined} data-testid="ow-finish" disabled={!can} onClick={() => send({ type: "end", at: now() })}>{isFinalLevel(s) ? "إنهاء وعرض النتائج" : "إنهاء الجلسة هنا"}</button>
                <button className={styles.btn} data-testid="ow-undo" disabled={!can || !canUndo(s)} onClick={() => send({ type: "undo", at: now() })}>تراجع عن آخر تأكيد</button>
              </div>
            </>
          ) : (
            <>
              <button type="button" className={styles.confirmBtn} data-testid="ow-confirm" disabled={!open} onClick={() => send({ type: "confirm", at: now() })}>
                تأكيد إنجاز
                <small>{s.status === "paused" ? "اللعبة متوقفة — اضغط «متابعة» أولًا" : gp && session.pad.status === "connected" ? "أو اضغط زر الذراع" : "كل ضغطة = إنجاز واحد ينمّي عالم المحيط"}</small>
              </button>
              <div className={styles.row}>
                <button className={`${styles.btn} ${styles.assist}`} data-testid="ow-assist" disabled={!open} onClick={() => send({ type: "confirm", assisted: true, at: now() })}>تأكيد إنجاز بمساعدة</button>
                <button className={styles.btn} data-testid="ow-undo" disabled={!can || !canUndo(s)} onClick={() => send({ type: "undo", at: now() })}>تراجع عن آخر تأكيد ({s.undos})</button>
                <button className={styles.btn} data-testid="ow-skip" disabled={!can || s.status !== "running"} onClick={() => send({ type: "skip", at: now() })}>تخطّي تمرين ({s.skipped})</button>
              </div>
            </>
          )}
          <div className={styles.row}>
            {s.status === "running" && <button className={styles.btn} data-testid="ow-pause" onClick={() => send({ type: "pause" })}>إيقاف مؤقت</button>}
            {s.status === "paused" && <button className={`${styles.btn} ${styles.primary}`} data-testid="ow-resume" disabled={!can} onClick={() => send({ type: "resume", at: now() })}>{s.safety ? "استئناف بعد إيقاف الأمان" : "متابعة"}</button>}
            <button className={styles.btn} data-testid="ow-restart" onClick={() => setConfirm("restart")}>إعادة البدء</button>
            <button className={styles.btn} data-testid="ow-end" onClick={() => setConfirm("end")}>إنهاء آمن للجلسة</button>
            <button className={styles.btn} data-testid="ow-results-toggle" aria-pressed={showResults} onClick={() => setShowResults((v) => !v)}>{showResults ? "إخفاء النتائج" : "عرض النتائج"}</button>
          </div>
          {confirm && (
            <div className={styles.confirmBox} role="alertdialog" data-testid="ow-confirm-box">
              <span>{confirm === "restart" ? "إعادة البدء تمسح إنجازات هذه الجولة ولا تُحفظ نتائجها. متأكد؟" : "إنهاء الجلسة الآن وحفظ ما تم تأكيده؟"}</span>
              <button className={`${styles.btn} ${styles.primary} ${styles.btnSm}`} data-testid="ow-confirm-yes" onClick={() => { send(confirm === "restart" ? { type: "restart" } : { type: "end", at: now() }); setConfirm(null); }}>نعم</button>
              <button className={`${styles.btn} ${styles.btnSm}`} data-testid="ow-confirm-no" onClick={() => setConfirm(null)}>لا</button>
            </div>
          )}
        </section>
      )}

      {(showResults || ended) && (
        <section className={styles.card} data-testid="ow-results">
          <h2>{ended ? "نتائج الجلسة" : "ملخص الجلسة حتى الآن"}</h2>
          <div className={styles.resBig}>
            <div className={styles.res}><b data-testid="ow-res-confirmed">{sum.confirmed}</b><span>إنجازات مؤكدة</span></div>
            <div className={styles.res}><b data-testid="ow-res-assisted">{sum.assisted}</b><span>بمساعدة المعالج</span></div>
            <div className={styles.res}><b data-testid="ow-res-undos">{sum.undos}</b><span>مرّات التراجع</span></div>
            <div className={styles.res}><b data-testid="ow-res-skipped">{sum.skipped}</b><span>تمارين متخطاة</span></div>
          </div>
          <p className={styles.note}>أعداد إنجازات أكّدها المعالج فقط، ومكافأة نمو المحيط بصرية؛ لا توجد درجة ولا تقييم سريري ولا قياس للحركة. المستويات المكتملة: {sum.levelsCompleted}.</p>
          <div className={styles.field} style={{ marginTop: 12 }}>
            <label htmlFor="ow-notes">ملاحظات المعالج (اختيارية)</label>
            <textarea id="ow-notes" data-testid="ow-notes" maxLength={300} value={s.notes} onChange={(e) => send({ type: "setNotes", notes: e.target.value })} placeholder="تُحفظ مع نتيجة الجلسة" />
          </div>
          {ended && (
            <div className={styles.row}>
              <button className={`${styles.btn} ${styles.primary}`} data-testid="ow-new" disabled={!can} onClick={() => send({ type: "restart" })}>جلسة جديدة</button>
              <Link className={styles.btn} href="/control/activities" style={{ display: "grid", placeItems: "center" }}>مكتبة الأنشطة</Link>
            </div>
          )}
        </section>
      )}

      <section className={styles.card}>
        <Settings config={s.config} set={(c) => send({ type: "configure", config: c })} />
        <div className={styles.status} role="status" data-testid="ow-status">
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
  useLibraryLaunchAdapter("ocean-wonders-3d", {
    modes: ["MANUAL"],
    apply: () => {
      if (!session.connected || session.blocked || !["ready", "paused"].includes(s.status)) return false;
      send({ type: "configure", config: { inputSource: "manual" } });
      return true;
    },
  });
  const setup = s.status === "ready" && !s.startedAt;
  return (
    <main className={styles.page} dir="rtl" lang="ar" data-testid="ow-control" data-status={s.status} data-level={s.level} data-done={done(s)} data-target={s.target} data-run={s.run} data-seq={s.seq} data-confirmed={s.confirmed} data-assisted={s.assisted} data-undos={s.undos} data-skipped={s.skipped} data-ignored={s.ignored} data-safety={s.safety ? "1" : "0"} data-pad={session.pad.status}>
      {setup ? <Setup s={s} send={send} session={session} can={can} /> : <Play s={s} send={send} session={session} can={can} />}
    </main>
  );
}
