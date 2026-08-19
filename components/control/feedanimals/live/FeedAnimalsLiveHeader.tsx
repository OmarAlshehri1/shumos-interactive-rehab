import { currentRound, GameState, getFeedAnimalsPathLeg, getFeedAnimalsPathStage, STAGES_PER_DIFFICULTY, type FeedAnimalsStageRuntime } from "@/lib/feedanimals";
import { ANIMAL_NAME_AR, FOOD_NAME_AR } from "../copy";

interface FeedAnimalsLiveHeaderProps {
  childFirstName: string;
  stage: FeedAnimalsStageRuntime;
  gameState: GameState;
  isPaused: boolean;
}

function statusLabel(gameState: GameState, isPaused: boolean): { text: string; tone: "playing" | "paused" | "done" | "waiting" } {
  if (gameState === GameState.STAGE_COMPLETE) return { text: "اكتملت المرحلة", tone: "done" };
  if (gameState === GameState.START_ZONE) return { text: "بانتظار الطفل", tone: "waiting" };
  if (gameState === GameState.INSTRUCTIONS || gameState === GameState.COUNTDOWN) return { text: "جاري التحضير...", tone: "waiting" };
  if (isPaused) return { text: "إيقاف مؤقت", tone: "paused" };
  return { text: "قيد اللعب", tone: "playing" };
}

const STATUS_CLASSES: Record<"playing" | "paused" | "done" | "waiting", string> = {
  playing: "bg-emerald-50 text-emerald-700",
  paused: "bg-amber-50 text-amber-700",
  done: "bg-teal-50 text-teal-700",
  waiting: "bg-sky-50 text-sky-700",
};

/** Feed the Animals' own live header — shows the CURRENT round's animal + requested food chip (task section 24's "current animal, requested food"), since there's no single fixed target for the whole stage the way Balloon Quest has one. */
export function FeedAnimalsLiveHeader({ childFirstName, stage, gameState, isPaused }: FeedAnimalsLiveHeaderProps) {
  const status = statusLabel(gameState, isPaused);
  const round = currentRound(stage);
  const pathDef = stage.kind === "path" ? getFeedAnimalsPathStage(stage.difficulty, stage.stageNumber) : null;
  const activeLeg = pathDef ? getFeedAnimalsPathLeg(pathDef, stage.legIndex) : null;

  return (
    <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-lg font-bold text-slate-900 sm:text-xl">{childFirstName}</span>
        <span className="text-xs font-medium text-slate-500 sm:text-sm">
          المرحلة {stage.stageNumber} من {STAGES_PER_DIFFICULTY}
        </span>
      </div>

      {(round || activeLeg) && (
        <div className="flex items-center gap-2 rounded-2xl border-2 border-amber-500 px-3 py-2">
          <span className="text-sm font-bold text-slate-900 sm:text-base">
            {round && `${ANIMAL_NAME_AR[round.animal]} ← ${FOOD_NAME_AR[round.correctFood]}`}
            {activeLeg && `${ANIMAL_NAME_AR[activeLeg.animal]} ← ${FOOD_NAME_AR[activeLeg.food]}`}
          </span>
        </div>
      )}

      <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold sm:text-sm ${STATUS_CLASSES[status.tone]}`}>{status.text}</span>
    </header>
  );
}
