"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ConnectionState,
  ContinuousMotionController,
  EDGE_REVERSAL_PHASES,
  FINAL_SESSION_PHASES,
  FREE_PLAY_PHASE_ID,
  PhysicalInputManager,
  PhysicalRole,
  RECENTER_TEST_PHASE_ID,
  Wt901BleInputSource,
  analyzeRotationInPlace,
  buildRightHandSessionProfile,
  createUncalibratedProfile,
  measureEdgeReversalResponse,
  recommendConfig,
  runWitmotionConfigComparison,
  summarizeMotionLatency,
  witmotionBandwidthCodeToHz,
  type ContinuousMotionConfig,
  type MotionDiagnosticRecord,
  type MotionSample,
  type NormalizedPointer,
  type RightHandSessionProfile,
  type SemanticDetector,
  type WitmotionConfigCandidate,
  type WitmotionConfigTrialResult,
} from "@/lib/physicalInput";

/**
 * TODAY'S LIVE SESSION — the ONE Arabic guided orchestrator prepared last
 * night's brief asked for (Phase 1: "finish ONE Arabic guided session UI").
 * Owns its OWN Wt901BleInputSource/PhysicalInputManager/
 * ContinuousMotionController (same isolation pattern as
 * SensorHandDemoScreen.tsx — never touches the shared SensorRuntimeProvider
 * or Firebase), so today's hardware-config experiments (temporary rate +
 * bandwidth changes) can never leak into a real game session.
 *
 * Stages, in order: connect -> config comparison (Phase 2) -> center ->
 * guided phases (Phase 4-9, reusing FINAL_SESSION_PHASES — see that file's
 * doc comment for why still/tiny/range/speed/twist are ALL just the
 * existing MOTION_DIAGNOSTIC_PHASES, only edge-reversal is new) ->
 * recenter test (Phase 10) -> free play (Phase 12) -> summary/profile
 * (Phase 13) with one JSON download containing everything (records +
 * hardware comparison + generated profile) in the same shape
 * build_manifest.py already ingests, plus the new fields.
 */

const PASSIVE_DETECTOR: SemanticDetector = { reset: () => {}, observe: () => null };
const MIN_PHASE_SAMPLES = 20;
const MIN_MOVEMENT_SAMPLES = 15;
const MIN_FREE_PLAY_MS = 40_000;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message === "WEB_BLUETOOTH_UNAVAILABLE") return "هذا المتصفح لا يدعم Web Bluetooth. استخدم Chrome أو Edge.";
  if (error instanceof DOMException && error.name === "NotFoundError") return "لم يتم اختيار حساس.";
  return "تعذّر الاتصال. أغلق تطبيق WITMOTION، تأكد من تشغيل الحساس، ثم حاول مرة أخرى.";
}

type Stage = "connect" | "config_compare" | "center" | "guided" | "recenter_test" | "free_play" | "summary";

/**
 * Explicit per-phase (axis, saturated-edge-value) lookup for
 * measureEdgeReversalResponse — deliberately NOT derived by matching
 * substrings of the phase id (e.g. `.includes("right")`), because
 * "edge_left_reverse_right" contains "right" as a substring (from
 * "reverse_right") and would misclassify that LEFT-edge phase as the RIGHT
 * edge. y=0 is UP and y=1 is DOWN, matching the same convention already
 * established by ContinuousMotionController.test.ts's "holding UP"/
 * "holding DOWN" suite (yAxis=pitch, invertY=false).
 */
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

