import { describe, expect, it } from "vitest";
import { ContactActionInstrument, ContactActivationGate } from "../ContactActivationGate";

describe("canonical game contact adapter", () => {
  it("fires only on entry, rearms on exit, and ignores a held pointer", () => {
    const gate = new ContactActivationGate();
    const targets = [{ id: "balloon-1", x: 0.5, y: 0.5, radius: 0.1 }];
    expect(gate.observe({ x: 0.5, y: 0.5 }, targets, 10)).toEqual({ targetId: "balloon-1", pointerEnteredAtMs: 10 });
    expect(gate.observe({ x: 0.51, y: 0.5 }, targets, 20)).toBeNull();
    expect(gate.observe({ x: 0.9, y: 0.9 }, targets, 30)).toBeNull();
    expect(gate.observe({ x: 0.5, y: 0.5 }, targets, 40)).toEqual({ targetId: "balloon-1", pointerEnteredAtMs: 40 });
  });

  describe("primeAt (recenter phantom-contact protection)", () => {
    it("does not fire on the next observe() at a position it was primed as already-inside", () => {
      const gate = new ContactActivationGate();
      const targets = [{ id: "balloon-1", x: 0.5, y: 0.5, radius: 0.1 }];
      gate.primeAt({ x: 0.5, y: 0.5 }, targets); // e.g. pointer jumped here via a therapist recenter
      expect(gate.observe({ x: 0.5, y: 0.5 }, targets, 10)).toBeNull();
      // Genuinely leaving and re-entering afterward still fires normally.
      expect(gate.observe({ x: 0.9, y: 0.9 }, targets, 20)).toBeNull();
      expect(gate.observe({ x: 0.5, y: 0.5 }, targets, 30)).toEqual({ targetId: "balloon-1", pointerEnteredAtMs: 30 });
    });

    it("still fires for a target the primed position was NOT inside", () => {
      const gate = new ContactActivationGate();
      const targets = [{ id: "balloon-1", x: 0.9, y: 0.9, radius: 0.1 }];
      gate.primeAt({ x: 0.5, y: 0.5 }, targets); // recentered pointer is nowhere near this target
      expect(gate.observe({ x: 0.9, y: 0.9 }, targets, 10)).toEqual({ targetId: "balloon-1", pointerEnteredAtMs: 10 });
    });
  });

  it("passes the exact target id once to the canonical action and records its boundary", () => {
    const times = [12, 14, 20];
    const instrument = new ContactActionInstrument(() => times.shift()!);
    const calls: string[] = [];
    instrument.invoke({ targetId: "real-id", pointerEnteredAtMs: 10 }, (id) => calls.push(id));
    instrument.markVisualResponse("real-id");
    expect(calls).toEqual(["real-id"]);
    expect(instrument.report()).toEqual([{
      targetId: "real-id",
      pointerEnteredAtMs: 10,
      canonicalActionStartedAtMs: 12,
      canonicalActionCompletedAtMs: 14,
      visualResponseAtMs: 20,
    }]);
  });
});
