"use client";
import { useLibraryLaunchAdapter } from "@/components/control/library/launch/LibraryLaunchBoundary";
import Link from "next/link";
import { useState } from "react";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import {
  activeCp,
  canConfirm,
  countdownLeft,
  schedule,
  stat,
  summary,
  starsCollected,
  type Command,
  type State,
} from "@/lib/turngo3d/engine";
import { guideOf, TURN_AR, TURN_THEN_AR } from "@/lib/turngo3d/captions";
import {
  EVENT_LABEL_AR,
  KIND_LABEL_AR,
  LEVELS,
  STAGES,
} from "@/lib/turngo3d/stages";
import { COURSES } from "@/lib/turngo3d/courses";
import { useTurnGoSession } from "@/lib/turngo3d/useSession";
import { CourseMap } from "./CourseMap";
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

export function TurnGoControl() {
  return isRealtimeEnabled() ? (
    <LiveTurnGoControl />
  ) : (
    <main className={styles.page} dir="rtl" lang="ar">
      <div className={styles.inner}>
        <h1 className={styles.title}>تحدي الدوران</h1>
        <p>يلزم إعداد اتصال المنصة المشتركة لفتح جلسة متزامنة.</p>
        <Link href="/control">مكتبة الأنشطة</Link>
      </div>
    </main>
  );
}

