/**
 * History save-once guard shared by every cross-device game. The storage itself is already idempotent
 * (`saveSessionHistoryOnce` refuses to overwrite an existing record); this class stops a Control from
 * even trying twice in one page life, paces retries after a failure, and reports a status the UI can show.
 */
export type HistoryStatus = "not-ended" | "walk-in" | "saving" | "saved" | "retry";

export class HistorySaver {
  private done = new Set<string>();
  private busy = new Set<string>();
  private lastAttempt = new Map<string, number>();
  status: HistoryStatus = "not-ended";
  constructor(private readonly retryMs = 3000) {}

  /**
   * @param key unique per saved record (session id + run)
   * @param patientId null for walk-in sessions (nothing is saved)
   * @param save performs the write; may reject
   * @returns the status after this call
   */
  async save(key: string, patientId: string | null, nowMs: number, save: () => Promise<unknown>): Promise<HistoryStatus> {
    if (this.done.has(key)) return this.status;
    if (!patientId) {
      this.done.add(key);
      return (this.status = "walk-in");
    }
    if (this.busy.has(key)) return this.status;
    const last = this.lastAttempt.get(key);
    if (last !== undefined && nowMs - last < this.retryMs) return this.status;
    this.lastAttempt.set(key, nowMs);
    this.busy.add(key);
    this.status = "saving";
    try {
      await save();
      this.done.add(key);
      this.status = "saved";
    } catch {
      this.status = "retry";
    } finally {
      this.busy.delete(key);
    }
    return this.status;
  }
  isDone(key: string): boolean {
    return this.done.has(key);
  }
}
