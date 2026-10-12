"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ConnectionState,
  ContinuousMotionController,
  MOTION_DIAGNOSTIC_PHASES,
  type ContinuousMotionConfig,
  type MotionDiagnosticPhaseId,
  type MotionDiagnosticRecord,
  type MotionFilterMode,
  type MotionLatencySummary,
  type MotionSample,
  type NormalizedPointer,
  type OrientationAxis,
  PhysicalInputManager,
  PhysicalRole,
  WITMOTION_OUTPUT_RATE_CODES,
  Wt901BleInputSource,
  analyzeRotationInPlace,
  createUncalibratedProfile,
  runTemporaryWitmotionRateTrial,
  summarizeMotionLatency,
  type RotationDiagnosticAnalysis,
  type SemanticDetector,
  type WitmotionRateTrialResult,
} from "@/lib/physicalInput";
import { CanonicalBalloonContactDemo } from "./CanonicalBalloonContactDemo";

const PASSIVE_DETECTOR: SemanticDetector = { reset: () => {}, observe: () => null };
const SAVED_RATE_KEY = "shumos-wt901-right-hand-original-rate";

const AXIS_LABELS: Record<OrientationAxis, string> = {
  roll: "Roll — التفاف",
  pitch: "Pitch — ميل",
  yaw: "Yaw — اتجاه",
};

const FILTERS: readonly { mode: MotionFilterMode; short: string; label: string }[] = [
  { mode: "LIGHT_EMA", short: "A", label: "أسرع" },
  { mode: "ADAPTIVE_EMA", short: "B", label: "متوازن" },
  { mode: "ONE_EURO", short: "C", label: "ذكي" },
];

interface LiveMetrics {
  readonly sampleRateHz: number;
  readonly parsingMs: number | null;
  readonly controllerMs: number | null;
  readonly filterMs: number | null;
  readonly visualMs: number | null;
}

const EMPTY_METRICS: LiveMetrics = { sampleRateHz: 0, parsingMs: null, controllerMs: null, filterMs: null, visualMs: null };

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message === "WEB_BLUETOOTH_UNAVAILABLE") return "هذا المتصفح لا يدعم Web Bluetooth. استخدم Chrome أو Edge على جهاز Mac.";
  if (error instanceof DOMException && error.name === "NotFoundError") return "لم يتم اختيار حساس.";
  return "تعذّر الاتصال. أغلق تطبيق WITMOTION، تأكد من تشغيل الحساس، ثم حاول مرة أخرى.";
}

