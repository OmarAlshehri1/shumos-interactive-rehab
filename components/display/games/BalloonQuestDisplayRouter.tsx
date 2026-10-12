"use client";

import { isBq3Session } from "@/lib/balloonquest/live";
import type { Bq3LiveSession } from "@/lib/balloonquest/live";
import { BalloonQuest3DLiveDisplay } from "../balloonquest3d/game/BalloonQuest3DLiveDisplay";
import type { SharedGameDisplayProps } from "../gameDisplayRegistry";
import { BalloonQuestDisplay, type BalloonQuestDisplayProps } from "./BalloonQuestDisplay";

/**
 * The `balloon-quest` game id now carries two engines: the redesigned game
 * (live session tagged `engine: "bq3"`) and the original game, kept as the
 * rollback path. The record's own shape — never a guess — selects the module,
 * so a legacy session in flight keeps rendering exactly as before.
 */
export function BalloonQuestDisplayRouter(props: SharedGameDisplayProps) {
  if (isBq3Session(props.session)) return <BalloonQuest3DLiveDisplay session={props.session as unknown as Bq3LiveSession} />;
  return <BalloonQuestDisplay {...(props as unknown as BalloonQuestDisplayProps)} />;
}
