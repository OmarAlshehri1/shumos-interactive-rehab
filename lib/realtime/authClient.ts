import { type Auth, type User, connectAuthEmulator, getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { getEmulatorConfig, getFirebaseApp } from "./firebaseClient";

/**
 * TASK 8: centralized Firebase Auth bootstrap — the ONE file that imports
 * firebase/auth. No component ever calls signInAnonymously() itself; both
 * realtime adapters (lib/control/useRealtimeControllerSession.ts,
 * lib/display/useRealtimeDisplaySession.ts) go through
 * lib/realtime/useFirebaseAuth.ts, which wraps subscribeToAuthState below.
 *
 * There is deliberately no login page, no email/password, no account UI —
 * a session is established silently the moment either route loads.
 * Anonymous Authentication proves this client has a Firebase-issued
 * identity; it does NOT prove "this is an authorized Shumos Care
 * therapist" — see the Task 8 report's security-limitation section.
 */

export type AuthStatus = "initializing" | "authenticated" | "failed";

export interface AuthState {
  status: AuthStatus;
  uid: string | null;
}

let auth: Auth | null = null;
let authEmulatorConnected = false;

function getAuthInstance(): Auth {
  if (!auth) {
    auth = getAuth(getFirebaseApp());
  }
  const emulator = getEmulatorConfig();
  if (emulator && !authEmulatorConnected) {
    authEmulatorConnected = true;
    connectAuthEmulator(auth, `http://${emulator.host}:${emulator.authPort}`, { disableWarnings: true });
  }
  return auth;
}

let signInPromise: Promise<User> | null = null;

/**
 * Ensures exactly one signInAnonymously() network call is ever in flight
 * for this page, no matter how many times this is reached — including
 * React StrictMode's dev-only double-invocation of effects, and multiple
 * components (both /control and /display's adapters, in principle) asking
 * at once. The Firebase SDK persists the resulting session on its own
 * (IndexedDB/localStorage), so on every subsequent load
 * onAuthStateChanged fires with the existing user immediately and this
 * function is never even called again.
 */
function ensureSignedIn(authInstance: Auth): Promise<User> {
  if (!signInPromise) {
    signInPromise = signInAnonymously(authInstance)
      .then((credential) => credential.user)
      .catch((error: unknown) => {
        signInPromise = null; // allow a retry on the next subscriber/mount
        throw error;
      });
  }
  return signInPromise;
}

export type AuthListener = (state: AuthState) => void;

/**
 * Subscribes to this tab's auth state, triggering an anonymous sign-in if
 * there's no persisted session yet. Always fires "initializing" first (the
 * one synchronous, guaranteed callback), then "authenticated" or "failed"
 * once Firebase actually answers — callers must wait for one of those
 * before assuming RTDB is reachable (see useFirebaseAuth.ts).
 */
export function subscribeToAuthState(listener: AuthListener): () => void {
  const authInstance = getAuthInstance();
  listener({ status: "initializing", uid: null });

  const unsubscribe = onAuthStateChanged(
    authInstance,
    (user) => {
      if (user) {
        listener({ status: "authenticated", uid: user.uid });
        return;
      }
      // No persisted session yet — establish one. onAuthStateChanged fires
      // again once signInAnonymously() resolves (with the new user), so the
      // real "authenticated" state is reported from the branch above, not here.
      void ensureSignedIn(authInstance).catch(() => {
        listener({ status: "failed", uid: null });
      });
    },
    () => {
      listener({ status: "failed", uid: null });
    },
  );

  return unsubscribe;
}
