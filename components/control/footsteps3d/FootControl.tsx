"use client";
import { ControlSlot } from "@/components/control/ui/ControlWorkspace";
import { FootView } from "@/components/display/footsteps3d/FootView";
import { NativeSetupSections } from "@/components/control/setup/GameSetupLayout";
import {
  ProgressiveStageSelect,
  AdditionalOptions,
} from "@/components/control/setup/ProgressiveStages";
import { useLibraryLaunchAdapter } from "@/components/control/library/launch/LibraryLaunchBoundary";
import Link from "next/link";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import {
  isResolved,
  pathOf,
  summary,
  type Command,
  type Config,
  type State,
} from "@/lib/footsteps3d/engine";
import { STAGES, WORLD_NAMES, worldOf } from "@/lib/footsteps3d/stages";
import { useFootstepsSession } from "@/lib/footsteps3d/useSession";
import {
  rolesForMode,
  type FootRole,
  type InputMode,
} from "@/lib/safehexarena3d/sensorInput";
import { CalibrationPanel } from "./CalibrationPanel";
import { StoneMap } from "./StoneMap";
import styles from "./control.module.css";

const ROLE_NAME: Record<FootRole, string> = {
  RIGHT_FOOT: "القدم اليمنى",
  LEFT_FOOT: "القدم اليسرى",
};
const PATTERN_NAME = {
  hops: "خطوات قصيرة",
  straight: "مسار مستقيم",
  zigzag: "تعرّج لطيف",
  alternate: "قدم يمين ثم يسار",
  curve: "مسار منحنٍ",
  varied: "مسار متنوع",
  memory: "ذاكرة خطوتين",
  combined: "مسار مركّب",
} as const;

export function FootControl() {
  return isRealtimeEnabled() ? (
    <LiveFootControl />
  ) : (
    <main className={styles.page}>
      <div className={styles.inner}>
        <h1>اتبع الخطوات</h1>
        <p>يلزم إعداد اتصال المنصة المشتركة لفتح جلسة متزامنة.</p>
        <Link href="/control">مكتبة الأنشطة</Link>
      </div>
    </main>
  );
}

