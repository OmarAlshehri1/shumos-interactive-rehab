"use client";
import Link from "next/link";
import Image from "next/image";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { useLibraryLaunchAdapter } from "@/components/control/library/launch/LibraryLaunchBoundary";
import { useCastleSession } from "@/lib/castlelegends3d/useSession";
import { GAME_ID } from "@/lib/castlelegends3d/live";
import { STAGES } from "@/lib/castlelegends3d/curriculum";
import { exercise, type Config } from "@/lib/castlelegends3d/engine";
import { TherapistSection, TherapistDisclosure, TherapistButton, TherapistStatus } from "@/components/control/ui/TherapistSurface";
import { TherapistStages } from "@/components/control/ui/TherapistStages";
import { CastleSettings } from "./CastleSettings";
import ui from "@/components/control/ui/therapist.module.css";
import styles from "./therapist.module.css";

const stages = STAGES.map((s, i) => ({ name: s.name, description: `${s.enemies.length} مواجهات · ${s.phases} مراحل للحركة`, image: `/control-stage-previews/castle/${i + 1}.webp` }));
const statusNames = { ready: "جاهز للبدء", running: "النشاط جارٍ", paused: "في استراحة", "stage-complete": "اكتملت المرحلة", ended: "انتهت الجلسة" };
const phaseNames = { intro: "الاستعداد للمغامرة", travel: "يتقدم البطل نحو المواجهة", encounter: "بانتظار تأكيد المعالج", attack: "تنفيذ الحركة المؤكدة", defeat: "نهاية المواجهة", victory: "الاحتفال بإنجاز المرحلة" };
export function CastleControl() {
  return isRealtimeEnabled() ? <LiveCastleControl /> : <main className={`${ui.theme} ${styles.control}`} lang="ar" dir="rtl"><h1>أسطورة قلعة شموس</h1><p>يلزم إعداد اتصال شموس المشترك لبدء جلسة متزامنة.</p><Link href="/control">مكتبة الأنشطة</Link></main>;
}
function LiveCastleControl() {
  const session = useCastleSession(), { state: s, send } = session;
  useLibraryLaunchAdapter(GAME_ID, { modes: ["MANUAL"], sessionKey: s?.sessionId, apply: () => !!s && session.connected && !session.blocked && ["ready", "paused"].includes(s.status) });
  if (!s) return <main className={`${ui.theme} ${styles.control}`} lang="ar" dir="rtl"><TherapistSection title="تجهيز المغامرة"><p role="status">{session.blocked ? "توجد جلسة نشطة في نافذة أخرى." : session.error ?? "جارٍ تجهيز الرحلة…"}</p>{session.blocked && <TherapistButton onClick={() => { if (window.confirm("نقل التحكم من النافذة الأخرى إلى هذه النافذة؟")) session.takeover(); }}>نقل التحكم</TherapistButton>}</TherapistSection></main>;
  const enabled = session.connected && !session.blocked;
  const editable = ["ready", "paused", "stage-complete"].includes(s.status);
  const combat = s.status === "running" && s.phase === "encounter";
  const prompt = exercise(s), stage = STAGES[s.stage];
  const configure = (config: Partial<Config>) => send({ type: "configure", config });
  const settings = <CastleSettings state={s} enabled={enabled} configure={configure} />;
  const historyText = { saved: "حُفظت النتائج في سجل المريض", retry: "تعذّر الحفظ؛ تجري إعادة المحاولة. أبقِ الجلسة مفتوحة.", "walk-in": "جلسة سريعة · دون سجل مريض", saving: "جارٍ حفظ النتائج…", "not-ended": "تُحفظ النتائج عند إنهاء الجلسة" }[session.history];
  const end = () => { if (window.confirm("إنهاء الجلسة وحفظ ما أُنجز؟")) send({ type: "end", at: Date.now() }); };
  return <main className={`${ui.theme} ${styles.control}`} lang="ar" dir="rtl" data-testid="castle-control" data-status={s.status} data-stage={s.stage}>
    {session.error && <p className={ui.error} role="alert">{session.error}</p>}
    {s.status === "ready" && !s.startedAt ? <div className={styles.setup}>
      <TherapistSection step="01" title="إعداد المشاركة" description="اضبط الحركة بما يناسب الطفل، وأكّد المحاولات يدويًا أثناء اللعب.">{settings}</TherapistSection>
      <TherapistSection step="02" title="اختر مستوى المغامرة" description="ثلاثة مستويات، وفي كل مستوى ثلاث مراحل من المغامرة الأصلية."><TherapistStages stages={stages} selected={s.stage} disabled={!enabled} onSelect={stage => send({ type: "stage", stage })} /></TherapistSection>
      <section className={styles.start} aria-label="بدء النشاط"><div><strong>جاهزون للمغامرة؟</strong><p>راجع مساحة الحركة وراحة الطفل قبل البدء.</p></div><TherapistButton tone="primary" disabled={!enabled} onClick={() => send({ type: "start", at: Date.now() })}>ابدأ النشاط ←</TherapistButton></section>
    </div> : <>
      <div className={styles.sessionBar}><div><h2>متابعة المغامرة</h2><p>المستوى {Math.floor(s.stage / 3) + 1} · المرحلة {s.stage % 3 + 1} · {stage.name}</p></div><TherapistStatus good={s.status === "running" && enabled}>{statusNames[s.status]}</TherapistStatus></div>
      <div className={styles.live}>
        <div className={styles.previewColumn}>
          <TherapistSection title="متابعة شاشة الطفل">
            <div className={styles.liveTop}><TherapistStatus good={session.displayConnected}>{session.displayConnected ? "شاشة الطفل متصلة" : "شاشة الطفل غير متصلة"}</TherapistStatus><TherapistStatus good={enabled}>{enabled ? "التحكم متصل" : "التحكم غير متصل"}</TherapistStatus></div>
            <div className={styles.preview} data-testid="castle-live-preview" data-phase={s.phase} data-demonstration={s.demonstration}>
              <div className={styles.previewPicture}><Image src={stages[s.stage].image} width={640} height={360} alt={`صورة المرحلة: ${stage.name}`} sizes="(max-width:900px) 95vw, 55vw" /><span>صورة المرحلة · متابعة الحالة أدناه مباشرة</span></div>
              <div className={styles.previewInfo}><p>{s.status === "running" ? phaseNames[s.phase] : statusNames[s.status]}</p><h3>{["encounter", "attack", "defeat"].includes(s.phase) ? prompt.name : s.status === "stage-complete" ? stage.reward : stage.name}</h3><strong>المواجهة {s.encounter + 1} من {stage.enemies.length} · المتبقي {s.health} من {s.maxHealth} حركات</strong>{s.lastOutcome && <p role="status">آخر محاولة: {({ confirmed: "نجاح مؤكد", assisted: "نجاح بمساعدة", skipped: "تجاوز الحركة" })[s.lastOutcome]}</p>}</div>
            </div>
          </TherapistSection>
          <TherapistSection title="مساعدة الطفل" description="راقب أداء الطفل، ثم اختر التأكيد المناسب.">
            <div className={styles.manual}><div className={styles.manualPrimary}><TherapistButton tone="primary" disabled={!enabled || !combat} onClick={() => send({ type: "confirm" })}>✓ تأكيد نجاح الحركة</TherapistButton><TherapistButton disabled={!enabled || !combat} onClick={() => send({ type: "assist" })}>نجاح بمساعدة</TherapistButton></div><div className={styles.manualSecondary}><TherapistButton disabled={!enabled || !combat} onClick={() => send({ type: "repeat" })}>إعادة عرض الحركة</TherapistButton><TherapistButton disabled={!enabled || !combat} onClick={() => send({ type: "skip" })}>تجاوز الحركة</TherapistButton></div></div>
          </TherapistSection>
        </div>
        <div className={styles.panelColumn}>
          <TherapistSection title="لوحة المعالج">
            <div className={styles.currentStage}><div><strong>{stage.name}</strong><p>المرحلة {s.stage + 1} من 9</p></div><span aria-hidden="true">{Math.floor(s.elapsedMs / 60000)}:{String(Math.floor(s.elapsedMs / 1000) % 60).padStart(2, "0")}</span></div>
            <div className={styles.progress} aria-label={`${s.completed.length} مراحل مكتملة من 9`}>{STAGES.map((_, i) => <span key={i} data-current={i === s.stage} data-done={s.completed.includes(i)} />)}</div>
            <nav className={styles.stageNavigation} aria-label="التنقل بين المراحل"><TherapistButton disabled={!enabled || !editable || s.stage === 0} onClick={() => send({ type: "stage", stage: s.stage - 1 })}>→ المرحلة السابقة</TherapistButton><TherapistButton disabled={!enabled || !["ready", "paused"].includes(s.status) || s.stage === 8} onClick={() => send({ type: "stage", stage: s.stage + 1 })}>المرحلة التالية ←</TherapistButton></nav>
            <dl className={styles.stats}><div><dt>نجاح مؤكد</dt><dd>{s.attempts.filter(a => a.result === "confirmed").length}</dd></div><div><dt>بمساعدة</dt><dd>{s.attempts.filter(a => a.result === "assisted").length}</dd></div><div><dt>تجاوز</dt><dd>{s.attempts.filter(a => a.result === "skipped").length}</dd></div></dl>
            {s.status === "paused" && <p className={styles.paused}>النشاط متوقف مؤقتًا. يمكنك مراجعة الإعدادات ثم الاستئناف.</p>}
            <div className={styles.runtimeActions}>
              {["ready", "paused"].includes(s.status) && <TherapistButton tone="primary" disabled={!enabled} onClick={() => send({ type: s.status === "ready" ? "start" : "resume", at: Date.now() })}>{s.status === "ready" ? "ابدأ المرحلة" : "استئناف الرحلة"}</TherapistButton>}
              {s.status === "running" && <TherapistButton tone="primary" disabled={!enabled} onClick={() => send({ type: "pause" })}>إيقاف مؤقت</TherapistButton>}
              {s.status === "stage-complete" && <TherapistButton tone="primary" disabled={!enabled} onClick={() => send({ type: "next" })}>{s.stage === 8 ? "إنهاء المغامرة وحفظ النتائج" : "المرحلة التالية"}</TherapistButton>}
              {s.status !== "ended" && <TherapistButton tone="danger" disabled={!enabled} onClick={end}>إنهاء الجلسة بأمان</TherapistButton>}
              {s.status === "ended" && <TherapistButton tone="primary" disabled={!enabled || !["saved", "walk-in"].includes(session.history)} onClick={() => send({ type: "new", sessionId: crypto.randomUUID() })}>جلسة جديدة بنفس الإعدادات</TherapistButton>}
            </div>
            <p className={session.history === "retry" ? styles.historyError : styles.statusLine} role="status">{historyText}</p>
          </TherapistSection>
          <TherapistDisclosure title="تغيير المرحلة وخيارات الرحلة"><label className={ui.field}>المرحلة<select className={styles.stageSelect} aria-label="المرحلة" disabled={!enabled || !editable} value={s.stage} onChange={e => send({ type: "stage", stage: Number(e.target.value) })}>{STAGES.map((stage, i) => <option key={i} value={i}>{i + 1} · {stage.name}</option>)}</select></label><p className={ui.hint}>تغيير المرحلة متاح أثناء الاستراحة أو بعد اكتمالها.</p><TherapistButton disabled={!enabled || s.status === "ended"} onClick={() => { if (window.confirm("إعادة المرحلة من بدايتها؟ تُحفظ المحاولات السابقة في النتائج.")) send({ type: "restart" }); }}>إعادة المرحلة</TherapistButton><TherapistButton disabled={!enabled || !combat} onClick={() => { if (window.confirm("تجاوز هذه المواجهة؟ ستُسجّل كتجاوز، دون هزيمة العدو.")) send({ type: "advance" }); }}>تجاوز المواجهة</TherapistButton></TherapistDisclosure>
          <TherapistDisclosure title="إعدادات المشاركة أثناء الجلسة">{s.status === "running" && <p className={ui.hint}>أوقف النشاط مؤقتًا لتعديل الإعدادات.</p>}{settings}</TherapistDisclosure>
        </div>
      </div>
    </>}
  </main>;
}
