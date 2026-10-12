import type { DisplayState } from "@/lib/balloonquest/protocol";
import { BalloonStage } from "./BalloonStage";
import { GameHud } from "./GameHud";
import { BalloonQuestScenes } from "./Scenes";

interface Props {
  state: DisplayState;
  getSimTimeMs: () => number;
  showSymbols?: boolean;
  embedded?: boolean;
}

/** The child-facing picture for one authoritative state: field + HUD while playing, calm scenes otherwise. Shared by every Display flavour. */
export function BalloonQuest3DView({ state, getSimTimeMs, showSymbols = false, embedded = false }: Props) {
  const showField = state.lifecycle === "playing" || state.lifecycle === "paused" || state.lifecycle === "suspended" || state.lifecycle === "stage-complete";
  return (
    <BalloonStage state={showField ? state : { ...state, balloons: [] }} getSimTimeMs={getSimTimeMs} showSymbols={showSymbols} embedded={embedded}>
      {showField && <GameHud state={state} showSymbols={showSymbols} />}
      <BalloonQuestScenes state={state} />
    </BalloonStage>
  );
}
