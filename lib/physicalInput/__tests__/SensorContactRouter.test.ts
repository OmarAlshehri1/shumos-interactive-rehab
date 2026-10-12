import { describe, expect, it } from "vitest";
import { SensorContactRouter } from "../SensorContactRouter";
import type { NormalizedPointer } from "../ContinuousMotionController";

function pointerAt(x: number, y: number, pointerOutputAtMs: number): NormalizedPointer {
  return {
    pointer: { x, y },
    visualOrientation: { rotationDeg: 0 },
    unfilteredPointer: { x, y },
    confidence: 1,
    timestampMs: pointerOutputAtMs,
    timing: {
      bleNotificationAtMs: pointerOutputAtMs,
      parsingStartedAtMs: pointerOutputAtMs,
      parsedAtMs: pointerOutputAtMs,
      controllerStartedAtMs: pointerOutputAtMs,
      filterStartedAtMs: pointerOutputAtMs,
      filterCompletedAtMs: pointerOutputAtMs,
      pointerOutputAtMs,
    },
  };
}

const TARGETS = [{ id: "balloon-1", x: 0.5, y: 0.5, radius: 0.1 }];

describe("SensorContactRouter", () => {
  it("fires one canonical entry on contact and none while held (game target enter / one contact = one action)", () => {
    const router = new SensorContactRouter(true);
    expect(router.observe(true, true, pointerAt(0.5, 0.5, 10), TARGETS)).toBe("balloon-1");
    expect(router.count).toBe(1);
    expect(router.observe(true, true, pointerAt(0.5, 0.5, 20), TARGETS)).toBeNull(); // hold does not repeat
    expect(router.count).toBe(1);
  });

  it("rearms after exit, so a new entry fires again", () => {
    const router = new SensorContactRouter(true);
    router.observe(true, true, pointerAt(0.5, 0.5, 10), TARGETS);
    router.observe(true, true, pointerAt(0.9, 0.9, 20), TARGETS); // exits
    expect(router.observe(true, true, pointerAt(0.5, 0.5, 30), TARGETS)).toBe("balloon-1");
    expect(router.count).toBe(2);
  });

  it("never processes the exact same pointer sample twice", () => {
    const router = new SensorContactRouter(true);
    const sample = pointerAt(0.5, 0.5, 10);
    expect(router.observe(true, true, sample, TARGETS)).toBe("balloon-1");
    // Same timestamp delivered again (e.g. a re-render before the next real sample arrives).
    expect(router.observe(true, true, sample, TARGETS)).toBeNull();
    expect(router.count).toBe(1);
  });

  it("never fires while not connected, even if already inside a target", () => {
    const router = new SensorContactRouter(true);
    expect(router.observe(true, false, pointerAt(0.5, 0.5, 10), TARGETS)).toBeNull();
    expect(router.count).toBe(0);
  });

  it("never fires while inactive (e.g. a non-spatial game phase)", () => {
    const router = new SensorContactRouter(false);
    expect(router.observe(false, true, pointerAt(0.5, 0.5, 10), TARGETS)).toBeNull();
    expect(router.count).toBe(0);
  });

  it("clears the 'already inside' set on an active->inactive->active transition, so returning to a spatial phase re-fires immediately rather than staying suppressed", () => {
    const router = new SensorContactRouter(true);
    router.observe(true, true, pointerAt(0.5, 0.5, 10), TARGETS); // enters and fires
    router.observe(false, true, pointerAt(0.5, 0.5, 20), TARGETS); // leaves the spatial phase while still physically inside
    expect(router.observe(true, true, pointerAt(0.5, 0.5, 30), TARGETS)).toBe("balloon-1"); // re-entering the phase fires again
    expect(router.count).toBe(2);
  });

  it("returns null when there is no pointer yet", () => {
    const router = new SensorContactRouter(true);
    expect(router.observe(true, true, null, TARGETS)).toBeNull();
    expect(router.count).toBe(0);
  });

  describe("notePendingRecenter (mandatory test A: recenter never fires a phantom contact)", () => {
    it("primes at the recentered pointer instead of firing a contact, then resumes normal detection", () => {
      const router = new SensorContactRouter(true);
      // Pointer was at top-right, far from the target — a plausible pre-recenter position.
      router.observe(true, true, pointerAt(0.9, 0.1, 10), TARGETS);
      router.notePendingRecenter();
      // Recenter jumps the pointer exactly onto the target — the consumed sample must not fire.
      expect(router.observe(true, true, pointerAt(0.5, 0.5, 20), TARGETS)).toBeNull();
      expect(router.count).toBe(0);
      // Holding at the recentered position still does nothing (correctly primed as "already inside").
      expect(router.observe(true, true, pointerAt(0.5, 0.5, 30), TARGETS)).toBeNull();
      // Genuinely leaving and re-entering afterward fires normally — recenter did not permanently disable the gate.
      router.observe(true, true, pointerAt(0.9, 0.9, 40), TARGETS);
      expect(router.observe(true, true, pointerAt(0.5, 0.5, 50), TARGETS)).toBe("balloon-1");
      expect(router.count).toBe(1);
    });

    it("consumes exactly the next observe() sample, not a stale/repeated one", () => {
      const router = new SensorContactRouter(true);
      router.notePendingRecenter();
      expect(router.observe(true, true, pointerAt(0.5, 0.5, 10), TARGETS)).toBeNull(); // primed, not fired
      // A later new pointer at the same spot should now fire normally (prime only ever suppresses one sample).
      router.observe(true, true, pointerAt(0.9, 0.9, 20), TARGETS);
      expect(router.observe(true, true, pointerAt(0.5, 0.5, 30), TARGETS)).toBe("balloon-1");
    });
  });
});
