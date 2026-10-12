import { describe, it, expect } from "vitest";
import { action, createState, guard, input, place } from "../gameplay";
import { STAGES, project } from "../stages";
describe("Build Quest foundation", () => {
  it("picks and snaps real shapes, ignoring wrong placement and duplicates", () => {
    let s = action(createState("test-session"), "start");
    const piece = STAGES[0].pieces[0];
    s = input(s, project(piece.source), 33, true);
    expect(s.selected).toBe(piece.id);
    s = input(s, { x: 0.9, y: 0.7 }, 33);
    expect(s.placed).toHaveLength(0);
    s = input(s, project(piece.target), 33);
    expect(s.placed).toEqual([piece.id]);
    const duplicate = place(s, piece.id, s.events[0].id, guard(s));
    expect(duplicate).toBe(s);
  });
  it("holds safely on pause and missing input", () => {
    let s = action(createState("test-session"), "start");
    s = input(s, project(STAGES[0].pieces[0].source), 33, true);
    const pos = s.pointer;
    s = input(s, null, 33);
    expect(s.selected).toBe("first-shapes:square");
    expect(s.pointer).toEqual(pos);
    s = action(s, "pause");
    expect(input(s, project(STAGES[0].pieces[0].target), 33)).toBe(s);
  });
});
