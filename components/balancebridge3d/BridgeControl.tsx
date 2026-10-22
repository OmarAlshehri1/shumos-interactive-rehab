"use client";
import { ControlSlot } from "@/components/control/ui/ControlWorkspace";
import { GameSetupLayout } from "@/components/control/setup/GameSetupLayout";
import { StagePicker } from "@/components/control/setup/ProgressiveStages";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { useBridgeSession } from "@/lib/balancebridge3d/useSession";
import {
  createState,
  reduce,
  STAGES,
  tokenFor,
  canConfirm,
  requiresHold,
  widthFraction,
  calibratedFieldWidth,
  type State,
  type Command,
  type Config,
} from "@/lib/balancebridge3d/engine";
import { buildHistory } from "@/lib/balancebridge3d/history";
import {
  PROFILE_KEY,
  validProjectionProfile,
} from "@/lib/projection/calibration";
import { useLibraryLaunchAdapter } from "@/components/control/library/launch/LibraryLaunchBoundary";
import { FootTelemetry } from "./FootTelemetry";
import { BridgeView } from "./BridgeView";
import styles from "./bridge.module.css";
export function BridgeControl() {
  return isRealtimeEnabled() ? <Connected /> : <LocalBridge />;
}
function Connected() {
  const runtime = useBridgeSession();
  const { state, send, connected, blocked } = runtime;
  useLibraryLaunchAdapter("balance-bridge-3d", {
    sessionKey: state ? `${state.sessionId}:${state.run}` : "waiting",
    modes: ["MANUAL", "RIGHT_FOOT", "LEFT_FOOT", "DUAL_FOOT"],
    apply: (mode) => {
      if (!state || state.status !== "ready" || !connected || blocked)
        return false;
      send({ type: "config", patch: { mode: mode as Config["mode"] } });
      return true;
    },
    projections: ["FLOOR"],
    applyProjection: () =>
      !!state && connected && !blocked && state.status === "ready",
  });
  if (!state)
    return (
      <div className={styles.page}>
        <h1>الجسر المتوازن</h1>
        <p>
          {blocked
            ? "هناك جلسة نشاط قائمة. أنهِها واحفظها من شاشة التحكم الحالية أولًا."
            : "بانتظار اتصال منصة شُموس…"}
        </p>
        {runtime.error && <p className={styles.error}>{runtime.error}</p>}
      </div>
    );
  return (
    <Controller
      state={state}
      send={send}
      connected={connected && !blocked}
      displayConnected={runtime.displayConnected}
      history={runtime.history}
      error={runtime.error}
      childName={runtime.identity?.childName}
    />
  );
}
/** Explicit development harness using the exact reducer and renderer; never publishes or saves clinical history. */
export function LocalBridge({
  displayOnly = false,
}: {
  displayOnly?: boolean;
}) {
  const [state, setState] = useState(() => createState("local-preview"));
  const send = useCallback((c: Command) => setState((s) => reduce(s, c)), []);
  useEffect(() => {
    const timer = setInterval(
      () => send({ type: "tick", at: Date.now() }),
      100,
    );
    return () => clearInterval(timer);
  }, [send]);
  if (displayOnly) return <ControlSlot slot="preview"><BridgeView state={state} full /></ControlSlot>;
  return (
    <Controller
      state={state}
      send={send}
      connected
      displayConnected={false}
      local
    />
  );
}
const HISTORY: Record<string, string> = {
  "not-ended": "لم تنتهِ الجلسة",
  saved: "حُفظت النتيجة",
  saving: "جارٍ الحفظ",
  retry: "تعذّر الحفظ؛ ستتم إعادة المحاولة",
  "walk-in": "جلسة زائر — لا يوجد سجل مريض",
};
function Controller({
  state: s,
  send,
  connected,
  displayConnected,
  history,
  error,
  childName,
  local = false,
}: {
  state: State;
  send: (c: Command) => void;
  connected: boolean;
  displayConnected: boolean;
  history?: string;
  error?: string | null;
  childName?: string;
  local?: boolean;
}) {
  const [confirm, setConfirm] = useState<"end" | "restart" | null>(null),
    [calibration, setCalibration] = useState("");
  const setting = s.status === "ready" && connected,
    stage = STAGES[s.stage],
    token = tokenFor(s);
  const patch = (patch: Partial<Config>) => send({ type: "config", patch });
  const total = s.checkpoints.filter(
    (c) => c.outcome === "confirmed" || c.outcome === "assisted",
  ).length;
  const calibrate = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(PROFILE_KEY) || "[]");
      const list = Array.isArray(raw) ? raw : Object.values(raw);
      const profile = list
        .filter(validProjectionProfile)
        .filter((p) => p.surface === "FLOOR")
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (!profile) {
        setCalibration(
          "لا توجد معايرة أرضية محفوظة. أدخل القياسات بعد قياس الإسقاط.",
        );
        return;
      }
      patch({
        measuredWidthCm: profile.measuredWidthCm,
        measuredHeightCm: profile.measuredHeightCm,
        rotation: profile.rotation,
        margin: profile.safeInsetPercent / 100,
      });
      setCalibration(`المعايرة: ${profile.name}`);
    } catch {
      setCalibration("تعذّر قراءة ملف المعايرة.");
    }
  };
  const settingsCard = (
    <div className={styles.panel} data-essential-settings="bridge">
      <h3>إعداد مسار آمن</h3>
      <fieldset
        disabled={!setting}
        style={{ border: 0, padding: 0, margin: 0 }}
      >
        <ControlSlot slot="settings" disabled={(!setting)}><label className={styles.fieldLabel} htmlFor="bridge-width">
          عرض المسار
          <select
            id="bridge-width"
            className={styles.select}
            value={s.config.pathWidth}
            onChange={(e) =>
              patch({ pathWidth: e.target.value as Config["pathWidth"] })
            }
          >
            <option value="wide">واسع</option>
            <option value="standard">قياسي</option>
            <option value="narrower">أضيق بإشراف المعالج</option>
            <option value="custom">عرض مخصص بعد المعايرة</option>
          </select>
        </label></ControlSlot>
        {s.config.pathWidth === "custom" && (
          <>
            <label className={styles.fieldLabel}>
              العرض المطلوب (سم)
              <input
                aria-label="العرض المطلوب بالسنتيمتر"
                className={styles.input}
                type="number"
                min={30}
                max={200}
                value={s.config.customWidthCm}
                onChange={(e) =>
                  patch({ customWidthCm: Number(e.target.value) })
                }
              />
            </label>
          </>
        )}
        <ControlSlot slot="settings" disabled={(!setting)}><label className={styles.fieldLabel}>
          الهدف الحركي
          <select
            aria-label="الهدف الحركي"
            className={styles.select}
            value={s.config.difficulty}
            onChange={(e) =>
              patch({
                difficulty: e.target.value as Config["difficulty"],
                guidance:
                  e.target.value === "gentle"
                    ? "either"
                    : e.target.value === "guided"
                      ? "both"
                      : "alternating",
              })
            }
          >
            <option value="gentle">خطوات مريحة / نشاط بديل</option>
            <option value="guided">مواضع القدمين</option>
            <option value="precise">خطوات متناوبة بإشراف</option>
          </select>
        </label></ControlSlot>
        {s.stage === 6 && (
          <label className={styles.fieldLabel}>
            اتجاه رحلة السحاب
            <select
              aria-label="اتجاه رحلة السحاب"
              className={styles.select}
              value={s.config.routeChoice}
              onChange={(e) =>
                patch({
                  routeChoice: e.target.value as Config["routeChoice"],
                })
              }
            >
              <option value="left">ابدأ بالجهة اليسرى</option>
              <option value="right">ابدأ بالجهة اليمنى</option>
            </select>
          </label>
        )}
        <ControlSlot slot="settings" disabled={(!setting)}><label className={styles.fieldLabel}>
          دليل القدمين
          <select
            aria-label="دليل القدمين"
            className={styles.select}
            value={s.config.guidance}
            onChange={(e) =>
              patch({ guidance: e.target.value as Config["guidance"] })
            }
          >
            <option value="either">أي قدم</option>
            <option value="right">القدم اليمنى</option>
            <option value="left">القدم اليسرى</option>
            <option value="alternating">يسار / يمين بالتناوب</option>
            <option value="both">القدمان</option>
            <option value="neutral">وقفة مريحة</option>
          </select>
        </label></ControlSlot>
        <label className={styles.fieldLabel}>
          الثبات الاختياري (ثوانٍ، 0 لتعطيله)
          <input
            aria-label="الثبات الاختياري"
            className={styles.input}
            type="number"
            min={0}
            max={15}
            value={s.config.holdSeconds}
            onChange={(e) => patch({ holdSeconds: Number(e.target.value) })}
          />
        </label>
        <label className={styles.fieldLabel}>
          المشاركة
          <select
            aria-label="المشاركة"
            className={styles.select}
            value={s.config.mode}
            onChange={(e) => patch({ mode: e.target.value as Config["mode"] })}
          >
            <option value="MANUAL">تحكم المعالج دون حساسات</option>
            <option value="RIGHT_FOOT">القدم اليمنى — تلميحات فقط</option>
            <option value="LEFT_FOOT">القدم اليسرى — تلميحات فقط</option>
            <option value="DUAL_FOOT">القدمان — تلميحات فقط</option>
          </select>
        </label>
        <details>
          <summary>خيارات إضافية · الصوت والرسوم</summary>
          <div className={styles.checks}>
            <label>
              <input
                type="checkbox"
                checked={s.config.reduced}
                onChange={(e) => patch({ reduced: e.target.checked })}
              />{" "}
              مؤثرات وحركة أقل
            </label>
            <label>
              <input
                type="checkbox"
                checked={s.config.audio}
                onChange={(e) => patch({ audio: e.target.checked })}
              />{" "}
              تعليمات صوتية
            </label>
          </div>
          <label className={styles.fieldLabel}>
            جودة الرسوم
            <select
              aria-label="جودة الرسوم"
              className={styles.select}
              value={s.config.quality}
              onChange={(e) =>
                patch({ quality: e.target.value as Config["quality"] })
              }
            >
              <option value="high">عالية</option>
              <option value="low">اقتصادية</option>
            </select>
          </label>
        </details>
        <details style={{ marginTop: 16 }}>
          <summary className={styles.note}>المعايرة الأرضية</summary>
          <button
            className={styles.button}
            onClick={calibrate}
            style={{ marginTop: 12 }}
          >
            استخدم المعايرة المحفوظة
          </button>
          <p>{calibration}</p>
          <label className={styles.fieldLabel}>
            عرض الإسقاط الفعلي (سم)
            <input
              aria-label="عرض الإسقاط الفعلي"
              className={styles.input}
              type="number"
              min={50}
              max={2000}
              placeholder="غير مقاس"
              value={s.config.measuredWidthCm ?? ""}
              onChange={(e) =>
                patch({
                  measuredWidthCm: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
            />
          </label>
          <label className={styles.fieldLabel}>
            ارتفاع الإسقاط الفعلي (سم)
            <input
              aria-label="ارتفاع الإسقاط الفعلي"
              className={styles.input}
              type="number"
              min={50}
              max={2000}
              placeholder="غير مقاس"
              value={s.config.measuredHeightCm ?? ""}
              onChange={(e) =>
                patch({
                  measuredHeightCm: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
            />
          </label>
          <label className={styles.fieldLabel}>
            اتجاه الإسقاط
            <select
              aria-label="اتجاه الإسقاط"
              className={styles.select}
              value={s.config.rotation}
              onChange={(e) =>
                patch({
                  rotation: Number(e.target.value) as Config["rotation"],
                })
              }
            >
              {[0, 90, 180, 270].map((v) => (
                <option key={v} value={v}>
                  {v}°
                </option>
              ))}
            </select>
          </label>
        </details>
      </fieldset>
      <p className={styles.note}>
        العرض المرئي {Math.round(widthFraction(s.config) * 100)}٪ من مساحة
        الإسقاط.{" "}
        {calibratedFieldWidth(s.config)
          ? "القياسات أدخلها المعالج؛ افحصها على الأرض."
          : "لا يوجد قياس فعلي؛ لا يعادل البكسل سنتيمترًا."}
      </p>
    </div>
  );
  const result =
    s.status === "ended"
      ? buildHistory(s, "local-review", "therapist-review")
      : null;
  if (s.status === "ready" && !s.startedAt)
    return (
      <main className={styles.page} data-testid="bridge-control" dir="rtl">
        <GameSetupLayout
          settings={settingsCard}
          items={STAGES.map((x, i) => ({
            value: i,
            label: x.ar,
            description: x.objective,
          }))}
          value={s.stage}
          onSelect={(v) => send({ type: "stage", stage: Number(v) })}
          onStart={() => send({ type: "start" })}
          disabled={!connected}
          startTestId="bridge-start"
        />
      </main>
    );
  return (
    <main className={styles.page} data-testid="bridge-control">
      <header data-native-game-header className={styles.header}>
        <div>
          <span className={styles.eyebrow} style={{ color: "#60846e" }}>
            SHUMOS CARE · FLOOR ADVENTURES
          </span>
          <h1>الجسر المتوازن</h1>
          <p>خطوة هادئة. رحلة جديدة. {childName ? `رحلة ${childName}` : ""}</p>
        </div>
        <span className={styles.badge}>
          {local
            ? "معاينة محلية"
            : connected
              ? "التحكم متصل"
              : "التحكم غير متصل"}{" "}
          · {displayConnected ? "العرض متصل" : "العرض غير متصل"}
        </span>
      </header>
      {local && (
        <div className={styles.local}>
          معاينة تطوير محلية · لا تُنشر جلسة ولا يُحفظ سجل مريض. المزامنة تتطلب
          إعداد منصة شُموس.
        </div>
      )}
      <div className={styles.layout}>
        <section>
          <ControlSlot slot="preview"><BridgeView state={s} connected={connected} /></ControlSlot>
          <div className={styles.metrics}>
            <div className={styles.metric}>
              <b>
                {total}/{s.checkpoints.length}
              </b>
              <small>علامات مؤكدة</small>
            </div>
            <div className={styles.metric}>
              <b>
                {s.checkpoints.filter((c) => c.outcome === "assisted").length}
              </b>
              <small>بمساعدة</small>
            </div>
            <div className={styles.metric}>
              <b>{s.deviations}</b>
              <small>خروج أكّده المعالج</small>
            </div>
            <div className={styles.metric}>
              <b>
                {Math.floor(s.elapsed / 60000)}:
                {String(Math.floor(s.elapsed / 1000) % 60).padStart(2, "0")}
              </b>
              <small>وقت النشاط دون الاستراحة</small>
            </div>
          </div>
          <div className={styles.panel} style={{ marginTop: 16 }}>
            <h3>
              {stage.ar} · العلامة {s.active + 1}
            </h3>
            <p>
              {stage.objective}
              {requiresHold(s)
                ? ` · الثبات الاختياري: ${s.config.holdSeconds} ثوانٍ — التأكيد بعد الملاحظة`
                : ""}
            </p>
            <div className={styles.actions}>
              {s.status === "ready" && (
                <button
                  className={`${styles.button} ${styles.primary}`}
                  disabled={!connected}
                  onClick={() => send({ type: "start" })}
                >
                  ابدأ الرحلة
                </button>
              )}
              {s.status === "running" && (
                <>
                  {requiresHold(s) && !s.holding && (
                    <button
                      className={styles.button}
                      disabled={!connected || s.countdown > 0}
                      onClick={() => send({ type: "begin-hold" })}
                    >
                      بدء الثبات عند الوصول
                    </button>
                  )}
                  <ControlSlot slot="assistance"><button
                    className={`${styles.button} ${styles.primary}`}
                    disabled={!connected || !canConfirm(s)}
                    onClick={() =>
                      send({ type: "confirm", token, assisted: false })
                    }
                  >
                    تأكيد الوصول
                  </button></ControlSlot>
                  <ControlSlot slot="assistance"><button
                    className={styles.button}
                    disabled={!connected || !canConfirm(s)}
                    onClick={() =>
                      send({ type: "confirm", token, assisted: true })
                    }
                  >
                    تأكيد بمساعدة
                  </button></ControlSlot>
                  <ControlSlot slot="session"><button
                    className={styles.button}
                    disabled={!connected}
                    onClick={() => send({ type: "pause" })}
                  >
                    إيقاف مؤقت
                  </button></ControlSlot>
                </>
              )}
              {s.status === "paused" && (
                <ControlSlot slot="session"><button
                  className={`${styles.button} ${styles.primary}`}
                  disabled={!connected}
                  onClick={() => send({ type: "resume" })}
                >
                  استئناف الرحلة
                </button></ControlSlot>
              )}
              {s.status === "stage-complete" && s.stage < 8 && (
                <ControlSlot slot="settings"><button
                  className={`${styles.button} ${styles.primary}`}
                  disabled={!connected}
                  onClick={() => send({ type: "next" })}
                >
                  المرحلة التالية
                </button></ControlSlot>
              )}
            </div>
            <div className={styles.actions}>
              <ControlSlot slot="assistance"><button
                className={styles.button}
                disabled={!connected || s.status !== "running"}
                onClick={() => send({ type: "repeat" })}
              >
                كرّر العلامة
              </button></ControlSlot>
              <ControlSlot slot="assistance"><button
                className={styles.button}
                disabled={!connected || s.status !== "running"}
                onClick={() => send({ type: "skip", token })}
              >
                تخطّ العلامة
              </button></ControlSlot>
              <button
                className={styles.button}
                disabled={!connected || s.status !== "running"}
                onClick={() => send({ type: "deviation" })}
              >
                تأكيد خروج عن المسار
              </button>
              <button
                className={styles.button}
                disabled={!connected || s.status === "ended"}
                onClick={() => send({ type: "instructions" })}
              >
                إعادة التعليمات
              </button>
            </div>
            <p className={styles.note}>
              التأكيد يدوي بعد ملاحظة الطفل. لا توجد مهلة للمشي، ويمكن المساعدة
              أو استخدام نشاط بديل بإشراف المعالج.
            </p>
            {s.status === "stage-complete" && (
              <p>
                ✦ انتهت المرحلة.{" "}
                {s.checkpoints.some((c) => c.outcome === "skipped")
                  ? "تتضمن علامات متخطّاة."
                  : "أحسنت، أضاءت الرحلة كلها!"}
              </p>
            )}
            <div className={styles.actions}>
              <ControlSlot slot="session"><button
                className={styles.button}
                disabled={!connected || s.status === "ended"}
                onClick={() => setConfirm("end")}
              >
                إنهاء آمن
              </button></ControlSlot>
              <button
                className={styles.button}
                disabled={
                  !connected ||
                  (s.status === "ended" &&
                    !local &&
                    history !== "saved" &&
                    history !== "walk-in")
                }
                onClick={() => setConfirm("restart")}
              >
                إعادة الرحلة
              </button>
              <Link className={styles.previewLink} href="/control/calibration">
                معايرة الإسقاط
              </Link>
            </div>
            {confirm && (
              <ControlSlot slot="dialogs"><div className={styles.confirm}>
                تأكد من توقف الطفل في موضع آمن.{" "}
                {confirm === "restart"
                  ? "ستبدأ رحلة جديدة؛ أنهِ الجلسة الحالية واحفظها أولًا."
                  : "ستُحفظ المشاركة الحالية عند وجود مريض مسجل."}
                <div className={styles.actions}>
                  <button
                    className={styles.button}
                    onClick={() => setConfirm(null)}
                  >
                    عودة
                  </button>
                  <button
                    className={`${styles.button} ${styles.primary}`}
                    disabled={
                      confirm === "restart" &&
                      s.startedAt > 0 &&
                      s.status !== "ended"
                    }
                    onClick={() => {
                      send(
                        confirm === "end"
                          ? { type: "end", at: Date.now() }
                          : { type: "restart" },
                      );
                      setConfirm(null);
                    }}
                  >
                    {confirm === "end" ? "تأكيد الإنهاء" : "تأكيد الإعادة"}
                  </button>
                </div>
              </div></ControlSlot>
            )}
            {error && (
              <ControlSlot slot="dialogs"><p role="alert" className={styles.error}>
                {error}
              </p></ControlSlot>
            )}
            {history && (
              <p role="status" className={styles.note}>
                {HISTORY[history]}
              </p>
            )}
          </div>
          {result && (
            <div className={`${styles.panel} ${styles.results}`}>
              <h3>نتائج الرحلة</h3>
              <p>
                {result.checkpointsConfirmed} تأكيدًا ·{" "}
                {result.assistedCheckpoints} بمساعدة ·{" "}
                {result.skippedCheckpoints} متخطّاة · {result.pathDeviations}{" "}
                خروجًا أكّده المعالج · {result.holdCompletions} وقفات ثبات
              </p>
              {result.stageResults.map((r) => (
                <p key={r.stage}>
                  {STAGES[r.stage].ar} ·{" "}
                  {r.completed ? "مكتملة" : "مشاركة جزئية / تخطّي"} · عرض{" "}
                  {r.config.pathWidth} ·{" "}
                  {
                    r.checkpoints.filter((c) =>
                      ["confirmed", "assisted"].includes(c.outcome),
                    ).length
                  }{" "}
                  تأكيدًا
                </p>
              ))}
              <small>مؤشرات مشاركة في اللعبة، دون تقييم سريري تلقائي.</small>
            </div>
          )}
        </section>
        <aside>
          <div className={styles.panel}>
            <h3>عوالم الرحلة</h3>
            <StagePicker
              items={STAGES.map((x, i) => ({
                value: i,
                label: x.ar,
                description: x.objective,
              }))}
              value={s.stage}
              disabled={
                !connected ||
                !["ready", "paused", "stage-complete"].includes(s.status)
              }
              onSelect={(v) => send({ type: "stage", stage: Number(v) })}
            />
            <p className={styles.note}>
              أوقف النشاط مؤقتًا لتغيير المرحلة. المرحلة الجديدة تبدأ عند طلب
              المعالج.
            </p>
          </div>
          {settingsCard}
          <div className={styles.panel}>
            <h3>حساسات القدم</h3>
            {!local && <FootTelemetry mode={s.config.mode} />}
            <p>
              WT901 يقيس الحركة والاتجاه؛ لا يقيس موضع القدم أو الضغط أو ملامسة
              الماء الافتراضي. تأكيد المعالج هو مصدر التقدم.
            </p>
            <p className={styles.note}>
              ربط الأجهزة الفعلية بهذا النشاط غير متحقق. انقطاع الحساس لا يمنع
              اللعب اليدوي.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