export function RightHandFinalSessionScreen() {
  const sourceRef = useRef<Wt901BleInputSource | null>(null);
  const managerRef = useRef<PhysicalInputManager | null>(null);
  const controllerRef = useRef<ContinuousMotionController | null>(null);
  const latestSampleRef = useRef<MotionSample | null>(null);
  const recordsRef = useRef<MotionDiagnosticRecord[]>([]);
  const eventsRef = useRef<SessionEvent[]>([]);
  const activePhaseRef = useRef<string | null>(null);
  const lastRecordRef = useRef<MotionDiagnosticRecord | null>(null);

  const [connection, setConnection] = useState(ConnectionState.DISCONNECTED);
  const [sample, setSample] = useState<MotionSample | null>(null);
  const [pointer, setPointer] = useState<NormalizedPointer | null>(null);
  const [centered, setCentered] = useState(false);
  const [liveRateHz, setLiveRateHz] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // autoCenter: true — this session validates the REAL production experience (SensorRuntimeProvider
  // also uses autoCenter: true), not the older manual-only diagnostic lab's default.
  const [config, setConfig] = useState<ContinuousMotionConfig>(() => ({ ...new ContinuousMotionController().currentConfig, autoCenter: true }));
  const [stage, setStage] = useState<Stage>("connect");

  // Phase 2 — config comparison.
  const [comparisonRunning, setComparisonRunning] = useState(false);
  const [comparisonStatusAr, setComparisonStatusAr] = useState<string | null>(null);
  const [comparisonResults, setComparisonResults] = useState<WitmotionConfigTrialResult[]>([]);
  const [chosenLabel, setChosenLabel] = useState<string | null>(null);
  const [finalHardwareApplied, setFinalHardwareApplied] = useState<{ rateHz: number; bandwidthHz: number } | null>(null);
  const [explicitlyRecentered, setExplicitlyRecentered] = useState(false);

  // Phase 4-9 — guided phases (reuses the diagnostic-lab pattern).
  const [phaseIndex, setPhaseIndex] = useState<number | null>(null);
  const [phaseSamples, setPhaseSamples] = useState(0);

  // Phase 10 — recenter test.
  const [recenterSubstep, setRecenterSubstep] = useState<"awkward" | "pressed" | "confirmed">("awkward");
  const [recenterSamples, setRecenterSamples] = useState(0);
  const [phantomContactWarning, setPhantomContactWarning] = useState(false);

  // Phase 12 — free play.
  const [freePlayRunning, setFreePlayRunning] = useState(false);
  const [freePlaySamples, setFreePlaySamples] = useState(0);
  const [freePlayStartedAtMs, setFreePlayStartedAtMs] = useState<number | null>(null);
  const [freePlayNowMs, setFreePlayNowMs] = useState(0);

  const [profile, setProfile] = useState<RightHandSessionProfile | null>(null);
  const [recordCount, setRecordCount] = useState(0);

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
        const record: MotionDiagnosticRecord = { phase, sample: latestSample, output: nextPointer };
        recordsRef.current.push(record);
        lastRecordRef.current = record;
        setRecordCount((count) => count + 1);
        if (phase === FREE_PLAY_PHASE_ID) setFreePlaySamples((count) => count + 1);
        else if (phase === RECENTER_TEST_PHASE_ID) setRecenterSamples((count) => count + 1);
        else setPhaseSamples((count) => count + 1);
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
    // The hardware connection lives for the route lifetime; configuration is updated imperatively.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!freePlayRunning || freePlayStartedAtMs === null) return;
    const timer = window.setInterval(() => setFreePlayNowMs(performance.now()), 250);
    return () => window.clearInterval(timer);
  }, [freePlayRunning, freePlayStartedAtMs]);

  function updateConfig(patch: Partial<ContinuousMotionConfig>): void {
    setConfig((previous) => ({ ...previous, ...patch }));
    controllerRef.current?.updateConfig(patch);
  }

  async function connect(): Promise<void> {
    setError(null);
    try {
      await managerRef.current?.connect(PhysicalRole.RIGHT_HAND);
      setStage("config_compare");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function recenter(logEvent: boolean): boolean {
    const didCenter = controllerRef.current?.recenter() ?? false;
    if (!didCenter) {
      setError("انتظر وصول قراءة من الحساس أولاً.");
      return false;
    }
    setError(null);
    setPointer(controllerRef.current?.currentPointer ?? null);
    if (stage === "center") setExplicitlyRecentered(true);
    if (logEvent) eventsRef.current.push({ type: "recenter", atMs: performance.now(), noteAr: "ضغط زر إعادة تعيين المنتصف أثناء اختبار Phase 10" });
    return true;
  }

  // ---------- Phase 2: hardware config comparison ----------

  async function runComparison(): Promise<void> {
    const source = sourceRef.current;
    if (!source || connection !== ConnectionState.CONNECTED) return;
    setComparisonRunning(true);
    setComparisonResults([]);
    setComparisonStatusAr("جاري قراءة الإعداد الحالي…");
    try {
      const currentBandwidthCode = await source.readBandwidthCode();
      const currentBandwidthHz = witmotionBandwidthCodeToHz(currentBandwidthCode) ?? 20;
      const candidates: WitmotionConfigCandidate[] = [
        { label: `50Hz + الفلتر الحالي (${currentBandwidthHz}Hz)`, rateHz: 50, bandwidthHz: currentBandwidthHz },
        { label: "50Hz + فلتر أضيق (20Hz)", rateHz: 50, bandwidthHz: 20 },
        { label: "100Hz + فلتر متوافق (42Hz)", rateHz: 100, bandwidthHz: 42 },
      ];
      const results = await runWitmotionConfigComparison(source, candidates, {
        measurementMs: 4000,
        settleMs: 500,
        onCandidateStart: (candidate, index, total) => setComparisonStatusAr(`(${index + 1}/${total}) ${candidate.label} — ثبّت يدك الآن بشكل طبيعي…`),
        onCandidateResult: (result) => setComparisonResults((previous) => [...previous, result]),
      });
      const recommendation = recommendConfig(results);
      setComparisonStatusAr(recommendation.reasoningAr);
      setChosenLabel(recommendation.winner?.candidate.label ?? null);
    } catch (caught) {
      setComparisonStatusAr(`توقفت المقارنة بأمان: ${caught instanceof Error ? caught.message : String(caught)}. تم استعادة الإعداد الأصلي.`);
    } finally {
      setComparisonRunning(false);
    }
  }

  async function applyChosenConfig(): Promise<void> {
    const source = sourceRef.current;
    const chosen = comparisonResults.find((r) => r.candidate.label === chosenLabel);
    if (!source || !chosen) return;
    try {
      await source.setTemporaryOutputRate(chosen.candidate.rateHz);
      await source.setTemporaryBandwidth(chosen.candidate.bandwidthHz);
      setFinalHardwareApplied({ rateHz: chosen.candidate.rateHz, bandwidthHz: chosen.candidate.bandwidthHz });
      setStage("center");
    } catch {
      setComparisonStatusAr("تعذّر تطبيق الإعداد النهائي. أعد المحاولة قبل المتابعة.");
    }
  }

  // ---------- Phase 4-9: guided phases ----------

  function startGuided(): void {
    setStage("guided");
    setPhaseIndex(0);
    setPhaseSamples(0);
    activePhaseRef.current = FINAL_SESSION_PHASES[0].id;
  }

  function advanceGuided(): void {
    if (phaseIndex === null) return;
    const next = phaseIndex + 1;
    if (next < FINAL_SESSION_PHASES.length) {
      setPhaseIndex(next);
      setPhaseSamples(0);
      activePhaseRef.current = FINAL_SESSION_PHASES[next].id;
      return;
    }
    activePhaseRef.current = RECENTER_TEST_PHASE_ID;
    setPhaseIndex(null);
    setRecenterSubstep("awkward");
    setPhantomContactWarning(false);
    setRecenterSamples(0);
    setStage("recenter_test");
  }

  // ---------- Phase 10: recenter test ----------

  function pressRecenterDuringTest(): void {
    const contactBefore = pointer;
    const didCenter = recenter(true);
    if (!didCenter) return;
    // No canonical game contact exists in this isolated diagnostic tool, so the phantom-contact
    // check here is limited to "pointer jumped exactly to center" — the actual gate/router-level
    // protection (ContactActivationGate.primeAt / SensorContactRouter.notePendingRecenter) is
    // exercised for real inside the shared runtime's games, not this standalone controller instance.
    setPhantomContactWarning(!!contactBefore && (Math.abs(contactBefore.pointer.x - 0.5) < 0.02 && Math.abs(contactBefore.pointer.y - 0.5) < 0.02));
    setRecenterSubstep("pressed");
  }

  function finishRecenterTest(): void {
    activePhaseRef.current = null;
    setRecenterSubstep("confirmed");
    setStage("free_play");
  }

  // ---------- Phase 12: free play ----------

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

  // ---------- Phase 13: profile + summary ----------

  function buildSummary(): void {
    const all = recordsRef.current;
    const stillRecords = all.filter((r) => r.phase === "still_start" || r.phase === "still_end");
    const edgeReversal = EDGE_REVERSAL_PHASES.map((phaseDef) => {
      const records = all.filter((r) => r.phase === phaseDef.id);
      // Explicit lookup, not substring matching — "edge_left_reverse_right" contains "right" as a
      // substring (from "reverse_right"), which would misclassify it as the RIGHT edge if matched loosely.
      const { axis, edgeValue } = EDGE_ID_TO_AXIS[phaseDef.id];
      return { phase: phaseDef.id, reversalResponseMs: measureEdgeReversalResponse(records, axis, edgeValue) };
    });
    const hardware = finalHardwareApplied
      ? { rateHz: finalHardwareApplied.rateHz, bandwidthHz: finalHardwareApplied.bandwidthHz, source: "measured_today" as const }
      : { rateHz: 50, bandwidthHz: 20, source: "unchanged_default" as const };
    const built = buildRightHandSessionProfile({
      hardware,
      config,
      stillRecords,
      allRecords: all,
      edgeReversal,
      notesAr: [
        `عدد العينات الكلي هذه الجلسة: ${all.length}.`,
        `عدد أحداث إعادة التمركز المسجّلة: ${eventsRef.current.filter((e) => e.type === "recenter").length}.`,
      ],
      datasetReferences: [`wt901-right-hand-final-session-${Date.now()}.json (سيُحفظ عند التنزيل)`],
    });
    setProfile(built);
  }

  function downloadSession(): void {
    const payload = {
      capturedAt: new Date().toISOString(),
      role: PhysicalRole.RIGHT_HAND,
      sessionKind: "FINAL_SESSION_2026_09_04",
      config,
      finalHardwareApplied,
      hardwareComparison: comparisonResults,
      rotationAnalysis: analyzeRotationInPlace(recordsRef.current, config),
      latency: summarizeMotionLatency(recordsRef.current),
      events: eventsRef.current,
      profile,
      records: recordsRef.current,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `wt901-right-hand-final-session-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const connected = connection === ConnectionState.CONNECTED;
  const [roll, pitch, yaw] = sample?.anglesDeg ?? [0, 0, 0];
  const activePhase = phaseIndex === null ? null : FINAL_SESSION_PHASES[phaseIndex];
  const freePlayElapsedMs = freePlayStartedAtMs === null ? 0 : freePlayNowMs - freePlayStartedAtMs;

  return (
    <main dir="rtl" lang="ar" className="min-h-dvh bg-[#eff9f8] text-slate-900" style={{ fontFamily: "var(--font-control), system-ui, sans-serif" }}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-7 lg:py-7">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-bold text-teal-700">الجلسة الحقيقية النهائية · RIGHT_HAND</span>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">جلسة اليد اليمنى الدقيقة</h1>
          </div>
          <Link href="/control" className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm">رجوع</Link>
        </header>

        <StageProgress stage={stage} />

        <section className="overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-xl shadow-teal-950/10">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <StatusDot state={connection} />
              <div>
                <p className="text-sm font-bold">{connectionLabel(connection)}</p>
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
          <div className="relative aspect-[16/9] min-h-[280px] overflow-hidden bg-gradient-to-b from-[#b9eff0] via-[#dff7ef] to-[#fff3c4]">
            {!connected && <AreaMessage icon="⌁" text="اربط الحساس للبدء" />}
            {connected && !centered && <AreaMessage icon="✋" text="بانتظار أول تمركز تلقائي…" />}
            {connected && centered && pointer && <VirtualHand pointer={pointer} />}
          </div>
          {connected && sample && (
            <div className="grid grid-cols-3 gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-500 sm:grid-cols-6">
              <span>X: {pointer ? pointer.pointer.x.toFixed(3) : "—"}</span>
              <span>Y: {pointer ? pointer.pointer.y.toFixed(3) : "—"}</span>
              <span>Roll: {roll.toFixed(1)}°</span>
              <span>Pitch: {pitch.toFixed(1)}°</span>
              <span>Yaw: {yaw.toFixed(1)}°</span>
            </div>
          )}
          {connected && (stage === "center" || stage === "guided" || stage === "recenter_test" || stage === "free_play") && (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3 text-xs">
              <span className="font-bold text-slate-500">Phase 7 — قارن الفلتر حيًا:</span>
              {(["LIGHT_EMA", "ADAPTIVE_EMA", "ONE_EURO"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updateConfig({ filterMode: mode })}
                  className={`rounded-lg px-3 py-1.5 font-bold ${config.filterMode === mode ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  {mode}
                </button>
              ))}
            </div>
          )}
        </section>

        {stage === "config_compare" && (
          <ConfigComparePanel
            connected={connected}
            running={comparisonRunning}
            statusAr={comparisonStatusAr}
            results={comparisonResults}
            chosenLabel={chosenLabel}
            onChoose={setChosenLabel}
            onRun={runComparison}
            onApply={applyChosenConfig}
          />
        )}

        {stage === "center" && (
          <PanelCard title="التمركز">
            <p className="text-sm text-slate-600">
              التمركز التلقائي حدث فعليًا عند أول اتصال (قد يكون خلال مقارنة الإعدادات، من وضعية غير مقصودة). ثبّت يدك الآن بوضع مريح فعلي ثم اضغط «تعيين المنتصف يدويًا» قبل المتابعة — هذا يضمن مرجعًا نظيفًا للخطوات القادمة.
            </p>
            {finalHardwareApplied && <p className="mt-2 text-xs font-bold text-teal-700">الإعداد النهائي المطبّق: {finalHardwareApplied.rateHz} Hz / فلتر {finalHardwareApplied.bandwidthHz} Hz</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => recenter(false)} disabled={!connected || !sample} className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-extrabold text-amber-950 disabled:opacity-40">تعيين المنتصف يدويًا</button>
              <button type="button" onClick={startGuided} disabled={!explicitlyRecentered} className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">ابدأ التسجيل الموجّه</button>
            </div>
          </PanelCard>
        )}

        {stage === "guided" && phaseIndex !== null && activePhase && (
          <PanelCard title={`الخطوة ${phaseIndex + 1} من ${FINAL_SESSION_PHASES.length}`}>
            <h3 className="text-2xl font-black text-teal-950">{activePhase.titleAr}</h3>
            <p className="mt-2 text-sm text-teal-900/70">{activePhase.instructionAr}</p>
            <p className="mt-3 text-xs font-bold text-teal-700">سُجلت {phaseSamples} عينة</p>
            <button
              type="button"
              onClick={advanceGuided}
              disabled={phaseSamples < (EDGE_REVERSAL_PHASES.some((p) => p.id === activePhase.id) ? MIN_MOVEMENT_SAMPLES : MIN_PHASE_SAMPLES)}
              className="mt-4 rounded-xl bg-teal-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-40"
            >
              {phaseIndex === FINAL_SESSION_PHASES.length - 1 ? "تم — متابعة لاختبار إعادة التمركز" : "تم، الخطوة التالية"}
            </button>
          </PanelCard>
        )}

        {stage === "recenter_test" && (
          <PanelCard title="Phase 10 — اختبار إعادة التمركز">
            {recenterSubstep === "awkward" && (
              <>
                <p className="text-sm text-slate-600">١) ضع يدك بوضعية غير مريحة/بعيدة عن المنتصف (كأن الطفل جلس بشكل مختلف).</p>
                <button type="button" onClick={pressRecenterDuringTest} disabled={!connected || !sample} className="mt-3 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-extrabold text-amber-950 disabled:opacity-40">٢) إعادة تعيين المنتصف الآن</button>
              </>
            )}
            {recenterSubstep === "pressed" && (
              <>
                <p className="text-sm font-bold text-emerald-700">تم — المؤشر الآن في المنتصف تمامًا.</p>
                {phantomContactWarning && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-800">⚠ لاحظ الحماية من التفعيل الوهمي — راجع الملاحظة في الشاشة.</p>}
                <p className="mt-2 text-sm text-slate-600">٣) نفّذ حركة صغيرة الآن للتأكد من استجابة فورية بعد إعادة التمركز.</p>
                <p className="mt-2 text-xs font-bold text-teal-700">سُجلت {recenterSamples} عينة بعد إعادة التمركز</p>
                <button type="button" onClick={finishRecenterTest} disabled={recenterSamples < MIN_MOVEMENT_SAMPLES} className="mt-4 rounded-xl bg-teal-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-40">تم — متابعة للعب الحر</button>
              </>
            )}
          </PanelCard>
        )}

        {stage === "free_play" && (
          <PanelCard title="Phase 12 — لعب حر">
            <p className="text-sm text-slate-600">حرّك يدك والعب بحرية — تحرك، توقف، اعكس الاتجاه، اضرب الحواف، لف معصمك أحيانًا. لا يوجد وقت محدد صارم، لكن ٤٥-٦٠ ثانية مثالية.</p>
            {!freePlayRunning ? (
              <button type="button" onClick={startFreePlay} disabled={!centered} className="mt-4 rounded-xl bg-teal-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-40">ابدأ اللعب الحر</button>
            ) : (
              <>
                <p className="mt-3 text-sm font-bold text-teal-700">الوقت المنقضي: {(freePlayElapsedMs / 1000).toFixed(0)} ثانية · العينات: {freePlaySamples}</p>
                <button type="button" onClick={stopFreePlay} disabled={freePlayElapsedMs < MIN_FREE_PLAY_MS} className="mt-4 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-40">
                  {freePlayElapsedMs < MIN_FREE_PLAY_MS ? `انتظر ${Math.ceil((MIN_FREE_PLAY_MS - freePlayElapsedMs) / 1000)} ثانية أخرى` : "إنهاء وحفظ"}
                </button>
              </>
            )}
          </PanelCard>
        )}

        {stage === "summary" && profile && (
          <SummaryPanel profile={profile} comparisonResults={comparisonResults} recordCount={recordCount} onDownload={downloadSession} />
        )}

        <p className="pb-2 text-center text-xs text-slate-500">لا تُرسل هذه الصفحة بيانات إلى Firebase أو Munsit. لا يوجد حفظ دائم على الحساس (بدون أمر Save).</p>
      </div>
    </main>
  );
}

