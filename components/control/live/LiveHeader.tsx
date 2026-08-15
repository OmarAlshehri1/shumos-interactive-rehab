import { GameState, STAGES_PER_DIFFICULTY, type BalloonColor, type StageNumber } from "@/lib/game";
import { BALLOON_COLOR_THEME } from "@/components/display/colorPalette";

interface LiveHeaderProps {
  childFirstName: string;
  stageNumber: StageNumber;
  targetColor: BalloonColor;
  gameState: GameState;
  isPaused: boolean;
}

function statusLabel(gameState: GameState, isPaused: boolean): { text: string; tone: "playing" | "paused" | "done" | "waiting" } {
  if (gameState === GameState.STAGE_COMPLETE) return { text: "اكتملت المرحلة", tone: "done" };
  // TASK 8.2: distinct tone/label while waiting on the therapist's Start Zone confirmation.
  if (gameState === GameState.START_ZONE) return { text: "بانتظار الطفل", tone: "waiting" };
  // RELIABILITY FIX: INSTRUCTIONS/COUNTDOWN used to fall through to the
  // default "قيد اللعب" (Playing) case below — before this fix, a
  // therapist saw "Playing" the instant "الطفل جاهز" was tapped, seconds
  // before the child-facing countdown on /display had actually finished
  // and real PLAYING began. Tapping "إيقاف مؤقت" during that window looked
  // broken: SessionControls' controls were enabled, but
  // useRealtimeControllerSession.ts's pauseOrResume() correctly refuses to
  // act outside GameState.PLAYING, so nothing visibly happened — no error,
  // no state change, no explanation. See LiveSessionScreen.tsx's matching
  // fix, which now also disables those controls during this same window.
  if (gameState === GameState.INSTRUCTIONS || gameState === GameState.COUNTDOWN) {
    return { text: "جاري التحضير...", tone: "waiting" };
  }
  if (isPaused) return { text: "إيقاف مؤقت", tone: "paused" };
  return { text: "قيد اللعب", tone: "playing" };
}

const STATUS_CLASSES: Record<"playing" | "paused" | "done" | "waiting", string> = {
  playing: "bg-emerald-50 text-emerald-700",
  paused: "bg-amber-50 text-amber-700",
  done: "bg-teal-50 text-teal-700",
  waiting: "bg-sky-50 text-sky-700",
};

export function LiveHeader({ childFirstName, stageNumber, targetColor, gameState, isPaused }: LiveHeaderProps) {
  const theme = BALLOON_COLOR_THEME[targetColor];
  const status = statusLabel(gameState, isPaused);

  return (
    <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-lg font-bold text-slate-900 sm:text-xl">{childFirstName}</span>
        <span className="text-xs font-medium text-slate-500 sm:text-sm">المرحلة {stageNumber} من {STAGES_PER_DIFFICULTY}</span>
      </div>

      <div className="flex items-center gap-2 rounded-2xl border-2 px-3 py-2" style={{ borderColor: theme.base }}>
        <span className="h-5 w-5 shrink-0 rounded-full sm:h-6 sm:w-6" style={{ backgroundColor: theme.base }} />
        <span className="text-base font-bold text-slate-900 sm:text-lg">{theme.definiteNameAr}</span>
      </div>

      <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold sm:text-sm ${STATUS_CLASSES[status.tone]}`}>
        {status.text}
      </span>
    </header>
  );
}
