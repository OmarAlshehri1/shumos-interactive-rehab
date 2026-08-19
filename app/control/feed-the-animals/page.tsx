import type { Metadata } from "next";
import { FeedAnimalsControlScreen } from "@/components/control/feedanimals/FeedAnimalsControlScreen";

export const metadata: Metadata = {
  title: "Shumos Interactive Rehab — أطعم الحيوانات",
};

/**
 * Feed the Animals' own controller route — see lib/games/registry.ts's
 * "feed-the-animals" entry, whose `route` points here. Mirrors every other
 * game's route pattern exactly: this game's own setup/controller experience
 * lives entirely behind FeedAnimalsControlScreen.
 */
export default function FeedTheAnimalsControlPage() {
  return <FeedAnimalsControlScreen />;
}
