import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mocks firebase/auth entirely — no real network, no emulator required.
 * Mirrors authClient.test.ts's structure, but for the STAFF (email +
 * password) flow — see staffAuthClient.ts's own doc comment for why this
 * is a deliberately separate file/flow from the anonymous one.
 */

const approval = vi.hoisted(() => ({ resume: vi.fn(), revoke: vi.fn(async () => {}) }));
vi.mock("../displayAuthorization", () => ({ resumeDisplayApprovals: approval.resume, revokeDisplaysForStaff: approval.revoke }));

type AuthUser = { uid: string; email: string | null };
type StateCallback = (user: AuthUser | null) => void;
type ErrorCallback = (error: unknown) => void;

/* eslint-disable @typescript-eslint/no-unused-vars -- mock signatures intentionally mirror the real APIs' arity */
const getAuthMock = vi.fn((..._args: unknown[]) => ({ __fakeAuth: true }));
const onAuthStateChangedMock = vi.fn((_auth: unknown, _next: StateCallback, _error?: ErrorCallback) => vi.fn());
const connectAuthEmulatorMock = vi.fn((..._args: unknown[]) => {});
const setPersistenceMock = vi.fn((..._args: unknown[]) => Promise.resolve());
const signInWithEmailAndPasswordMock = vi.fn((..._args: unknown[]): Promise<{ user: AuthUser }> => new Promise(() => {}));
const signOutMock = vi.fn((..._args: unknown[]) => Promise.resolve());
/* eslint-enable @typescript-eslint/no-unused-vars */

vi.mock("firebase/auth", () => ({
  getAuth: (...args: unknown[]) => getAuthMock(...args),
  initializeAuth: (...args: unknown[]) => getAuthMock(...args),
  onAuthStateChanged: (auth: unknown, next: StateCallback, error?: ErrorCallback) => onAuthStateChangedMock(auth, next, error),
  connectAuthEmulator: (...args: unknown[]) => connectAuthEmulatorMock(...args),
  setPersistence: (...args: unknown[]) => setPersistenceMock(...args),
  browserLocalPersistence: "LOCAL",
  signInWithEmailAndPassword: (...args: unknown[]) => signInWithEmailAndPasswordMock(...args),
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

vi.mock("../firebaseClient", () => ({
  getStaffFirebaseApp: () => ({ __fakeApp: true }),
  getEmulatorConfig: () => null,
}));

describe("staffAuthClient", () => {
  beforeEach(() => {
    vi.resetModules();
    getAuthMock.mockClear();
    onAuthStateChangedMock.mockClear();
    connectAuthEmulatorMock.mockClear();
    setPersistenceMock.mockClear().mockResolvedValue(undefined);
    signInWithEmailAndPasswordMock.mockClear();
    signOutMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("always reports 'initializing' first, synchronously", async () => {
    onAuthStateChangedMock.mockImplementation(() => vi.fn());
    const { subscribeToStaffAuthState } = await import("../staffAuthClient");

    const states: string[] = [];
    subscribeToStaffAuthState((state) => states.push(state.status));

    expect(states[0]).toBe("initializing");
    expect(getAuthMock).toHaveBeenCalledWith({ __fakeApp: true }, { persistence: "LOCAL" });
  });

  it("reports 'authenticated' with uid + email once a user is present", async () => {
    let stateCallback!: StateCallback;
    onAuthStateChangedMock.mockImplementation((_auth: unknown, next: StateCallback) => {
      stateCallback = next;
      return vi.fn();
    });
    const { subscribeToStaffAuthState } = await import("../staffAuthClient");

    const states: { status: string; uid: string | null; email: string | null }[] = [];
    subscribeToStaffAuthState((state) => states.push(state));
    stateCallback({ uid: "staff-1", email: "therapist@shumos.care" });

    expect(states.at(-1)).toEqual({ status: "authenticated", uid: "staff-1", email: "therapist@shumos.care", displayName: null });
  });

  it("reports 'unauthenticated' (never auto-signs-in) when no user is present — unlike the anonymous flow", async () => {
    let stateCallback!: StateCallback;
    onAuthStateChangedMock.mockImplementation((_auth: unknown, next: StateCallback) => {
      stateCallback = next;
      return vi.fn();
    });
    const { subscribeToStaffAuthState } = await import("../staffAuthClient");

    const states: string[] = [];
    subscribeToStaffAuthState((state) => states.push(state.status));
    stateCallback(null);

    expect(states.at(-1)).toBe("unauthenticated");
    expect(signInWithEmailAndPasswordMock).not.toHaveBeenCalled();
  });

  it("reports 'failed' when onAuthStateChanged itself reports an error", async () => {
    let errorCallback!: ErrorCallback;
    onAuthStateChangedMock.mockImplementation((_auth: unknown, _next: StateCallback, errorCb?: ErrorCallback) => {
      errorCallback = errorCb!;
      return vi.fn();
    });
    const { subscribeToStaffAuthState } = await import("../staffAuthClient");

    const states: string[] = [];
    subscribeToStaffAuthState((state) => states.push(state.status));
    errorCallback(new Error("boom"));

    expect(states.at(-1)).toBe("failed");
  });

  it("signInStaff() sets persistence before attempting sign-in", async () => {
    signInWithEmailAndPasswordMock.mockResolvedValue({ user: { uid: "staff-1", email: "a@b.com" } });
    const { signInStaff } = await import("../staffAuthClient");

    await signInStaff("a@b.com", "correct-password");

    expect(setPersistenceMock).toHaveBeenCalled();
    expect(signInWithEmailAndPasswordMock).toHaveBeenCalledWith(expect.anything(), "a@b.com", "correct-password");
  });

  it.each([
    ["auth/wrong-password", "invalid-credentials"],
    ["auth/user-not-found", "invalid-credentials"],
    ["auth/invalid-credential", "invalid-credentials"],
    ["auth/invalid-email", "invalid-credentials"],
    ["auth/network-request-failed", "network"],
    ["auth/too-many-requests", "unknown"],
  ])("signInStaff() maps Firebase code %s to %s — never the raw code", async (code, expected) => {
    signInWithEmailAndPasswordMock.mockRejectedValue({ code });
    const { signInStaff } = await import("../staffAuthClient");

    await expect(signInStaff("a@b.com", "wrong")).rejects.toBe(expected);
  });

  it("signOutStaff() calls Firebase signOut()", async () => {
    const { signOutStaff } = await import("../staffAuthClient");
    await signOutStaff();
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });
});
