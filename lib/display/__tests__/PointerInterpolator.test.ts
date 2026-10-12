import { describe, expect, it } from "vitest";
import { PointerInterpolator } from "../PointerInterpolator";

describe("PointerInterpolator", () => {
  it("latest pointer wins: multiple setTarget calls before a tick only ever chase the last one", () => {
    const interpolator = new PointerInterpolator();
    interpolator.setTarget({ x: 0.1, y: 0.1, visible: true });
    // Snap to the first visible sample (fresh appearance) so the assertions below are about steady-state chasing, not the appearance snap.
    expect(interpolator.getRendered()).toEqual({ x: 0.1, y: 0.1, visible: true });

    interpolator.setTarget({ x: 0.2, y: 0.2, visible: true });
    interpolator.setTarget({ x: 0.9, y: 0.9, visible: true }); // stale intermediate sample — never applied on its own
    interpolator.setTarget({ x: 0.5, y: 0.5, visible: true }); // the actual latest sample

    const rendered = interpolator.tick(1000);
    // Converged toward 0.5,0.5 (the latest target), never toward the superseded 0.2 or 0.9 samples.
    expect(rendered).not.toBeNull();
    expect(rendered!.x).toBeCloseTo(0.5, 3);
    expect(rendered!.y).toBeCloseTo(0.5, 3);
  });

  it("stale/superseded samples are never replayed — only the most recent setTarget call has any effect", () => {
    const interpolator = new PointerInterpolator();
    interpolator.setTarget({ x: 0, y: 0, visible: true });
    interpolator.tick(16);
    for (let i = 0; i < 20; i++) {
      interpolator.setTarget({ x: i / 20, y: 0, visible: true });
    }
    // Only the final call (x = 19/20) is live; ticking converges toward it, not toward any earlier value in the sequence.
    const rendered = interpolator.tick(1000);
    expect(rendered!.x).toBeCloseTo(19 / 20, 3);
  });

  it("advances toward the target without overshooting it, converging monotonically", () => {
    const interpolator = new PointerInterpolator();
    interpolator.setTarget({ x: 0, y: 0, visible: true });
    interpolator.setTarget({ x: 1, y: 0, visible: true });

    let previousDistance = 1;
    for (let i = 0; i < 30; i++) {
      const rendered = interpolator.tick(16)!;
      expect(rendered.x).toBeGreaterThanOrEqual(0);
      expect(rendered.x).toBeLessThanOrEqual(1); // never overshoots past the target
      const distance = 1 - rendered.x;
      expect(distance).toBeLessThanOrEqual(previousDistance); // strictly gets closer every frame, never a spring's back-and-forth
      previousDistance = distance;
    }
  });

  it("converges quickly: within a handful of frames at a realistic ~60fps cadence, effectively at rest", () => {
    const interpolator = new PointerInterpolator();
    interpolator.setTarget({ x: 0, y: 0, visible: true });
    interpolator.setTarget({ x: 1, y: 1, visible: true });

    let rendered = interpolator.getRendered();
    for (let i = 0; i < 10; i++) rendered = interpolator.tick(16);

    expect(rendered!.x).toBeGreaterThan(0.95);
    expect(rendered!.y).toBeGreaterThan(0.95);
  });

  it("holds exactly at rest: once converged, further ticks with an unchanged target never drift", () => {
    const interpolator = new PointerInterpolator();
    interpolator.setTarget({ x: 0.42, y: 0.73, visible: true });
    for (let i = 0; i < 50; i++) interpolator.tick(16);

    const settled = interpolator.getRendered();
    expect(settled).toEqual({ x: 0.42, y: 0.73, visible: true });

    for (let i = 0; i < 50; i++) {
      const rendered = interpolator.tick(16);
      expect(rendered).toEqual(settled);
    }
  });

  it("disconnect hides the pointer immediately — no lingering glide, no visible frame at the old position", () => {
    const interpolator = new PointerInterpolator();
    interpolator.setTarget({ x: 0.8, y: 0.2, visible: true });
    interpolator.tick(16);
    expect(interpolator.getRendered()).not.toBeNull();

    interpolator.setTarget(null);
    expect(interpolator.getRendered()).toBeNull(); // hidden the instant the sample clears, before any tick
    expect(interpolator.tick(16)).toBeNull(); // and stays hidden — nothing to animate toward
  });

  it("never returns to center: hiding never renders (0,0), and reappearing snaps straight to the real sample instead of gliding in from center or the old spot", () => {
    const interpolator = new PointerInterpolator();
    interpolator.setTarget({ x: 0.9, y: 0.9, visible: true });
    interpolator.tick(16);
    interpolator.setTarget(null);
    expect(interpolator.getRendered()).toBeNull();

    // Reconnects far away from where it was hidden — must snap there directly, not glide from (0,0) or the stale 0.9,0.9.
    interpolator.setTarget({ x: 0.1, y: 0.1, visible: true });
    expect(interpolator.getRendered()).toEqual({ x: 0.1, y: 0.1, visible: true });
  });

  it("treats a large jump (e.g. recenter) as a teleport, snapping instead of visibly gliding across the whole screen", () => {
    const interpolator = new PointerInterpolator();
    interpolator.setTarget({ x: 0.05, y: 0.05, visible: true });
    interpolator.tick(16);
    interpolator.setTarget({ x: 0.95, y: 0.95, visible: true });

    const rendered = interpolator.tick(16);
    expect(rendered).toEqual({ x: 0.95, y: 0.95, visible: true }); // one frame, not a multi-frame glide
  });

  it("handles a non-monotonic/negative dt defensively without moving backward or producing NaN", () => {
    const interpolator = new PointerInterpolator();
    interpolator.setTarget({ x: 0, y: 0, visible: true });
    interpolator.setTarget({ x: 1, y: 0, visible: true });
    interpolator.tick(16);
    const before = interpolator.getRendered()!;

    const rendered = interpolator.tick(-50)!;
    expect(Number.isNaN(rendered.x)).toBe(false);
    expect(rendered.x).toBeGreaterThanOrEqual(before.x); // never regresses on a bad/clamped dt
  });

  it("getRendered before any target is set is null", () => {
    const interpolator = new PointerInterpolator();
    expect(interpolator.getRendered()).toBeNull();
  });
});
