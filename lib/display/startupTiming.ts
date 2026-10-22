/** Browser-local startup measurements only: no identities, session data, or network reporting. */
export function markDisplayStartup(phase: string): void {
  if (typeof window === "undefined" || !window.location.pathname.startsWith("/display")) return;
  const name = `display:${phase}`;
  if (performance.getEntriesByName(name, "mark").length === 0) performance.mark(name);
}
