import type { Metadata } from "next";
import { ControlScreen } from "@/components/control/ControlScreen";

export const metadata: Metadata = {
  title: "Shumos Interactive Rehab — مغامرة البالونات (النسخة السابقة)",
  robots: { index: false, follow: false },
};

/**
 * ROLLBACK ROUTE: the original Balloon Quest controller, unchanged. It is not
 * listed in the game library (the registry points at /control/balloon-quest,
 * which now serves the redesigned game) but stays reachable here — and
 * NEXT_PUBLIC_BALLOON_QUEST_LEGACY=1 makes /control/balloon-quest serve it too.
 */
export default function LegacyBalloonQuestControlPage() {
  return <ControlScreen />;
}
