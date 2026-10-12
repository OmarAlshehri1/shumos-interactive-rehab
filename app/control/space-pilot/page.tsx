import type { Metadata } from "next";
import { SpacePilotControlScreen } from "@/components/control/spacepilot/SpacePilotControlScreen";
import { SpacePilot3DControl } from '@/components/control/spacepilot3d/SpacePilot3DControl';
import { SPACE_PILOT_3D_ENABLED } from '@/lib/spacepilot3d/releasePolicy';

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
  return SPACE_PILOT_3D_ENABLED ? <SpacePilot3DControl integrated /> : <SpacePilotControlScreen />;
}
