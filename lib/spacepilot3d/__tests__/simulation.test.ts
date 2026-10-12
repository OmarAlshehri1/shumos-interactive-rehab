import { describe, expect, it } from "vitest";
import { FLIGHT_HALF_HEIGHT, FLIGHT_HALF_WIDTH, OBJECT_SPEED, PrototypeSimulation, RECYCLE_Z } from "../simulation";

const center = { x: 0.5, y: 0.5 };

describe("isolated Space Pilot 3D demonstration", () => {
  it("waits for Start and maps normalized coordinates directly into bounded flight space", () => {
    const sim = new PrototypeSimulation();
    sim.step(0.1, { x: 1, y: 0 });
    expect(sim.ship.x).toBe(0);
    sim.start();
    sim.step(0.1, { x: 3, y: -2 });
    expect(sim.ship.x).toBe(FLIGHT_HALF_WIDTH);
    expect(sim.ship.y).toBe(FLIGHT_HALF_HEIGHT);
    sim.step(0.1, { x: 0, y: 1 });
    expect(sim.ship.x).toBe(-FLIGHT_HALF_WIDTH);
    expect(sim.ship.y).toBe(-FLIGHT_HALF_HEIGHT);
    sim.step(0.1, { x: NaN, y: Infinity });
    expect(sim.ship.x).toBe(0);
    expect(sim.ship.y).toBe(0);
  });

  it("advances objects by elapsed time independently of frame rate", () => {
    const a = new PrototypeSimulation(), b = new PrototypeSimulation();
    a.start(); b.start();
    const initialZ = a.objects[0].z;
    for (let i = 0; i < 30; i++) a.step(1 / 30, center);
    for (let i = 0; i < 144; i++) b.step(1 / 144, center);
    expect(a.objects[0].z).toBeCloseTo(initialZ + OBJECT_SPEED, 9);
    expect(a.objects[0].z).toBeCloseTo(b.objects[0].z, 9);
  });

  it("freezes input, motion and time while paused, then resumes without resetting", () => {
    const sim = new PrototypeSimulation(); sim.start(); sim.step(0.1, { x: 0.7, y: 0.4 }); sim.pause();
    const snapshot = JSON.stringify(sim);
    sim.step(0.2, { x: 0, y: 1 });
    expect(JSON.stringify(sim)).toBe(snapshot);
    sim.resume(); sim.step(0.1, { x: 0.7, y: 0.4 });
    expect(sim.elapsedSeconds).toBeCloseTo(0.2);
    expect(sim.ship.x).toBeCloseTo(1.92);
  });

  it("recycles passing objects and restarts the deterministic scene", () => {
    const sim = new PrototypeSimulation();
    const initialObjects = structuredClone(sim.objects);
    sim.start();
    for (let i = 0; i < 150; i++) sim.step(0.1, { x: 1, y: 0 });
    expect(sim.objects.every((object) => object.z <= RECYCLE_Z)).toBe(true);
    expect(sim.objects[0].z).toBeLessThan(initialObjects[0].z + 10);
    sim.restart();
    expect(sim.objects).toEqual(initialObjects);
    expect(sim.ship).toEqual({ x: 0, y: 0, bank: 0 });
    expect(sim.elapsedSeconds).toBe(0);
    expect(sim.status).toBe("running");
  });

  it("ignores invalid timing and long suspension gaps", () => {
    const sim = new PrototypeSimulation(); sim.start();
    const snapshot = JSON.stringify(sim);
    for (const delta of [0, -1, NaN, Infinity, 10]) sim.step(delta, center);
    expect(JSON.stringify(sim)).toBe(snapshot);
  });
});
