"use client";

interface SessionControlsProps {
  isPaused: boolean;
  disabled: boolean;
  /**
   * TASK 8: true when Firebase isn't connected — disables every control,
   * including "إنهاء الجلسة" (previously always enabled), since none of
   * these mutations would actually reach the display right now either.
   * See BalloonMap's matching `offline` prop for the same reasoning.
   */
  offline?: boolean;
  onPauseResume: () => void;
  onRestartStage: () => void;
  onSkipStage: () => void;
  onEndSession: () => void;
}

function ControlButton({
  onClick,
  disabled,
  tone,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  tone: "primary" | "neutral" | "danger";
  children: React.ReactNode;
}) {
  const toneClasses =
    tone === "primary"
      ? "bg-teal-600 text-white shadow-md shadow-teal-900/15"
      : tone === "danger"
        ? "border-2 border-rose-200 bg-white text-rose-600 active:bg-rose-50"
        : "border-2 border-slate-200 bg-white text-slate-700 active:bg-slate-50";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-12 flex-1 touch-manipulation rounded-2xl text-sm font-bold transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 ${toneClasses}`}
    >
      {children}
    </button>
  );
}

export function SessionControls({ isPaused, disabled, offline, onPauseResume, onRestartStage, onSkipStage, onEndSession }: SessionControlsProps) {
  return (
    <div className="flex flex-col gap-2.5 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
      {offline && <p className="text-center text-xs font-bold text-rose-600">غير متصل — لن تُزامن الإجراءات مع الشاشة</p>}
      <ControlButton onClick={onPauseResume} disabled={disabled || offline} tone="primary">
        {isPaused ? "استكمال" : "إيقاف مؤقت"}
      </ControlButton>
      <div className="flex gap-2.5">
        <ControlButton onClick={onRestartStage} disabled={disabled || offline} tone="neutral">
          إعادة المرحلة
        </ControlButton>
        <ControlButton onClick={onSkipStage} disabled={disabled || offline} tone="neutral">
          تخطي المرحلة
        </ControlButton>
      </div>
      <ControlButton onClick={onEndSession} disabled={offline} tone="danger">
        إنهاء الجلسة
      </ControlButton>
    </div>
  );
}
