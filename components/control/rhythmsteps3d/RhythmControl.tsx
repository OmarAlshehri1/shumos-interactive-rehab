"use client";
import { ControlDialog } from "@/components/control/ui/ControlDialog";
import { ControlSlot } from "@/components/control/ui/ControlWorkspace";
import { RhythmView } from "@/components/display/rhythmsteps3d/RhythmView";
import { useLibraryLaunchAdapter } from "@/components/control/library/launch/LibraryLaunchBoundary";
import Link from "next/link";
import { useState } from "react";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { speedOf } from "@/lib/rhythmsteps3d/config";
import {
  currentStep,
  summary,
  type Command,
  type State,
  type Step,
} from "@/lib/rhythmsteps3d/engine";
import { LEVELS, STAGES, KIND_LABEL_AR } from "@/lib/rhythmsteps3d/stages";
import {
  FOOT_AR,
  laneHex,
  laneName,
  captionOf,
} from "@/lib/rhythmsteps3d/captions";
import { useRhythmSession } from "@/lib/rhythmsteps3d/useSession";
import { FootIcon } from "@/components/display/rhythmsteps3d/FootIcon";
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

export function RhythmControl() {
  return isRealtimeEnabled() ? (
    <LiveRhythmControl />
  ) : (
    <main className={styles.page} dir="rtl" lang="ar">
      <div className={styles.inner}>
        <h1 className={styles.title}>نبض الألوان</h1>
        <p>يلزم إعداد اتصال المنصة المشتركة لفتح جلسة متزامنة.</p>
        <Link href="/control">مكتبة الأنشطة</Link>
      </div>
    </main>
  );
}

