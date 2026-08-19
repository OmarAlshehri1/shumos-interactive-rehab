const DATE_FORMATTER = new Intl.DateTimeFormat("ar", { day: "numeric", month: "short", year: "numeric" });

export function formatPatientUpdatedAt(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp < 0 || timestamp > Date.now() + 300_000) return "—";
  return DATE_FORMATTER.format(new Date(timestamp));
}

export function formatPatientCreatedAt(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp < 0 || timestamp > Date.now() + 300_000) return "—";
  return DATE_FORMATTER.format(new Date(timestamp));
}
