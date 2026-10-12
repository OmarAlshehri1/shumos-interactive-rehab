"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_CONTINUOUS_MOTION_CONFIG,
  EDGE_REVERSAL_PHASES,
  FREE_PLAY_PHASE_ID,
  LEFT_HAND_ENROLLMENT_PHASES,
  LEFT_HAND_RUNTIME_CONFIG,
  RECENTER_TEST_PHASE_ID,
  buildLeftHandEnrollmentExport,
  measureEdgeReversalResponse,
  type ContinuousMotionConfig,
  type LeftHandEnrollmentExport,
  type MotionDiagnosticRecord,
  type MotionFilterMode,
} from "@/lib/physicalInput";
import { LeftHandPreCaptureCheck } from "./LeftHandPreCaptureCheck";
import { SensorHandCursor } from "./SensorHandCursor";
import { type SensorRuntime, useLeftHandSensorRuntime } from "./SensorRuntimeProvider";

/**
 * LEFT_HAND ENROLLMENT SESSION — the ONE guided capture wizard tonight's
 * dual-sensor brief asks for (section 9/10). Mirrors
 * RightHandFinalSessionScreen.tsx's mechanics (explicit "التالي" stepping
 * with a minimum-sample floor, interactive recenter-test stage, time-based
 * free-play stage, one JSON export) with three deliberate differences:
 *
 * 1. Uses `useLeftHandSensorRuntime()` (the SHARED provider-owned runtime),
 *    never a locally-owned Wt901BleInputSource/PhysicalInputManager/
 *    ContinuousMotionController instance like RightHandFinalSessionScreen —
 *    that screen intentionally isolates itself from the shared runtime for
 *    RIGHT_HAND's own hardware-config experiments; LEFT_HAND has no such
 *    experiment tonight, and reusing the shared hook means this screen
 *    can never accidentally disturb RIGHT_HAND's independent connection.
 *    Because the shared hook exposes `sample`/`pointer` as plain state
 *    (no manager callback to hook a record-builder into directly), pairing
 *    a sample with the pointer it produced is done via two ordered effects
 *    below (`latestSampleRef` written first, the `pointer`-keyed effect
 *    reading it second) instead of a single onPointerChanged callback.
 *
 * 2. A mandatory `LeftHandPreCaptureCheck` gate runs BEFORE anything is
 *    recorded — see that component's own doc comment. Nothing before
 *    `onPassed` fires can push into `recordsRef`.
 *
 * 3. No hardware-config-comparison stage and no derived
 *    crossAxisCalibration/personalized profile: this session is purely
 *    architecture + evidence-collection (see LeftHandEnrollmentProfile.ts's
 *    doc comment) — the exported JSON is real/raw/descriptive only.
 */

const MIN_PHASE_SAMPLES = 20;
const MIN_MOVEMENT_SAMPLES = 15;
const MIN_FREE_PLAY_MS = 40_000;

type Stage = "connect" | "direction_check" | "center" | "guided" | "recenter_test" | "free_play" | "summary";

/** Same explicit lookup as RightHandFinalSessionScreen.tsx (not substring matching — see that file's doc comment for why). Duplicated here rather than imported: that file is a frozen RIGHT_HAND baseline tonight and must not be touched or exported from. */
const EDGE_ID_TO_AXIS: Record<(typeof EDGE_REVERSAL_PHASES)[number]["id"], { axis: "x" | "y"; edgeValue: 0 | 1 }> = {
  edge_right_reverse_left: { axis: "x", edgeValue: 1 },
  edge_left_reverse_right: { axis: "x", edgeValue: 0 },
  edge_top_reverse_down: { axis: "y", edgeValue: 0 },
  edge_bottom_reverse_up: { axis: "y", edgeValue: 1 },
};

interface SessionEvent {
  readonly type: string;
  readonly atMs: number;
  readonly noteAr: string;
}