function LiveRhythmControl() {
  const session = useRhythmSession();
  const { state: s, send } = session;
  if (!s) {
    return (
      <main className={styles.page} dir="rtl" lang="ar">
        <div className={styles.inner}>
          <h1 className={styles.title}>نبض الألوان</h1>
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

function CurrentStep({
  s,
  send,
  can,
}: {
  s: State;
  send: (c: Command) => void;
  can: boolean;
}) {
  const cur = currentStep(s);
  const running = s.status === "running";
  const live = running || s.status === "paused";
  if (!live) return null;
  if (!cur) {
    const next = s.steps.find((x) => x.out === "pending");
    return (
      <div className={styles.current} data-testid="rs-current" data-current="">
        <div className={styles.currentTitle}>لا هدف عند الخط الآن</div>
        {next ? (
          <div
            className={styles.currentText}
            style={{ fontSize: 17, opacity: 0.85 }}
          >
            التالي: {captionOf(next)}
          </div>
        ) : (
          <div className={styles.note}>
            كل الأهداف انتهت؛ تنتهي المرحلة بعد لحظات.
          </div>
        )}
      </div>
    );
  }
  const holding = cur.kind === "hold" && cur.holdAt >= 0;
  const progress = holding
    ? Math.min(1, (s.clock - cur.holdAt) / cur.holdMs)
    : 0;
  const id = cur.id;
  return (
    <div
      className={styles.current}
      data-testid="rs-current"
      data-current={id}
      data-kind={cur.kind}
      data-holding={holding ? "1" : "0"}
    >
      <div className={styles.currentTitle}>
        الهدف الحالي · {KIND_LABEL_AR[cur.kind]}
        {cur.rep > 0 ? " · مُعاد" : ""}
        {cur.seq ? ` · ${cur.seq[1] + 1} من ${cur.seq[2]}` : ""}
      </div>
      <div className={styles.currentText}>
        {cur.targets.map((t, i) => (
          <span
            key={i}
            className={styles.pill}
            style={{ ["--c" as string]: laneHex(t.lane) }}
          >
            <FootIcon foot={t.foot} size={30} stay={t.role === "stay"} />
            {t.role === "stay" || t.role === "hold" ? "ثبّت " : ""}
            {FOOT_AR[t.foot]}
            <span className={styles.dotC} />
            {laneName(t.lane)}
          </span>
        ))}
      </div>
      {cur.kind === "jump" && (
        <div className={styles.note}>
          القفز اختياري: إن لم يناسب الطفل فخطوة بالقدمين مقبولة، ثم اختر
          «بمساعدة».
        </div>
      )}
      {cur.kind === "hold" && (
        <>
          <div className={styles.bar} aria-label="تقدّم الثبات">
            <div
              className={styles.barFill}
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <div className={styles.note}>
            {holding
              ? `الثبات جارٍ · ${Math.round(progress * 100)}٪`
              : `مدة الثبات ${cur.holdMs / 1000} ثانية. لا يبدأ إلا بعد أن تتأكد أن القدم في مكانها وتضغط «ابدأ الثبات».`}
          </div>
        </>
      )}
      <div className={styles.actions}>
        {cur.kind === "hold" ? (
          holding ? (
            <>
              <ControlSlot slot="assistance"><button
                type="button"
                className={`${styles.btn} ${styles.good}`}
                data-testid="rs-hold-done"
                disabled={!can}
                onClick={() =>
                  send({ type: "completeHold", id, assisted: false })
                }
              >
                أنهِ الثبات ✓ نجح
              </button></ControlSlot>
              <ControlSlot slot="assistance"><button
                type="button"
                className={`${styles.btn} ${styles.assist}`}
                data-testid="rs-hold-assist"
                disabled={!can}
                onClick={() =>
                  send({ type: "completeHold", id, assisted: true })
                }
              >
                أنهِ بمساعدة
              </button></ControlSlot>
              <ControlSlot slot="assistance"><button
                type="button"
                className={styles.btn}
                data-testid="rs-hold-cancel"
                disabled={!can}
                onClick={() => send({ type: "cancelHold", id })}
              >
                إلغاء الثبات
              </button></ControlSlot>
            </>
          ) : (
            <>
              <ControlSlot slot="assistance"><button
                type="button"
                className={`${styles.btn} ${styles.good}`}
                data-testid="rs-hold-start"
                disabled={!can || !running}
                onClick={() => send({ type: "startHold", id })}
              >
                ابدأ الثبات
              </button></ControlSlot>
              <ControlSlot slot="assistance"><button
                type="button"
                className={`${styles.btn} ${styles.assist}`}
                data-testid="rs-hold-assist"
                disabled={!can}
                onClick={() =>
                  send({ type: "completeHold", id, assisted: true })
                }
              >
                أنهِ بمساعدة
              </button></ControlSlot>
            </>
          )
        ) : (
          <>
            <ControlSlot slot="assistance"><button
              type="button"
              className={`${styles.btn} ${styles.good}`}
              data-testid="rs-confirm"
              disabled={!can}
              onClick={() => send({ type: "confirm", id, assisted: false })}
            >
              ✓ أكّد: نُفّذت الحركة
            </button></ControlSlot>
            <ControlSlot slot="assistance"><button
              type="button"
              className={`${styles.btn} ${styles.assist}`}
              data-testid="rs-assist"
              disabled={!can}
              onClick={() => send({ type: "confirm", id, assisted: true })}
            >
              بمساعدة الأخصائي
            </button></ControlSlot>
          </>
        )}
        <ControlSlot slot="assistance"><button
          type="button"
          className={styles.btn}
          data-testid="rs-skip"
          disabled={!can}
          onClick={() => send({ type: "skip", id })}
        >
          تخطَّ الهدف
        </button></ControlSlot>
      </div>
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
  session: ReturnType<typeof useRhythmSession>;
}) {
  const stage = STAGES[s.stage];
  const [confirm, setConfirm] = useState<
    null | "restart" | "end" | "skipStage"
  >(null);
  const can = session.connected && !session.blocked;
  const live = s.status === "running" || s.status === "paused";
  const sum = summary(s);
  const cfg = s.config;
  useLibraryLaunchAdapter("rhythm-steps-3d", {
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
  const hasResolved = s.steps.some((x: Step) => x.out !== "pending");
  const pendingHint = s.sensor.pending && s.status === "running";

  if (s.status === "ready" && !s.startedAt)
    return (
      <main
        className={styles.page}
        data-testid="rs-control"
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
          onSelect={(v) => send({ type: "stage", stage: Number(v) })}
          onStart={() => send({ type: "start", at: Date.now() })}
          disabled={!can}
          startTestId="rs-start"
        />
      </main>
    );

  return (
    <main
      className={styles.page}
      lang="ar"
      dir="rtl"
      data-testid="rs-control"
      data-status={s.status}
      data-stage={s.stage}
      data-run={s.run}
      data-flow={cfg.flow}
      data-clock={Math.round(s.clock)}
    >
      {s.status !== "ended" &&
        s.status !== "stage-complete" &&
        s.status !== "ready" && (
          <ControlSlot slot="session"><button
            className={`${styles.btn} ${styles.safety} ${styles.floatSafety}`}
            data-testid="rs-safety"
            onClick={() => send({ type: "safety" })}
            aria-label="إيقاف الأمان"
          >
            ⛔ إيقاف الأمان
          </button></ControlSlot>
        )}
      <div className={styles.inner}>
        <header data-native-game-header className={styles.header}>
          <div>
            <div className={styles.eyebrow}>SHUMOS CARE · FLOOR PROJECTION</div>
            <h1 className={styles.title}>نبض الألوان</h1>
            <div className={styles.sub}>
              Rhythm Steps 3D · الأخصائي يؤكّد كل حركة، والحساسات اختيارية
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
                <ControlSlot slot="progress"><span className={styles.chip}>
                  المستوى {stage.level} · المرحلة {stage.stage}: {stage.nameAr}
                </span><p>المرحلة {s.stage + 1} من {STAGES.length}</p></ControlSlot>
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
                  {cfg.flow === "assisted" ? "تدفق مساعد" : "تدفق مستمر"}
                </span>
                <span className={styles.chip}>
                  السرعة ×{speedOf(cfg).toFixed(2)}
                </span>
                {!s.spawnOn && (
                  <span className={`${styles.chip} ${styles.chipWarn}`}>
                    الأهداف الجديدة متوقفة
                  </span>
                )}
                <span className={styles.chip}>
                  {cfg.inputSource === "simulated"
                    ? "محاكاة حساسات"
                    : "تأكيد يدوي"}
                </span>
              </div>
              {pendingHint && (
                <div
                  className={styles.banner}
                  role="status"
                  data-testid="rs-hint"
                  style={{ marginTop: 10 }}
                >
                  رُصدت حركة قدم (تلميح فقط، من محاكاة). الحساس لا يعرف أي مربع
                  وقف عليه الطفل؛ تحقّق بنظرك ثم أكّد الهدف بنفسك.
                  <ControlSlot slot="assistance"><button
                    type="button"
                    className={styles.btn}
                    style={{ minHeight: 40, marginInlineStart: 8 }}
                    onClick={() => send({ type: "dismissHint" })}
                  >
                    تجاهل
                  </button></ControlSlot>
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                <><ControlSlot slot="preview"><RhythmView state={{...s,config:{...s.config,music:false,sfx:false,volume:0}}} connected={can}/></ControlSlot><LaneMap state={s} /></>
              </div>
              <p className={styles.note}>
                لا يتتبّع النظام موقع قدم الطفل على الأرض. الحساسات (إن وُجدت)
                تلميحات حركة فقط؛ كل تأكيد هنا من الأخصائي، ولا يتغيّر شيء قبل
                ضغط زر.
              </p>
            </div>

            <CurrentStep s={s} send={send} can={can} />

            <div className={styles.card}>
              <div className={styles.actions} style={{ marginTop: 0 }}>
                {s.status === "ready" && (
                  <ControlSlot slot="session"><button
                    className={`${styles.btn} ${styles.primary}`}
                    data-testid="rs-start"
                    disabled={!can}
                    onClick={() => send({ type: "start", at: Date.now() })}
                  >
                    ابدأ المرحلة
                  </button></ControlSlot>
                )}
                {s.status === "running" && (
                  <ControlSlot slot="session"><button
                    className={styles.btn}
                    data-testid="rs-pause"
                    onClick={() => send({ type: "pause" })}
                  >
                    إيقاف مؤقت
                  </button></ControlSlot>
                )}
                {s.status === "paused" && (
                  <ControlSlot slot="session"><button
                    className={`${styles.btn} ${s.safety ? styles.resumeSafe : styles.primary}`}
                    data-testid="rs-resume"
                    disabled={!can}
                    onClick={() => send({ type: "resume", at: Date.now() })}
                  >
                    {s.safety ? "استئناف بعد إيقاف الأمان" : "متابعة"}
                  </button></ControlSlot>
                )}
                {s.status === "stage-complete" && (
                  <ControlSlot slot="settings"><button
                    className={`${styles.btn} ${styles.primary}`}
                    data-testid="rs-next"
                    onClick={() => send({ type: "next", at: Date.now() })}
                  >
                    {s.stage === 8
                      ? "إنهاء الجلسة وعرض النتائج"
                      : "المرحلة التالية"}
                  </button></ControlSlot>
                )}
                {live && (
                  <ControlSlot slot="assistance"><button
                    className={styles.btn}
                    data-testid="rs-spawn"
                    onClick={() => send({ type: "spawn", on: !s.spawnOn })}
                  >
                    {s.spawnOn
                      ? "أوقف الأهداف الجديدة مؤقتًا"
                      : "استأنف الأهداف الجديدة"}
                  </button></ControlSlot>
                )}
                {live && (
                  <ControlSlot slot="assistance"><button
                    className={styles.btn}
                    data-testid="rs-repeat"
                    disabled={!hasResolved}
                    onClick={() => send({ type: "repeat" })}
                  >
                    أعد آخر تمرين
                  </button></ControlSlot>
                )}
                {live && (
                  <ControlSlot slot="navigation"><button
                    className={styles.btn}
                    data-testid="rs-skipstage"
                    onClick={() => setConfirm("skipStage")}
                  >
                    تجاوز المرحلة
                  </button></ControlSlot>
                )}
              </div>
              <div className={styles.actions}>
                <ControlSlot slot="navigation"><button
                  className={styles.btn}
                  data-testid="rs-restart"
                  onClick={() => setConfirm("restart")}
                >
                  إعادة البدء
                </button></ControlSlot>
                {s.status !== "ended" && (
                  <ControlSlot slot="session"><button
                    className={styles.btn}
                    data-testid="rs-end"
                    onClick={() => setConfirm("end")}
                  >
                    إنهاء الجلسة
                  </button></ControlSlot>
                )}
              </div>
              {confirm && (
                <ControlSlot slot="dialogs"><ControlDialog open title="تأكيد الإجراء" onClose={() => setConfirm(null)} role="alertdialog"><div
                  className={styles.confirm}

                  data-testid="rs-confirm-box"
                  style={{ marginTop: 10 }}
                >
                  <span>
                    {confirm === "restart"
                      ? "إعادة البدء تمسح تقدّم هذه الجولة (لا تُحفظ نتائجها). متأكد؟"
                      : confirm === "end"
                        ? "إنهاء الجلسة الآن وحفظ النتائج؟"
                        : "تجاوز المرحلة الحالية والانتقال إلى التالية؟"}
                  </span>
                  <button
                    className={`${styles.btn} ${styles.primary}`}
                    style={{ minHeight: 44 }}
                    data-testid="rs-confirm-yes"
                    onClick={() => {
                      send(
                        confirm === "restart"
                          ? { type: "restart" }
                          : confirm === "end"
                            ? { type: "end", at: Date.now() }
                            : { type: "skipStage", at: Date.now() },
                      );
                      setConfirm(null);
                    }}
                  >
                    {confirm === "end" ? "إنهاء وحفظ" : "تأكيد"}</button>
                  <button
                    className={styles.btn}
                    style={{ minHeight: 44 }}
                    data-testid="rs-confirm-no"
                    onClick={() => setConfirm(null)}
                  >
                    إلغاء</button>
                </div></ControlDialog></ControlSlot>
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

            <div className={styles.card} data-testid="rs-results">
              <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>
                {s.status === "ended" ? "نتائج الجلسة" : "ملخص الجلسة حتى الآن"}
              </h2>
              <div className={styles.chips}>
                <span className={styles.chip}>
                  إجمالي الأهداف {sum.presented}
                </span>
                <span className={`${styles.chip} ${styles.chipOk}`}>
                  مؤكدة {sum.confirmed}
                </span>
                <span className={styles.chip}>بمساعدة {sum.assisted}</span>
                <span className={styles.chip}>متخطاة {sum.skipped}</span>
                <span className={styles.chip}>غير مؤكدة {sum.missed}</span>
                <span className={styles.chip}>قدم واحدة {sum.singleFoot}</span>
                <span className={styles.chip}>قدمان {sum.twoFoot}</span>
                <span className={styles.chip}>ثبات {sum.hold}</span>
                <span className={styles.chip}>إعادات {sum.reps}</span>
                <span className={styles.chip}>
                  وقت اللعب {Math.round(sum.activeMs / 1000)} ث
                </span>
              </div>
              <p className={styles.note}>
                أعداد أحداث لعب فقط: لا توجد درجة ولا تقييم سريري. الهدف غير
                المؤكد ليس إخفاقًا؛ لم يُسجَّل أنه نُفّذ.
              </p>
              <div
                className={styles.status}
                role="status"
                data-testid="rs-status"
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
