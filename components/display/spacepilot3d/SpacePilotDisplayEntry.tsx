"use client";
import { DisplayScreen } from "@/components/display/DisplayScreen";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { SpacePilot3DSessionDisplay } from "./SpacePilot3DSessionDisplay";

/** The dedicated child-screen URL: the normal platform Display with Firebase; the local-computer scene without. */
export function SpacePilotDisplayEntry() {
  return isRealtimeEnabled() ? <DisplayScreen /> : <SpacePilot3DSessionDisplay integrated />;
}