export function LeftHandEnrollmentScreen() {
  const runtime = useLeftHandSensorRuntime();
  const recordsRef = useRef<MotionDiagnosticRecord[]>([]);
  const eventsRef = useRef<SessionEvent[]>([]);
  const activePhaseRef = useRef<string | null>(null);
  const latestSampleRef = useRef(runtime.sample);
  const centerRollDegRef = useRef(0);

  const [stage, setStage] = useState<Stage>("connect");
  const [recordCount, setRecordCount] = useState(0);
  const [explicitlyRecentered, setExplicitlyRecentered] = useState(false);

  const [phaseIndex, setPhaseIndex] = useState<number | null>(null);
  const [phaseSamples, setPhaseSamples] = useState(0);

  const [recenterSubstep, setRecenterSubstep] = useState<"awkward" | "pressed" | "confirmed">("awkward");
  const [recenterSamples, setRecenterSamples] = useState(0);
  const [phantomContactWarning, setPhantomContactWarning] = useState(false);

  const [freePlayRunning, setFreePlayRunning] = useState(false);
  const [freePlaySamples, setFreePlaySamples] = useState(0);
  const [freePlayStartedAtMs, setFreePlayStartedAtMs] = useState<number | null>(null);
  const [freePlayNowMs, setFreePlayNowMs] = useState(0);

  const [exportPayload, setExportPayload] = useState<LeftHandEnrollmentExport | null>(null);

  // Ordered pair of effects (declaration order = commit order): the first keeps the most recently
  // observed sample in a ref; the second, keyed on `pointer`, reads that ref to pair a sample with the
  // pointer it produced by matching timestamps — the same pairing RightHandFinalSessionScreen.tsx does
  // via a single manager callback, adapted here because useLeftHandSensorRuntime exposes sample/pointer
  // as plain state rather than a callback to hook a record-builder into directly.
  useEffect(() => {
    latestSampleRef.current = runtime.sample;
  }, [runtime.sample]);

  useEffect(() => {
    const pointer = runtime.pointer;
    const phase = activePhaseRef.current;
    const latestSample = latestSampleRef.current;
    if (!pointer || !phase || !latestSample || latestSample.timestampMs !== pointer.timestampMs) return;
    recordsRef.current.push({ phase, sample: latestSample, output: pointer });
    setRecordCount((count) => count + 1);
    if (phase === FREE_PLAY_PHASE_ID) setFreePlaySamples((count) => count + 1);
    else if (phase === RECENTER_TEST_PHASE_ID) setRecenterSamples((count) => count + 1);
    else setPhaseSamples((count) => count + 1);
  }, [runtime.pointer]);

  useEffect(() => {
    if (!freePlayRunning || freePlayStartedAtMs === null) return;
    const timer = window.setInterval(() => setFreePlayNowMs(performance.now()), 250);
    return () => window.clearInterval(timer);
  }, [freePlayRunning, freePlayStartedAtMs]);

  // ---------- centering ----------

  function manualRecenter(): void {
    if (!runtime.sample) return;
    centerRollDegRef.current = runtime.sample.anglesDeg[0];
    runtime.recenter();
    setExplicitlyRecentered(true);
  }

  // ---------- guided phases ----------

  function startGuided(): void {
    setStage("guided");
    setPhaseIndex(0);
    setPhaseSamples(0);
    activePhaseRef.current = LEFT_HAND_ENROLLMENT_PHASES[0].id;
  }

  function advanceGuided(): void {
    if (phaseIndex === null) return;
    const next = phaseIndex + 1;
    if (next < LEFT_HAND_ENROLLMENT_PHASES.length) {
      setPhaseIndex(next);
      setPhaseSamples(0);
      activePhaseRef.current = LEFT_HAND_ENROLLMENT_PHASES[next].id;
      return;
    }
    activePhaseRef.current = RECENTER_TEST_PHASE_ID;
    setPhaseIndex(null);
    setRecenterSubstep("awkward");
    setPhantomContactWarning(false);
    setRecenterSamples(0);
    setStage("recenter_test");
  }

  // ---------- recenter test ----------

  function pressRecenterDuringTest(): void {
    const contactBefore = runtime.pointer;
    if (!runtime.sample) return;
    runtime.recenter();
    eventsRef.current.push({ type: "recenter", atMs: performance.now(), noteAr: "ضغط زر إعادة تعيين المنتصف أثناء اختبار إعادة التمركز" });
    // Same limited phantom-contact check as RightHandFinalSessionScreen.tsx — real game-level phantom
    // contact protection (ContactActivationGate/SensorContactRouter) is exercised inside actual games,
    // not this standalone wizard.
    setPhantomContactWarning(!!contactBefore && Math.abs(contactBefore.pointer.x - 0.5) < 0.02 && Math.abs(contactBefore.pointer.y - 0.5) < 0.02);
    setRecenterSubstep("pressed");
  }

  function finishRecenterTest(): void {
    activePhaseRef.current = null;
    setRecenterSubstep("confirmed");
    setStage("free_play");
  }

  // ---------- free play ----------

  function startFreePlay(): void {
    activePhaseRef.current = FREE_PLAY_PHASE_ID;
    setFreePlaySamples(0);
    setFreePlayRunning(true);
    setFreePlayStartedAtMs(performance.now());
    setFreePlayNowMs(performance.now());
  }

  function stopFreePlay(): void {
    activePhaseRef.current = null;
    setFreePlayRunning(false);
    buildSummary();
    setStage("summary");
  }

  // ---------- summary + export ----------

  function buildSummary(): void {
    const all = recordsRef.current;
    const stillRecords = all.filter((r) => r.phase === "still_start" || r.phase === "still_end");
    const edgeReversal = EDGE_REVERSAL_PHASES.map((phaseDef) => {
      const records = all.filter((r) => r.phase === phaseDef.id);
      const { axis, edgeValue } = EDGE_ID_TO_AXIS[phaseDef.id];
      return { phase: phaseDef.id, reversalResponseMs: measureEdgeReversalResponse(records, axis, edgeValue) };
    });
    // Best-effort reconstruction of the effective controller config for this export's own record-keeping
    // only (LEFT_HAND_RUNTIME_CONFIG.motionConfig merged onto the same defaults ContinuousMotionController
    // itself merges onto) — never a source of truth fed back into anything, and deliberately WITHOUT any
    // crossAxisCalibration (LEFT_HAND_RUNTIME_CONFIG has none — see that file's own doc comment).
    const config: ContinuousMotionConfig = { ...DEFAULT_CONTINUOUS_MOTION_CONFIG, ...LEFT_HAND_RUNTIME_CONFIG.motionConfig, filterMode: runtime.filterMode };
    const built = buildLeftHandEnrollmentExport({
      deviceId: runtime.deviceId,
      liveRateHz: runtime.liveRateHz,
      config,
      stillRecords,
      allRecords: all,
      edgeReversal,
      centerRollDeg: centerRollDegRef.current,
      events: eventsRef.current,
      notesAr: [
        `عدد العينات الكلي هذه الجلسة: ${all.length}.`,
        `عدد أحداث إعادة التمركز المسجّلة: ${eventsRef.current.filter((e) => e.type === "recenter").length}.`,
      ],
    });
    setExportPayload(built);
  }

  function downloadSession(): void {
    if (!exportPayload) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `wt901-left-hand-enrollment-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const connected = runtime.connected;
  const sample = runtime.sample;
  const pointer = runtime.pointer;
  const [roll, pitch, yaw] = sample?.anglesDeg ?? [0, 0, 0];
  const activePhase = phaseIndex === null ? null : LEFT_HAND_ENROLLMENT_PHASES[phaseIndex];
  const freePlayElapsedMs = freePlayStartedAtMs === null ? 0 : freePlayNowMs - freePlayStartedAtMs;
  // Derived, not stored: the instant the shared runtime reports connected, the view advances past the
  // "connect" stage to the mandatory pre-capture direction check — computed during render (no setState-
  // in-effect cascade) rather than an effect, since it's purely a function of already-owned state
  // (`stage`/`runtime.connected`). Every later stage still only ever advances via an explicit press.
  const effectiveStage: Stage = stage === "connect" && connected ? "direction_check" : stage;
  const showFilterCompare = connected && (effectiveStage === "direction_check" || effectiveStage === "center" || effectiveStage === "guided" || effectiveStage === "recenter_test" || effectiveStage === "free_play");

  return (
    <main dir="rtl" lang="ar" className="min-h-dvh bg-[#f4f0fb] text-slate-900" style={{ fontFamily: "var(--font-control), system-ui, sans-serif" }}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-7 lg:py-7">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-bold text-violet-700">جلسة تسجيل موجّهة · LEFT_HAND</span>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">جلسة تسجيل اليد اليسرى</h1>
          </div>
          <Link href="/control" className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm">رجوع</Link>
        </header>

        <StageProgress stage={effectiveStage} />

        <section className="overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-xl shadow-violet-950/10">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <StatusDot runtime={runtime} />
              <div>
                <p className="text-sm font-bold">{connectionLabel(runtime)}</p>
                <p className="text-xs text-slate-500">{runtime.liveRateHz !== null ? `المعدل الحي: ${runtime.liveRateHz.toFixed(1)} Hz` : "—"}</p>
              </div>
            </div>
            {!connected && !runtime.connecting && !runtime.reconnecting && (
              <button type="button" onClick={() => void runtime.connect()} className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white">
                ربط {LEFT_HAND_RUNTIME_CONFIG.arabicLabel}
              </button>
            )}
          </div>
          {runtime.error && <p role="alert" className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">{runtime.error}</p>}
          <div className="relative aspect-[16/9] min-h-[280px] overflow-hidden bg-gradient-to-b from-[#ded2f7] via-[#ece3fb] to-[#fff3c4]">
            {!connected && <AreaMessage icon="⌁" text="اربط الحساس للبدء" />}
            {connected && !runtime.centered && <AreaMessage icon="✋" text="بانتظار أول تمركز تلقائي…" />}
            <SensorHandCursor pointer={pointer?.pointer ?? null} visible={connected && runtime.centered && !!pointer} handRole="LEFT_HAND" />
          </div>
          {connected && sample && (
            <div className="grid grid-cols-3 gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-500 sm:grid-cols-6">
              <span>X: {pointer ? pointer.pointer.x.toFixed(3) : "—"}</span>
              <span>Y: {pointer ? pointer.pointer.y.toFixed(3) : "—"}</span>
              <span>Roll: {roll.toFixed(1)}°</span>
              <span>Pitch: {pitch.toFixed(1)}°</span>
              <span>Yaw: {yaw.toFixed(1)}°</span>
              <span>الجهاز: {runtime.deviceId ?? "—"}</span>
            </div>
          )}
          {showFilterCompare && (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3 text-xs">
              <span className="font-bold text-slate-500">قارن الفلتر حيًا:</span>
              {(["LIGHT_EMA", "ADAPTIVE_EMA", "ONE_EURO"] as const satisfies readonly MotionFilterMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => runtime.selectFilter(mode)}
                  className={`rounded-lg px-3 py-1.5 font-bold ${runtime.filterMode === mode ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  {mode}
                </button>
              ))}
            </div>
          )}
        </section>

        {effectiveStage === "direction_check" && (
          <LeftHandPreCaptureCheck onPassed={() => setStage("center")} />
        )}

        {effectiveStage === "center" && (
          <PanelCard title="التمركز">
            <p className="text-sm text-slate-600">
              التمركز التلقائي حدث فعليًا عند أول اتصال. بعد اجتياز فحص الاتجاه، ثبّت يدك اليسرى الآن بوضع مريح فعلي ثم اضغط «تعيين المنتصف يدويًا» قبل المتابعة — هذا يضمن مرجعًا نظيفًا للخطوات القادمة، ويحفظ زاوية اللف الحالية كمرجع لقياس وضعيات اللف لاحقًا.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={manualRecenter} disabled={!connected || !sample} className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-extrabold text-amber-950 disabled:opacity-40">تعيين المنتصف يدويًا</button>
              <button type="button" onClick={startGuided} disabled={!explicitlyRecentered} className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">ابدأ التسجيل الموجّه</button>
            </div>
          </PanelCard>
        )}

        {effectiveStage === "guided" && phaseIndex !== null && activePhase && (
          <PanelCard title={`الخطوة ${phaseIndex + 1} من ${LEFT_HAND_ENROLLMENT_PHASES.length}`}>
            <h3 className="text-2xl font-black text-violet-950">{activePhase.titleAr}</h3>
            <p className="mt-2 text-sm text-violet-900/70">{activePhase.instructionAr}</p>
            <p className="mt-3 text-xs font-bold text-violet-700">سُجلت {phaseSamples} عينة</p>
            <button
              type="button"
              onClick={advanceGuided}
              disabled={phaseSamples < (EDGE_REVERSAL_PHASES.some((p) => p.id === activePhase.id) ? MIN_MOVEMENT_SAMPLES : MIN_PHASE_SAMPLES)}
              className="mt-4 rounded-xl bg-violet-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-40"
            >
              {phaseIndex === LEFT_HAND_ENROLLMENT_PHASES.length - 1 ? "تم — متابعة لاختبار إعادة التمركز" : "تم، الخطوة التالية"}
            </button>
          </PanelCard>
        )}

        {effectiveStage === "recenter_test" && (
          <PanelCard title="اختبار إعادة التمركز">
            {recenterSubstep === "awkward" && (
              <>
                <p className="text-sm text-slate-600">١) ضع يدك اليسرى بوضعية غير مريحة/بعيدة عن المنتصف (كأن الطفل جلس بشكل مختلف).</p>
                <button type="button" onClick={pressRecenterDuringTest} disabled={!connected || !sample} className="mt-3 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-extrabold text-amber-950 disabled:opacity-40">٢) إعادة تعيين المنتصف الآن</button>
              </>
            )}
            {recenterSubstep === "pressed" && (
              <>
                <p className="text-sm font-bold text-emerald-700">تم — المؤشر الآن في المنتصف تمامًا.</p>
                {phantomContactWarning && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-800">⚠ لاحظ الحماية من التفعيل الوهمي — راجع الملاحظة في الشاشة.</p>}
                <p className="mt-2 text-sm text-slate-600">٣) نفّذ حركة صغيرة الآن للتأكد من استجابة فورية بعد إعادة التمركز.</p>
                <p className="mt-2 text-xs font-bold text-violet-700">سُجلت {recenterSamples} عينة بعد إعادة التمركز</p>
                <button type="button" onClick={finishRecenterTest} disabled={recenterSamples < MIN_MOVEMENT_SAMPLES} className="mt-4 rounded-xl bg-violet-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-40">تم — متابعة للعب الحر</button>
              </>
            )}
          </PanelCard>
        )}

        {effectiveStage === "free_play" && (
          <PanelCard title="لعب حر">
            <p className="text-sm text-slate-600">حرّك يدك اليسرى والعب بحرية — تحرك، توقف، اعكس الاتجاه، اضرب الحواف، لف معصمك أحيانًا. لا يوجد وقت محدد صارم، لكن ٤٥-٦٠ ثانية مثالية.</p>
            {!freePlayRunning ? (
              <button type="button" onClick={startFreePlay} disabled={!runtime.centered} className="mt-4 rounded-xl bg-violet-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-40">ابدأ اللعب الحر</button>
            ) : (
              <>
                <p className="mt-3 text-sm font-bold text-violet-700">الوقت المنقضي: {(freePlayElapsedMs / 1000).toFixed(0)} ثانية · العينات: {freePlaySamples}</p>
                <button type="button" onClick={stopFreePlay} disabled={freePlayElapsedMs < MIN_FREE_PLAY_MS} className="mt-4 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-40">
                  {freePlayElapsedMs < MIN_FREE_PLAY_MS ? `انتظر ${Math.ceil((MIN_FREE_PLAY_MS - freePlayElapsedMs) / 1000)} ثانية أخرى` : "إنهاء وحفظ"}
                </button>
              </>
            )}
          </PanelCard>
        )}

        {effectiveStage === "summary" && exportPayload && (
          <SummaryPanel exportPayload={exportPayload} recordCount={recordCount} onDownload={downloadSession} />
        )}

        <p className="pb-2 text-center text-xs text-slate-500">لا تُرسل هذه الصفحة بيانات إلى Firebase أو Munsit. لا يوجد حفظ دائم على الحساس (بدون أمر Save). لا تُحتسب أي معايرة محورية متقاطعة لليد اليسرى هنا — هذه جلسة جمع أدلة فقط.</p>
      </div>
    </main>
  );
}

