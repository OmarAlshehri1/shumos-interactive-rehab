"use client";
import { useLibraryLaunchAdapter } from "@/components/control/library/launch/LibraryLaunchBoundary";
import Link from "next/link";
import { useState } from "react";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import {
  activeStep,
  canConfirm,
  countdownLeft,
  currentRound,
  movesDone,
  movesTotal,
  previewLeft,
  sequencesDone,
  stat,
  summary,
  type Command,
  type State,
} from "@/lib/bodysequence3d/engine";
import { guideOf, stepShort, stepText } from "@/lib/bodysequence3d/captions";
import { LEVELS, MODE_LABEL_AR, STAGES } from "@/lib/bodysequence3d/stages";
import { useBodySequenceSession } from "@/lib/bodysequence3d/useSession";
import { LaneMap } from "./LaneMap";
import { Settings } from "./Settings";
import { GameSetupLayout } from "@/components/control/setup/GameSetupLayout";
import styles from "./control.module.css";

const STATUS_AR = {
  ready: "جاهز للبدء",
  running: "يعمل",
  paused: "متوقف مؤقتًا",
  "stage-complete": "اكتملت المرحلة",
  ended: "انتهت الجلسة",
} as const;
const NAME = "تحدي الجسم الذكي";

export function BodySequenceControl() {
  return isRealtimeEnabled() ? (
    <LiveBodySequenceControl />
  ) : (
    <main className={styles.page} dir="rtl" lang="ar">
      <div className={styles.inner}>
        <h1 className={styles.title}>{NAME}</h1>
        <p>يلزم إعداد اتصال المنصة المشتركة لفتح جلسة متزامنة.</p>
        <Link href="/control">مكتبة الأنشطة</Link>
      </div>
    </main>
  );
}

function LiveBodySequenceControl() {
  const session = useBodySequenceSession();
  const { state: s, send } = session;
  if (!s) {
    return (
      <main className={styles.page} dir="rtl" lang="ar">
        <div className={styles.inner}>
          <h1 className={styles.title}>{NAME}</h1>
          <p role="status">
            {session.blocked
              ? "هذه الجلسة تعمل في نافذة أخرى. أغلقها ثم أعد المحاولة."
              : (session.error ?? "جاري تجهيز الجلسة المشتركة…")}
          </p>
          <Link href="/control">مكتبة الأنشطة</Link>
        </div>
      </main>
    );
  }
  return <Panel s={s} send={send} session={session} />;
}

const OUTCOME_CLASS = {
  confirmed: styles.seqDone,
  assisted: styles.seqAssist,
  skipped: styles.seqSkip,
  pending: "",
} as const;
const OUTCOME_MARK = {
  confirmed: "✓",
  assisted: "✓ بمساعدة",
  skipped: "متخطاة",
  pending: "",
} as const;

