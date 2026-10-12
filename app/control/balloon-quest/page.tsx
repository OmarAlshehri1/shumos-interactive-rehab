import type { Metadata } from "next";
import { BalloonQuestControl } from "@/components/control/balloonquest3d/BalloonQuestControl";
import { ControlScreen } from "@/components/control/ControlScreen";
import { LEGACY_BALLOON_QUEST } from "@/lib/balloonquest/rollback";

export const metadata: Metadata = {
  title: "Shumos Interactive Rehab — مغامرة البالونات",
};

/**
 * Balloon Quest's controller route — lib/games/registry.ts's "balloon-quest"
 * entry points here. It now serves the redesigned game (3 levels x 3 stages,
 * rising balloons). The original implementation is kept intact as the rollback
 * path: /control/balloon-quest-legacy always renders it, and building with
 * NEXT_PUBLIC_BALLOON_QUEST_LEGACY=1 makes this route render it too.
 */
export default function BalloonQuestControlPage() {
  return LEGACY_BALLOON_QUEST ? <ControlScreen /> : <BalloonQuestControl />;
}
