"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { formatAccuracyPercent, formatDurationClock, formatReactionTimeSeconds } from "@/components/display/copy";
import { CHASE_COLOR_HEX } from "@/components/display/colorchase/colorPalette";
import { ConnectionBadge } from "@/components/control/ConnectionBadge";
import { LeaseContestedOverlay } from "@/components/control/LeaseContestedOverlay";
import { DIFFICULTY_LABELS } from "@/components/control/copy";
import { ConfirmSheet } from "@/components/control/live/ConfirmSheet";
import { LiveNavigationControls } from "@/components/control/live/LiveNavigationControls";
import { SessionControls } from "@/components/control/live/SessionControls";
import { StageStrip } from "@/components/control/live/StageStrip";
import { StartZoneOverlay } from "@/components/control/live/StartZoneOverlay";
import { SegmentedControl } from "@/components/control/setup/SegmentedControl";
import { StageCard } from "@/components/control/setup/StageCard";
import { DevQuickFill } from "@/components/control/setup/DevQuickFill";
import { StatCard } from "@/components/control/StatCard";
import { SectionCard } from "@/components/control/ui/SectionCard";
import { SessionSummaryWorkflowPanel } from "@/components/control/session/SessionSummaryWorkflowPanel";
import { SetupIdentityCard } from "@/components/control/session/SetupIdentityCard";
import { EndSessionReasonSheet } from "@/components/control/session/EndSessionReasonSheet";
import type { EarlyEndSelection, SessionWorkflowMetadata } from "@/lib/sessions/workflowMetadata";
import {
  CHASE_COLOR_LABELS_AR,
  ColorChaseStageStatus,
  currentColorChaseStep,
  Difficulty,
  GameState,
  getColorChaseStagePlan,
  PAD_IDS,
  STAGES_PER_DIFFICULTY,
  type ColorChaseSessionState,
  type ColorChaseStagePlan,
  type ColorChaseStageResult,
  type ColorChaseSessionSummary,
  type PadId,
  type StageNumber,
} from "@/lib/colorchase";
import {
  useLocalColorChaseControllerSession,
  type ColorChaseDifficultyDecision,
  type ColorChaseDraftConfig,
} from "@/lib/control/colorchase/useLocalColorChaseControllerSession";
import { useColorChaseRealtimeControllerSession } from "@/lib/control/colorchase/useColorChaseRealtimeControllerSession";
import { usePatientContext } from "@/lib/patients/PatientSessionContext";
import { usePatientPrefill } from "@/lib/patients/usePatientPrefill";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { getAdjacentDifficulty, getNextStageTarget } from "@/lib/game";
import { SensorHandLayer } from "@/components/control/sensors/SensorHandLayer";
import { colorChaseSensorTargets, isColorChasePadId } from "@/lib/physicalInput/gameSensorTargets";

const STAGE_NUMBERS = Array.from({ length: STAGES_PER_DIFFICULTY }, (_, index) => (index + 1) as StageNumber);
const DIFFICULTY_OPTIONS = Object.values(Difficulty).map((value) => ({
  value,
  label: DIFFICULTY_LABELS[value].name,
  description: DIFFICULTY_LABELS[value].description,
}));

export function ColorChaseControlScreen() {
  return isRealtimeEnabled() ? <RealtimeControl /> : <LocalControl />;
}

function LocalControl() {
  const controller = useLocalColorChaseControllerSession();
  usePatientPrefill(
    controller.phase,
    controller.draft.childFirstName,
    controller.setChildName,
    controller.setDifficulty,
    controller.setStartingStage,
  );
  return (
    <ControllerShell phase={controller.phase}>
      <ControllerBody controller={controller} />
    </ControllerShell>
  );
}

function RealtimeControl() {
  const controller = useColorChaseRealtimeControllerSession();
  usePatientPrefill(
    controller.phase,
    controller.draft.childFirstName,
    controller.setChildName,
    controller.setDifficulty,
    controller.setStartingStage,
  );

  if (controller.authPhase !== "authorized") {
    return (
      <ControllerShell phase="SETUP">
        <Loading label="جاري تجهيز الاتصال..." />
      </ControllerShell>
    );
  }

  return (
    <ControllerShell phase={controller.phase}>
      <ConnectionBadge
        status={controller.connectionStatus}
        hasLoadedInitialSession={controller.hasLoadedInitialSession}
        syncRestoredAt={controller.syncRestoredAt}
      />
      {!controller.isOwner && (
        <LeaseContestedOverlay onTakeOver={controller.claimOwnership} takeoverBlocked={controller.takeoverBlocked} />
      )}
      {controller.hasLoadedInitialSession ? (
        <ControllerBody
          controller={controller}
          offline={controller.connectionStatus !== "connected"}
          displayConnected={controller.displayConnected}
          displayFullscreen={controller.displayFullscreen}
        />
      ) : (
        <Loading label="جاري التحقق من الجلسة..." />
      )}
    </ControllerShell>
  );
}

