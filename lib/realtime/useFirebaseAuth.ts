"use client";

import { useEffect, useState } from "react";
import { subscribeToAuthState, type AuthState } from "./authClient";

/**
 * The one hook both realtime adapters use to know whether it's safe to
 * touch RTDB yet. Firebase Client
 *   -> Auth Bootstrap (authClient.ts)
 *   -> Realtime adapters (useRealtimeControllerSession, useRealtimeDisplaySession)
 * — see the Task 8 report's "Auth architecture" section.
 */
export function useFirebaseAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: "initializing", uid: null });

  useEffect(() => {
    return subscribeToAuthState(setState);
  }, []);

  return state;
}
