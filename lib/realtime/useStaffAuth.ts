"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isActiveStaff } from "./staffRepository";
import {
  signInStaff,
  signOutStaff,
  subscribeToStaffAuthState,
  type StaffAuthState,
  type StaffSignInError,
} from "./staffAuthClient";

/**
 * STAFF AUTHENTICATION FOUNDATION.
 *
 * Two layers, deliberately kept distinct:
 *  1. Firebase Auth identity (email + password) — "is this a real account."
 *  2. The /staff allowlist — "is this account currently active staff."
 * A valid Firebase account whose /staff record is missing or `active:
 * false` (an ex-employee whose login still technically works, since
 * deactivating staff access doesn't touch Firebase Auth itself) must never
 * reach the app — see `unauthorized` below. Security Rules are what
 * actually ENFORCE this for data access (see database.rules.json); this
 * check exists so that case fails with a clear message at login instead of
 * a confusing silent rule-rejection the first time the therapist tries to
 * do anything.
 */
export type StaffAuthPhase =
  | "initializing" // haven't heard from Firebase Auth yet
  | "checkingAccess" // signed in, checking the /staff allowlist
  | "signedOut" // no Firebase session — show the login form
  | "unauthorized" // signed in, but not an active staff record
  | "authorized" // signed in AND active staff — show the app
  | "error"; // Auth bootstrap itself failed (e.g. network)

export interface UseStaffAuthResult {
  phase: StaffAuthPhase;
  /** Only meaningful once `phase === "authorized"` — see useRealtimeControllerSession.ts's lease/ownership use. */
  uid: string | null;
  email: string | null;
  isSigningIn: boolean;
  /** Resolves to null on success, or the mapped error to show — see StaffLoginScreen.tsx. */
  signIn: (email: string, password: string) => Promise<StaffSignInError | null>;
  signOut: () => void;
}

export function useStaffAuth(): UseStaffAuthResult {
  const [authState, setAuthState] = useState<StaffAuthState>({ status: "initializing", uid: null, email: null });
  // The allowlist result for whichever uid it was last computed for —
  // deliberately not "reset" on sign-out/uid-change via a second setState
  // call; `phase` below only trusts this when `result.uid` still matches
  // the CURRENT authState.uid, so a stale result for a previous/different
  // uid is automatically treated as "still checking," never a stale
  // false-positive. Every setState call here happens inside an async
  // callback (the isActiveStaff().then()/.catch()), never synchronously
  // inside the effect body.
  const [authorization, setAuthorization] = useState<{ uid: string; active: boolean } | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const checkingUidRef = useRef<string | null>(null);

  useEffect(() => subscribeToStaffAuthState(setAuthState), []);

  // Runs the /staff allowlist check exactly once per signed-in uid — not on
  // every render, and not again just because some unrelated state changed.
  useEffect(() => {
    if (authState.status !== "authenticated" || !authState.uid) return;
    if (checkingUidRef.current === authState.uid) return;
    checkingUidRef.current = authState.uid;
    const uid = authState.uid;
    isActiveStaff(uid)
      .then((active) => setAuthorization({ uid, active }))
      .catch(() => setAuthorization({ uid, active: false })); // fail closed — an unreadable allowlist is never treated as authorized
  }, [authState.status, authState.uid]);

  const signIn = useCallback(async (email: string, password: string): Promise<StaffSignInError | null> => {
    setIsSigningIn(true);
    try {
      await signInStaff(email, password);
      return null;
    } catch (error) {
      return error as StaffSignInError;
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const signOut = useCallback(() => {
    void signOutStaff();
  }, []);

  const phase: StaffAuthPhase = (() => {
    if (authState.status === "initializing") return "initializing";
    if (authState.status === "failed") return "error";
    if (authState.status === "unauthenticated") return "signedOut";
    // authenticated:
    if (!authorization || authorization.uid !== authState.uid) return "checkingAccess";
    return authorization.active ? "authorized" : "unauthorized";
  })();

  return { phase, uid: authState.uid, email: authState.email, isSigningIn, signIn, signOut };
}
