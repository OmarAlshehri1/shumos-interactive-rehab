const DATE_FORMATTER = new Intl.DateTimeFormat("ar", { day: "numeric", month: "short", year: "numeric" });

export function formatPatientUpdatedAt(timestamp: number): string {
  return DATE_FORMATTER.format(new Date(timestamp));
}

export function formatPatientCreatedAt(timestamp: number): string {
  return DATE_FORMATTER.format(new Date(timestamp));
}