function StageProgress({ stage }: { stage: Stage }) {
  const stages: { id: Stage; labelAr: string }[] = [
    { id: "connect", labelAr: "الاتصال" },
    { id: "direction_check", labelAr: "فحص الاتجاه" },
    { id: "center", labelAr: "التمركز" },
    { id: "guided", labelAr: "التسجيل الموجّه" },
    { id: "recenter_test", labelAr: "إعادة التمركز" },
    { id: "free_play", labelAr: "لعب حر" },
    { id: "summary", labelAr: "الملخص" },
  ];
  const currentIndex = stages.findIndex((s) => s.id === stage);
  return (
    <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
      {stages.map((s, index) => (
        <span key={s.id} className={`rounded-full px-3 py-1 ${index === currentIndex ? "bg-violet-600 text-white" : index < currentIndex ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-400"}`}>
          {s.labelAr}
        </span>
      ))}
    </div>
  );
}

function SummaryPanel({
  exportPayload,
  recordCount,
  onDownload,
}: {
  exportPayload: LeftHandEnrollmentExport;
  recordCount: number;
  onDownload: () => void;
}) {
  return (
    <PanelCard title="الملخص وتنزيل ملف الأدلة">
      <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
        <span>العينات الكلية: {recordCount}</span>
        <span>الجهاز: {exportPayload.deviceId ?? "—"}</span>
        <span>المعدل الحي عند الانتهاء: {exportPayload.liveRateHz !== null ? `${exportPayload.liveRateHz.toFixed(1)} Hz` : "—"}</span>
        <span>إصدار ملف التصدير: {exportPayload.exportVersion}</span>
      </div>
      <div className="mt-4 rounded-xl bg-slate-50 p-4 text-xs text-slate-600">
        <p className="font-bold text-slate-800">مغلف الضجيج (MAD/STD لكل محور جايروسكوب، عينات السكون)</p>
        {exportPayload.noiseEnvelope.gyroDps.map((axis, index) => (
          <p key={index}>محور {["x", "y", "z"][index]}: mean={axis.mean.toFixed(3)} std={axis.std.toFixed(3)} mad={axis.mad.toFixed(3)}</p>
        ))}
      </div>
      <div className="mt-3 rounded-xl bg-slate-50 p-4 text-xs text-slate-600">
        <p className="font-bold text-slate-800">استجابة انعكاس الحافة</p>
        {exportPayload.edgeReversal.map((edge) => (
          <p key={edge.phase}>{edge.phase}: {edge.reversalResponseMs === null ? "لم تصل الحافة فعليًا" : `${edge.reversalResponseMs.toFixed(0)} مللي ثانية`}</p>
        ))}
      </div>
      <div className="mt-3 rounded-xl bg-slate-50 p-4 text-xs text-slate-600">
        <p className="font-bold text-slate-800">تغطية وضعيات اللف (زاوية معصم فعلية مقاسة، وليست الاسمية)</p>
        {exportPayload.twistPostureAngles.map((p) => (
          <p key={p.phase}>{p.phase}: {p.sampleCount === 0 ? "لم تُسجَّل" : `${p.sampleCount} عينة، متوسط ${p.actualWristAngleDeg!.mean.toFixed(1)}°`}</p>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">{exportPayload.disclaimer}</p>
      <button type="button" onClick={onDownload} className="mt-4 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white">تنزيل ملف الجلسة الكامل (JSON)</button>
    </PanelCard>
  );
}

function PanelCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-violet-200 bg-white p-5 shadow-sm">
      <h2 className="font-bold text-slate-900">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function connectionLabel(runtime: SensorRuntime): string {
  if (runtime.connected) return "متصل ويستقبل بيانات";
  if (runtime.reconnecting) return "جاري إعادة الاتصال…";
  if (runtime.connecting) return "جاري الاتصال…";
  if (runtime.error) return "خطأ في الاتصال";
  return "غير متصل";
}
function StatusDot({ runtime }: { runtime: SensorRuntime }) {
  const color = runtime.connected ? "bg-emerald-500" : runtime.connecting || runtime.reconnecting ? "bg-amber-400" : "bg-slate-300";
  return <span className={`h-3 w-3 rounded-full ${color}`} />;
}
function AreaMessage({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-violet-950/65">
      <span className="text-5xl">{icon}</span>
      <p className="text-lg font-extrabold sm:text-2xl">{text}</p>
    </div>
  );
}
