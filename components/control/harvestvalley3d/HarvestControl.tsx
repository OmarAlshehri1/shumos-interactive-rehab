"use client";
import { ControlSlot } from "@/components/control/ui/ControlWorkspace";
import { NativeSetupSections } from "@/components/control/setup/GameSetupLayout";
import {
  ProgressiveStageGroup,
  AdditionalOptions,
} from "@/components/control/setup/ProgressiveStages";
import { useLibraryLaunchAdapter } from "@/components/control/library/launch/LibraryLaunchBoundary";
import { drivingDeviceReady } from "@/lib/games/library/capabilities";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { useHarvestSession } from "@/lib/harvestvalley3d/useSession";
import {
  STAGES,
  cellsOf,
  progress,
  required,
  tokenFor,
  type Config,
  type Input,
} from "@/lib/harvestvalley3d/engine";
import {
  DEFAULT_MAPPING,
  sanitizeMapping,
  sampleDriving,
  MAPPING_STORAGE_KEY,
  type Mapping,
  type Axis,
} from "@/lib/harvestvalley3d/input";
import { MODE_LABELS, HISTORY_LABELS } from "@/lib/harvestvalley3d/copy";
import { FarmView } from "@/components/display/harvestvalley3d/FarmView";
import styles from "./control.module.css";
export function HarvestControl() {
  return isRealtimeEnabled() ? (
    <ConnectedControl />
  ) : (
    <div className={styles.wait}>
      موسم الحصاد · يلزم إعداد اتصال منصة شُموس للمزامنة.
      <br />
      <Link href="/control">العودة إلى المنصة</Link>
    </div>
  );
}
function ConnectedControl() {
  const {
    state,
    send,
    connected,
    displayConnected,
    error,
    blocked,
    history,
    identity,
  } = useHarvestSession();
  const manual = useRef<Input>({ steering: 0, throttle: 0, brake: 0 });
  const [steering, setSteering] = useState(0),
    [throttle, setThrottle] = useState(0);
  const [hardware, setHardware] = useState(false),
    [hint, setHint] = useState("الجهاز اختياري — التحكّم اليدوي متاح");
  const [mapping, setMapping] = useState<Mapping>(DEFAULT_MAPPING);
  const facts = useRef({ state, connected, hardware, mapping });
  useEffect(() => {
    facts.current = { state, connected, hardware, mapping };
  }, [state, connected, hardware, mapping]);
  useLibraryLaunchAdapter("harvest-valley-3d", {
    modes: ["MANUAL", "STEERING", "PEDAL", "COMBINED"],
    apply: (mode) => {
      if (!state || !connected || blocked || state.status !== "ready")
        return false;
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
      manual.current = { steering: 0, throttle: 0, brake: 0 };
      setHardware(mode !== "MANUAL");
      send({
        type: "config",
        patch: {
          mode:
            mode === "STEERING"
              ? "STEERING"
              : mode === "PEDAL"
                ? "PEDAL"
                : mode === "COMBINED"
                  ? "COMBINED"
                  : "MANUAL",
        },
      });
      return true;
    },
  });
  useEffect(() => {
    const stored = localStorage.getItem(MAPPING_STORAGE_KEY);
    if (stored) {
      try {
        const m = sanitizeMapping(JSON.parse(stored));
        if (m) queueMicrotask(() => setMapping(m));
      } catch {}
    }
  }, []);
  useEffect(() => {
    const release = () => {
      manual.current = { steering: 0, throttle: 0, brake: 1 };
      setThrottle(0);
      setSteering(0);
      send({ type: "input", input: manual.current, at: Date.now() });
    };
    const visible = () => {
      if (document.hidden) release();
    };
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", visible);
    const timer = setInterval(() => {
      const f = facts.current;
      if (!f.connected || f.state?.status !== "running" || f.state.autoDrive)
        return;
      if (f.hardware) {
        const pad = navigator.getGamepads?.()[f.mapping.deviceIndex] ?? null;
        const input = sampleDriving(pad, f.mapping, f.state.config.mode);
        if (input) {
          setHint("جهاز متصل على جهاز التحكّم الحالي");
          send({ type: "input", input, source: "GAMEPAD", at: Date.now() });
        } else {
          setHint("الجهاز غير متصل — أوقفنا الحركة. التحكّم اليدوي متاح");
          setHardware(false);
          send({ type: "pause" });
        }
      } else if (
        manual.current.steering ||
        manual.current.throttle ||
        manual.current.brake
      )
        send({
          type: "input",
          input: manual.current,
          source: "MANUAL",
          at: Date.now(),
        });
    }, 100);
    return () => {
      clearInterval(timer);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [send]);
  if (blocked)
    return (
      <div className={styles.wait}>جلسة أخرى نشطة. ارجع إلى لوحة التحكّم.</div>
    );
  if (!state)
    return (
      <div className={styles.wait}>
        موسم الحصاد · بانتظار اتصال حساب الموظف{" "}
        {error && <ControlSlot slot="dialogs"><p role="alert">{error}</p></ControlSlot>}
      </div>
    );
  const ready = state.status === "ready",
    running = state.status === "running";
  const config = (patch: Partial<Config>) => send({ type: "config", patch });
  const cells = cellsOf(state.stage, state.config);
  const setInput = (patch: Partial<Input>) => {
    setHardware(false);
    manual.current = { ...manual.current, ...patch };
    setSteering(manual.current.steering);
    setThrottle(manual.current.throttle);
    send({ type: "input", input: manual.current, at: Date.now() });
  };

  const changeMapping = (
    key: "steering" | "throttle" | "brake",
    patch: Partial<Axis>,
  ) => {
    const n = { ...mapping, [key]: { ...mapping[key], ...patch } };
    setMapping(n);
    if (sanitizeMapping(n))
      localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(n));
  };
  const setupStages = (
    <ProgressiveStageGroup selected={state.stage}>
      {STAGES.map((d, i) => (
        <button
          key={i}
          disabled={!connected || running || state.status === "ended"}
          className={state.stage === i ? styles.selected : ""}
          aria-label={`المستوى ${Math.floor(i / 3) + 1} المرحلة ${(i % 3) + 1}`}
          onClick={() => send({ type: "stage", stage: i })}
        >
          <span>المرحلة {i + 1}</span>
          <strong>{d.name}</strong>
          <small>
            {d.cols.length} صفوف · {d.rows} أهداف في الصف
          </small>
          {state.results.find((r) => r.stage === i)?.completed ? " ✓" : ""}
        </button>
      ))}
    </ProgressiveStageGroup>
  );
  const setupSettings = (
    <aside className={styles.settings}>
      <h2>إعداد تجربة الحصاد</h2>
      {(state.status !== "ready" || !!state.startedAt) && setupStages}
      <p>
        يحدد المعالج الوضعية الآمنة والمساعدة المناسبة. لا يلزم الوقوف أو المشي.
      </p>
      <fieldset disabled={!ready || !connected}>
        <ControlSlot slot="settings" disabled={(!ready || !connected)}><label>
          المشاركة
          <select
            value={state.config.mode}
            onChange={(e) => config({ mode: e.target.value as Config["mode"] })}
          >
            {Object.entries(MODE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label></ControlSlot>
        {(
          [
            ["coverage", "هدف التغطية (%)", 5, 100, 5],
            ["fieldSize", "حجم الحقل", 0.5, 1.5, 0.1],
            ["headerWidth", "عرض الحصاد الفعّال", 2, 6, 0.2],
            ["movementRange", "نطاق الحركة (الصغير متاح)", 0.05, 1, 0.05],
            ["speed", "السرعة القصوى", 0.3, 5, 0.1],
            ["gain", "حساسية التوجيه", 0.1, 5, 0.1],
            ["deadZone", "عتبة التوجيه", 0, 0.8, 0.02],
            ["pedalThreshold", "عتبة الدواسة", 0, 0.8, 0.02],
            ["assistance", "مساعدة الصفوف", 0, 1, 0.1],
            ["holdMs", "مدة تثبيت الإدخال (مللي ثانية)", 100, 2000, 100],
            ["volume", "مستوى الصوت", 0, 0.3, 0.01],
          ] as const
        ).map(([k, label, min, max, step]) => (
          <ControlSlot slot="settings" key={k} when={["speed","assistance","movementRange"].includes(k)} disabled={(!ready || !connected)}><label key={k}>
            {label}
            <input
              aria-label={label}
              type="number"
              min={min}
              max={max}
              step={step}
              value={state.config[k]}
              onChange={(e) => config({ [k]: +e.target.value })}
            />
          </label></ControlSlot>
        ))}
        {(
          [
            ["autoThrottle", "تقدّم تلقائي"],
            ["autoSteering", "توجيه تلقائي"],
            ["autoHarvest", "حصاد تلقائي"],
            ["guidance", "إرشاد الصفوف وأهداف كبيرة"],
            ["reduced", "حركة وكاميرا منخفضة"],
            ["contrast", "تباين مرتفع"],
            ["audio", "الأصوات الهادئة"],
          ] as const
        ).map(([k, label]) => (
          <label className={styles.check} key={k}>
            <input
              type="checkbox"
              checked={state.config[k]}
              onChange={(e) => config({ [k]: e.target.checked })}
            />
            {label}
          </label>
        ))}
        <AdditionalOptions>
          <label>
            جودة العرض
            <select
              value={state.config.quality}
              onChange={(e) =>
                config({ quality: e.target.value as Config["quality"] })
              }
            >
              <option value="high">عالية</option>
              <option value="medium">متوسطة</option>
              <option value="low">اقتصادية</option>
            </select>
          </label>
        </AdditionalOptions>
      </fieldset>
      <details>
        <summary>الدركسون والدواسات — إعداد اختياري</summary>
        <div className={styles.hardware}>
          الجهاز يقرأ هنا على جهاز التحكّم الحالي فقط. نقل الدركسون من كمبيوتر
          آخر إلى iPad لم يُنفّذ بعد. التحكّم اليدوي متاح دائمًا.
        </div>
        <p>{hint}</p>
        <button
          disabled={!connected || !running}
          onClick={() => {
            manual.current = { steering: 0, throttle: 0, brake: 0 };
            setHardware(!hardware);
          }}
        >
          {hardware ? "العودة إلى التحكم اليدوي" : "استخدام جهاز متصل هنا"}
        </button>
        <label>
          رقم الجهاز
          <input
            type="number"
            min="0"
            max="15"
            value={mapping.deviceIndex}
            onChange={(e) => {
              const n = { ...mapping, deviceIndex: +e.target.value };
              setMapping(n);
              if (sanitizeMapping(n))
                localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(n));
            }}
          />
        </label>
        {(["steering", "throttle", "brake"] as const).map((k) => (
          <div key={k}>
            <h3>
              {k === "steering"
                ? "محور التوجيه"
                : k === "throttle"
                  ? "دواسة التقدّم"
                  : "الفرامل"}
            </h3>
            <div className={styles.axis}>
              {(
                [
                  "index",
                  "center",
                  "min",
                  "max",
                  "rest",
                  "pressed",
                  "deadZone",
                ] as const
              ).map((a) => (
                <label key={a}>
                  {
                    {
                      index: "رقم المحور (-1 تعطيل)",
                      center: "المنتصف",
                      min: "الحد الأدنى",
                      max: "الحد الأعلى",
                      rest: "الراحة",
                      pressed: "الضغط",
                      deadZone: "المنطقة الميتة",
                    }[a]
                  }
                  <input
                    type="number"
                    step={a === "index" ? 1 : 0.05}
                    value={mapping[k][a]}
                    onChange={(e) => changeMapping(k, { [a]: +e.target.value })}
                  />
                </label>
              ))}
            </div>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={mapping[k].inverted}
                onChange={(e) =>
                  changeMapping(k, { inverted: e.target.checked })
                }
              />
              عكس المحور
            </label>
            <button
              onClick={() => {
                const pad = navigator.getGamepads?.()[mapping.deviceIndex];
                const value = pad?.axes[mapping[k].index];
                if (Number.isFinite(value))
                  changeMapping(
                    k,
                    k === "steering" ? { center: value } : { rest: value },
                  );
              }}
            >
              معايرة المنتصف / الراحة الآن
            </button>
          </div>
        ))}
      </details>
    </aside>
  );
  if (state.status === "ready" && !state.startedAt)
    return (
      <main
        className={styles.page}
        data-testid="hv-control"
        data-status={state.status}
        data-stage={state.stage}
        dir="rtl"
      >
        <NativeSetupSections
          settings={setupSettings}
          stages={setupStages}
          start={
            <ControlSlot slot="session"><button
              type="button"
              disabled={!connected}
              onClick={() => send({ type: "start" })}
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
      dir="rtl"
      data-testid="hv-control"
      data-stage={state.stage}
      data-status={state.status}
      data-progress={progress(state)}
      data-cut={state.cut.length}
      data-history={history}
    >
      <header data-native-game-header className={styles.header}>
        <div>
          <Link href="/control/activities">مكتبة الأنشطة / موسم الحصاد</Link>
          <h1>حقول واسعة. خطوات هادئة.</h1>
          <p>HARVEST VALLEY 3D · {identity?.childName || "جلسة استكشاف"}</p>
        </div>
        <a
          href="/display/harvest-valley-3d"
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
        <span>عرض جداري · يمكن اللعب جلوسًا</span>
      </div>
      {error && (
        <ControlSlot slot="dialogs"><p className={styles.error} role="alert">
          {error}
        </p></ControlSlot>
      )}
      <div className={styles.layout}>
        <section className={styles.world}>
          <div className={styles.actions}>
            <ControlSlot slot="session"><button
              disabled={
                !connected || !["ready", "paused"].includes(state.status)
              }
              onClick={() => {
                manual.current = { steering: 0, throttle: 0, brake: 0 };
                send({
                  type: state.status === "paused" ? "resume" : "start",
                });
              }}
            >
              {state.status === "paused" ? "استئناف" : "بدء الحصاد"}
            </button></ControlSlot>
            <ControlSlot slot="session"><button
              disabled={!connected || !running}
              onClick={() => send({ type: "pause" })}
            >
              استراحة
            </button></ControlSlot>
            <ControlSlot slot="assistance"><button
              disabled={!connected || state.status === "ended"}
              onClick={() => send({ type: "repeat" })}
            >
              تكرار الصف
            </button></ControlSlot>
            <ControlSlot slot="assistance"><button
              disabled={!connected || state.status === "ended"}
              onClick={() => send({ type: "reposition" })}
            >
              إعادة التموضع
            </button></ControlSlot>
            <ControlSlot slot="assistance"><button
              disabled={!connected || state.status === "ended"}
              onClick={() => send({ type: "skip-objective" })}
            >
              تجاوز الهدف
            </button></ControlSlot>
            <ControlSlot slot="navigation"><button
              disabled={!connected || state.status === "ended"}
              onClick={() => send({ type: "skip-stage" })}
            >
              تجاوز المرحلة
            </button></ControlSlot>
            <ControlSlot slot="settings"><button
              disabled={
                !connected ||
                state.status !== "stage-complete" ||
                state.stage === 8
              }
              onClick={() => send({ type: "next" })}
            >
              المرحلة التالية
            </button></ControlSlot>
            <ControlSlot slot="navigation"><button
              disabled={!connected}
              onClick={() => {
                manual.current = { steering: 0, throttle: 0, brake: 0 };
                send({ type: "restart" });
              }}
            >
              إعادة الجلسة
            </button></ControlSlot>
            <ControlSlot slot="session"><button
              disabled={!connected || state.status === "ended"}
              onClick={() => send({ type: "end", at: Date.now() })}
            >
              إنهاء والنتائج
            </button></ControlSlot>
          </div>
          <ControlSlot slot="preview"><FarmView state={state} connected={connected} /></ControlSlot>

          <div className={styles.mapCard}>
            <div className={styles.cardTitle}>
              <h2>{STAGES[state.stage].name}</h2>
              <span>
                {state.cut.length} / {required(state)} خلايا · {progress(state)}
                %
              </span>
            </div>
            <p>
              الأخضر حصاد مكتمل. اختر خلية للتوجيه أو لتأكيد مساعدة المعالج.
            </p>
            <div className={styles.map} data-testid="hv-map">
              {cells.map((c) => (
                <button
                  key={c.id}
                  className={`${styles.cell} ${state.cut.includes(c.id) ? styles.cut : ""} ${state.active === c.id ? styles.active : ""} ${state.skippedCells.includes(c.id) ? styles.skipped : ""}`}
                  style={{
                    left: `${50 + (c.x / (state.config.fieldSize * 22)) * 100}%`,
                    top: `${50 - (c.z / (state.config.fieldSize * 32)) * 100}%`,
                  }}
                  disabled={!connected}
                  aria-label={`الخلية ${c.id + 1}${state.cut.includes(c.id) ? " محصودة" : ""}`}
                  onClick={() => send({ type: "select", id: c.id })}
                />
              ))}
              <i
                className={styles.vehicleDot}
                style={{
                  left: `${50 + (state.vehicle.x / (state.config.fieldSize * 22)) * 100}%`,
                  top: `${50 - (state.vehicle.z / (state.config.fieldSize * 32)) * 100}%`,
                  rotate: `${(-state.vehicle.heading * 180) / Math.PI}deg`,
                }}
              />
            </div>
            <div className={styles.driving}>
              <button
                disabled={!connected || !running}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setInput({ steering: -1, brake: 0 });
                }}
                onPointerUp={() =>
                  setInput({ steering: 0, throttle: 0, brake: 0 })
                }
                onPointerCancel={() =>
                  setInput({ steering: 0, throttle: 0, brake: 1 })
                }
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    setInput({ steering: -1, brake: 0 });
                  }
                }}
                onKeyUp={() => setInput({ steering: 0, throttle: 0, brake: 0 })}
              >
                ← توجيه يسار
              </button>
              <button
                disabled={!connected || !running}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setInput({ throttle: 1, brake: 0 });
                }}
                onPointerUp={() =>
                  setInput({ steering: 0, throttle: 0, brake: 0 })
                }
                onPointerCancel={() =>
                  setInput({ steering: 0, throttle: 0, brake: 1 })
                }
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    setInput({ throttle: 1, brake: 0 });
                  }
                }}
                onKeyUp={() => setInput({ steering: 0, throttle: 0, brake: 0 })}
              >
                تقدّم
              </button>
              <button
                disabled={!connected || !running}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setInput({ steering: 1, brake: 0 });
                }}
                onPointerUp={() =>
                  setInput({ steering: 0, throttle: 0, brake: 0 })
                }
                onPointerCancel={() =>
                  setInput({ steering: 0, throttle: 0, brake: 1 })
                }
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    setInput({ steering: 1, brake: 0 });
                  }
                }}
                onKeyUp={() => setInput({ steering: 0, throttle: 0, brake: 0 })}
              >
                توجيه يمين →
              </button>
            </div>
            <label className={styles.driveLabel}>
              توجيه المعالج
              <input
                aria-label="توجيه المعالج"
                type="range"
                min="-1"
                max="1"
                step=".01"
                value={steering}
                disabled={!connected || !running}
                onChange={(e) =>
                  setInput({ steering: +e.target.value, brake: 0 })
                }
              />
            </label>
            <label className={styles.driveLabel}>
              دواسة التقدّم
              <input
                aria-label="دواسة التقدّم"
                type="range"
                min="0"
                max="1"
                step=".01"
                value={throttle}
                disabled={!connected || !running}
                onChange={(e) =>
                  setInput({ throttle: +e.target.value, brake: 0 })
                }
              />
            </label>
            <div className={styles.actions}>
              <button
                disabled={!connected || !running}
                onClick={() => setInput({ throttle: 0, brake: 1, steering: 0 })}
              >
                فرامل
              </button>
              <ControlSlot slot="assistance"><button
                disabled={!connected || !running}
                className={state.autoDrive ? styles.selected : ""}
                onClick={() => {
                  manual.current = { steering: 0, throttle: 0, brake: 0 };
                  setThrottle(0);
                  setHardware(false);
                  send({ type: "auto", on: !state.autoDrive });
                }}
              >
                {state.autoDrive
                  ? "إيقاف القيادة الآلية"
                  : "قيادة آلية بمساعدة"}
              </button></ControlSlot>
              <ControlSlot slot="assistance"><button
                disabled={!connected || state.status === "ended"}
                onClick={() => send({ type: "harvest", on: !state.harvesting })}
              >
                {state.harvesting ? "إيقاف الحصاد" : "تشغيل الحصاد"}
              </button></ControlSlot>
              <ControlSlot slot="assistance"><button
                disabled={!connected || !running}
                onClick={() => send({ type: "assist", token: tokenFor(state) })}
              >
                أكّد حصاد الخلية بمساعدة
              </button></ControlSlot>
            </div>

            {state.status === "ended" && (
              <div className={styles.results}>
                <h2>حصادك اليوم</h2>
                <p>
                  {state.results.filter((r) => r.completed).length} مراحل مكتملة
                  · {state.results.reduce((a, r) => a + r.harvested, 0)} خلايا
                  محصودة · {state.results.reduce((a, r) => a + r.assisted, 0)}{" "}
                  بمساعدة
                </p>
                <p>حفظ السجل: {HISTORY_LABELS[history]}</p>
              </div>
            )}
          </div>
        </section>
        {setupSettings}
      </div>
    </main>
  );
}
