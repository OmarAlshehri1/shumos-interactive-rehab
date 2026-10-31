import {
  type Auth,
  browserLocalPersistence,
  connectAuthEmulator,
  initializeAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import { getEmulatorConfig, getStaffFirebaseApp } from "./firebaseClient";
import { installBenignAuthRejectionFilter } from "./benignAuthRejections";

/**
 * STAFF AUTHENTICATION FOUNDATION — the ONE file that signs a /control tab
 * in as a real staff member (email + password). Deliberately separate from
 * authClient.ts, which remains exactly what it always was: /display's
 * silent, anonymous, no-login identity. That distinction is the whole
 * point of this task — see the report's "Staff authentication
 * architecture" section for why a compromised/anonymous projector
 * identity must never be treated as staff authorization.
 *
 * There is deliberately NO public sign-up here — no createUserWithEmailAndPassword
 * export exists in this file at all. Staff accounts are created manually
 * in the Firebase Console by the administrator (see the report's "Manual
 * Firebase Console steps"); this file only ever signs an EXISTING account
 * in or out.
 *
 * AUTH ISOLATION HARDENING: this now runs on its OWN named Firebase app
 * (getStaffFirebaseApp(), see firebaseClient.ts) — a structurally separate
 * Auth object from authClient.ts's getDisplayFirebaseApp(), not just a
 * "we promise never to run both in one tab" convention. Previously both
 * called `getAuth(getFirebaseApp())` against the SAME default app, which
 * meant a /control -> /display same-tab navigation could leave /display
 * signed in as the staff member instead of anonymous — see
 * getDisplayFirebaseApp()'s doc comment for the full root cause. This split
 * makes that structurally impossible regardless of navigation pattern.
 */

export type StaffAuthStatus = "initializing" | "authenticated" | "unauthenticated" | "failed";

export interface StaffAuthState {
  status: StaffAuthStatus;
  uid: string | null;
  email: string | null;
  displayName: string | null;
}

/**
 * RELIABILITY FIX — "Database is closing/hidden" unhandled rejections
 * observed during real device testing. This used to install its own
 * window-level listener here; that listener is now shared with /display
 * (which hits the identical @firebase/auth internal quirk on its own
 * anonymous Auth instance) — see benignAuthRejections.ts for the full root
 * cause and why /display needed the exact same protection.
 */
installBenignAuthRejectionFilter();

let auth: Auth | null = null;
let authEmulatorConnected = false;
let persistenceReady: Promise<void> | null = null;

function getStaffAuthInstance(): Auth {
  if (!auth) {
    // Every window must choose the SAME persistence before Auth initializes.
    // getAuth() defaults to IndexedDB; a Display tab would migrate the staff
    // login out of localStorage and its removal event signed Control out.
    auth = initializeAuth(getStaffFirebaseApp(), { persistence: browserLocalPersistence });
  }
  const emulator = getEmulatorConfig();
  if (emulator && !authEmulatorConnected) {
    authEmulatorConnected = true;
    connectAuthEmulator(auth, `http://${emulator.host}:${emulator.authPort}`, { disableWarnings: true });
  }
  return auth;
}

/**
 * TASK 5 — SESSION PERSISTENCE: explicit, not relied-on-as-default, so a
 * refresh doesn't force the therapist to log back in mid-clinic-day.
 * browserLocalPersistence (localStorage-backed) survives tab closes and
 * refreshes; it's cleared only by an explicit signOut() (تسجيل الخروج) or
 * the browser's own storage being cleared. Called once, before the first
 * sign-in attempt — setPersistence() only affects sign-ins that happen
 * after it resolves.
 */
function ensurePersistence(authInstance: Auth): Promise<void> {
  if (!persistenceReady) {
    persistenceReady = setPersistence(authInstance, browserLocalPersistence);
  }
  return persistenceReady;
}

export type StaffAuthListener = (state: StaffAuthState) => void;

/** Subscribes to this tab's STAFF auth state. Never triggers a sign-in on its own (unlike authClient.ts's anonymous flow) — the therapist must submit the login form; see signInStaff(). */
export function subscribeToStaffAuthState(listener: StaffAuthListener): () => void {
  const authInstance = getStaffAuthInstance();
  listener({ status: "initializing", uid: null, email: null, displayName: null });

  return onAuthStateChanged(
    authInstance,
    (user) => {
      if (user) {
        listener({ status: "authenticated", uid: user.uid, email: user.email, displayName: user.displayName ?? null });
      } else {
        listener({ status: "unauthenticated", uid: null, email: null, displayName: null });
      }
    },
    () => {
      listener({ status: "failed", uid: null, email: null, displayName: null });
    },
  );
}

/** TASK 11 — LOGIN ERROR UX: a closed, small set of Arabic-mappable outcomes. Never the raw Firebase error code, and deliberately doesn't distinguish "wrong password" from "unknown account" (see the report's security rationale). */
export type StaffSignInError = "invalid-credentials" | "network" | "unknown";

const INVALID_CREDENTIAL_CODES = new Set([
  "auth/invalid-credential",
  "auth/wrong-password",
  "auth/user-not-found",
  "auth/invalid-email",
  "auth/user-disabled",
]);

function mapSignInError(error: unknown): StaffSignInError {
  const code = (error as { code?: string } | null)?.code ?? "";
  if (INVALID_CREDENTIAL_CODES.has(code)) return "invalid-credentials";
  if (code === "auth/network-request-failed" || code === "auth/timeout") return "network";
  return "unknown";
}

/**
 * Signs an EXISTING staff account in. Throws a StaffSignInError (never the
 * raw Firebase error) on failure — never logs the password, never touches
 * localStorage/Realtime Database itself (Firebase Auth owns the credential
 * and its own persisted session entirely).
 */
export async function signInStaff(email: string, password: string): Promise<void> {
  const authInstance = getStaffAuthInstance();
  try {
    await ensurePersistence(authInstance);
    const credential = await signInWithEmailAndPassword(authInstance, email, password);
    const { resumeDisplayApprovals } = await import("./displayAuthorization");
    resumeDisplayApprovals(credential.user.uid);
  } catch (error) {
    throw mapSignInError(error);
  }
}

/** Firebase delivers its one-time reset link. Unknown accounts receive the same UI outcome. */
export async function requestStaffPasswordReset(email: string): Promise<StaffSignInError | null> {
  try {
    const instance = getStaffAuthInstance();
    instance.languageCode = "ar";
    await sendPasswordResetEmail(instance, email.trim());
    return null;
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === "auth/user-not-found") return null;
    return code === "auth/network-request-failed" || code === "auth/timeout" ? "network" : "unknown";
  }
}

export async function signOutStaff(): Promise<void> {
  const instance = getStaffAuthInstance();
  if (instance.currentUser) {
    const { revokeDisplaysForStaff } = await import("./displayAuthorization");
    // Fail closed: do not silently leave authorized projectors behind if revocation fails.
    await revokeDisplaysForStaff(instance.currentUser.uid);
  }
  await signOut(instance);
}

export async function getStaffIdToken(): Promise<string | null> {
  const instance = getStaffAuthInstance();
  await instance.authStateReady();
  return instance.currentUser ? instance.currentUser.getIdToken() : null;
}
