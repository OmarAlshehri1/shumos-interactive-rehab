import { afterEach, describe, expect, it, vi } from "vitest";
import { KeyboardFlightInput } from "../keyboardInput";

function key(target: EventTarget, type: string, code: string): void {
  const event = Object.assign(new Event(type, { cancelable: true }), { code });
  target.dispatchEvent(event);
}

afterEach(() => vi.unstubAllGlobals());

function setup() {
  const canvas = new EventTarget();
  const browser = new EventTarget();
  vi.stubGlobal("window", browser);
  const input = new KeyboardFlightInput(canvas as HTMLCanvasElement);
  return { input, canvas, browser };
}

describe("development keyboard adapter", () => {
  it("moves immediately, clamps at edges and holds position when keys are released", () => {
    const { input, canvas, browser } = setup();
    key(canvas, "keydown", "ArrowRight"); key(canvas, "keydown", "ArrowUp");
    const moving = { ...input.sample(0.1) };
    expect(moving.x).toBeGreaterThan(0.5); expect(moving.y).toBeLessThan(0.5);
    input.sample(10);
    expect(input.sample(0)).toEqual({ x: 1, y: 0 });
    key(browser, "keyup", "ArrowRight"); key(browser, "keyup", "ArrowUp");
    expect(input.sample(0.1)).toEqual({ x: 1, y: 0 });
    input.reset(); expect(input.sample(0.1)).toEqual({ x: 0.5, y: 0.5 });
    input.dispose();
  });

  it("clears held keys on blur and removes listeners on disposal", () => {
    const { input, canvas, browser } = setup();
    key(canvas, "keydown", "KeyA"); input.sample(0.1);
    browser.dispatchEvent(new Event("blur"));
    const held = { ...input.sample(0.1) };
    expect(input.sample(0.1)).toEqual(held);
    key(canvas, "keydown", "KeyW"); canvas.dispatchEvent(new Event("blur"));
    expect(input.sample(0.1)).toEqual(held);
    input.dispose(); key(canvas, "keydown", "KeyD");
    expect(input.sample(0.1)).toEqual(held);
  });
});
