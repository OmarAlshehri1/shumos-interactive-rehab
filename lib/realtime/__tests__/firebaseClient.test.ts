import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AUTH ISOLATION HARDENING — regression coverage for the root fix: /control
 * (staff) and /display (anonymous) must never share a Firebase app/Auth/
 * Database instance, even though both read the exact same env-var config.
 * Mocks firebase/app and firebase/database entirely so this can assert on
 * WHICH named app each surface's getters request, without a real project.
 */

/* eslint-disable @typescript-eslint/no-unused-vars -- mock signatures intentionally mirror the real APIs' arity for type-safe spreading below */
const initializeAppMock = vi.fn((config: unknown, name?: string) => ({ __fakeApp: true, name: name ?? "[DEFAULT]", config }));
const getAppsMock = vi.fn((): { name: string }[] => []);
const getDatabaseMock = vi.fn((app: unknown) => ({ __fakeDb: true, app }));
const connectDatabaseEmulatorMock = vi.fn((..._args: unknown[]) => {});
/* eslint-enable @typescript-eslint/no-unused-vars */

vi.mock("firebase/app", () => ({
  initializeApp: (config: unknown, name?: string) => initializeAppMock(config, name),
  getApps: () => getAppsMock(),
}));

vi.mock("firebase/database", () => ({
  getDatabase: (app: unknown) => getDatabaseMock(app),
  connectDatabaseEmulator: (...args: unknown[]) => connectDatabaseEmulatorMock(...args),
}));

const REQUIRED_ENV = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "example.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_DATABASE_URL: "https://example.firebaseio.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "example",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "example.appspot.com",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "123",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:123:web:abc",
};

describe("firebaseClient — auth isolation", () => {
  beforeEach(() => {
    vi.resetModules();
    initializeAppMock.mockClear();
    getAppsMock.mockClear();
    getAppsMock.mockReturnValue([]);
    getDatabaseMock.mockClear();
    connectDatabaseEmulatorMock.mockClear();
    for (const [key, value] of Object.entries(REQUIRED_ENV)) vi.stubEnv(key, value);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("getStaffFirebaseApp() and getDisplayFirebaseApp() initialize two DIFFERENT named apps, never the shared default one", async () => {
    const { getStaffFirebaseApp, getDisplayFirebaseApp } = await import("../firebaseClient");

    const staffApp = getStaffFirebaseApp();
    const displayApp = getDisplayFirebaseApp();

    expect(staffApp.name).not.toBe(displayApp.name);
    expect(initializeAppMock).toHaveBeenCalledWith(expect.anything(), staffApp.name);
    expect(initializeAppMock).toHaveBeenCalledWith(expect.anything(), displayApp.name);
    // Neither call ever requests the SDK's unnamed default app — that's the
    // exact root cause this fixes (see the doc comment on getStaffFirebaseApp).
    expect(initializeAppMock).not.toHaveBeenCalledWith(expect.anything(), undefined);
  });

  it("repeated calls to the same surface's getter return the cached SAME app instance, not a fresh one each time", async () => {
    const { getStaffFirebaseApp } = await import("../firebaseClient");

    const first = getStaffFirebaseApp();
    const second = getStaffFirebaseApp();

    expect(first).toBe(second);
    expect(initializeAppMock).toHaveBeenCalledTimes(1);
  });

  it("getStaffDb() and getDisplayDb() request Database instances tied to their own surface's app, never the other's", async () => {
    const { getStaffDb, getDisplayDb, getStaffFirebaseApp, getDisplayFirebaseApp } = await import("../firebaseClient");

    getStaffDb();
    getDisplayDb();

    const staffApp = getStaffFirebaseApp();
    const displayApp = getDisplayFirebaseApp();
    expect(getDatabaseMock).toHaveBeenCalledWith(staffApp);
    expect(getDatabaseMock).toHaveBeenCalledWith(displayApp);
    expect(staffApp).not.toBe(displayApp);
  });
});