function LiveTurnGoControl() {
  const session = useTurnGoSession();
  const { state: s, send } = session;
  if (!s) {
    return (
      <main className={styles.page} dir="rtl" lang="ar">
        <div className={styles.inner}>
          <h1 className={styles.title}>تحدي الدوران</h1>
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

function Current({
  s,
  send,
  can,
}: {
  s: State;
  send: (c: Command) => void;
  can: boolean;
}) {
  const sch = schedule(s);
  const st = stat(s);
  const cp = activeCp(s);
  const g = guideOf(s);
  const live = s.status === "running" || s.status === "paused";
  if (!live || cp < 0) return null;
  const kind = sch.kinds[cp];
  const cd = Math.ceil(countdownLeft(s) / 1000);
  const open = canConfirm(s) && can;
  const hold = s.hold;
  const holdLeft = hold ? Math.max(0, hold.ms - (s.clock - hold.startedAt)) : 0;
  const nextEvent = sch.events[cp];
  const waitLeft = s.wait
    ? Math.max(0, Math.ceil((s.wait.until - s.clock) / 1000))
    : 0;
  return (
    <div
      className={styles.current}
      data-testid="tg-current"
      data-cp={cp}
      data-kind={kind}
      data-holding={hold ? "1" : "0"}
      data-waiting={s.wait ? "1" : "0"}
    >
      <div className={styles.currentTitle}>
        النجمة {cp + 1} من {st.res.length} · {KIND_LABEL_AR[kind]}
        {sch.optional[cp] ? " (وقفة اختيارية قصيرة)" : ""}
      </div>
      <div className={styles.currentText}>
        <span
          className={styles.pill}
          style={{
            ["--c" as string]:
              g.phase === "hold"
                ? "#ff5a5f"
                : g.phase === "wait"
                  ? "#ffb020"
                  : "#3ddc84",
          }}
        >
          {g.phase === "wait"
            ? "انتظار"
            : g.phase === "hold"
              ? "وقفة"
              : g.phase === "countdown"
                ? "استعد"
                : TURN_AR[g.turn]}
        </span>
        {g.next && g.phase === "go" && (
          <span style={{ fontSize: 16, opacity: 0.85 }}>
            {TURN_THEN_AR[g.next]} عند النجمة
          </span>
        )}
      </div>
      {cd > 0 && (
        <div className={styles.banner} role="status">
          العدّ التنازلي {cd}… يُفتح التأكيد بعده.
        </div>
      )}
      {s.wait && (
        <div className={styles.banner} role="status" data-testid="tg-wait">
          حدث ديناميكي جارٍ: {EVENT_LABEL_AR[s.wait.kind]} · {waitLeft} ث. الطفل
          واقف عند نجمته ولا يتحرك الطريق الآن.
          <button
            type="button"
            className={`${styles.btn} ${styles.btnSm}`}
            data-testid="tg-continue"
            style={{ marginInlineStart: 8 }}
            onClick={() => send({ type: "continue" })}
          >
            تابع الآن
          </button>
        </div>
      )}
      {kind === "stop" && !hold && !s.wait && (
        <div className={styles.note}>
          عند وصول الطفل وتوقفه اضغط «تأكيد»: تبدأ وقفة {sch.holdMs[cp] / 1000}{" "}
          ثوانٍ وتنتهي بالساعة، ثم تُجمع النجمة. راقب ثباته أنت.
        </div>
      )}
      {hold && (
        <>
          <div className={styles.bar} aria-label="تقدّم الوقفة">
            <div
              className={styles.barFill}
              data-testid="tg-holdbar"
              style={{
                width: `${Math.round(Math.min(1, (s.clock - hold.startedAt) / hold.ms) * 100)}%`,
              }}
            />
          </div>
          <div className={styles.note}>
            الوقفة جارية · متبقٍّ {Math.ceil(holdLeft / 1000)} ث. تنتهي
            تلقائيًا؛ أو أنهِها الآن بمساعدتك.
          </div>
        </>
      )}
      {!hold && !s.wait && nextEvent && s.config.events && (
        <div className={styles.note}>
          بعد التأكيد: {EVENT_LABEL_AR[nextEvent]}.
        </div>
      )}
      <div className={styles.actions}>
        {hold ? (
          <>
            <button
              type="button"
              className={`${styles.btn} ${styles.good}`}
              data-testid="tg-hold-done"
              disabled={!can}
              onClick={() => send({ type: "completeHold", assisted: false })}
            >
              أنهِ الوقفة الآن ✓
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.assist}`}
              data-testid="tg-hold-assist"
              disabled={!can}
              onClick={() => send({ type: "completeHold", assisted: true })}
            >
              أنهِها بمساعدة
            </button>
            <button
              type="button"
              className={styles.btn}
              data-testid="tg-hold-cancel"
              disabled={!can}
              onClick={() => send({ type: "repeat", prev: false })}
            >
              إلغاء الوقفة وإعادتها
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`${styles.btn} ${styles.good}`}
              data-testid="tg-confirm"
              disabled={!open}
              onClick={() => send({ type: "confirm", assisted: false })}
            >
              {kind === "stop"
                ? "✓ وصل وتوقّف · ابدأ الوقفة"
                : kind === "finish"
                  ? "✓ وصل إلى النهاية"
                  : "✓ وصل الطفل إلى النجمة"}
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.assist}`}
              data-testid="tg-assist"
              disabled={!open}
              onClick={() => send({ type: "confirm", assisted: true })}
            >
              بمساعدة المعالج
            </button>
          </>
        )}
        <button
          type="button"
          className={styles.btn}
          data-testid="tg-repeat"
          disabled={!can || s.status !== "running"}
          onClick={() => send({ type: "repeat", prev: false })}
        >
          أعد هذا المقطع
        </button>
        <button
          type="button"
          className={styles.btn}
          data-testid="tg-back"
          disabled={!can || !st.res.some((r) => r !== "pending")}
          onClick={() => send({ type: "repeat", prev: true })}
        >
          تراجع: أعد النجمة السابقة
        </button>
        <button
          type="button"
          className={styles.btn}
          data-testid="tg-skip"
          disabled={!can || s.status !== "running" || s.clock < s.goAt}
          onClick={() => send({ type: "skip" })}
        >
          تخطَّ النجمة
        </button>
      </div>
      <div className={styles.actions} style={{ marginTop: 4 }}>
        <button
          type="button"
          className={`${styles.btn} ${styles.warn}`}
          data-testid="tg-deviation"
          disabled={!can || s.status !== "running"}
          onClick={() => send({ type: "deviation", cone: false })}
        >
          خرج عن المسار
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.warn}`}
          data-testid="tg-cone"
          disabled={!can || s.status !== "running"}
          onClick={() => send({ type: "deviation", cone: true })}
        >
          لمس مخروطًا
        </button>
      </div>
      <p className={styles.note}>
        «خرج عن المسار» و«لمس مخروطًا» تسجيلات منك تُظهر نبضة لطيفة على الشاشة
        فقط؛ لا يُخصم منها شيء ولا يتغيّر التقدّم، ولا يكتشف النظام الملامسة
        بنفسه.
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
  session: ReturnType<typeof useTurnGoSession>;
}) {
  const stage = STAGES[s.stage];
  const sch = schedule(s);
  const st = stat(s);
  const [confirm, setConfirm] = useState<
    null | "restart" | "end" | "skipStage" | "restartStage"
  >(null);
  const can = session.connected && !session.blocked;
  const live = s.status === "running" || s.status === "paused";
  const sum = summary(s);
  const cfg = s.config;
  useLibraryLaunchAdapter("turn-and-go-3d", {
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
  const editable = s.status === "ready" && can;
  const progressCount = starsCollected(s);

  if (s.status === "ready" && !s.startedAt)
    return (
      <main
        className={styles.page}
        data-testid="tg-control"
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
          startTestId="tg-start"
        />
      </main>
    );

  return (
    <main
      className={styles.page}
      lang="ar"
      dir="rtl"
      data-testid="tg-control"
      data-status={s.status}
      data-stage={s.stage}
      data-run={s.run}
      data-clock={Math.round(s.clock)}
      data-stars={progressCount}
      data-total={st.res.length}
      data-cones={sch.plan.cones
        .map((p) => p.map((v) => v.toFixed(2)).join(","))
        .join(";")}
      data-stars-xy={sch.plan.cps
        .map((p) => p.map((v) => v.toFixed(2)).join(","))
        .join(";")}
      data-holding={s.hold ? "1" : "0"}
      data-wait={s.wait?.kind ?? ""}
      data-safety={s.safety ? "1" : "0"}
    >
      {s.status !== "ended" &&
        s.status !== "stage-complete" &&
        s.status !== "ready" && (
          <button
            className={`${styles.btn} ${styles.safety} ${styles.floatSafety}`}
            data-testid="tg-safety"
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
            <h1 className={styles.title}>تحدي الدوران</h1>
            <div className={styles.sub}>
              Turn &amp; Go 3D · يمشي الطفل حول الأقماع الحقيقية ويؤكّد المعالج
              كل نجمة؛ الحساسات اختيارية
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
                <span className={styles.chip}>
                  {COURSES[sch.course].nameAr} · {sch.coneCount} أقماع
                </span>
                <span className={styles.chip}>
                  ★ {progressCount}/{st.res.length || sch.plan.cps.length}
                </span>
                {sch.customized && (
                  <span className={styles.chip}>تخطيط عدّلته</span>
                )}
                {!cfg.events && (
                  <span className={`${styles.chip} ${styles.chipWarn}`}>
                    الأحداث متوقفة
                  </span>
                )}
                <span className={styles.chip}>
                  {cfg.inputSource === "simulated"
                    ? "محاكاة حساسات"
                    : "تأكيد يدوي"}
                </span>
              </div>
              <p className={styles.note} style={{ marginTop: 8 }}>
                {stage.goalAr}
              </p>
              {pendingHint && (
                <div
                  className={styles.banner}
                  role="status"
                  data-testid="tg-hint"
                  style={{ marginTop: 10 }}
                >
                  رُصدت حركة قدم أثناء وقفة أو انتظار (تلميح فقط، من محاكاة).
                  الحساس لا يعرف أين يقف الطفل؛ لاحظ بنفسك.
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
                <CourseMap
                  s={s}
                  editable={editable}
                  onConfigure={(patch) =>
                    send({ type: "configure", config: patch })
                  }
                />
              </div>
              <div className={styles.legend}>
                <span>
                  <i style={{ background: "#ffc233" }} />
                  مخروط (حلقة الأمان المنقطة)
                </span>
                <span>
                  <i style={{ background: "#ffc42e" }} />
                  نجمة
                </span>
                <span>
                  <i style={{ background: "#e63946" }} />
                  علامة توقف
                </span>
                <span>
                  <i style={{ background: "#3ddc84" }} />
                  البداية
                </span>
                <span>🚦🦊🚧↔⛔✨ حدث بعد النجمة</span>
              </div>
              <p className={styles.note}>
                {editable
                  ? "اسحب الأقماع والنجوم والبداية لتطابق الأقماع الموضوعة على الأرض (أو استخدم الأسهم بعد تحديدها). "
                  : "التعديل متاح قبل بدء المرحلة. "}
                الخريطة وحدات تخطيط لا سنتيمترات؛ لا يدّعي التطبيق مطابقة دقيقة
                بين الصورة والأقماع الحقيقية، ولا يكتشف مكان المخروط الفعلي أو
                ملامسته. الحافة الصفراء المنقطة تمثّل حدود الأمان.
              </p>
            </div>

            <Current s={s} send={send} can={can} />

            <div className={styles.card}>
              <div className={styles.actions} style={{ marginTop: 0 }}>
                {s.status === "ready" && (
                  <button
                    className={`${styles.btn} ${styles.primary}`}
                    data-testid="tg-start"
                    disabled={!can}
                    onClick={() => send({ type: "start", at: Date.now() })}
                  >
                    ابدأ المرحلة
                  </button>
                )}
                {s.status === "running" && (
                  <button
                    className={styles.btn}
                    data-testid="tg-pause"
                    onClick={() => send({ type: "pause" })}
                  >
                    إيقاف مؤقت
                  </button>
                )}
                {s.status === "paused" && (
                  <button
                    className={`${styles.btn} ${s.safety ? styles.resumeSafe : styles.primary}`}
                    data-testid="tg-resume"
                    disabled={!can}
                    onClick={() => send({ type: "resume", at: Date.now() })}
                  >
                    {s.safety ? "استئناف بعد إيقاف الأمان" : "متابعة"}
                  </button>
                )}
                {s.status === "stage-complete" && (
                  <button
                    className={`${styles.btn} ${styles.primary}`}
                    data-testid="tg-next"
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
                    data-testid="tg-skipstage"
                    onClick={() => setConfirm("skipStage")}
                  >
                    تجاوز المرحلة
                  </button>
                )}
                {s.status !== "ended" && s.status !== "ready" && (
                  <button
                    className={styles.btn}
                    data-testid="tg-restartstage"
                    onClick={() => setConfirm("restartStage")}
                  >
                    أعد ضبط هذه المرحلة
                  </button>
                )}
              </div>
              <div className={styles.actions}>
                <button
                  className={styles.btn}
                  data-testid="tg-restart"
                  onClick={() => setConfirm("restart")}
                >
                  إعادة البدء
                </button>
                {s.status !== "ended" && (
                  <button
                    className={styles.btn}
                    data-testid="tg-end"
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
                  data-testid="tg-confirm-box"
                  style={{ marginTop: 10 }}
                >
                  <span>
                    {confirm === "restart"
                      ? "إعادة البدء تمسح تقدّم هذه الجولة (لا تُحفظ نتائجها). متأكد؟"
                      : confirm === "end"
                        ? "إنهاء الجلسة الآن وحفظ النتائج؟"
                        : confirm === "restartStage"
                          ? "إعادة ضبط المرحلة الحالية وتصفير نجومها؟"
                          : "تجاوز المرحلة الحالية والانتقال إلى التالية؟"}
                  </span>
                  <button
                    className={`${styles.btn} ${styles.primary}`}
                    style={{ minHeight: 44 }}
                    data-testid="tg-confirm-yes"
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
                    data-testid="tg-confirm-no"
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

            <div className={styles.card} data-testid="tg-stages">
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
                        data-testid={`tg-stage-${x.id}`}
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
                اختيار المستوى والمرحلة متاح قبل البدء أو بين المراحل. الصعوبة
                هنا في تعقيد المسار والتخطيط لا في السرعة؛ لا جري ولا قفز ولا
                حدّ زمني.
              </p>
            </div>

            <div className={styles.card} data-testid="tg-results">
              <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>
                {s.status === "ended" ? "نتائج الجلسة" : "ملخص الجلسة حتى الآن"}
              </h2>
              <div className={styles.chips}>
                <span className={`${styles.chip} ${styles.chipOk}`}>
                  نجوم مؤكدة {sum.confirmed}
                </span>
                <span className={styles.chip}>بمساعدة {sum.assisted}</span>
                <span className={styles.chip}>متخطاة {sum.skipped}</span>
                <span className={styles.chip}>وقفات {sum.holds}</span>
                <span className={styles.chip}>
                  خروج عن المسار {sum.deviations}
                </span>
                <span className={styles.chip}>لمس مخروط {sum.coneTouches}</span>
                <span className={styles.chip}>إعادات {sum.repeats}</span>
                <span className={styles.chip}>أحداث مسار {sum.events}</span>
                <span className={styles.chip}>
                  وقت اللعب {Math.round(sum.activeMs / 1000)} ث
                </span>
              </div>
              <p className={styles.note}>
                أعداد أحداث لعب فقط أكّدتها أنت: النجوم تغذية راجعة للعبة وليست
                تقييمًا سريريًا، ولا توجد درجة. لا الإعادة ولا التخطّي ولا تسجيل
                الخروج عن المسار إخفاق.
              </p>
              <div
                className={styles.status}
                role="status"
                data-testid="tg-status"
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
