"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  STAGES,
  progress,
  requiresHold,
  type State,
} from "@/lib/balancebridge3d/engine";
import { createBridge, type SceneStats } from "./scene";
import styles from "./bridge.module.css";
export function BridgeView({
  state,
  full = false,
  connected = true,
}: {
  state: State;
  full?: boolean;
  connected?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    runtime = useRef<ReturnType<typeof createBridge> | null>(null),
    latest = useRef(state);
  const [stats, setStats] = useState<SceneStats | null>(null),
    [error, setError] = useState(false),
    [ripple, setRipple] = useState(false);
  const stage = STAGES[state.stage];
  useEffect(() => {
    latest.current = state;
    runtime.current?.update(connected ? state : { ...state, status: "paused" });
  }, [state, connected]);
  const key = `${state.stage}:${JSON.stringify(state.config)}`;
  useEffect(() => {
    if (!host.current) return;
    queueMicrotask(() => {
      setError(false);
      setStats(null);
    });
    try {
      runtime.current = createBridge(host.current, latest.current, setStats);
    } catch {
      queueMicrotask(() => setError(true));
    }
    return () => {
      runtime.current?.dispose();
      runtime.current = null;
    };
  }, [key]);
  useEffect(() => {
    if (!state.feedback) return;
    const start = setTimeout(() => setRipple(true), 0);
    const end = setTimeout(() => setRipple(false), 2400);
    return () => {
      clearTimeout(start);
      clearTimeout(end);
    };
  }, [state.feedback]);
  const percent = progress(state);
  const guidance =
    requiresHold(state) && !state.holding
      ? "قف عند العلامة وانتظر المعالج"
      : requiresHold(state)
        ? `توقّف بثبات · ${Math.ceil(Math.max(0, state.config.holdSeconds - state.holdElapsed / 1000))} ث`
        : state.config.guidance === "alternating"
          ? state.active % 2
            ? "القدم اليمنى"
            : "القدم اليسرى"
          : state.config.guidance === "right"
            ? "القدم اليمنى"
            : state.config.guidance === "left"
              ? "القدم اليسرى"
              : state.config.guidance === "both"
                ? "ضع القدمين على العلامة"
                : state.config.guidance === "neutral"
                  ? "قف بوضع مريح"
                  : stage.objective;
  return (
    <div
      className={`${styles.view} ${full ? styles.full : ""} ${state.config.rotation === 90 || state.config.rotation === 270 ? styles.turned : ""}`}
      data-testid="bridge-view"
      data-stage={state.stage}
      data-status={state.status}
      data-fps={stats?.fps}
      data-calls={stats?.calls}
      data-triangles={stats?.triangles}
      style={{ "--rotation": `${state.config.rotation}deg` } as CSSProperties}
    >
      <div className={styles.field}>
        <div ref={host} className={styles.canvas} />
        <div className={styles.start}>البداية</div>
        <div className={styles.finish}>
          {state.stage === 8 ? "القلعة" : "الوصول"} ✦
        </div>
      </div>
      <div className={styles.hud}>
        <div>
          <span className={styles.eyebrow}>SHUMOS · BALANCE BRIDGE</span>
          <h2>{stage.ar}</h2>
          <p>
            المستوى {Math.floor(state.stage / 3) + 1} · المرحلة{" "}
            {(state.stage % 3) + 1}
          </p>
        </div>
        <div className={styles.counter}>
          {state.checkpoints.filter((c) => c.outcome !== "pending").length}
          <span> / {state.checkpoints.length}</span>
          <small>علامات الرحلة</small>
        </div>
      </div>
      <div className={styles.prompt}>
        <span className={styles.dot} />
        {state.status === "stage-complete"
          ? "رحلة رائعة! انتظر المعالج"
          : state.status === "ended"
            ? "شكرًا لك يا بطل"
            : guidance}
        <div className={styles.track}>
          <i style={{ width: `${percent}%` }} />
        </div>
      </div>
      {(state.status === "ready" ||
        state.status === "paused" ||
        !connected) && (
        <div className={styles.overlay}>
          <span>✦</span>
          <h3>
            {!connected
              ? "بانتظار المعالج"
              : state.status === "paused"
                ? "استراحة هادئة"
                : "رحلتك تبدأ هنا"}
          </h3>
          <p>
            {state.status === "ready"
              ? "قف عند البداية، ويبدأ المعالج عندما تكون مستعدًا"
              : "انتظر حتى يطلب منك المعالج المتابعة"}
          </p>
        </div>
      )}
      {state.status === "running" && state.countdown > 0 && (
        <div className={styles.countdown}>
          {Math.ceil(state.countdown / 1000)}
          <small>استعدّ، ثم اتبع الضوء</small>
        </div>
      )}
      {ripple && <div className={styles.gentle}>ارجع للمسار بهدوء</div>}
      {error && (
        <div className={styles.overlay}>
          تعذّر العرض ثلاثي الأبعاد. يلزم WebGL.
        </div>
      )}
    </div>
  );
}
