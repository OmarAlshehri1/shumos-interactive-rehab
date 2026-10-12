"use client";
import { DisplayScreen } from "@/components/display/DisplayScreen";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { BuildQuestDisplay } from "./BuildQuestDisplay";

/**
 * The dedicated child-screen URL. With Firebase it is simply the normal platform Display (which follows the shared
 * live session and shows Build Quest through the display registry); without Firebase it is the local-computer Display.
 */
export function BuildQuestDisplayEntry() {
  return isRealtimeEnabled() ? <DisplayScreen /> : <BuildQuestDisplay />;
}
