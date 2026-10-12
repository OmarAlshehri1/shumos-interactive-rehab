"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ConnectionState,
  ContinuousMotionController,
  PhysicalInputManager,
  PhysicalRole,
  TWIST_INVARIANCE_SESSION_PHASES,
  Wt901BleInputSource,
  angularDeltaDeg,
  createUncalibratedProfile,
  measureEdgeReversalResponse,
  type ContinuousMotionConfig,
  type MotionDiagnosticRecord,
  type MotionSample,
  type NormalizedPointer,
  type SemanticDetector,
} from "@/lib/physicalInput";
import { RIGHT_HAND_ADULT_2026_09_04_SESSION_CALIBRATION } from "@/lib/physicalInput/RightHandAdultCalibrationEvidence";

/**
 * SHORT TARGETED CAPTURE — the ONE missing variable the 2026-09-04
 * FINAL_SESSION (11,402 samples) doesn't cover: aiming up/down/left/right
 * WHILE the wrist stays rotated (see TwistInvarianceCapturePhases.ts's own
 * doc comment). Deliberately its own isolated screen (same isolation
 * pattern as RightHandFinalSessionScreen.tsx — own
 * Wt901BleInputSource/PhysicalInputManager/ContinuousMotionController,
 * never the shared SensorRuntimeProvider, never Firebase), not a mode of
 * that longer screen: this is meant to be re-run again later if more
 * postures are ever needed, without dragging the full hardware-comparison/
 * free-play/summary flow along with it every time.
 *
 * UX constraint from the brief: NO short auto-advance timers (risks
 * capturing the wrong movement mid-transition) — every phase requires an
 * explicit "جاهز" press AND a minimum clean-sample floor (mirrors
 * RightHandFinalSessionScreen's MIN_PHASE_SAMPLES/MIN_MOVEMENT_SAMPLES
 * pattern), whichever is later.
 *
 * Applies the SAME 50Hz/20Hz hardware config and this same adult's OWN
 * already-derived cross-axis calibration matrix
 * (RightHandAdultCalibrationEvidence.ts) from the start — the point of
 * THIS capture is to isolate and evidence the twist/axis-swap problem,
 * with the already-validated Problem-1 fix already active underneath it,
 * matching what real gameplay will actually run.
 */

const PASSIVE_DETECTOR: SemanticDetector = { reset: () => {}, observe: () => null };
const MIN_TWIST_PHASE_SAMPLES = 30; // ~0.6s at 50Hz — short by design, still enough for a directional estimate
const MIN_EDGE_PHASE_SAMPLES = 15;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message === "WEB_BLUETOOTH_UNAVAILABLE") return "هذا المتصفح لا يدعم Web Bluetooth. استخدم Chrome أو Edge.";
  if (error instanceof DOMException && error.name === "NotFoundError") return "لم يتم اختيار حساس.";
  return "تعذّر الاتصال. أغلق تطبيق WITMOTION، تأكد من تشغيل الحساس، ثم حاول مرة أخرى.";
}

type Stage = "connect" | "applying_hardware" | "center" | "direction_check" | "guided" | "summary";

const EDGE_ID_TO_AXIS: Record<string, { axis: "x" | "y"; edgeValue: 0 | 1 }> = {
  edge_left_reverse_right: { axis: "x", edgeValue: 0 },
  edge_top_reverse_down: { axis: "y", edgeValue: 0 },
};

type DirectionCheckAnswer = "unset" | "correct" | "incorrect";
type DirectionCheckId = "up" | "down" | "left" | "right";
const DIRECTION_CHECK_ITEMS: { id: DirectionCheckId; labelAr: string; instructionAr: string }[] = [
  { id: "up", labelAr: "أعلى", instructionAr: "حرّك يدك للأعلى — هل تحرك المؤشر للأعلى؟" },
  { id: "down", labelAr: "أسفل", instructionAr: "حرّك يدك للأسفل — هل تحرك المؤشر للأسفل؟" },
  { id: "right", labelAr: "يمين", instructionAr: "حرّك يدك لليمين — هل تحرك المؤشر لليمين؟" },
  { id: "left", labelAr: "يسار", instructionAr: "حرّك يدك لليسار — هل تحرك المؤشر لليسار؟" },
];