function ControllerShell({ phase, children }: { phase: string; children: React.ReactNode }) {
  return (
    <main
      dir="rtl"
      lang="ar"
      data-controller-phase={phase}
      className="fixed inset-0 flex h-dvh w-dvw touch-manipulation flex-col overflow-hidden bg-slate-50 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] text-slate-900 select-none"
      style={{ fontFamily: "var(--font-control), system-ui, sans-serif" }}
    >
      {children}
    </main>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-teal-600" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

interface ControllerLike {
  therapistName?: string | null;
  phase: string;
  draft: ColorChaseDraftConfig;
  session: ColorChaseSessionState | null;
  setChildName(value: string): void;
  setDifficulty(value: Difficulty): void;
  setStartingStage(value: StageNumber): void;
  confirmSetup(): void;
  editSetup(): void;
  startLiveSession(): void;
  confirmChildReady(): void;
  confirmPad(pad: PadId): void;
  pauseOrResume(): void;
  restartStage(): void;
  skipStage(): void;
  endSessionEarly(selection: EarlyEndSelection): void;
  advanceStage(decision: ColorChaseDifficultyDecision): void;
  jumpToStage(stage: StageNumber): void;
  changeLiveDifficulty(difficulty: Difficulty): void;
  newSession(): void;
  replayCelebration(): void;
  startAnotherSessionForSamePatient?: () => void;
  sessionPatientId?: string | null;
}

function ControllerBody({
  controller,
  offline = false,
  displayConnected,
  displayFullscreen,
}: {
  controller: ControllerLike;
  offline?: boolean;
  displayConnected?: boolean;
  displayFullscreen?: boolean;
}) {
  const router = useRouter();
  const { selectedPatient } = usePatientContext();

  if (controller.phase === "SETUP") {
    return (
      <div className="flex flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-5 pt-5 sm:px-8">
          <Link
            href="/control/activities"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-400 transition-colors hover:text-slate-600"
          >
            <span aria-hidden="true">→</span>
            العودة للأنشطة
          </Link>
          <SetupPatientChip />
        </div>
        <ColorChaseSetupScreen
          draft={controller.draft}
          patientName={selectedPatient?.firstName ?? null}
          therapistName={controller.therapistName}
          onChildNameChange={controller.setChildName}
          onDifficultyChange={controller.setDifficulty}
          onStartingStageChange={controller.setStartingStage}
          onStart={controller.confirmSetup}
        />
      </div>
    );
  }

  if (!controller.session) return null;

  if (controller.phase === "READY") {
    return (
      <div className="flex flex-1 flex-col overflow-y-auto">
        <ReadyScreen
          session={controller.session}
          onStart={controller.startLiveSession}
          onEdit={controller.editSetup}
          onCancel={() => {
            controller.newSession();
            router.push("/control/activities");
          }}
          displayConnected={displayConnected}
          displayFullscreen={displayFullscreen}
        />
      </div>
    );
  }

  if (controller.phase === "SUMMARY" && controller.session.summary) {
    return (
      <div className="flex flex-1 flex-col overflow-y-auto">
        <SummaryScreen
          summary={controller.session.summary}
          sessionPatientId={controller.sessionPatientId ?? null}
          workflow={controller.session.workflow}
          therapistName={controller.therapistName}
          onNewSession={controller.newSession}
          onReplayCelebration={controller.replayCelebration}
          onReturnToPatientProfile={() => {
            if (!controller.sessionPatientId) return;
            const patientId = controller.sessionPatientId;
            controller.newSession();
            router.push(`/control/patients/${patientId}`);
          }}
          onStartAnotherForSamePatient={() => {
            controller.startAnotherSessionForSamePatient?.();
            router.push("/control/activities");
          }}
          onGoToActivities={() => {
            controller.newSession();
            router.push("/control/activities");
          }}
          onGoHome={() => {
            controller.newSession();
            router.push("/control");
          }}
        />
      </div>
    );
  }

  return (
    <LiveScreen
      session={controller.session}
      offline={offline}
      onChildReady={controller.confirmChildReady}
      onPad={controller.confirmPad}
      onPauseOrResume={controller.pauseOrResume}
      onRestartStage={controller.restartStage}
      onSkipStage={controller.skipStage}
      onEndSessionEarly={controller.endSessionEarly}
      onAdvanceStage={controller.advanceStage}
      onJumpToStage={controller.jumpToStage}
      onDifficultyChange={controller.changeLiveDifficulty}
    />
  );
}

function SetupPatientChip() {
  const { selectedPatient, clearPatient } = usePatientContext();
  if (!selectedPatient) return null;
  return (
    <button
      type="button"
      onClick={clearPatient}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 transition-colors hover:bg-teal-100"
    >
      {selectedPatient.firstName}
      <span aria-hidden="true">·</span>
      تغيير المريض
    </button>
  );
}

function stageCharacteristics(plan: ColorChaseStagePlan): string[] {
  const choices = Math.max(...plan.steps.map((step) => step.distractors.length + 1));
  return [
    `${plan.steps.length} ${plan.steps.length === 1 ? "هدف" : "أهداف"}`,
    choices === 1 ? "هدف واحد واضح" : `${choices} اختيارات مضيئة`,
    plan.dangerPadIds.length === 0 ? "دون مناطق خطر" : `${plan.dangerPadIds.length} مناطق خطر`,
  ];
}

export function ColorChaseSetupScreen({
  draft,
  patientName,
  therapistName,
  onChildNameChange,
  onDifficultyChange,
  onStartingStageChange,
  onStart,
}: {
  draft: ColorChaseDraftConfig;
  patientName: string | null;
  therapistName: string | null | undefined;
  onChildNameChange(value: string): void;
  onDifficultyChange(value: Difficulty): void;
  onStartingStageChange(value: StageNumber): void;
  onStart(): void;
}) {
  const canStart = draft.childFirstName.trim().length > 0;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-5 py-8 pb-16 sm:px-8 sm:py-12 sm:pb-20">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">مطاردة الألوان</h1>
        <p className="text-base text-slate-500">إعداد جلسة جديدة — لعبة أرضية</p>
      </header>

      <SectionCard title="بيانات الطفل" className="gap-2.5">
        <label htmlFor="color-chase-child-name" className="sr-only">
          اسم الطفل
        </label>
        <input
          id="color-chase-child-name"
          type="text"
          inputMode="text"
          autoComplete="off"
          value={draft.childFirstName}
          onChange={(event) => onChildNameChange(event.target.value)}
          placeholder="اكتب الاسم الأول"
          maxLength={30}
          className="min-h-14 touch-manipulation rounded-2xl border-2 border-slate-200 bg-white px-5 text-lg font-medium text-slate-900 outline-none transition-colors select-text placeholder:text-slate-400 focus:border-teal-600"
        />
        <DevQuickFill onFill={() => onChildNameChange("محمد")} />
      </SectionCard>

      <SetupIdentityCard childName={draft.childFirstName} patientName={patientName} therapistName={therapistName} />

      <SectionCard title="اختر المستوى">
        <SegmentedControl
          aria-label="مستوى الصعوبة"
          options={DIFFICULTY_OPTIONS}
          value={draft.difficulty}
          onChange={onDifficultyChange}
        />
      </SectionCard>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-700">اختر المرحلة</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STAGE_NUMBERS.map((stageNumber) => {
            const plan = getColorChaseStagePlan(draft.difficulty, stageNumber);
            return (
              <StageCard
                key={stageNumber}
                label={`المرحلة ${stageNumber}`}
                title={plan.titleAr}
                description={plan.instructionAr}
                characteristics={stageCharacteristics(plan)}
                selected={draft.startingStage === stageNumber}
                onSelect={() => onStartingStageChange(stageNumber)}
                preview={<ColorChaseStagePreview plan={plan} />}
              />
            );
          })}
        </div>
      </section>

      <button
        type="button"
        disabled={!canStart}
        onClick={onStart}
        className="min-h-16 touch-manipulation rounded-2xl bg-teal-600 text-xl font-bold text-white shadow-lg shadow-teal-900/15 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
      >
        ابدأ الجلسة
      </button>
    </div>
  );
}

