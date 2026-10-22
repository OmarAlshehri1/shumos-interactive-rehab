"use client";
import { ControlSlot } from "@/components/control/ui/ControlWorkspace";
import { NativeSetupSections } from "@/components/control/setup/GameSetupLayout";
import {
  AdditionalOptions,
  StagePicker,
} from "@/components/control/setup/ProgressiveStages";
import { useLibraryLaunchAdapter } from "@/components/control/library/launch/LibraryLaunchBoundary";

import { useEffect, useState } from "react";
import { PhysicalRole } from "@/lib/physicalInput/types";
import {
  DIFFICULTY_AR,
  GAME_NAME_AR,
  GAME_NAME_EN,
  HINT_AR,
  LEVEL3_AR,
  LIFECYCLE_AR,
  PROJECTION_AR,
  PROJECTION_NOTE_AR,
  SOURCE_AR,
  SOURCE_NOTE_AR,
  SUSPEND_AR,
  TOLERANCE_AR,
} from "@/lib/runnerquest3d/arabic";
import {
  mountControl,
  readCheckpoint,
  type ControlHandle,
} from "@/lib/runnerquest3d/controlMount";
import type {
  Command,
  ControlRuntime,
  ControlView,
} from "@/lib/runnerquest3d/controlRuntime";
import { STAGES } from "@/lib/runnerquest3d/stages";
import {
  INPUT_SOURCES,
  PROJECTIONS,
  SPACING_RANGE,
  SPEED_RANGE,
  UNVALIDATED_SOURCES,
  type FloorCalibration,
  type InputSourceId,
  type Level3,
  type Projection,
  type TherapistSettings,
} from "@/lib/runnerquest3d/types";
import styles from "./control.module.css";
import { FloorCalibrationCard, FloorMapPanel } from "./FloorControlPanel";

const LEVELS: Level3[] = ["low", "normal", "high"];
const SPEED_PRESETS: Array<[string, number]> = [
  ["بطيء جدًا", 1.5],
  ["بطيء", 2.4],
  ["عادي", 3.2],
  ["أسرع", 4],
];
const FOOT_ROLES: Array<
  [PhysicalRole.RIGHT_FOOT | PhysicalRole.LEFT_FOOT, string]
> = [
  [PhysicalRole.RIGHT_FOOT as PhysicalRole.RIGHT_FOOT, "القدم اليمنى (محاكاة)"],
  [PhysicalRole.LEFT_FOOT as PhysicalRole.LEFT_FOOT, "القدم اليسرى (محاكاة)"],
];

export interface ControlPanelOptions {
  /** Where the child's Display lives. */
  displayHref?: string;
  /** Production: a child name is required before anything is published to the Display. */
  requireChildName?: boolean;
  childName?: string;
  onChildNameChange?: (n: string) => void;
  /** Production: opens the shared end-of-session reason sheet instead of ending immediately. */
  onRequestEnd?: () => void;
  /** Show the sensor simulator panel (development only). */
  showSimulator?: boolean;
  /** Input sources offered in the selector. */
  inputSources?: readonly InputSourceId[];
  /** The Display is a separate device reached through Firebase (no BroadcastChannel acknowledgement). */
  crossDevice?: boolean;
  publishError?: boolean;
}

