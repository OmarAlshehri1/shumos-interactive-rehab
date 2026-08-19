import { BubbleShape, currentTargetId, GameState, STAGES_PER_DIFFICULTY, type BubblePopStageRuntime } from "@/lib/bubblepop";
import { BUBBLE_COLOR_HEX, BUBBLE_COLOR_NAME_AR, BUBBLE_SHAPE_NAME_AR } from "../copy";

interface BubblePopLiveHeaderProps {
  childFirstName: string;
  stage: BubblePopStageRuntime;
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

/** Bubble Pop Wall's own live header — shows the CURRENT requested target's color/shape chip (this game's analogue to Balloon Quest's target-color chip) plus the stage number, since there's no single fixed target color for the whole stage the way Balloon Quest has one. */
export function BubblePopLiveHeader({ childFirstName, stage, gameState, isPaused }: BubblePopLiveHeaderProps) {
  const status = statusLabel(gameState, isPaused);
  const targetId = currentTargetId(stage);
  const targetBubble = targetId ? stage.bubbles.find((b) => b.id === targetId) : null;

  return (
    <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-lg font-bold text-slate-900 sm:text-xl">{childFirstName}</span>
        <span className="text-xs font-medium text-slate-500 sm:text-sm">
          المرحلة {stage.stageNumber} من {STAGES_PER_DIFFICULTY}
        </span>
      </div>

      {targetBubble && (
        <div className="flex items-center gap-2 rounded-2xl border-2 px-3 py-2" style={{ borderColor: BUBBLE_COLOR_HEX[targetBubble.color] }}>
          <span className="h-5 w-5 shrink-0 rounded-full sm:h-6 sm:w-6" style={{ backgroundColor: BUBBLE_COLOR_HEX[targetBubble.color] }} />
          <span className="text-sm font-bold text-slate-900 sm:text-base">
            {BUBBLE_COLOR_NAME_AR[targetBubble.color]}
            {targetBubble.shape !== BubbleShape.CIRCLE ? ` · ${BUBBLE_SHAPE_NAME_AR[targetBubble.shape]}` : ""}
          </span>
        </div>
      )}

      <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold sm:text-sm ${STATUS_CLASSES[status.tone]}`}>{status.text}</span>
    </header>
  );
}
