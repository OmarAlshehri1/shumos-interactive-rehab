"use client";

import { useEffect } from "react";
import { getStaffDb, isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { clearWorkflowLiveSession } from "@/lib/realtime/workflowLiveCleanup";
import { controlTabId } from "@/lib/liveGame/ownership";

/** Entering a workflow relinquishes this window's gameplay while preserving other Control windows. */
export function ResetLiveDisplayOnMount() {
  useEffect(() => {
    if (isRealtimeEnabled()) void clearWorkflowLiveSession(getStaffDb(), controlTabId()).catch(error => {
      console.error("[realtime] Workflow session cleanup failed:", error);
    });
  }, []);
  return null;
}
