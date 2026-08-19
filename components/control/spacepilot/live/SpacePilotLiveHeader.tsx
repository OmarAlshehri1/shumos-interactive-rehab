import { Difficulty, GameState, stageStarsCollected, totalStarsFor, type SpacePilotAnyStageRuntime } from "@/lib/spacepilot";

interface SpacePilotLiveHeaderProps {
  childFirstName: string;
  stage: SpacePilotAnyStageRuntime;
  difficulty: Difficulty;
  gameState: GameState;
  isPaused: boolean;
}

const STAGE_TITLE_AR: Record<Difficulty, string> = {
  [Difficulty.EASY]: "رحلة النجوم",
  [Difficulty.MEDIUM]: "حزام النيازك",
  [Difficulty.ADVANCED]: "مهمة المجرة",
};

function statusLabel(gameState: GameState, isPaused: boolean): { text: string; tone: "playing" | "paused" | "done" | "waiting" } {
  if (gameState === GameState.STAGE_COMPLETE) return { text: "اكتملت الرحلة", tone: "done" };
  if (gameState === GameState.START_ZONE) return { text: "بانتظار الطفل", tone: "waiting" };
  if (gameState === GameState.INSTRUCTIONS || gameState === GameState.COUNTDOWN) return { text: "جاري التحضير...", tone: "waiting" };
  if (isPaused) return { text: "إيقاف مؤقت", tone: "paused" };
  return { text: "قيد اللعب", tone: "playing" };
}

const STATUS_CLASSES: Record<"playing" | "paused" | "done" | "waiting", string> = {
  playing: "bg-emerald-50 text-emerald-700",
  paused: "bg-amber-50 text-amber-700",
  done: "bg-indigo-50 text-indigo-700",
  waiting: "bg-sky-50 text-sky-700",
};

/** Space Pilot's own live header — shows the rocket's current upgrade level (this game's central payoff, task's "the main reward is the rocket transformation") instead of a stage number, since there is only one level. */
export function SpacePilotLiveHeader({ childFirstName, stage, difficulty, gameState, isPaused }: SpacePilotLiveHeaderProps) {
  const status = statusLabel(gameState, isPaused);
  const collected = stageStarsCollected(stage);
  const total = totalStarsFor(difficulty);

  return (
    <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-lg font-bold text-slate-900 sm:text-xl">{childFirstName}</span>
        <span className="text-xs font-medium text-slate-500 sm:text-sm">{STAGE_TITLE_AR[difficulty]}</span>
      </div>

      <div className="flex items-center gap-2 rounded-2xl border-2 border-indigo-200 px-3 py-2">
        <span className="text-sm font-bold text-indigo-700 sm:text-base">
          🚀 {collected} / {total}
        </span>
      </div>

      <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold sm:text-sm ${STATUS_CLASSES[status.tone]}`}>{status.text}</span>
    </header>
  );
}
