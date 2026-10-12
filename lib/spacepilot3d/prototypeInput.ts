import { KeyboardFlightInput } from "./keyboardInput";
import { RightHandFlightInput, subscribeToRightHandFlightInput } from "./sensorInput";
import type { NormalizedFlightInput, PrototypeInputMode } from "./simulation";

/** One selected source. Lifecycle gates clear buffered input without moving the ship. */
export class PrototypeFlightInput {
  mode: PrototypeInputMode = "keyboard";
  readonly sensor = new RightHandFlightInput();
  private readonly keyboard: KeyboardFlightInput;
  private readonly unsubscribe: () => void;
  private readonly held = { x: 0.5, y: 0.5 };
  private paused = true;

  constructor(canvas: HTMLCanvasElement) {
    this.keyboard = new KeyboardFlightInput(canvas);
    this.keyboard.setEnabled(false, this.held);
    try { this.unsubscribe = subscribeToRightHandFlightInput(this.sensor); }
    catch (error) { this.keyboard.dispose(); this.sensor.dispose(); throw error; }
  }

  select(mode: PrototypeInputMode): void {
    if (mode === this.mode) return;
    this.sensor.deactivate();
    this.mode = mode;
    this.keyboard.setEnabled(mode === "keyboard" && !this.paused, this.held);
    if (mode === "sensor") this.sensor.activate(this.held);
  }

  pause(): void { this.paused = true; this.keyboard.setEnabled(false, this.held); this.sensor.rearm(this.held); }
  resume(): void {
    this.paused = false;
    this.keyboard.setEnabled(this.mode === "keyboard", this.held);
    if (this.mode === "sensor") this.sensor.rearm(this.held);
  }
  align(): void { this.sensor.rearm(this.held); }
  reset(): void {
    this.held.x = this.held.y = 0.5;
    this.keyboard.reset(); this.sensor.reset(); this.resume();
  }

  sample(deltaSeconds: number): NormalizedFlightInput | null {
    // Health is checked by the existing rendering loop even during pause.
    const sensorPointer = this.sensor.sample();
    if (this.paused || deltaSeconds <= 0) return null;
    const next = this.mode === "sensor" ? sensorPointer : this.keyboard.sample(deltaSeconds);
    if (next) {
      this.held.x = next.x; this.held.y = next.y;
      this.sensor.notePosition(this.held);
    }
    return next;
  }

  get position(): NormalizedFlightInput { return this.held; }

  dispose(): void { this.unsubscribe(); this.sensor.dispose(); this.keyboard.dispose(); }
}
