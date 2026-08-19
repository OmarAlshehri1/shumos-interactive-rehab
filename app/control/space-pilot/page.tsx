import type { Metadata } from "next";
import { SpacePilotControlScreen } from "@/components/control/spacepilot/SpacePilotControlScreen";

export const metadata: Metadata = {
  title: "Shumos Interactive Rehab — قائد الفضاء",
};

/**
 * Space Pilot's own controller route — see lib/games/registry.ts's
 * "space-pilot" entry, whose `route` points here. Mirrors every other
 * game's route pattern exactly: this game's own setup/controller experience
 * lives entirely behind SpacePilotControlScreen.
 */
export default function SpacePilotControlPage() {
  return <SpacePilotControlScreen />;
}
