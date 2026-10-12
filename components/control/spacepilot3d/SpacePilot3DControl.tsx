"use client";
import {
  ProgressiveStageGroup,
  AdditionalOptions,
} from "@/components/control/setup/ProgressiveStages";
import { useLibraryLaunchAdapter } from "@/components/control/library/launch/LibraryLaunchBoundary";

import { SPACE_STAGES } from "@/lib/spacepilot3d/curriculum";
import Link from "next/link";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import {
  mountFirebaseControl,
  type OwnershipEvent,
  type SpacePilotPlatform,
} from "@/lib/spacepilot3d/firebaseControlRuntime";
import { useLiveGameController } from "@/lib/liveGame/useLiveGameController";
import { LeaseContestedOverlay } from "../LeaseContestedOverlay";
import { ManualFlightControls } from "./ManualFlightControls";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  mountControlSession,
  type ControlSessionHandle,
  type ControlSessionView,
} from "@/lib/spacepilot3d/controlSessionRuntime";
import type {
  SessionAction,
  SessionSummary,
  SuspendReason,
} from "@/lib/spacepilot3d/sessionContract";
import {
  flightModeArabic,
  normalizeAccessibility,
  type FlightMode,
} from "@/lib/spacepilot3d/rings";
import type { FlightSettings } from "@/lib/spacepilot3d/worldFlight";
import type { FlightDifficulty } from "@/lib/spacepilot3d/missions";
import type { PrototypeInputMode } from "@/lib/spacepilot3d/simulation";

import {
  lifecycleArabic,
  missionArabic,
  numberArabic,
  reasonArabic,
  sensorArabic,
} from "@/lib/spacepilot3d/arabic";

const button =
  "rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white disabled:cursor-default disabled:opacity-35 hover:enabled:bg-teal-800";
const select =
  "mt-2 block w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 disabled:opacity-50";

/**
 * With Firebase the screen runs on the platform controller (staff authorization, controller lease, presence, window
 * ownership); without Firebase it is the same-computer local session. The screen below is identical in both cases.
 */
