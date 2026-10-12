"use client";
import {
  ProgressiveStageGroup,
  AdditionalOptions,
} from "@/components/control/setup/ProgressiveStages";
import { useLibraryLaunchAdapter } from "@/components/control/library/launch/LibraryLaunchBoundary";
import Link from "next/link";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { useEffect, useRef, useState } from "react";
import {
  MODE_LABELS,
  HISTORY_LABELS,
  FOOT_HINT_LABELS,
} from "@/lib/bloomingworld3d/copy";
import { useBloomSession } from "@/lib/bloomingworld3d/useSession";
import {
  STAGES,
  progress,
  tokenFor,
  regionUV,
  type Config,
  type Mode,
} from "@/lib/bloomingworld3d/engine";
import {
  handCursor,
  cursorTarget,
  FootHintDetector,
} from "@/lib/bloomingworld3d/sensorInput";
import { useDualSensorRuntime } from "@/components/control/sensors/SensorRuntimeProvider";
import { GardenView } from "@/components/display/bloomingworld3d/GardenView";
import styles from "./control.module.css";
const modes: Mode[] = [
  "MANUAL",
  "RIGHT_HAND",
  "LEFT_HAND",
  "DUAL_HAND",
  "RIGHT_FOOT",
  "LEFT_FOOT",
  "DUAL_FOOT",
];

