import type { FlightInputSource, NormalizedFlightInput } from "./simulation";

const FLIGHT_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyD", "KeyW", "KeyS"]);

/** Development-only adapter. Keyboard focus belongs to the canvas, not the page. */
export class KeyboardFlightInput implements FlightInputSource {
  private readonly keys = new Set<string>();
  private readonly pointer = { x: 0.5, y: 0.5 };
  private enabled = true;

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    canvas.addEventListener("blur", this.clear);
    window.addEventListener("blur", this.clear);
  }

  private readonly keyDown = (event: KeyboardEvent): void => {
    if (!this.enabled || !FLIGHT_KEYS.has(event.code)) return;
    event.preventDefault();
    this.keys.add(event.code);
  };
  private readonly keyUp = (event: KeyboardEvent): void => { this.keys.delete(event.code); };
  private readonly clear = (): void => { this.keys.clear(); };

  sample(deltaSeconds: number): NormalizedFlightInput {
    const horizontal = Number(this.keys.has("ArrowRight") || this.keys.has("KeyD")) - Number(this.keys.has("ArrowLeft") || this.keys.has("KeyA"));
    const vertical = Number(this.keys.has("ArrowDown") || this.keys.has("KeyS")) - Number(this.keys.has("ArrowUp") || this.keys.has("KeyW"));
    const distance = 0.38 * deltaSeconds / (horizontal && vertical ? Math.SQRT2 : 1);
    this.pointer.x = Math.min(1, Math.max(0, this.pointer.x + horizontal * distance));
    this.pointer.y = Math.min(1, Math.max(0, this.pointer.y + vertical * distance));
    return this.pointer;
  }

  reset(): void { this.clear(); this.pointer.x = this.pointer.y = 0.5; }

  setEnabled(enabled: boolean, position: NormalizedFlightInput): void {
    this.clear();
    this.enabled = enabled;
    this.pointer.x = position.x;
    this.pointer.y = position.y;
  }

  dispose(): void {
    this.canvas.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
    this.canvas.removeEventListener("blur", this.clear);
    window.removeEventListener("blur", this.clear);
    this.clear();
  }
}
