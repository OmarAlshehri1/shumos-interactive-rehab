import { isId, isPresentationFrame, isRecord, isSessionState, LINK_TIMEOUT_MS, type AcceptedOutcome, type ExperimentalSessionState, type PresentationFrame, type SessionMessage } from "./sessionContract";

/** Read-only reconciliation. Contains no game rules, stepping or score mutation. */
export class SessionReplica {
  state: ExperimentalSessionState | null = null;
  frame: PresentationFrame | null = null;
  private readonly probes = new Map<string, number>();
  private lastSync = -Infinity;
  private lastEvent = 0;
  private effects: AcceptedOutcome[] = [];
  private disconnected = true;

  constructor(readonly roomId: string, readonly displayId: string) {}
  probe(nonce: string, now: number): SessionMessage {
    this.probes.set(nonce, now);
    if (this.probes.size > 8) this.probes.delete(this.probes.keys().next().value!);
    return { version: 4, type: "probe", displayId: this.displayId, nonce };
  }
  connected(now: number): boolean {
    if (!Number.isFinite(now) || now < this.lastSync || now - this.lastSync > LINK_TIMEOUT_MS) this.disconnected = true;
    return !this.disconnected;
  }
  receive(raw: unknown, now: number): boolean {
    if (!isRecord(raw) || raw.version !== 4) return false;
    if (raw.type === "closed" && raw.ownerId === this.state?.ownerId) { this.disconnected = true; return true; }
    if (raw.type === "sync") {
      if (raw.displayId !== this.displayId || !isId(raw.nonce)) return false;
      const sent = this.probes.get(raw.nonce);
      this.probes.delete(raw.nonce);
      if (sent === undefined || now < sent || now - sent > LINK_TIMEOUT_MS || !isSessionState(raw.state) || !isPresentationFrame(raw.frame) || raw.state.roomId !== this.roomId || !this.matches(raw.frame, raw.state)) return false;
      const newOwner = this.state?.ownerId !== raw.state.ownerId;
      const recovered = !this.connected(now);
      if (!newOwner && !this.acceptsState(raw.state, true)) return false;
      if (newOwner) { this.probes.clear(); this.state = null; this.frame = null; this.lastEvent = 0; this.effects = []; }
      this.applyState(raw.state, newOwner || recovered);
      if (!this.frame || raw.frame.sequence > this.frame.sequence) this.frame = raw.frame;
      this.lastSync = now; this.disconnected = false;
      return true;
    }
    if (!this.connected(now)) return false;
    if (raw.type === "state" && isSessionState(raw.state) && this.acceptsState(raw.state, false)) { this.applyState(raw.state, false); return true; }
    if (raw.type === "frame" && isPresentationFrame(raw.frame) && this.state && this.matches(raw.frame, this.state) && (!this.frame || raw.frame.sequence > this.frame.sequence)) { this.frame = raw.frame; return true; }
    return false;
  }
  private matches(frame: PresentationFrame, state: ExperimentalSessionState): boolean {
    return frame.ownerId === state.ownerId && frame.sessionId === state.sessionId && frame.runId === state.runId && frame.revision === state.revision && frame.inputEpoch === state.inputEpoch;
  }
  private acceptsState(next: ExperimentalSessionState, equal: boolean): boolean {
    const previous = this.state;
    if (!previous) return false;
    return next.roomId === this.roomId && next.ownerId === previous.ownerId && next.sessionId === previous.sessionId && next.runId >= previous.runId && next.inputEpoch >= previous.inputEpoch && next.eventSequence >= previous.eventSequence && (equal ? next.revision >= previous.revision : next.revision > previous.revision);
  }
  private applyState(next: ExperimentalSessionState, suppressEffects: boolean): void {
    if (next.runId !== this.state?.runId) this.effects = [];
    if (!suppressEffects) {
      for (const event of next.outcomes) if (event.sequence > this.lastEvent) this.effects.push(event);
    } else this.effects = [];
    this.lastEvent = next.eventSequence;
    this.state = next;
  }
  takeEffects(): AcceptedOutcome[] { const result = this.effects; this.effects = []; return result; }
}
