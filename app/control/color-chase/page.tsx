import type { Metadata } from "next";
import { ColorChaseControlScreen } from "@/components/control/colorchase/ColorChaseControlScreen";
import { ColorChaseControl } from "@/components/control/colorchase3d/ColorChaseControl";
import { COLOR_CHASE_3D_ENABLED } from "@/lib/colorchase3d/registration";

export const metadata: Metadata = { title: "Shumos Interactive Rehab — مطاردة الألوان" };

/**
 * Color Chase's own controller route (the registry entry's `route`). With the 3D feature flag on
 * (lib/colorchase3d/registration.ts) The Lost Colors garden opens by default; with it off the original game is served
 * (the rollback path, unchanged).
 */
export default function ColorChasePage() { return COLOR_CHASE_3D_ENABLED ? <ColorChaseControl /> : <ColorChaseControlScreen />; }
