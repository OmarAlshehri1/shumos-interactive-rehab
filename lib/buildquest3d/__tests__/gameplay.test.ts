import { describe, it, expect } from "vitest";
import { STAGES, project, unproject } from "../stages";
import {
  action,
  configure,
  createState,
  guard,
  input,
  place,
  HELP,
} from "../gameplay";
describe("nine complete construction challenges", () => {
  it("has exactly 3 levels of 3 stages with unique pieces and reachable targets", () => {
    expect(STAGES).toHaveLength(9);
    const ids = STAGES.flatMap((s) => s.pieces.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const level of [1, 2, 3])
      expect(STAGES.filter((s) => s.level === level)).toHaveLength(3);
    for (const s of STAGES) {
      expect(new Set(s.pieces.map((p) => p.id)).size).toBe(s.pieces.length);
      for (const p of s.pieces) {
        const src = project(p.source),
          target = project(p.target);
        expect(src.x).toBeGreaterThan(0.5);
        expect(target.x).toBeLessThan(0.5);
        expect(src.y).toBeGreaterThan(0.08);
        expect(src.y).toBeLessThan(0.9);
        expect(target.y).toBeGreaterThan(0.08);
        expect(target.y).toBeLessThan(0.9);
        for (const [i, n] of unproject(
          project(p.target),
          p.target[1],
        ).entries())
          expect(n).toBeCloseTo(p.target[i], 8);
      }
    }
  });
  for (const [index, stage] of STAGES.entries())
    it(`builds ${stage.id} from source pieces, never scores wrong or repeated placements`, () => {
      let s = action(createState("test-session", index), "start");
      for (const p of stage.pieces) {
        s = input(s, project(p.source), 33, true);
        expect(s.selected).toBe(p.id);
        const count = s.events.length;
        s = input(s, { x: 0.9, y: 0.85 }, 33);
        expect(s.events).toHaveLength(count);
        s = input(s, project(p.target), 33);
        expect(s.events).toHaveLength(count + 1);
        expect(s.placed).toContain(p.id);
        expect(place(s, p.id, s.events.at(-1)!.id, guard(s))).toBe(s);
      }
      expect(s.status).toBe("complete");
      expect(s.completed).toEqual([stage.id]);
      expect(s.events).toHaveLength(stage.pieces.length);
    });
  it("requires foundational pieces before upper assembly", () => {
    let s = action(createState("test-session", 6), "start");
    s = input(s, project(STAGES[6].pieces[2].source), 33, true);
    expect(s.selected).toBeNull();
    for (const p of STAGES[6].pieces) {
      s = input(s, project(p.source), 33, true);
      s = input(s, project(p.target), 33);
    }
    expect(s.status).toBe("complete");
  });
  it("uses dwell and never accumulates while absent or paused", () => {
    let s = action(createState("test-session"), "start");
    const p = project(STAGES[0].pieces[0].source);
    s = input(s, p, 100);
    s = input(s, null, 100);
    expect(s.dwell).toBe(0);
    for (let i = 0; i < 6; i++) s = input(s, p, 100);
    expect(s.selected).toBeNull();
    s = input(s, p, 100);
    expect(s.selected).toBe("first-shapes:square");
    const paused = action(s, "pause");
    expect(input(paused, project(STAGES[0].pieces[0].target), 100)).toBe(
      paused,
    );
    s = action(paused, "resume");
    expect(s.inputReady).toBe(false);
    s = input(s, project(STAGES[0].pieces[0].target), 33);
    expect(s.placed).toHaveLength(1);
  });
  it("separates assistance from difficulty and keeps low assistance forgiving", () => {
    expect(HELP.high.radius).toBeGreaterThan(HELP.medium.radius);
    expect(HELP.medium.radius).toBeGreaterThan(HELP.low.radius);
    for (const assistance of ["high", "medium", "low"] as const) {
      let s = configure(createState("test-session", 8), {
        assistance,
        tolerance: 1,
      });
      expect(s.stage).toBe(8);
      s = action(s, "start");
      const p = STAGES[8].pieces[0];
      s = input(s, project(p.source), 33, true);
      s = input(s, { ...project(p.target), x: project(p.target).x + 0.02 }, 33);
      expect(s.placed).toContain(p.id);
    }
  });
  it("restarts with a new run, rejects stale outcomes, skips and ends safely", () => {
    let s = action(createState("test-session"), "start");
    const old = guard(s);
    s = input(s, project(STAGES[0].pieces[0].source), 33, true);
    s = action(s, "restart");
    expect(s.run).toBe(2);
    expect(s.placed).toEqual([]);
    s = action(s, "start");
    s = input(s, project(STAGES[0].pieces[0].source), 33, true);
    expect(place(s, "first-shapes:square", "stale", old)).toBe(s);
    s = action(s, "skip");
    expect(s.stage).toBe(1);
    expect(s.skipped).toEqual(["first-shapes"]);
    expect(s.status).toBe("ready");
    s = action(s, "end");
    expect(s.status).toBe("ended");
    expect(input(s, { x: 0, y: 0 }, 100)).toBe(s);
  });
  it("has no elapsed-time failure and ignores nonfinite input", () => {
    let s = action(createState("test-session"), "start");
    for (let i = 0; i < 100; i++) s = input(s, { x: 0.5, y: 0.8 }, 100000);
    expect(s.status).toBe("running");
    expect(s.events).toHaveLength(0);
    expect(input(s, { x: NaN, y: 0 }, 33).pointer).toEqual(s.pointer);
  });
  it("allows therapist-gated progression across all nine stages", () => {
    let s = createState("test-session");
    for (const stage of STAGES) {
      s = action(s, "start");
      for (const p of stage.pieces) {
        s = input(s, project(p.source), 33, true);
        s = input(s, project(p.target), 33);
      }
      s = action(s, "next");
    }
    expect(s.completed).toHaveLength(9);
    expect(s.events).toHaveLength(
      STAGES.reduce((sum, t) => sum + t.pieces.length, 0),
    );
    expect(s.status).toBe("ended");
  });
});
