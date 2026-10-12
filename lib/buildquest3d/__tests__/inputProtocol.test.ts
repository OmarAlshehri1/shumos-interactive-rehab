import { describe, it, expect } from "vitest";
import {
  BuildQuestSensor,
  controllerInput,
  keyboardInput,
} from "../sensorInput";
import { action, createState, guard, input } from "../gameplay";
import { recover, replicaAccept, validInput, validState } from "../protocol";
import { project, STAGES } from "../stages";
describe("RIGHT_HAND final pointer safety", () => {
  it("requires pickup, rejects stale/other-hand/malformed/reordered input, holds on recenter", () => {
    let now = 1000;
    const sensor = new BuildQuestSensor(() => now);
    sensor.rearm({ x: 0.5, y: 0.5 });
    const packet = (seq: number, x = 0.5, visible = true) => ({
      role: "RIGHT_HAND",
      x,
      y: 0.5,
      visible,
      seq,
      sentAtMs: now,
    });
    expect(sensor.accept({ ...packet(1), role: "LEFT_HAND" })).toBe(false);
    expect(sensor.accept({ ...packet(1), x: NaN })).toBe(false);
    expect(sensor.accept(packet(1, 0.8))).toBe(true);
    expect(sensor.sample()).toBeNull();
    expect(sensor.status).toBe("align");
    now++;
    sensor.accept(packet(2));
    expect(sensor.sample()).toEqual({ x: 0.5, y: 0.5 });
    expect(sensor.accept(packet(1))).toBe(false);
    now++;
    sensor.accept(packet(3, 0.9));
    expect(sensor.sample()).toBeNull();
    expect(sensor.status).toBe("align");
    now++;
    sensor.accept(packet(4));
    expect(sensor.sample()).not.toBeNull();
    now += 251;
    expect(sensor.sample()).toBeNull();
    expect(sensor.status).toBe("stale");
    expect(sensor.accept({ ...packet(5), sentAtMs: now - 300 })).toBe(false);
    sensor.accept(packet(1, 0.8));
    expect(sensor.sample()).toBeNull();
    now++;
    sensor.accept(packet(2));
    expect(sensor.sample()).not.toBeNull();
    now++;
    sensor.accept(packet(3, 0.5, false));
    expect(sensor.sample()).toBeNull();
    expect(sensor.status).toBe("lost");
  });
  it("rejects pre-resume packets without changing calibration", () => {
    let now = 100;
    const sensor = new BuildQuestSensor(() => now);
    sensor.accept({
      role: "RIGHT_HAND",
      x: 0.5,
      y: 0.5,
      visible: true,
      seq: 1,
      sentAtMs: 100,
    });
    now = 110;
    sensor.rearm({ x: 0.5, y: 0.5 });
    expect(
      sensor.accept({
        role: "RIGHT_HAND",
        x: 0.5,
        y: 0.5,
        visible: true,
        seq: 2,
        sentAtMs: 100,
      }),
    ).toBe(false);
  });
  it("holds a selected piece through loss and only resumes after safe pickup", () => {
    let now = 1000;
    const sensor = new BuildQuestSensor(() => now);
    let s = action(createState("test-session"), "start");
    s = input(s, project(STAGES[0].pieces[0].source), 33, true);
    sensor.rearm(s.pointer);
    now++;
    sensor.accept({
      role: "RIGHT_HAND",
      ...s.pointer,
      visible: true,
      seq: 1,
      sentAtMs: now,
    });
    expect(sensor.sample()).not.toBeNull();
    now += 300;
    s = input(s, sensor.sample(), 33);
    expect(s.selected).toBe("first-shapes:square");
    expect(s.events).toHaveLength(0);
    expect(s.inputReady).toBe(false);
  });
});
describe("simulation-compatible adapters", () => {
  it("moves bounded keyboard and controller pointers with a dead zone", () => {
    expect(controllerInput({ x: 0.5, y: 0.5 }, [0.1, 0], 0.1)).toEqual({
      x: 0.5,
      y: 0.5,
    });
    expect(controllerInput({ x: 0.95, y: 0.89 }, [1, 1], 0.1)).toEqual({
      x: 0.96,
      y: 0.9,
    });
    const keyboard = keyboardInput(
      { x: 0.5, y: 0.5 },
      new Set(["ArrowRight", "ArrowUp"]),
      0.1,
    );
    expect(keyboard.x).toBeCloseTo(0.54);
    expect(keyboard.y).toBeCloseTo(0.46);
    expect(controllerInput({ x: 0.5, y: 0.5 }, [NaN, Infinity], 0.1)).toEqual({
      x: 0.5,
      y: 0.5,
    });
  });
  it("uses button selection and safe release through the same engine", () => {
    let s = action(createState("test-session"), "start");
    s = input(s, project(STAGES[0].pieces[0].source), 33, true);
    expect(s.selected).toBe("first-shapes:square");
    s = input(s, { x: 0.5, y: 0.7 }, 33, true);
    expect(s.selected).toBeNull();
    expect(s.events).toHaveLength(0);
  });
});
describe("guarded local authority and replica", () => {
  it("rejects stale session/run/stage/revision and duplicate input", () => {
    const s = action(createState("test-session"), "start"),
      seen = new Map<string, number>();
    const p = {
      type: "input",
      guard: guard(s),
      client: "display-client",
      seq: 1,
      sentAt: 1000,
      x: 0.5,
      y: 0.5,
      activate: true,
    };
    expect(validInput(s, p, 1000, seen)).toBe(true);
    expect(validInput(s, p, 1000, seen)).toBe(false);
    for (const patch of [
      { run: 9 },
      { session: "other-session" },
      { stage: 8 },
      { revision: s.revision + 1 },
      { revision: -99 },
    ])
      expect(
        validInput(
          s,
          { ...p, seq: 2, guard: { ...p.guard, ...patch } },
          1000,
          seen,
        ),
      ).toBe(false);
    expect(validInput(s, { ...p, seq: 2, sentAt: 500 }, 1000, seen)).toBe(
      false,
    );
  });
  it("validates snapshots and rejects delayed state on reload", () => {
    let s = action(createState("test-session"), "start");
    expect(validState(s, s.session)).toBe(true);
    expect(validState({ ...s, placed: ["fake"] }, s.session)).toBe(false);
    expect(validState({ ...s, events: [{}] }, s.session)).toBe(false);
    const reloaded = recover(s, s.session)!;
    expect(reloaded.run).toBe(s.run + 1);
    expect(reloaded.status).toBe("paused");
    expect(replicaAccept(reloaded, s, s.session)).toBe(false);
    expect(replicaAccept(s, reloaded, s.session)).toBe(true);
    s = input(s, project(STAGES[0].pieces[0].source), 33, true);
    expect(
      replicaAccept(s, { ...s, revision: s.revision - 1 }, s.session),
    ).toBe(false);
    expect(recover({}, s.session)).toBeNull();
  });
  it("retains only accepted progress after recovery and requires therapist resume", () => {
    let s = action(createState("test-session"), "start");
    s = input(s, project(STAGES[0].pieces[0].source), 33, true);
    s = input(s, project(STAGES[0].pieces[0].target), 33);
    const r = recover(s, s.session)!;
    expect(r.placed).toEqual(["first-shapes:square"]);
    expect(r.events).toHaveLength(1);
    expect(r.inputReady).toBe(false);
    expect(input(r, project(STAGES[0].pieces[1].source), 100, true)).toBe(r);
  });
});
