/** Never log credentials, UIDs, database values, or raw Firebase error messages. */
export function logDisplayAuthFailure(
  phase: "identity" | "staff-session" | "server-clock" | "session-owner" | "approval-write" | "approval-read",
  error: unknown,
): void {
  const candidate = (error as { code?: unknown } | null)?.code;
  const code = typeof candidate === "string" && /^[A-Za-z0-9_/-]{1,64}$/.test(candidate) ? candidate : "unknown";
  console.warn("[display-auth] failed", { phase, code });
}
