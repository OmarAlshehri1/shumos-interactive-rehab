import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* eslint-disable @typescript-eslint/no-unused-vars -- mock signatures intentionally mirror the real APIs' arity for type-safe spreading below */
const refMock = vi.fn((_db: unknown, path?: string) => ({ __path: path ?? "" }));
const getMock = vi.fn((..._args: unknown[]): Promise<{ val: () => unknown }> => Promise.resolve({ val: () => null }));
/* eslint-enable @typescript-eslint/no-unused-vars */

vi.mock("firebase/database", () => ({
  ref: (db: unknown, path?: string) => refMock(db, path),
  get: (...args: unknown[]) => getMock(...args),
}));

vi.mock("../firebaseClient", () => ({
  getStaffDb: () => ({ __fakeDb: true }),
}));

describe("staffRepository", () => {
  beforeEach(() => {
    vi.resetModules();
    refMock.mockClear();
    getMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("isActiveStaff() reads staff/{uid}/active, never a broader path", async () => {
    getMock.mockResolvedValueOnce({ val: () => true });
    const { isActiveStaff } = await import("../staffRepository");

    const result = await isActiveStaff("staff-1");

    expect(refMock).toHaveBeenCalledWith(expect.anything(), "staff/staff-1/active");
    expect(result).toBe(true);
  });

  it("isActiveStaff() returns false for an explicit active:false record", async () => {
    getMock.mockResolvedValueOnce({ val: () => false });
    const { isActiveStaff } = await import("../staffRepository");
    expect(await isActiveStaff("staff-1")).toBe(false);
  });

  it("isActiveStaff() returns false (fails closed) when no staff record exists at all", async () => {
    getMock.mockResolvedValueOnce({ val: () => null });
    const { isActiveStaff } = await import("../staffRepository");
    expect(await isActiveStaff("random-uid")).toBe(false);
  });
});