function postureTargetLabel(phaseId: string): string {
  if (phaseId.startsWith("neutral")) return "0° (طبيعي)";
  if (phaseId.startsWith("twist_45")) return "~45°";
  if (phaseId.startsWith("twist_90")) return "~90°";
  return "—";
}

export function RightHandTwistInvarianceScreen() {
  const sourceRef = useRef<Wt901BleInputSource | null>(null);
  const managerRef = useRef<PhysicalInputManager | null>(null);
  const controllerRef = useRef<ContinuousMotionController | null>(null);
  const latestSampleRef = useRef<MotionSample | null>(null);
  const recordsRef = useRef<MotionDiagnosticRecord[]>([]);
  const eventsRef = useRef<{ type: string; atMs: number; noteAr: string }[]>([]);
  const activePhaseRef = useRef<string | null>(null);

  const [connection, setConnection] = useState(ConnectionState.DISCONNECTED);
  const [sample, setSample] = useState<MotionSample | null>(null);
  const [pointer, setPointer] = useState<NormalizedPointer | null>(null);
  const [centered, setCentered] = useState(false);
  const [liveRateHz, setLiveRateHz] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("connect");
  const [hardwareNoteAr, setHardwareNoteAr] = useState<string | null>(null);

  const [phaseIndex, setPhaseIndex] = useState<number | null>(null);
  const [phaseSamples, setPhaseSamples] = useState(0);
  const [recordCount, setRecordCount] = useState(0);
  const [centerRollDeg, setCenterRollDeg] = useState(0);
  const [directionChecks, setDirectionChecks] = useState<Record<DirectionCheckId, DirectionCheckAnswer>>({ up: "unset", down: "unset", left: "unset", right: "unset" });

  const config: Partial<ContinuousMotionConfig> = {
    autoCenter: true,
    crossAxisCalibration: RIGHT_HAND_ADULT_2026_09_04_SESSION_CALIBRATION.matrix,
    twistTrackingMode: "CONTINUOUS_GRAVITY_REFERENCED",
  };

  useEffect(() => {
    const source = new Wt901BleInputSource();
    const manager = new PhysicalInputManager();
    const controller = new ContinuousMotionController(config);
    sourceRef.current = source;
    managerRef.current = manager;
    controllerRef.current = controller;
    manager.assignRole(PhysicalRole.RIGHT_HAND, source, PASSIVE_DETECTOR, createUncalibratedProfile(PhysicalRole.RIGHT_HAND));
    manager.attachContinuousController(PhysicalRole.RIGHT_HAND, controller);

    const sampleTimes: number[] = [];
    const unsubscribeConnection = source.onConnectionStateChange((state) => {
      setConnection(state);
      if (state === ConnectionState.DISCONNECTED || state === ConnectionState.ERROR) {
        setPointer(null);
        setCentered(false);
        setSample(null);
        setLiveRateHz(null);
        latestSampleRef.current = null;
      }
    });
    const unsubscribeSample = manager.onSampleObserved((role, nextSample) => {
      if (role !== PhysicalRole.RIGHT_HAND) return;
      latestSampleRef.current = nextSample;
      setSample(nextSample);
      const arrival = performance.now();
      sampleTimes.push(arrival);
      while (sampleTimes.length && sampleTimes[0] < arrival - 2000) sampleTimes.shift();
      const seconds = sampleTimes.length > 1 ? (sampleTimes.at(-1)! - sampleTimes[0]) / 1000 : 0;
      setLiveRateHz(seconds > 0 ? (sampleTimes.length - 1) / seconds : null);
    });
    const unsubscribePointer = manager.onPointerChanged((role, nextPointer) => {
      if (role !== PhysicalRole.RIGHT_HAND) return;
      setPointer(nextPointer);
      if (!nextPointer) {
        setCentered(false);
        return;
      }
      setCentered(true);
      const phase = activePhaseRef.current;
      const latestSample = latestSampleRef.current;
      if (phase && latestSample?.timestampMs === nextPointer.timestampMs) {
        recordsRef.current.push({ phase, sample: latestSample, output: nextPointer });
        setRecordCount((count) => count + 1);
        setPhaseSamples((count) => count + 1);
      }
    });

    return () => {
      unsubscribeConnection();
      unsubscribeSample();
      unsubscribePointer();
      void manager.unassignRole(PhysicalRole.RIGHT_HAND);
      sourceRef.current = null;
      managerRef.current = null;
      controllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect(): Promise<void> {
    setError(null);
    try {
      await managerRef.current?.connect(PhysicalRole.RIGHT_HAND);
      setStage("applying_hardware");
      const source = sourceRef.current;
      if (source) {
        try {
          await source.setTemporaryOutputRate(50);
          await source.setTemporaryBandwidth(20);
          setHardwareNoteAr("تم ضبط الحساس على 50Hz / فلتر 20Hz (نفس الإعداد المعتمد من جلسة اليوم).");
        } catch {
          setHardwareNoteAr("تعذّر ضبط 50Hz/20Hz تلقائيًا — تابعت بالإعداد الحالي للحساس.");
        }
      }
      setStage("center");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function recenter(): void {
    const latestSample = latestSampleRef.current;
    const didCenter = controllerRef.current?.recenter() ?? false;
    if (!didCenter || !latestSample) {
      setError("انتظر وصول قراءة من الحساس أولاً.");
      return;
    }
    setError(null);
    setCenterRollDeg(latestSample.anglesDeg[0]);
    setPointer(controllerRef.current?.currentPointer ?? null);
    eventsRef.current.push({ type: "recenter", atMs: performance.now(), noteAr: "تعيين المنتصف عند وضعية اليد الطبيعية (قبل بدء أي وضعيات لف)" });
  }

  function goToDirectionCheck(): void {
    setDirectionChecks({ up: "unset", down: "unset", left: "unset", right: "unset" });
    setStage("direction_check");
  }

  function answerDirectionCheck(id: DirectionCheckId, answer: DirectionCheckAnswer): void {
    setDirectionChecks((previous) => ({ ...previous, [id]: answer }));
  }

  const allDirectionsCorrect = (["up", "down", "left", "right"] as const).every((id) => directionChecks[id] === "correct");
  const anyDirectionIncorrect = (["up", "down", "left", "right"] as const).some((id) => directionChecks[id] === "incorrect");

  function startGuided(): void {
    setStage("guided");
    setPhaseIndex(0);
    setPhaseSamples(0);
    activePhaseRef.current = TWIST_INVARIANCE_SESSION_PHASES[0].id;
  }

  function advanceGuided(): void {
    if (phaseIndex === null) return;
    const next = phaseIndex + 1;
    if (next < TWIST_INVARIANCE_SESSION_PHASES.length) {
      setPhaseIndex(next);
      setPhaseSamples(0);
      activePhaseRef.current = TWIST_INVARIANCE_SESSION_PHASES[next].id;
      return;
    }
    activePhaseRef.current = null;
    setPhaseIndex(null);
    setStage("summary");
  }

  function downloadSession(): void {
    const all = recordsRef.current;
    const edgeReversal = Object.entries(EDGE_ID_TO_AXIS).map(([phase, { axis, edgeValue }]) => ({
      phase,
      reversalResponseMs: measureEdgeReversalResponse(
        all.filter((r) => r.phase === phase),
        axis,
        edgeValue,
      ),
    }));
    const twistPostureSummary = TWIST_INVARIANCE_SESSION_PHASES.map((p) => {
      const records = all.filter((r) => r.phase === p.id);
      if (records.length === 0) return { phase: p.id, n: 0, actualWristAngleDeg: null };
      const deltas = records.map((r) => angularDeltaDeg(r.sample.anglesDeg[0], centerRollDeg));
      const mean = deltas.reduce((s, v) => s + v, 0) / deltas.length;
      return {
        phase: p.id,
        n: records.length,
        actualWristAngleDeg: { mean, min: Math.min(...deltas), max: Math.max(...deltas) },
      };
    });
    const payload = {
      capturedAt: new Date().toISOString(),
      role: PhysicalRole.RIGHT_HAND,
      sessionKind: "TWIST_INVARIANCE_2026_09_04",
      config: controllerRef.current?.currentConfig,
      appliedCalibrationSource: "RIGHT_HAND_ADULT_2026_09_04_SESSION_CALIBRATION",
      centerRollDeg,
      twistPostureSummary,
      edgeReversal,
      events: eventsRef.current,
      records: all,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `wt901-right-hand-twist-invariance-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const connected = connection === ConnectionState.CONNECTED;
  const activePhase = phaseIndex === null ? null : TWIST_INVARIANCE_SESSION_PHASES[phaseIndex];
  const isEdgePhase = activePhase ? activePhase.id in EDGE_ID_TO_AXIS : false;
  const minSamplesForActivePhase = isEdgePhase ? MIN_EDGE_PHASE_SAMPLES : MIN_TWIST_PHASE_SAMPLES;
  const currentTwistDeg = sample && centered ? angularDeltaDeg(sample.anglesDeg[0], centerRollDeg) : null;

  return (
    <main dir="rtl" lang="ar" className="min-h-dvh bg-[#eff9f8] text-slate-900" style={{ fontFamily: "var(--font-control), system-ui, sans-serif" }}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-5 sm:px-7 lg:py-7">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-bold text-teal-700">التقاط قصير مستهدف · RIGHT_HAND</span>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">اختبار ثبات الاتجاه أثناء لف المعصم</h1>
          </div>
          <Link href="/control" className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm">رجوع</Link>
        </header>

        <section className="overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-xl shadow-teal-950/10">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${connection === ConnectionState.CONNECTED ? "bg-emerald-500" : connection === ConnectionState.CONNECTING ? "bg-amber-400" : "bg-slate-300"}`} />
              <div>
                <p className="text-sm font-bold">
                  {connection === ConnectionState.CONNECTED ? "متصل ويستقبل بيانات" : connection === ConnectionState.CONNECTING ? "جاري الاتصال…" : connection === ConnectionState.ERROR ? "خطأ في الاتصال" : "غير متصل"}
                </p>
                <p className="text-xs text-slate-500">{liveRateHz !== null ? `المعدل الحي: ${liveRateHz.toFixed(1)} Hz` : "—"}</p>
              </div>
            </div>
            {!connected && (
              <button type="button" onClick={connect} className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white">
                ربط WT901BLECL
              </button>
            )}
          </div>
          {error && <p role="alert" className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">{error}</p>}
          {hardwareNoteAr && <p className="border-b border-teal-100 bg-teal-50 px-5 py-2 text-xs font-semibold text-teal-800">{hardwareNoteAr}</p>}
          <div className="relative aspect-[16/9] min-h-[220px] overflow-hidden bg-gradient-to-b from-[#b9eff0] via-[#dff7ef] to-[#fff3c4]">
            {!connected && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-teal-950/65">
                <span className="text-5xl">⌁</span>
                <p className="text-lg font-extrabold sm:text-2xl">اربط الحساس للبدء</p>
              </div>
            )}
            {connected && !centered && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-teal-950/65">
                <span className="text-5xl">✋</span>
                <p className="text-lg font-extrabold sm:text-2xl">بانتظار أول تمركز تلقائي…</p>
              </div>
            )}
            {connected && centered && pointer && (
              <div
                className="pointer-events-none absolute z-10 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-teal-500/75 shadow-xl"
                style={{ left: `calc(6% + ${pointer.pointer.x} * 88%)`, top: `calc(6% + ${pointer.pointer.y} * 88%)` }}
              >
                <span className="flex h-full w-full items-center justify-center text-3xl">✋</span>
              </div>
            )}
          </div>
          {connected && centered && (
            <div className="flex items-center justify-center gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
              <span className="text-xs font-bold text-slate-500">زاوية لف المعصم الحالية (مقارنة بوضع التمركز):</span>
              <span className="text-xl font-black text-teal-700" dir="ltr">{currentTwistDeg === null ? "—" : `${currentTwistDeg.toFixed(0)}°`}</span>
              {activePhase && <span className="text-xs font-bold text-slate-500">(الهدف لهذه الخطوة: {postureTargetLabel(activePhase.id)})</span>}
            </div>
          )}
        </section>

        {stage === "center" && (
          <PanelCard title="التمركز">
            <p className="text-sm text-slate-600">
              ضع يدك الآن بوضعية طبيعية ومريحة (0° لف)، ثم اضغط «تعيين المنتصف». هذا التمركز يحدث مرة واحدة فقط في بداية الاختبار؛ لا تعيد الضغط عليه عند تغيير زاوية اللف لاحقًا — هذا بالضبط ما يختبره هذا الالتقاط.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={recenter} disabled={!connected || !sample} className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-extrabold text-amber-950 disabled:opacity-40">تعيين المنتصف</button>
              <button type="button" onClick={goToDirectionCheck} disabled={!centered} className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">التالي: تحقق من الاتجاهات</button>
            </div>
          </PanelCard>
        )}

        {stage === "direction_check" && (
          <PanelCard title="تحقق من الاتجاهات — إلزامي قبل التسجيل">
            <p className="text-sm text-slate-600">
              لكل اتجاه أدناه: حرّك يدك ببطء في ذلك الاتجاه وراقب اليد الافتراضية في الأعلى، ثم اضغط «صحيح» أو «معكوس». لا يُسجَّل أي شيء في هذه الخطوة.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {DIRECTION_CHECK_ITEMS.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3">
                  <span className="text-sm font-bold text-slate-800">{item.instructionAr}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => answerDirectionCheck(item.id, "correct")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold ${directionChecks[item.id] === "correct" ? "bg-emerald-600 text-white" : "bg-emerald-100 text-emerald-700"}`}
                    >
                      ✅ صحيح
                    </button>
                    <button
                      type="button"
                      onClick={() => answerDirectionCheck(item.id, "incorrect")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold ${directionChecks[item.id] === "incorrect" ? "bg-red-600 text-white" : "bg-red-100 text-red-700"}`}
                    >
                      ❌ معكوس
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {anyDirectionIncorrect && (
              <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">
                توقف — أحد الاتجاهات معكوس أو غير صحيح. لا تُكمل التسجيل. أبلغني بالضبط أي اتجاه ظهر خاطئًا قبل المتابعة.
              </p>
            )}
            <button
              type="button"
              onClick={startGuided}
              disabled={!allDirectionsCorrect}
              className="mt-4 rounded-xl bg-teal-600 px-6 py-3 text-base font-bold text-white disabled:opacity-40"
            >
              كل الاتجاهات صحيحة — ابدأ الالتقاط
            </button>
          </PanelCard>
        )}

        {stage === "guided" && activePhase && (
          <PanelCard title={`الخطوة ${phaseIndex! + 1} من ${TWIST_INVARIANCE_SESSION_PHASES.length}`}>
            <h3 className="text-3xl font-black text-teal-950">{activePhase.titleAr}</h3>
            <p className="mt-3 text-base leading-relaxed text-teal-900/80">{activePhase.instructionAr}</p>
            <p className="mt-4 text-xs font-bold text-teal-700">سُجلت {phaseSamples} عينة {phaseSamples < minSamplesForActivePhase ? `(الحد الأدنى ${minSamplesForActivePhase})` : "— جاهز للمتابعة"}</p>
            <button
              type="button"
              onClick={advanceGuided}
              disabled={phaseSamples < minSamplesForActivePhase}
              className="mt-4 rounded-xl bg-teal-600 px-6 py-3 text-base font-bold text-white disabled:opacity-40"
            >
              جاهز — الخطوة التالية
            </button>
          </PanelCard>
        )}

        {stage === "summary" && (
          <PanelCard title="انتهى الالتقاط">
            <p className="text-sm text-slate-600">تم تسجيل {recordCount} عينة عبر {TWIST_INVARIANCE_SESSION_PHASES.length} خطوة قصيرة. اضغط الزر أدناه لتنزيل ملف الجلسة كاملًا (لا يُرسل شيء تلقائيًا).</p>
            <button type="button" onClick={downloadSession} className="mt-4 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white">تنزيل ملف الالتقاط (JSON)</button>
          </PanelCard>
        )}

        <p className="pb-2 text-center text-xs text-slate-500">لا تُرسل هذه الصفحة بيانات إلى Firebase أو Munsit. لا يوجد حفظ دائم على الحساس (بدون أمر Save).</p>
      </div>
    </main>
  );
}

function PanelCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-teal-200 bg-white p-5 shadow-sm">
      <h2 className="font-bold text-slate-900">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
