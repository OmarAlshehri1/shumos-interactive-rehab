import { LOCAL_POINTER_CHANNEL_NAME, isBroadcastChannelSupported, type LocalPointerMessage } from "@/lib/display/LocalPointerChannel";
import type { FlightInputSource, NormalizedFlightInput } from "./simulation";

export const SENSOR_STALE_MS = 250; // Same freshness budget as the existing local display receiver.
export const SENSOR_PICKUP_RADIUS = 0.025;
const DISCONTINUITY_DISTANCE = 0.45;
export type SensorInputStatus = "waiting" | "align" | "tracking" | "unavailable" | "stale" | "invalid" | "discontinuity" | "unsupported";

function isPointerMessage(raw: unknown): raw is LocalPointerMessage {
  if (!raw || typeof raw !== "object") return false;
  const value = raw as Partial<LocalPointerMessage>;
  return value.role === "RIGHT_HAND" && typeof value.visible === "boolean" &&
    Number.isSafeInteger(value.seq) && value.seq! >= 0 &&
    typeof value.sentAtMs === "number" && Number.isFinite(value.sentAtMs) &&
    typeof value.x === "number" && Number.isFinite(value.x) &&
    typeof value.y === "number" && Number.isFinite(value.y);
}

/** Pure receiver: no BLE, controller, smoothing, React state or timers. */
export class RightHandFlightInput implements FlightInputSource {
  status: SensorInputStatus = "waiting";
  private active = false;
  private supported = true;
  private disposed = false;
  private armed = false;
  private hasPointer = false;
  private lastSeq = -1;
  private lastSentAtMs = -Infinity;
  private receivedAtMs = -Infinity;
  private acceptAfterMs = -Infinity;
  private readonly pointer = { x: 0.5, y: 0.5 };
  private readonly held = { x: 0.5, y: 0.5 };

  constructor(private readonly wallNow = () => Date.now(), private readonly monotonicNow = () => performance.now()) {}

  activate(position: NormalizedFlightInput): void {
    this.active = true;
    this.rearm(position);
  }

  deactivate(): void { this.active = false; this.hasPointer = false; this.armed = false; }
  markUnsupported(): void { this.supported = false; this.status = "unsupported"; }

  /** A clutch/pickup, not calibration: absolute coordinates remain unchanged. */
  rearm(position: NormalizedFlightInput): void {
    this.held.x = position.x; this.held.y = position.y;
    this.armed = false; this.hasPointer = false;
    this.acceptAfterMs = this.wallNow();
    this.status = "waiting";
  }

  accept(raw: unknown): boolean {
    if (!this.active || this.disposed) return false;
    // Another hand cannot affect availability, sequence or movement.
    if (raw && typeof raw === "object" && (raw as { role?: unknown }).role !== "RIGHT_HAND") return false;
    if (!isPointerMessage(raw)) { this.lose("invalid"); return false; }
    const age = this.wallNow() - raw.sentAtMs;
    if (age < 0 || age > SENSOR_STALE_MS || raw.sentAtMs < this.acceptAfterMs) return false;
    const expired = this.monotonicNow() - this.receivedAtMs > SENSOR_STALE_MS;
    // The legacy protocol has no publisher epoch. Only a fresh, later packet
    // after a silence gap can establish a restarted sequence; never rewind a
    // healthy stream. Timestamp guards reject packets from the previous run.
    if (raw.sentAtMs < this.lastSentAtMs || (raw.seq <= this.lastSeq && (!expired || raw.sentAtMs <= this.lastSentAtMs))) return false;
    if (expired || raw.seq <= this.lastSeq) this.lose("stale");
    this.lastSeq = raw.seq; this.lastSentAtMs = raw.sentAtMs; this.receivedAtMs = this.monotonicNow();
    if (!raw.visible) { this.lose("unavailable"); return true; }
    const x = Math.min(1, Math.max(0, raw.x)), y = Math.min(1, Math.max(0, raw.y));
    if (this.armed && this.hasPointer && Math.hypot(x - this.pointer.x, y - this.pointer.y) > DISCONTINUITY_DISTANCE) {
      // Recenter is NOT tagged upstream. Large jumps conservatively engage
      // pickup; this can also happen during very fast real hand movement.
      this.lose("discontinuity");
    }
    this.pointer.x = x; this.pointer.y = y; this.hasPointer = true;
    if (!this.armed && Math.hypot(x - this.held.x, y - this.held.y) <= SENSOR_PICKUP_RADIUS) this.armed = true;
    if (this.armed) this.status = "tracking";
    else if (this.status !== "discontinuity") this.status = "align";
    return true;
  }

  private lose(status: SensorInputStatus): void {
    this.armed = false; this.hasPointer = false; this.status = status;
  }

  sample(): NormalizedFlightInput | null {
    if (!this.active || this.disposed) return null;
    if (!this.supported) { this.status = "unsupported"; return null; }
    if (this.hasPointer && (this.monotonicNow() - this.receivedAtMs > SENSOR_STALE_MS || this.wallNow() - this.lastSentAtMs > SENSOR_STALE_MS)) this.lose("stale");
    return this.hasPointer && this.armed ? this.pointer : null;
  }
  get latestPointer(): NormalizedFlightInput | null { return this.hasPointer ? this.pointer : null; }

  /** Record the actual rendered pose so recovery pickup holds this position. */
  notePosition(position: NormalizedFlightInput): void { this.held.x = position.x; this.held.y = position.y; }
  reset(): void { this.rearm({ x: 0.5, y: 0.5 }); }
  dispose(): void { this.disposed = true; this.deactivate(); }
}

export function subscribeToRightHandFlightInput(input: RightHandFlightInput): () => void {
  if (!isBroadcastChannelSupported()) { input.markUnsupported(); return () => {}; }
  const channel = new BroadcastChannel(LOCAL_POINTER_CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<unknown>) => { input.accept(event.data); };
  return () => { channel.onmessage = null; channel.close(); };
}