export function SpacePilot3DControl({
  integrated = false,
}: { integrated?: boolean } = {}) {
  return integrated && isRealtimeEnabled() ? (
    <CloudSpacePilotControl />
  ) : (
    <SpacePilotControlScreen integrated={integrated} />
  );
}
function CloudSpacePilotControl() {
  const c = useLiveGameController();
  const { auth, db, uid, isOwner, claimOwnership, takeoverBlocked, getLive } =
    c;
  const [force, setForce] = useState(false);
  const platform = useMemo<SpacePilotPlatform | null>(
    () =>
      uid
        ? {
            db,
            uid,
            force,
            patient: () => ({
              patientId: getLive().patientId,
              childName: getLive().childName,
            }),
          }
        : null,
    [db, uid, force, getLive],
  );
  if (auth.phase !== "authorized" || !platform)
    return (
      <main dir="rtl" className="min-h-dvh bg-slate-50 p-8">
        <p role="status">جاري تجهيز الاتصال...</p>
      </main>
    );
  return (
    <>
      {!isOwner && (
        <LeaseContestedOverlay
          onTakeOver={claimOwnership}
          takeoverBlocked={takeoverBlocked}
        />
      )}
      {isOwner && (
        <SpacePilotControlScreen
          integrated
          platform={platform}
          onTakeOver={() => setForce(true)}
        />
      )}
    </>
  );
}
function SpacePilotControlScreen({
  integrated = false,
  platform = null,
  onTakeOver,
}: {
  integrated?: boolean;
  platform?: SpacePilotPlatform | null;
  onTakeOver?: () => void;
}) {
  const cloud = platform !== null;
  const [ownership, setOwnership] = useState<OwnershipEvent | null>(null);
  const manual = useCallback(
    (x: number, y: number, active: boolean) =>
      handle.current?.manual?.(x, y, active),
    [],
  );
  const handle = useRef<ControlSessionHandle | null>(null);
  const [view, setView] = useState<ControlSessionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<{
    remaining: number;
    epoch: number;
    runId: number;
  } | null>(null);
  const latestView = useRef<ControlSessionView | null>(null);
  useLibraryLaunchAdapter("space-pilot", {
    modes: ["MANUAL", "RIGHT_HAND"],
    apply: (mode) => {
      const v = latestView.current;
      if (
        !v ||
        !handle.current ||
        !["ready", "paused"].includes(v.state.lifecycle)
      )
        return false;
      if (mode === "RIGHT_HAND" && v.state.sensorSource === "remote") {
        if (
          !handle.current.action(
            { type: "sensor-source", value: "local" },
            v.state.revision,
            v.state.runId,
          )
        )
          return false;
      }
      const current = latestView.current ?? v;
      return handle.current.action(
        {
          type: "input-mode",
          value: mode === "RIGHT_HAND" ? "sensor" : "keyboard",
        },
        current.state.revision,
        current.state.runId,
      );
    },
  });
  const receive = useCallback((next: ControlSessionView) => {
    latestView.current = next;
    setView(next);
  }, []);
  useEffect(() => {
    const close = platform
      ? mountFirebaseControl(
          platform,
          receive,
          (next) => {
            handle.current = next;
          },
          setError,
          setOwnership,
        )
      : mountControlSession(
          receive,
          (next) => {
            handle.current = next;
          },
          setError,
          integrated,
        );
    return () => {
      handle.current = null;
      close();
    };
  }, [receive, platform, integrated]);
  // A therapist-local preparation timer. No simulation time advances and no
  // countdown packets are introduced. Input epoch/run guards cancel configuration
  // or ownership changes; unrelated sensor presence cannot reset a manual launch.
  useEffect(() => {
    if (!countdown) return;
    const valid =
      view?.ready &&
      view.state.lifecycle === "ready" &&
      view.state.inputEpoch === countdown.epoch &&
      view.state.runId === countdown.runId;
    const timer = window.setTimeout(
      () => {
        if (!valid || document.hidden) {
          setCountdown(null);
          return;
        }
        if (countdown.remaining > 1)
          setCountdown({ ...countdown, remaining: countdown.remaining - 1 });
        else {
          const current = latestView.current;
          if (
            current?.ready &&
            current.state.inputEpoch === countdown.epoch &&
            current.state.runId === countdown.runId
          )
            handle.current?.action(
              { type: "start" },
              current.state.revision,
              countdown.runId,
            );
          setCountdown(null);
        }
      },
      valid ? 1000 : 0,
    );
    const cancelWhenHidden = () => {
      if (document.hidden) setCountdown(null);
    };
    document.addEventListener("visibilitychange", cancelWhenHidden);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", cancelWhenHidden);
    };
  }, [
    countdown,
    view?.ready,
    view?.state.lifecycle,
    view?.state.inputEpoch,
    view?.state.runId,
  ]);
  const action = (next: SessionAction) => {
    const current = latestView.current;
    if (current)
      handle.current?.action(next, current.state.revision, current.state.runId);
  };
  const state = view?.state;
  const ended = state?.lifecycle === "ended";
  const stopped =
    state?.lifecycle === "paused" || state?.lifecycle === "suspended";
  const displayUrl = state
    ? cloud
      ? "/display"
      : `${integrated ? "/display/space-pilot" : "/display/space-pilot-3d-prototype"}#room=${state.roomId}`
    : "";

  return (
    <main
      data-testid="sp-control"
      data-stage-index={(state?.mission ?? 1) - 1}
      data-completed={state?.stats.completedMissions ?? 0}
      data-skipped={
        state?.stageResults?.filter((r) => r.status === "skipped").length ?? 0
      }
      data-curriculum={state?.curriculumId ?? "legacy-3"}
      className="min-h-dvh bg-slate-50 px-5 py-8 text-slate-800"
      dir="rtl"
      lang="ar"
      style={{ fontFamily: "var(--font-control), system-ui, sans-serif" }}
    >
      <div className="mx-auto max-w-5xl space-y-5">
        {integrated && (
          <nav
            className="flex flex-wrap items-center gap-5 text-sm font-bold text-teal-800"
            aria-label="التنقل"
          >
            <Link href="/control/activities">مكتبة الأنشطة</Link>
            <Link href="/control/sensor-setup-prototype">إعداد المستشعر</Link>
            <Link href="/control/space-pilot-legacy">النسخة السابقة</Link>
          </nav>
        )}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-widest text-teal-700">
              {integrated
                ? "شموس · قائد الفضاء ثلاثي الأبعاد"
                : "شموس · جلسة تجريبية"}
            </p>
            <h1 className="mt-2 text-3xl font-bold">قائد الفضاء</h1>
            <p className="mt-2 text-sm text-slate-500">
              {cloud
                ? "تحكم المعالج · مزامنة آمنة بين الأجهزة"
                : "تحكم المعالج · جلسة محلية لا تُحفظ في سجل المريض"}
            </p>
          </div>
          {state && (
            <a
              href={displayUrl}
              target="_blank"
              rel="noopener"
              className={button}
            >
              فتح شاشة الطفل
            </a>
          )}
        </header>
        {error && (
          <p
            role="alert"
            className="rounded-2xl border border-amber-200 bg-amber-50 p-5"
          >
            {error}
          </p>
        )}
        {ownership?.kind === "superseded" && (
          <p
            role="alert"
            data-testid="sp-superseded"
            className="rounded-2xl border border-amber-200 bg-amber-50 p-5"
          >
            تم نقل هذه الجلسة إلى نافذة تحكم أخرى. هذه النافذة لم تعد تتحكم
            بالرحلة، أغلقها أو أعد تحميلها.
          </p>
        )}
        {ownership?.kind === "blocked" && (
          <div
            role="alert"
            data-testid="sp-recovery-blocked"
            className="rounded-2xl border border-amber-200 bg-amber-50 p-5"
          >
            <p>
              توجد رحلة غير منتهية تعمل في نافذة تحكم أخرى.
              {ownership.takeoverAllowed
                ? " إذا كانت تلك النافذة مغلقة أو متوقفة يمكنك استعادة الرحلة هنا، وستعود متوقفة مؤقتًا بتقدّمها كما هو."
                : " تخص مريضًا آخر غير المختار هنا؛ أغلق النافذة الأخرى أو اختر المريض نفسه لاستعادتها."}
            </p>
            {ownership.takeoverAllowed && (
              <button
                type="button"
                className={button}
                data-testid="sp-take-over"
                onClick={() => {
                  setOwnership(null);
                  onTakeOver?.();
                }}
              >
                استعادة الرحلة هنا
              </button>
            )}
          </div>
        )}
        {ownership?.kind === "recovered" &&
          state &&
          ["suspended", "paused", "ready"].includes(state.lifecycle) && (
            <p
              role="status"
              data-testid="sp-recovered"
              className="rounded-2xl border border-teal-200 bg-teal-50 p-5"
            >
              تمت استعادة الرحلة بعد إعادة تحميل الصفحة، وتم الاحتفاظ بالمهمة
              والحلقات المجمّعة. الرحلة متوقفة مؤقتًا حتى تضغط «متابعة».
            </p>
          )}
        {!state && !error && ownership?.kind !== "blocked" && (
          <p role="status">
            {cloud
              ? "جاري تجهيز الجلسة…"
              : "بانتظار إتاحة الجلسة المحلية… أغلق نافذة التحكم الأخرى لهذه الجلسة."}
          </p>
        )}
        {state && (
          <>
            <section
              className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
              aria-label="إعداد الجلسة"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-bold">إعداد الرحلة</h2>
                <span
                  role="status"
                  data-testid="session-lifecycle"
                  data-lifecycle={state.lifecycle}
                  className="rounded-full bg-teal-50 px-3 py-1 text-sm font-bold text-teal-800"
                >
                  {lifecycleArabic[state.lifecycle]}
                </span>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">
                  الصعوبة
                  <select
                    aria-label="الصعوبة"
                    className={select}
                    value={state.difficulty}
                    disabled={state.lifecycle !== "ready" || !!countdown}
                    onChange={(e) =>
                      action({
                        type: "difficulty",
                        value: e.target.value as FlightDifficulty,
                      })
                    }
                  >
                    <option value="LOW">سهل · رحلة هادئة</option>
                    <option value="MEDIUM">متوسط · رحلة متوازنة</option>
                    <option value="HIGH">متقدم · تنوّع المسار</option>
                  </select>
                </label>
                <label className="text-sm font-semibold">
                  طريقة التحكم
                  <select
                    aria-label="طريقة التحكم"
                    className={select}
                    value={state.inputMode}
                    disabled={ended || !!countdown}
                    onChange={(e) =>
                      action({
                        type: "input-mode",
                        value: e.target.value as PrototypeInputMode,
                      })
                    }
                  >
                    <option value="keyboard">تحكم يدوي</option>
                    <option value="sensor">مستشعر اليد اليمنى</option>
                  </select>
                </label>
                {cloud && state.inputMode === "sensor" && (
                  <label className="text-sm font-semibold">
                    مصدر اليد اليمنى
                    <select
                      aria-label="مصدر اليد اليمنى"
                      className={select}
                      value={state.sensorSource ?? "local"}
                      disabled={ended || !!countdown}
                      onChange={(e) =>
                        action({
                          type: "sensor-source",
                          value: e.target.value as "local" | "remote",
                        })
                      }
                    >
                      <option value="local">
                        هذا الجهاز · اتصال المستشعر الحالي
                      </option>
                      <option value="remote">
                        حاسوب المستشعر · عبر المزامنة
                      </option>
                    </select>
                    <a
                      className="mt-3 block font-bold text-teal-700 underline"
                      target="_blank"
                      rel="noopener"
                      href={`/control/space-pilot/sensor-source?session=${state.roomId}`}
                    >
                      فتح رابط حاسوب المستشعر
                    </a>
                  </label>
                )}
              </div>
              <fieldset
                className="mt-5 grid gap-4 rounded-2xl border border-slate-200 p-4 sm:grid-cols-3"
                disabled={
                  !["ready", "paused"].includes(state.lifecycle) || !!countdown
                }
              >
                <legend className="px-2 text-sm font-bold">
                  الطيران ومجال الحركة
                </legend>
                <label className="text-sm font-semibold sm:col-span-3">
                  نمط الطيران
                  <select
                    aria-label="نمط الطيران"
                    className={select}
                    value={state.accessibility.mode}
                    onChange={(e) =>
                      action({
                        type: "accessibility",
                        value: {
                          ...state.accessibility,
                          mode: e.target.value as FlightMode,
                        },
                      })
                    }
                  >
                    {Object.entries(flightModeArabic).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-semibold">
                  مساعدة الارتفاع
                  <select
                    aria-label="مساعدة الارتفاع"
                    className={select}
                    disabled={state.accessibility.mode !== "MEDIUM"}
                    value={state.accessibility.altitudeAssistance}
                    onChange={(e) =>
                      action({
                        type: "accessibility",
                        value: {
                          ...state.accessibility,
                          altitudeAssistance: Number(e.target.value),
                        },
                      })
                    }
                  >
                    <option value={0.5}>لطيفة جدًا</option>
                    <option value={1.5}>متوازنة</option>
                    <option value={3}>أوضح</option>
                  </select>
                </label>
                <AdditionalOptions>
                  <label className="text-sm font-semibold">
                    فسحة عبور الحلقة
                    <select
                      aria-label="فسحة عبور الحلقة"
                      className={select}
                      value={state.accessibility.ringTolerance}
                      onChange={(e) =>
                        action({
                          type: "accessibility",
                          value: {
                            ...state.accessibility,
                            ringTolerance: Number(e.target.value),
                          },
                        })
                      }
                    >
                      <option value={0}>دقيقة</option>
                      <option value={0.25}>محدودة</option>
                      <option value={0.5}>متوازنة</option>
                      <option value={0.8}>مريحة</option>
                      <option value={1}>واسعة</option>
                    </select>
                  </label>
                  <label className="text-sm font-semibold">
                    تطوير المركبة
                    <select
                      aria-label="تطوير المركبة"
                      className={select}
                      value={`${state.accessibility.upgrade2}/${state.accessibility.upgrade3}`}
                      onChange={(e) => {
                        const [upgrade2, upgrade3] = e.target.value
                          .split("/")
                          .map(Number);
                        action({
                          type: "accessibility",
                          value: normalizeAccessibility(
                            { ...state.accessibility, upgrade2, upgrade3 },
                            state.difficulty,
                          ),
                        });
                      }}
                    >
                      <option value="3/7">بعد ٣ و٧ حلقات</option>
                      <option value="2/5">بعد ٢ و٥ حلقات</option>
                      <option value="5/10">بعد ٥ و١٠ حلقات</option>
                    </select>
                  </label>
                </AdditionalOptions>

                <p className="text-xs leading-6 text-teal-800 sm:col-span-3">
                  {state.accessibility.mode === "EASY"
                    ? "الارتفاع ثابت؛ حركة اليد العمودية لا تغيّر الطيران. الحلقات أوسع والرحلة أبطأ."
                    : state.accessibility.mode === "MEDIUM"
                      ? "المركبة تساعد بلطف في الارتفاع نحو الحلقة التالية، وتتوقف المساعدة عند اقتراب نيزك. الاتجاه يمينًا ويسارًا بيد الطفل."
                      : "الطفل يتحكم بالاتجاه والارتفاع دون مساعدة تلقائية."}{" "}
                  مستوى المرحلة يغيّر تنوّع المسار؛ لا يفرض سرعة أعلى أو مساعدة
                  أقل.
                </p>

                {(
                  [
                    [
                      "headingLimit",
                      "نطاق التوجيه",
                      [
                        [20, "ضيق ومريح"],
                        [35, "لطيف"],
                        [45, "متوازن"],
                        [60, "واسع · حتى ٦٠° لكل جانب"],
                      ],
                    ],
                    [
                      "horizontalLimit",
                      "عرض مسار الرحلة",
                      [
                        [32, "مضغوط"],
                        [40, "متوازن"],
                        [48, "واسع"],
                        [64, "واسع جدًا"],
                      ],
                    ],
                    [
                      "verticalLimit",
                      "مجال الصعود والهبوط",
                      [
                        [12, "لطيف"],
                        [16, "متوازن"],
                        [20, "واسع"],
                        [28, "واسع جدًا"],
                      ],
                    ],
                    [
                      "sensitivity",
                      "حساسية التوجيه",
                      [
                        [0.5, "منخفضة"],
                        [0.75, "لطيفة"],
                        [1, "متوازنة"],
                        [1.5, "مرتفعة"],
                        [2, "لحركة يد صغيرة"],
                      ],
                    ],
                    [
                      "maxTurnRate",
                      "سرعة الانعطاف القصوى",
                      [
                        [15, "هادئة جدًا"],
                        [30, "هادئة"],
                        [45, "متوازنة"],
                        [60, "سريعة"],
                        [75, "سريعة جدًا"],
                      ],
                    ],
                    [
                      "encounterSpacing",
                      "الفاصل بين المواجهات",
                      [
                        [4, "متتابع"],
                        [5, "متوازن"],
                        [6, "مريح"],
                        [8, "فسحة أطول"],
                        [10, "فسحة كبيرة"],
                      ],
                    ],
                    [
                      "course",
                      "مسار الرحلة",
                      [
                        [0, "مستقيم"],
                        [1, "انحناء لطيف"],
                      ],
                    ],
                    [
                      "guidance",
                      "مساعدة الوصول للأهداف",
                      [
                        [0, "بدون إرشاد"],
                        [1, "إرشاد الحلقات"],
                        [2, "الحلقات والمرور الآمن"],
                      ],
                    ],
                    [
                      "reducedCamera",
                      "حركة كاميرا مريحة",
                      [
                        [0, "متابعة طبيعية"],
                        [1, "حركة مخفّضة"],
                      ],
                    ],
                  ] as [keyof FlightSettings, string, [number, string][]][]
                ).map(([key, label, options]) => (
                  <label key={key} className="text-sm font-semibold">
                    {label}
                    <select
                      className={select}
                      aria-label={label}
                      value={state.flightSettings[key]}
                      onChange={(event) =>
                        action({
                          type: "flight-settings",
                          value: {
                            ...state.flightSettings,
                            [key]: Number(event.target.value),
                          },
                        })
                      }
                    >
                      {options.map(([value, text]) => (
                        <option key={value} value={value}>
                          {text}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <p className="text-xs leading-6 text-slate-500 sm:col-span-3">
                  المنتصف يتبع مسار الرحلة. الميل يحدد اتجاهًا محدودًا؛ لا يسبب
                  دورانًا متواصلًا. الإرشاد علامة بصرية فقط؛ أنت من يوجّه
                  المركبة. هذه إعدادات اللعبة فقط، ولا تغيّر معايرة المستشعر.
                  تعديلها أثناء الاستراحة يعيد تجهيز المرحلة الحالية ويحافظ على
                  نتائج بقية المراحل.
                </p>
              </fieldset>
              <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
                <p>
                  شاشة الطفل:{" "}
                  <strong data-testid="display-readiness">
                    {state.primaryDisplayId
                      ? `${numberArabic(state.displays.length)} متصلة`
                      : "افتح شاشة الطفل"}
                  </strong>
                </p>
                <p>
                  اليد اليمنى:{" "}
                  <strong
                    data-testid="sensor-status"
                    data-status={state.sensorStatus}
                  >
                    {sensorArabic[state.sensorStatus]}
                  </strong>
                </p>
              </div>
              {state.displays.length > 1 && (
                <label className="mt-4 block text-sm">
                  الشاشة الرئيسية
                  <select
                    aria-label="الشاشة الرئيسية"
                    className={select}
                    disabled={state.lifecycle === "running" || ended}
                    value={state.primaryDisplayId ?? ""}
                    onChange={(e) =>
                      action({ type: "primary-display", value: e.target.value })
                    }
                  >
                    {state.displays.map((id) => (
                      <option key={id} value={id}>
                        شاشة {id.slice(0, 6)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p className="mt-4 text-sm leading-6 text-slate-500">
                {state.inputMode === "keyboard"
                  ? "استخدم أزرار التوجيه اليدوي. ارفع إصبعك للعودة إلى المنتصف. أبقِ شاشة الطفل والتحكم مفتوحتين."
                  : "استخدم اتصال اليد اليمنى الحالي. طابق النقطتين الذهبية والزرقاء قبل البدء أو المتابعة. أوقف الرحلة مؤقتًا قبل إعادة التمركز، ثم أعد تفعيل اليد."}
              </p>
              {state.inputMode === "sensor" && (
                <button
                  className="mt-3 rounded-xl border border-teal-200 px-4 py-2 text-sm font-bold text-teal-800 disabled:opacity-40"
                  disabled={ended || !!countdown}
                  onClick={() => action({ type: "reengage" })}
                >
                  إعادة تفعيل اليد
                </button>
              )}
              {state.reason && (
                <p
                  role="alert"
                  className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
                >
                  {state.reason === "Run reset. Resume when ready."
                    ? "أُعيدت الرحلة. تابع عندما تكون جاهزًا."
                    : (reasonArabic[state.reason as SuspendReason] ??
                      "الرحلة متوقفة بأمان. تحقق من الاتصال.")}
                </p>
              )}
              {!view.checkpointAvailable && (
                <p className="mt-3 text-sm text-amber-800">
                  التخزين المحلي غير متاح. يبقى الملخص حتى إغلاق هذه النافذة.
                </p>
              )}
            </section>
            {integrated && (
              <ManualFlightControls
                key={`${state.runId}/${state.inputMode}/${state.inputEpoch}`}
                send={manual}
                mode={state.accessibility.mode}
                sensor={state.inputMode === "sensor"}
                disabled={
                  (cloud && !view.connected) ||
                  ended ||
                  state.lifecycle === "completed"
                }
              />
            )}
            {cloud && (
              <p
                role="status"
                data-testid="cloud-status"
                data-connected={view.connected}
                data-history={view.historyStatus}
              >
                {view.connected
                  ? "متصل بالمزامنة"
                  : "الاتصال متوقف · الجلسة محفوظة"}{" "}
                ·{" "}
                {view.historyStatus === "saved"
                  ? "حُفظت النتيجة في سجل المريض"
                  : view.historyStatus === "walk-in"
                    ? "جلسة زائر · دون سجل مريض"
                    : view.historyStatus === "retry"
                      ? "إعادة محاولة حفظ النتيجة"
                      : ""}
              </p>
            )}
            <section
              className="rounded-3xl border border-teal-200 bg-white p-6 shadow-sm"
              aria-label="الجلسة الحالية"
            >
              <h2 className="text-lg font-bold">
                {state.curriculumId
                  ? `المستوى ${numberArabic(SPACE_STAGES[state.mission - 1].level)} · المرحلة ${numberArabic(SPACE_STAGES[state.mission - 1].stage)} — ${SPACE_STAGES[state.mission - 1].nameAr}`
                  : `المهمة ${numberArabic(state.mission)} من ٣ · ${missionArabic[state.mission - 1]}`}
              </h2>
              {state.curriculumId && (
                <fieldset
                  className="mt-4"
                  disabled={
                    ended ||
                    state.lifecycle === "completed" ||
                    !!countdown ||
                    (cloud && !view.connected)
                  }
                >
                  <legend className="mb-3 font-bold">
                    اختر أي مرحلة · تسع مراحل متاحة
                  </legend>
                  <ProgressiveStageGroup selected={state.mission - 1}>
                    {SPACE_STAGES.map((stage) => {
                      const result = state.stageResults?.find(
                        (r) => r.stageIndex === stage.index,
                      );
                      return (
                        <button
                          key={stage.index}
                          data-testid={`sp-stage-${stage.index}`}
                          aria-pressed={state.mission === stage.index + 1}
                          className={`${button} min-h-16 ${state.mission === stage.index + 1 ? "ring-2 ring-teal-900 ring-offset-2" : ""}`}
                          onClick={() =>
                            action({ type: "select-stage", value: stage.index })
                          }
                        >
                          {numberArabic(stage.level)} /{" "}
                          {numberArabic(stage.stage)} · {stage.nameAr}
                          <span className="block text-xs">
                            {result
                              ? result.status === "skipped"
                                ? "تم التخطي"
                                : result.assisted
                                  ? "اكتملت بمساعدة"
                                  : "اكتملت"
                              : "متاحة"}
                          </span>
                        </button>
                      );
                    })}
                  </ProgressiveStageGroup>
                  <p className="mt-3 text-xs text-slate-500">
                    اختيار مرحلة يوقف الطيران ويجهّزها للبدء. إعادة مرحلة تستبدل
                    نتيجتها السابقة دون مضاعفة العدد.
                  </p>
                </fieldset>
              )}
              <div
                data-testid="session-stats"
                data-session={state.sessionId}
                data-run={state.runId}
                data-revision={state.revision}
                data-events={state.eventSequence}
                data-collected={state.stats.ringsCollected}
                data-collisions={state.stats.asteroidCollisions}
                data-resolved={state.stats.resolved}
                className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"
              >
                <Metric
                  label="الحلقات المكتملة"
                  value={state.stats.ringsCollected}
                />
                <Metric label="النقاط" value={state.stats.score} />
                <Metric
                  label="ملامسات النيازك"
                  value={state.stats.asteroidCollisions}
                />
                <Metric label="مستوى المركبة" value={state.stats.upgradeTier} />
              </div>
              <p className="mt-4 text-sm text-slate-500">
                التقدم: {numberArabic(state.stats.resolved)} من{" "}
                {numberArabic(state.stats.totalEncounters)} · المهام المكتملة:{" "}
                {numberArabic(state.stats.completedMissions)} من{" "}
                {state.curriculumId ? numberArabic(9) : numberArabic(3)}
              </p>
              <progress
                className="mt-2 h-2 w-full accent-teal-600"
                aria-label="تقدم الجلسة"
                max={state.stats.totalEncounters}
                value={state.stats.resolved}
              />
              {countdown && (
                <div
                  role="status"
                  data-testid="launch-countdown"
                  className="mt-5 flex items-center gap-5 rounded-2xl bg-teal-50 p-4"
                >
                  <strong>
                    استعد للانطلاق… {numberArabic(countdown.remaining)}
                  </strong>
                  <button className={button} onClick={() => setCountdown(null)}>
                    إلغاء العد التنازلي
                  </button>
                </div>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                {state.lifecycle === "ready" && (
                  <button
                    className={button}
                    disabled={!!countdown}
                    onClick={() =>
                      action({
                        type: "instructions",
                        value: !state.instructionsVisible,
                      })
                    }
                  >
                    {state.instructionsVisible
                      ? "متابعة · تخطي التعليمات"
                      : "عرض التعليمات"}
                  </button>
                )}
                {state.lifecycle === "ready" && (
                  <button
                    className={button}
                    disabled={!view.ready || !!countdown}
                    onClick={() =>
                      setCountdown({
                        remaining: 3,
                        epoch: state.inputEpoch,
                        runId: state.runId,
                      })
                    }
                  >
                    بدء الجلسة
                  </button>
                )}
                {state.lifecycle === "running" && (
                  <button
                    className={button}
                    onClick={() => action({ type: "pause" })}
                  >
                    إيقاف مؤقت
                  </button>
                )}
                {stopped && (
                  <button
                    className={button}
                    disabled={!view.ready}
                    onClick={() => action({ type: "resume" })}
                  >
                    متابعة
                  </button>
                )}
                {state.lifecycle === "mission-complete" && (
                  <button
                    className={button}
                    disabled={!view.ready}
                    onClick={() => action({ type: "next-mission" })}
                  >
                    المرحلة التالية
                  </button>
                )}
                {state.curriculumId && (
                  <>
                    <button
                      data-testid="sp-restart-stage"
                      className={button}
                      disabled={
                        ended || state.lifecycle === "completed" || !!countdown
                      }
                      onClick={() => action({ type: "restart-stage" })}
                    >
                      إعادة المرحلة
                    </button>
                    <button
                      data-testid="sp-repeat-stage"
                      className={button}
                      disabled={
                        ended || state.lifecycle === "completed" || !!countdown
                      }
                      onClick={() => action({ type: "repeat-stage" })}
                    >
                      تكرار المرحلة
                    </button>
                    <button
                      data-testid="sp-skip-stage"
                      className={button}
                      disabled={
                        ended ||
                        ["completed", "mission-complete"].includes(
                          state.lifecycle,
                        ) ||
                        !!countdown
                      }
                      onClick={() => action({ type: "skip-stage" })}
                    >
                      تخطي المرحلة
                    </button>
                  </>
                )}
                <button
                  className={button}
                  disabled={
                    ended ||
                    state.lifecycle === "ready" ||
                    (cloud && state.lifecycle === "completed")
                  }
                  onClick={() => action({ type: "restart" })}
                >
                  إعادة الرحلة
                </button>
                <button
                  className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold disabled:opacity-35"
                  disabled={ended || state.lifecycle === "ready"}
                  onClick={() => action({ type: "end" })}
                >
                  إنهاء الجلسة
                </button>
              </div>
              <p className="mt-4 text-xs text-slate-500">
                إعادة الرحلة تمسح نتائج المحاولة وتنتظر الاستعداد. تغيير طريقة
                التحكم يوقف الرحلة مؤقتًا. إعادة تحميل التحكم تستعيد التقدم
                بأمان.
              </p>
            </section>
            {cloud && ["ended", "completed"].includes(state.lifecycle) && (
              <a href="/control/space-pilot" className={button}>
                جلسة جديدة
              </a>
            )}
            {state.summary && (
              <Summary summary={state.summary} title="ملخص الجلسة" />
            )}
            {view.previousSummary && (
              <Summary
                summary={view.previousSummary}
                title={
                  view.previousSummary.reason === "control-reloaded"
                    ? "الجلسة السابقة توقفت عند إعادة تحميل التحكم"
                    : "ملخص الجلسة السابقة"
                }
              />
            )}
            <details className="rounded-2xl border border-slate-200 p-4 text-sm">
              <summary className="cursor-pointer font-bold">
                إعدادات العرض والراحة
              </summary>
              <p className="my-3 text-slate-500">
                اختر جودة الرسوم أو قلّل المؤثرات من شاشة الإعدادات. تفضيل تقليل
                الحركة في الجهاز يُطبّق تلقائيًا. افتح الإعدادات قبل الجلسة،
                وأغلق أي شاشة إضافية لا تحتاجها.
              </p>
              <a
                className="font-bold text-teal-700 underline"
                href={
                  cloud
                    ? `${displayUrl}&settings=1`
                    : displayUrl.replace("#", "?settings=1#")
                }
                target="_blank"
                rel="noopener"
              >
                فتح العرض مع إعدادات المعالج
              </a>
            </details>
            <p className="pb-5 text-center text-xs text-slate-400">
              {cloud
                ? "مزامنة Firebase · سجل حلقات بإصدار مستقل"
                : "جلسة محلية · النافذتان في المتصفح والعنوان نفسيهما"}
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-teal-900">
        {typeof value === "number" ? numberArabic(value) : value}
      </p>
    </div>
  );
}
function Summary({
  summary,
  title,
}: {
  summary: SessionSummary;
  title: string;
}) {
  return (
    <section
      className="rounded-3xl border border-teal-200 bg-teal-50 p-6"
      aria-label={title}
    >
      <h2 className="text-lg font-bold text-teal-950">{title}</h2>
      {summary.curriculumId && (
        <>
          <p data-testid="sp-summary">
            اكتملت {numberArabic(summary.completedMissions)} · تخطّيت{" "}
            {numberArabic(
              summary.stageResults?.filter((r) => r.status === "skipped")
                .length ?? 0,
            )}{" "}
            · بمساعدة{" "}
            {numberArabic(
              summary.stageResults?.filter(
                (r) => r.status === "completed" && r.assisted,
              ).length ?? 0,
            )}{" "}
            من تسع مراحل
          </p>
          <ol className="mt-4 grid gap-2 sm:grid-cols-3">
            {summary.stageResults?.map((r) => (
              <li key={r.stageIndex}>
                {SPACE_STAGES[r.stageIndex].nameAr} ·{" "}
                {r.status === "skipped"
                  ? "متخطاة"
                  : r.assisted
                    ? "اكتملت بمساعدة"
                    : "اكتملت"}{" "}
                · {numberArabic(r.ringsCollected)} حلقة
              </li>
            ))}
          </ol>
        </>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="الحلقات المعروضة" value={summary.ringsPresented} />
        <Metric label="الحلقات المكتملة" value={summary.ringsCollected} />
        <Metric label="الحلقات الفائتة" value={summary.ringsMissed} />
        <Metric label="النيازك المتجنبة" value={summary.asteroidsAvoided} />
        <Metric label="ملامسات النيازك" value={summary.asteroidCollisions} />
        <Metric
          label="نسبة إكمال الحلقات"
          value={
            summary.collectionAccuracy === null
              ? "—"
              : `${numberArabic(Math.round(summary.collectionAccuracy * 100))}٪`
          }
        />
        <Metric label="مجموع النقاط" value={summary.score} />
        <Metric
          label="المهام المكتملة"
          value={`${numberArabic(summary.completedMissions)} من ${numberArabic(summary.curriculumId ? 9 : 3)}`}
        />
      </div>
    </section>
  );
}
