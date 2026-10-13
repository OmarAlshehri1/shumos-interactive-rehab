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
import { usePearlVoyageSession } from "@/lib/pearlvoyage3d/useSession";
import {
  DEFAULT_MAPPING,
  MAPPING_STORAGE_KEY,
  sanitizeMapping,
  type Mapping,
} from "@/lib/pearlvoyage3d/input";
import {
  NEUTRAL,
  collection,
  currentMarker,
  summary,
  type Command,
  type Config,
  type Input,
  type State,
} from "@/lib/pearlvoyage3d/engine";
import { ENVIRONMENTS, SPECIES, STAGES } from "@/lib/pearlvoyage3d/stages";
import { MODE_LABEL, stageTitle } from "@/lib/pearlvoyage3d/copy";
import { PearlVoyageView } from "@/components/display/pearlvoyage3d/PearlVoyageView";
import { PearlVoyageThumbnail } from "./PearlVoyageThumbnail";
import { DeviceMapping } from "./DeviceMapping";
import { MiniMap } from "./MiniMap";
import styles from "./control.module.css";

export function PearlVoyageControl() {
  return isRealtimeEnabled() ? (
    <LiveControl />
  ) : (
    <main className={styles.page} dir="rtl">
      <h1>قارب اللؤلؤ</h1>
      <p>يلزم إعداد اتصال منصة شموس لبدء الجلسة المشتركة.</p>
      <Link href="/control">مكتبة الأنشطة</Link>
    </main>
  );
}
function LiveControl() {
  const runtime = usePearlVoyageSession();
  const { setMapping: publishMapping } = runtime;
  const [mapping, setMapping] = useState<Mapping>(DEFAULT_MAPPING);
  const [mappingError, setMappingError] = useState("");
  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        const raw = localStorage.getItem(MAPPING_STORAGE_KEY);
        const m = raw && sanitizeMapping(JSON.parse(raw));
        if (m) setMapping(m);
      } catch {
        /* defaults stay unassigned */
      }
    });
  }, []);
  useEffect(() => {
    const safe = sanitizeMapping(mapping);
    if (safe) publishMapping(safe);
  }, [mapping, publishMapping]);
  const changeMapping = (m: Mapping) => {
    setMapping(m);
    const safe = sanitizeMapping(m);
    setMappingError(
      safe
        ? ""
        : "المعايرة غير صالحة: يجب فصل المركز عن النهايات، والراحة عن الضغط.",
    );
    if (safe) {
      try {
        localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(safe));
      } catch {
        /* works without persistence */
      }
    }
  };
  if (!runtime.state)
    return (
      <main className={styles.page} dir="rtl">
        <h1>قارب اللؤلؤ</h1>
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
    />
  );
}
const sliders: {
  key: keyof Config;
  label: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "speedCap", label: "السرعة القصوى (م/ث)", min: 1, max: 6, step: 0.5 },
  {
    key: "markerRadius",
    label: "حجم منطقة الوصول (م)",
    min: 5,
    max: 14,
    step: 1,
  },
  { key: "steeringAssist", label: "مساعدة التوجيه", min: 0, max: 1, step: 0.1 },
  {
    key: "steeringRange",
    label: "مدى حركة المقود",
    min: 0.1,
    max: 1,
    step: 0.05,
  },
  { key: "sensitivity", label: "حساسية المقود", min: 0.2, max: 3, step: 0.1 },
  { key: "deadZone", label: "المنطقة المحايدة", min: 0, max: 0.8, step: 0.02 },
  {
    key: "pedalThreshold",
    label: "عتبة الدواسة",
    min: 0,
    max: 0.8,
    step: 0.05,
  },
];
const holdSliders: {
  key: keyof Config;
  label: string;
  min: number;
  max: number;
  step: number;
}[] = [
  {
    key: "holdSeconds",
    label: "مدة التثبيت (ثوانٍ)",
    min: 1,
    max: 10,
    step: 0.5,
  },
  {
    key: "holdThreshold",
    label: "عتبة التفعيل",
    min: 0.1,
    max: 0.9,
    step: 0.05,
  },
  { key: "tapCount", label: "عدد الضغطات القصيرة", min: 2, max: 8, step: 1 },
];
const checks: { key: keyof Config; label: string }[] = [
  { key: "reducedMotion", label: "تقليل الحركة" },
  { key: "highContrast", label: "تباين عالٍ" },
  { key: "sound", label: "الصوت" },
  { key: "music", label: "موسيقى هادئة" },
  { key: "voice", label: "تعليمات صوتية بالعربية" },
];