function Current({
  s,
  send,
  can,
}: {
  s: State;
  send: (c: Command) => void;
  can: boolean;
}) {
  const live = s.status === "running" || s.status === "paused";
  const round = currentRound(s);
  const idx = activeStep(s);
  const g = guideOf(s);
  const res = stat(s).res[s.round] ?? [];
  if (!live) return null;
  const step = round.steps[idx];
  const cd = Math.ceil(countdownLeft(s) / 1000);
  const open = canConfirm(s) && can;
  const hold = s.hold;
  const holdLeft = hold ? Math.max(0, hold.ms - (s.clock - hold.startedAt)) : 0;
  const previewing = s.phase === "preview" && s.inter === 0 && cd === 0;
  const between = s.inter > 0;
  return (
    <div
      className={styles.current}
      data-testid="bs-current"
      data-round={s.round}
      data-step={idx}
      data-phase={g.phase}
      data-mode={round.mode}
      data-holding={hold ? "1" : "0"}
      data-foot={step?.foot ?? ""}
      data-lane={step?.lane ?? ""}
      data-move={step?.move ?? ""}
    >
      <div className={styles.currentTitle}>
        الترتيب {s.round + 1} من {STAGES[s.stage].rounds.length} ·{" "}
        {MODE_LABEL_AR[round.mode]}
      </div>
      <div
        className={styles.seqRow}
        data-testid="bs-seq-list"
        aria-label="ترتيب الحركات"
      >
        {round.steps.map((st, i) => (
          <span
            key={st.id}
            className={`${styles.seqStep} ${OUTCOME_CLASS[res[i] ?? "pending"]} ${i === idx ? styles.seqNow : ""}`}
            data-testid={`bs-seqstep-${i}`}
            data-outcome={res[i] ?? "pending"}
            data-foot={st.foot}
            data-lane={st.lane}
          >
            <span className={styles.seqNum}>{i + 1}</span>
            {stepShort(st)}
            {res[i] && res[i] !== "pending" ? (
              <small>{OUTCOME_MARK[res[i]]}</small>
            ) : null}
          </span>
        ))}
      </div>
      {step && !between && (
        <div className={styles.currentText}>
          <span
            className={styles.pill}
            style={{
              ["--c" as string]: step.move === "stop" ? "#ff5a5f" : "#ff9a1f",
            }}
          >
            {stepText(step)}
          </span>
        </div>
      )}
      {cd > 0 && (
        <div className={styles.banner} role="status">
          العدّ التنازلي {cd}… يُفتح التأكيد بعده.
        </div>
      )}
      {previewing && (
        <div
          className={styles.banner}
          role="status"
          data-testid="bs-previewing"
        >
          معاينة الترتيب جارية على الشاشة ({Math.ceil(previewLeft(s) / 1000)}{" "}
          ث): يحفظ الطفل الترتيب ثم ينفّذه. التأكيد مغلق أثناء المعاينة.
          <button
            type="button"
            className={`${styles.btn} ${styles.btnSm}`}
            data-testid="bs-endpreview"
            style={{ marginInlineStart: 8 }}
            disabled={!can}
            onClick={() => send({ type: "endPreview" })}
          >
            ابدأ التنفيذ الآن
          </button>
        </div>
      )}
      {between && (
        <div className={styles.banner} role="status" data-testid="bs-between">
          اكتمل الترتيب! الآلة تضيء ثم يبدأ الترتيب التالي تلقائيًا.
        </div>
      )}
      {round.mode === "remember" && !previewing && !between && cd === 0 && (
        <div className={styles.note}>
          وضع التذكّر: الشاشة تُخفي الحركة الحالية
          {s.config.hints ? " (التلميحات مفعّلة فهي ظاهرة)" : ""}. أنت ترى
          الترتيب كاملًا هنا. لا عقاب على النسيان: «أعد العرض» يكرّر المعاينة.
        </div>
      )}
      {step?.move === "stop" && !hold && !between && (
        <div className={styles.note}>
          إشارة التوقف ظاهرة. عندما يقف الطفل ثابتًا اضغط «تأكيد»
          {step.holdMs ? `: تبدأ وقفة ${step.holdMs / 1000} ثوانٍ بالساعة` : ""}{" "}
          ثم تظهر إشارة «تابع». لا سرعة مطلوبة.
        </div>
      )}
      {step?.anchor && !hold && !between && (
        <div className={styles.note}>
          القدم {step.anchor.foot === "R" ? "اليمنى" : "اليسرى"} تبقى في مكانها
          ({step.anchor.lane === "R" ? "الممر الأيمن" : "الممر الأيسر"}) والأخرى
          تتحرك. عند التأكيد تبدأ وقفة قصيرة
          {step.holdMs ? ` ${step.holdMs / 1000} ث` : ""}.
        </div>
      )}
      {hold && (
        <>
          <div className={styles.bar} aria-label="تقدّم الوقفة">
            <div
              className={styles.barFill}
              data-testid="bs-holdbar"
              style={{
                width: `${Math.round(Math.min(1, (s.clock - hold.startedAt) / hold.ms) * 100)}%`,
              }}
            />
          </div>
          <div className={styles.note}>
            الوقفة جارية · متبقٍّ {Math.ceil(holdLeft / 1000)} ث. تنتهي
            تلقائيًا؛ أو أنهِها الآن، أو اضغط «محاولة غير صحيحة» إذا تحرّك
            الطفل.
          </div>
        </>
      )}
      <div className={styles.actions}>
        {hold ? (
          <>
            <button
              type="button"
              className={`${styles.btn} ${styles.good}`}
              data-testid="bs-hold-done"
              disabled={!can}
              onClick={() => send({ type: "completeHold", assisted: false })}
            >
              أنهِ الوقفة الآن ✓
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.assist}`}
              data-testid="bs-hold-assist"
              disabled={!can}
              onClick={() => send({ type: "completeHold", assisted: true })}
            >
              أنهِها بمساعدة
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`${styles.btn} ${styles.good}`}
              data-testid="bs-confirm"
              disabled={!open}
              onClick={() =>
                send({ type: "confirm", assisted: false, step: idx })
              }
            >
              {step?.move === "stop"
                ? "✓ الطفل واقف ثابتًا"
                : "✓ نفّذ الطفل الحركة"}
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.assist}`}
              data-testid="bs-assist"
              disabled={!open}
              onClick={() =>
                send({ type: "confirm", assisted: true, step: idx })
              }
            >
              بمساعدة المعالج
            </button>
          </>
        )}
        <button
          type="button"
          className={`${styles.btn} ${styles.warn}`}
          data-testid="bs-incorrect"
          disabled={
            !can ||
            s.status !== "running" ||
            s.phase !== "perform" ||
            idx < 0 ||
            between ||
            cd > 0
          }
          onClick={() => send({ type: "incorrect" })}
        >
          محاولة غير صحيحة
        </button>
        <button
          type="button"
          className={styles.btn}
          data-testid="bs-repeat"
          disabled={!can || s.status !== "running"}
          onClick={() => send({ type: "repeat", prev: false })}
        >
          أعد هذه الحركة
        </button>
        <button
          type="button"
          className={styles.btn}
          data-testid="bs-replay"
          disabled={!can || s.status !== "running" || cd > 0 || between}
          onClick={() => send({ type: "replay" })}
        >
          {round.preview ? "أعد عرض الترتيب" : "أعد عرض الحركة"}
        </button>
        <button
          type="button"
          className={styles.btn}
          data-testid="bs-back"
          disabled={!can || !res.some((r) => r !== "pending")}
          onClick={() => send({ type: "repeat", prev: true })}
        >
          تراجع: أعد الحركة السابقة
        </button>
        <button
          type="button"
          className={styles.btn}
          data-testid="bs-skip"
          disabled={!open}
          onClick={() => send({ type: "skip" })}
        >
          تخطَّ الحركة
        </button>
      </div>
      <p className={styles.note}>
        «محاولة غير صحيحة» تسجيل منك يُظهر وميضًا لطيفًا فقط؛ لا يُخصم شيء ولا
        يتغيّر التقدّم، ولا يكتشف النظام الخطأ بنفسه. الإعادة وإعادة العرض
        والتخطّي ليست إخفاقًا.
      </p>
    </div>
  );
}

