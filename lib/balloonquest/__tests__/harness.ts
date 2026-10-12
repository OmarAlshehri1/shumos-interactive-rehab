import { ControlRuntime, type RuntimeDeps } from "../controlRuntime";
import { ASPECT } from "../geometry";
import { PROTOCOL_VERSION, type Message } from "../protocol";
import { DisplayReplica } from "../replica";
import { selectableBodies } from "../session";
import { SimulatedPointer } from "../input/simulated";
import type { SourceId, TherapistSettings } from "../types";

export class FakeDisplay {
  readonly replica = new DisplayReplica();
  seq = 0;
  visible = true;
  connected = true;
  accepted: string[] = [];
  lastAckAt = -1e9;
  constructor(readonly id: string, private readonly env: Env) {}
  receive(m: Message) {
    if (!this.connected) return;
    this.accepted.push(this.replica.accept(m, this.env.now));
  }
  ack() {
    const r = this.replica;
    if (!this.connected || !r.identity) return;
    this.env.toControl({ v: PROTOCOL_VERSION, type: "ack", displayId: this.id, ownerId: r.identity.ownerId, sessionEpoch: r.identity.sessionEpoch, runId: r.identity.runId, revision: r.revision, seq: ++this.seq, visible: this.visible });
  }
  probe() {
    this.env.toControl({ v: PROTOCOL_VERSION, type: "probe", displayId: this.id, nonce: `n${++this.seq}` });
  }
}

export class Env {
  now = 5000;
  wall = 1_700_000_000_000;
  sent: Message[] = [];
  displays: FakeDisplay[] = [];
  latencyMs = 0;
  drop: (m: Message) => boolean = () => false;
  private queue: Array<{ at: number; m: Message }> = [];
  private idCounter = 0;
  rt!: ControlRuntime;
  private lastAck = -1e9;

  constructor(settings: Partial<TherapistSettings> = {}, over: Partial<RuntimeDeps> = {}) {
    this.rt = new ControlRuntime({
      now: () => this.now,
      wall: () => this.wall,
      send: (m) => {
        this.sent.push(m);
        if (this.drop(m)) return;
        this.queue.push({ at: this.now + this.latencyMs, m });
        this.flush();
      },
      ownerId: "owner-1",
      newId: () => `id${++this.idCounter}`,
      seed: 42,
      settings,
      ...over,
    });
  }
  toControl(m: Message) {
    this.rt.receive(m);
  }
  addDisplay(id = `d${this.displays.length + 1}`): FakeDisplay {
    const d = new FakeDisplay(id, this);
    this.displays.push(d);
    d.probe();
    this.flush();
    d.ack();
    return d;
  }
  private flush() {
    const due = this.queue.filter((q) => q.at <= this.now);
    this.queue = this.queue.filter((q) => q.at > this.now);
    for (const q of due) for (const d of this.displays) d.receive(q.m);
  }
  /** Advance time in `frame`-ms steps, ticking Control each frame and acking like a Display (every 500 ms). */
  run(ms: number, frame = 16, each?: () => void) {
    for (let t = 0; t < ms; t += frame) {
      this.now += frame;
      this.wall += frame;
      this.flush();
      if (this.now - this.lastAck >= 500) {
        this.lastAck = this.now;
        for (const d of this.displays) d.ack();
      }
      each?.();
      this.rt.tick();
      this.flush();
    }
  }
  pointer(source: SourceId) {
    const p = new SimulatedPointer(source, () => this.now);
    p.start((s) => this.rt.ingestPointer(s));
    return p;
  }
  /** Normalised stage coordinates of the first selectable balloon matching `pick`. */
  normOf(pick: (b: { id: string }) => boolean = () => true): { id: string; x: number; y: number } | null {
    const bodies = selectableBodies(this.rt.session).filter(pick);
    const b = bodies[0];
    return b ? { id: b.id, x: b.cx / (100 * ASPECT), y: b.cy / 100 } : null;
  }
  isTarget = (id: string) => {
    const st = this.rt.session.stage!;
    return st.balloons.find((b) => b.id === id)!.color === st.target;
  };
}

export const authoritativeTop = (env: Env, id: string) => {
  const st = env.rt.session.stage!;
  const b = st.balloons.find((x) => x.id === id)!;
  return { b, st };
};
