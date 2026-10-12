import { DISPLAY_TIMEOUT_MS, type DisplayState, type Identity, type Message } from "./protocol";
import { ShadowSim } from "./projection";

export type Accept = "accepted" | "stale" | "duplicate" | "foreign" | "needs-sync" | "ignored";
/** Longest the replica extrapolates distance without hearing from Control. */
export const MAX_EXTRAPOLATION_MS = 700;

type Tuple = readonly [number, number, number, number];
const cmp = (a: Tuple, b: Tuple): number => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; return 0; };

/**
 * The Display's view of the authoritative session. Rejects stale owners/sessions/runs
 * and out-of-order revisions (ordering is [ownerStartedAt, sessionEpoch, runId, revision]),
 * and extrapolates distance from the last authoritative clock sample.
 */
export class DisplayReplica {
  identity: Identity | null = null;
  state: DisplayState | null = null;
  revision = -1;
  needsSync = false;
  private clockDist = 0;
  private clockSpeed = 0;
  private clockAt = 0;
  private running = false;
  private lastClockSeq = -1;
  private lastHeardAt = -Infinity;
  private shadow = new ShadowSim();
  private shadowElapsed = 0;

  /** `maxExtrapolationMs`: how long distance is projected without hearing from Control (a ~1 Hz Firebase clock needs more than the local channel). */
  constructor(private readonly maxExtrapolationMs = MAX_EXTRAPOLATION_MS) {}

  private tuple(id: Identity, revision: number): Tuple { return [id.ownerStartedAt, id.sessionEpoch, id.runId, revision]; }

  accept(m: Message, nowMs: number): Accept {
    switch (m.type) {
      case "state":
      case "sync": {
        const incoming = this.tuple(m, m.revision);
        if (this.identity) {
          const c = cmp(incoming, this.tuple(this.identity, this.revision));
          if (c < 0) return "stale";
          if (c === 0 && m.type === "state") return "duplicate";
        }
        if (!this.identity || this.identity.ownerId !== m.ownerId || this.identity.ownerStartedAt !== m.ownerStartedAt) this.lastClockSeq = -1;
        this.identity = { ownerId: m.ownerId, ownerStartedAt: m.ownerStartedAt, sessionId: m.sessionId, sessionEpoch: m.sessionEpoch, runId: m.runId };
        this.state = m.state;
        this.revision = m.revision;
        this.needsSync = false;
        this.setClock(m.state.distance, m.state.speed, m.state.running, nowMs);
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
        if (m.revision > this.revision) { this.needsSync = true; return "needs-sync"; }
        if (m.seq <= this.lastClockSeq) return "duplicate";
        this.lastClockSeq = m.seq;
        // distance never moves backwards within one revision
        this.setClock(Math.max(m.distance, this.clockDist), m.speed, m.running, nowMs);
        this.lastHeardAt = nowMs;
        return "accepted";
      }
      case "closed": {
        if (!this.identity || m.ownerId !== this.identity.ownerId) return "foreign";
        this.clear();
        return "accepted";
      }
      default: return "ignored";
    }
  }

  private setClock(d: number, speed: number, running: boolean, nowMs: number): void {
    this.clockDist = d; this.clockSpeed = speed; this.running = running; this.clockAt = nowMs;
    this.shadowElapsed = 0;
    // FLOOR has no motion to project: progress is discrete, so the shadow simulation is never used for it.
    if (this.state && this.state.projection !== "FLOOR") this.shadow.reset(this.state, d, speed); // same kinematics as Control, from this authoritative sample
  }

  private project(nowMs: number): void {
    const elapsed = Math.min(Math.max(0, nowMs - this.clockAt), this.maxExtrapolationMs);
    if (elapsed > this.shadowElapsed) { this.shadow.advance(elapsed - this.shadowElapsed); this.shadowElapsed = elapsed; }
  }

  /** Current distance. Frozen when paused/held; bounded extrapolation when Control goes silent. */
  distance(nowMs: number): number {
    if (!this.running) return this.clockDist;
    if (!this.shadow.active) return this.clockDist + this.clockSpeed * Math.min(Math.max(0, nowMs - this.clockAt), this.maxExtrapolationMs) / 1000;
    this.project(nowMs);
    return Math.max(this.clockDist, this.shadow.distance ?? this.clockDist);
  }
  speed(nowMs: number): number {
    if (!this.running) return 0;
    if (nowMs - this.clockAt > this.maxExtrapolationMs) return 0;
    if (!this.shadow.active) return this.clockSpeed;
    this.project(nowMs);
    return this.shadow.speed;
  }
  /** Control has not been heard from for `ms` (the live Firebase feed is far slower than the local channel). */
  isSilentFor(nowMs: number, ms: number): boolean { return this.identity !== null && nowMs - this.lastHeardAt > ms; }
  isSilent(nowMs: number): boolean { return this.identity !== null && nowMs - this.lastHeardAt > DISPLAY_TIMEOUT_MS; }
  clear(): void { this.identity = null; this.state = null; this.revision = -1; this.running = false; this.lastClockSeq = -1; this.clockDist = 0; }
}