function StageProgress({ stage }: { stage: Stage }) {
  const stages: { id: Stage; labelAr: string }[] = [
    { id: "connect", labelAr: "الاتصال" },
    { id: "config_compare", labelAr: "مقارنة الإعدادات" },
    { id: "center", labelAr: "التمركز" },
    { id: "recenter_test", labelAr: "إعادة التمركز" },
    { id: "free_play", labelAr: "لعب حر" },
    { id: "summary", labelAr: "الملخص" },
  ];
  const currentIndex = stages.findIndex((s) => s.id === stage);
  return (
    <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
      {stages.map((s, index) => (
        <span key={s.id} className={`rounded-full px-3 py-1 ${index === currentIndex ? "bg-teal-600 text-white" : index < currentIndex ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-400"}`}>
          {s.labelAr}
        </span>
      ))}
    </div>
  );
}

function ConfigComparePanel({
  connected,
  running,
  statusAr,
  results,
  chosenLabel,
  onChoose,
  onRun,
  onApply,
}: {
  connected: boolean;
  running: boolean;
  statusAr: string | null;
  results: WitmotionConfigTrialResult[];
  chosenLabel: string | null;
  onChoose: (label: string) => void;
  onRun: () => void;
  onApply: () => void;
}) {
  return (
    <PanelCard title="Phase 2 — مقارنة إعدادات الحساس (آمنة وقابلة للاستعادة)">
      <p className="text-sm text-slate-600">سيتم اختبار 3 إعدادات فقط، كل واحد ~5 ثوانٍ. ثبّت يدك بشكل طبيعي عند بدء كل إعداد.</p>
      <button type="button" onClick={onRun} disabled={!connected || running} className="mt-3 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">
        {running ? "جارٍ الاختبار…" : "ابدأ مقارنة الإعدادات"}
      </button>
      {statusAr && <p className="mt-3 text-sm font-semibold text-teal-800">{statusAr}</p>}
      {results.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead>
              <tr className="text-slate-500">
                <th className="p-2 text-right">الإعداد</th>
                <th className="p-2 text-right">Hz فعلي</th>
                <th className="p-2 text-right">ضجيج (°/ث)</th>
                <th className="p-2 text-right">تأخير (مللي ث)</th>
                <th className="p-2 text-right">مستقر؟</th>
                <th className="p-2 text-right">اختيار</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.candidate.label} className="border-t border-slate-100">
                  <td className="p-2">{r.candidate.label}</td>
                  <td className="p-2 tabular-nums" dir="ltr">{r.measuredHz.toFixed(1)}</td>
                  <td className="p-2 tabular-nums" dir="ltr">{r.stillNoiseGyroDps ? (r.stillNoiseGyroDps.reduce((s, a) => s + a.std, 0) / 3).toFixed(3) : "—"}</td>
                  <td className="p-2 tabular-nums" dir="ltr">{r.meanParsingLatencyMs?.toFixed(2) ?? "—"}</td>
                  <td className="p-2">{r.unstable ? "لا" : "نعم"}</td>
                  <td className="p-2">
                    <input type="radio" name="chosen" checked={chosenLabel === r.candidate.label} disabled={r.unstable} onChange={() => onChoose(r.candidate.label)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {results.length > 0 && (
        <button type="button" onClick={onApply} disabled={!chosenLabel} className="mt-4 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">
          تطبيق الإعداد المختار والمتابعة
        </button>
      )}
    </PanelCard>
  );
}

function SummaryPanel({
  profile,
  comparisonResults,
  recordCount,
  onDownload,
}: {
  profile: RightHandSessionProfile;
  comparisonResults: WitmotionConfigTrialResult[];
  recordCount: number;
  onDownload: () => void;
}) {
  return (
    <PanelCard title="Phase 13 — الملخص والملف الشخصي">
      <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
        <span>العينات الكلية: {recordCount}</span>
        <span>الإعداد النهائي: {profile.hardware.rateHz} Hz / فلتر {profile.hardware.bandwidthHz} Hz</span>
        <span>الفلتر: {profile.controller.filterMode}</span>
        <span>عدد إعدادات الحساس المقارنة: {comparisonResults.length}</span>
      </div>
      <div className="mt-4 rounded-xl bg-slate-50 p-4 text-xs text-slate-600">
        <p className="font-bold text-slate-800">مغلف الضجيج (MAD/STD لكل محور جايروسكوب، عينات السكون)</p>
        {profile.noiseEnvelope.gyroDps.map((axis, index) => (
          <p key={index}>محور {["x", "y", "z"][index]}: mean={axis.mean.toFixed(3)} std={axis.std.toFixed(3)} mad={axis.mad.toFixed(3)}</p>
        ))}
      </div>
      <div className="mt-3 rounded-xl bg-slate-50 p-4 text-xs text-slate-600">
        <p className="font-bold text-slate-800">استجابة انعكاس الحافة</p>
        {profile.edgeReversal.map((edge) => (
          <p key={edge.phase}>{edge.phase}: {edge.reversalResponseMs === null ? "لم تصل الحافة فعليًا" : `${edge.reversalResponseMs.toFixed(0)} مللي ثانية`}</p>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">{profile.disclaimer}</p>
      <button type="button" onClick={onDownload} className="mt-4 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white">تنزيل ملف الجلسة الكامل (JSON)</button>
    </PanelCard>
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

function connectionLabel(state: ConnectionState): string {
  if (state === ConnectionState.CONNECTED) return "متصل ويستقبل بيانات";
  if (state === ConnectionState.CONNECTING) return "جاري الاتصال…";
  if (state === ConnectionState.ERROR) return "خطأ في الاتصال";
  return "غير متصل";
}
function StatusDot({ state }: { state: ConnectionState }) {
  const color = state === ConnectionState.CONNECTED ? "bg-emerald-500" : state === ConnectionState.CONNECTING ? "bg-amber-400" : "bg-slate-300";
  return <span className={`h-3 w-3 rounded-full ${color}`} />;
}
function AreaMessage({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-teal-950/65">
      <span className="text-5xl">{icon}</span>
      <p className="text-lg font-extrabold sm:text-2xl">{text}</p>
    </div>
  );
}
function VirtualHand({ pointer }: { pointer: NormalizedPointer }) {
  const radiusPct = 6;
  return (
    <div
      className="pointer-events-none absolute z-10 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-teal-500/75 shadow-xl"
      style={{ left: `calc(${radiusPct}% + ${pointer.pointer.x} * (100% - ${radiusPct * 2}%))`, top: `calc(${radiusPct}% + ${pointer.pointer.y} * (100% - ${radiusPct * 2}%))` }}
    >
      <span className="flex h-full w-full items-center justify-center text-3xl">✋</span>
    </div>
  );
}
