import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mocks firebase/auth entirely — no real network, no emulator required —
 * to verify the auth bootstrap dedups sign-in attempts and reports the
 * right states. Real Auth-emulator + real-project behavior is covered
 * separately by the Task 8 report's manual verification.
 */

type AuthUser = { uid: string };
type StateCallback = (user: AuthUser | null) => void;
type ErrorCallback = (error: unknown) => void;

/* eslint-disable @typescript-eslint/no-unused-vars -- mock signatures intentionally mirror the real APIs' arity for type-safe spreading below */
const getAuthMock = vi.fn((..._args: unknown[]) => ({ __fakeAuth: true }));
const signInAnonymouslyMock = vi.fn((..._args: unknown[]): Promise<{ user: AuthUser }> => new Promise(() => {}));
const onAuthStateChangedMock = vi.fn((_auth: unknown, _next: StateCallback, _error?: ErrorCallback) => vi.fn());
const connectAuthEmulatorMock = vi.fn((..._args: unknown[]) => {});
/* eslint-enable @typescript-eslint/no-unused-vars */

vi.mock("firebase/auth", () => ({
  getAuth: (...args: unknown[]) => getAuthMock(...args),
  signInAnonymously: (...args: unknown[]) => signInAnonymouslyMock(...args),
  onAuthStateChanged: (auth: unknown, next: StateCallback, error?: ErrorCallback) => onAuthStateChangedMock(auth, next, error),
  connectAuthEmulator: (...args: unknown[]) => connectAuthEmulatorMock(...args),
}));

vi.mock("../firebaseClient", () => ({
  getDisplayFirebaseApp: () => ({ __fakeApp: true }),
  getEmulatorConfig: () => null,
}));

describe("authClient", () => {
  beforeEach(() => {
    vi.resetModules();
    getAuthMock.mockClear();
    signInAnonymouslyMock.mockClear();
    onAuthStateChangedMock.mockClear();
    connectAuthEmulatorMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("always reports 'initializing' first, synchronously", async () => {
    onAuthStateChangedMock.mockImplementation(() => vi.fn());
    const { subscribeToAuthState } = await import("../authClient");

    const states: string[] = [];
    subscribeToAuthState((state) => states.push(state.status));

    expect(states[0]).toBe("initializing");
  });

  it("reports 'authenticated' with the uid once a user is present", async () => {
    let stateCallback!: StateCallback;
    onAuthStateChangedMock.mockImplementation((_auth: unknown, next: StateCallback) => {
      stateCallback = next;
      return vi.fn();
    });
    const { subscribeToAuthState } = await import("../authClient");

    const states: { status: string; uid: string | null }[] = [];
    subscribeToAuthState((state) => states.push(state));
    stateCallback({ uid: "abc123" });

    expect(states.at(-1)).toEqual({ status: "authenticated", uid: "abc123" });
  });

  it("triggers exactly one signInAnonymously() call even when subscribed to twice in a row (React StrictMode double-invocation)", async () => {
    let stateCallback!: StateCallback;
    onAuthStateChangedMock.mockImplementation((_auth: unknown, next: StateCallback) => {
      stateCallback = next;
      return vi.fn();
    });
    signInAnonymouslyMock.mockReturnValue(new Promise(() => {})); // never resolves — we only care about call count here

    const { subscribeToAuthState } = await import("../authClient");

    // First subscriber: no persisted user yet.
    subscribeToAuthState(() => {});
    stateCallback(null);

    // StrictMode-style second subscriber, same tick, also no persisted user.
    subscribeToAuthState(() => {});
    stateCallback(null);

    expect(signInAnonymouslyMock).toHaveBeenCalledTimes(1);
  });

  it("reports 'failed' if signInAnonymously() rejects", async () => {
    let stateCallback!: StateCallback;
    onAuthStateChangedMock.mockImplementation((_auth: unknown, next: StateCallback) => {
      stateCallback = next;
      return vi.fn();
    });
    signInAnonymouslyMock.mockRejectedValue(new Error("network error"));

    const { subscribeToAuthState } = await import("../authClient");
    const states: string[] = [];
    subscribeToAuthState((state) => states.push(state.status));
    stateCallback(null);

    // Let the rejected promise's .catch() chain run.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(states.at(-1)).toBe("failed");
  });

  it("retries and recovers when signInAnonymously() hits the known-benign 'Database is closing/hidden' Firebase Auth persistence hiccup, instead of permanently reporting 'failed'", async () => {
    vi.useFakeTimers();
    try {
      let stateCallback!: StateCallback;
      onAuthStateChangedMock.mockImplementation((_auth: unknown, next: StateCallback) => {
        stateCallback = next;
        return vi.fn();
      });
      signInAnonymouslyMock
        .mockRejectedValueOnce(new Error("Database is closing/hidden"))
        .mockRejectedValueOnce(new Error("Database is closing/hidden"))
        .mockResolvedValueOnce({ user: { uid: "recovered-uid" } });

      const { subscribeToAuthState } = await import("../authClient");
      const states: { status: string; uid: string | null }[] = [];
      subscribeToAuthState((state) => states.push(state));
      stateCallback(null);

      // Drain the retry backoff (400ms, 800ms) plus microtask flushes between each attempt.
      for (let i = 0; i < 10; i += 1) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      // The real fix path: signInAnonymously() eventually resolves, so onAuthStateChanged fires again
      // with the recovered user (simulated here directly, matching how the real SDK would behave).
      stateCallback({ uid: "recovered-uid" });

      expect(signInAnonymouslyMock).toHaveBeenCalledTimes(3);
      expect(states.some((state) => state.status === "failed")).toBe(false);
      expect(states.at(-1)).toEqual({ status: "authenticated", uid: "recovered-uid" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("still reports 'failed' immediately for a genuinely different sign-in error, without retrying", async () => {
    let stateCallback!: StateCallback;
    onAuthStateChangedMock.mockImplementation((_auth: unknown, next: StateCallback) => {
      stateCallback = next;
      return vi.fn();
    });
    signInAnonymouslyMock.mockRejectedValue(new Error("auth/network-request-failed"));

    const { subscribeToAuthState } = await import("../authClient");
    const states: string[] = [];
    subscribeToAuthState((state) => states.push(state.status));
    stateCallback(null);

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(signInAnonymouslyMock).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toBe("failed");
  });

  it("reports 'failed' when onAuthStateChanged itself reports an error", async () => {
    let errorCallback!: ErrorCallback;
    onAuthStateChangedMock.mockImplementation((_auth: unknown, _next: StateCallback, errorCb?: ErrorCallback) => {
      errorCallback = errorCb!;
      return vi.fn();
    });

    const { subscribeToAuthState } = await import("../authClient");
    const states: string[] = [];
    subscribeToAuthState((state) => states.push(state.status));
    errorCallback(new Error("boom"));

    expect(states.at(-1)).toBe("failed");
  });
});
