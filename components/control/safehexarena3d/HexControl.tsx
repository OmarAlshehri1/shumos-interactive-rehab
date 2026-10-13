"use client";
import { NativeSetupSections } from "@/components/control/setup/GameSetupLayout";
import {
  ProgressiveStageSelect,
  AdditionalOptions,
} from "@/components/control/setup/ProgressiveStages";
import { useLibraryLaunchAdapter } from "@/components/control/library/launch/LibraryLaunchBoundary";
import Link from "next/link";
import { useState } from "react";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import {
  isResolved,
  layoutOf,
  summary,
  type Command,
  type Config,
  type State,
} from "@/lib/safehexarena3d/engine";
import { STAGES, tilesFor } from "@/lib/safehexarena3d/stages";
import { useHexSession } from "@/lib/safehexarena3d/useSession";
import {
  rolesForMode,
  type FootRole,
  type InputMode,
} from "@/lib/safehexarena3d/sensorInput";
import { CalibrationPanel } from "./CalibrationPanel";
import { HexMap } from "./HexMap";
import styles from "./control.module.css";

const ROLE_NAME: Record<FootRole, string> = {
  RIGHT_FOOT: "القدم اليمنى",
  LEFT_FOOT: "القدم اليسرى",
};
const PHASE_TEXT = {
  prep: "تحضير · كل البلاطات آمنة",
  warning: "تحذير · بلاطات برتقالية",
  inactive: "البلاطات المحذَّرة غير فعّالة",
  restoring: "تعود البلاطات للأمان",
} as const;

export function HexControl() {
  return isRealtimeEnabled() ? (
    <LiveHexControl />
  ) : (
    <main className={styles.page}>
      <div className={styles.inner}>
        <h1>الأرض الآمنة</h1>
        <p>يلزم إعداد اتصال المنصة المشتركة لفتح جلسة متزامنة.</p>
        <Link href="/control">مكتبة الأنشطة</Link>
      </div>
    </main>
  );
}

