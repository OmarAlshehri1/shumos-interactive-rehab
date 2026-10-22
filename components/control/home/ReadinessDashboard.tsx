"use client";
import { useEffect, useState } from "react";
import { getStaffDb, isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import {
  requestDisplayAudioEnable,
  subscribeToDisplayPresence,
  subscribeToConnectionStatus,
} from "@/lib/realtime/sessionRepository";
import type { PresenceRecord } from "@/lib/realtime/types";
import {
  useDualSensorRuntime,
  type SensorRuntime,
} from "@/components/control/sensors/SensorRuntimeProvider";
import { InteractionIcon } from "@/components/control/library/InteractionIcon";
import styles from "./readiness.module.css";
import { audioRequestState, type AudioRequest } from "@/lib/control/audioRequest";
export function freshDisplay(
  p: PresenceRecord | null | undefined,
  now: number,
) {
  return (
    !!p?.connected &&
    typeof p.updatedAt === "number" &&
    now >= p.updatedAt - 5000 &&
    now - p.updatedAt < 45000
  );
}
export function displayAudioReady(
  p: PresenceRecord | null | undefined,
  now: number,
) {
  return (
    freshDisplay(p, now) &&
    p?.audioStatus?.state === "ready" &&
    p.audioStatus.contextState === "running" &&
    typeof p.audioStatus.updatedAt === "number" &&
    now - p.audioStatus.updatedAt < 45000
  );
}
interface PadInfo {
  index: number;
  id: string;
  axes: number;
  buttons: number;
  fresh: boolean;
}
export function ReadinessDashboard() {
  const realtime = isRealtimeEnabled(),
    { right, left } = useDualSensorRuntime();
  const [presence, setPresence] = useState<PresenceRecord | null | undefined>(),
    [now, setNow] = useState(() => Date.now()),
    [connected, setConnected] = useState(false),
    [bluetooth, setBluetooth] = useState<boolean | null>(null),
    [gamepad, setGamepad] = useState<boolean | null>(null),
    [pads, setPads] = useState<PadInfo[]>([]),
    [rightPad, setRightPad] = useState(-1),
    [leftPad, setLeftPad] = useState(-1),
    [wheelPad, setWheelPad] = useState(-1),
    [request, setRequest] = useState<AudioRequest | null>(null),
    [sampleNow, setSampleNow] = useState(0);
  useEffect(() => {
    const poll = () => {
      setNow(Date.now());
      setSampleNow(performance.now());
      setBluetooth("bluetooth" in navigator);
      setGamepad(typeof navigator.getGamepads === "function");
      try {
        setPads(
          Array.from(navigator.getGamepads?.() ?? [])
            .filter((p): p is Gamepad => !!p?.connected)
            .map((p) => ({
              index: p.index,
              id: p.id,
              axes: p.axes.length,
              buttons: p.buttons.length,
              fresh: p.timestamp > 0 && performance.now() - p.timestamp < 3000,
            })),
        );
      } catch {
        setPads([]);
      }
    };
    poll();
    const timer = setInterval(poll, 1500);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!realtime) return;
    const a = subscribeToDisplayPresence(getStaffDb(), setPresence),
      b = subscribeToConnectionStatus(getStaffDb(), (s) =>
        setConnected(s === "connected"),
      );
    return () => {
      a();
      b();
    };
  }, [realtime]);
  const fresh = connected && freshDisplay(presence, now),
    audioState = audioRequestState(presence, request, connected, now),
    audio = audioState === "ready";
  const audioCopy = { ready: "صوت شاشة العرض جاهز", pending: "بانتظار تأكيد شاشة العرض…", blocked: "يتطلب الصوت ضغطة على شاشة العرض؛ افتحها واضغط مرة واحدة.", failed: "لم يصل تأكيد الصوت. تحقق من الشاشة ثم أعد المحاولة.", "not-ready": "يحتاج تشغيل" }[audioState];
  const send = async () => {
    const id = crypto.randomUUID();
    setNow(Date.now());
    setRequest({ id, at: Date.now() });
    try {
      await requestDisplayAudioEnable(getStaffDb(), { id, requestedAt: Date.now() });
    } catch { setRequest(current => current?.id === id ? { ...current, failed: true } : current); }
  };
  const deviceSelect = (
    label: string,
    value: number,
    change: (n: number) => void,
    excluded = -1,
  ) => {
    const available = pads.filter((p) => p.index !== excluded);
    const linked = value >= 0 && pads.some((p) => p.index === value);
    return (
      <div className={styles.row}>
        <span className={styles.name}>{label}</span>
        <select
          aria-label={label}
          className={styles.select}
          value={value}
          onChange={(e) => change(Number(e.target.value))}
        >
          <option value={-1}>
            {available.length ? "اختر جهازًا" : "اضغط زرًا على الجهاز"}
          </option>
          {available.map((p) => (
            <option key={p.index} value={p.index}>
              {p.id}
            </option>
          ))}
        </select>
        <Status
          good={linked}
          label={value < 0 ? "غير مُعيّن" : linked ? "متصل" : "غير متصل"}
        />
      </div>
    );
  };
  const wheelInfo = pads.find((p) => p.index === wheelPad);
  return (
    <section className={styles.section} dir="rtl" aria-label="جاهزية النظام">
      <header className={styles.sectionHeader}>
        <h2>جاهزية النظام</h2>
      </header>
      <div className={styles.grid}>
        <article className={`${styles.card} ${styles.display}`}>
          <CardHeading icon="display" title="شاشة العرض والصوت" />
          <div className={styles.row}>
            <span className={styles.name}>الشاشة</span>
            <Status
              good={fresh}
              label={
                !realtime
                  ? "غير مُهيّأة"
                  : presence === undefined
                    ? "غير معروف"
                    : fresh
                      ? "متصلة"
                      : presence?.connected
                        ? "إشارة قديمة"
                        : "غير متصلة"
              }
            />
            <a
              className={styles.primary}
              href="/display"
              target="_blank"
              rel="noopener noreferrer"
            >
              <InteractionIcon name="display" />
              شاشة العرض
            </a>
          </div>
          <div className={styles.row}>
            <span className={styles.name}>الصوت</span>
            <Status good={audio} label={audio ? "جاهز" : audioState === "pending" ? "جارٍ التحقق" : audioState === "failed" ? "تعذّر التفعيل" : "يحتاج تشغيل"} />
            <button
              type="button"
              className={styles.secondary}
              disabled={!fresh || audioState === "pending"}
              onClick={() => void send()}
            >
              <InteractionIcon name="audio" />
              تشغيل الصوت
            </button>
          </div>
          {request && (
            <p role="status" className={styles.note}>
              {audioCopy}
            </p>
          )}
        </article>
        <article className={styles.card}>
          <CardHeading icon="hand" title="حساسات اليد" />
          <Hand
            label="اليد اليمنى"
            runtime={right}
            supported={bluetooth}
            now={sampleNow}
          />
          <Hand
            label="اليد اليسرى"
            runtime={left}
            supported={bluetooth}
            now={sampleNow}
          />
        </article>
        <article className={styles.card}>
          <CardHeading icon="foot" title="حساسات القدم" />
          {/* No shared foot-sensor adapter exists yet, so there is nothing to pair: status only, no fake connect button. */}
          <div className={styles.row}>
            <span className={styles.name}>القدم اليمنى</span>
            <Status good={false} label="غير مُهيّأة" />
          </div>
          <div className={styles.row}>
            <span className={styles.name}>القدم اليسرى</span>
            <Status good={false} label="غير مُهيّأة" />
          </div>
        </article>
        <article className={`${styles.card} ${styles.wide}`}>
          <CardHeading icon="controller" title="أجهزة التحكم" />
          {gamepad === false ? (
            <p className={styles.note}>Gamepad غير مدعوم في هذا المتصفح.</p>
          ) : (
            <>
              {deviceSelect("اليمين", rightPad, setRightPad, leftPad)}
              {deviceSelect("اليسار", leftPad, setLeftPad, rightPad)}
            </>
          )}
        </article>
        <article className={`${styles.card} ${styles.wide}`}>
          <CardHeading icon="wheel" title="المقود والدواسات" />
          {gamepad === false ? (
            <p className={styles.note}>Gamepad غير مدعوم في هذا المتصفح.</p>
          ) : (
            deviceSelect("الجهاز", wheelPad, setWheelPad)
          )}
          {wheelInfo && (
            <p className={styles.note}>
              {wheelInfo.axes} محاور · {wheelInfo.buttons} أزرار
            </p>
          )}
        </article>
      </div>
    </section>
  );
}
function CardHeading({ icon, title }: { icon: string; title: string }) {
  return (
    <div className={styles.heading}>
      <span className={styles.icon}>
        <InteractionIcon name={icon} />
      </span>
      <h3>{title}</h3>
    </div>
  );
}
function Status({ good, label }: { good: boolean; label: string }) {
  return (
    <span className={`${styles.status} ${good ? styles.good : styles.wait}`}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
}
function Hand({
  label,
  runtime,
  supported,
  now,
}: {
  label: string;
  runtime: SensorRuntime;
  supported: boolean | null;
  now: number;
}) {
  const fresh =
    runtime.connected &&
    !!runtime.pointer &&
    now - runtime.pointer.timestampMs < 3000;
  const state =
    supported === false
      ? "غير مدعوم"
      : runtime.connecting || runtime.reconnecting
        ? "جاري الاتصال"
        : !runtime.connected
          ? "غير متصل"
          : !fresh
            ? "قراءة قديمة"
            : runtime.centered
              ? "متصل"
              : "يحتاج مركزًا";
  return (
    <div className={styles.row}>
      <span className={styles.name}>{label}</span>
      <Status good={fresh && runtime.centered} label={state} />
      {runtime.connected ? (
        <button type="button" className={styles.secondary} onClick={runtime.recenter}>
          تحديد المركز
        </button>
      ) : (
        <button
          type="button"
          className={styles.secondary}
          disabled={
            supported !== true || runtime.connecting || runtime.reconnecting
          }
          onClick={() => void runtime.connect()}
        >
          ربط
        </button>
      )}
      {runtime.error && <span className={styles.failure}>{runtime.error}</span>}
    </div>
  );
}