export function SensorHandDemoScreen() {
  const sourceRef = useRef<Wt901BleInputSource | null>(null);
  const managerRef = useRef<PhysicalInputManager | null>(null);
  const controllerRef = useRef<ContinuousMotionController | null>(null);
  const latestSampleRef = useRef<MotionSample | null>(null);
  const sampleTimesRef = useRef<number[]>([]);
  const recordsRef = useRef<MotionDiagnosticRecord[]>([]);
  const activePhaseRef = useRef<MotionDiagnosticPhaseId | null>(null);
  const lastRecordRef = useRef<MotionDiagnosticRecord | null>(null);
  const [connection, setConnection] = useState(ConnectionState.DISCONNECTED);
  const [sample, setSample] = useState<MotionSample | null>(null);
  const [pointer, setPointer] = useState<NormalizedPointer | null>(null);
  const [centered, setCentered] = useState(false);
  const [metrics, setMetrics] = useState<LiveMetrics>(EMPTY_METRICS);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<ContinuousMotionConfig>(() => new ContinuousMotionController().currentConfig);
  const [diagnosticIndex, setDiagnosticIndex] = useState<number | null>(null);
  const [phaseSamples, setPhaseSamples] = useState(0);
  const [recordCount, setRecordCount] = useState(0);
  const [diagnosticComplete, setDiagnosticComplete] = useState(false);
  const [rotationAnalysis, setRotationAnalysis] = useState<RotationDiagnosticAnalysis | null>(null);
  const [latencySummary, setLatencySummary] = useState<MotionLatencySummary | null>(null);
  const [rateStatus, setRateStatus] = useState<string | null>(null);
  const [rateTrials, setRateTrials] = useState<WitmotionRateTrialResult[]>([]);
  const [savedRateCode, setSavedRateCode] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = localStorage.getItem(SAVED_RATE_KEY);
      if (saved !== null && Number.isInteger(Number(saved))) setSavedRateCode(Number(saved));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const source = new Wt901BleInputSource();
    const manager = new PhysicalInputManager();
    const controller = new ContinuousMotionController(config);
    sourceRef.current = source;
    managerRef.current = manager;
    controllerRef.current = controller;
    manager.assignRole(PhysicalRole.RIGHT_HAND, source, PASSIVE_DETECTOR, createUncalibratedProfile(PhysicalRole.RIGHT_HAND));
    manager.attachContinuousController(PhysicalRole.RIGHT_HAND, controller);

    const unsubscribeConnection = source.onConnectionStateChange((state) => {
      setConnection(state);
      if (state === ConnectionState.DISCONNECTED || state === ConnectionState.ERROR) {
        setPointer(null);
        setCentered(false);
        setSample(null);
        latestSampleRef.current = null;
        sampleTimesRef.current = [];
        setMetrics(EMPTY_METRICS);
      }
    });
    const unsubscribeSample = manager.onSampleObserved((role, nextSample) => {
      if (role !== PhysicalRole.RIGHT_HAND) return;
      latestSampleRef.current = nextSample;
      setSample(nextSample);
      const arrival = performance.now();
      const recent = [...sampleTimesRef.current, arrival].filter((time) => time >= arrival - 2000);
      sampleTimesRef.current = recent;
      const seconds = recent.length > 1 ? (recent.at(-1)! - recent[0]) / 1000 : 0;
      setMetrics((previous) => ({ ...previous, sampleRateHz: seconds > 0 ? (recent.length - 1) / seconds : 0 }));
    });
    const unsubscribePointer = manager.onPointerChanged((role, nextPointer) => {
      if (role !== PhysicalRole.RIGHT_HAND) return;
      setPointer(nextPointer);
      if (!nextPointer) {
        setCentered(false);
        return;
      }
      const timing = nextPointer.timing;
      setMetrics((previous) => ({
        ...previous,
        parsingMs: timing.parsedAtMs - timing.parsingStartedAtMs,
        controllerMs: timing.pointerOutputAtMs - timing.controllerStartedAtMs,
        filterMs: timing.filterCompletedAtMs - timing.filterStartedAtMs,
      }));

      const phase = activePhaseRef.current;
      const latestSample = latestSampleRef.current;
      if (phase && latestSample?.timestampMs === nextPointer.timestampMs) {
        const record: MotionDiagnosticRecord = { phase, sample: latestSample, output: nextPointer };
        recordsRef.current.push(record);
        lastRecordRef.current = record;
        setPhaseSamples((count) => count + 1);
        setRecordCount(recordsRef.current.length);
      }
      requestAnimationFrame((frameAtMs) => {
        if (lastRecordRef.current?.output.timestampMs === nextPointer.timestampMs) lastRecordRef.current.visualFrameAtMs = frameAtMs;
        setMetrics((previous) => ({ ...previous, visualMs: Math.max(0, frameAtMs - timing.pointerOutputAtMs) }));
      });
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
    // The hardware connection lives for the route lifetime; configuration is updated imperatively.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (!pointer) return;
    if (lastRecordRef.current?.output.timestampMs === pointer.timestampMs) lastRecordRef.current.uiCommittedAtMs = performance.now();
  }, [pointer]);

  function updateConfig(patch: Partial<ContinuousMotionConfig>): void {
    setConfig((previous) => ({ ...previous, ...patch }));
    controllerRef.current?.updateConfig(patch);
  }

  async function connect(): Promise<void> {
    setError(null);
    try { await managerRef.current?.connect(PhysicalRole.RIGHT_HAND); }
    catch (caught) { setError(errorMessage(caught)); }
  }

  async function disconnect(): Promise<void> {
    setError(null);
    await managerRef.current?.disconnect(PhysicalRole.RIGHT_HAND);
  }

  function recenter(): void {
    const didCenter = controllerRef.current?.recenter() ?? false;
    if (!didCenter) { setError("انتظر وصول قراءة من الحساس أولاً."); return; }
    setError(null);
    setCentered(true);
    setPointer(controllerRef.current?.currentPointer ?? null);
  }

  function startDiagnostic(): void {
    recordsRef.current = [];
    lastRecordRef.current = null;
    setRotationAnalysis(null);
    setLatencySummary(null);
    setDiagnosticComplete(false);
    setPhaseSamples(0);
    setRecordCount(0);
    setDiagnosticIndex(0);
    activePhaseRef.current = MOTION_DIAGNOSTIC_PHASES[0].id;
  }

  function advanceDiagnostic(): void {
    if (diagnosticIndex === null) return;
    const nextIndex = diagnosticIndex + 1;
    if (nextIndex < MOTION_DIAGNOSTIC_PHASES.length) {
      setDiagnosticIndex(nextIndex);
      setPhaseSamples(0);
      activePhaseRef.current = MOTION_DIAGNOSTIC_PHASES[nextIndex].id;
      return;
    }
    activePhaseRef.current = null;
    setDiagnosticIndex(null);
    setDiagnosticComplete(true);
    setRotationAnalysis(analyzeRotationInPlace(recordsRef.current, config));
    setLatencySummary(summarizeMotionLatency(recordsRef.current));
  }

  function applySuggestedCompensation(): void {
    if (!rotationAnalysis) return;
    const update: Partial<ContinuousMotionConfig> = {
      ...(rotationAnalysis.suggestedCompensationX === null ? {} : { rotationCompensationX: rotationAnalysis.suggestedCompensationX }),
      ...(rotationAnalysis.suggestedCompensationY === null ? {} : { rotationCompensationY: rotationAnalysis.suggestedCompensationY }),
    };
    updateConfig(update);
    recenter();
  }

  function downloadDiagnostic(): void {
    const payload = { capturedAt: new Date().toISOString(), role: PhysicalRole.RIGHT_HAND, config, rotationAnalysis, latency: summarizeMotionLatency(recordsRef.current), rateTrials, records: recordsRef.current };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `wt901-right-hand-diagnostic-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function runRateTrial(rate: 20 | 50): Promise<void> {
    const source = sourceRef.current;
    if (!source) return;
    setRateStatus(`جاري اختبار ${rate} Hz ثم استعادة الإعداد السابق…`);
    try {
      const result = await runTemporaryWitmotionRateTrial(source, rate, {
        onOriginalRateRead: (code) => {
          setSavedRateCode(code);
          localStorage.setItem(SAVED_RATE_KEY, String(code));
        },
      });
      setRateTrials((trials) => [...trials, result]);
      setRateStatus(`تم القياس: ${result.measuredHz.toFixed(1)} Hz — الاستعادة: ${result.restored ? "نعم" : "لا"}${result.unstable ? " — الاتصال غير مستقر" : ""}`);
    } catch {
      setRateStatus("توقف الاختبار بأمان. إذا انقطع الاتصال، أعد الربط واضغط «استعادة الإعداد المحفوظ».");
    }
  }

  async function restoreSavedRate(): Promise<void> {
    if (savedRateCode === null || !sourceRef.current) return;
    try {
      await sourceRef.current.restoreOutputRateCode(savedRateCode);
      setRateStatus(`تمت استعادة رمز المعدل السابق 0x${savedRateCode.toString(16).padStart(2, "0")}.`);
    } catch {
      setRateStatus("تعذرت الاستعادة. تأكد أن الحساس متصل ثم حاول مجددًا.");
    }
  }

  const [roll, pitch, yaw] = sample?.anglesDeg ?? [0, 0, 0];
  const connected = connection === ConnectionState.CONNECTED;
  const connecting = connection === ConnectionState.CONNECTING;
  const activePhase = diagnosticIndex === null ? null : MOTION_DIAGNOSTIC_PHASES[diagnosticIndex];

  return (
    <main dir="rtl" lang="ar" className="min-h-dvh bg-[#eff9f8] text-slate-900" style={{ fontFamily: "var(--font-control), system-ui, sans-serif" }}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-7 lg:py-7">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div><span className="text-xs font-bold text-teal-700">تشخيص RIGHT_HAND · حساس حقيقي</span><h1 className="mt-1 text-2xl font-bold sm:text-3xl">مختبر الحركة والاستجابة</h1></div>
          <Link href="/control" className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm">رجوع</Link>
        </header>

        <section className="overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-xl shadow-teal-950/10">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2"><StatusDot state={connection} /><div><p className="text-sm font-bold">{connectionLabel(connection)}</p><p className="text-xs text-slate-500">{centered ? "تم تعيين المنتصف" : "ثبّت يدك بوضع مريح ثم عيّن المنتصف"}</p></div></div>
            <div className="flex flex-wrap gap-2">
              {connected ? <button type="button" onClick={disconnect} className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-600">فصل</button> : <button type="button" onClick={connect} disabled={connecting} className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{connecting ? "جاري الاتصال…" : "ربط WT901BLECL"}</button>}
              <button type="button" onClick={recenter} disabled={!connected || !sample} className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-extrabold text-amber-950 disabled:opacity-40">تعيين المنتصف</button>
            </div>
          </div>
          {error && <p role="alert" className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">{error}</p>}
          <div className="relative aspect-[16/9] min-h-[360px] overflow-hidden bg-gradient-to-b from-[#b9eff0] via-[#dff7ef] to-[#fff3c4]">
            <PlaygroundDecoration />
            {!connected && <AreaMessage icon="⌁" text="اربط الحساس لبدء التتبع الحقيقي" />}
            {connected && !centered && <AreaMessage icon="✋" text="ضع يدك في المنتصف واضغط «تعيين المنتصف»" />}
            {connected && centered && pointer && <VirtualHand pointer={pointer} />}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 font-bold">القياسات الحية</h2>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Telemetry label="X" value={pointer ? pointer.pointer.x.toFixed(3) : "—"} /><Telemetry label="Y" value={pointer ? pointer.pointer.y.toFixed(3) : "—"} />
              <Telemetry label="Roll" value={sample ? `${roll.toFixed(1)}°` : "—"} /><Telemetry label="Pitch" value={sample ? `${pitch.toFixed(1)}°` : "—"} /><Telemetry label="Yaw" value={sample ? `${yaw.toFixed(1)}°` : "—"} />
              <Telemetry label="العينات" value={metrics.sampleRateHz ? `${metrics.sampleRateHz.toFixed(1)} Hz` : "—"} /><Telemetry label="التحليل" value={formatMs(metrics.parsingMs)} /><Telemetry label="المتحكم" value={formatMs(metrics.controllerMs)} /><Telemetry label="المرشح" value={formatMs(metrics.filterMs)} /><Telemetry label="إطار العرض" value={formatMs(metrics.visualMs)} />
            </dl>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 font-bold">مقارنة المرشحات</h2>
            <div className="grid grid-cols-3 gap-2">{FILTERS.map((filter) => <button key={filter.mode} type="button" onClick={() => updateConfig({ filterMode: filter.mode })} className={`rounded-xl px-2 py-3 text-sm font-bold ${config.filterMode === filter.mode ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600"}`}><span dir="ltr">{filter.short}</span><small className="mt-1 block text-[10px] opacity-80">{filter.label}</small></button>)}</div>
            <div className="mt-4 space-y-4">
              <RangeControl label="حساسية الحركة" value={config.sensitivity} min={0.5} max={4} step={0.1} display={`${config.sensitivity.toFixed(1)}×`} onChange={(sensitivity) => updateConfig({ sensitivity })} />
              <RangeControl label="نعومة الحركة" value={config.smoothing} min={0} max={0.85} step={0.05} display={`${Math.round(config.smoothing * 100)}%`} onChange={(smoothing) => updateConfig({ smoothing })} />
              <RangeControl label="المنطقة الهادئة" value={config.deadZoneDeg} min={0} max={6} step={0.25} display={`${config.deadZoneDeg.toFixed(2)}°`} onChange={(deadZoneDeg) => updateConfig({ deadZoneDeg })} />
            </div>
            <details className="mt-5 border-t border-slate-100 pt-4"><summary className="cursor-pointer text-sm font-bold text-teal-700">المحاور والاتجاه</summary><div className="mt-4 grid grid-cols-2 gap-3"><AxisControl label="أفقي" value={config.xAxis} onChange={(xAxis) => updateConfig({ xAxis })} /><AxisControl label="رأسي" value={config.yAxis} onChange={(yAxis) => updateConfig({ yAxis })} /><AxisControl label="الدوران" value={config.rotationAxis} onChange={(rotationAxis) => updateConfig({ rotationAxis })} /><div className="flex flex-col justify-end gap-2 text-sm font-semibold text-slate-600"><Check label="عكس أفقي" checked={config.invertX} onChange={(invertX) => updateConfig({ invertX })} /><Check label="عكس رأسي" checked={config.invertY} onChange={(invertY) => updateConfig({ invertY })} /><Check label="عكس الدوران" checked={config.invertRotation} onChange={(invertRotation) => updateConfig({ invertRotation })} /></div></div></details>
          </div>
        </section>

        <section className="rounded-3xl border border-teal-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">التسجيل التشخيصي الموجّه</h2><p className="mt-1 text-xs text-slate-500">أنت تحدد وقت الانتقال؛ لا يوجد مؤقت مستعجل.</p></div>{diagnosticIndex === null && !diagnosticComplete && <button type="button" onClick={startDiagnostic} disabled={!connected || !centered} className="rounded-xl bg-teal-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">ابدأ التسجيل</button>}</div>
          {activePhase && <div className="mt-5 rounded-2xl bg-teal-50 p-6 text-center"><span className="text-xs font-bold text-teal-700">الخطوة {diagnosticIndex! + 1} من {MOTION_DIAGNOSTIC_PHASES.length}</span><h3 className="mt-2 text-2xl font-black text-teal-950">{activePhase.titleAr}</h3><p className="mt-2 text-sm text-teal-900/70">{activePhase.instructionAr}</p><p className="mt-3 text-xs font-bold text-teal-700">سُجلت {phaseSamples} عينة</p><button type="button" onClick={advanceDiagnostic} disabled={phaseSamples < 5} className="mt-4 rounded-xl bg-teal-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-40">{diagnosticIndex === MOTION_DIAGNOSTIC_PHASES.length - 1 ? "إنهاء وتحليل" : "تم، الخطوة التالية"}</button></div>}
          {diagnosticComplete && <DiagnosticResult analysis={rotationAnalysis} latency={latencySummary} recordCount={recordCount} onApply={applySuggestedCompensation} onDownload={downloadDiagnostic} />}
        </section>

        <section className="rounded-3xl border border-amber-200 bg-amber-50/60 p-5">
          <h2 className="font-bold">اختبار معدل الإرسال الآمن</h2><p className="mt-1 text-xs leading-5 text-slate-600">اختياري بعد الاختبار الأساسي. يقرأ الإعداد الحالي أولًا، يختبر مؤقتًا، ثم يستعيده تلقائيًا. لا يحفظ معدل التجربة داخل الحساس.</p>
          <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={!connected || rateStatus?.startsWith("جاري")} onClick={() => runRateTrial(20)} className="rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-amber-950 disabled:opacity-40">اختبار 20 Hz</button><button type="button" disabled={!connected || rateStatus?.startsWith("جاري")} onClick={() => runRateTrial(50)} className="rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-amber-950 disabled:opacity-40">اختبار 50 Hz</button><button type="button" disabled={!connected || savedRateCode === null} onClick={restoreSavedRate} className="rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-bold text-amber-800 disabled:opacity-40">استعادة الإعداد المحفوظ</button></div>
          {rateStatus && <p className="mt-3 text-sm font-semibold text-amber-900">{rateStatus}</p>}{savedRateCode !== null && <p className="mt-2 text-xs text-slate-500">الإعداد الأصلي المحفوظ: {rateLabel(savedRateCode)}</p>}
        </section>

        {diagnosticComplete ? <CanonicalBalloonContactDemo pointer={pointer} connected={connected} /> : <section className="rounded-3xl border border-dashed border-slate-300 p-5 text-center text-sm font-semibold text-slate-500">اختبار اللعبة سيظهر بعد إكمال التسجيل التشخيصي.</section>}
        <p className="pb-2 text-center text-xs text-slate-500">لا تُرسل هذه الصفحة بيانات إلى Firebase أو Munsit.</p>
      </div>
    </main>
  );
}

function formatMs(value: number | null): string { return value === null ? "—" : `${value.toFixed(2)} ms`; }
function rateLabel(code: number): string { const match = Object.entries(WITMOTION_OUTPUT_RATE_CODES).find(([, value]) => value === code); return match ? `${match[0]} Hz (0x${code.toString(16).padStart(2, "0")})` : `0x${code.toString(16).padStart(2, "0")}`; }
function connectionLabel(state: ConnectionState): string { if (state === ConnectionState.CONNECTED) return "متصل ويستقبل بيانات"; if (state === ConnectionState.CONNECTING) return "جاري الاتصال…"; if (state === ConnectionState.ERROR) return "خطأ في الاتصال"; return "غير متصل"; }
function StatusDot({ state }: { state: ConnectionState }) { const color = state === ConnectionState.CONNECTED ? "bg-emerald-500" : state === ConnectionState.CONNECTING ? "bg-amber-400" : "bg-slate-300"; return <span className={`h-3 w-3 rounded-full ${color}`} />; }
function PlaygroundDecoration() { return <div aria-hidden="true" className="absolute inset-0"><div className="absolute -top-16 -right-12 h-56 w-56 rounded-full bg-white/30" /><div className="absolute top-[18%] left-[10%] h-16 w-16 rounded-full border-4 border-white/35" /><div className="absolute inset-x-0 top-1/2 border-t border-dashed border-teal-900/10" /><div className="absolute inset-y-0 left-1/2 border-l border-dashed border-teal-900/10" /></div>; }
function AreaMessage({ icon, text }: { icon: string; text: string }) { return <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-teal-950/65"><span className="text-5xl">{icon}</span><p className="text-lg font-extrabold sm:text-2xl">{text}</p></div>; }

function VirtualHand({ pointer }: { pointer: NormalizedPointer }) {
  return <div className="absolute z-10 h-24 w-24 drop-shadow-[0_12px_14px_rgba(15,118,110,0.24)] will-change-transform sm:h-28 sm:w-28" style={{ left: `${6 + pointer.pointer.x * 88}%`, top: `${9 + pointer.pointer.y * 82}%`, transform: `translate(-50%, -50%) rotate(${pointer.visualOrientation.rotationDeg}deg)` }} aria-label={`موضع اليد: ${pointer.pointer.x.toFixed(2)}, ${pointer.pointer.y.toFixed(2)}`}><svg viewBox="0 0 120 120" aria-hidden="true" className="h-full w-full"><defs><linearGradient id="hand-glove" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#c9f4ec" /></linearGradient></defs><path d="M38 55V24c0-7 11-7 11 0v25-35c0-8 12-8 12 0v34-29c0-8 12-8 12 0v31-21c0-8 12-8 12 0v35l8-10c8-10 18 0 12 9L88 91c-7 11-17 17-31 17-20 0-35-13-40-29l-6-19c-3-10 10-15 15-6l12 18V55Z" fill="url(#hand-glove)" stroke="#0f766e" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /><circle cx="58" cy="79" r="8" fill="#fbbf24" /></svg></div>;
}

function Telemetry({ label, value }: { label: string; value: string }) { return <div className="min-h-20 rounded-2xl bg-slate-50 p-3"><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd dir="ltr" className="mt-2 text-sm font-bold tabular-nums text-slate-800">{value}</dd></div>; }
function RangeControl({ label, value, min, max, step, display, onChange }: { label: string; value: number; min: number; max: number; step: number; display: string; onChange: (value: number) => void }) { return <label className="block"><span className="mb-2 flex justify-between text-sm font-semibold text-slate-600"><span>{label}</span><strong dir="ltr" className="text-teal-700">{display}</strong></span><input className="w-full accent-teal-600" type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>; }
function AxisControl({ label, value, onChange }: { label: string; value: OrientationAxis; onChange: (axis: OrientationAxis) => void }) { return <label className="text-xs font-semibold text-slate-500">{label}<select className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2 text-sm" value={value} onChange={(event) => onChange(event.target.value as OrientationAxis)}>{(Object.keys(AXIS_LABELS) as OrientationAxis[]).map((axis) => <option key={axis} value={axis}>{AXIS_LABELS[axis]}</option>)}</select></label>; }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) { return <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-teal-600" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>; }

function DiagnosticResult({ analysis, latency, recordCount, onApply, onDownload }: { analysis: RotationDiagnosticAnalysis | null; latency: MotionLatencySummary | null; recordCount: number; onApply: () => void; onDownload: () => void }) {
  const disagreesX = analysis?.directionalCompensationX.agree === false;
  const disagreesY = analysis?.directionalCompensationY.agree === false;
  return <div className="mt-5 rounded-2xl bg-emerald-50 p-5"><h3 className="font-black text-emerald-800">اكتمل التسجيل — {recordCount} عينة</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{analysis?.phases.map((phase) => <div key={phase.phase} className="rounded-xl bg-white p-3 text-xs text-slate-600"><strong className="block text-slate-800">{phase.phase === "rotate_one" ? "اللف الأول" : "اللف المعاكس"}</strong><span className="mt-1 block">الإزاحة قبل اللف: {phase.pointerDisplacementBeforeRotation.toFixed(4)}</span><span className="block">أقصى انحراف: {phase.maximumPointerDrift.toFixed(4)}</span><span className="block">الانحراف النهائي: {phase.finalPointerDrift.toFixed(4)}</span><span className="block">الدوران المرئي: {phase.visualRotationAmountDeg.toFixed(1)}°</span></div>)}</div><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-3"><span>فاصل العينة: {formatMs(latency?.sampleIntervalMs ?? null)}</span><span>التحليل: {formatMs(latency?.parsingLatencyMs ?? null)}</span><span>المتحكم: {formatMs(latency?.controllerLatencyMs ?? null)}</span><span>المرشح: {formatMs(latency?.filterProcessingMs ?? null)}</span><span>المؤشر ← العرض: {formatMs(latency?.outputToVisualFrameMs ?? null)}</span><span>BLE ← العرض: {formatMs(latency?.notificationToVisualFrameMs ?? null)}</span></div>
    <div className="mt-4 rounded-xl bg-white p-4 text-xs text-slate-600">
      <p className="font-bold text-slate-800">تعويض الدوران — لكل اتجاه على حدة (قبل التصديق على الرقم المجمّع)</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <DirectionalRow label="X (أفقي)" data={analysis?.directionalCompensationX ?? null} pooled={analysis?.suggestedCompensationX ?? null} />
        <DirectionalRow label="Y (رأسي)" data={analysis?.directionalCompensationY ?? null} pooled={analysis?.suggestedCompensationY ?? null} />
      </div>
      {(disagreesX || disagreesY) && <p className="mt-3 rounded-lg bg-amber-50 p-3 font-semibold text-amber-800">⚠ الاتجاهان مختلفان بشكل ملحوظ{disagreesX && !disagreesY ? " في X" : disagreesX && disagreesY ? " في X و Y" : " في Y"}. الرقم المجمّع أدناه تسوية بين الاثنين وليس قياسًا دقيقًا لأي منهما — طبّقه ثم تحقق حيًا باللف الفعلي قبل أن تعتبره صحيحًا.</p>}
    </div>
    <p className="mt-3 text-xs text-slate-600">تعويض X المجمّع: {analysis?.suggestedCompensationX?.toFixed(4) ?? "غير كافٍ"} · تعويض Y المجمّع: {analysis?.suggestedCompensationY?.toFixed(4) ?? "غير كافٍ"}</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={onApply} disabled={!analysis || (analysis.suggestedCompensationX === null && analysis.suggestedCompensationY === null)} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">تطبيق التعويض المقترح وإعادة المنتصف</button><button type="button" onClick={onDownload} className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-emerald-700">تنزيل التقرير</button></div></div>;
}

function DirectionalRow({ label, data, pooled }: { label: string; data: { rotate_one: number | null; rotate_other: number | null; agree: boolean | null } | null; pooled: number | null }) {
  const fmt = (value: number | null) => (value === null ? "—" : value.toFixed(4));
  return <div className="rounded-lg bg-slate-50 p-3"><strong className="block text-slate-800">{label}</strong>
    <span className="mt-1 block">اللف الأول: {fmt(data?.rotate_one ?? null)}</span>
    <span className="block">اللف المعاكس: {fmt(data?.rotate_other ?? null)}</span>
    <span className="block">المجمّع: {fmt(pooled)}</span>
    <span className={`mt-1 block font-bold ${data?.agree === false ? "text-amber-700" : data?.agree === true ? "text-emerald-700" : "text-slate-400"}`}>{data?.agree === false ? "غير متوافقين" : data?.agree === true ? "متوافقان" : "بيانات غير كافية"}</span>
  </div>;
}