function ColorChaseStagePreview({ plan }: { plan: ColorChaseStagePlan }) {
  const step = plan.steps[0];
  return (
    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_center,#18294d,#080f22_72%)] p-4">
      <div className="grid h-full max-h-36 aspect-square grid-cols-3 gap-1.5 rounded-2xl border border-white/10 bg-slate-950/75 p-2.5 shadow-inner">
        {PAD_IDS.map((pad) => {
          const distractor = step.distractors.find((item) => item.padId === pad);
          const color = pad === step.correctPadId ? step.targetColor : distractor?.color;
          const danger = plan.dangerPadIds.includes(pad);
          return (
            <span
              key={pad}
              className="rounded-lg border border-white/10 shadow-inner"
              style={{
                background: danger
                  ? "radial-gradient(circle,#fb7185 0 24%,#4c0519 29%,#160814 72%)"
                  : color
                    ? `linear-gradient(145deg,${CHASE_COLOR_HEX[color]},#172033)`
                    : "#172033",
                opacity: color || danger ? 1 : 0.58,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-3 last:border-b-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-base font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function ReadyScreen({
  session,
  onStart,
  onEdit,
  onCancel,
  displayConnected,
  displayFullscreen,
}: {
  session: ColorChaseSessionState;
  onStart(): void;
  onEdit(): void;
  onCancel(): void;
  displayConnected?: boolean;
  displayFullscreen?: boolean;
}) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const plan = session.currentStage.plan;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-8 px-5 py-8 sm:px-8">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <span className="text-xs font-semibold tracking-wide text-teal-600 uppercase">جاهز للبدء</span>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{session.config.childFirstName}</h1>
      </div>

      <div className="w-full rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <SummaryRow label="المستوى" value={DIFFICULTY_LABELS[session.currentDifficulty].name} />
        <SummaryRow label="مرحلة البداية" value={`${session.currentStage.stageNumber} من ${STAGES_PER_DIFFICULTY}`} />
      </div>

      <div className="w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="relative" style={{ aspectRatio: "16 / 9" }}>
          <ColorChaseStagePreview plan={plan} />
        </div>
        <div className="flex flex-col gap-1.5 p-4">
          <span className="text-xs font-semibold text-teal-600">إعداد المرحلة</span>
          <h2 className="text-base font-bold text-slate-900">{plan.titleAr}</h2>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-slate-600">
            {stageCharacteristics(plan).map((item) => (
              <li key={item} className="flex items-center gap-1">
                <span className="h-1 w-1 rounded-full bg-slate-400" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {displayConnected !== undefined && (
        <div
          className={`flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold ${
            displayConnected ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          {displayConnected
            ? displayFullscreen
              ? "شاشة العرض متصلة ✓ · وضع ملء الشاشة ⛶"
              : "شاشة العرض متصلة ✓ · لم يتم تفعيل ملء الشاشة بعد"
            : "⚠ شاشة العرض غير متصلة حاليًا"}
        </div>
      )}

      <div className="flex w-full flex-col gap-3">
        <button
          type="button"
          onClick={onStart}
          className="min-h-16 touch-manipulation rounded-2xl bg-teal-600 text-xl font-bold text-white shadow-lg shadow-teal-900/15 transition-all active:scale-[0.98]"
        >
          ابدأ المغامرة
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="min-h-12 touch-manipulation rounded-2xl text-base font-medium text-slate-500 transition-colors active:text-slate-700"
        >
          تعديل الإعدادات
        </button>
        <button
          type="button"
          onClick={() => setConfirmCancel(true)}
          className="min-h-10 touch-manipulation text-sm font-medium text-rose-400 transition-colors active:text-rose-600"
        >
          إلغاء الجلسة والعودة للأنشطة
        </button>
      </div>

      <ConfirmSheet
        open={confirmCancel}
        title="إلغاء الجلسة؟"
        description="لم تبدأ الجلسة بعد. سيتم التراجع عن هذا الإعداد والعودة إلى الأنشطة."
        confirmLabel="إلغاء الجلسة"
        destructive
        onConfirm={() => {
          setConfirmCancel(false);
          onCancel();
        }}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}

type PendingConfirm = "restart" | "skip" | "end" | null;

function LiveScreen({
  session,
  offline,
  onChildReady,
  onPad,
  onPauseOrResume,
  onRestartStage,
  onSkipStage,
  onEndSessionEarly,
  onAdvanceStage,
  onJumpToStage,
  onDifficultyChange,
}: {
  session: ColorChaseSessionState;
  offline: boolean;
  onChildReady(): void;
  onPad(pad: PadId): void;
  onPauseOrResume(): void;
  onRestartStage(): void;
  onSkipStage(): void;
  onEndSessionEarly(selection: EarlyEndSelection): void;
  onAdvanceStage(decision: ColorChaseDifficultyDecision): void;
  onJumpToStage(stage: StageNumber): void;
  onDifficultyChange(difficulty: Difficulty): void;
}) {
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  const stage = session.currentStage;
  const step = currentColorChaseStep(stage);
  const isStageComplete = session.gameState === GameState.STAGE_COMPLETE;
  const isAwaitingStartZone = session.gameState === GameState.START_ZONE;
  const isTransitioning = session.gameState === GameState.INSTRUCTIONS || session.gameState === GameState.COUNTDOWN;
  const isPaused = stage.pausedAt !== null;
  const hasMeaningfulProgress = stage.correctCount + stage.incorrectCount + stage.dangerPressCount > 0;
  const lastResult = session.results[session.results.length - 1] ?? null;
  const isPadGridActive = !offline && !isPaused && !isStageComplete && !isAwaitingStartZone && !isTransitioning;

  // PRODUCTION SENSOR INTEGRATION — confirmColorChasePad is documented as
  // "the canonical controller/sensor boundary" (lib/colorchase/session.ts);
  // targets mirror ColorPadGrid.tsx's real fixed 3x3 region, the same
  // geometry ColorChaseSensorContactDemo.tsx already validated. See
  // lib/physicalInput/gameSensorTargets.ts.
  const sensorTargets = useMemo(() => colorChaseSensorTargets(), []);
  const handleSensorContact = useCallback((padId: string) => { if (isColorChasePadId(padId)) onPad(padId); }, [onPad]);

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-full min-h-0 flex-1 flex-col landscape:flex-row">
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto py-2 landscape:min-w-0">
          <ColorChaseLiveHeader session={session} />
          <div className="flex min-h-0 flex-1 flex-col px-4 sm:px-6">
            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-semibold text-slate-500">المهمة الحالية</span>
                  <p className="mt-0.5 text-lg font-bold text-slate-900">
                    {step ? `المطلوب: ${CHASE_COLOR_LABELS_AR[step.targetColor]}` : "أحسنت"}
                  </p>
                </div>
                <SequenceStrip session={session} />
              </div>

              {isTransitioning ? (
                <div className="flex min-h-72 flex-1 items-center justify-center rounded-3xl bg-slate-50 p-6 text-center">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">
                      {session.gameState === GameState.INSTRUCTIONS ? stage.plan.instructionAr : "يبدأ العد التنازلي..."}
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">تظهر التعليمات الآن على شاشة العرض</p>
                  </div>
                </div>
              ) : (
                <div className="relative mx-auto grid min-h-72 w-full max-w-xl flex-1 grid-cols-3 gap-2.5 sm:gap-4">
                  {PAD_IDS.map((pad, index) => (
                    <PadButton
                      key={pad}
                      pad={pad}
                      index={index}
                      session={session}
                      disabled={offline || isPaused || isStageComplete || isAwaitingStartZone}
                      onPress={() => onPad(pad)}
                    />
                  ))}

                  <SensorHandLayer targets={sensorTargets} active={isPadGridActive} onContact={handleSensorContact} />
                </div>
              )}
            </div>
          </div>
          <ColorChaseLiveProgress session={session} />
        </div>

        <aside className="flex shrink-0 flex-col gap-3 overflow-y-auto border-t border-slate-100 pt-3 landscape:w-72 landscape:border-t-0 landscape:border-s landscape:pt-3">
          <div className="px-4 sm:px-6">
            <LiveNavigationControls
              currentDifficulty={session.currentDifficulty}
              hasMeaningfulProgress={hasMeaningfulProgress}
              disabled={offline}
              onDifficultyChange={onDifficultyChange}
            />
          </div>
          <div className="px-4 sm:px-6">
            <StageStrip
              difficulty={session.currentDifficulty}
              currentStageNumber={stage.stageNumber}
              results={session.results}
              disabled={offline || isAwaitingStartZone}
              hasMeaningfulProgress={hasMeaningfulProgress}
              onJumpToStage={onJumpToStage}
            />
          </div>
          <SessionControls
            isPaused={isPaused}
            disabled={isStageComplete || isAwaitingStartZone || isTransitioning}
            offline={offline}
            onPauseResume={onPauseOrResume}
            onRestartStage={() => setPendingConfirm("restart")}
            onSkipStage={() => setPendingConfirm("skip")}
            onEndSession={() => setPendingConfirm("end")}
          />
        </aside>
      </div>

      {isStageComplete && lastResult && (
        <ColorChaseStageCompleteOverlay
          result={lastResult}
          currentDifficulty={session.currentDifficulty}
          onAdvance={onAdvanceStage}
          onRequestEndSession={() => setPendingConfirm("end")}
        />
      )}
      {isAwaitingStartZone && (
        <StartZoneOverlay
          stageNumber={stage.stageNumber}
          startingStage={session.config.startingStage}
          onChildReady={onChildReady}
          onRequestEndSession={() => setPendingConfirm("end")}
        />
      )}

      <ConfirmSheet
        open={pendingConfirm === "restart"}
        title="إعادة المرحلة؟"
        description="سيتم إعادة هذه المرحلة من البداية، وفقدان التقدم الحالي فيها."
        confirmLabel="إعادة المرحلة"
        onConfirm={() => {
          onRestartStage();
          setPendingConfirm(null);
        }}
        onCancel={() => setPendingConfirm(null)}
      />
      <ConfirmSheet
        open={pendingConfirm === "skip"}
        title="تخطي المرحلة؟"
        description="سيتم تسجيل هذه المرحلة كمرحلة تم تخطيها، وليست كمرحلة فشل فيها الطفل، والانتقال إلى ما بعدها."
        confirmLabel="تخطي المرحلة"
        onConfirm={() => {
          onSkipStage();
          setPendingConfirm(null);
        }}
        onCancel={() => setPendingConfirm(null)}
      />
      <EndSessionReasonSheet
        open={pendingConfirm === "end"}
        onConfirm={(selection) => {
          onEndSessionEarly(selection);
          setPendingConfirm(null);
        }}
        onCancel={() => setPendingConfirm(null)}
      />
    </div>
  );
}

function ColorChaseLiveHeader({ session }: { session: ColorChaseSessionState }) {
  const stage = session.currentStage;
  const step = currentColorChaseStep(stage);
  const status =
    session.gameState === GameState.STAGE_COMPLETE
      ? { text: "اكتملت المرحلة", className: "bg-teal-50 text-teal-700" }
      : session.gameState === GameState.START_ZONE
        ? { text: "بانتظار الطفل", className: "bg-sky-50 text-sky-700" }
        : session.gameState === GameState.INSTRUCTIONS || session.gameState === GameState.COUNTDOWN
          ? { text: "جاري التحضير...", className: "bg-sky-50 text-sky-700" }
          : stage.pausedAt !== null
            ? { text: "إيقاف مؤقت", className: "bg-amber-50 text-amber-700" }
            : { text: "قيد اللعب", className: "bg-emerald-50 text-emerald-700" };

  return (
    <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-lg font-bold text-slate-900 sm:text-xl">{session.config.childFirstName}</span>
        <span className="text-xs font-medium text-slate-500 sm:text-sm">
          المرحلة {stage.stageNumber} من {STAGES_PER_DIFFICULTY}
        </span>
      </div>
      <div className="flex items-center gap-2 rounded-2xl border-2 border-teal-500 px-3 py-2">
        <span
          className="h-5 w-5 shrink-0 rounded-lg sm:h-6 sm:w-6"
          style={{ backgroundColor: step ? CHASE_COLOR_HEX[step.targetColor] : "#14b8a6" }}
        />
        <span className="text-base font-bold text-slate-900 sm:text-lg">
          {step ? CHASE_COLOR_LABELS_AR[step.targetColor] : "المهمة مكتملة"}
        </span>
      </div>
      <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold sm:text-sm ${status.className}`}>
        {status.text}
      </span>
    </header>
  );
}

function SequenceStrip({ session }: { session: ColorChaseSessionState }) {
  const stage = session.currentStage;
  return (
    <div className="flex items-center gap-1.5" aria-label="تسلسل الألوان" dir="ltr">
      {stage.plan.steps.map((step, index) => (
        <span
          key={`${step.correctPadId}-${index}`}
          className={`h-7 w-7 rounded-full border-2 transition-transform ${
            index === stage.currentStepIndex ? "scale-110 border-slate-900" : "border-white"
          }`}
          style={{ backgroundColor: CHASE_COLOR_HEX[step.targetColor], opacity: index < stage.currentStepIndex ? 0.35 : 1 }}
        />
      ))}
    </div>
  );
}

function PadButton({
  pad,
  index,
  session,
  disabled,
  onPress,
}: {
  pad: PadId;
  index: number;
  session: ColorChaseSessionState;
  disabled: boolean;
  onPress(): void;
}) {
  const step = currentColorChaseStep(session.currentStage);
  const distractor = step?.distractors.find((item) => item.padId === pad);
  const target = step?.correctPadId === pad;
  const danger = session.currentStage.plan.dangerPadIds.includes(pad);
  const color = target ? step?.targetColor : distractor?.color;
  const role = danger ? "خطر" : target ? "صحيح" : distractor ? "مشتت" : "غير نشط";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPress}
      data-pad-id={pad}
      data-pad-role={role}
      className="relative min-h-20 overflow-hidden rounded-3xl border-2 border-white/15 p-2 font-bold text-white shadow-lg transition active:scale-95 disabled:opacity-45 sm:min-h-24"
      style={{
        background: danger
          ? "radial-gradient(circle,#fb7185 0 20%,#4c0519 23%,#170611 70%)"
          : color
            ? `linear-gradient(145deg,${CHASE_COLOR_HEX[color]},#0f172a)`
            : "linear-gradient(145deg,#334155,#111827)",
      }}
    >
      <span className="absolute start-2 top-2 rounded-full bg-black/30 px-2 py-1 text-[10px]">{index + 1}</span>
      <span className="block text-sm drop-shadow sm:text-base">
        {color ? CHASE_COLOR_LABELS_AR[color] : danger ? "منطقة خطر" : "لوحة"}
      </span>
      <span className="mt-1 block text-[11px] opacity-75">{role}</span>
    </button>
  );
}

function ColorChaseLiveProgress({ session }: { session: ColorChaseSessionState }) {
  const stage = session.currentStage;
  const total = stage.plan.steps.length;
  const percent = total === 0 ? 0 : Math.min(100, (stage.correctCount / total) * 100);
  return (
    <div className="flex flex-col gap-3 px-4 sm:px-6">
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-teal-600 transition-all duration-300" style={{ width: `${percent}%` }} />
      </div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-1.5 font-semibold text-slate-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span dir="ltr">{stage.correctCount} / {total}</span>
        </span>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          {stage.incorrectCount > 0 && <span>{stage.incorrectCount} اختيار غير صحيح</span>}
          {stage.dangerPressCount > 0 && <span>{stage.dangerPressCount} منطقة خطر</span>}
        </div>
      </div>
    </div>
  );
}

function ColorChaseStageCompleteOverlay({
  result,
  currentDifficulty,
  onAdvance,
  onRequestEndSession,
}: {
  result: ColorChaseStageResult;
  currentDifficulty: Difficulty;
  onAdvance(decision: ColorChaseDifficultyDecision): void;
  onRequestEndSession(): void;
}) {
  const nextTarget = getNextStageTarget(currentDifficulty, result.stageNumber);
  const easier = getAdjacentDifficulty(currentDifficulty, "easier");
  const harder = getAdjacentDifficulty(currentDifficulty, "harder");

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 overflow-y-auto bg-white/97 px-6 py-8 backdrop-blur-sm">
      <button
        type="button"
        onClick={onRequestEndSession}
        className="absolute top-4 end-4 min-h-11 touch-manipulation rounded-full px-4 py-2 text-sm font-semibold text-rose-400 transition-colors active:text-rose-600"
      >
        إنهاء الجلسة
      </button>
      <h2 className="text-center text-2xl font-bold text-slate-900 sm:text-3xl">اكتملت المرحلة {result.stageNumber} ✓</h2>
      <div className="flex w-full max-w-sm flex-col gap-2.5">
        <div className="grid grid-cols-3 gap-2.5">
          <StatCard label="اختيارات صحيحة" value={String(result.correctCount)} tone="positive" />
          <StatCard label="اختيار غير صحيح" value={String(result.incorrectCount)} />
          <StatCard label="مناطق خطر" value={String(result.dangerPressCount)} />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <StatCard label="مدة المرحلة" value={formatDurationClock(result.durationMs)} ltr />
          <StatCard label="متوسط زمن الاستجابة المسجل" value={formatReactionTimeSeconds(result.averageResponseTimeMs)} />
        </div>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-2.5">
        {nextTarget && (
          <button
            type="button"
            onClick={() => onAdvance("continue")}
            className="min-h-16 w-full touch-manipulation rounded-2xl bg-teal-600 text-xl font-bold text-white shadow-lg shadow-teal-900/15 transition-all active:scale-[0.98]"
          >
            {nextTarget.difficulty === currentDifficulty
              ? `المرحلة التالية — ${nextTarget.stageNumber}`
              : `التالي — ${DIFFICULTY_LABELS[nextTarget.difficulty].name} المرحلة 1`}
          </button>
        )}
        {!nextTarget && (
          <button
            type="button"
            onClick={() => onAdvance("continue")}
            className="min-h-16 w-full touch-manipulation rounded-2xl bg-teal-600 text-xl font-bold text-white shadow-lg shadow-teal-900/15 transition-all active:scale-[0.98]"
          >
            عرض ملخص الجلسة
          </button>
        )}
        <div className="flex gap-2.5">
          {easier && (
            <button
              type="button"
              onClick={() => onAdvance("easier")}
              className="min-h-14 flex-1 touch-manipulation rounded-2xl border-2 border-slate-200 bg-white text-base font-bold text-slate-700 transition-all active:scale-[0.98] active:bg-slate-50"
            >
              أسهل — {DIFFICULTY_LABELS[easier].name}
            </button>
          )}
          {harder && (
            <button
              type="button"
              onClick={() => onAdvance("harder")}
              className="min-h-14 flex-1 touch-manipulation rounded-2xl border-2 border-amber-200 bg-white text-base font-bold text-amber-700 transition-all active:scale-[0.98] active:bg-amber-50"
            >
              أصعب — {DIFFICULTY_LABELS[harder].name}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function groupByDifficulty(summary: ColorChaseSessionSummary) {
  return summary.difficultiesPlayed.map((difficulty) => ({
    difficulty,
    stages: summary.stageResults.filter((result) => result.difficulty === difficulty),
  }));
}

function ColorChaseStageRow({ result }: { result: ColorChaseStageResult }) {
  if (result.status === ColorChaseStageStatus.SKIPPED) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <span className="text-sm font-semibold text-slate-800">المرحلة {result.stageNumber}</span>
        <span className="text-xs font-semibold text-slate-400">— تم التخطي</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <span className="text-sm font-semibold text-slate-800">المرحلة {result.stageNumber}</span>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="font-medium text-emerald-600">{result.correctCount} صحيح</span>
        <span>{result.incorrectCount} غير صحيح</span>
        <span>{result.dangerPressCount} خطر</span>
        <span>{result.accuracy === null ? "—" : `${Math.round(result.accuracy * 100)}٪`}</span>
        <span dir="ltr" className="font-mono">{formatDurationClock(result.durationMs)}</span>
        <span>{formatReactionTimeSeconds(result.averageResponseTimeMs)}</span>
      </div>
    </div>
  );
}

function SummaryScreen({
  summary,
  sessionPatientId,
  workflow,
  therapistName,
  onNewSession,
  onReplayCelebration,
  onReturnToPatientProfile,
  onStartAnotherForSamePatient,
  onGoToActivities,
  onGoHome,
}: {
  summary: ColorChaseSessionSummary;
  sessionPatientId: string | null;
  workflow?: SessionWorkflowMetadata;
  therapistName?: string | null;
  onNewSession(): void;
  onReplayCelebration(): void;
  onReturnToPatientProfile(): void;
  onStartAnotherForSamePatient(): void;
  onGoToActivities(): void;
  onGoHome(): void;
}) {
  const groups = groupByDifficulty(summary);
  const completedCount = summary.stageResults.filter((result) => result.status === ColorChaseStageStatus.COMPLETED).length;
  const skippedCount = summary.stageResults.length - completedCount;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-5 py-8 sm:px-8 sm:py-10">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">ملخص الجلسة</h1>
        <p className="text-lg font-semibold text-teal-700">{summary.childFirstName}</p>
      </header>

      <SectionCard title="النتائج">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
          <StatCard label="المراحل المكتملة" value={String(completedCount)} tone="positive" ltr />
          <StatCard label="المراحل المتخطاة" value={String(skippedCount)} ltr />
          <StatCard label="اختيارات صحيحة" value={String(summary.totalCorrect)} tone="positive" />
          <StatCard label="اختيارات غير صحيحة" value={String(summary.totalIncorrect)} />
          <StatCard label="مناطق خطر" value={String(summary.totalDangerPresses)} />
          <StatCard label="الدقة الإجمالية" value={formatAccuracyPercent(summary.accuracy)} />
          <StatCard label="المدة الإجمالية" value={formatDurationClock(summary.totalDurationMs)} ltr />
          <StatCard label="متوسط زمن الاستجابة المسجل" value={formatReactionTimeSeconds(summary.averageResponseTimeMs)} />
        </div>
      </SectionCard>

      <SectionCard title="تفاصيل المراحل" className="gap-4">
        {groups.map((group) => (
          <div key={group.difficulty} className="flex flex-col gap-2">
            <h3 className="text-xs font-bold tracking-wide text-teal-700 uppercase">
              {DIFFICULTY_LABELS[group.difficulty].name}
            </h3>
            <div className="flex flex-col gap-2">
              {group.stages.map((result, index) => (
                <ColorChaseStageRow key={`${result.difficulty}-${result.stageNumber}-${index}`} result={result} />
              ))}
            </div>
          </div>
        ))}
      </SectionCard>

      <SessionSummaryWorkflowPanel workflow={workflow} therapistName={therapistName} patientId={sessionPatientId} sessionId={summary.sessionId} />

      <div className="flex flex-col gap-2.5">
        {sessionPatientId ? (
          <>
            <button
              type="button"
              onClick={onReturnToPatientProfile}
              className="min-h-16 touch-manipulation rounded-2xl bg-teal-600 text-xl font-bold text-white shadow-lg shadow-teal-900/15 transition-all active:scale-[0.98]"
            >
              العودة لملف المريض
            </button>
            <button
              type="button"
              onClick={onStartAnotherForSamePatient}
              className="min-h-14 touch-manipulation rounded-2xl border-2 border-teal-200 bg-white text-base font-bold text-teal-700 transition-all active:scale-[0.98] active:bg-teal-50"
            >
              جلسة أخرى لنفس المريض
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onNewSession}
              className="min-h-16 touch-manipulation rounded-2xl bg-teal-600 text-xl font-bold text-white shadow-lg shadow-teal-900/15 transition-all active:scale-[0.98]"
            >
              جلسة جديدة
            </button>
            <button
              type="button"
              onClick={onGoToActivities}
              className="min-h-14 touch-manipulation rounded-2xl border-2 border-teal-200 bg-white text-base font-bold text-teal-700 transition-all active:scale-[0.98] active:bg-teal-50"
            >
              الأنشطة
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onGoHome}
          className="min-h-10 touch-manipulation text-sm font-medium text-slate-400 transition-colors active:text-slate-600"
        >
          الرئيسية
        </button>
      </div>

      <button
        type="button"
        onClick={onReplayCelebration}
        className="min-h-12 touch-manipulation rounded-2xl text-sm font-medium text-teal-600 transition-colors active:text-teal-800"
      >
        إعادة الاحتفال 🎉
      </button>
    </div>
  );
}
