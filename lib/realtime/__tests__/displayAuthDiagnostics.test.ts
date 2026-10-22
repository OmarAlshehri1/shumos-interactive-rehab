import { afterEach, expect, it, vi } from "vitest";
import { logDisplayAuthFailure } from "../displayAuthDiagnostics";
afterEach(() => vi.restoreAllMocks());
it("logs only the failing phase and bounded Firebase code, never raw credential-bearing errors", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  logDisplayAuthFailure("approval-write", { code: "PERMISSION_DENIED", message: "sensitive-token-and-patient-value", uid: "private-uid" });
  expect(warn).toHaveBeenLastCalledWith("[display-auth] failed", { phase: "approval-write", code: "PERMISSION_DENIED" });
  for (const code of ["token.with.dots", "x".repeat(100), { token: "secret" }]) {
    logDisplayAuthFailure("identity", { code });
    expect(warn).toHaveBeenLastCalledWith("[display-auth] failed", { phase: "identity", code: "unknown" });
  }
});