function LiveHexControl() {
  const session = useHexSession();
  const { state: s, send } = session;
  if (!s) {
    return (
      <main className={styles.page}>
        <div className={styles.inner}>
          <h1>الأرض الآمنة</h1>
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
  session: ReturnType<typeof useHexSession>;
}) {
  const def = STAGES[s.stage];
  const [picked, setPicked] = useState<number | null>(null);
  const layout = layoutOf(s);
  const sel = picked !== null && picked < layout.tiles ? picked : s.childTile;
  const can = session.connected && !session.blocked;
  const live = s.status === "running" || s.status === "paused";
  const resolved = isResolved(s);
  const inRound = live && (s.phase === "warning" || s.phase === "inactive");
  const selSafe = sel !== null && !s.warn.includes(sel);
  const cfg = (config: Partial<Config>) => send({ type: "configure", config });
  useLibraryLaunchAdapter("safe-hex-arena-3d", {
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
            data-stage-description={`${d.tiles} مناطق في التخطيط القياسي · ${d.rounds} جولات`}
            key={i}
            value={i}
            disabled={
              s.events.some((e) => e.stage === i) ||
              s.completed.includes(i) ||
              s.skipped.includes(i)
            }
          >
            المستوى {d.level} · المرحلة {d.stage} ·{" "}
            {tilesFor(i, s.config.layoutPreset)} بلاطة
          </option>
        ))}
      </select>
    </ProgressiveStageSelect>
  );
  const setupSettings = (
    <aside className={`${styles.card} ${styles.panel}`}>
      <h2>إعدادات الجلسة</h2>
      {(s.status !== "ready" || !!s.startedAt) && setupStages}

      <div>
        <label htmlFor="warnMs">مدة التحذير</label>
        <select
          id="warnMs"
          value={s.config.warnMs}
          disabled={!editable}
          onChange={(e) => cfg({ warnMs: Number(e.target.value) })}
        >
          {[3000, 5000, 8000, 10000, 15000, 20000, 30000].map((n) => (
            <option key={n} value={n}>
              {n / 1000} ثانية{n === 5000 ? " (افتراضي)" : ""}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="prepMs">مدة التحضير</label>
        <select
          id="prepMs"
          value={s.config.prepMs}
          disabled={!editable}
          onChange={(e) => cfg({ prepMs: Number(e.target.value) })}
        >
          {[2000, 4000, 6000, 10000, 15000].map((n) => (
            <option key={n} value={n}>
              {n / 1000} ثانية
            </option>
          ))}
        </select>
      </div>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={s.config.auto}
          disabled={!editable}
          onChange={(e) => cfg({ auto: e.target.checked })}
        />{" "}
        توقيت تلقائي (إلغاؤه يعني التقدّم يدويًا)
      </label>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={s.config.targetChild}
          disabled={!editable}
          onChange={(e) => cfg({ targetChild: e.target.checked })}
        />{" "}
        اجعل بلاطة الطفل المؤكدة ضمن التحذير
      </label>

      <h2>مصدر الحركة</h2>
      <div>
        <label htmlFor="input">وضع الإدخال</label>
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
        </select>
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
            محاكاة فقط. الحساس يعطي تلميح حركة، ولا يعرف أي بلاطة يقف عليها
            الطفل. يبقى التحكم اليدوي متاحًا دائمًا.
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
          <option value="floor">إسقاط الأرضية (علوي)</option>
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
          disabled={!editable}
          onChange={(e) => cfg({ margin: Number(e.target.value) })}
        />
      </div>
      <div>
        <label htmlFor="scale">حجم الشبكة: {s.config.scale}٪</label>
        <input
          id="scale"
          type="range"
          min="70"
          max="110"
          step="1"
          value={s.config.scale}
          disabled={!editable}
          onChange={(e) => cfg({ scale: Number(e.target.value) })}
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
        إشارات صوتية هادئة
      </label>
      <AdditionalOptions>
        <div>
          <label htmlFor="quality">جودة العرض</label>
          <select
            id="quality"
            value={s.config.quality}
            disabled={!editable}
            onChange={(e) =>
              cfg({ quality: e.target.value as Config["quality"] })
            }
          >
            <option value="high">عالية</option>
            <option value="low">خفيفة</option>
          </select>
        </div>
      </AdditionalOptions>
      <p className={styles.note}>
        الصورة تُعرض على الأرض فقط. لا يتتبّع النظام موقع قدم الطفل على
        البلاطات؛ المعالج هو من يؤكد موقعه. يحدّد المعالج مدى الحركة المناسبة
        لكل طفل.
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
        data-testid="hex-control"
        data-status={s.status}
        data-stage={s.stage}
        dir="rtl"
      >
        <NativeSetupSections
          settings={setupSettings}
          stages={setupStages}
          start={
            <button
              type="button"
              disabled={!can}
              onClick={() => send({ type: "start", at: Date.now() })}
            >
              ابدأ النشاط
            </button>
          }
        />
      </main>
    );
  return (
    <main
      className={styles.page}
      lang="ar"
      dir="rtl"
      data-testid="hex-control"
      data-status={s.status}
      data-phase={s.phase}
      data-stage={s.stage}
      data-round={s.round}
      data-safety={s.safety ? "1" : "0"}
    >
      {s.status !== "ended" && s.status !== "stage-complete" && (
        <button
          className={`${styles.btn} ${styles.safety} ${styles.floatSafety}`}
          data-testid="safety"
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
            <h1 className={styles.title}>الأرض الآمنة</h1>
            <div className={styles.sub}>
              Safe Hex Arena 3D · المعالج يؤكد كل انتقال، والحساسات اختيارية
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
                  الجولة {Math.min(s.round + 1, def.rounds)} من {def.rounds}
                </span>
                <span className={styles.chip}>{layout.tiles} بلاطة</span>
                {live && (
                  <span
                    className={`${styles.chip} ${s.phase === "warning" ? styles.chipWarn : ""}`}
                  >
                    {PHASE_TEXT[s.phase]}
                  </span>
                )}
                {s.status === "paused" && (
                  <span className={`${styles.chip} ${styles.chipWarn}`}>
                    {s.safety ? "إيقاف أمان · الأرضية مجمّدة" : "متوقف مؤقتًا"}
                  </span>
                )}
                <span className={styles.chip}>
                  {s.childTile === null
                    ? "موقع الطفل غير مؤكد"
                    : `الطفل على البلاطة ${s.childTile + 1}`}
                </span>
              </div>
              {s.sensor.pending && inRound && (
                <div className={styles.banner} role="status">
                  رُصدت حركة قدم (تلميح فقط). الحساس لا يعرف أي بلاطة؛ اضغط
                  البلاطة التي وقف عليها الطفل ثم أكّد.
                </div>
              )}
              <HexMap state={s} selected={sel} onSelect={setPicked} />
              <p className={styles.note}>
                اضغط بلاطة لتحديدها، ثم استخدم الأزرار. لا يتغيّر شيء قبل الضغط
                على زر. الخطوط الخضراء المتقطعة: بلاطات آمنة مجاورة لبلاطة
                محذَّرة.
              </p>
            </div>

            <div className={styles.actions}>
              {s.status === "ready" && (
                <button
                  className={`${styles.btn} ${styles.primary}`}
                  disabled={!can}
                  onClick={() => send({ type: "start", at: Date.now() })}
                >
                  ابدأ المرحلة
                </button>
              )}
              {s.status === "running" && (
                <button
                  className={styles.btn}
                  onClick={() => send({ type: "pause" })}
                >
                  إيقاف مؤقت
                </button>
              )}
              {s.status === "paused" && (
                <button
                  className={`${styles.btn} ${s.safety ? styles.resumeSafe : styles.primary}`}
                  disabled={!can}
                  onClick={() => send({ type: "resume", at: Date.now() })}
                >
                  {s.safety ? "استئناف بعد إيقاف الأمان" : "متابعة"}
                </button>
              )}
              {s.status === "stage-complete" && (
                <button
                  className={`${styles.btn} ${styles.primary}`}
                  onClick={() => send({ type: "next", at: Date.now() })}
                >
                  {s.stage === 8 ? "إنهاء الجلسة" : "المرحلة التالية"}
                </button>
              )}
            </div>

            {live && (
              <div className={styles.actions}>
                {s.phase === "prep" && (
                  <button
                    className={`${styles.btn} ${styles.primary}`}
                    disabled={s.status !== "running"}
                    onClick={() => send({ type: "warn" })}
                  >
                    ابدأ التحذير
                  </button>
                )}
                {s.phase === "warning" && (
                  <button
                    className={styles.btn}
                    onClick={() => send({ type: "extend", ms: 3000 })}
                  >
                    +٣ ثوانٍ للتحذير
                  </button>
                )}
                {s.phase === "warning" && (
                  <button
                    className={styles.btn}
                    onClick={() => send({ type: "hide" })}
                  >
                    أطفئ البلاطات الآن
                  </button>
                )}
                <button
                  className={styles.btn}
                  disabled={sel === null}
                  onClick={() =>
                    sel !== null && send({ type: "child", tile: sel })
                  }
                >
                  هنا يقف الطفل
                </button>
                <button
                  className={`${styles.btn} ${styles.primary}`}
                  disabled={!inRound || !selSafe}
                  onClick={() =>
                    sel !== null &&
                    send({ type: "confirm", tile: sel, assisted: false })
                  }
                >
                  أكّد: وصل لبلاطة آمنة
                </button>
                <button
                  className={`${styles.btn} ${styles.assist}`}
                  disabled={!inRound || !selSafe}
                  onClick={() =>
                    sel !== null &&
                    send({ type: "confirm", tile: sel, assisted: true })
                  }
                >
                  انتقال بمساعدة
                </button>
                <button
                  className={styles.btn}
                  disabled={resolved || s.phase === "restoring"}
                  onClick={() => send({ type: "repeat" })}
                >
                  أعد الجولة
                </button>
                <button
                  className={styles.btn}
                  disabled={resolved || s.phase === "restoring"}
                  onClick={() => send({ type: "skipRound" })}
                >
                  تجاوز الجولة
                </button>
                <button
                  className={styles.btn}
                  onClick={() => send({ type: "skipStage" })}
                >
                  تجاوز المرحلة
                </button>
              </div>
            )}
            <div className={styles.actions}>
              <button
                className={styles.btn}
                onClick={() => send({ type: "restart" })}
              >
                إعادة البدء
              </button>
              {s.status !== "ended" && (
                <button
                  className={styles.btn}
                  onClick={() => send({ type: "end", at: Date.now() })}
                >
                  إنهاء الجلسة
                </button>
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
                {sum.completed} جولة · {sum.confirmed} مؤكدة · {sum.assisted}{" "}
                بمساعدة · {s.completed.length}/9 مراحل
              </span>
            </div>
          </div>

          {setupSettings}
        </div>
      </div>
    </main>
  );
}
