import type { Metadata } from "next";
import { FootstepsControlScreen } from "@/components/control/footsteps/FootstepsControlScreen";
import { FootControl } from "@/components/control/footsteps3d/FootControl";
import { FOOTSTEPS_3D_ENABLED } from "@/lib/footsteps3d/registration";

export const metadata: Metadata = {
  title: "Shumos Interactive Rehab — اتبع الخطوات",
};

/**
 * Follow the Footsteps' own controller route — see lib/games/registry.ts's
 * "follow-the-footsteps" entry, whose `route` points here. With the 3D feature flag on (lib/footsteps3d/registration.ts)
 * the Enchanted Forest opens by default; with it off the original game is served (the rollback path, unchanged).
 */
export default function FollowTheFootstepsControlPage() {
  return FOOTSTEPS_3D_ENABLED ? <FootControl /> : <FootstepsControlScreen />;
}
