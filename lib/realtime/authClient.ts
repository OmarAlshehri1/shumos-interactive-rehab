import { type Auth, type User, connectAuthEmulator, getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { getDisplayFirebaseApp, getEmulatorConfig } from "./firebaseClient";
import { installBenignAuthRejectionFilter, isKnownBenignFirebaseAuthRejection } from "./benignAuthRejections";

installBenignAuthRejectionFilter();

/**
 * TASK 8: centralized Firebase Auth bootstrap for /display ONLY — the ONE
 * file that establishes /display's anonymous identity. No component ever
 * calls signInAnonymously() itself; lib/display/useRealtimeDisplaySession.ts
 * goes through lib/realtime/useFirebaseAuth.ts, which wraps
 * subscribeToAuthState below. /control's staff identity is entirely
 * separate — see staffAuthClient.ts — and, as of the AUTH ISOLATION
 * HARDENING task, the two no longer even share a Firebase app instance
 * (see firebaseClient.ts's getDisplayFirebaseApp() doc comment for why that
 * used to matter: they previously shared one Auth object, so a same-tab
 * /control -> /display navigation could leave /display authenticated as
 * the signed-in staff member instead of anonymous).
 *
 * There is deliberately no login page, no email/password, no account UI —
 * a session is established silently the moment /display loads. Anonymous
 * Authentication proves this client has a Firebase-issued identity; it does
 * NOT prove "this is an authorized Shumos Care therapist" — see the Task 8
 * report's security-limitation section.
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
    auth = getAuth(getDisplayFirebaseApp());
  }
  const emulator = getEmulatorConfig();
  if (emulator && !authEmulatorConnected) {
    authEmulatorConnected = true;
    connectAuthEmulator(auth, `http://${emulator.host}:${emulator.authPort}`, { disableWarnings: true });
  }
  return auth;
}

let signInPromise: Promise<User> | null = null;

/** A handful of quick retries, not an indefinite loop — this error is a one-tab-visibility-transition hiccup, not a real outage; if it's still happening after this many attempts something else is wrong and the caller should see the real failure. */
const BENIGN_REJECTION_MAX_ATTEMPTS = 4;
const BENIGN_REJECTION_RETRY_DELAY_MS = 400;

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

/**
 * ROOT CAUSE of /display's presence never registering after a "Database is
 * closing/hidden" hiccup (see benignAuthRejections.ts for the full
 * mechanism): that error can strike signInAnonymously() ITSELF, not just
 * an unrelated background timer. Before this fix, that single transient
 * rejection permanently left ensureSignedIn()'s promise rejected — nothing
 * ever called signInAnonymously() again (onAuthStateChanged only fires on
 * an actual auth state transition, which never happens for a sign-in that
 * never succeeded), so subscribeToAuthState's listener stayed on "failed"
 * forever, useRealtimeDisplaySession never reached the auth-gated
 * registerDisplayPresence() call, and /control never saw the display come
 * online — despite the page having loaded fine (HTTP 200) and the physical
 * projector being on. This retries ONLY this precisely-identified,
 * known-transient error class; any other sign-in failure (offline, wrong
 * project config, etc.) still fails immediately and reports "failed", same
 * as before.
 */
async function signInAnonymouslyWithBenignRetry(authInstance: Auth, attempt = 1): Promise<User> {
  try {
    const credential = await signInAnonymously(authInstance);
    return credential.user;
  } catch (error) {
    if (isKnownBenignFirebaseAuthRejection(error) && attempt < BENIGN_REJECTION_MAX_ATTEMPTS) {
      console.warn(`[authClient] Anonymous sign-in hit the known-benign "Database is closing/hidden" hiccup — retrying (attempt ${attempt + 1}/${BENIGN_REJECTION_MAX_ATTEMPTS})`, error);
      await delay(BENIGN_REJECTION_RETRY_DELAY_MS * attempt);
      return signInAnonymouslyWithBenignRetry(authInstance, attempt + 1);
    }
    throw error;
  }
}

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
    signInPromise = signInAnonymouslyWithBenignRetry(authInstance).catch((error: unknown) => {
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
