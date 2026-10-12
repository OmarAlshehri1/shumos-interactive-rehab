import type { Pointer } from "./stages";
export const STALE_MS = 250;
/** Consumes the existing normalized RIGHT_HAND transport. Pickup is a safety clutch, never calibration or smoothing. */
export class BuildQuestSensor {
  status: "waiting" | "tracking" | "align" | "stale" | "lost" = "waiting";
  private acceptAfter = -Infinity;
  private seq = -1;
  private sent = -Infinity;
  private received = -Infinity;
  private armed = false;
  private position: Pointer | null = null;
  private held: Pointer = { x: 0.5, y: 0.5 };
  constructor(private now = () => Date.now()) {}
  rearm(held: Pointer) {
    this.held = { ...held };
    this.armed = false;
    this.position = null;
    this.status = "waiting";
    this.acceptAfter = this.now();
  }
  accept(raw: unknown): boolean {
    if (!raw || typeof raw !== "object") return false;
    const m = raw as Record<string, unknown>,
      now = this.now();
    if (
      m.role !== "RIGHT_HAND" ||
      typeof m.visible !== "boolean" ||
      typeof m.x !== "number" ||
      typeof m.y !== "number" ||
      !Number.isFinite(m.x) ||
      !Number.isFinite(m.y) ||
      typeof m.seq !== "number" ||
      !Number.isSafeInteger(m.seq) ||
      m.seq < 0 ||
      typeof m.sentAtMs !== "number" ||
      !Number.isFinite(m.sentAtMs)
    )
      return false;
    if (
      now - m.sentAtMs < 0 ||
      now - m.sentAtMs > STALE_MS ||
      m.sentAtMs < this.sent ||
      m.sentAtMs < this.acceptAfter
    )
      return false;
    const expired = now - this.received > STALE_MS;
    if (m.seq <= this.seq && (!expired || m.sentAtMs <= this.sent))
      return false;
    if (expired) this.armed = false;
    this.seq = m.seq;
    this.sent = m.sentAtMs;
    this.received = now;
    if (!m.visible) {
      this.armed = false;
      this.position = null;
      this.status = "lost";
      return true;
    }
    const p = {
      x: Math.max(0, Math.min(1, m.x)),
      y: Math.max(0, Math.min(1, m.y)),
    };
    if (
      this.armed &&
      this.position &&
      Math.hypot(p.x - this.position.x, p.y - this.position.y) > 0.35
    )
      this.armed = false;
    this.position = p;
    if (!this.armed && Math.hypot(p.x - this.held.x, p.y - this.held.y) < 0.04)
      this.armed = true;
    this.status = this.armed ? "tracking" : "align";
    return true;
  }
  sample(): Pointer | null {
    if (this.now() - this.received > STALE_MS) {
      this.armed = false;
      this.position = null;
      this.status = "stale";
    }
    if (this.armed && this.position) {
      this.held = { ...this.position };
      return this.position;
    }
    return null;
  }
}
/** Future handheld adapter: normalized stick, rising-edge button, no hardware compatibility claim. */
export function controllerInput(
  p: Pointer,
  axes: readonly number[],
  dt: number,
): Pointer {
  const axis = (n: number) =>
    Number.isFinite(n) && Math.abs(n) > 0.15 ? Math.max(-1, Math.min(1, n)) : 0;
  return {
    x: Math.max(
      0.04,
      Math.min(0.96, p.x + axis(axes[0]) * Math.min(0.1, dt) * 0.4),
    ),
    y: Math.max(
      0.08,
      Math.min(0.9, p.y + axis(axes[1]) * Math.min(0.1, dt) * 0.4),
    ),
  };
}
export function keyboardInput(
  p: Pointer,
  keys: ReadonlySet<string>,
  dt: number,
): Pointer {
  return controllerInput(
    p,
    [
      (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) -
        (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0),
      (keys.has("ArrowDown") || keys.has("s") ? 1 : 0) -
        (keys.has("ArrowUp") || keys.has("w") ? 1 : 0),
    ],
    dt,
  );
}
