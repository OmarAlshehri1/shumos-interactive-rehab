"use client";
import { NativeSetupSections } from "@/components/control/setup/GameSetupLayout";
import {
  ProgressiveStageGroup,
  AdditionalOptions,
} from "@/components/control/setup/ProgressiveStages";
import { useLibraryLaunchAdapter } from "@/components/control/library/launch/LibraryLaunchBoundary";
import { drivingDeviceReady } from "@/lib/games/library/capabilities";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { useFireRescueSession } from "@/lib/firerescue3d/useSession";
import {
  DEFAULT_MAPPING,
  MAPPING_STORAGE_KEY,
  sanitizeMapping,
  type Mapping,
} from "@/lib/firerescue3d/input";
import {
  NEUTRAL,
  summary,
  type Command,
  type Config,
  type Input,
  type State,
} from "@/lib/firerescue3d/engine";
import { STAGES } from "@/lib/firerescue3d/stages";
import { FireRescueView } from "@/components/display/firerescue3d/FireRescueView";
import { useSensorRuntime } from "@/components/control/sensors/SensorRuntimeProvider";
import { FireRescueThumbnail } from "./FireRescueThumbnail";
import { DeviceMapping } from "./DeviceMapping";
import styles from "./control.module.css";
export function FireRescueControl() {
  return isRealtimeEnabled() ? (
    <LiveControl />
  ) : (
    <main className={styles.page} dir="rtl">
      <h1>مهمة الإطفاء</h1>
      <p>يلزم إعداد اتصال منصة شموس لبدء الجلسة المشتركة.</p>
      <Link href="/control">مكتبة الأنشطة</Link>
    </main>
  );
}
function LiveControl() {
  const runtime = useFireRescueSession();
  const sensor = useSensorRuntime();
  const { setHardware } = runtime;
  const [mapping, setMapping] = useState<Mapping>(DEFAULT_MAPPING);
  const [mappingError, setMappingError] = useState("");
  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        const raw = localStorage.getItem(MAPPING_STORAGE_KEY);
        const m = raw && sanitizeMapping(JSON.parse(raw));
        if (m) setMapping(m);
      } catch {
        /* defaults remain unassigned */
      }
    });
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      const p = sensor.pointer;
      setHardware(
        mapping,
        p
          ? {
              x: p.pointer.x,
              y: p.pointer.y,
              fresh:
                sensor.connected &&
                sensor.centered &&
                performance.now() - (sensor.sample?.timestampMs ?? -Infinity) <
                  500,
            }
          : null,
      );
    }, 50);
    return () => clearInterval(timer);
  }, [
    mapping,
    sensor.pointer,
    sensor.connected,
    sensor.centered,
    sensor.sample,
    setHardware,
  ]);
  const changeMapping = (m: Mapping) => {
    setMapping(m);
    const safe = sanitizeMapping(m);
    setMappingError(
      safe
        ? ""
        : "المعايرة غير صالحة: يجب فصل المركز والنهايات، والراحة والضغط.",
    );
    if (safe) {
      try {
        localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(safe));
      } catch {
        /* device can continue without persistence */
      }
    }
  };
  if (!runtime.state)
    return (
      <main className={styles.page} dir="rtl">
        <h1>مهمة الإطفاء</h1>
        <p role="status">
          {runtime.blocked
            ? "الجلسة مرتبطة بنافذة أو مريض آخر. أغلق النافذة الأخرى واختر المريض الصحيح، ثم أعد التحميل."
            : runtime.error || "جارٍ تجهيز التحكم المشترك…"}
        </p>
        <Link href="/control">مكتبة الأنشطة</Link>
      </main>
    );
  return (
    <Panel
      state={runtime.state}
      runtime={runtime}
      mapping={mapping}
      onMapping={changeMapping}
      mappingError={mappingError}
      sensorReady={sensor.connected && sensor.centered}
    />
  );
}
function Panel({
  state: s,
  runtime,
  mapping,
  onMapping,
  mappingError,
  sensorReady,
}: {
  state: State;
  runtime: ReturnType<typeof useFireRescueSession>;
  mapping: Mapping;
  onMapping: (m: Mapping) => void;
  mappingError: string;
  sensorReady: boolean;
}) {
  const { send } = runtime;
  const [preview, setPreview] = useState(false);
  const held = useRef<Partial<Input>>({});
  const enabled = runtime.connected && !runtime.blocked;
  useLibraryLaunchAdapter("fire-rescue-3d", {
    modes: ["MANUAL", "STEERING", "PEDAL", "COMBINED"],
    apply: (mode) => {
      if (!enabled || !["ready", "paused"].includes(s.status)) return false;
      if (mode !== "MANUAL") {
        const pad = navigator.getGamepads?.()[mapping.deviceIndex] ?? null;
        const indices =
          mode === "STEERING"
            ? [mapping.steering.index]
            : mode === "PEDAL"
              ? [mapping.throttle.index]
              : [mapping.steering.index, mapping.throttle.index];
        if (
          !sanitizeMapping(mapping) ||
          !drivingDeviceReady(pad, indices, performance.now())
        )
          return false;
      }
      send({
        type: "config",
        patch: {
          source: mode === "MANUAL" ? "manual" : "wheel",
          mode:
            mode === "STEERING"
              ? "steering-only"
              : mode === "PEDAL"
                ? "pedal-only"
                : "assisted",
        },
      });
      return true;
    },
  });
  const running = s.status === "running" && enabled;
  const def = STAGES[s.stage];
  const sum = summary(s);
  const sendRef = useRef(send);
  const phaseRef = useRef(s.phase);
  useEffect(() => {
    sendRef.current = send;
    phaseRef.current = s.phase;
    held.current = {};
  }, [send, s.phase, s.status]);
  const release = useCallback(() => {
    if (!Object.keys(held.current).length) return;
    held.current = {};
    sendRef.current({
      type: "input",
      patch: { ...NEUTRAL },
      source: "manual",
      at: Date.now(),
    });
  }, []);
  useEffect(() => {
    const loop = setInterval(() => {
      if (Object.keys(held.current).length)
        sendRef.current({
          type: "input",
          patch: held.current,
          source: "manual",
          at: Date.now(),
        });
    }, 80);
    const stop = () => {
      release();
      sendRef.current({ type: "safety" });
    };
    const visibility = () => {
      if (document.hidden) stop();
    };
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      clearInterval(loop);
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      held.current = {};
      sendRef.current({ type: "safety" });
    };
  }, [release]);
  const begin = useCallback(
    (patch: Partial<Input>) => {
      held.current = { ...held.current, ...patch };
      send({
        type: "input",
        patch: held.current,
        source: "manual",
        at: Date.now(),
      });
    },
    [send],
  );
  const cfg = (patch: Partial<Config>) => {
    release();
    send({ type: "config", patch });
  };
  const action = (command: Command) => {
    held.current = {};
    send(command);
  };
  const holdButton = (
    text: string,
    patch: Partial<Input>,
    test: string,
    className = "",
  ) => (
    <button
      type="button"
      data-testid={test}
      disabled={!running}
      className={`${styles.hold} ${className}`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        begin(patch);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          begin(patch);
        }
      }}
      onKeyUp={release}
    >
      {text}
    </button>
  );
  const checks: {
    key: keyof Config;
    label: string;
  }[] = [
    { key: "autoDrive", label: "قيادة تلقائية بمساعدة" },
    { key: "autoWater", label: "تدفق ماء تلقائي" },
    { key: "reducedMotion", label: "تقليل حركة الكاميرا" },
    { key: "highContrast", label: "تباين عالٍ" },
    { key: "sound", label: "إشارات صوتية هادئة" },
  ];
  const sliders: {
    key: keyof Config;
    label: string;
    min: number;
    max: number;
    step: number;
  }[] = [
    {
      key: "speedCap",
      label: "السرعة القصوى (م/ث)",
      min: 1,
      max: 7,
      step: 0.5,
    },
    {
      key: "steeringAssist",
      label: "مساعدة التوجيه",
      min: 0,
      max: 1,
      step: 0.1,
    },
    {
      key: "aimAssist",
      label: "مساعدة تصويب الماء",
      min: 0,
      max: 1,
      step: 0.1,
    },
    {
      key: "steeringRange",
      label: "مدى حركة المقود",
      min: 0.1,
      max: 1,
      step: 0.05,
    },
    { key: "sensitivity", label: "حساسية المقود", min: 0.2, max: 3, step: 0.1 },
    {
      key: "deadZone",
      label: "المنطقة المحايدة",
      min: 0,
      max: 0.8,
      step: 0.05,
    },
    {
      key: "pedalThreshold",
      label: "عتبة الدواسة",
      min: 0,
      max: 0.8,
      step: 0.05,
    },
    {
      key: "aimSensitivity",
      label: "حساسية التصويب",
      min: 0.2,
      max: 3,
      step: 0.1,
    },
    { key: "volume", label: "مستوى الصوت", min: 0, max: 1, step: 0.1 },
  ];
  const setupStages = (
    <ProgressiveStageGroup selected={s.stage}>
      {STAGES.map((d, i) => (
        <button
          key={i}
          type="button"
          aria-label={`المرحلة ${i + 1}: ${d.name}`}
          data-testid={`stage-${i}`}
          disabled={s.status === "running" || s.status === "ended"}
          className={`${styles.stage} ${i === s.stage ? styles.current : ""} ${s.completed.includes(i) ? styles.done : ""}`}
          onClick={() => action({ type: "stage", stage: i })}
        >
          <span>المرحلة {i + 1}</span>
          <strong>{d.name}</strong>
          <small>{d.stops.length} محطات إنقاذ</small>
          {s.completed.includes(i) ? "✓" : s.skipped.includes(i) ? "—" : ""}
        </button>
      ))}
    </ProgressiveStageGroup>
  );
  const setupSettings = (
    <aside className={styles.sidebar}>
      {(s.status !== "ready" || !!s.startedAt) && (
        <section className={styles.card}>
          <h2>المستوى والمرحلة</h2>
          {setupStages}
        </section>
      )}
      <section className={styles.card}>
        <span className={styles.overline}>إعدادات المشاركة</span>
        <h2>على قدر حركة الطفل</h2>
        <p className={styles.note}>
          المعالج يختار المساعدة المناسبة. كل إدخال يدوي من المعالج يُسجّل
          كمساعدة.
        </p>
        <fieldset
          disabled={!enabled || s.status === "ended"}
          className={styles.settings}
        >
          <label>
            طريقة القيادة
            <select
              aria-label="طريقة القيادة"
              value={s.config.mode}
              onChange={(e) => cfg({ mode: e.target.value as Config["mode"] })}
            >
              <option value="manual">قيادة يدوية دون توجيه آلي</option>
              <option value="assisted">توجيه بمساعدة</option>
              <option value="auto-throttle">تسارع آلي + مقود الطفل</option>
              <option value="therapist-throttle">تسارع المعالج</option>
              <option value="steering-only">مشاركة بالمقود فقط</option>
              <option value="pedal-only">مشاركة بالدواسة فقط</option>
            </select>
          </label>
          <label>
            مصدر الإدخال
            <select
              aria-label="مصدر الإدخال"
              value={s.config.source}
              onChange={(e) =>
                cfg({ source: e.target.value as Config["source"] })
              }
            >
              <option value="manual">يدوي · دون أجهزة</option>
              <option value="gamepad" disabled={!!mappingError}>
                Gamepad محلي · يحتاج معايرة
              </option>
              <option value="wheel" disabled={!!mappingError}>
                مقود ودواسات · تحقق فعلي معلق
              </option>
              <option
                value="hand"
                disabled={!sensorReady || s.phase !== "firefighting"}
              >
                حساس اليد · للماء فقط
              </option>
            </select>
          </label>
          <button
            data-testid="manual-fallback"
            type="button"
            onClick={() => cfg({ source: "manual" })}
          >
            العودة للتحكم اليدوي
          </button>
          {checks.map((c) => (
            <label key={c.key} className={styles.check}>
              <input
                data-testid={`config-${c.key}`}
                type="checkbox"
                checked={s.config[c.key] as boolean}
                onChange={(e) => cfg({ [c.key]: e.target.checked })}
              />
              {c.label}
            </label>
          ))}
          {s.config.mode === "therapist-throttle" && (
            <label>
              تسارع المعالج
              <input
                aria-label="تسارع المعالج"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={s.config.therapistThrottle}
                onChange={(e) =>
                  cfg({ therapistThrottle: Number(e.target.value) })
                }
              />
            </label>
          )}
          {sliders
            .filter((c) =>
              [
                "speedCap",
                "steeringAssist",
                "aimAssist",
                "steeringRange",
              ].includes(c.key),
            )
            .map((c) => (
              <label key={c.key}>
                {c.label}
                <span className={styles.value}>
                  {s.config[c.key] as number}
                </span>
                <input
                  aria-label={c.label}
                  data-testid={`config-${c.key}`}
                  type="range"
                  min={c.min}
                  max={c.max}
                  step={c.step}
                  value={s.config[c.key] as number}
                  onChange={(e) => cfg({ [c.key]: Number(e.target.value) })}
                />
              </label>
            ))}
          <AdditionalOptions title="حساسية الجهاز والصوت">
            {sliders
              .filter(
                (c) =>
                  ![
                    "speedCap",
                    "steeringAssist",
                    "aimAssist",
                    "steeringRange",
                  ].includes(c.key),
              )
              .map((c) => (
                <label key={c.key}>
                  {c.label}
                  <span className={styles.value}>
                    {s.config[c.key] as number}
                  </span>
                  <input
                    aria-label={c.label}
                    data-testid={`config-${c.key}`}
                    type="range"
                    min={c.min}
                    max={c.max}
                    step={c.step}
                    value={s.config[c.key] as number}
                    onChange={(e) => cfg({ [c.key]: Number(e.target.value) })}
                  />
                </label>
              ))}
          </AdditionalOptions>
          <AdditionalOptions>
            <label>
              جودة العرض
              <select
                aria-label="جودة العرض"
                value={s.config.quality}
                onChange={(e) =>
                  cfg({ quality: e.target.value as Config["quality"] })
                }
              >
                <option value="high">عالية</option>
                <option value="low">خفيفة</option>
              </select>
            </label>
          </AdditionalOptions>
        </fieldset>
        <DeviceMapping mapping={mapping} onChange={onMapping} />
        {mappingError && (
          <p role="alert" className={styles.warning}>
            {mappingError}
          </p>
        )}
      </section>
      <section className={`${styles.card} ${styles.status}`} role="status">
        {s.safety && (
          <p className={styles.warning}>
            {s.inputLost
              ? "انقطع مصدر الإدخال. اختر التحكم اليدوي ثم استأنف."
              : "إيقاف أمان · استأنف عندما تكون جاهزًا."}
          </p>
        )}
        {runtime.blocked && (
          <p className={styles.warning}>انتقل التحكم إلى نافذة أخرى.</p>
        )}
        {runtime.error && <p className={styles.warning}>{runtime.error}</p>}
        <strong>
          {s.status === "ended" ? "نتائج الجلسة" : "لا حد زمني · لا عقوبة"}
        </strong>
        <p>
          {runtime.history === "saved"
            ? "✓ حُفظت الجلسة مرة واحدة"
            : runtime.history === "walk-in"
              ? "جلسة زائر · دون سجل مريض"
              : runtime.history === "retry"
                ? "تعذّر الحفظ؛ تجري إعادة المحاولة"
                : runtime.history === "saving"
                  ? "جارٍ حفظ النتائج…"
                  : "التقدم محفوظ في الجلسة المشتركة"}
        </p>
        <p className={styles.note}>
          لا يقيس النشاط قوة المقود أو زاوية المفصل أو التوازن السريري.
        </p>
      </section>
    </aside>
  );
  if (s.status === "ready" && !s.startedAt)
    return (
      <main
        className={styles.page}
        data-testid="fire-control"
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
              disabled={!enabled}
              onClick={() => action({ type: "start", at: Date.now() })}
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
      data-testid="fr-control"
      data-status={s.status}
      data-phase={s.phase}
      data-stage={s.stage}
      data-stop={s.stop}
      data-distance={s.distance.toFixed(2)}
      data-lateral={s.lateral.toFixed(3)}
      data-speed={s.speed.toFixed(3)}
      data-events={s.events.length}
      data-completed={s.completed.length}
      data-safety={s.safety ? "1" : "0"}
      data-history={runtime.history}
    >
      {s.status === "running" && (
        <button
          className={styles.floatingStop}
          data-testid="safety-stop"
          onClick={() => action({ type: "stop" })}
        >
          ■ توقف آمن
        </button>
      )}
      <div className={styles.inner}>
        <header data-native-game-header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>
              SHUMOS CARE / RESCUE MISSIONS
            </span>
            <h1>
              مهمة الإطفاء <span>Fire Rescue 3D</span>
            </h1>
            <p>رحلة هادئة. مشاركة صغيرة. إنجاز جميل.</p>
          </div>
          <nav>
            <Link href="/control">مكتبة الأنشطة</Link>
            <a href="/display" target="_blank" rel="noopener">
              فتح شاشة الطفل ↗
            </a>
          </nav>
        </header>
        <div className={styles.meta}>
          {runtime.identity && (
            <span>
              الجلسة لـ {runtime.identity.childName || "صديقي"} ·{" "}
              {runtime.identity.patientId ? "مريض محفوظ" : "جلسة زائر"}
            </span>
          )}
          <span className={runtime.connected ? styles.online : styles.offline}>
            {runtime.connected ? "● التحكم متصل" : "○ التحكم غير متصل"}
          </span>
          <span>
            {runtime.displayConnected
              ? "● شاشة الطفل متصلة"
              : "○ افتح شاشة الطفل"}
          </span>
          <span>عرض جداري · مشاركة جلوسًا</span>
          <span>المقود والدواسات بانتظار التحقق</span>
        </div>
        <div className={styles.layout}>
          <div className={styles.main}>
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <span className={styles.overline}>
                    المستوى {def.level} / المرحلة {(s.stage % 3) + 1}
                  </span>
                  <h2>{def.name}</h2>
                </div>
                <span className={styles.pill}>
                  {s.phase === "driving"
                    ? "قيادة إلى موقع الإنقاذ"
                    : "وجّه الماء نحو النار"}
                </span>
              </div>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  data-testid="preview-3d"
                  checked={preview}
                  onChange={(e) => setPreview(e.target.checked)}
                />
                معاينة ثلاثية الأبعاد على جهاز التحكم
              </label>
              {preview ? (
                <FireRescueView state={s} connected={enabled} muted />
              ) : (
                <div className={styles.missionMap}>
                  <FireRescueThumbnail />
                  <div>
                    <strong>
                      {s.phase === "driving"
                        ? `${Math.round(s.distance)} / ${def.length} متر`
                        : "وجّه الماء"}
                    </strong>
                    <span>
                      {s.status === "paused"
                        ? "استراحة · تقدمك محفوظ"
                        : s.status === "stage-complete"
                          ? "أحسنت!"
                          : s.status === "ended"
                            ? "انتهت الجلسة"
                            : s.status === "ready"
                              ? "ابدأ عندما يكون الطفل جاهزًا"
                              : "المهمة قيد اللعب"}
                    </span>
                    <progress
                      value={
                        s.phase === "driving"
                          ? s.distance / def.length
                          : 1 -
                            s.fires.reduce((a, b) => a + b, 0) / s.fires.length
                      }
                      max="1"
                    />
                  </div>
                </div>
              )}

              <div className={styles.actions}>
                {s.status === "ready" && (
                  <button
                    data-testid="start"
                    className={styles.primary}
                    disabled={!enabled}
                    onClick={() => action({ type: "start", at: Date.now() })}
                  >
                    ابدأ المهمة ←
                  </button>
                )}
                {s.status === "running" && (
                  <button
                    data-testid="pause"
                    disabled={!enabled}
                    onClick={() => action({ type: "pause" })}
                  >
                    إيقاف مؤقت
                  </button>
                )}
                {s.status === "paused" && (
                  <button
                    data-testid="resume"
                    className={styles.primary}
                    disabled={!enabled}
                    onClick={() => action({ type: "resume", at: Date.now() })}
                  >
                    استئناف المهمة
                  </button>
                )}
                {s.status === "stage-complete" && (
                  <button
                    data-testid="next"
                    className={styles.primary}
                    disabled={!enabled}
                    onClick={() => action({ type: "next", at: Date.now() })}
                  >
                    {s.stage === 8 ? "إنهاء وحفظ النتائج" : "المهمة التالية ←"}
                  </button>
                )}
                {s.status !== "ended" && (
                  <button
                    className={styles.stop}
                    data-testid="stop"
                    disabled={!enabled}
                    onClick={() => action({ type: "stop" })}
                  >
                    ■ توقف آمن
                  </button>
                )}
              </div>
            </div>
            <section className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <span className={styles.overline}>
                    تحكم مباشر · المعالج له الأولوية
                  </span>
                  <h2>
                    {s.phase === "driving" ? "لنقد السيارة" : "لنطفئ النار"}
                  </h2>
                </div>
                <span className={styles.pill}>
                  {s.config.source === "manual"
                    ? "تحكّم يدوي"
                    : s.config.source}
                </span>
              </div>
              <div className={styles.controls}>
                {s.phase === "driving" ? (
                  <>
                    <div className={styles.steering} dir="ltr">
                      {holdButton("← يسار", { steering: -0.7 }, "left")}
                      <div
                        className={styles.wheel}
                        style={{ transform: `rotate(${s.steering * 65}deg)` }}
                      >
                        ✣
                      </div>
                      {holdButton("يمين →", { steering: 0.7 }, "right")}
                    </div>
                    <label className={styles.analog}>
                      المقود
                      <input
                        aria-label="المقود اليدوي"
                        data-testid="steering-slider"
                        disabled={!running}
                        type="range"
                        min="-1"
                        max="1"
                        step="0.02"
                        value={s.input.steering}
                        onChange={(e) =>
                          begin({ steering: Number(e.target.value) })
                        }
                        onPointerUp={release}
                        onPointerCancel={release}
                        onKeyUp={release}
                      />
                    </label>
                    <div className={styles.pedals}>
                      {holdButton(
                        "▲ تسارع",
                        { throttle: 1 },
                        "throttle",
                        styles.accelerator,
                      )}
                      {holdButton(
                        "■ فرامل",
                        { brake: 1, throttle: 0 },
                        "brake",
                        styles.brake,
                      )}
                    </div>
                    <button
                      data-testid="reset"
                      disabled={!enabled || s.status === "ended"}
                      onClick={() => action({ type: "reset" })}
                    >
                      إعادة السيارة إلى الطريق
                    </button>
                  </>
                ) : (
                  <>
                    <div className={styles.aim} dir="ltr">
                      {holdButton("↑ أعلى", { aimY: 1 }, "aim-up")}
                      {holdButton("← يسار", { aimX: -1 }, "aim-left")}
                      {holdButton("↓ أسفل", { aimY: -1 }, "aim-down")}
                      {holdButton("يمين →", { aimX: 1 }, "aim-right")}
                    </div>
                    <label className={styles.analog}>
                      التصويب أفقيًا
                      <input
                        aria-label="التصويب اليدوي"
                        disabled={!running}
                        type="range"
                        min="-1"
                        max="1"
                        step="0.05"
                        value={s.input.aimX}
                        onChange={(e) =>
                          begin({ aimX: Number(e.target.value) })
                        }
                        onPointerUp={release}
                        onKeyUp={release}
                      />
                    </label>
                    {holdButton(
                      "◉ اضغط لتدفق الماء",
                      { water: true },
                      "water",
                      styles.water,
                    )}
                    <div className={styles.fireMeters}>
                      {s.fires.map((v, i) => (
                        <div key={i}>
                          <span>
                            منطقة {i + 1} {v === 0 ? "✓" : "🔥"}
                          </span>
                          <progress max="1" value={1 - v} />
                          <span>{Math.round((1 - v) * 100)}٪</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className={styles.actions}>
                <button
                  data-testid="assist"
                  className={styles.assist}
                  disabled={!enabled || s.status === "ended"}
                  onClick={() => action({ type: "assist" })}
                >
                  مساعدة المعالج
                </button>
                <button
                  data-testid="repeat"
                  disabled={
                    !enabled || !["running", "paused"].includes(s.status)
                  }
                  onClick={() => action({ type: "repeat" })}
                >
                  أعد الهدف
                </button>
                <button
                  data-testid="skip-objective"
                  disabled={
                    !enabled || !["running", "paused"].includes(s.status)
                  }
                  onClick={() => action({ type: "skipObjective" })}
                >
                  تجاوز الهدف
                </button>
              </div>
              <p className={styles.note}>
                اضغط باستمرار للتحريك أو رش الماء. التحرير يوقف الإدخال؛ زر
                التوقف الآمن يوقف حتى القيادة التلقائية.
              </p>
            </section>
            <section className={styles.card}>
              <span className={styles.overline}>تقدم الجلسة</span>
              <div className={styles.results}>
                <div>
                  <strong>
                    {s.completed.length}
                    <small>/9</small>
                  </strong>
                  <span>مراحل مكتملة</span>
                </div>
                <div>
                  <strong>{sum.driving}</strong>
                  <span>أهداف قيادة</span>
                </div>
                <div>
                  <strong>{sum.fires}</strong>
                  <span>مناطق أُطفئت</span>
                </div>
                <div>
                  <strong>{sum.assisted}</strong>
                  <span>أهداف بمساعدة</span>
                </div>
              </div>
              <p className={styles.note}>
                {sum.independent} أهداف دون مساعدة آلية أو يدوية · {sum.skipped}{" "}
                أهداف متخطاة · {s.skipped.length} مراحل متخطاة. الأرقام تصف
                اللعب فقط.
              </p>
              <div className={styles.actions}>
                {s.status === "ended" && (
                  <button
                    data-testid="new-session"
                    disabled={
                      !enabled ||
                      !["saved", "walk-in"].includes(runtime.history)
                    }
                    onClick={() =>
                      action({ type: "new", sessionId: crypto.randomUUID() })
                    }
                  >
                    جلسة جديدة
                  </button>
                )}
                <button
                  data-testid="restart"
                  disabled={!enabled || s.status === "ended"}
                  onClick={() => action({ type: "restart" })}
                >
                  إعادة المرحلة
                </button>
                <button
                  data-testid="skip-stage"
                  disabled={!enabled || s.status === "ended"}
                  onClick={() => action({ type: "skipStage" })}
                >
                  تجاوز المرحلة
                </button>
                <button
                  data-testid="end"
                  disabled={!enabled || s.status === "ended"}
                  onClick={() => action({ type: "end", at: Date.now() })}
                >
                  إنهاء الجلسة
                </button>
              </div>
            </section>
          </div>
          {setupSettings}
        </div>
      </div>
    </main>
  );
}
