"use client";
import { ControlSlot } from "@/components/control/ui/ControlWorkspace";
import { GardenView } from "@/components/display/colorchase3d/GardenView";
import { NativeSetupSections } from "@/components/control/setup/GameSetupLayout";
import {
  ProgressiveStageSelect,
  AdditionalOptions,
} from "@/components/control/setup/ProgressiveStages";
import { useLibraryLaunchAdapter } from "@/components/control/library/launch/LibraryLaunchBoundary";
import Link from "next/link";
import { useState } from "react";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { COLORS, type ColorId } from "@/lib/colorchase3d/colors";
import {
  PRESETS,
  isResolved,
  restoration,
  stepsFor,
  summary,
  targetOf,
  type Command,
  type Config,
  type State,
} from "@/lib/colorchase3d/engine";
import {
  STAGES,
  WORLD_NAMES,
  stepsOf,
  worldOf,
} from "@/lib/colorchase3d/stages";
import { useColorChaseSession } from "@/lib/colorchase3d/useSession";
import {
  rolesForMode,
  type FootRole,
  type InputMode,
} from "@/lib/safehexarena3d/sensorInput";
import { SymbolIcon } from "@/components/display/colorchase3d/SymbolIcon";
import { CalibrationPanel } from "./CalibrationPanel";
import { ZoneMap } from "./ZoneMap";
import styles from "./control.module.css";

const ROLE_NAME: Record<FootRole, string> = {
  RIGHT_FOOT: "القدم اليمنى",
  LEFT_FOOT: "القدم اليسرى",
};
const LAYOUT_NAME = {
  row: "منطقتان كبيرتان",
  arc: "قوس لطيف",
  ring: "حلقة حول الحديقة",
  path: "ممرات الحديقة",
} as const;

export function ColorChaseControl() {
  return isRealtimeEnabled() ? (
    <LiveColorChaseControl />
  ) : (
    <main className={styles.page}>
      <div className={styles.inner}>
        <h1>مطاردة الألوان</h1>
        <p>يلزم إعداد اتصال المنصة المشتركة لفتح جلسة متزامنة.</p>
        <Link href="/control">مكتبة الأنشطة</Link>
      </div>
    </main>
  );
}

