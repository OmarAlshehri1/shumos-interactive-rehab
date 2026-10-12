import { DISPLAY_TIMEOUT_MS, type DisplayState, type Identity, type Message } from "./protocol";

export type Accept = "accepted" | "stale" | "duplicate" | "foreign" | "needs-sync" | "ignored";
/** Longest the replica extrapolates the clock without hearing from Control. */
export const MAX_EXTRAPOLATION_MS = 800;

type Tuple = readonly [number, number, number, number];
const cmp = (a: Tuple, b: Tuple): number => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
};

/**
 * The Display's view of the authoritative session. Rejects stale owners,
 * stale sessions, old runs and out-of-order revisions (ordering is the tuple
 * [ownerStartedAt, sessionEpoch, runId, revision]) and derives the current
 * simulation time by extrapolating the last authoritative clock sample.
 */
export class DisplayReplica {
  identity: Identity | null = null;
  state: DisplayState | null = null;
  revision = -1;
  needsSync = false;
  private clockSimMs = 0;
  private clockReceivedAt = 0;
  private running = false;
  private lastClockSeq = -1;
  private lastHeardAt = -Infinity;

  private tuple(id: Identity, revision: number): Tuple {
    return [id.ownerStartedAt, id.sessionEpoch, id.runId, revision];
  }

  accept(m: Message, nowMs: number): Accept {
    switch (m.type) {
      case "state":
      case "sync": {
        const incoming = this.tuple(m, m.revision);
        if (this.identity) {
          const current = this.tuple(this.identity, this.revision);
          // A different owner is only accepted if it started later (e.g. Control was reloaded).
          const c = cmp(incoming, current);
          if (c < 0) return "stale";
          if (c === 0 && m.type === "state") return "duplicate";
        }
        if (!this.identity || this.identity.ownerId !== m.ownerId || this.identity.ownerStartedAt !== m.ownerStartedAt) this.lastClockSeq = -1; // a restarted owner restarts its clock sequence
        this.identity = { ownerId: m.ownerId, ownerStartedAt: m.ownerStartedAt, sessionId: m.sessionId, sessionEpoch: m.sessionEpoch, runId: m.runId };
        this.state = m.state;
        this.revision = m.revision;
        this.needsSync = false;
        this.setClock(m.state.simTimeMs, m.state.running, nowMs);
        this.lastHeardAt = nowMs;
        return "accepted";
      }
      case "clock": {
        if (!this.identity || m.ownerId !== this.identity.ownerId) return "foreign";
        if (m.ownerStartedAt !== this.identity.ownerStartedAt || m.sessionEpoch !== this.identity.sessionEpoch || m.runId !== this.identity.runId) {
          const newer = cmp(this.tuple(m, m.revision), this.tuple(this.identity, this.revision)) > 0;
          if (newer) this.needsSync = true;
          return newer ? "needs-sync" : "stale";
        }
        if (m.revision < this.revision) return "stale";
        if (m.revision > this.revision) {
          this.needsSync = true; // a state message was lost; ask for a fresh sync
          return "needs-sync";
        }
        if (m.seq <= this.lastClockSeq) return "duplicate";
        this.lastClockSeq = m.seq;
        this.setClock(m.simTimeMs, m.running, nowMs);
        this.lastHeardAt = nowMs;
        return "accepted";
      }
      case "closed": {
        if (!this.identity || m.ownerId !== this.identity.ownerId) return "foreign";
        this.clear();
        return "accepted";
      }
      default:
        return "ignored";
    }
  }

  private setClock(simMs: number, running: boolean, nowMs: number): void {
    this.clockSimMs = simMs;
    this.running = running;
    this.clockReceivedAt = nowMs;
  }

  /** Current simulation time. Frozen when paused/held; bounded extrapolation when Control goes silent. */
  simTime(nowMs: number): number {
    if (!this.running) return this.clockSimMs;
    return this.clockSimMs + Math.min(Math.max(0, nowMs - this.clockReceivedAt), MAX_EXTRAPOLATION_MS);
  }

  /** Control has not been heard from recently. */
  isSilent(nowMs: number): boolean {
    return this.identity !== null && nowMs - this.lastHeardAt > DISPLAY_TIMEOUT_MS;
  }

  clear(): void {
    this.identity = null;
    this.state = null;
    this.revision = -1;
    this.running = false;
    this.lastClockSeq = -1;
  }
}
