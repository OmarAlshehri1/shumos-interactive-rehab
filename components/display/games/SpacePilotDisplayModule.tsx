"use client";

import type { ComponentType } from "react";
import { isSpacePilotLive, type SpacePilotLiveSession } from "@/lib/spacepilot3d/cloudState";
import { SpacePilot3DSessionDisplay } from "../spacepilot3d/SpacePilot3DSessionDisplay";
import type { SharedGameDisplayProps } from "../gameDisplayRegistry";

/**
 * Display-registry module for `space-pilot`: a session tagged `engine: "sp3"` renders the 3D scene from the shared live
 * record (read-only; the only thing this Display writes is its acknowledgement); an untagged session is the original
 * Space Pilot and renders with the original module, exactly as before (rollback path).
 */
export function SpacePilotDisplayModule({ Legacy, ...props }: SharedGameDisplayProps & { Legacy: ComponentType<SharedGameDisplayProps> }) {
  return isSpacePilotLive(props.session) ? <SpacePilot3DSessionDisplay integrated live={props.session as unknown as SpacePilotLiveSession} /> : <Legacy {...props} />;
}
