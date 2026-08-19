"use client";

interface SpacePilotSessionControlsProps {
  isPaused: boolean;
  disabled: boolean;
  offline?: boolean;
  onPauseResume: () => void;
  onRestartLevel: () => void;
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
      ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/15"
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

/**
 * Space Pilot's own session controls — same pause/restart/end-session
 * hierarchy as every other game's SessionControls, deliberately WITHOUT a
 * "تخطي المرحلة" button: this prototype has exactly one level, so there is
 * nothing to skip to (task's "keep unavailable future content clearly
 * disabled/not selectable rather than pretending it exists").
 */
export function SpacePilotSessionControls({ isPaused, disabled, offline, onPauseResume, onRestartLevel, onEndSession }: SpacePilotSessionControlsProps) {
  return (
    <div className="flex flex-col gap-2.5 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
      {offline && <p className="text-center text-xs font-bold text-rose-600">غير متصل — لن تُزامن الإجراءات مع الشاشة</p>}
      <ControlButton onClick={onPauseResume} disabled={disabled || offline} tone="primary">
        {isPaused ? "استكمال" : "إيقاف مؤقت"}
      </ControlButton>
      <ControlButton onClick={onRestartLevel} disabled={disabled || offline} tone="neutral">
        إعادة الرحلة
      </ControlButton>
      <ControlButton onClick={onEndSession} disabled={offline} tone="danger">
        إنهاء الجلسة
      </ControlButton>
    </div>
  );
}
