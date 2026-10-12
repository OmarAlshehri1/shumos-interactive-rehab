/**
 * Generic coalescing publisher for the shared `/liveSession` record.
 *
 * One Firebase write in flight at a time, the latest pending session block wins, nothing is written until
 * enabled, a failed write re-bases on the stored revision and retries with a back-off, and every write is
 * stamped with the ownership facts of lib/liveGame/ownership.ts (window id, heartbeat, hand-over marker).
 * The caller supplies the game's own session block; this class knows nothing about any game.
 */
import type { LiveControlMeta } from "./ownership";

const RETRY_MS = 1000;

/** What the publisher stamps on every write; the game spreads it into its block. */
export type PublishStamp = Pick<LiveControlMeta, "controlTabId" | "heartbeatAt" | "takeoverFrom">;

export interface LiveWriteRequest<B> {
  sessionId: string;
  revision: number;
  session: B;
}

export interface LiveRecordPublisherDeps<B> {
  /** One Firebase write. Rejects on failure (rules, offline, revision conflict). */
  write(w: LiveWriteRequest<B>): Promise<void>;
  /** Highest revision currently stored, used to re-base after a failed write. */
  fetchBaseRevision(): Promise<number>;
  now(): number;
  onError?(e: unknown): void;
}

export class LiveRecordPublisher<B> {
  private make: ((stamp: PublishStamp) => B) | null = null;
  private sessionId = "";
  private enabled = false;
  private tabId: string | undefined;
  private takeoverFrom: string | undefined;
  private revision = 0;
  private inFlight = false;
  private dirty = false;
  private lastWriteAt = -Infinity;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  writes = 0;

  constructor(private readonly deps: LiveRecordPublisherDeps<B>) {}

  setBaseRevision(revision: number): void {
    this.revision = Math.max(this.revision, revision);
  }
  setTabId(id: string): void {
    this.tabId = id;
  }
  /** Marks every following write as a hand-over from another window (that window then stands down). */
  setTakeoverFrom(id: string | null): void {
    this.takeoverFrom = id ?? undefined;
  }
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (enabled) this.markDirty();
  }
  /** Replaces the pending content. `make` runs at write time so the heartbeat stamp is always fresh. */
  publish(sessionId: string, make: (stamp: PublishStamp) => B): void {
    this.sessionId = sessionId;
    this.make = make;
    this.markDirty();
  }
  /** Liveness: rewrites the current record (fresh heartbeat) if nothing was written for `everyMs`. */
  touch(everyMs: number): void {
    if (this.enabled && this.make && this.deps.now() - this.lastWriteAt >= everyMs) this.markDirty();
  }

  private markDirty(): void {
    this.dirty = true;
    void this.flush();
  }

  private async flush(): Promise<void> {
    if (this.disposed || this.inFlight || !this.dirty || !this.enabled || !this.make) return;
    this.inFlight = true;
    this.dirty = false;
    let failed = false;
    const make = this.make;
    const sessionId = this.sessionId;
    const revision = ++this.revision;
    try {
      const now = this.deps.now();
      await this.deps.write({ sessionId, revision, session: make({ controlTabId: this.tabId, heartbeatAt: now, takeoverFrom: this.takeoverFrom }) });
      this.writes++;
      this.lastWriteAt = now;
    } catch (e) {
      this.deps.onError?.(e);
      try {
        this.revision = Math.max(this.revision, await this.deps.fetchBaseRevision());
      } catch {
        /* offline: the next publish retries */
      }
      this.dirty = true;
      failed = true;
    } finally {
      this.inFlight = false;
    }
    if (this.disposed) return;
    if (failed) {
      if (this.retryTimer === null) {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          void this.flush();
        }, RETRY_MS);
      }
      return;
    }
    if (this.dirty) await this.flush();
  }

  dispose(): void {
    this.disposed = true;
    this.enabled = false;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}