function LiveFootControl() {
  const session = useFootstepsSession();
  const { state: s, send } = session;
  if (!s) {
    return (
      <main className={styles.page}>
        <div className={styles.inner}>
          <h1>اتبع الخطوات</h1>
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

function Panel({
  s,
  send,
  session,
}: {
  s: State;
  send: (c: Command) => void;
  session: ReturnType<typeof useFootstepsSession>;
}) {
  const def = STAGES[s.stage];
  const path = pathOf(s);
  const can = session.connected && !session.blocked;
  const live = s.status === "running" || s.status === "paused";
  const stepping = live && s.step < def.steps;
  const cfg = (config: Partial<Config>) => send({ type: "configure", config });
  useLibraryLaunchAdapter("follow-the-footsteps", {
    modes: ["MANUAL"],
    apply: () => {
      if (
        !session.connected ||
        session.blocked ||
        !["ready", "paused"].includes(s.status)
      )
        return false;
      cfg({ inputMode: "MANUAL", inputSource: "manual" });
      return true;
    },
  });
  const sum = summary(s);
  const roles =
    s.config.inputSource === "simulated"
      ? rolesForMode(s.config.inputMode)
      : [];
  const editable = s.status !== "ended";
  const layoutEditable = editable && s.status !== "running";
  const foot = def.alternating && stepping ? path.stones[s.step]?.foot : null;
  const setupStages = (
    <ProgressiveStageSelect
      onSelect={(value) => send({ type: "stage", stage: Number(value) })}
    >
      <select
        id="stage"
        value={s.stage}
        disabled={
          !(
            s.status === "ready" ||
            s.status === "paused" ||
            s.status === "stage-complete"
          )
        }
        onChange={(e) => send({ type: "stage", stage: Number(e.target.value) })}
      >
        {STAGES.map((d, i) => (
          <option
            data-stage-description={`${d.steps} خطوات${d.alternating ? " · قدمان بالتبادل" : ""}${d.pairs ? " · تذكّر خطوتين" : ""}`}
            key={i}
            value={i}
            disabled={
              s.events.some((e) => e.stage === i) ||
              s.completed.includes(i) ||
              s.skipped.includes(i)
            }
          >
            المستوى {d.level} · المرحلة {d.stage} · {PATTERN_NAME[d.pattern]}
          </option>
        ))}
      </select>
    </ProgressiveStageSelect>
  );
  const setupSettings = (
    <aside className={`${styles.card} ${styles.panel}`}>
      <h2>إعدادات الجلسة</h2>
      {(s.status !== "ready" || !!s.startedAt) && setupStages}

      <AdditionalOptions>
        <div>
          <ControlSlot slot="settings"><label htmlFor="stoneScale">
            حجم الأحجار: {s.config.stoneScale}٪
          </label>
          <input
            id="stoneScale"
            type="range"
            min="70"
            max="120"
            step="5"
            value={s.config.stoneScale}
            disabled={!layoutEditable}
            onChange={(e) => cfg({ stoneScale: Number(e.target.value) })}
          /></ControlSlot>
        </div>
        <div>
          <label htmlFor="spacing">
            المسافة بين الأحجار: {s.config.spacing}٪
          </label>
          <input
            id="spacing"
            type="range"
            min="60"
            max="100"
            step="5"
            value={s.config.spacing}
            disabled={!layoutEditable}
            onChange={(e) => cfg({ spacing: Number(e.target.value) })}
          />
        </div>
        <div>
          <label htmlFor="quality">جودة الرسومات</label>
          <select
            id="quality"
            value={s.config.quality}
            disabled={!editable}
            onChange={(e) =>
              cfg({ quality: e.target.value as Config["quality"] })
            }
          >
            <option value="high">عالية</option>
            <option value="medium">متوسطة</option>
            <option value="low">خفيفة</option>
          </select>
        </div>
      </AdditionalOptions>

      <div>
        <ControlSlot slot="settings"><label htmlFor="reach">مدى الحركة الكلي: {s.config.reach}٪</label>
        <input
          id="reach"
          type="range"
          min="50"
          max="100"
          step="5"
          value={s.config.reach}
          disabled={!layoutEditable}
          onChange={(e) => cfg({ reach: Number(e.target.value) })}
        /></ControlSlot>
      </div>
      {!layoutEditable && editable && (
        <p className={styles.note}>
          تُعدَّل أحجام الأحجار والمسافات والمدى والهوامش عند الإيقاف المؤقت أو
          بين المراحل.
        </p>
      )}
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={s.config.previewNext}
          disabled={!editable}
          onChange={(e) => cfg({ previewNext: e.target.checked })}
        />{" "}
        إظهار الحجر التالي بخفوت (مساعدة اختيارية)
      </label>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={s.config.memoryAssist}
          disabled={!editable}
          onChange={(e) => cfg({ memoryAssist: e.target.checked })}
        />{" "}
        مرحلة الذاكرة: مساعدة بصرية بعد العرض
      </label>
      <div>
        <label htmlFor="previewMs">مدة عرض الحجرين (مرحلة الذاكرة)</label>
        <select
          id="previewMs"
          value={s.config.previewMs}
          disabled={!editable}
          onChange={(e) => cfg({ previewMs: Number(e.target.value) })}
        >
          {[3000, 5000, 8000, 12000].map((n) => (
            <option key={n} value={n}>
              {n / 1000} ثوانٍ
            </option>
          ))}
        </select>
      </div>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={s.config.restPauses}
          disabled={!editable}
          onChange={(e) => cfg({ restPauses: e.target.checked })}
        />{" "}
        فترات راحة اختيارية (المرحلة ٣ من المستوى ٢)
      </label>

      <h2>مصدر الحركة</h2>
      <div>
        <ControlSlot slot="settings"><label htmlFor="input">وضع الإدخال</label>
        <select
          id="input"
          value={
            s.config.inputSource === "simulated" ? s.config.inputMode : "MANUAL"
          }
          disabled={!editable}
          onChange={(e) => {
            const mode = e.target.value as InputMode;
            cfg({
              inputMode: mode,
              inputSource: mode === "MANUAL" ? "manual" : "simulated",
            });
          }}
        >
          <option value="MANUAL">يدوي · بدون حساسات</option>
          <option value="RIGHT_FOOT">محاكاة · القدم اليمنى</option>
          <option value="LEFT_FOOT">محاكاة · القدم اليسرى</option>
          <option value="DUAL_FOOT">محاكاة · القدمان</option>
          <option disabled>حساسات فعلية · بانتظار التحقق</option>
        </select></ControlSlot>
      </div>
      {roles.length > 0 && (
        <div className={styles.sim}>
          {roles.map((role) => (
            <div key={role}>
              <strong>{ROLE_NAME[role]}</strong> ·{" "}
              {s.sensor.link[role] === "lost"
                ? "الاتصال مفقود"
                : s.sensor.link[role] === "ok"
                  ? "متصلة"
                  : "بانتظار إشارة"}
              <div className={styles.actions} style={{ marginTop: 6 }}>
                <button
                  className={styles.btn}
                  style={{ minHeight: 44 }}
                  aria-pressed={session.sim.moving[role]}
                  onClick={() =>
                    session.setSimulated({
                      moving: {
                        ...session.sim.moving,
                        [role]: !session.sim.moving[role],
                      },
                    })
                  }
                >
                  {session.sim.moving[role] ? "أوقف الحركة" : "حرّك القدم"}
                </button>
                <button
                  className={styles.btn}
                  style={{ minHeight: 44 }}
                  aria-pressed={!session.sim.connected[role]}
                  onClick={() =>
                    session.setSimulated({
                      connected: {
                        ...session.sim.connected,
                        [role]: !session.sim.connected[role],
                      },
                    })
                  }
                >
                  {session.sim.connected[role] ? "افصل الحساس" : "أعد الاتصال"}
                </button>
              </div>
            </div>
          ))}
          <p className={styles.note}>
            محاكاة فقط. الحساس يعطي تلميح حركة، ولا يعرف على أي حجر يقف الطفل.
            يبقى التحكم اليدوي متاحًا دائمًا.
          </p>
        </div>
      )}

      <CalibrationPanel s={s} send={send} />

      <h2>عرض الأرضية</h2>
      <div>
        <label htmlFor="view">زاوية العرض</label>
        <select
          id="view"
          value={s.config.view}
          disabled={!editable}
          onChange={(e) => cfg({ view: e.target.value as Config["view"] })}
        >
          <option value="floor">إسقاط الأرضية (علوي ثابت)</option>
          <option value="cinematic">معاينة سينمائية فقط</option>
        </select>
      </div>
      <div>
        <label htmlFor="margin">هامش آمن: {s.config.margin}٪</label>
        <input
          id="margin"
          type="range"
          min="0"
          max="15"
          step="1"
          value={s.config.margin}
          disabled={!layoutEditable}
          onChange={(e) => cfg({ margin: Number(e.target.value) })}
        />
      </div>
      <div>
        <label htmlFor="intensity">شدة العرض: {s.config.intensity}٪</label>
        <input
          id="intensity"
          type="range"
          min="50"
          max="100"
          step="5"
          value={s.config.intensity}
          disabled={!editable}
          onChange={(e) => cfg({ intensity: Number(e.target.value) })}
        />
      </div>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={s.config.grid}
          disabled={!editable}
          onChange={(e) => cfg({ grid: e.target.checked })}
        />{" "}
        شبكة المعايرة
      </label>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={s.config.highContrast}
          disabled={!editable}
          onChange={(e) => cfg({ highContrast: e.target.checked })}
        />{" "}
        تباين عالٍ
      </label>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={s.config.reducedMotion}
          disabled={!editable}
          onChange={(e) => cfg({ reducedMotion: e.target.checked })}
        />{" "}
        تقليل الحركة
      </label>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={s.config.sound}
          disabled={!editable}
          onChange={(e) => cfg({ sound: e.target.checked })}
        />{" "}
        أصوات هادئة عند النجاح
      </label>

      <p className={styles.note}>
        الصورة تُعرض على الأرض فقط، والنهر زينة مسطّحة لا عمق فيها ولا يُطلب
        القفز. لا يتتبّع النظام موقع قدم الطفل على الأحجار؛ المعالج هو من يؤكد
        وصوله. يحدّد المعالج مدى الحركة المناسب لكل طفل.
      </p>
      <div className={styles.status} role="status">
        {session.error ??
          (session.connected ? "● التحكم متصل" : "○ التحكم غير متصل")}
        <br />
        {session.displayConnected ? "● شاشة الأرض متصلة" : "○ افتح شاشة الأرض"}
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
    </aside>
  );
  if (s.status === "ready" && !s.startedAt)
    return (
      <main
        className={styles.page}
        data-testid="foot-control"
        data-status={s.status}
        data-stage={s.stage}
        dir="rtl"
      >
        <NativeSetupSections
          settings={setupSettings}
          stages={setupStages}
          start={
            <ControlSlot slot="session"><button
              type="button"
              disabled={!can}
              onClick={() => send({ type: "start", at: Date.now() })}
            >
              ابدأ النشاط
            </button></ControlSlot>
          }
        />
      </main>
    );
  return (
    <main
      className={styles.page}
      lang="ar"
      dir="rtl"
      data-testid="foot-control"
      data-status={s.status}
      data-stage={s.stage}
      data-step={s.step}
      data-phase={s.phase}
      data-safety={s.safety ? "1" : "0"}
      data-rest={s.rest ? "1" : "0"}
    >
      {s.status !== "ended" && s.status !== "stage-complete" && (
        <ControlSlot slot="session"><button
          className={`${styles.btn} ${styles.safety} ${styles.floatSafety}`}
          data-testid="safety"
          onClick={() => send({ type: "safety" })}
          aria-label="إيقاف الأمان"
        >
          ⛔ إيقاف الأمان
        </button></ControlSlot>
      )}
      <div className={styles.inner}>
        <header data-native-game-header className={styles.header}>
          <div>
            <div className={styles.eyebrow}>
              SHUMOS CARE · THE ENCHANTED FOREST
            </div>
            <h1 className={styles.title}>اتبع الخطوات</h1>
            <div className={styles.sub}>
              Follow the Footsteps 3D · المعالج يؤكد كل خطوة، والحساسات اختيارية
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
          <div className={styles.card}>
            <div className={styles.mapWrap}>
              <div className={styles.chips}>
                <span className={styles.chip}>
                  المستوى {def.level} · المرحلة {def.stage}
                </span>
                <span className={styles.chip}>
                  {WORLD_NAMES[worldOf(s.stage)]}
                </span>
                <span className={styles.chip}>
                  {PATTERN_NAME[def.pattern]}
                  {def.rests.length ? " · فترات راحة" : ""}
                </span>
                <span className={styles.chip} data-testid="step-chip">
                  الخطوة {Math.min(s.step + 1, def.steps)} من {def.steps}
                </span>
                {foot && (
                  <span className={`${styles.chip} ${styles.chipWarn}`}>
                    التلميح:{" "}
                    {foot === "RIGHT" ? "القدم اليمنى" : "القدم اليسرى"}
                  </span>
                )}
                {def.pairs && stepping && (
                  <span className={styles.chip}>
                    {s.phase === "preview"
                      ? "يُعرَض الحجران الآن"
                      : s.config.memoryAssist
                        ? "الخطوة مع مساعدة بصرية"
                        : "يتذكّر الطفل الحجرين"}
                  </span>
                )}
                {s.status === "paused" && (
                  <span className={`${styles.chip} ${styles.chipWarn}`}>
                    {s.safety
                      ? "إيقاف أمان · كل شيء مجمّد"
                      : s.rest
                        ? "استراحة اختيارية"
                        : "متوقف مؤقتًا"}
                  </span>
                )}
              </div>
              {s.sensor.pending && stepping && (
                <div className={styles.banner} role="status">
                  رُصدت حركة قدم (تلميح فقط). الحساس لا يعرف على أي حجر يقف
                  الطفل؛ أكّد الخطوة بنفسك عند وصوله.
                </div>
              )}
              <><ControlSlot slot="preview"><FootView state={{...s,config:{...s.config,sound:false}}} connected={can}/></ControlSlot><StoneMap state={s} /></>
              <p className={styles.note}>
                الحجر الذهبي هو الهدف الحالي على شاشة الطفل. لا يتقدم شيء حتى
                تضغط «تأكيد الخطوة». لا يوجد وقت محدد ولا فشل.
              </p>
            </div>

            <div className={styles.actions}>
              {s.status === "ready" && (
                <ControlSlot slot="session"><button
                  className={`${styles.btn} ${styles.primary}`}
                  disabled={!can}
                  onClick={() => send({ type: "start", at: Date.now() })}
                >
                  ابدأ المرحلة
                </button></ControlSlot>
              )}
              {s.status === "running" && (
                <ControlSlot slot="session"><button
                  className={styles.btn}
                  onClick={() => send({ type: "pause" })}
                >
                  إيقاف مؤقت
                </button></ControlSlot>
              )}
              {s.status === "paused" && (
                <ControlSlot slot="session"><button
                  className={`${styles.btn} ${s.safety ? styles.resumeSafe : styles.primary}`}
                  disabled={!can}
                  onClick={() => send({ type: "resume", at: Date.now() })}
                >
                  {s.safety
                    ? "استئناف بعد إيقاف الأمان"
                    : s.rest
                      ? "متابعة بعد الراحة"
                      : "متابعة"}
                </button></ControlSlot>
              )}
              {s.status === "stage-complete" && (
                <ControlSlot slot="settings"><button
                  className={`${styles.btn} ${styles.primary}`}
                  onClick={() => send({ type: "next", at: Date.now() })}
                >
                  {s.stage === 8 ? "إنهاء الجلسة" : "المرحلة التالية"}
                </button></ControlSlot>
              )}
            </div>

            {live && (
              <div className={styles.actions}>
                <ControlSlot slot="assistance"><button
                  className={`${styles.btn} ${styles.confirm}`}
                  data-testid="confirm"
                  disabled={!stepping || isResolved(s)}
                  onClick={() =>
                    send({
                      type: "confirm",
                      stage: s.stage,
                      step: s.step,
                      assisted: false,
                    })
                  }
                >
                  ✔ تأكيد الخطوة
                </button></ControlSlot>
                <ControlSlot slot="assistance"><button
                  className={`${styles.btn} ${styles.assist}`}
                  disabled={!stepping || isResolved(s)}
                  onClick={() =>
                    send({
                      type: "confirm",
                      stage: s.stage,
                      step: s.step,
                      assisted: true,
                    })
                  }
                >
                  خطوة بمساعدة
                </button></ControlSlot>
                <ControlSlot slot="assistance"><button
                  className={styles.btn}
                  disabled={!stepping}
                  onClick={() => send({ type: "repeat" })}
                >
                  أعد التلميح
                </button></ControlSlot>
                <ControlSlot slot="assistance"><button
                  className={styles.btn}
                  disabled={!stepping}
                  onClick={() =>
                    send({ type: "skip", stage: s.stage, step: s.step })
                  }
                >
                  تجاوز الخطوة
                </button></ControlSlot>
                {def.pairs && (
                  <ControlSlot slot="assistance"><button
                    className={styles.btn}
                    disabled={!stepping}
                    onClick={() => send({ type: "preview" })}
                  >
                    أعد عرض الحجرين
                  </button></ControlSlot>
                )}
                {def.pairs && s.phase === "preview" && (
                  <ControlSlot slot="assistance"><button
                    className={styles.btn}
                    disabled={!stepping}
                    onClick={() => send({ type: "startSteps" })}
                  >
                    ابدأ الخطوات الآن
                  </button></ControlSlot>
                )}
                <ControlSlot slot="navigation"><button
                  className={styles.btn}
                  onClick={() => send({ type: "skipStage" })}
                >
                  تجاوز المرحلة
                </button></ControlSlot>
              </div>
            )}
            <div className={styles.actions}>
              <ControlSlot slot="navigation"><button
                className={styles.btn}
                onClick={() => send({ type: "restart" })}
              >
                إعادة البدء
              </button></ControlSlot>
              {s.status !== "ended" && (
                <ControlSlot slot="session"><button
                  className={styles.btn}
                  onClick={() => send({ type: "end", at: Date.now() })}
                >
                  إنهاء الجلسة
                </button></ControlSlot>
              )}
            </div>

            <div
              className={styles.progress}
              aria-label={`${s.completed.length} من 9 مراحل مكتملة`}
              style={{ marginTop: 14 }}
            >
              {STAGES.map((_, i) => (
                <span
                  key={i}
                  className={`${styles.step} ${s.completed.includes(i) ? styles.done : ""}`}
                />
              ))}
              <span className={styles.note}>
                {sum.completed} خطوة · {sum.confirmed} مؤكدة · {sum.assisted}{" "}
                بمساعدة · {sum.skipped} متجاوزة · {s.completed.length}/9 مراحل
              </span>
            </div>
          </div>

          {setupSettings}
        </div>
      </div>
    </main>
  );
}