export function BloomControl() {
  return isRealtimeEnabled() ? (
    <ConnectedBloomControl />
  ) : (
    <div className={styles.wait}>
      الحديقة التي تستيقظ · يلزم إعداد اتصال منصة شُموس للمزامنة بين الأجهزة.
      <br />
      <Link href="/control">العودة إلى المنصة</Link>
    </div>
  );
}
function ConnectedBloomControl() {
  const {
    state,
    send,
    connected,
    displayConnected,
    error,
    blocked,
    history,
    identity,
  } = useBloomSession();
  const sensors = useDualSensorRuntime();
  const [hint, setHint] = useState("");
  const gate = useRef({ id: null as number | null, at: 0, latched: false });
  const foot = useRef({
    RIGHT_FOOT: new FootHintDetector(),
    LEFT_FOOT: new FootHintDetector(),
  });
  const sensorFacts = useRef({ state, sensors, connected });
  const projectionRequired = useLibraryLaunchAdapter("blooming-world-3d", {
    sessionKey: state ? `${state.sessionId}:${state.run}` : "waiting",
    modes: ["MANUAL", "RIGHT_HAND", "LEFT_HAND", "DUAL_HAND"],
    apply: (mode) => {
      if (
        !state ||
        !connected ||
        blocked ||
        state.status !== "ready" ||
        (mode !== "MANUAL" && state.config.projection !== "WALL")
      )
        return false;
      send({ type: "config", patch: { mode: mode as Mode } });
      return true;
    },
    projections: ["WALL", "FLOOR"],
    applyProjection: (projection) => {
      if (!state || !connected || blocked || state.status !== "ready")
        return false;
      send({ type: "config", patch: { projection, mode: "MANUAL" } });
      return true;
    },
  });
  useEffect(() => {
    sensorFacts.current = { state, sensors, connected };
  }, [state, sensors, connected]);
  useEffect(() => {
    const timer = setInterval(() => {
      const { state, sensors, connected } = sensorFacts.current;
      if (!state) return;
      if (
        !connected ||
        state.status !== "running" ||
        state.config.projection !== "WALL" ||
        !state.config.mode.includes("HAND")
      ) {
        gate.current = { id: null, at: 0, latched: false };
        return;
      }
      const now = performance.now();
      const p = handCursor(
        state,
        [
          {
            role: "RIGHT_HAND",
            x: sensors.right.pointer?.pointer.x ?? 0.5,
            y: sensors.right.pointer?.pointer.y ?? 0.5,
            at: sensors.right.sample?.timestampMs ?? -Infinity,
            connected: sensors.right.connected,
            centered: sensors.right.centered,
          },
          {
            role: "LEFT_HAND",
            x: sensors.left.pointer?.pointer.x ?? 0.5,
            y: sensors.left.pointer?.pointer.y ?? 0.5,
            at: sensors.left.sample?.timestampMs ?? -Infinity,
            connected: sensors.left.connected,
            centered: sensors.left.centered,
          },
        ],
        now,
      );
      if (!p) {
        setHint("الحساس غير جاهز — التحكّم اليدوي متاح");
        gate.current = { id: null, at: 0, latched: false };
        return;
      }
      setHint(
        p.role === "RIGHT_HAND" ? "مؤشر اليد اليمنى" : "مؤشر اليد اليسرى",
      );
      send({ type: "cursor", x: p.x, y: p.y });
      const id = cursorTarget(state, p);
      if (id === null) {
        gate.current = { id: null, at: now, latched: false };
        return;
      }
      if (gate.current.id !== id) {
        gate.current = { id, at: now, latched: false };
        return;
      }
      if (!gate.current.latched && now - gate.current.at >= 900) {
        gate.current.latched = true;
        send({
          type: "bloom",
          id,
          token: tokenFor(state, id),
          assisted: false,
        });
      }
    }, 100);
    return () => clearInterval(timer);
  }, [send]);
  if (blocked)
    return (
      <div className={styles.wait}>جلسة أخرى نشطة. ارجع إلى لوحة التحكّم.</div>
    );
  if (!state)
    return (
      <div className={styles.wait}>
        الحديقة التي تستيقظ · بانتظار اتصال حساب الموظف{" "}
        {error && <p role="alert">{error}</p>}
        <Link href="/control">العودة</Link>
      </div>
    );
  const config = (patch: Partial<Config>) => send({ type: "config", patch });
  const bloom = (assisted: boolean) =>
    send({
      type: "bloom",
      id: state.active,
      token: tokenFor(state, state.active),
      assisted,
    });
  const ready = state.status === "ready";
  return (
    <main
      data-testid="bw-control"
      data-stage={state.stage}
      data-status={state.status}
      data-progress={progress(state)}
      data-history={history}
      className={styles.page}
      dir="rtl"
    >
      <header className={styles.header}>
        <div>
          <Link href="/control/activities">
            مكتبة الأنشطة / الحديقة التي تستيقظ
          </Link>
          <h1>حديقة صغيرة. لحظات كبيرة.</h1>
          {projectionRequired && (
            <p role="status">
              اختر الجدار أو الأرضية من «طريقة المشاركة المطلوبة» قبل البدء.
            </p>
          )}
          <p>
            Blooming World 3D{" "}
            <span> · {identity?.childName || "جلسة استكشاف"}</span>
          </p>
        </div>
        <a
          href="/display/blooming-world-3d"
          target="_blank"
          rel="noreferrer"
          className={styles.display}
        >
          فتح شاشة العرض ↗
        </a>
      </header>
      <div className={styles.connection}>
        <span className={connected ? styles.online : ""}>
          ● {connected ? "التحكّم متصل" : "التحكّم غير متصل"}
        </span>
        <span>
          ● {displayConnected ? "شاشة العرض متصلة" : "بانتظار شاشة العرض"}
        </span>
        <span>
          {state.config.projection === "WALL" ? "عرض جداري" : "عرض أرضي"}
        </span>
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.layout}>
        <section className={styles.world}>
          <div className={styles.actions}>
            <button
              disabled={
                !connected ||
                !["ready", "paused"].includes(state.status) ||
                (state.status === "ready" && projectionRequired)
              }
              onClick={() =>
                send({ type: state.status === "paused" ? "resume" : "start" })
              }
            >
              {state.status === "paused" ? "استئناف" : "بدء الحديقة"}
            </button>
            <button
              disabled={!connected || state.status !== "running"}
              onClick={() => send({ type: "pause" })}
            >
              استراحة
            </button>
            <button
              disabled={!connected || state.status === "ended"}
              onClick={() => send({ type: "repeat" })}
            >
              تكرار المنطقة
            </button>
            <button
              disabled={!connected || state.status === "ended"}
              onClick={() => send({ type: "skip-region" })}
            >
              تجاوز المنطقة
            </button>
            <button
              disabled={!connected || state.status === "ended"}
              onClick={() => send({ type: "skip-stage" })}
            >
              تجاوز المرحلة
            </button>
            <button
              disabled={
                !connected ||
                state.status !== "stage-complete" ||
                state.stage === 8
              }
              onClick={() => send({ type: "next" })}
            >
              المرحلة التالية
            </button>
            <button
              disabled={!connected}
              onClick={() => send({ type: "restart" })}
            >
              إعادة الجلسة
            </button>
            <button
              disabled={!connected || state.status === "ended"}
              onClick={() => send({ type: "end", at: Date.now() })}
            >
              إنهاء والنتائج
            </button>
          </div>
          <GardenView state={state} connected={connected} />

          <div className={styles.mapCard}>
            <div className={styles.cardTitle}>
              <h2>خريطة الإزهار</h2>
              <span>{progress(state)}% من هدف الجلسة</span>
            </div>
            <p>اختر المنطقة ثم أكّد الحركة. يمكن اللعب جلوسًا وبمساعدة.</p>
            <div
              className={styles.map}
              onPointerMove={(e) => {
                if (e.buttons && state.status === "running") {
                  const box = e.currentTarget.getBoundingClientRect();
                  send({
                    type: "cursor",
                    x: (e.clientX - box.left) / box.width,
                    y: (e.clientY - box.top) / box.height,
                  });
                }
              }}
            >
              {state.regions.map((r) => {
                const uv = regionUV(
                  r.id,
                  state.regions.length,
                  state.config.movementRange,
                  state.config.margin,
                );
                return (
                  <button
                    key={r.id}
                    style={{
                      left: `${uv.x * 100}%`,
                      top: `${uv.y * 100}%`,
                      width: `${48 * state.config.targetSize}px`,
                      height: `${48 * state.config.targetSize}px`,
                    }}
                    className={`${styles.region} ${r.hits === state.config.repetitions ? styles.bloomed : ""} ${state.active === r.id ? styles.active : ""}`}
                    disabled={!connected}
                    onClick={() => {
                      send({ type: "select", id: r.id });
                      send({ type: "cursor", ...uv });
                    }}
                    aria-label={`المنطقة ${r.id + 1}: ${r.hits} من ${state.config.repetitions}`}
                  >
                    {r.hits === state.config.repetitions ? "✿" : r.id + 1}
                    <small>
                      {r.hits}/{state.config.repetitions}
                    </small>
                  </button>
                );
              })}
            </div>
            <div className={styles.confirm}>
              <button
                disabled={!connected || state.status !== "running"}
                onClick={() => bloom(false)}
              >
                ✿ أكّد الإزهار · {state.active + 1}
              </button>
              <button
                disabled={!connected || state.status !== "running"}
                onClick={() => bloom(true)}
              >
                إزهار بمساعدة
              </button>
            </div>

            {state.status === "ended" && (
              <div className={styles.results}>
                <h2>لحظات حديقتك</h2>
                <p>
                  {state.results.filter((r) => r.completed).length} مراحل مكتملة
                  ·{" "}
                  {state.results.reduce(
                    (a, r) =>
                      a +
                      r.regions.filter((v) => v.hits === r.repetitions).length,
                    0,
                  )}{" "}
                  مناطق مزهرة ·{" "}
                  {state.results.reduce(
                    (a, r) =>
                      a +
                      r.regions.filter(
                        (v) => v.hits === r.repetitions && v.assisted > 0,
                      ).length,
                    0,
                  )}{" "}
                  بمساعدة
                </p>
                <p>حفظ السجل: {HISTORY_LABELS[history]}</p>
              </div>
            )}
          </div>
        </section>
        <aside className={styles.settings}>
          <h2>مساحة تناسب الطفل</h2>
          <ProgressiveStageGroup selected={state.stage}>
            {STAGES.map((d) => (
              <button
                key={d.index}
                disabled={!connected || state.status === "running"}
                className={state.stage === d.index ? styles.selected : ""}
                onClick={() => send({ type: "stage", stage: d.index })}
                aria-label={`المستوى ${d.level} المرحلة ${d.stage}`}
              >
                <span>المرحلة {d.index + 1}</span>
                <strong>إزهار {d.regions} مناطق</strong>
                <small>الوصول إلى المناطق المضيئة بالتتابع</small>
                {state.results.find((r) => r.stage === d.index)?.completed
                  ? " ✓"
                  : ""}
              </button>
            ))}
          </ProgressiveStageGroup>
          <p>كل هدف قابل للتعديل. لا وقت محدد، ولا حركة إلزامية.</p>
          <fieldset disabled={!ready || !connected}>
            <legend>العرض والمشاركة</legend>
            <div className={styles.toggle}>
              {(["WALL", "FLOOR"] as const).map((p) => (
                <button
                  key={p}
                  className={
                    state.config.projection === p ? styles.selected : ""
                  }
                  onClick={() => config({ projection: p })}
                >
                  {p === "WALL" ? "جدار" : "أرضية"}
                </button>
              ))}
            </div>
            <label>
              طريقة المشاركة
              <select
                value={state.config.mode}
                onChange={(e) => config({ mode: e.target.value as Mode })}
              >
                {modes.map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              هدف المناطق{" "}
              <input
                type="number"
                min="0"
                max="12"
                value={state.config.goal}
                onChange={(e) => config({ goal: +e.target.value })}
              />
              <small>0 = هدف المرحلة ({STAGES[state.stage].regions})</small>
            </label>
            <label>
              تكرارات كل منطقة
              <input
                type="number"
                min="1"
                max="5"
                value={state.config.repetitions}
                onChange={(e) => config({ repetitions: +e.target.value })}
              />
            </label>
            {(
              [
                ["targetSize", "حجم المنطقة", 0.65, 1.5, 0.05],
                ["movementRange", "نطاق الحركة", 0.2, 1, 0.05],
                ["sensitivity", "حساسية المؤشر", 0.2, 3, 0.1],
                ["smoothing", "تنعيم المؤشر", 0.05, 1, 0.05],
                ["deadZone", "المنطقة الميتة", 0, 0.2, 0.01],
              ] as const
            ).map(([k, title, min, max, step]) => (
              <label key={k}>
                {title}
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={state.config[k]}
                  onChange={(e) => config({ [k]: +e.target.value })}
                />
              </label>
            ))}
            <label>
              تسلسل المناطق
              <select
                value={state.config.sequence}
                onChange={(e) =>
                  config({ sequence: e.target.value as "ordered" | "free" })
                }
              >
                <option value="ordered">منطقة واحدة في كل مرة</option>
                <option value="free">اختيار حر</option>
              </select>
            </label>
          </fieldset>
          <details>
            <summary>معايرة العرض وإمكانية الوصول</summary>
            <fieldset disabled={!ready || !connected}>
              <label>
                عرض الإسقاط المقاس (م)
                <input
                  type="number"
                  min="1"
                  max="12"
                  step=".1"
                  value={state.config.width}
                  onChange={(e) => config({ width: +e.target.value })}
                />
              </label>
              <label>
                ارتفاع الإسقاط المقاس (م)
                <input
                  type="number"
                  min="1"
                  max="12"
                  step=".1"
                  value={state.config.height}
                  onChange={(e) => config({ height: +e.target.value })}
                />
              </label>
              <label>
                الهامش الآمن
                <input
                  type="range"
                  min=".03"
                  max=".2"
                  step=".01"
                  value={state.config.margin}
                  onChange={(e) => config({ margin: +e.target.value })}
                />
              </label>
              {(
                [
                  ["grid", "شبكة المعايرة"],
                  ["contrast", "تباين مرتفع"],
                  ["reduced", "حركة مخفّضة"],
                  ["audio", "الأصوات الهادئة"],
                ] as const
              ).map(([k, title]) => (
                <label className={styles.check} key={k}>
                  <input
                    type="checkbox"
                    checked={state.config[k]}
                    onChange={(e) => config({ [k]: e.target.checked })}
                  />
                  {title}
                </label>
              ))}
              <AdditionalOptions>
                <label>
                  جودة العرض
                  <select
                    value={state.config.quality}
                    onChange={(e) =>
                      config({ quality: e.target.value as "low" | "high" })
                    }
                  >
                    <option value="high">عالية</option>
                    <option value="low">اقتصادية</option>
                  </select>
                </label>
              </AdditionalOptions>
              <label>
                مستوى الصوت
                <input
                  type="range"
                  min="0"
                  max=".3"
                  step=".01"
                  value={state.config.volume}
                  onChange={(e) => config({ volume: +e.target.value })}
                />
              </label>
            </fieldset>
            <p>
              أدخل القياسات الفعلية لجهاز الإسقاط. هذه إعدادات عرض، وليست إثبات
              معايرة مادية.
            </p>
          </details>
          <div className={styles.sensor}>
            <h3>المشاركة بالحساس</h3>
            <p aria-live="polite">{hint || "التحكّم اليدوي متاح دائمًا"}</p>
            {state.config.mode.includes("HAND") && (
              <>
                <button onClick={() => void sensors.right.connect()}>
                  وصل اليد اليمنى
                </button>
                <button onClick={() => void sensors.left.connect()}>
                  وصل اليد اليسرى
                </button>
                <p>
                  مؤشر افتراضي معاير. اليدان تتناوبان حسب المنطقة. التأكيد
                  اليدوي متاح.
                </p>
              </>
            )}
            {state.config.mode.includes("FOOT") && (
              <>
                <p>حساس القدم لا يحدد موقع الطفل. أكّد الوصول يدويًا.</p>
                {(["RIGHT_FOOT", "LEFT_FOOT"] as const).map((role) => (
                  <button
                    key={role}
                    onClick={() => {
                      const result = foot.current[role].observe(
                        {
                          role,
                          at: performance.now(),
                          gyro: [20, 0, 0],
                          connected: true,
                        },
                        state.config.mode,
                        performance.now(),
                      );
                      setHint(
                        `${MODE_LABELS[role]}: ${FOOT_HINT_LABELS[result]} — محاكاة فقط`,
                      );
                    }}
                  >
                    {role === "RIGHT_FOOT" ? "محاكاة اليمنى" : "محاكاة اليسرى"}
                  </button>
                ))}
                <button
                  onClick={() => {
                    for (const role of ["RIGHT_FOOT", "LEFT_FOOT"] as const)
                      foot.current[role].observe(
                        {
                          role,
                          at: performance.now(),
                          gyro: [0, 0, 0],
                          connected: true,
                        },
                        state.config.mode,
                        performance.now(),
                      );
                    setHint("محاكاة: عودة إلى الراحة");
                  }}
                >
                  محاكاة العودة للراحة
                </button>
              </>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
