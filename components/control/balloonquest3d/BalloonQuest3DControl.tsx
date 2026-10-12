"use client";
import {
  AdditionalOptions,
  StagePicker,
} from "@/components/control/setup/ProgressiveStages";
import { useLibraryLaunchAdapter } from "@/components/control/library/launch/LibraryLaunchBoundary";

import { useCallback, useEffect, useRef, useState } from "react";
import { BalloonStage } from "@/components/display/balloonquest3d/game/BalloonStage";
import { BalloonQuestScenes } from "@/components/display/balloonquest3d/game/Scenes";
import { GameHud } from "@/components/display/balloonquest3d/game/GameHud";
import {
  arabicNumber,
  DIFFICULTY_AR,
  INPUT_MODE_AR,
  LAYOUT_AR,
  LIFECYCLE_AR,
  SOURCE_AR,
  SUSPEND_AR,
} from "@/lib/balloonquest/arabic";
import { BALLOON_COLOR_DEFS } from "@/lib/balloonquest/colors";
import {
  mountControl,
  readCheckpoint,
  type Checkpoint,
  type ControlHandle,
} from "@/lib/balloonquest/controlMount";
import type { ControlView } from "@/lib/balloonquest/controlRuntime";
import { toDisplayState } from "@/lib/balloonquest/protocol";
import { COLOR_COUNT_BOUNDS, STAGE_SPECS } from "@/lib/balloonquest/stages";
import {
  DIFFICULTIES,
  INPUT_MODES,
  type Difficulty,
  type InputMode,
  type StageNumber,
  type TherapistSettings,
} from "@/lib/balloonquest/types";
import { EXPERIMENTAL_MODES } from "@/lib/balloonquest/input/types";
import { HandInputBridge } from "./HandInputBridge";
import { SimulatorPad } from "./SimulatorPad";

const btn =
  "rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white hover:enabled:bg-teal-800 disabled:cursor-default disabled:opacity-35";
const btnSoft =
  "rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:enabled:bg-slate-50 disabled:cursor-default disabled:opacity-35";
const field =
  "mt-1 block w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm text-slate-800 disabled:opacity-50";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      {children}
      {hint && (
        <span className="mt-1 block text-xs font-normal text-slate-500">
          {hint}
        </span>
      )}
    </label>
  );
}

const SIZE_OPTIONS: Array<[number, string]> = [
  [0.85, "أصغر"],
  [1, "عادي"],
  [1.15, "كبير"],
  [1.3, "أكبر"],
];
const SPEED_OPTIONS: Array<[number, string]> = [
  [0.6, "بطيء جدًا"],
  [0.8, "بطيء"],
  [1, "عادي"],
  [1.2, "أسرع قليلًا"],
  [1.4, "أسرع"],
];
const TOLERANCE_OPTIONS: Array<[number, string]> = [
  [0, "دقيق"],
  [0.15, "عادي"],
  [0.3, "واسع"],
  [0.5, "أوسع"],
];
const COUNT_OPTIONS = [-2, -1, 0, 1, 2];

