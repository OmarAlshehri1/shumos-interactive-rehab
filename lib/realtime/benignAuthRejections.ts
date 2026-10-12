/**
 * Shared by BOTH auth bootstrap files (authClient.ts for /display's
 * anonymous identity, staffAuthClient.ts for /control's staff identity) —
 * see installBenignAuthRejectionFilter's doc comment for the root cause.
 * Extracted from staffAuthClient.ts (where this was first diagnosed) so
 * /display gets the exact same protection instead of only /control having
 * it — before this fix, /display's own anonymous Auth instance hit the
 * identical @firebase/auth internal error with NOTHING installed to catch
 * it, since staffAuthClient.ts (the only file that used to install this
 * listener) is never imported by /display.
 */

/**
 * RELIABILITY FIX — "Database is closing/hidden" unhandled rejections
 * observed during real device testing. Root-caused by reading
 * @firebase/auth's own bundled source (node_modules/@firebase/auth/dist/esm/index-*.js,
 * class `IndexedDBLocalPersistence`): Firebase Auth's default browser
 * persistence (indexedDBLocalPersistence, used automatically even when no
 * app code calls setPersistence() explicitly — see authClient.ts) runs its
 * OWN background cross-tab-sync polling and token-refresh persistence on
 * internal `setInterval`/`setTimeout` timers no app code calls directly.
 * When a tab's `document.visibilityState` goes "hidden" (an iPad screen
 * lock, an app switch, or simply a /display browser window opened on a
 * second monitor without ever receiving focus — exactly the projector/
 * kiosk setup this app targets) while one of those internal timers has an
 * IndexedDB operation in flight, its `_openDb()` guard throws
 * `Error("Database is closing/hidden")` — an expected internal state
 * transition on Firebase's side (the tab going background), not a failure
 * of anything this app published or read.
 *
 * There is no first-party call site in this codebase to attach a `.catch()`
 * to — it originates entirely from @firebase/auth's own scheduled
 * persistence machinery — so this is the one narrow, PRECISELY
 * message-matched exception to "never swallow unhandledrejection globally":
 * every OTHER unhandled rejection (including any future genuine bug) is
 * left completely untouched and still surfaces normally. Still logged
 * (visibly, via console.warn), never silently dropped.
 *
 * IMPORTANT: this only mutes the CONSOLE NOISE from unrelated background
 * timers. It does NOT, on its own, fix the case where this exact error
 * strikes the actual signInAnonymously()/signInWithEmailAndPassword() call
 * itself — that path needs its own retry, since a rejected sign-in
 * otherwise leaves the caller permanently in a "failed" state with no
 * automatic recovery. See authClient.ts's ensureSignedIn() for that half
 * of the fix (the root cause of the real bug: /display's presence never
 * registering after this transient hiccup, not just a noisy console).
 */
const KNOWN_BENIGN_UNHANDLED_REJECTION_MESSAGES = new Set(["Database is closing/hidden"]);

/** Message text this same known-benign Firebase Auth persistence quirk throws — exported so ensureSignedIn()'s retry can recognize it precisely, without re-declaring the string. */
export function isKnownBenignFirebaseAuthRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return KNOWN_BENIGN_UNHANDLED_REJECTION_MESSAGES.has(message);
}

let installed = false;

/** Idempotent — safe to call from every auth bootstrap file that needs it; installs the listener once per page regardless of how many times this is called. */
export function installBenignAuthRejectionFilter(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("unhandledrejection", (event) => {
    if (!isKnownBenignFirebaseAuthRejection(event.reason)) return;
    event.preventDefault();
    console.warn("[firebaseAuth] Suppressed known-benign Firebase Auth persistence rejection (tab was hidden):", event.reason);
  });
}
