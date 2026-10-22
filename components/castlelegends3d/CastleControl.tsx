"use client";
import { useTherapistConfirmation } from "@/components/control/ui/TherapistConfirmation";
import { ControlSlot } from "@/components/control/ui/ControlWorkspace";
import Link from "next/link";
import { CastleView } from "./CastleView";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { useLibraryLaunchAdapter } from "@/components/control/library/launch/LibraryLaunchBoundary";
import { useCastleSession } from "@/lib/castlelegends3d/useSession";
import { GAME_ID } from "@/lib/castlelegends3d/live";
import { STAGES } from "@/lib/castlelegends3d/curriculum";
import { type Config } from "@/lib/castlelegends3d/engine";
import { TherapistSection, TherapistDisclosure, TherapistButton, TherapistStatus } from "@/components/control/ui/TherapistSurface";
import { TherapistStages } from "@/components/control/ui/TherapistStages";
import { CastleSettings } from "./CastleSettings";
import ui from "@/components/control/ui/therapist.module.css";
import styles from "./therapist.module.css";

const stages = STAGES.map((s, i) => ({ name: s.name, description: `${s.enemies.length} مواجهات · ${s.phases} مراحل للحركة`, image: `/control-stage-previews/castle/${i + 1}.webp` }));
const statusNames = { ready: "جاهز للبدء", running: "النشاط جارٍ", paused: "في استراحة", "stage-complete": "اكتملت المرحلة", ended: "انتهت الجلسة" };
export function CastleControl() {
  return isRealtimeEnabled() ? <LiveCastleControl /> : <main className={`${ui.theme} ${styles.control}`} lang="ar" dir="rtl"><h1>أسطورة قلعة شموس</h1><p>يلزم إعداد اتصال شموس المشترك لبدء جلسة متزامنة.</p><Link href="/control">مكتبة الأنشطة</Link></main>;
}
function LiveCastleControl() {
  const confirmation = useTherapistConfirmation();
  const session = useCastleSession(), { state: s, send } = session;
  useLibraryLaunchAdapter(GAME_ID, { modes: ["MANUAL"], sessionKey: s?.sessionId, apply: () => !!s && session.connected && !session.blocked && ["ready", "paused"].includes(s.status) });
  if (!s) return <main className={`${ui.theme} ${styles.control}`} lang="ar" dir="rtl"><TherapistSection title="تجهيز المغامرة"><p role="status">{session.blocked ? "توجد جلسة نشطة في نافذة أخرى." : session.error ?? "جارٍ تجهيز الرحلة…"}</p>{session.blocked && <TherapistButton onClick={() => { confirmation.ask({ title: "نقل التحكم", description: "نقل التحكم من النافذة الأخرى إلى هذه النافذة؟ يبقى تقدم الجلسة محفوظًا.", confirmLabel: "تأكيد نقل التحكم", action: () => session.takeover() }); }}>نقل التحكم</TherapistButton>}</TherapistSection>{confirmation.dialog}</main>;
  const enabled = session.connected && !session.blocked;
  const editable = ["ready", "paused", "stage-complete"].includes(s.status);
  const combat = s.status === "running" && s.phase === "encounter";
  const stage = STAGES[s.stage];
  const configure = (config: Partial<Config>) => send({ type: "configure", config });
  const settings = <CastleSettings state={s} enabled={enabled} configure={configure} />;
  const historyText = { saved: "حُفظت النتائج في سجل المريض", retry: "تعذّر الحفظ؛ تجري إعادة المحاولة. أبقِ الجلسة مفتوحة.", "walk-in": "جلسة سريعة · دون سجل مريض", saving: "جارٍ حفظ النتائج…", "not-ended": "تُحفظ النتائج عند إنهاء الجلسة" }[session.history];
  const end = () => confirmation.ask({ title: "إنهاء الجلسة وحفظ ما أُنجز؟", description: "تنتهي الجلسة ويُحفظ ما أُنجز وفق ارتباطها بملف المريض. لا تحذف هذه الخطوة المحاولات السابقة.", confirmLabel: "إنهاء وحفظ", action: () => send({ type: "end", at: Date.now() }) });
  return <main className={`${ui.theme} ${styles.control}`} lang="ar" dir="rtl" data-testid="castle-control" data-status={s.status} data-stage={s.stage}>
    {session.error && <ControlSlot slot="dialogs"><p className={ui.error} role="alert">{session.error}</p></ControlSlot>}
    {s.status === "ready" && !s.startedAt ? <div className={styles.setup}>
      <TherapistSection step="01" title="إعداد المشاركة" description="اضبط الحركة بما يناسب الطفل، وأكّد المحاولات يدويًا أثناء اللعب.">{settings}</TherapistSection>
      <TherapistSection step="02" title="اختر مستوى المغامرة" description="ثلاثة مستويات، وفي كل مستوى ثلاث مراحل من المغامرة الأصلية."><TherapistStages stages={stages} selected={s.stage} disabled={!enabled} onSelect={stage => send({ type: "stage", stage })} /></TherapistSection>
      <section className={styles.start} aria-label="بدء النشاط"><div><strong>جاهزون للمغامرة؟</strong><p>راجع مساحة الحركة وراحة الطفل قبل البدء.</p></div><ControlSlot slot="session"><TherapistButton tone="primary" disabled={!enabled} onClick={() => send({ type: "start", at: Date.now() })}>ابدأ النشاط ←</TherapistButton></ControlSlot></section>
    </div> : <>
      <div className={styles.sessionBar}><div><h2>متابعة المغامرة</h2><p>المستوى {Math.floor(s.stage / 3) + 1} · المرحلة {s.stage % 3 + 1} · {stage.name}</p></div><TherapistStatus good={s.status === "running" && enabled}>{statusNames[s.status]}</TherapistStatus></div>
      <div className={styles.live}>
        <div className={styles.previewColumn}>
          <ControlSlot slot="preview"><CastleView state={s} connected={enabled} muted /></ControlSlot>
          <TherapistSection title="مساعدة الطفل" description="راقب أداء الطفل، ثم اختر التأكيد المناسب.">
            <div className={styles.manual}><div className={styles.manualPrimary}><ControlSlot slot="assistance"><TherapistButton tone="primary" disabled={!enabled || !combat} onClick={() => send({ type: "confirm" })}>✓ تأكيد نجاح الحركة</TherapistButton></ControlSlot><ControlSlot slot="assistance"><TherapistButton disabled={!enabled || !combat} onClick={() => send({ type: "assist" })}>نجاح بمساعدة</TherapistButton></ControlSlot></div><div className={styles.manualSecondary}><ControlSlot slot="assistance"><TherapistButton disabled={!enabled || !combat} onClick={() => send({ type: "repeat" })}>إعادة عرض الحركة</TherapistButton></ControlSlot><ControlSlot slot="assistance"><TherapistButton disabled={!enabled || !combat} onClick={() => send({ type: "skip" })}>تجاوز الحركة</TherapistButton></ControlSlot></div></div>
          </TherapistSection>
        </div>
        <div className={styles.panelColumn}>
          <TherapistSection title="لوحة المعالج">
            <ControlSlot slot="progress">            <div className={styles.currentStage}><div><strong>{stage.name}</strong><p>المرحلة {s.stage + 1} من 9</p></div><span aria-hidden="true">{Math.floor(s.elapsedMs / 60000)}:{String(Math.floor(s.elapsedMs / 1000) % 60).padStart(2, "0")}</span></div>
            <div className={styles.progress} aria-label={`${s.completed.length} مراحل مكتملة من 9`}>{STAGES.map((_, i) => <span key={i} data-current={i === s.stage} data-done={s.completed.includes(i)} />)}</div>
</ControlSlot>
            <ControlSlot slot="navigation">            <nav className={styles.stageNavigation} aria-label="التنقل بين المراحل"><TherapistButton disabled={!enabled || !editable || s.stage === 0} onClick={() => send({ type: "stage", stage: s.stage - 1 })}>→ المرحلة السابقة</TherapistButton><TherapistButton disabled={!enabled || !["ready", "paused"].includes(s.status) || s.stage === 8} onClick={() => send({ type: "stage", stage: s.stage + 1 })}>المرحلة التالية ←</TherapistButton></nav>
</ControlSlot>
            <dl className={styles.stats}><div><dt>نجاح مؤكد</dt><dd>{s.attempts.filter(a => a.result === "confirmed").length}</dd></div><div><dt>بمساعدة</dt><dd>{s.attempts.filter(a => a.result === "assisted").length}</dd></div><div><dt>تجاوز</dt><dd>{s.attempts.filter(a => a.result === "skipped").length}</dd></div></dl>
            {s.status === "paused" && <p className={styles.paused}>النشاط متوقف مؤقتًا. يمكنك مراجعة الإعدادات ثم الاستئناف.</p>}
            <div className={styles.runtimeActions}>
              {["ready", "paused"].includes(s.status) && <ControlSlot slot="session"><TherapistButton tone="primary" disabled={!enabled} onClick={() => send({ type: s.status === "ready" ? "start" : "resume", at: Date.now() })}>{s.status === "ready" ? "ابدأ المرحلة" : "استئناف الرحلة"}</TherapistButton></ControlSlot>}
              {s.status === "running" && <ControlSlot slot="session"><TherapistButton tone="primary" disabled={!enabled} onClick={() => send({ type: "pause" })}>إيقاف مؤقت</TherapistButton></ControlSlot>}
              {s.status === "stage-complete" && <ControlSlot slot="settings"><TherapistButton tone="primary" disabled={!enabled} onClick={() => send({ type: "next" })}>{s.stage === 8 ? "إنهاء المغامرة وحفظ النتائج" : "المرحلة التالية"}</TherapistButton></ControlSlot>}
              {s.status !== "ended" && <ControlSlot slot="session"><TherapistButton tone="danger" disabled={!enabled} onClick={end}>إنهاء الجلسة بأمان</TherapistButton></ControlSlot>}
              {s.status === "ended" && <TherapistButton tone="primary" disabled={!enabled || !["saved", "walk-in"].includes(session.history)} onClick={() => send({ type: "new", sessionId: crypto.randomUUID() })}>جلسة جديدة بنفس الإعدادات</TherapistButton>}
            </div>
            <p className={session.history === "retry" ? styles.historyError : styles.statusLine} role="status">{historyText}</p>
          </TherapistSection>
          <TherapistDisclosure title="تغيير المرحلة وخيارات الرحلة"><label className={ui.field}>المرحلة<select className={styles.stageSelect} aria-label="المرحلة" disabled={!enabled || !editable} value={s.stage} onChange={e => send({ type: "stage", stage: Number(e.target.value) })}>{STAGES.map((stage, i) => <option key={i} value={i}>{i + 1} · {stage.name}</option>)}</select></label><p className={ui.hint}>تغيير المرحلة متاح أثناء الاستراحة أو بعد اكتمالها.</p><ControlSlot slot="navigation"><TherapistButton disabled={!enabled || s.status === "ended"} onClick={() => { confirmation.ask({ title: "إعادة المرحلة", description: "إعادة المرحلة من بدايتها؟ تُحفظ المحاولات السابقة في النتائج.", confirmLabel: "تأكيد إعادة المرحلة", action: () => send({ type: "restart" }) }); }}>إعادة المرحلة</TherapistButton></ControlSlot><ControlSlot slot="navigation"><TherapistButton disabled={!enabled || !combat} onClick={() => { confirmation.ask({ title: "تجاوز المواجهة", description: "ستُسجّل كتجاوز، دون هزيمة العدو.", confirmLabel: "تأكيد التجاوز", action: () => send({ type: "advance" }) }); }}>تجاوز المواجهة</TherapistButton></ControlSlot></TherapistDisclosure>
          <TherapistDisclosure title="إعدادات المشاركة أثناء الجلسة">{s.status === "running" && <p className={ui.hint}>أوقف النشاط مؤقتًا لتعديل الإعدادات.</p>}{settings}</TherapistDisclosure>
        </div>
      </div>
    </>}
    {confirmation.dialog}
  </main>;
}