/** Everything the therapist sees and touches. Rendered by the development page and by the production screen. */
export function RunnerControlPanels({
  runtime,
  view,
  options = {},
}: {
  runtime: ControlRuntime;
  view: ControlView;
  options?: ControlPanelOptions;
}) {
  const [rangeMode, setRangeMode] = useState<"single" | "to-end">("to-end");
  const [connected, setConnected] = useState({
    RIGHT_FOOT: true,
    LEFT_FOOT: true,
  });
  const {
    displayHref = "/display/runner-quest-3d-prototype",
    requireChildName = false,
    childName = "",
    showSimulator = true,
    inputSources = INPUT_SOURCES,
    crossDevice = false,
  } = options;
  const s = view.session,
    st = s.stage,
    set = s.settings,
    lc = s.lifecycle;
  const spec = st ? STAGES[st.index] : null;
  const pct = st ? Math.round((st.distance / st.length) * 100) : 0;
  const idle = lc === "ready" || lc === "completed" || lc === "ended";
  const canEditStage =
    lc === "ready" || lc === "paused" || lc === "completed" || lc === "ended";
  const unvalidated = UNVALIDATED_SOURCES.includes(set.inputSource);
  const playing = lc === "playing";
  const nameMissing = requireChildName && childName.trim().length === 0;
  /** Commands carry the identity the therapist was looking at, so a stale tap on an older run is refused. */
  const run = (cmd: Command) =>
    runtime.command(cmd, { sessionEpoch: s.sessionEpoch, runId: s.runId });
  const patch = (p: Partial<TherapistSettings>) =>
    run({ type: "settings", patch: p });
  const floorMode = s.projection === "FLOOR" && !!st?.floor;
  // The therapist must pick the projection explicitly (here or in the library launch panel) before a session may start.
  const [confirmedSession, setConfirmedSession] = useState<string | null>(null);
  const projectionConfirmed = confirmedSession === s.sessionId;
  const canPickProjection =
    lc === "ready" && s.results.length === 0 && s.stageIndex === s.startIndex;
  const chooseProjection = (value: Projection) => {
    const ok = run({ type: "projection", value });
    if (ok) setConfirmedSession(s.sessionId);
    return ok;
  };
  useLibraryLaunchAdapter("runner-quest-3d", {
    sessionKey: s.sessionId,
    modes: ["MANUAL"],
    apply: () => patch({ inputSource: "MANUAL" }),
    projections: ["WALL", "FLOOR"],
    applyProjection: chooseProjection,
  });
  const projectionRequired = !projectionConfirmed; // an explicit pick here, or through the library launch panel (which calls chooseProjection)
  const patchFloor = (p: Partial<FloorCalibration>) =>
    patch({ floor: { ...set.floor, ...p } });
  const stageRange = (idx: number) =>
    run({ type: "range", from: idx, to: rangeMode === "single" ? idx : 8 });
  const endNow = () =>
    options.onRequestEnd ? options.onRequestEnd() : run({ type: "end" });
  const sensorLost = lc === "suspended" && s.suspendReason === "input-lost";

  const setupStages = (
    <section className={styles.card}>
      <h2>المراحل</h2>
      <AdditionalOptions title="نطاق النشاط">
        {" "}
        <div className={styles.row}>
          <button
            className={`${styles.chip} ${rangeMode === "single" ? styles.chipOn : ""}`}
            data-testid="range-single"
            onClick={() => setRangeMode("single")}
          >
            مرحلة واحدة
          </button>
          <button
            className={`${styles.chip} ${rangeMode === "to-end" ? styles.chipOn : ""}`}
            data-testid="range-end"
            onClick={() => setRangeMode("to-end")}
          >
            من المرحلة المختارة حتى النهاية
          </button>
        </div>
      </AdditionalOptions>
      <StagePicker
        value={s.stageIndex}
        disabled={!canEditStage}
        items={STAGES.map((stage, index) => ({
          value: index,
          label: stage.titleAr,
          description: stage.objectiveAr,
        }))}
        onSelect={(value) => stageRange(Number(value))}
      />
      <div className={styles.note}>
        لا ترتفع الصعوبة تلقائيًا: ينتقل اللعب إلى المرحلة التالية فقط عندما
        تضغط «المرحلة التالية».
      </div>
    </section>
  );
  const setupSettings = (
    <section className={styles.card}>
      <h2>إعدادات الأخصائي</h2>
      <ControlSlot slot="settings"><div className={styles.field}>
        <label className={styles.label}>مصدر الإدخال</label>
        <select
          data-testid="input-source"
          value={set.inputSource}
          disabled={playing}
          onChange={(e) =>
            patch({ inputSource: e.target.value as InputSourceId })
          }
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            fontSize: 16,
          }}
        >
          {inputSources.map((i) => (
            <option key={i} value={i}>
              {SOURCE_AR[i]}
              {UNVALIDATED_SOURCES.includes(i) ? " — تجريبي" : ""}
            </option>
          ))}
        </select>
        <div className={styles.note}>{SOURCE_NOTE_AR[set.inputSource]}</div>
        {unvalidated && (
          <div className={styles.warn}>
            وضع حسّاسات القدم تجريبي ولم يُختبر على أجهزة فعلية. التحكم اليدوي
            باللمس يبقى متاحًا ويُستخدم عند انقطاع الحسّاس.
          </div>
        )}
      </div></ControlSlot>
      {!floorMode && (
        <>
          <ControlSlot slot="settings"><div className={styles.field}>
            <label className={styles.label}>
              السرعة الأمامية: {set.speed.toFixed(1)} م/ث
            </label>
            <div className={styles.row}>
              {SPEED_PRESETS.map(([n, v]) => (
                <button
                  key={n}
                  className={`${styles.chip} ${Math.abs(set.speed - v) < 0.05 ? styles.chipOn : ""}`}
                  style={{ minHeight: 44 }}
                  onClick={() => patch({ speed: v })}
                >
                  {n}
                </button>
              ))}
            </div>
            <input
              className={styles.slider}
              type="range"
              data-testid="speed"
              min={SPEED_RANGE.min}
              max={SPEED_RANGE.max}
              step={0.1}
              value={set.speed}
              onChange={(e) => patch({ speed: Number(e.target.value) })}
            />
          </div></ControlSlot>
          <ControlSlot slot="settings"><div className={styles.field}>
            <label className={styles.label}>
              المسافة بين العوائق: ×{set.spacing.toFixed(1)}{" "}
              {lc !== "ready" && (
                <span style={{ opacity: 0.6 }}>
                  (تُطبَّق في المرحلة التالية أو عند إعادتها)
                </span>
              )}
            </label>
            <input
              className={styles.slider}
              type="range"
              data-testid="spacing"
              min={SPACING_RANGE.min}
              max={SPACING_RANGE.max}
              step={0.1}
              value={set.spacing}
              onChange={(e) => patch({ spacing: Number(e.target.value) })}
            />
          </div></ControlSlot>
        </>
      )}
      <div className={styles.field}>
        <label className={styles.label}>حساسية الحركة (للحسّاسات)</label>
        <div className={styles.row}>
          {LEVELS.map((l) => (
            <button
              key={l}
              className={`${styles.chip} ${set.sensitivity === l ? styles.chipOn : ""}`}
              style={{ minHeight: 44 }}
              data-testid={`sens-${l}`}
              onClick={() => patch({ sensitivity: l })}
            >
              {LEVEL3_AR[l]}
            </button>
          ))}
        </div>
        <div className={styles.note}>عالية = تكفي حركة أصغر لتُحتسب.</div>
      </div>
      <div className={styles.field}>
        <label className={styles.label}>تسامح اكتشاف الحركة</label>
        <div className={styles.row}>
          {LEVELS.map((l) => (
            <button
              key={l}
              className={`${styles.chip} ${set.tolerance === l ? styles.chipOn : ""}`}
              style={{ minHeight: 44 }}
              data-testid={`tol-${l}`}
              onClick={() => patch({ tolerance: l })}
            >
              {TOLERANCE_AR[l]}
            </button>
          ))}
        </div>
        <div className={styles.note}>
          الواسع يمنح الطفل وقتًا أطول لرفع القدم ويقبل حركة أبطأ.
        </div>
      </div>
      {!floorMode && (
        <label className={styles.field} style={{ display: "block" }}>
          <input
            type="checkbox"
            data-testid="foot-lift"
            checked={set.footLiftRequired}
            onChange={(e) => patch({ footLiftRequired: e.target.checked })}
          />{" "}
          يتطلّب رفع القدم لتخطّي الحواجز{" "}
          <div className={styles.note}>
            عند الإلغاء يتخطّى العدّاء الحواجز تلقائيًا.
          </div>
        </label>
      )}
      {!floorMode && (
        <label className={styles.field} style={{ display: "block" }}>
          <input
            type="checkbox"
            data-testid="pause-before"
            checked={set.pauseBeforeObstacle}
            onChange={(e) => patch({ pauseBeforeObstacle: e.target.checked })}
          />{" "}
          التوقّف قبل العائق بمسافة كبيرة{" "}
          <div className={styles.note}>
            يتوقف العدّاء ويستمر فقط عندما يكون الطريق آمنًا.
          </div>
        </label>
      )}
      <label className={styles.field} style={{ display: "block" }}>
        <input
          type="checkbox"
          data-testid="reduced"
          checked={set.reducedMotion}
          onChange={(e) => patch({ reducedMotion: e.target.checked })}
        />{" "}
        تقليل الحركة{" "}
        <div className={styles.note}>
          يوقف الجسيمات والغيوم المتحركة ويخفّف حركة الكاميرا.
        </div>
      </label>
      <div className={styles.row}>
        <ControlSlot slot="assistance"><button
          className={styles.bigBtn}
          style={{ minHeight: 48 }}
          data-testid="recenter"
          onClick={() => run({ type: "recenter" })}
        >
          إعادة ضبط وضع الراحة
        </button></ControlSlot>
      </div>
    </section>
  );
  const setupProjection = (
    <section
      className={styles.card}
      data-testid="projection-card"
      data-projection={s.projection}
    >
      <h2>
        سطح العرض{" "}
        <span className={styles.badge}>{PROJECTION_AR[s.projection]}</span>
      </h2>
      <div className={styles.projGrid}>
        {PROJECTIONS.map((p) => (
          <button
            key={p}
            type="button"
            className={`${styles.projBtn} ${s.projection === p ? styles.projOn : ""}`}
            data-testid={`projection-${p}`}
            aria-pressed={s.projection === p}
            disabled={!canPickProjection}
            onClick={() => chooseProjection(p)}
          >
            {PROJECTION_AR[p]}
            <small>{PROJECTION_NOTE_AR[p]}</small>
          </button>
        ))}
      </div>
      {canPickProjection && projectionRequired && (
        <div className={styles.warn} data-testid="projection-required">
          اختر العرض الجداري أو الأرضي لتتمكن من البدء. لا يمكن تغييره بعد بدء
          الجلسة.
        </div>
      )}
      {!canPickProjection && (
        <div className={styles.note}>
          يُحدَّد سطح العرض قبل بدء الجلسة فقط. لتغييره أنهِ الجلسة وابدأ جلسة
          جديدة.
        </div>
      )}
    </section>
  );
  const setupIdentity = requireChildName ? (
    <section className={styles.card}>
      <label className={styles.label} htmlFor="rq-child-name">
        اسم الطفل (يظهر في الجلسة)
      </label>
      <input
        id="rq-child-name"
        data-testid="child-name"
        className={styles.nameInput}
        value={childName}
        maxLength={30}
        onChange={(e) => options.onChildNameChange?.(e.target.value)}
        placeholder="اكتب الاسم الأول للطفل"
        autoComplete="off"
      />
      {nameMissing && (
        <div className={styles.note}>
          لن تُرسل اللعبة إلى شاشة العرض قبل كتابة الاسم.
        </div>
      )}
    </section>
  ) : null;
  if (lc === "ready" && !s.results.length)
    return (
      <div
        className={styles.wrap}
        data-testid="rq3d-control"
        data-lifecycle={lc}
      >
        <NativeSetupSections
          settings={
            <div>
              {setupIdentity && <ControlSlot slot="settings">{setupIdentity}</ControlSlot>}
              {setupProjection}
              {setupSettings}
            </div>
          }
          stages={setupStages}
          start={
            <ControlSlot slot="session"><button
              type="button"
              data-testid="start"
              disabled={!view.canStart || nameMissing || projectionRequired}
              onClick={() => run({ type: "start" })}
            >
              ابدأ النشاط
            </button></ControlSlot>
          }
        />
      </div>
    );
  return (
    <div className={styles.wrap} data-testid="rq3d-control" data-lifecycle={lc}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>
            {GAME_NAME_AR}{" "}
            <span style={{ fontWeight: 400, opacity: 0.6, fontSize: 18 }}>
              — {GAME_NAME_EN}
            </span>
          </h1>
          <p className={styles.sub}>
            {crossDevice
              ? "تحكّم من هذا الجهاز؛ تظهر اللعبة للطفل على شاشة العرض في الجهاز الآخر."
              : "جلسة محلية تجريبية — لا تُحفظ في سجل المريض."}{" "}
            حسّاسات القدم الفعلية لم تُختبر بعد.
          </p>
        </div>
        <div className={styles.row}>
          <span
            className={`${styles.badge} ${view.displayReady ? styles.badgeOk : styles.badgeBad}`}
            data-testid="display-status"
          >
            {view.displayReady
              ? crossDevice
                ? "شاشة العرض متصلة"
                : `شاشة العرض متصلة (${view.displays})`
              : "شاشة العرض غير متصلة"}
          </span>
          <span
            className={`${styles.badge} ${view.inputOk ? styles.badgeOk : styles.badgeBad}`}
            data-testid="input-status"
          >
            {view.inputOk
              ? view.inputReady
                ? "الإدخال جاهز"
                : "الإدخال يستقر…"
              : view.sensorBypass
                ? "الحسّاس مفقود — تحكم يدوي"
                : "لا يوجد إدخال"}
          </span>
          <span className={styles.badge} data-testid="lifecycle">
            {LIFECYCLE_AR[lc]}
          </span>
          {options.publishError && (
            <span
              className={`${styles.badge} ${styles.badgeBad}`}
              data-testid="publish-error"
            >
              تعذّر إرسال الحالة — إعادة المحاولة…
            </span>
          )}
          {!crossDevice && (
            <a
              className={styles.btn}
              href={displayHref}
              target="_blank"
              rel="noreferrer"
            >
              افتح شاشة العرض
            </a>
          )}
        </div>
      </div>

      {requireChildName && setupIdentity}

      {view.lastRefusal && (
        <div className={styles.warn} data-testid="refusal">
          {view.lastRefusal}
        </div>
      )}
      {lc === "suspended" && s.suspendReason && (
        <div className={styles.warn} data-testid="suspend-reason">
          {SUSPEND_AR[s.suspendReason]}
        </div>
      )}
      {sensorLost && (
        <div className={styles.warn} data-testid="sensor-lost-banner">
          انقطع الحسّاس لكن الجلسة محفوظة. يمكنك المتابعة الآن بالتحكم اليدوي من
          هذه الشاشة، أو الانتظار حتى يعود الحسّاس.
          <div className={styles.bigRow} style={{ marginTop: 8 }}>
            <ControlSlot slot="assistance"><button
              className={`${styles.bigBtn} ${styles.bigPrimary}`}
              data-testid="continue-manually"
              onClick={() => run({ type: "continue-manually" })}
            >
              متابعة يدويًا
            </button></ControlSlot>
          </div>
        </div>
      )}

      <div className={styles.grid}>
        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          {setupProjection}

          <section className={styles.card}>
            <h2>اللعبة الآن</h2>
            {spec && st && (
              <>
                <div style={{ fontWeight: 700, fontSize: 18 }}>
                  المرحلة {st.index + 1} من 9 — {spec.titleAr}
                </div>
                <div className={styles.note}>
                  {DIFFICULTY_AR[spec.difficulty]} · {spec.objectiveAr}
                </div>
                <div className={styles.bar}>
                  <div
                    className={styles.barFill}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className={styles.stat}>
                  <div className={styles.statCell}>
                    <div className={styles.statNum} data-testid="stars">
                      {st.stars}
                    </div>
                    <div className={styles.statLbl}>نجوم</div>
                  </div>
                  <div className={styles.statCell}>
                    <div className={styles.statNum} data-testid="progress">
                      {pct}%
                    </div>
                    <div className={styles.statLbl}>التقدّم</div>
                  </div>
                  <div className={styles.statCell}>
                    <div className={styles.statNum} data-testid="holds">
                      {floorMode ? st.assists : st.holds}
                    </div>
                    <div className={styles.statLbl}>
                      {floorMode ? "مساعدات" : "وقفات"}
                    </div>
                  </div>
                  <div className={styles.statCell}>
                    <div className={styles.statNum}>
                      {st.obstacles.filter((o) => o.resolved).length}/
                      {st.obstacles.length}
                    </div>
                    <div className={styles.statLbl}>
                      {floorMode ? "أهداف" : "عوائق"}
                    </div>
                  </div>
                </div>
                {st.hint && playing && (
                  <div className={styles.note}>
                    التلميح المعروض للطفل: {HINT_AR[st.hint]}
                  </div>
                )}
                {st.holding && (
                  <div className={styles.note} data-testid="holding">
                    العدّاء ينتظر أمام العائق — حرّكه أو اضغط «تجاوز العائق».
                  </div>
                )}
              </>
            )}
            <div className={styles.bigRow} style={{ marginTop: 12 }}>
              {lc === "ready" && (
                <ControlSlot slot="session"><button
                  className={`${styles.bigBtn} ${styles.bigPrimary}`}
                  data-testid="start"
                  disabled={!view.canStart || nameMissing || projectionRequired}
                  onClick={() => run({ type: "start" })}
                >
                  ابدأ
                </button></ControlSlot>
              )}
              {playing && (
                <ControlSlot slot="session"><button
                  className={styles.bigBtn}
                  data-testid="pause"
                  onClick={() => run({ type: "pause" })}
                >
                  إيقاف مؤقت
                </button></ControlSlot>
              )}
              {(lc === "paused" || lc === "suspended") && (
                <ControlSlot slot="session"><button
                  className={`${styles.bigBtn} ${styles.bigPrimary}`}
                  data-testid="resume"
                  onClick={() => run({ type: "resume" })}
                >
                  استئناف
                </button></ControlSlot>
              )}
              {lc === "stage-complete" && (
                <ControlSlot slot="settings"><button
                  className={`${styles.bigBtn} ${styles.bigPrimary}`}
                  data-testid="advance"
                  onClick={() => run({ type: "advance" })}
                >
                  المرحلة التالية
                </button></ControlSlot>
              )}
              {(playing || lc === "paused") && !floorMode && st?.holding && (
                <ControlSlot slot="assistance"><button
                  className={`${styles.bigBtn} ${styles.bigWarn}`}
                  data-testid="assist"
                  onClick={() => run({ type: "assist" })}
                >
                  تجاوز العائق (مساعدة)
                </button></ControlSlot>
              )}
              {!idle && lc !== "stage-complete" && (
                <ControlSlot slot="assistance"><button
                  className={styles.bigBtn}
                  data-testid="skip"
                  onClick={() => run({ type: "skip" })}
                >
                  تخطّي المرحلة
                </button></ControlSlot>
              )}
              {!idle && (
                <ControlSlot slot="navigation"><button
                  className={styles.bigBtn}
                  data-testid="restart"
                  onClick={() => run({ type: "restart" })}
                >
                  إعادة المرحلة
                </button></ControlSlot>
              )}
              {(lc === "completed" || lc === "ended") && (
                <ControlSlot slot="assistance"><button
                  className={`${styles.bigBtn} ${styles.bigPrimary}`}
                  data-testid="new-run"
                  onClick={() => run({ type: "new-run" })}
                >
                  جلسة جديدة
                </button></ControlSlot>
              )}
              {!(lc === "completed" || lc === "ended") && (
                <button
                  className={`${styles.bigBtn} ${styles.bigDanger}`}
                  data-testid="end"
                  onClick={endNow}
                >
                  إنهاء الجلسة
                </button>
              )}
            </div>
            {!view.canStart && lc === "ready" && (
              <div className={styles.note}>
                للبدء:{" "}
                {crossDevice
                  ? "افتح /display على جهاز العرض"
                  : "افتح شاشة العرض"}
                {view.inputReady ? "" : " وانتظر استقرار الحسّاس"}
                {!crossDevice && " أو فعّل المعاينة بدون شاشة عرض"}.{" "}
                {set.inputSource !== "MANUAL" && !view.inputOk
                  ? "لا يوجد حسّاس متصل: اختر «تحكم المعالج باللمس» لتلعب بدونه."
                  : ""}
              </div>
            )}
            {!crossDevice && (
              <label className={styles.note} style={{ display: "block" }}>
                <input
                  type="checkbox"
                  data-testid="allow-no-display"
                  checked={view.allowNoDisplay}
                  onChange={(e) =>
                    run({ type: "allow-no-display", value: e.target.checked })
                  }
                />{" "}
                معاينة بدون شاشة عرض
              </label>
            )}
            {view.lastInput && (
              <div className={styles.mono} data-testid="last-input">
                آخر إدخال مقبول: {view.lastInput.text}
              </div>
            )}
          </section>

          {floorMode ? (
            <ControlSlot slot="preview"><FloorMapPanel runtime={runtime} view={view} run={run} /></ControlSlot>
          ) : (
            <section
              className={`${styles.card} ${styles.touchCard}`}
              data-testid="touch-card"
            >
              <h2>
                تحكّم الأخصائي باللمس{" "}
                <span className={styles.badge}>متاح دائمًا</span>
              </h2>
              <div className={styles.touchPad}>
                <button
                  className={`${styles.touchBtn} ${styles.touchLeft}`}
                  data-testid="touch-left"
                  disabled={!playing}
                  onClick={() => runtime.manual({ kind: "lane", dir: -1 })}
                >
                  ◀<small>يسار</small>
                </button>
                <button
                  className={`${styles.touchBtn} ${styles.touchStep}`}
                  data-testid="touch-step"
                  disabled={!playing}
                  onClick={() => runtime.manual({ kind: "step" })}
                >
                  ▲<small>تخطَّ الحاجز</small>
                </button>
                <button
                  className={`${styles.touchBtn} ${styles.touchRight}`}
                  data-testid="touch-right"
                  disabled={!playing}
                  onClick={() => runtime.manual({ kind: "lane", dir: 1 })}
                >
                  ▶<small>يمين</small>
                </button>
              </div>
              <div className={styles.note}>
                تعمل هذه الأزرار مع أي مصدر إدخال، وتمرّ عبر نفس قواعد اللعبة
                تمامًا؛ لا تحتاج إلى لوحة مفاتيح أو حسّاس. تُمنع الضغطات
                المتكررة السريعة تلقائيًا.
              </div>
            </section>
          )}

          {setupStages}

          {s.summary && (
            <section className={styles.card} data-testid="summary">
              <h2>ملخص الجلسة</h2>
              <table className={styles.sumTable}>
                <thead>
                  <tr>
                    <th>المرحلة</th>
                    <th>الحالة</th>
                    <th>نجوم</th>
                    <th>
                      {s.summary.projection === "FLOOR"
                        ? "أهداف متخطّاة"
                        : "وقفات"}
                    </th>
                    <th>مساعدات</th>
                  </tr>
                </thead>
                <tbody>
                  {s.summary.stages.map((r) => (
                    <tr key={`${r.index}-${r.status}`}>
                      <td>{STAGES[r.index].titleAr}</td>
                      <td>
                        {r.status === "completed" ? "اكتملت" : "تم تخطّيها"}
                      </td>
                      <td>{r.stars}</td>
                      <td>
                        {r.projection === "FLOOR"
                          ? r.objectivesSkipped
                          : r.holds}
                      </td>
                      <td>{r.assists}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className={styles.note}>
                إجمالي النجوم: {s.summary.totalStars} · اكتملت{" "}
                {s.summary.completedStages} · تُخطّيت {s.summary.skippedStages}
              </div>
            </section>
          )}
        </div>

        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          {setupSettings}

          {floorMode && (
            <FloorCalibrationCard set={set} patchFloor={patchFloor} />
          )}

          {showSimulator && (
            <section className={styles.card}>
              <h2>
                محاكي القدمين <span className={styles.badge}>محاكاة</span>
              </h2>
              {isDirectSource(set.inputSource) ? (
                <div className={styles.note}>
                  اختر وضع قدم لتشغيل الحسّاسات المُحاكاة. (لوحة المفاتيح: ← →
                  للتحرّك، المسافة أو ↑ لرفع القدم.)
                </div>
              ) : (
                <div className={styles.note}>
                  الأزرار والمفاتيح تقود حسّاسات مُحاكاة ثم تمرّ عبر نفس
                  المُعرِّف المستخدم مع الحسّاسات الفعلية.
                </div>
              )}
              {FOOT_ROLES.map(([role, label]) => {
                const key =
                  role === PhysicalRole.RIGHT_FOOT ? "RIGHT_FOOT" : "LEFT_FOOT";
                const active =
                  set.inputSource === "DUAL_FOOT" || set.inputSource === key;
                return (
                  <div
                    className={styles.footBox}
                    key={role}
                    style={{ opacity: active ? 1 : 0.55 }}
                  >
                    <h3>
                      {label} {!active && "— غير مُفعّلة في هذه الجلسة"}
                    </h3>
                    <div className={styles.pad}>
                      <button
                        className={styles.btn}
                        data-testid={`sim-${key}-left`}
                        onClick={() =>
                          runtime.simulateGesture(role, "TILT_LEFT")
                        }
                      >
                        ◀ يسار
                      </button>
                      <button
                        className={styles.btn}
                        data-testid={`sim-${key}-lift`}
                        onClick={() => runtime.simulateGesture(role, "LIFT")}
                      >
                        ▲ رفع
                      </button>
                      <button
                        className={styles.btn}
                        data-testid={`sim-${key}-right`}
                        onClick={() =>
                          runtime.simulateGesture(role, "TILT_RIGHT")
                        }
                      >
                        يمين ▶
                      </button>
                    </div>
                    <label className={styles.note} style={{ display: "block" }}>
                      <input
                        type="checkbox"
                        data-testid={`sim-${key}-connected`}
                        checked={connected[key]}
                        onChange={(e) => {
                          setConnected({
                            ...connected,
                            [key]: e.target.checked,
                          });
                          runtime.simulateConnection(role, e.target.checked);
                        }}
                      />{" "}
                      متصل
                    </label>
                  </div>
                );
              })}
              {view.roles.map((r) => (
                <div className={styles.mono} key={r.role}>
                  {r.role}: {r.state} · {r.fresh ? "fresh" : "stale"}
                </div>
              ))}
              <div className={styles.mono}>
                unrelated hand/handheld input is always ignored
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

const isDirectSource = (s: InputSourceId) => s === "MANUAL" || s === "KEYBOARD";

/** Same-computer (BroadcastChannel) Control page used by the development / local routes. */
export function RunnerQuest3DControl({
  displayHref = "/display/runner-quest-3d-prototype",
}: { displayHref?: string } = {}) {
  const [view, setView] = useState<ControlView | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handle, setHandle] = useState<ControlHandle | null>(null);
  const [recovered, setRecovered] = useState<string | null>(null);

  useEffect(() => {
    const cp = readCheckpoint(sessionStorage);
    if (cp && cp.lifecycle !== "ready")
      queueMicrotask(() =>
        setRecovered(
          `آخر جلسة قبل إعادة التحميل: المرحلة ${cp.stageIndex + 1} (${cp.lifecycle}). بدأت جلسة جديدة بأمان.`,
        ),
      );
    const stop = mountControl({
      onView: setView,
      onReady: (h) => {
        setHandle(h);
        if (process.env.NODE_ENV === "development")
          (window as unknown as { __RQ3D_RT?: unknown }).__RQ3D_RT = h.runtime;
      },
      onWaiting: setWaiting,
      onError: setError,
    });
    return () => {
      stop();
      setHandle(null);
    };
  }, []);

  if (error)
    return (
      <div className={styles.root}>
        <div className={styles.wrap}>
          <div className={styles.err}>{error}</div>
        </div>
      </div>
    );
  if (waiting)
    return (
      <div className={styles.root}>
        <div className={styles.wrap}>
          <div className={styles.card}>
            توجد نافذة تحكم أخرى مفتوحة لهذه اللعبة. أغلقها لتصبح هذه النافذة هي
            المتحكمة…
          </div>
        </div>
      </div>
    );
  if (!view || !handle)
    return (
      <div className={styles.root}>
        <div className={styles.wrap}>
          <div className={styles.card}>جارٍ التحميل…</div>
        </div>
      </div>
    );
  return (
    <div className={styles.root} dir="rtl" lang="ar">
      {recovered && (
        <div className={styles.wrap}>
          <div className={styles.warn}>{recovered}</div>
        </div>
      )}
      <RunnerControlPanels
        runtime={handle.runtime}
        view={view}
        options={{
          displayHref,
          showSimulator: process.env.NODE_ENV !== "production",
        }}
      />
    </div>
  );
}