function Panel({
  s,
  send,
  session,
}: {
  s: State;
  send: (c: Command) => void;
  session: ReturnType<typeof useBodySequenceSession>;
}) {
  const stage = STAGES[s.stage];
  const [confirm, setConfirm] = useState<
    null | "restart" | "end" | "skipStage" | "restartStage"
  >(null);
  const can = session.connected && !session.blocked;
  const live = s.status === "running" || s.status === "paused";
  const sum = summary(s);
  const cfg = s.config;
  useLibraryLaunchAdapter("body-sequence-3d", {
    modes: ["MANUAL"],
    apply: () => {
      if (
        !session.connected ||
        session.blocked ||
        !["ready", "paused"].includes(s.status)
      )
        return false;
      send({
        type: "configure",
        config: { inputMode: "MANUAL", inputSource: "manual" },
      });
      return true;
    },
  });
  const pendingHint = s.sensor.pending && s.status === "running";
  const selectable = s.status === "ready" || s.status === "stage-complete";

  if (s.status === "ready" && !s.startedAt)
    return (
      <main
        className={styles.page}
        data-testid="bs-control"
        data-status={s.status}
        data-stage={s.stage}
        data-run={s.run}
        dir="rtl"
      >
        <GameSetupLayout
          settings={
            <Settings
              s={s}
              send={send}
              sim={session.sim}
              setSim={session.setSimulated}
            />
          }
          items={STAGES.map((x, i) => ({
            value: i,
            label: x.nameAr,
            description: x.goalAr,
          }))}
          value={s.stage}
          onSelect={(v) => send({ type: "selectStage", stage: Number(v) })}
          onStart={() => send({ type: "start", at: Date.now() })}
          disabled={!can}
          startTestId="bs-start"
        />
      </main>
    );

  return (
    <main
      className={styles.page}
      lang="ar"
      dir="rtl"
      data-testid="bs-control"
      data-status={s.status}
      data-stage={s.stage}
      data-run={s.run}
      data-clock={Math.round(s.clock)}
      data-moves={movesDone(s)}
      data-total={movesTotal(s)}
      data-seq={sequencesDone(s)}
      data-lanes={stage.lanes}
      data-round={s.round}
      data-phase={s.phase}
      data-holding={s.hold ? "1" : "0"}
      data-safety={s.safety ? "1" : "0"}
    >
      {s.status !== "ended" &&
        s.status !== "stage-complete" &&
        s.status !== "ready" && (
          <button
            className={`${styles.btn} ${styles.safety} ${styles.floatSafety}`}
            data-testid="bs-safety"
            onClick={() => send({ type: "safety" })}
            aria-label="إيقاف الأمان"
          >
            ⛔ إيقاف الأمان
          </button>
        )}
      <div className={styles.inner}>
        <header data-native-game-header className={styles.header}>
          <div>
            <div className={styles.eyebrow}>SHUMOS CARE · FLOOR PROJECTION</div>
            <h1 className={styles.title}>{NAME}</h1>
            <div className={styles.sub}>
              Body Sequence 3D · ممرّات على الأرض وترتيب حركات للقدمين؛ يؤكّد
              المعالج كل حركة، والحساسات اختيارية
            </div>
          </div>
          <div className={styles.links}>
            <Link href="/control">مكتبة الأنشطة</Link>
            <a href="/display" target="_blank" rel="noopener">
              فتح شاشة الأرض ↗
            </a>
          </div>
        </header>

        <div className={styles.grid}>
          <div className={styles.stack}>
            <div className={styles.card}>
              <div className={styles.chips}>
                <span className={styles.chip}>
                  المستوى {stage.level} · المرحلة {stage.stage}: {stage.nameAr}
                </span>
                <span className={styles.chip}>
                  {LEVELS[stage.level - 1].nameAr}
                </span>
                <span
                  className={`${styles.chip} ${s.status === "running" ? styles.chipOk : s.status === "paused" ? styles.chipWarn : ""}`}
                >
                  {STATUS_AR[s.status]}
                  {s.safety && s.status === "paused" ? " · إيقاف أمان" : ""}
                </span>
                <span className={styles.chip} data-testid="bs-lanes-chip">
                  {stage.lanes} ممرّات{stage.lanes === 2 ? " فقط" : " كحد أقصى"}
                </span>
                <span className={styles.chip}>
                  {[
                    ...new Set(stage.rounds.map((r) => MODE_LABEL_AR[r.mode])),
                  ].join(" · ")}
                </span>
                <span className={styles.chip}>
                  ترتيب {sequencesDone(s)}/{stage.rounds.length}
                </span>
                <span className={styles.chip}>
                  {cfg.inputSource === "simulated"
                    ? "محاكاة حساسات"
                    : "تأكيد يدوي"}
                </span>
                {cfg.feet !== "both" && (
                  <span className={`${styles.chip} ${styles.chipWarn}`}>
                    قدم واحدة تتحرك: {cfg.feet === "R" ? "اليمنى" : "اليسرى"}
                  </span>
                )}
              </div>
              <p className={styles.note} style={{ marginTop: 8 }}>
                {stage.goalAr}
              </p>
              {pendingHint && (
                <div
                  className={styles.banner}
                  role="status"
                  data-testid="bs-hint"
                  style={{ marginTop: 10 }}
                >
                  رُصدت حركة قدم أثناء وقفة أو ثبات (تلميح فقط، من محاكاة).
                  الحساس لا يعرف أين تقف القدم؛ لاحظ بنفسك.
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnSm}`}
                    style={{ marginInlineStart: 8 }}
                    onClick={() => send({ type: "dismissHint" })}
                  >
                    تجاهل
                  </button>
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                <LaneMap s={s} />
              </div>
              <p className={styles.note}>
                يمين ويسار هنا من جهة الطفل نفسه وليس من جهة الشاشة. الطفل يقف
                عند علامة «استعداد»؛ يتحرك بقدم واحدة نحو الممر المضيء ولا حاجة
                للقفز أو الجري أو المباعدة الواسعة بين الساقين.
              </p>
            </div>

            <Current s={s} send={send} can={can} />

            <div className={styles.card}>
              <div className={styles.actions} style={{ marginTop: 0 }}>
                {s.status === "ready" && (
                  <button
                    className={`${styles.btn} ${styles.primary}`}
                    data-testid="bs-start"
                    disabled={!can}
                    onClick={() => send({ type: "start", at: Date.now() })}
                  >
                    ابدأ المرحلة
                  </button>
                )}
                {s.status === "running" && (
                  <button
                    className={styles.btn}
                    data-testid="bs-pause"
                    onClick={() => send({ type: "pause" })}
                  >
                    إيقاف مؤقت
                  </button>
                )}
                {s.status === "paused" && (
                  <button
                    className={`${styles.btn} ${s.safety ? styles.resumeSafe : styles.primary}`}
                    data-testid="bs-resume"
                    disabled={!can}
                    onClick={() => send({ type: "resume", at: Date.now() })}
                  >
                    {s.safety ? "استئناف بعد إيقاف الأمان" : "متابعة"}
                  </button>
                )}
                {s.status === "stage-complete" && (
                  <button
                    className={`${styles.btn} ${styles.primary}`}
                    data-testid="bs-next"
                    onClick={() => send({ type: "next", at: Date.now() })}
                  >
                    {s.stage === 8
                      ? "إنهاء الجلسة وعرض النتائج"
                      : "المرحلة التالية"}
                  </button>
                )}
                {live && (
                  <button
                    className={styles.btn}
                    data-testid="bs-skipstage"
                    onClick={() => setConfirm("skipStage")}
                  >
                    تجاوز المرحلة
                  </button>
                )}
                {s.status !== "ended" && s.status !== "ready" && (
                  <button
                    className={styles.btn}
                    data-testid="bs-restartstage"
                    onClick={() => setConfirm("restartStage")}
                  >
                    أعد ضبط هذه المرحلة
                  </button>
                )}
              </div>
              <div className={styles.actions}>
                <button
                  className={styles.btn}
                  data-testid="bs-restart"
                  onClick={() => setConfirm("restart")}
                >
                  إعادة البدء
                </button>
                {s.status !== "ended" && (
                  <button
                    className={styles.btn}
                    data-testid="bs-end"
                    onClick={() => setConfirm("end")}
                  >
                    إنهاء الجلسة
                  </button>
                )}
              </div>
              {confirm && (
                <div
                  className={styles.confirm}
                  role="alertdialog"
                  data-testid="bs-confirm-box"
                  style={{ marginTop: 10 }}
                >
                  <span>
                    {confirm === "restart"
                      ? "إعادة البدء تمسح تقدّم هذه الجولة (لا تُحفظ نتائجها). متأكد؟"
                      : confirm === "end"
                        ? "إنهاء الجلسة الآن وحفظ النتائج؟"
                        : confirm === "restartStage"
                          ? "إعادة ضبط المرحلة الحالية بترتيبات جديدة وتصفير تقدّمها؟"
                          : "تجاوز المرحلة الحالية والانتقال إلى التالية؟"}
                  </span>
                  <button
                    className={`${styles.btn} ${styles.primary}`}
                    style={{ minHeight: 44 }}
                    data-testid="bs-confirm-yes"
                    onClick={() => {
                      send(
                        confirm === "restart"
                          ? { type: "restart" }
                          : confirm === "end"
                            ? { type: "end", at: Date.now() }
                            : confirm === "restartStage"
                              ? { type: "restartStage" }
                              : { type: "skipStage", at: Date.now() },
                      );
                      setConfirm(null);
                    }}
                  >
                    نعم
                  </button>
                  <button
                    className={styles.btn}
                    style={{ minHeight: 44 }}
                    data-testid="bs-confirm-no"
                    onClick={() => setConfirm(null)}
                  >
                    لا
                  </button>
                </div>
              )}
              <div
                className={styles.progress}
                aria-label={`${s.completed.length} من 9 مراحل مكتملة`}
              >
                {STAGES.map((_, i) => (
                  <span
                    key={i}
                    className={`${styles.step} ${s.completed.includes(i) ? styles.done : s.skipped.includes(i) ? styles.skipped : ""} ${i === s.stage ? styles.here : ""}`}
                    title={STAGES[i].nameAr}
                  />
                ))}
                <span className={styles.note}>
                  {s.completed.length}/9 مراحل
                </span>
              </div>
            </div>

            <div className={styles.card} data-testid="bs-stages">
              <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>
                المستوى والمرحلة
              </h2>
              <div className={styles.stageGrid}>
                {LEVELS.map((lv) => (
                  <div key={lv.level} className={styles.stageRow}>
                    <span className={styles.levelName}>
                      {lv.level}. {lv.nameAr}
                    </span>
                    {STAGES.filter((x) => x.level === lv.level).map((x) => (
                      <button
                        key={x.id}
                        type="button"
                        data-testid={`bs-stage-${x.id}`}
                        className={`${styles.stageBtn} ${x.id === s.stage ? styles.stageOn : ""} ${s.completed.includes(x.id) ? styles.stageDone : ""}`}
                        disabled={!selectable || !can}
                        aria-pressed={x.id === s.stage}
                        onClick={() =>
                          send({ type: "selectStage", stage: x.id })
                        }
                      >
                        {x.nameAr}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
              <p className={styles.note}>
                اختيار المستوى والمرحلة متاح قبل البدء أو بين المراحل. المستوى
                الأول ممرّان فقط، والمستويان الثاني والثالث ثلاثة ممرّات كحد
                أقصى. الصعوبة في تسلسل الحركات والتخطيط لا في الجهد البدني؛ لا
                جري ولا قفز ولا حدّ زمني.
              </p>
            </div>

            <div className={styles.card} data-testid="bs-results">
              <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>
                {s.status === "ended" ? "نتائج الجلسة" : "ملخص الجلسة حتى الآن"}
              </h2>
              <div className={styles.chips}>
                <span className={`${styles.chip} ${styles.chipOk}`}>
                  حركات مؤكدة {sum.confirmed}
                </span>
                <span className={styles.chip}>بمساعدة {sum.assisted}</span>
                <span className={styles.chip}>متخطاة {sum.skipped}</span>
                <span className={styles.chip}>
                  ترتيبات مكتملة {sum.sequences}
                </span>
                <span className={styles.chip}>
                  محاولات غير صحيحة {sum.incorrect}
                </span>
                <span className={styles.chip}>إعادة الحركة {sum.repeats}</span>
                <span className={styles.chip}>إعادة العرض {sum.replays}</span>
                <span className={styles.chip}>وقفات {sum.holds}</span>
                <span className={styles.chip}>
                  وقت اللعب {Math.round(sum.activeMs / 1000)} ث
                </span>
              </div>
              <p className={styles.note}>
                أعداد أحداث لعب فقط أكّدتها أنت؛ ليست تقييمًا سريريًا ولا توجد
                درجة. لا الإعادة ولا إعادة العرض ولا التخطّي ولا تسجيل محاولة
                غير صحيحة إخفاق. الأداء في اللعبة منفصل عن تقييمك السريري.
              </p>
              <div
                className={styles.status}
                role="status"
                data-testid="bs-status"
              >
                {session.error ??
                  (session.connected ? "● التحكم متصل" : "○ التحكم غير متصل")}
                <br />
                {session.displayConnected
                  ? "● شاشة الأرض متصلة"
                  : "○ افتح شاشة الأرض"}
                <br />
                {session.history === "saved"
                  ? "✓ حُفظت الجلسة"
                  : session.history === "walk-in"
                    ? "جلسة زائر · دون سجل مريض"
                    : session.history === "retry"
                      ? "تعذّر الحفظ، تجري إعادة المحاولة"
                      : session.history === "saving"
                        ? "جارٍ الحفظ…"
                        : ""}
              </div>
            </div>
          </div>

          <Settings
            s={s}
            send={send}
            sim={session.sim}
            setSim={session.setSimulated}
          />
        </div>
      </div>
    </main>
  );
}
