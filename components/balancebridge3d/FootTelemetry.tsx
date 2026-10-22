"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDualSensorRuntime } from "@/components/control/sensors/SensorRuntimeProvider";
import { useSensorHandRuntime } from "@/components/control/sensors/useSensorHandRuntime";
import { PhysicalRole } from "@/lib/physicalInput/types";
import type { SensorHandRuntimeConfig } from "@/lib/physicalInput/SensorHandRuntimeConfig";
import { type FootHint, FootHints } from "@/lib/balancebridge3d/sensorInput";
import type { Mode } from "@/lib/balancebridge3d/engine";
import styles from "./bridge.module.css";
const FOOT_CONFIG: Record<"RIGHT_FOOT" | "LEFT_FOOT", SensorHandRuntimeConfig> =
  {
    RIGHT_FOOT: {
      role: PhysicalRole.RIGHT_FOOT,
      arabicLabel: "حساس القدم اليمنى",
      deviceHintKey: "shumos:sensor:right-foot:deviceId",
      motionConfig: { autoCenter: false },
    },
    LEFT_FOOT: {
      role: PhysicalRole.LEFT_FOOT,
      arabicLabel: "حساس القدم اليسرى",
      deviceHintKey: "shumos:sensor:left-foot:deviceId",
      motionConfig: { autoCenter: false },
    },
  };
/** Read-only telemetry, using the shared Bluetooth source, role store and normalized-sample runtime.
 * No hand calibration matrix is copied, no pointer is displayed, and this component cannot dispatch game commands. */
export function FootTelemetry({ mode }: { mode: Mode }) {
  const hands = useDualSensorRuntime();
  const endpoints = useRef<Record<string, string | null>>({
    RIGHT_FOOT: null,
    LEFT_FOOT: null,
  });
  const handIds = useRef<readonly string[]>([]);
  useEffect(() => {
    handIds.current = [hands.right.deviceId, hands.left.deviceId].filter(
      (id): id is string => !!id,
    );
  }, [hands.right.deviceId, hands.left.deviceId]);
  const exclusions = useMemo(
    () => ({
      RIGHT_FOOT: () => [
        ...handIds.current,
        ...(endpoints.current.LEFT_FOOT ? [endpoints.current.LEFT_FOOT] : []),
      ],
      LEFT_FOOT: () => [
        ...handIds.current,
        ...(endpoints.current.RIGHT_FOOT ? [endpoints.current.RIGHT_FOOT] : []),
      ],
    }),
    [],
  );
  const deviceChanged = useMemo(
    () => ({
      RIGHT_FOOT: (id: string | null) => {
        endpoints.current.RIGHT_FOOT = id;
      },
      LEFT_FOOT: (id: string | null) => {
        endpoints.current.LEFT_FOOT = id;
      },
    }),
    [],
  );
  if (mode === "MANUAL")
    return (
      <p className={styles.note}>
        اللعب اليدوي لا يحتاج أي حساس. اختر القدم اليمنى أو اليسرى أو القدمين
        لعرض بيانات الاتصال الاختيارية.
      </p>
    );
  if (
    [hands.right, hands.left].some(
      (h) => h.connected || h.connecting || h.reconnecting,
    )
  )
    return (
      <p className={styles.note}>
        أوقف اتصالات حساسات اليدين من إعداد الحساسات قبل استخدام حساسات القدم.
        تأكيد الأخصائي اليدوي متاح دائمًا.
      </p>
    );
  const roles: ("RIGHT_FOOT" | "LEFT_FOOT")[] =
    mode === "DUAL_FOOT" ? ["RIGHT_FOOT", "LEFT_FOOT"] : [mode];
  return (
    <div>
      {roles.map((role) => (
        <FootEndpoint
          key={role}
          role={role}
          mode={mode}
          exclude={exclusions[role]}
          deviceChanged={deviceChanged[role]}
        />
      ))}
    </div>
  );
}
function FootEndpoint({
  role,
  mode,
  exclude,
  deviceChanged,
}: {
  role: "RIGHT_FOOT" | "LEFT_FOOT";
  mode: Mode;
  exclude: () => readonly string[];
  deviceChanged: (id: string | null) => void;
}) {
  const runtime = useSensorHandRuntime(FOOT_CONFIG[role], exclude);
  const [observed, setObserved] = useState<FootHint>("unavailable");
  const facts = useRef({
    sample: runtime.sample,
    connected: runtime.connected,
    mode,
  });
  const hints = useMemo(() => new FootHints(), []);
  useEffect(() => {
    deviceChanged(runtime.deviceId);
    return () => deviceChanged(null);
  }, [runtime.deviceId, deviceChanged]);
  useEffect(() => {
    facts.current = {
      sample: runtime.sample,
      connected: runtime.connected,
      mode,
    };
  }, [runtime.sample, runtime.connected, mode]);
  useEffect(() => {
    const timer = setInterval(() => {
      const f = facts.current,
        now = performance.now();
      const fresh =
        f.connected &&
        f.sample &&
        now - f.sample.timestampMs >= 0 &&
        now - f.sample.timestampMs <= 250;
      setObserved(
        fresh
          ? hints.observe(FOOT_CONFIG[role].role, f.sample!, f.mode, now)
          : "unavailable",
      );
    }, 200);
    return () => clearInterval(timer);
  }, [hints, role]);
  const hint = runtime.connected ? observed : "unavailable";
  const label =
    hint === "movement"
      ? "حركة IMU ملحوظة — لا تعني وصول القدم"
      : hint === "rest"
        ? "إشارة IMU هادئة — لا تعني ثبات الوزن"
        : "لا توجد إشارة حديثة";
  return (
    <div
      className={styles.footTelemetry}
      data-testid={`foot-${role}`}
      data-hint={hint}
    >
      <strong>{FOOT_CONFIG[role].arabicLabel}</strong>
      <p>
        {runtime.connected
          ? "اتصال BLE قائم · غير متحقق ماديًا"
          : runtime.connecting || runtime.reconnecting
            ? "جارٍ الاتصال…"
            : "غير متصل"}
        <br />
        {label}
      </p>
      <div className={styles.actions}>
        <button
          className={styles.button}
          disabled={
            runtime.connected || runtime.connecting || runtime.reconnecting
          }
          onClick={() => void runtime.connect()}
        >
          اتصال {role === "RIGHT_FOOT" ? "اليمنى" : "اليسرى"}
        </button>
        <button
          className={styles.button}
          disabled={
            !runtime.connected && !runtime.connecting && !runtime.reconnecting
          }
          onClick={() => void runtime.disconnect()}
        >
          فصل
        </button>
      </div>
      {runtime.error && (
        <p className={styles.error} role="status">
          {runtime.error}
        </p>
      )}
    </div>
  );
}
