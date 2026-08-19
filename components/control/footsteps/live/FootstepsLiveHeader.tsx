import { GameState, STAGES_PER_DIFFICULTY, type StageNumber } from "@/lib/footsteps";

interface FootstepsLiveHeaderProps {
  childFirstName: string;
  stageNumber: StageNumber;
  currentIndex: number;
  totalSteps: number;
  gameState: GameState;
  isPaused: boolean;
}

function statusLabel(gameState: GameState, isPaused: boolean): { text: string; tone: "playing" | "paused" | "done" | "waiting" } {
  if (gameState === GameState.STAGE_COMPLETE) return { text: "اكتملت المرحلة", tone: "done" };
  if (gameState === GameState.START_ZONE) return { text: "بانتظار الطفل", tone: "waiting" };
  if (gameState === GameState.INSTRUCTIONS || gameState === GameState.COUNTDOWN) {
    return { text: "جاري التحضير...", tone: "waiting" };
  }
  if (isPaused) return { text: "إيقاف مؤقت", tone: "paused" };
  return { text: "قيد المشي", tone: "playing" };
}

const STATUS_CLASSES: Record<"playing" | "paused" | "done" | "waiting", string> = {
  playing: "bg-emerald-50 text-emerald-700",
  paused: "bg-amber-50 text-amber-700",
  done: "bg-indigo-50 text-indigo-700",
  waiting: "bg-sky-50 text-sky-700",
};

/** Follow the Footsteps' own live header — no target-color chip (this game has no such concept); shows step progress within the stage instead. */
export function FootstepsLiveHeader({ childFirstName, stageNumber, currentIndex, totalSteps, gameState, isPaused }: FootstepsLiveHeaderProps) {
  const status = statusLabel(gameState, isPaused);

  return (
    <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-lg font-bold text-slate-900 sm:text-xl">{childFirstName}</span>
        <span className="text-xs font-medium text-slate-500 sm:text-sm">
          المرحلة {stageNumber} من {STAGES_PER_DIFFICULTY}
        </span>
      </div>

      <div className="flex items-center gap-2 rounded-2xl border-2 border-indigo-500 px-3 py-2">
        <span className="text-base font-bold text-slate-900 sm:text-lg" dir="ltr">
          {Math.min(currentIndex + 1, totalSteps)} / {totalSteps}
        </span>
        <span className="text-xs font-medium text-slate-500">خطوة</span>
      </div>

      <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold sm:text-sm ${STATUS_CLASSES[status.tone]}`}>{status.text}</span>
    </header>
  );
}
