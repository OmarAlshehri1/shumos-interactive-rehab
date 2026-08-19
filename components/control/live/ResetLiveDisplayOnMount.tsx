"use client";

import { useEffect } from "react";
import { getStaffDb, isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { clearLiveSession } from "@/lib/realtime/sessionRepository";

/** Entering a top-level therapist workflow explicitly relinquishes projector gameplay. */
export function ResetLiveDisplayOnMount() {
  useEffect(() => {
    if (isRealtimeEnabled()) void clearLiveSession(getStaffDb());
  }, []);
  return null;
}