function LiveColorChaseControl() {
  const session = useColorChaseSession();
  const { state: s, send } = session;
  if (!s) {
    return (
      <main className={styles.page}>
        <div className={styles.inner}>
          <h1>مطاردة الألوان</h1>
          <p role="status">
            {session.blocked
              ? "جلسة أخرى تتحكم الآن في الشاشة. أغلقها أو انتظر قبل المتابعة."
              : (session.error ?? "جارٍ فتح الجلسة…")}
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
  session: ReturnType<typeof useColorChaseSession>;
}) {
  const def = STAGES[s.stage];
  const steps = stepsFor(s);
  const target = targetOf(s);
  const can = session.connected && !session.blocked;
  const live = s.status === "running" || s.status === "paused";
  const attempting = live && s.step < steps.length;
  // a chosen zone belongs to exactly one objective: it is ignored as soon as the objective (or the status) changes
  const pickKey = `${s.run}:${s.stage}:${s.step}:${s.status}`;
  const [pick, setPick] = useState<{ key: string; color: ColorId } | null>(
    null,
  );
  const picked = pick?.key === pickKey ? pick.color : null;
  const setPicked = (color: ColorId | null) =>
    setPick(color ? { key: pickKey, color } : null);
  const cfg = (config: Partial<Config>) => send({ type: "configure", config });
  useLibraryLaunchAdapter("color-chase", {
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
  const rest = restoration(s);
  const roles =
    s.config.inputSource === "simulated"
      ? rolesForMode(s.config.inputMode)
      : [];
  const editable = s.status !== "ended";
  const layoutEditable = editable && s.status !== "running";
  const stageLocked = (i: number) =>
    s.events.some((e) => e.stage === i) ||
    s.completed.includes(i) ||
    s.skipped.includes(i);
  const confirmPick = () => {
    if (!picked || !attempting) return;
    send({ type: "select", stage: s.stage, step: s.step, color: picked });
    setPicked(null);
  };
  const restoredCount = Object.values(rest.colors).filter(
    (v) => v >= 0.99,
  ).length;

  const setupStages = (
    <ProgressiveStageSelect
      onSelect={(value) => send({ type: "stage", stage: Number(value) })}
    >
      <select
        id="stage"
        data-testid="stage-select"
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
            data-stage-description={`${d.colors.length} ألوان · ${d.rounds.length} جولات${d.shuffle ? " · تتبدّل المواضع بين الجولات" : ""}`}
            key={i}
            value={i}
            disabled={stageLocked(i) && i !== s.stage}
          >
            المستوى {d.level} · المرحلة {d.stage} · {d.nameAr} ({stepsOf(d)}{" "}
            أهداف)
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
        <div className={styles.note}>إعدادات جاهزة</div>
        <div className={styles.presets} role="group" aria-label="إعدادات جاهزة">
          <button
            className={styles.btn}
            data-testid="preset-standard"
            disabled={!layoutEditable}
            onClick={() => cfg(PRESETS.standard)}
          >
            قياسي
          </button>
          <button
            className={styles.btn}
            data-testid="preset-large"
            disabled={!layoutEditable}
            onClick={() => cfg(PRESETS.large)}
          >
            مناطق كبيرة
          </button>
          <button
            className={styles.btn}
            data-testid="preset-compact"
            disabled={!layoutEditable}
            onClick={() => cfg(PRESETS.compact)}
          >
            مدى صغير
          </button>
        </div>
      </div>
      <div>
        <label htmlFor="zoneScale">حجم المناطق: {s.config.zoneScale}٪</label>
        <input
          id="zoneScale"
          type="range"
          min="70"
          max="140"
          step="5"
          value={s.config.zoneScale}
          disabled={!layoutEditable}
          onChange={(e) => cfg({ zoneScale: Number(e.target.value) })}
        />
      </div>
      <div>
        <label htmlFor="spacing">
          المسافة بين المناطق: {s.config.spacing}٪
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
        <ControlSlot slot="settings"><label htmlFor="reach">مدى الحركة المريح: {s.config.reach}٪</label>
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
      <AdditionalOptions>
        <div>
          <label htmlFor="maxColors">
            عدد الألوان الظاهرة: {s.config.maxColors}
          </label>
          <input
            id="maxColors"
            type="range"
            min="2"
            max="5"
            step="1"
            value={s.config.maxColors}
            disabled={!layoutEditable}
            onChange={(e) => cfg({ maxColors: Number(e.target.value) })}
          />
        </div>
        <div>
          <label htmlFor="quality">جودة الرسومات</label>
          <select
            id="quality"
            data-testid="quality"
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
      {!layoutEditable && editable && (
        <p className={styles.note}>
          تُعدَّل أحجام المناطق والمسافات والمدى وعدد الألوان عند الإيقاف المؤقت
          أو بين المراحل، فلا تتحرك المناطق تحت هدف جارٍ.
        </p>
      )}
      <label className={styles.check}>
        <input
          type="checkbox"
          data-testid="symbols"
          checked={s.config.symbols}
          disabled={!editable}
          onChange={(e) => cfg({ symbols: e.target.checked })}
        />{" "}
        أشكال وأسماء على المناطق (لا نعتمد على اللون وحده)
      </label>
      <div>
        <ControlSlot slot="settings"><label htmlFor="assist">مستوى المساعدة البصرية</label>
        <select
          id="assist"
          data-testid="assist-select"
          value={s.config.assist}
          disabled={!editable}
          onChange={(e) => cfg({ assist: e.target.value as Config["assist"] })}
        >
          <option value="standard">عادي · إضاءة المنطقة المطلوبة</option>
          <option value="high">عالٍ · تخفيت بقية المناطق وتلميح للتالي</option>
        </select></ControlSlot>
      </div>
      <p className={styles.note}>
        أنت من يحدّد مدى الحركة المناسب لكل طفل. المنصة لا تقيس مدى حركة المفاصل
        ولا التوازن، ولا يُطلب وقوف أو مشي: يمكن المشاركة جالسًا أو بمساعدة.
      </p>

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
                  data-testid={`sim-move-${role}`}
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
                  data-testid={`sim-conn-${role}`}
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
            محاكاة فقط. الحساس يعطي تلميح بدء حركة، ولا يعرف على أي منطقة يقف
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
          data-testid="high-contrast"
          checked={s.config.highContrast}
          disabled={!editable}
          onChange={(e) => cfg({ highContrast: e.target.checked })}
        />{" "}
        تباين عالٍ
      </label>
      <label className={styles.check}>
        <input
          type="checkbox"
          data-testid="reduced-motion"
          checked={s.config.reducedMotion}
          disabled={!editable}
          onChange={(e) => cfg({ reducedMotion: e.target.checked })}
        />{" "}
        تقليل الحركة
      </label>
      <label className={styles.check}>
        <input
          type="checkbox"
          data-testid="sound"
          checked={s.config.sound}
          disabled={!editable}
          onChange={(e) => cfg({ sound: e.target.checked })}
        />{" "}
        أصوات هادئة عند عودة لون
      </label>

      <p className={styles.note}>
        الصورة تُعرض على الأرض فقط، والحديقة زينة مسطّحة لا عمق فيها ولا حفر ولا
        ارتفاعات يُطلب تجاوزها. لا يتتبّع النظام موقع قدم الطفل على الأرض؛
        المعالج هو من يؤكد اختياره.
      </p>
      <div className={styles.status} role="status" data-testid="link-status">
        {session.error ??
          (session.connected ? "● التحكم متصل" : "○ التحكم غير متصل")}
        <br />
        {session.displayConnected ? "● شاشة الأرض متصلة" : "○ افتح شاشة الأرض"}
        <br />
        {s.status !== "ended"
          ? session.history === "saved"
            ? "✓ حُفظت الجلسة"
            : session.history === "walk-in"
              ? "جلسة زائر · دون سجل مريض"
              : session.history === "retry"
                ? "تعذّر الحفظ، تجري إعادة المحاولة"
                : session.history === "saving"
                  ? "جارٍ الحفظ…"
                  : ""
          : ""}
      </div>
    </aside>
  );
  if (s.status === "ready" && !s.startedAt)
    return (
      <main
        className={styles.page}
        data-testid="cc-control"
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
      data-testid="cc-control"
      data-status={s.status}
      data-stage={s.stage}
      data-step={s.step}
      data-safety={s.safety ? "1" : "0"}
      data-target={target?.color ?? ""}
      data-picked={picked ?? ""}
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
            <div className={styles.eyebrow}>SHUMOS CARE · THE LOST COLORS</div>
            <h1 className={styles.title}>مطاردة الألوان</h1>
            <div className={styles.sub}>
              Color Chase 3D · عالم الألوان المفقودة · المعالج يؤكد كل اختيار،
              والحساسات اختيارية
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
            {s.status === "ended" ? (
              <section data-testid="results" aria-label="ملخص الجلسة">
                <h2>ملخص الجلسة</h2>
                <div className={styles.summary}>
                  <div className={styles.stat}>
                    <strong data-testid="res-completed">{sum.completed}</strong>
                    <span>أهداف مكتملة</span>
                  </div>
                  <div className={styles.stat}>
                    <strong data-testid="res-assisted">{sum.assisted}</strong>
                    <span>اختيارات بمساعدة</span>
                  </div>
                  <div className={styles.stat}>
                    <strong data-testid="res-repeats">{s.repeats}</strong>
                    <span>أهداف أُعيدت</span>
                  </div>
                  <div className={styles.stat}>
                    <strong data-testid="res-skipped">{sum.skipped}</strong>
                    <span>أهداف متجاوزة</span>
                  </div>
                  <div className={styles.stat}>
                    <strong data-testid="res-stages">
                      {s.completed.length}/9
                    </strong>
                    <span>مراحل مكتملة</span>
                  </div>
                </div>
                <p className={styles.note}>
                  هذه أعداد مشاركة فقط. لا تحسب المنصة دقة ولا تقيس توازنًا أو
                  مدى حركة.
                </p>
                <p
                  className={styles.status}
                  role="status"
                  data-testid="history-status"
                >
                  {session.history === "saved"
                    ? "✓ حُفظت الجلسة في سجل المريض"
                    : session.history === "walk-in"
                      ? "جلسة زائر · دون سجل مريض"
                      : session.history === "retry"
                        ? "تعذّر الحفظ، تجري إعادة المحاولة"
                        : session.history === "saving"
                          ? "جارٍ الحفظ…"
                          : ""}
                </p>
                <div className={styles.actions}>
                  <button
                    className={`${styles.btn} ${styles.primary}`}
                    data-testid="restart"
                    onClick={() => send({ type: "restart" })}
                  >
                    جلسة جديدة
                  </button>
                  <Link
                    className={styles.btn}
                    href="/control"
                    style={{
                      display: "inline-grid",
                      placeItems: "center",
                      textDecoration: "none",
                    }}
                  >
                    مكتبة الأنشطة
                  </Link>
                </div>
              </section>
            ) : (
              <>
                <div className={styles.mapWrap}>
                  <div className={styles.chips}>
                    <span className={styles.chip} data-testid="stage-chip">
                      المستوى {def.level} · المرحلة {def.stage} · {def.nameAr}
                    </span>
                    <span className={styles.chip}>
                      {WORLD_NAMES[worldOf(s.stage)]}
                    </span>
                    <span className={styles.chip}>
                      {LAYOUT_NAME[def.layout]}
                    </span>
                    <span className={styles.chip} data-testid="step-chip">
                      الهدف {Math.min(s.step + 1, steps.length)} من{" "}
                      {steps.length}
                    </span>
                    {def.rounds.some((r) => r.length > 1) && (
                      <span className={styles.chip}>
                        تسلسل: اللون التالي بعد السابق
                      </span>
                    )}
                    {def.shuffle && (
                      <span className={styles.chip}>
                        تتبدّل المواضع بين الجولات فقط
                      </span>
                    )}
                    <span className={styles.chip}>
                      الألوان المستعادة {restoredCount}/5
                    </span>
                    {s.status === "paused" && (
                      <span className={`${styles.chip} ${styles.chipWarn}`}>
                        {s.safety
                          ? "إيقاف أمان · كل شيء مجمّد"
                          : "متوقف مؤقتًا"}
                      </span>
                    )}
                    {picked && (
                      <span
                        className={`${styles.chip} ${styles.pickedChip}`}
                        data-testid="picked-chip"
                      >
                        المنطقة المختارة: {COLORS[picked].nameAr}
                      </span>
                    )}
                  </div>
                  {attempting && target && (
                    <div
                      className={styles.ask}
                      style={{ ["--c" as string]: COLORS[target.color].hex }}
                      data-testid="ask"
                      data-color={target.color}
                    >
                      <SymbolIcon
                        color={target.color}
                        className={styles.askSym}
                      />
                      <div>
                        <div className={styles.askName}>
                          المطلوب: {COLORS[target.color].nameAr}
                        </div>
                        <div className={styles.askMeta}>
                          {target.roundLength > 1
                            ? `تسلسل ${target.pos + 1} من ${target.roundLength} · `
                            : ""}
                          {COLORS[target.color].restoresAr}
                        </div>
                      </div>
                    </div>
                  )}
                  {s.sensor.pending && attempting && (
                    <div className={styles.banner} role="status">
                      رُصدت حركة قدم (تلميح فقط). الحساس لا يعرف على أي منطقة
                      يقف الطفل؛ اختر المنطقة وأكّد بنفسك.
                    </div>
                  )}
                  <><ControlSlot slot="preview"><GardenView state={{...s,config:{...s.config,sound:false}}} connected={can}/></ControlSlot><ControlSlot slot="assistance"><ZoneMap
                    state={s}
                    picked={picked}
                    onPick={setPicked}
                    disabled={!attempting || !can}
                  /></ControlSlot></>
                  <p className={styles.note}>
                    المنطقة المحاطة بخط متقطع هي اللون المطلوب على شاشة الطفل.
                    اضغط المنطقة التي اختارها الطفل ثم «تأكيد الاختيار». لا يوجد
                    وقت محدد ولا فشل، ومنطقة أخرى تعني فقط نظرة ثانية إلى الهدف.
                  </p>
                </div>

                <div className={styles.actions}>
                  {s.status === "ready" && (
                    <button
                      className={`${styles.btn} ${styles.primary}`}
                      data-testid="start"
                      disabled={!can}
                      onClick={() => send({ type: "start", at: Date.now() })}
                    >
                      ابدأ المرحلة
                    </button>
                  )}
                  {s.status === "running" && (
                    <ControlSlot slot="session"><button
                      className={styles.btn}
                      data-testid="pause"
                      onClick={() => send({ type: "pause" })}
                    >
                      إيقاف مؤقت
                    </button></ControlSlot>
                  )}
                  {s.status === "paused" && (
                    <ControlSlot slot="session"><button
                      className={`${styles.btn} ${s.safety ? styles.resumeSafe : styles.primary}`}
                      data-testid="resume"
                      disabled={!can}
                      onClick={() => send({ type: "resume", at: Date.now() })}
                    >
                      {s.safety ? "استئناف بعد إيقاف الأمان" : "متابعة"}
                    </button></ControlSlot>
                  )}
                  {s.status === "stage-complete" && (
                    <ControlSlot slot="settings"><button
                      className={`${styles.btn} ${styles.primary}`}
                      data-testid="next"
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
                      disabled={!attempting || !picked || !can || isResolved(s)}
                      onClick={confirmPick}
                    >
                      ✔ تأكيد الاختيار
                    </button></ControlSlot>
                    <ControlSlot slot="assistance"><button
                      className={`${styles.btn} ${styles.assist}`}
                      data-testid="assist"
                      disabled={!attempting || !can || isResolved(s)}
                      onClick={() =>
                        send({ type: "assist", stage: s.stage, step: s.step })
                      }
                    >
                      اختيار بمساعدة
                    </button></ControlSlot>
                    <ControlSlot slot="assistance"><button
                      className={styles.btn}
                      data-testid="repeat"
                      disabled={!attempting}
                      onClick={() => send({ type: "repeat" })}
                    >
                      أعد الهدف
                    </button></ControlSlot>
                    <ControlSlot slot="assistance"><button
                      className={styles.btn}
                      data-testid="skip"
                      disabled={!attempting}
                      onClick={() =>
                        send({ type: "skip", stage: s.stage, step: s.step })
                      }
                    >
                      تجاوز الهدف
                    </button></ControlSlot>
                    <button
                      className={styles.btn}
                      data-testid="skip-stage"
                      onClick={() => send({ type: "skipStage" })}
                    >
                      تجاوز المرحلة
                    </button>
                  </div>
                )}
                <div className={styles.actions}>
                  <button
                    className={styles.btn}
                    data-testid="restart"
                    onClick={() => send({ type: "restart" })}
                  >
                    إعادة البدء
                  </button>
                  <ControlSlot slot="session"><button
                    className={styles.btn}
                    data-testid="end"
                    onClick={() => send({ type: "end", at: Date.now() })}
                  >
                    إنهاء الجلسة
                  </button></ControlSlot>
                </div>
              </>
            )}

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
              <span className={styles.note} data-testid="counts">
                {sum.completed} هدفًا · {sum.confirmed} مؤكدًا · {sum.assisted}{" "}
                بمساعدة · {sum.skipped} متجاوزًا · {s.repeats} إعادة ·{" "}
                {s.completed.length}/9 مراحل
              </span>
            </div>
          </div>

          {setupSettings}
        </div>
      </div>
    </main>
  );
}