function Panel({
  state: s,
  runtime,
  mapping,
  onMapping,
  mappingError,
}: {
  state: State;
  runtime: ReturnType<typeof usePearlVoyageSession>;
  mapping: Mapping;
  onMapping: (m: Mapping) => void;
  mappingError: string;
}) {
  const { send } = runtime;
  const [preview, setPreview] = useState(false);
  // every touch-held control is tracked by id, so steering and throttle can be held at the same time
  const held = useRef(new Map<string, Partial<Input>>());
  const enabled = runtime.connected && !runtime.blocked;
  useLibraryLaunchAdapter("pearl-voyage-3d", {
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
          control:
            mode === "MANUAL"
              ? "manual"
              : mode === "STEERING"
                ? "wheel"
                : mode === "PEDAL"
                  ? "pedal"
                  : "wheel-pedal",
        },
      });
      return true;
    },
  });
  const running = s.status === "running" && enabled;
  const def = STAGES[s.stage];
  const sum = summary(s);
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);
  const merged = useCallback(() => {
    const m: Input = { ...NEUTRAL };
    for (const p of held.current.values()) {
      if (p.steering !== undefined) m.steering = p.steering;
      if (p.throttle !== undefined)
        m.throttle = Math.max(m.throttle, p.throttle);
      if (p.brake !== undefined) m.brake = Math.max(m.brake, p.brake);
      if (p.hold) m.hold = true;
    }
    return m;
  }, []);
  const push = useCallback(
    () =>
      sendRef.current({
        type: "input",
        patch: merged(),
        source: "manual",
        at: Date.now(),
      }),
    [merged],
  );
  const begin = useCallback(
    (id: string, patch: Partial<Input>) => {
      held.current.set(id, patch);
      push();
    },
    [push],
  );
  const end = useCallback(
    (id: string) => {
      if (held.current.delete(id)) push();
    },
    [push],
  );
  const releaseAll = useCallback(() => {
    if (!held.current.size) return;
    held.current.clear();
    push();
  }, [push]);
  useEffect(() => {
    const loop = setInterval(() => {
      if (held.current.size) push();
    }, 80);
    const stop = () => {
      releaseAll();
      sendRef.current({ type: "safety" });
    };
    const visibility = () => {
      if (document.hidden) stop();
    };
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pointercancel", releaseAll);
    const live = held.current;
    return () => {
      clearInterval(loop);
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pointercancel", releaseAll);
      live.clear();
      sendRef.current({ type: "safety" });
    };
  }, [push, releaseAll]);
  // a status or stage change drops every hold; ordinary phase changes (arrival, celebration) keep a finger that is still down
  useEffect(() => {
    held.current.clear();
  }, [s.status, s.stage]);
  const cfg = (patch: Partial<Config>) => {
    releaseAll();
    send({ type: "config", patch });
  };
  const action = (command: Command) => {
    held.current.clear();
    send(command);
  };
  const holdButton = (
    id: string,
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
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* the hold still works without capture */
        }
        begin(id, patch);
      }}
      onPointerUp={() => end(id)}
      onPointerCancel={() => end(id)}
      onLostPointerCapture={() => end(id)}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          begin(id, patch);
        }
      }}
      onKeyUp={() => end(id)}
    >
      {text}
    </button>
  );
  const marker = currentMarker(s);
  const collected = collection(s);
  const encounter = s.phase === "encounter" && s.encounterMs >= 1800;
  const setupStages = (
    <ProgressiveStageGroup selected={s.stage}>
      {STAGES.map((d, i) => (
        <button
          key={i}
          type="button"
          aria-label={`المرحلة ${i + 1}: ${d.name}`}
          data-testid={`stage-${i}`}
          disabled={s.status === "running" || s.status === "ended" || !enabled}
          className={`${styles.stage} ${i === s.stage ? styles.current : ""} ${s.completed.includes(i) ? styles.done : ""}`}
          onClick={() => action({ type: "stage", stage: i })}
        >
          <span>المرحلة {i + 1}</span>
          <strong>{stageTitle(i)}</strong>
          <small>{d.markers.length} اكتشافات</small>
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
          المعالج يختار المساعدة المناسبة. كل إدخال يدوي أو تلقائي يُسجَّل
          كمساعدة.
        </p>
        <fieldset
          disabled={!enabled || s.status === "ended"}
          className={styles.settings}
        >
          <label>
            مصدر التحكم
            <select
              aria-label="مصدر التحكم"
              data-testid="config-control"
              value={s.config.control}
              onChange={(e) =>
                cfg({ control: e.target.value as Config["control"] })
              }
            >
              <option value="manual">يدوي من المعالج · دون أجهزة</option>
              <option value="wheel" disabled={!!mappingError}>
                مقود فقط · تحقق فعلي معلق
              </option>
              <option value="pedal" disabled={!!mappingError}>
                دواسة فقط · تحقق فعلي معلق
              </option>
              <option value="wheel-pedal" disabled={!!mappingError}>
                مقود ودواسة · تحقق فعلي معلق
              </option>
            </select>
          </label>
          <button
            data-testid="manual-fallback"
            type="button"
            onClick={() => cfg({ control: "manual" })}
          >
            العودة للتحكم اليدوي
          </button>
          <label>
            أسلوب المشاركة
            <select
              aria-label="أسلوب المشاركة"
              data-testid="config-mode"
              value={s.config.mode}
              onChange={(e) => cfg({ mode: e.target.value as Config["mode"] })}
            >
              <option value="combined">مقود وتسارع معًا</option>
              <option value="steering-only">
                مشاركة بالمقود فقط (تسارع آلي)
              </option>
              <option value="pedal-only">
                مشاركة بالدواسة فقط (توجيه آلي)
              </option>
            </select>
          </label>
          <label>
            طريقة التثبيت
            <select
              aria-label="طريقة التثبيت"
              data-testid="config-holdMode"
              value={s.config.holdMode}
              onChange={(e) =>
                cfg({ holdMode: e.target.value as Config["holdMode"] })
              }
            >
              <option value="manual">زر المعالج فقط</option>
              <option value="steering">تثبيت المقود في اتجاه مريح</option>
              <option value="pedal">ضغط الدواسة بلطف</option>
              <option value="tap">ضغطات قصيرة متكررة</option>
            </select>
          </label>
          {s.config.holdMode === "steering" && (
            <label>
              اتجاه المقود
              <select
                aria-label="اتجاه المقود"
                value={s.config.holdDirection}
                onChange={(e) =>
                  cfg({
                    holdDirection: e.target.value as Config["holdDirection"],
                  })
                }
              >
                <option value="any">أي اتجاه</option>
                <option value="right">يمين</option>
                <option value="left">يسار</option>
              </select>
            </label>
          )}
          {holdSliders.map((c) => (
            <label key={c.key}>
              {c.label}
              <span className={styles.value}>{s.config[c.key] as number}</span>
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
          <label>
            مستوى الصوت
            <span className={styles.value}>{s.config.volume}</span>
            <input
              aria-label="مستوى الصوت"
              data-testid="config-volume"
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={s.config.volume}
              onChange={(e) => cfg({ volume: Number(e.target.value) })}
            />
          </label>
          <AdditionalOptions>
            <label>
              جودة الرسوم
              <select
                aria-label="جودة الرسوم"
                data-testid="config-quality"
                value={s.config.quality}
                onChange={(e) =>
                  cfg({ quality: e.target.value as Config["quality"] })
                }
              >
                <option value="high">عالية</option>
                <option value="medium">متوسطة</option>
                <option value="low">خفيفة</option>
              </select>
            </label>
          </AdditionalOptions>
        </fieldset>
        <DeviceMapping
          mapping={mapping}
          onChange={onMapping}
          hardware={runtime.hardware}
        />
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
        data-testid="pearl-control"
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
      data-testid="pv-control"
      data-status={s.status}
      data-phase={s.phase}
      data-stage={s.stage}
      data-marker={s.marker}
      data-x={s.x.toFixed(2)}
      data-y={s.y.toFixed(2)}
      data-heading={s.heading.toFixed(3)}
      data-speed={s.speed.toFixed(3)}
      data-hold={s.hold.toFixed(3)}
      data-events={s.events.length}
      data-completed={s.completed.length}
      data-skipped={s.skipped.length}
      data-safety={s.safety ? "1" : "0"}
      data-control={s.config.control}
      data-history={runtime.history}
      data-writes={runtime.writes.current.writes}
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
            <span className={styles.eyebrow}>SHUMOS CARE / OCEAN VOYAGES</span>
            <h1>
              قارب اللؤلؤ <span>Pearl Voyage 3D</span>
            </h1>
            <p>رحلة هادئة. اكتشافات جميلة. مشاركة على قدر الطفل.</p>
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
            <section className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <span className={styles.overline}>
                    {ENVIRONMENTS[def.env].nameEn} / المرحلة {(s.stage % 3) + 1}
                  </span>
                  <h2>
                    {stageTitle(s.stage)} · {def.name}
                  </h2>
                </div>
                <span className={styles.pill}>
                  {s.phase === "sailing"
                    ? `إلى ${SPECIES[marker.species].nameAr}`
                    : s.phase === "encounter"
                      ? encounter
                        ? "ثبّت لإكمال الاكتشاف"
                        : "سمكة قادمة…"
                      : "اكتشاف جديد!"}
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
                <div className={styles.preview}>
                  <PearlVoyageView state={s} connected={enabled} muted />
                </div>
              ) : (
                <div className={styles.missionMap}>
                  <MiniMap state={s} />
                  <div className={styles.mapSide}>
                    <div className={styles.thumb}>
                      <PearlVoyageThumbnail />
                    </div>
                    <strong>
                      {s.phase === "sailing"
                        ? `${Math.round(Math.hypot(marker.x - s.x, marker.y - s.y))} م إلى العلامة`
                        : `التثبيت ${Math.round(s.hold * 100)}٪`}
                    </strong>
                    <span>
                      {s.status === "paused"
                        ? "استراحة · تقدمك محفوظ"
                        : s.status === "stage-complete"
                          ? "أحسنت! اكتملت المرحلة"
                          : s.status === "ended"
                            ? "انتهت الجلسة"
                            : s.status === "ready"
                              ? "ابدأ عندما يكون الطفل جاهزًا"
                              : "الرحلة قيد اللعب"}
                    </span>
                    <progress
                      value={
                        s.phase === "encounter"
                          ? s.hold
                          : s.events.filter((e) => e.stage === s.stage).length /
                            def.markers.length
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
                    ابدأ الرحلة ←
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
                    استئناف الرحلة
                  </button>
                )}
                {s.status === "stage-complete" && (
                  <button
                    data-testid="next"
                    className={styles.primary}
                    disabled={!enabled}
                    onClick={() => action({ type: "next", at: Date.now() })}
                  >
                    {s.stage === STAGES.length - 1
                      ? "إنهاء وحفظ النتائج"
                      : "المرحلة التالية ←"}
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
            </section>
            <section className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <span className={styles.overline}>
                    تحكم مباشر · المعالج له الأولوية
                  </span>
                  <h2>
                    {s.phase === "sailing"
                      ? "لنقد القارب"
                      : "ثبّت لتكتمل الصداقة"}
                  </h2>
                </div>
                <span className={styles.pill}>
                  {MODE_LABEL[s.config.control]}
                </span>
              </div>
              <div className={styles.controls}>
                <div className={styles.steering} dir="ltr">
                  {holdButton(
                    "left",
                    "← يسار",
                    { steering: -0.7 },
                    "steer-left",
                  )}
                  <div
                    className={styles.wheel}
                    style={{ transform: `rotate(${s.steering * 90}deg)` }}
                    aria-hidden
                  >
                    ✣
                  </div>
                  {holdButton(
                    "right",
                    "يمين →",
                    { steering: 0.7 },
                    "steer-right",
                  )}
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
                      begin("slider", { steering: Number(e.target.value) })
                    }
                    onPointerUp={() => end("slider")}
                    onPointerCancel={() => end("slider")}
                    onKeyUp={() => end("slider")}
                  />
                </label>
                <div className={styles.pedals}>
                  {holdButton(
                    "throttle",
                    "▲ تسارع",
                    { throttle: 1 },
                    "throttle",
                    styles.accelerator,
                  )}
                  {holdButton(
                    "brake",
                    "■ فرامل",
                    { brake: 1, throttle: 0 },
                    "brake",
                    styles.brake,
                  )}
                </div>
                {holdButton(
                  "hold",
                  s.config.holdMode === "tap"
                    ? "◉ اضغط ضغطة قصيرة"
                    : "◉ اضغط وثبّت",
                  { hold: true },
                  "hold",
                  styles.holdAction,
                )}
                <div className={styles.fishMeter}>
                  <span>
                    {encounter
                      ? `${SPECIES[marker.species].nameAr}`
                      : "التثبيت"}
                  </span>
                  <progress
                    max="1"
                    value={s.hold}
                    data-testid="hold-progress"
                  />
                  <span>{Math.round(s.hold * 100)}٪</span>
                </div>
              </div>
              <div className={styles.toggleRow}>
                <label className={styles.switch}>
                  <input
                    data-testid="auto-drive"
                    type="checkbox"
                    checked={s.config.autoDrive}
                    disabled={!enabled || s.status === "ended"}
                    onChange={(e) => cfg({ autoDrive: e.target.checked })}
                  />
                  ملاحة تلقائية
                </label>
                <label className={styles.switch}>
                  <input
                    data-testid="auto-hold"
                    type="checkbox"
                    checked={s.config.autoHold}
                    disabled={!enabled || s.status === "ended"}
                    onChange={(e) => cfg({ autoHold: e.target.checked })}
                  />
                  تثبيت تلقائي
                </label>
                <label className={styles.inlineSlider}>
                  مساعدة التوجيه
                  <input
                    aria-label="مساعدة التوجيه السريعة"
                    data-testid="assist-slider"
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={s.config.steeringAssist}
                    disabled={!enabled || s.status === "ended"}
                    onChange={(e) =>
                      cfg({ steeringAssist: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <div className={styles.actions}>
                <button
                  data-testid="assist"
                  className={styles.assist}
                  disabled={
                    !enabled ||
                    s.status === "ended" ||
                    s.status === "stage-complete"
                  }
                  onClick={() => action({ type: "assist" })}
                >
                  مساعدة المعالج الكاملة
                </button>
                <button
                  data-testid="reset"
                  disabled={
                    !enabled ||
                    s.status === "ended" ||
                    s.status === "stage-complete"
                  }
                  onClick={() => action({ type: "reset" })}
                >
                  إعادة وضع القارب
                </button>
                <button
                  data-testid="repeat"
                  disabled={
                    !enabled || !["running", "paused"].includes(s.status)
                  }
                  onClick={() => action({ type: "repeat" })}
                >
                  أعد الاكتشاف
                </button>
                <button
                  data-testid="skip-objective"
                  disabled={
                    !enabled || !["running", "paused"].includes(s.status)
                  }
                  onClick={() => action({ type: "skipObjective" })}
                >
                  تجاوز الاكتشاف
                </button>
              </div>
              <p className={styles.note}>
                اضغط باستمرار للتحريك؛ يمكن الضغط على المقود والتسارع معًا.
                التحرير يوقف الإدخال، وزر التوقف الآمن يوقف حتى الملاحة
                التلقائية. لا حد زمني ولا عقوبة.
              </p>
            </section>
            <section className={styles.card}>
              <span className={styles.overline}>اختيار الاكتشاف</span>
              <div
                className={styles.encounters}
                role="group"
                aria-label="الاكتشافات"
              >
                {def.markers.map((m, i) => {
                  const ev = s.events.find((e) => e.key === `${s.stage}:${i}`);
                  return (
                    <button
                      key={i}
                      type="button"
                      data-testid={`marker-${i}`}
                      disabled={
                        !enabled ||
                        !["ready", "running", "paused"].includes(s.status)
                      }
                      className={`${styles.encounter} ${i === s.marker ? styles.current : ""} ${ev && ev.outcome !== "skipped" ? styles.done : ""}`}
                      onClick={() => action({ type: "marker", index: i })}
                    >
                      <b>
                        {ev ? (ev.outcome === "skipped" ? "—" : "✓") : i + 1}
                      </b>
                      <span>{SPECIES[m.species].nameAr}</span>
                    </button>
                  );
                })}
              </div>
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
                  <strong>{sum.fish}</strong>
                  <span>أسماك مكتشفة</span>
                </div>
                <div>
                  <strong>{sum.assisted}</strong>
                  <span>بمساعدة</span>
                </div>
                <div>
                  <strong>{sum.skipped}</strong>
                  <span>متخطاة</span>
                </div>
              </div>
              <div className={styles.collection} data-testid="collection">
                {collected.length ? (
                  collected.map((e) => (
                    <span
                      key={e.key}
                      className={styles.fishTag}
                      style={{ borderColor: SPECIES[e.species].color }}
                    >
                      {SPECIES[e.species].nameAr}
                    </span>
                  ))
                ) : (
                  <span className={styles.note}>لم يُكتشف شيء بعد</span>
                )}
              </div>
              <p className={styles.note}>
                {sum.independent} اكتشافات دون مساعدة آلية أو يدوية ·{" "}
                {s.skipped.length} مراحل متخطاة · {s.repeats} إعادات. الأرقام
                تصف اللعب فقط، وليست تقييمًا سريريًا.
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
