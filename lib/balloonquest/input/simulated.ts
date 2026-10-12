import type { SourceId } from "../types";
import type { PointerAdapter, PointerSample } from "./types";

/**
 * Scripted pointer for tests and the development pad. It is NOT hardware and
 * reports `hardwareVerified = false`; any source id (hand, foot, handheld) may
 * be simulated, which is exactly how foot and handheld input are exercised
 * until real adapters exist.
 */
export class SimulatedPointer implements PointerAdapter {
  readonly hardwareVerified = false;
  private emitFn: ((s: PointerSample) => void) | null = null;
  private seq = 0;
  private x = 0.5;
  private y = 0.5;
  private visible = true;

  constructor(readonly sourceId: SourceId, private readonly clock: () => number = () => performance.now()) {}

  start(emit: (sample: PointerSample) => void): void {
    this.emitFn = emit;
  }
  stop(): void {
    this.emitFn = null;
  }
  moveTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.visible = true;
    this.push();
  }
  hide(): void {
    this.visible = false;
    this.push();
  }
  /** Re-sends the current position (a sensor streaming at a steady rate while still). */
  heartbeat(): void {
    this.push();
  }
  /** Simulates a reconnect: sequence numbers restart. */
  restartSequence(): void {
    this.seq = 0;
  }
  private push(): void {
    this.emitFn?.({ sourceId: this.sourceId, x: this.x, y: this.y, visible: this.visible, seq: ++this.seq, atMs: this.clock() });
  }
}
