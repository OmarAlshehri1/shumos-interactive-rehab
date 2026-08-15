import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* eslint-disable @typescript-eslint/no-unused-vars -- mock signatures intentionally mirror the real APIs' arity for type-safe spreading below */
const refMock = vi.fn((_db: unknown, path?: string) => ({ __path: path ?? "" }));
const pushMock = vi.fn((_ref: unknown) => ({ key: "new-patient-id" }));
const updateMock = vi.fn((..._args: unknown[]): Promise<void> => Promise.resolve());
const getMock = vi.fn((..._args: unknown[]): Promise<{ val: () => unknown; exists: () => boolean }> =>
  Promise.resolve({ val: () => null, exists: () => false }),
);
const onValueMock = vi.fn((..._args: unknown[]) => () => {});
/* eslint-enable @typescript-eslint/no-unused-vars */

vi.mock("firebase/database", () => ({
  ref: (db: unknown, path?: string) => refMock(db, path),
  push: (r: unknown) => pushMock(r),
  update: (...args: unknown[]) => updateMock(...args),
  get: (...args: unknown[]) => getMock(...args),
  onValue: (...args: unknown[]) => onValueMock(...args),
}));

vi.mock("@/lib/realtime/firebaseClient", () => ({
  getStaffDb: () => ({ __fakeDb: true }),
}));

describe("normalizePatientNumber", () => {
  it("trims whitespace and collapses internal spaces", async () => {
    const { normalizePatientNumber } = await import("../patientRepository");
    expect(normalizePatientNumber("  10 24  ")).toBe("1024");
  });

  it("folds Arabic-Indic and Persian digits to ASCII, so both spellings collide as the same clinic number", async () => {
    const { normalizePatientNumber } = await import("../patientRepository");
    expect(normalizePatientNumber("١٠٢٤")).toBe("1024");
    expect(normalizePatientNumber("۱۰۲۴")).toBe("1024");
  });
});

describe("patientRepository.createPatient", () => {
  beforeEach(() => {
    vi.resetModules();
    refMock.mockClear();
    pushMock.mockClear();
    updateMock.mockClear();
    getMock.mockClear();
    onValueMock.mockClear();
    getMock.mockResolvedValue({ val: () => null, exists: () => false });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an empty first name before ever touching Firebase", async () => {
    const { createPatient } = await import("../patientRepository");
    await expect(createPatient({ firstName: "   ", patientNumber: "1024", createdByUid: "staff-1" })).rejects.toMatchObject({
      code: "invalid-name",
    });
    expect(getMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects a patient number containing unsafe characters before ever touching Firebase", async () => {
    const { createPatient } = await import("../patientRepository");
    await expect(createPatient({ firstName: "محمد", patientNumber: "10/24", createdByUid: "staff-1" })).rejects.toMatchObject({
      code: "invalid-number",
    });
    expect(getMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("claims patientNumbers/{normalized} and writes the patient record in a single atomic update, and returns both patientId and normalized number", async () => {
    const { createPatient } = await import("../patientRepository");

    const patient = await createPatient({ firstName: "  محمد  ", patientNumber: " 1024 ", createdByUid: "staff-1" });

    expect(refMock).toHaveBeenCalledWith(expect.anything(), "patientNumbers/1024");
    expect(patient).toMatchObject({ patientId: "new-patient-id", patientNumber: "1024", firstName: "محمد", active: true, createdByUid: "staff-1" });
    // RELIABILITY FIX regression: both writes happen in ONE update() call — never as two separate round trips that could land only one of them.
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith(expect.anything(), {
      "patientNumbers/1024": "new-patient-id",
      "patients/new-patient-id": expect.objectContaining({ patientNumber: "1024" }),
    });
  });

  it("throws duplicate-number via the fast-path existence check without attempting a write", async () => {
    getMock.mockResolvedValueOnce({ val: () => "some-existing-id", exists: () => true });
    const { createPatient } = await import("../patientRepository");

    await expect(createPatient({ firstName: "محمد", patientNumber: "1024", createdByUid: "staff-1" })).rejects.toMatchObject({
      code: "duplicate-number",
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("throws duplicate-number (never creating an orphaned patient record) when the atomic update is rejected — a genuine race lost between the fast-path check and the write", async () => {
    const permissionDenied = Object.assign(new Error("PERMISSION_DENIED"), { code: "PERMISSION_DENIED" });
    updateMock.mockRejectedValueOnce(permissionDenied);
    const { createPatient } = await import("../patientRepository");

    await expect(createPatient({ firstName: "محمد", patientNumber: "1024", createdByUid: "staff-1" })).rejects.toMatchObject({
      code: "duplicate-number",
    });
    // The rejected update() was atomic — nothing was written, so there is no separate rollback/cleanup call to make.
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});

describe("patientRepository.updatePatientFirstName", () => {
  beforeEach(() => {
    vi.resetModules();
    updateMock.mockClear();
  });

  it("rejects an empty name and never calls update", async () => {
    const { updatePatientFirstName } = await import("../patientRepository");
    await expect(updatePatientFirstName("patient-1", "   ")).rejects.toMatchObject({ code: "invalid-name" });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("trims the name and only patches firstName/updatedAt", async () => {
    const { updatePatientFirstName } = await import("../patientRepository");
    await updatePatientFirstName("patient-1", "  محمد  ");
    expect(updateMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ firstName: "محمد" }));
  });
});