function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${arabicNumber(Math.floor(total / 60))}:${arabicNumber(total % 60).padStart(2, "٠")}`;
}

/** Production-only behaviour layered on the same panels. Absent in the development prototype. */
export interface ProductionPanelOptions {
  /** Realtime mode needs the child's name (it labels the live record); local mode has no record and does not ask for it. */
  requireChildName: boolean;
  childName: string;
  onChildNameChange(name: string): void;
  /** Replaces the immediate "end session" so the wrapper can collect an end reason first. */
  onRequestEnd(): void;
  /** The development input simulator is hidden in production unless explicitly enabled. */
  showSimulator: boolean;
  /** Input modes offered in the selector (foot / handheld exist only as simulations and are not offered in production). */
  inputModes: readonly InputMode[];
}

interface PanelsProps {
  runtime: ControlHandle["runtime"];
  view: ControlView;
  production?: ProductionPanelOptions;
  previous?: Checkpoint | null;
}

export function ControlPanels({
  runtime,
  view,
  production,
  previous = null,
}: PanelsProps) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [symbols, setSymbols] = useState(false);
  const getSimTimeMs = useCallback(() => runtime.getSimTimeMs(), [runtime]);
  const s = view.session;
  const st = s.settings;
  const projectionRequired = useLibraryLaunchAdapter("balloon-quest", {
    sessionKey: `${s.sessionId}:${s.runId}`,
    modes: ["MANUAL", "RIGHT_HAND", "LEFT_HAND", "DUAL_HAND"],
    apply: (mode) =>
      runtime.command({
        type: "settings",
        patch: {
          inputMode:
            mode === "RIGHT_HAND"
              ? "right-hand"
              : mode === "LEFT_HAND"
                ? "left-hand"
                : mode === "DUAL_HAND"
                  ? "both-hands"
                  : "therapist",
        },
      }),
    projections: ["WALL", "FLOOR"],
    applyProjection: (layout) =>
      s.lifecycle === "ready" &&
      runtime.command({ type: "settings", patch: { layout } }),
  });
  const stage = s.stage;
  const lifecycle = s.lifecycle;
  const startDifficulty = DIFFICULTIES[Math.floor(s.startIndex / 3)];
  const startStage = ((s.startIndex % 3) + 1) as StageNumber;
  const live =
    lifecycle === "playing" ||
    lifecycle === "paused" ||
    lifecycle === "suspended";
  const settable = (patch: Partial<TherapistSettings>) =>
    runtime.command({ type: "settings", patch });
  const bounds =
    COLOR_COUNT_BOUNDS[
      DIFFICULTIES[Math.floor((stage?.index ?? s.startIndex) / 3)]
    ];
  const displayState = toDisplayState(s)!;

  return (
    <>
      <HandInputBridge runtime={runtime} />
      {projectionRequired && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-amber-900">
          اختر الجدار أو الأرضية من «طريقة المشاركة المطلوبة» قبل البدء.
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* ---------- preview + simulator ---------- */}
        <div className="space-y-4">
          <div className="bq3g-preview shadow-md" data-testid="control-preview">
            <BalloonStage
              state={displayState}
              getSimTimeMs={getSimTimeMs}
              showSymbols={symbols}
              onSelect={(id) => runtime.therapistSelect(id)}
            >
              {(lifecycle === "playing" ||
                lifecycle === "paused" ||
                lifecycle === "suspended" ||
                lifecycle === "stage-complete") && (
                <GameHud state={displayState} showSymbols={symbols} />
              )}
              <BalloonQuestScenes state={displayState} />
              <PointerOverlay runtime={runtime} />
            </BalloonStage>
          </div>
          <p className="text-xs text-slate-500">
            هذه معاينة لما يراه الطفل. نقر المعالج على بالون يُحتسب كاختيار
            (أثناء اللعب فقط).
          </p>
          {(!production || production.showSimulator) && (
            <AdditionalOptions title="تشخيص الإدخال ومحاكاة الحركة">
              <SimulatorPad runtime={runtime} />
            </AdditionalOptions>
          )}
        </div>

        {/* ---------- controls ---------- */}
        <div className="space-y-4">
          <section
            className="rounded-2xl border border-slate-200 bg-white p-4"
            aria-label="الحالة"
          >
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span
                className="rounded-full bg-teal-50 px-3 py-1 font-bold text-teal-800"
                data-testid="lifecycle"
              >
                {LIFECYCLE_AR[lifecycle]}
              </span>
              {s.suspendReason && (
                <span
                  className="rounded-full bg-amber-50 px-3 py-1 text-amber-900"
                  data-testid="suspend-reason"
                >
                  {SUSPEND_AR[s.suspendReason]}
                </span>
              )}
              <span
                className={`rounded-full px-3 py-1 ${view.displayReady ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
                data-testid="display-status"
              >
                شاشة العرض: {view.displayReady ? "متصلة" : "غير متصلة"}
              </span>
            </div>
            {stage && (
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-700">
                <dt>المستوى / المرحلة</dt>
                <dd data-testid="level-stage">
                  {DIFFICULTY_AR[displayState.difficulty]} /{" "}
                  {arabicNumber(displayState.stage)}
                </dd>
                <dt>اللون المطلوب</dt>
                <dd className="flex items-center gap-2">
                  <span
                    className="inline-block h-4 w-4 rounded-full border border-slate-400"
                    style={{
                      background: BALLOON_COLOR_DEFS[stage.target].base,
                    }}
                  />
                  {BALLOON_COLOR_DEFS[stage.target].nameAr}
                </dd>
                <dt>التقدم نحو الهدف</dt>
                <dd data-testid="goal">
                  {arabicNumber(stage.goalDone)} من{" "}
                  {arabicNumber(stage.spec.goal)}
                </dd>
                <dt>لمسات ببالونات بلون آخر</dt>
                <dd data-testid="wrong">
                  {arabicNumber(stage.wrongCount)}{" "}
                  <span className="text-xs text-slate-500">
                    (للمعلومة فقط، لا تُخصم)
                  </span>
                </dd>
                <dt>مدة اللعب الفعلية</dt>
                <dd>{formatMs(stage.simTimeMs)}</dd>
                <dt>المراحل المنجزة</dt>
                <dd data-testid="results-count">
                  {arabicNumber(s.results.length)}
                </dd>
              </dl>
            )}
            <div className="mt-3 text-xs text-slate-600">
              مصادر الإدخال:{" "}
              {view.sources.map((x) => (
                <span
                  key={x.sourceId}
                  className="ms-2 inline-block rounded bg-slate-100 px-2 py-0.5"
                  data-testid={`src-${x.sourceId}`}
                >
                  {SOURCE_AR[x.sourceId]}:{" "}
                  {x.state === "tracking"
                    ? "نشط"
                    : x.state === "stale"
                      ? "منقطع"
                      : x.state === "hidden"
                        ? "مخفي"
                        : "بانتظار"}
                </span>
              ))}
            </div>
            {view.lastRefusal && (
              <p
                className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900"
                role="alert"
                data-testid="refusal"
              >
                {view.lastRefusal}
              </p>
            )}
            {previous &&
              lifecycle === "ready" &&
              previous.lifecycle !== "completed" &&
              previous.lifecycle !== "ended" && (
                <p className="mt-2 text-xs text-slate-500">
                  جلسة سابقة لم تكتمل (وصلت إلى المرحلة{" "}
                  {arabicNumber(previous.stageIndex + 1)} من ٩).
                </p>
              )}
          </section>

          <section
            className="rounded-2xl border border-slate-200 bg-white p-4"
            aria-label="التحكم بالجلسة"
          >
            <div className="flex flex-wrap gap-2">
              {lifecycle === "ready" && (
                <button
                  type="button"
                  className={btn}
                  disabled={
                    projectionRequired ||
                    (!!production &&
                      production.requireChildName &&
                      production.childName.trim().length === 0)
                  }
                  onClick={() => runtime.command({ type: "start" })}
                  data-testid="start"
                >
                  ابدأ
                </button>
              )}
              {lifecycle === "playing" && (
                <button
                  type="button"
                  className={btn}
                  onClick={() => runtime.command({ type: "pause" })}
                  data-testid="pause"
                >
                  إيقاف مؤقت
                </button>
              )}
              {(lifecycle === "paused" || lifecycle === "suspended") && (
                <button
                  type="button"
                  className={btn}
                  onClick={() => runtime.command({ type: "resume" })}
                  data-testid="resume"
                >
                  استئناف
                </button>
              )}
              {lifecycle === "stage-complete" && (
                <button
                  type="button"
                  className={btn}
                  onClick={() => runtime.command({ type: "advance" })}
                  data-testid="advance"
                >
                  المرحلة التالية
                </button>
              )}
              <button
                type="button"
                className={btnSoft}
                disabled={!live}
                onClick={() => runtime.command({ type: "restart" })}
                data-testid="restart"
              >
                إعادة المرحلة
              </button>
              <button
                type="button"
                className={btnSoft}
                disabled={!live}
                onClick={() => runtime.command({ type: "skip" })}
                data-testid="skip"
              >
                تخطي المرحلة
              </button>
              {!confirmEnd ? (
                <button
                  type="button"
                  className={btnSoft}
                  disabled={lifecycle === "completed" || lifecycle === "ended"}
                  onClick={() =>
                    production ? production.onRequestEnd() : setConfirmEnd(true)
                  }
                  data-testid="end"
                >
                  إنهاء الجلسة
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white"
                    onClick={() => {
                      runtime.command({ type: "end" });
                      setConfirmEnd(false);
                    }}
                    data-testid="end-confirm"
                  >
                    تأكيد الإنهاء
                  </button>
                  <button
                    type="button"
                    className={btnSoft}
                    onClick={() => setConfirmEnd(false)}
                  >
                    تراجع
                  </button>
                </>
              )}
              {(lifecycle === "completed" || lifecycle === "ended") && (
                <>
                  <button
                    type="button"
                    className={btn}
                    onClick={() => runtime.command({ type: "new-run" })}
                    data-testid="new-run"
                  >
                    جولة جديدة (نفس الجلسة)
                  </button>
                  <button
                    type="button"
                    className={btnSoft}
                    onClick={() =>
                      runtime.command({
                        type: "new-session",
                        difficulty: startDifficulty,
                        stage: startStage,
                      })
                    }
                    data-testid="new-session"
                  >
                    جلسة جديدة
                  </button>
                </>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-700">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={symbols}
                  onChange={(e) => setSymbols(e.target.checked)}
                />{" "}
                إظهار رموز الأشكال (للتمييز بدون الألوان)
              </label>
            </div>
          </section>

          <section
            className="rounded-2xl border border-slate-200 bg-white p-4"
            aria-label="الإعدادات"
          >
            <h2 className="mb-3 text-base font-extrabold text-slate-800">
              الإعدادات
            </h2>

            {production?.requireChildName && (
              <div className="mb-3">
                <Field
                  label="اسم الطفل"
                  hint="مطلوب لبدء الجلسة (حتى ٣٠ حرفًا)"
                >
                  <input
                    className={field}
                    value={production.childName}
                    maxLength={30}
                    onChange={(e) =>
                      production.onChildNameChange(e.target.value)
                    }
                    data-testid="child-name"
                  />
                </Field>
              </div>
            )}
            <div hidden aria-hidden="true">
              {" "}
              <Field label="المستوى">
                <select
                  className={field}
                  disabled={lifecycle !== "ready"}
                  value={startDifficulty}
                  onChange={(e) =>
                    runtime.command({
                      type: "start-at",
                      difficulty: e.target.value as Difficulty,
                      stage: startStage,
                    })
                  }
                  data-testid="sel-difficulty"
                >
                  {DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {DIFFICULTY_AR[d]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="المرحلة">
                <select
                  className={field}
                  disabled={lifecycle !== "ready"}
                  value={startStage}
                  onChange={(e) =>
                    runtime.command({
                      type: "start-at",
                      difficulty: startDifficulty,
                      stage: Number(e.target.value) as StageNumber,
                    })
                  }
                  data-testid="sel-stage"
                >
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {arabicNumber(n)} — الهدف{" "}
                      {arabicNumber(
                        STAGE_SPECS[Math.floor(s.startIndex / 3) * 3 + n - 1]
                          .goal,
                      )}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <StagePicker
                  value={s.startIndex}
                  disabled={lifecycle !== "ready"}
                  items={STAGE_SPECS.map((spec, index) => ({
                    value: index,
                    label: `${DIFFICULTY_AR[DIFFICULTIES[Math.floor(index / 3)]]} · الهدف ${arabicNumber(spec.goal)}`,
                    description:
                      spec.motion === "static"
                        ? "بالونات ثابتة لتعلّم اللون واللمس"
                        : `بالونات صاعدة · ${spec.colors} ألوان`,
                  }))}
                  onSelect={(value) => {
                    const index = Number(value);
                    runtime.command({
                      type: "start-at",
                      difficulty: DIFFICULTIES[Math.floor(index / 3)],
                      stage: ((index % 3) + 1) as StageNumber,
                    });
                  }}
                />
              </div>
              <AdditionalOptions>
                <Field label="نطاق الجلسة">
                  <select
                    className={field}
                    value={st.scope}
                    onChange={(e) =>
                      settable({
                        scope: e.target.value as TherapistSettings["scope"],
                      })
                    }
                    data-testid="sel-scope"
                  >
                    <option value="all">
                      كل المراحل حتى النهاية (٩ كحد أقصى)
                    </option>
                    <option value="level">هذا المستوى فقط (٣ مراحل)</option>
                  </select>
                </Field>
                <Field label="حجم البالونات">
                  <select
                    className={field}
                    value={st.sizeScale}
                    onChange={(e) =>
                      settable({ sizeScale: Number(e.target.value) })
                    }
                    data-testid="sel-size"
                  >
                    {SIZE_OPTIONS.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="عدد البالونات معًا"
                  hint="بالنسبة للعدد الافتراضي للمرحلة"
                >
                  <select
                    className={field}
                    value={st.countOffset}
                    onChange={(e) =>
                      settable({ countOffset: Number(e.target.value) })
                    }
                    data-testid="sel-count"
                  >
                    {COUNT_OPTIONS.map((v) => (
                      <option key={v} value={v}>
                        {v === 0
                          ? "الافتراضي"
                          : v > 0
                            ? `+${arabicNumber(v)}`
                            : `−${arabicNumber(-v)}`}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="عدد الألوان"
                  hint={`حدود هذا المستوى: ${arabicNumber(bounds.min)}–${arabicNumber(bounds.max)}`}
                >
                  <select
                    className={field}
                    value={st.colorCount ?? ""}
                    onChange={(e) =>
                      settable({
                        colorCount:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    data-testid="sel-colors"
                  >
                    <option value="">الافتراضي</option>
                    {Array.from(
                      { length: bounds.max - bounds.min + 1 },
                      (_, i) => bounds.min + i,
                    ).map((n) => (
                      <option key={n} value={n}>
                        {arabicNumber(n)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="دقة اللمس (هامش التلامس)">
                  <select
                    className={field}
                    value={st.contactTolerance}
                    onChange={(e) =>
                      settable({ contactTolerance: Number(e.target.value) })
                    }
                    data-testid="sel-tolerance"
                  >
                    {TOLERANCE_OPTIONS.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
              </AdditionalOptions>

              <Field label="سرعة الصعود" hint="للمستويين المتوسط والمتقدم">
                <select
                  className={field}
                  value={st.speedScale}
                  onChange={(e) =>
                    settable({ speedScale: Number(e.target.value) })
                  }
                  data-testid="sel-speed"
                >
                  {SPEED_OPTIONS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="العرض">
                <select
                  className={field}
                  value={st.layout}
                  onChange={(e) =>
                    settable({
                      layout: e.target.value as TherapistSettings["layout"],
                    })
                  }
                  data-testid="sel-layout"
                >
                  {(
                    Object.keys(LAYOUT_AR) as Array<keyof typeof LAYOUT_AR>
                  ).map((l) => (
                    <option key={l} value={l}>
                      {LAYOUT_AR[l]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="طريقة الإدخال"
                hint={
                  EXPERIMENTAL_MODES.includes(st.inputMode)
                    ? "تجريبي: لم يُتحقق منه على أجهزة حقيقية."
                    : undefined
                }
              >
                <select
                  className={field}
                  value={st.inputMode}
                  onChange={(e) =>
                    settable({ inputMode: e.target.value as InputMode })
                  }
                  data-testid="sel-input"
                >
                  {(production?.inputModes ?? INPUT_MODES).map((m) => (
                    <option key={m} value={m}>
                      {INPUT_MODE_AR[m]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <AdditionalOptions title="الراحة وتشخيص التشغيل">
              {" "}
              <div className="mt-3 grid gap-2 text-sm text-slate-700">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={st.reducedMotion}
                    onChange={(e) =>
                      settable({ reducedMotion: e.target.checked })
                    }
                    data-testid="chk-reduced"
                  />{" "}
                  تقليل الحركة (بالونات ثابتة بدون تأرجح)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={st.autoAdvance}
                    onChange={(e) =>
                      settable({ autoAdvance: e.target.checked })
                    }
                    data-testid="chk-auto"
                  />{" "}
                  الانتقال التلقائي بعد إكمال المرحلة
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={st.allowNoDisplay}
                    onChange={(e) =>
                      settable({ allowNoDisplay: e.target.checked })
                    }
                    data-testid="chk-nodisplay"
                  />{" "}
                  السماح بالتشغيل بدون شاشة عرض (معاينة فقط)
                </label>
              </div>
            </AdditionalOptions>
          </section>

          {s.summary && (
            <section
              className="rounded-2xl border border-teal-200 bg-teal-50 p-4"
              aria-label="الملخص"
              data-testid="summary"
            >
              <h2 className="text-base font-extrabold text-teal-900">
                ملخص الجلسة
              </h2>
              <p className="mt-1 text-sm text-teal-900">
                {s.summary.reason === "completed"
                  ? "اكتملت الجلسة"
                  : "أنهى المعالج الجلسة"}{" "}
                — مراحل مكتملة {arabicNumber(s.summary.completedStages)} · المدة{" "}
                {formatMs(s.summary.activeMs)}
              </p>
              <AdditionalOptions title="تفاصيل الأداء والمراحل">
                <p>
                  مراحل متخطاة {arabicNumber(s.summary.skippedStages)} ·
                  اختيارات صحيحة {arabicNumber(s.summary.totalCorrect)} · لمسات
                  أخرى {arabicNumber(s.summary.totalWrongContacts)} (لا تُخصم) ·
                  إعادة مراحل {arabicNumber(s.summary.restarts)}
                </p>
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="text-start text-slate-600">
                      <th className="text-start">المرحلة</th>
                      <th className="text-start">الحالة</th>
                      <th className="text-start">الصحيح</th>
                      <th className="text-start">لمسات أخرى</th>
                      <th className="text-start">المدة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.summary.stages.map((r) => (
                      <tr key={r.index} className="border-t border-teal-100">
                        <td>
                          {DIFFICULTY_AR[r.difficulty]} {arabicNumber(r.stage)}
                        </td>
                        <td>
                          {r.status === "completed" ? "اكتملت" : "تم تخطيها"}
                        </td>
                        <td>
                          {arabicNumber(r.correct)} من {arabicNumber(r.goal)}
                        </td>
                        <td>{arabicNumber(r.wrongContacts)}</td>
                        <td>{formatMs(r.activeMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AdditionalOptions>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

export function BalloonQuest3DControl() {
  const [view, setView] = useState<ControlView | null>(null);
  const [handle, setHandle] = useState<ControlHandle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(true);
  const [previous, setPrevious] = useState<Checkpoint | null>(null);

  useEffect(() => {
    queueMicrotask(() => setPrevious(readCheckpoint(sessionStorage)));
    return mountControl({
      onView: setView,
      onReady: (h) => {
        setHandle(h);
        setView(h.runtime.view());
      },
      onWaiting: setWaiting,
      onError: setError,
    });
  }, []);

  const runtime = handle?.runtime ?? null;
  if (error)
    return (
      <Shell>
        <p className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>
      </Shell>
    );
  if (!runtime || !view) {
    return (
      <Shell>
        <p className="text-slate-600">
          {waiting ? "بانتظار تحرير نافذة التحكم الأخرى…" : "جاري التحضير…"}
        </p>
      </Shell>
    );
  }
  return (
    <Shell>
      <ControlPanels runtime={runtime} view={view} previous={previous} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-50 text-slate-900"
      data-testid="bq-control"
    >
      <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
        <header>
          <h1 className="text-xl font-extrabold text-slate-900">
            مغامرة البالونات ثلاثية الأبعاد — واجهة تجريبية
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            للتطوير فقط: لا تُخزَّن بيانات مرضى، ولا تُكتب في Firebase. افتح
            شاشة العرض في نافذة أخرى:{" "}
            <code dir="ltr">/display/balloon-quest-3d-prototype</code>
          </p>
        </header>
        {children}
      </div>
    </main>
  );
}

/** Shows fresh pointers on the therapist preview (dev aid). Updated straight on the DOM, never via React state. */
function PointerOverlay({ runtime }: { runtime: ControlHandle["runtime"] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const dots = new Map<string, HTMLSpanElement>();
    const loop = () => {
      const root = ref.current;
      if (root) {
        const now = performance.now();
        const seen = new Set<string>();
        for (const p of runtime.hub.fresh(now)) {
          seen.add(p.sourceId);
          let d = dots.get(p.sourceId);
          if (!d) {
            d = document.createElement("span");
            d.className = "bq3g-pointer";
            d.dataset.source = p.sourceId;
            root.appendChild(d);
            dots.set(p.sourceId, d);
          }
          d.style.display = "block";
          d.style.left = `${p.x * 100}%`;
          d.style.top = `${p.y * 100}%`;
        }
        for (const [id, d] of dots) if (!seen.has(id)) d.style.display = "none";
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [runtime]);
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-0"
      aria-hidden="true"
    />
  );
}
