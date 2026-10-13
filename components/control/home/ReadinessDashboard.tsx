"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
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
    [request, setRequest] = useState(""),
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
    audio = fresh && displayAudioReady(presence, now);
  const send = async () => {
    setRequest("جاري إرسال الطلب…");
    try {
      await requestDisplayAudioEnable(getStaffDb(), {
        id: crypto.randomUUID(),
        requestedAt: Date.now(),
      });
      setRequest(
        "أُرسل اختبار الصوت. إذا بقي محجوبًا، اضغط تشغيل الصوت على شاشة العرض نفسها.",
      );
    } catch {
      setRequest("تعذّر إرسال الطلب. تحقق من الاتصال.");
    }
  };
  const deviceSelect = (
    label: string,
    value: number,
    change: (n: number) => void,
    excluded = -1,
  ) => (
    <label className={styles.device}>
      {label}
      <select value={value} onChange={(e) => change(Number(e.target.value))}>
        <option value={-1}>غير مُعيّن</option>
        {pads
          .filter((p) => p.index !== excluded)
          .map((p) => (
            <option key={p.index} value={p.index}>
              {p.id}
            </option>
          ))}
      </select>
      <span>
        {value < 0
          ? "غير مُعيّن"
          : pads.some((p) => p.index === value)
            ? "متصل بهذا المتصفح"
            : "غير متصل"}
      </span>
    </label>
  );
  return (
    <section className={styles.section} dir="rtl" aria-label="جاهزية النظام">
      <header>
        <h2>جاهزية النظام</h2>
        <span>التحكم اليدوي متاح دون أجهزة</span>
      </header>
      <div className={styles.grid}>
        <article className={`${styles.card} ${styles.display}`}>
          <div className={styles.heading}>
            <span className={styles.icon}>▣</span>
            <h3>شاشة العرض والصوت</h3>
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
          </div>
          <div className={styles.rows}>
            <p>
              صوت شاشة العرض{" "}
              <strong className={audio ? styles.good : styles.wait}>
                {audio ? "جاهز" : "يحتاج تشغيل"}
              </strong>
            </p>
            <details className={styles.help}>
              <summary>تفاصيل الإشارة</summary>
              <p>
                آخر اتصال مسجّل{" "}
                <span>
                  {typeof presence?.updatedAt === "number"
                    ? new Date(presence.updatedAt).toLocaleTimeString("ar-SA")
                    : "غير متاح"}
                </span>
              </p>
              <p>
                حداثة الإشارة{" "}
                <span>
                  {fresh
                    ? "إشارة خلال ٤٥ ثانية"
                    : presence?.connected
                      ? "يلزم تحديث شاشة العرض أو استعادة الاتصال"
                      : "بانتظار اتصال"}
                </span>
              </p>
            </details>
          </div>
          {!audio && (
            <details className={styles.help}>
              <summary>تشغيل الصوت على جهاز العرض</summary>
              <p>
                افتح شاشة العرض على جهاز الإسقاط، ثم اضغط «تشغيل الصوت» هناك
                للسماح بالتشغيل. صوت التحكم مستقل.
              </p>
            </details>
          )}
          <div className={styles.actions}>
            <a href="/display" target="_blank" rel="noopener noreferrer">
              فتح شاشة العرض ↗
            </a>
            <button disabled={!fresh} onClick={() => void send()}>
              اختبار الصوت
            </button>
          </div>
          {request && (
            <p role="status" className={styles.help}>
              {request}
            </p>
          )}
        </article>
        <article className={styles.card}>
          <div className={styles.heading}>
            <span className={styles.icon}>◌</span>
            <h3>حساسات اليد</h3>
          </div>
          <Hand
            label="اليمنى"
            runtime={right}
            supported={bluetooth}
            now={sampleNow}
          />
          <Hand
            label="اليسرى"
            runtime={left}
            supported={bluetooth}
            now={sampleNow}
          />
          <details className={styles.help}>
            <summary>معلومات الاتصال</summary>
            <p>
              الاتصال بهذا الجهاز. للعتاد المتصل بحاسوب العرض لا يوجد هنا مرحّل
              Bluetooth بعيد.
            </p>
          </details>
        </article>
        <article className={styles.card}>
          <div className={styles.heading}>
            <span className={styles.icon}>⌁</span>
            <h3>حساسات القدم</h3>
          </div>
          <div className={styles.rows}>
            <p>
              القدم اليمنى <span>غير مُهيّأة</span>
            </p>
            <p>
              القدم اليسرى <span>غير مُهيّأة</span>
            </p>
            <p>
              المعايرة <span>غير متاحة في لوحة النظام</span>
            </p>
          </div>
          <div className={styles.actions}>
            <Link href="/control/activities?filter=FOOT">أنشطة القدم</Link>
            <Link href="/control/calibration">معايرة الإسقاط</Link>
          </div>
          <details className={styles.help}>
            <summary>معلومات الاتصال</summary>
            <p>
              لا يوجد محوّل أقدام مشترك مُثبت هنا. قد تعرض الألعاب محاكاة أو
              تلميحات حركة؛ ليست إثباتًا ماديًا.
            </p>
          </details>
        </article>
        <article className={styles.card}>
          <div className={styles.heading}>
            <span className={styles.icon}>
              <InteractionIcon name="controller" />
            </span>
            <h3>أجهزة التحكم المحمولة</h3>
          </div>
          {gamepad === false ? (
            <p className={styles.help}>Gamepad غير مدعوم في هذا المتصفح.</p>
          ) : (
            <>
              {deviceSelect("اليمين", rightPad, setRightPad, leftPad)}
              {deviceSelect("اليسار", leftPad, setLeftPad, rightPad)}
            </>
          )}
          <details className={styles.help}>
            <summary>معلومات الاتصال</summary>
            <p>
              اضغط زرًا على الجهاز لظهوره. التعيين للتعرّف المحلي فقط؛ دعم
              Joy-Con الكامل غير مُتحقق.
            </p>
          </details>
        </article>
        <article className={styles.card}>
          <div className={styles.heading}>
            <span className={styles.icon}>
              <InteractionIcon name="wheel" />
            </span>
            <h3>المقود والدواسات</h3>
          </div>
          {deviceSelect("الجهاز المحلي", wheelPad, setWheelPad)}
          <details className={styles.help}>
            <summary>تفاصيل المقود والدواسات</summary>
            <p>
              {pads.find((p) => p.index === wheelPad)
                ? `${pads.find((p) => p.index === wheelPad)!.axes} محاور · ${pads.find((p) => p.index === wheelPad)!.buttons} أزرار متاحة. تُعيّن محاور المقود والدواسات وتُعاير داخل اللعبة.`
                : "لم يُعيّن جهاز. لا يمكن استنتاج اتصال الدواسات من اسم Gamepad وحده."}
            </p>
          </details>
          <Link
            className={styles.link}
            href="/control/activities?input=DRIVING"
          >
            أنشطة المقود والدواسات ←
          </Link>
        </article>
      </div>
      <footer className={styles.footer}>
        <span>
          الحالة حسب الإشارات المتاحة؛ الأجهزة الظاهرة تخص هذا المتصفح.
        </span>
        <Link href="/control/calibration">معايرة الإسقاط ←</Link>
      </footer>
    </section>
  );
}
function Status({ good, label }: { good: boolean; label: string }) {
  return (
    <span className={`${styles.status} ${good ? styles.good : styles.wait}`}>
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
          : fresh
            ? "متصل"
            : "متصل · قراءة قديمة";
  return (
    <div className={styles.hand}>
      <div>
        <strong>اليد {label}</strong>
        <Status good={fresh} label={state} />
        <details className={styles.help}>
          <summary>المعايرة وحداثة القراءة</summary>
          <span>
            {runtime.centered ? "تم تحديد المركز" : "تحتاج تحديد المركز"} ·{" "}
            {fresh ? "قراءة حديثة" : "لا توجد قراءة حديثة"}
          </span>
        </details>
        {runtime.error && (
          <span className={styles.failure}>{runtime.error}</span>
        )}
      </div>
      {runtime.connected ? (
        <button onClick={runtime.recenter}>تحديد المركز</button>
      ) : (
        <button
          disabled={
            supported !== true || runtime.connecting || runtime.reconnecting
          }
          onClick={() => void runtime.connect()}
        >
          ربط
        </button>
      )}
    </div>
  );
}
