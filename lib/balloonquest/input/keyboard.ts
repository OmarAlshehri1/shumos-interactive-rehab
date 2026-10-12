import type { PointerSample } from "./types";

/** Development aid: arrow keys / WASD move a cursor across the stage, Space/Enter presses. */
export type KeyAction = { kind: "move"; dx: number; dy: number } | { kind: "press" };

export function keyToAction(key: string): KeyAction | null {
  switch (key) {
    case "ArrowLeft":
    case "a":
    case "A":
      return { kind: "move", dx: -1, dy: 0 };
    case "ArrowRight":
    case "d":
    case "D":
      return { kind: "move", dx: 1, dy: 0 };
    case "ArrowUp":
    case "w":
    case "W":
      return { kind: "move", dx: 0, dy: -1 };
    case "ArrowDown":
    case "s":
    case "S":
      return { kind: "move", dx: 0, dy: 1 };
    case " ":
    case "Enter":
      return { kind: "press" };
    default:
      return null;
  }
}

export class KeyboardCursor {
  x = 0.5;
  y = 0.5;
  private down = new Set<string>();
  private seq = 0;
  /** Cursor speed in stage widths per second. */
  speed = 0.45;

  keyDown(key: string): KeyAction | null {
    const a = keyToAction(key);
    if (a?.kind === "move") this.down.add(key);
    return a;
  }
  keyUp(key: string): void {
    this.down.delete(key);
  }
  releaseAll(): void {
    this.down.clear();
  }
  step(dtMs: number): void {
    let dx = 0, dy = 0;
    for (const k of this.down) {
      const a = keyToAction(k);
      if (a?.kind === "move") {
        dx += a.dx;
        dy += a.dy;
      }
    }
    const d = (this.speed * Math.min(dtMs, 100)) / 1000;
    this.x = Math.min(1, Math.max(0, this.x + dx * d));
    this.y = Math.min(1, Math.max(0, this.y + dy * d));
  }
  sample(nowMs: number): PointerSample {
    return { sourceId: "KEYBOARD", x: this.x, y: this.y, visible: true, seq: ++this.seq, atMs: nowMs };
  }
}
