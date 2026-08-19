import type { Metadata } from "next";
import { BubblePopControlScreen } from "@/components/control/bubblepop/BubblePopControlScreen";

export const metadata: Metadata = {
  title: "Shumos Interactive Rehab — فرقع الفقاعات",
};

/**
 * Bubble Pop Wall's own controller route — see lib/games/registry.ts's
 * "bubble-pop-wall" entry, whose `route` points here. Mirrors the other two
 * games' route pattern exactly: this game's own setup/controller experience
 * lives entirely behind BubblePopControlScreen.
 */
export default function BubblePopWallControlPage() {
  return <BubblePopControlScreen />;
}
