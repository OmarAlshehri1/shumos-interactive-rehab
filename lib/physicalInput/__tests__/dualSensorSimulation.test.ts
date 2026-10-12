import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContinuousMotionController } from "../ContinuousMotionController";
import { PhysicalInputManager } from "../PhysicalInputManager";
import { NullSemanticDetector, ThresholdTestDetector } from "../SemanticDetector";
import { SimulatedInputSource } from "../SimulatedInputSource";
import { createCalibratedProfile, createUncalibratedProfile } from "../calibrationProfile";
import { InMemoryRoleAssignmentStore, LocalStorageRoleAssignmentStore, assignRole, resolveRole } from "../roleAssignment";
import { ConnectionState, PhysicalRole, type MotionSample } from "../types";

/**
 * Tonight's dual-sensor brief, section 10: "simulate two sensors" (scenarios
 * A-M), entirely offline — no hardware required, both physical WT901BLECL
 * sensors may be off. Every scenario below exercises the exact classes a
 * real dual-hand SensorRuntimeProvider mount instantiates (see
 * useSensorHandRuntime.ts): one PhysicalInputManager, two independent
 * InputSource/ContinuousMotionController/CalibrationProfile instances (one
 * per role) — never a shared or global state that could leak between hands.
 */

function sample(overrides: Partial<MotionSample> = {}): MotionSample {
  return {
    timestampMs: 0,
    accelerationG: [0, 0, 1],
    gyroscopeDps: [0, 0, 0],
    anglesDeg: [0, 0, 0],
    ...overrides,
  };
}

function fastSample(timestampMs: number): MotionSample {
  return sample({ timestampMs, gyroscopeDps: [0, 80, 0] }); // exceeds ThresholdTestDetector's default 40dps
}

function freshController(): ContinuousMotionController {
  return new ContinuousMotionController({ smoothing: 0, deadZoneDeg: 0 });
}

async function connectedSource(deviceId: string): Promise<SimulatedInputSource> {
  const source = new SimulatedInputSource(deviceId);
  await source.connect();
  return source;
}

/** Sets up both roles on one shared manager, mirroring real dual-hand wiring. */
async function setupDualHand() {
  const manager = new PhysicalInputManager();
  const rightSource = await connectedSource("dev-right");
  const leftSource = await connectedSource("dev-left");
  const rightController = freshController();
  const leftController = freshController();

  manager.assignRole(
    PhysicalRole.RIGHT_HAND,
    rightSource,
    new ThresholdTestDetector(PhysicalRole.RIGHT_HAND, "RIGHT_HAND_RAISE"),
    createCalibratedProfile(PhysicalRole.RIGHT_HAND, "dev-right", null),
  );
  manager.assignRole(
    PhysicalRole.LEFT_HAND,
    leftSource,
    new ThresholdTestDetector(PhysicalRole.LEFT_HAND, "LEFT_HAND_RAISE"),
    createCalibratedProfile(PhysicalRole.LEFT_HAND, "dev-left", null),
  );
  manager.attachContinuousController(PhysicalRole.RIGHT_HAND, rightController);
  manager.attachContinuousController(PhysicalRole.LEFT_HAND, leftController);

  const pointers: Array<{ role: PhysicalRole; pointer: unknown }> = [];
  manager.onPointerChanged((role, pointer) => pointers.push({ role, pointer }));
  const events: Array<{ role: PhysicalRole; gesture: string }> = [];
  manager.onEvent((event) => events.push({ role: event.role, gesture: event.gesture }));
  const observedSamples: Array<{ role: PhysicalRole }> = [];
  manager.onSampleObserved((role) => observedSamples.push({ role }));

  // Establish a center for each hand's pointer before movement scenarios.
  rightSource.pushOne(sample({ anglesDeg: [0, 0, 0] }));
  rightController.recenter();
  leftSource.pushOne(sample({ anglesDeg: [0, 0, 0] }));
  leftController.recenter();
  pointers.length = 0; // recenter itself doesn't publish a pointer change - clear anyway for a clean slate

  return { manager, rightSource, leftSource, rightController, leftController, pointers, events, observedSamples };
}

describe("Dual-sensor simulation — A/B: one hand only", () => {
  it("A: RIGHT_HAND only - connects, streams, and emits with no LEFT_HAND assignment at all", async () => {
    const manager = new PhysicalInputManager();
    const right = await connectedSource("dev-right");
    manager.assignRole(PhysicalRole.RIGHT_HAND, right, new ThresholdTestDetector(PhysicalRole.RIGHT_HAND, "RIGHT_HAND_RAISE"), createCalibratedProfile(PhysicalRole.RIGHT_HAND, "dev-right", null));

    const events: unknown[] = [];
    manager.onEvent((event) => events.push(event));
    right.pushOne(fastSample(1));

    expect(events).toHaveLength(1);
    expect(() => manager.connectionStateOf(PhysicalRole.LEFT_HAND)).toThrow(); // never assigned - no phantom LEFT state
  });

  it("B: LEFT_HAND only - symmetric to A, with no RIGHT_HAND assignment at all", async () => {
    const manager = new PhysicalInputManager();
    const left = await connectedSource("dev-left");
    manager.assignRole(PhysicalRole.LEFT_HAND, left, new ThresholdTestDetector(PhysicalRole.LEFT_HAND, "LEFT_HAND_RAISE"), createCalibratedProfile(PhysicalRole.LEFT_HAND, "dev-left", null));

    const events: unknown[] = [];
    manager.onEvent((event) => events.push(event));
    left.pushOne(fastSample(1));

    expect(events).toHaveLength(1);
    expect(() => manager.connectionStateOf(PhysicalRole.RIGHT_HAND)).toThrow();
  });
});

describe("Dual-sensor simulation — C: both simultaneously, complete state isolation", () => {
  it("routes each role's events/samples/pointers to that role only, never crossing", async () => {
    const { rightSource, leftSource, events, observedSamples } = await setupDualHand();

    rightSource.pushOne(fastSample(10));
    expect(events).toEqual([{ role: PhysicalRole.RIGHT_HAND, gesture: "RIGHT_HAND_RAISE" }]);

    leftSource.pushOne(fastSample(11));
    expect(events).toEqual([
      { role: PhysicalRole.RIGHT_HAND, gesture: "RIGHT_HAND_RAISE" },
      { role: PhysicalRole.LEFT_HAND, gesture: "LEFT_HAND_RAISE" },
    ]);
    expect(observedSamples.filter((s) => s.role === PhysicalRole.RIGHT_HAND)).toHaveLength(2); // recenter sample + fastSample
    expect(observedSamples.filter((s) => s.role === PhysicalRole.LEFT_HAND)).toHaveLength(2);
  });
});

describe("Dual-sensor simulation — D/E: one disconnects, the other continues", () => {
  it("D: RIGHT_HAND disconnects - RIGHT pointer/contact disappears safely, LEFT_HAND is completely unaffected", async () => {
    const { manager, rightSource, leftSource, leftController, pointers, events } = await setupDualHand();

    rightSource.simulateUnexpectedDrop();
    expect(manager.connectionStateOf(PhysicalRole.RIGHT_HAND)).toBe(ConnectionState.DISCONNECTED);
    expect(pointers).toEqual([{ role: PhysicalRole.RIGHT_HAND, pointer: null }]);

    // LEFT_HAND keeps working exactly as if nothing happened.
    leftSource.pushOne(fastSample(20));
    expect(events).toEqual([{ role: PhysicalRole.LEFT_HAND, gesture: "LEFT_HAND_RAISE" }]);
    expect(leftController.currentPointer).not.toBeNull();
    expect(manager.connectionStateOf(PhysicalRole.LEFT_HAND)).toBe(ConnectionState.CONNECTED);
  });

  it("E: LEFT_HAND disconnects - LEFT disappears, RIGHT_HAND is completely unaffected", async () => {
    const { manager, rightSource, leftSource, rightController, pointers, events } = await setupDualHand();

    leftSource.simulateUnexpectedDrop();
    expect(manager.connectionStateOf(PhysicalRole.LEFT_HAND)).toBe(ConnectionState.DISCONNECTED);
    expect(pointers).toEqual([{ role: PhysicalRole.LEFT_HAND, pointer: null }]);

    rightSource.pushOne(fastSample(20));
    expect(events).toEqual([{ role: PhysicalRole.RIGHT_HAND, gesture: "RIGHT_HAND_RAISE" }]);
    expect(rightController.currentPointer).not.toBeNull();
    expect(manager.connectionStateOf(PhysicalRole.RIGHT_HAND)).toBe(ConnectionState.CONNECTED);
  });
});

describe("Dual-sensor simulation — F/G: reconnect restores the correct, independent role", () => {
  it("F: RIGHT_HAND reconnects after a short drop - resumes emitting under its own profile, LEFT_HAND never paused", async () => {
    let clock = 0;
    const manager = new PhysicalInputManager({ recalibrationRequiredAfterDisconnectMs: 3000, now: () => clock });
    const rightSource = await connectedSource("dev-right");
    const leftSource = await connectedSource("dev-left");
    manager.assignRole(PhysicalRole.RIGHT_HAND, rightSource, new ThresholdTestDetector(PhysicalRole.RIGHT_HAND, "RIGHT_HAND_RAISE"), createCalibratedProfile(PhysicalRole.RIGHT_HAND, "dev-right", null));
    manager.assignRole(PhysicalRole.LEFT_HAND, leftSource, new ThresholdTestDetector(PhysicalRole.LEFT_HAND, "LEFT_HAND_RAISE"), createCalibratedProfile(PhysicalRole.LEFT_HAND, "dev-left", null));

    // LEFT_HAND stays live and working the entire time RIGHT_HAND is down.
    leftSource.pushOne(fastSample(1));

    rightSource.simulateUnexpectedDrop();
    clock += 500; // under the 3000ms recalibration threshold
    await rightSource.connect();
    expect(manager.calibrationStatusOf(PhysicalRole.RIGHT_HAND)).toBe("CALIBRATED");

    const events: unknown[] = [];
    manager.onEvent((event) => events.push(event));
    rightSource.pushOne(fastSample(2));
    leftSource.pushOne(fastSample(3));
    expect(events).toEqual([
      { role: PhysicalRole.RIGHT_HAND, gesture: "RIGHT_HAND_RAISE", timestampMs: 2, detail: undefined },
      { role: PhysicalRole.LEFT_HAND, gesture: "LEFT_HAND_RAISE", timestampMs: 3, detail: undefined },
    ]);
  });

  it("G: LEFT_HAND reconnects after a long drop - requires its OWN recalibration, independent of RIGHT_HAND's own status", async () => {
    let clock = 0;
    const manager = new PhysicalInputManager({ recalibrationRequiredAfterDisconnectMs: 3000, now: () => clock });
    const rightSource = await connectedSource("dev-right");
    const leftSource = await connectedSource("dev-left");
    manager.assignRole(PhysicalRole.RIGHT_HAND, rightSource, new ThresholdTestDetector(PhysicalRole.RIGHT_HAND, "RIGHT_HAND_RAISE"), createCalibratedProfile(PhysicalRole.RIGHT_HAND, "dev-right", null));
    manager.assignRole(PhysicalRole.LEFT_HAND, leftSource, new ThresholdTestDetector(PhysicalRole.LEFT_HAND, "LEFT_HAND_RAISE"), createCalibratedProfile(PhysicalRole.LEFT_HAND, "dev-left", null));

    leftSource.simulateUnexpectedDrop();
    clock += 5000; // over the threshold
    await leftSource.connect();

    expect(manager.calibrationStatusOf(PhysicalRole.LEFT_HAND)).toBe("NEEDS_RECALIBRATION");
    expect(manager.calibrationStatusOf(PhysicalRole.RIGHT_HAND)).toBe("CALIBRATED"); // untouched by LEFT's outage

    const events: unknown[] = [];
    manager.onEvent((event) => events.push(event));
    leftSource.pushOne(fastSample(1));
    expect(events).toEqual([]); // LEFT blocked pending recalibration

    rightSource.pushOne(fastSample(2));
    expect(events).toHaveLength(1); // RIGHT entirely unaffected

    manager.recalibrate(PhysicalRole.LEFT_HAND, createCalibratedProfile(PhysicalRole.LEFT_HAND, "dev-left", null));
    leftSource.pushOne(fastSample(3));
    expect(events).toHaveLength(2);
  });
});

describe("Dual-sensor simulation — H/I: concurrent movement patterns", () => {
  it("H: both hands moving simultaneously produce independent, non-interfering pointer streams", async () => {
    const { rightSource, leftSource, rightController, leftController } = await setupDualHand();

    // The controller integrates GYROSCOPE RATE (not absolute anglesDeg) into aim position - see
    // ContinuousMotionController.observe()'s "SATURATING INTEGRATOR" section. gyroscopeDps[1] is
    // pitch-rate, which DEFAULT_CONTINUOUS_MOTION_CONFIG's yAxis="pitch" maps to vertical position.
    rightSource.pushOne(sample({ timestampMs: 10, gyroscopeDps: [0, 200, 0] }));
    leftSource.pushOne(sample({ timestampMs: 11, gyroscopeDps: [0, -200, 0] }));
    rightSource.pushOne(sample({ timestampMs: 20, gyroscopeDps: [0, 200, 0] }));
    leftSource.pushOne(sample({ timestampMs: 21, gyroscopeDps: [0, -200, 0] }));

    expect(rightController.currentPointer).not.toBeNull();
    expect(leftController.currentPointer).not.toBeNull();
    // Opposite gyro rate on each side must not converge to the same pointer position.
    expect(rightController.currentPointer!.pointer.y).not.toBeCloseTo(leftController.currentPointer!.pointer.y, 3);
  });

  it("I: one hand held still while the other moves - the held hand's pointer stays put", async () => {
    const { rightSource, leftSource, rightController, leftController } = await setupDualHand();
    const heldPositionBefore = rightController.currentPointer!.pointer;

    // RIGHT_HAND holds at zero rate (true stillness); only LEFT_HAND's gyro reports motion.
    rightSource.pushOne(sample({ timestampMs: 10, gyroscopeDps: [0, 0, 0] }));
    leftSource.pushOne(sample({ timestampMs: 11, gyroscopeDps: [0, 200, 0] }));
    rightSource.pushOne(sample({ timestampMs: 20, gyroscopeDps: [0, 0, 0] }));
    leftSource.pushOne(sample({ timestampMs: 21, gyroscopeDps: [0, 200, 0] }));

    expect(rightController.currentPointer!.pointer).toEqual(heldPositionBefore); // unmoved
    expect(leftController.currentPointer!.pointer).not.toEqual(heldPositionBefore); // moved
  });
});

describe("Dual-sensor simulation — J/K: timing and stale-packet safety", () => {
  it("J: independent, jittered sample timing on each hand never misroutes a sample to the other role", async () => {
    const { rightSource, leftSource, observedSamples } = await setupDualHand();
    observedSamples.length = 0;

    // RIGHT_HAND streams a steady ~50Hz-like cadence; LEFT_HAND streams irregular, jittery timestamps
    // interleaved with it - representative of two independent BLE links with no shared clock.
    const rightTimestamps = [100, 120, 140, 160, 180];
    const leftTimestamps = [103, 109, 155, 156, 240];
    for (let i = 0; i < 5; i++) {
      rightSource.pushOne(sample({ timestampMs: rightTimestamps[i] }));
      leftSource.pushOne(sample({ timestampMs: leftTimestamps[i] }));
    }

    expect(observedSamples.filter((s) => s.role === PhysicalRole.RIGHT_HAND)).toHaveLength(5);
    expect(observedSamples.filter((s) => s.role === PhysicalRole.LEFT_HAND)).toHaveLength(5);
  });

  it("K: a stale packet arriving after its role was unassigned is dropped, never delivered under either role", async () => {
    const { manager, rightSource, leftSource, events } = await setupDualHand();

    await manager.unassignRole(PhysicalRole.RIGHT_HAND);
    rightSource.pushOne(fastSample(999)); // "stale" - source object still exists, but its role binding is gone

    expect(events).toEqual([]); // dropped silently, not misrouted to LEFT_HAND or anywhere else

    // LEFT_HAND is entirely unaffected by RIGHT_HAND's unassignment.
    leftSource.pushOne(fastSample(1000));
    expect(events).toEqual([{ role: PhysicalRole.LEFT_HAND, gesture: "LEFT_HAND_RAISE" }]);
  });
});

describe("Dual-sensor simulation — L: role assignment persistence", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("L: RIGHT_HAND/LEFT_HAND assignments survive a fresh store instance (simulated reload) and drive real manager wiring", async () => {
    // First "session": two sensors get discovered and assigned.
    new LocalStorageBackedRoleFlow().assign("mac-aa", PhysicalRole.RIGHT_HAND).assign("mac-bb", PhysicalRole.LEFT_HAND);

    // Later "session" (fresh store instance, e.g. after a page reload): resolve roles from persisted state,
    // then wire up a real dual-hand PhysicalInputManager using exactly those resolved roles.
    const reopened = new LocalStorageRoleAssignmentStore();
    const rightRole = resolveRole(reopened, "mac-aa");
    const leftRole = resolveRole(reopened, "mac-bb");
    expect(rightRole).toBe(PhysicalRole.RIGHT_HAND);
    expect(leftRole).toBe(PhysicalRole.LEFT_HAND);

    const manager = new PhysicalInputManager();
    const rightSource = await connectedSource("mac-aa");
    const leftSource = await connectedSource("mac-bb");
    manager.assignRole(rightRole!, rightSource, new NullSemanticDetector(), createUncalibratedProfile(rightRole!, "mac-aa"));
    manager.assignRole(leftRole!, leftSource, new NullSemanticDetector(), createUncalibratedProfile(leftRole!, "mac-bb"));

    expect(manager.connectionStateOf(PhysicalRole.RIGHT_HAND)).toBe(ConnectionState.CONNECTED);
    expect(manager.connectionStateOf(PhysicalRole.LEFT_HAND)).toBe(ConnectionState.CONNECTED);
  });
});

describe("Dual-sensor simulation — M: duplicate role/device assignment is refused end-to-end", () => {
  it("M1: the SAME physical device id can never be accepted for two different roles via assignRole", () => {
    const store = new InMemoryRoleAssignmentStore();
    expect(assignRole(store, "one-physical-sensor", PhysicalRole.RIGHT_HAND)).toBeNull();

    const conflict = assignRole(store, "one-physical-sensor", PhysicalRole.LEFT_HAND);
    expect(conflict).toEqual({ requestedRole: PhysicalRole.LEFT_HAND, existingRoleOfDevice: PhysicalRole.RIGHT_HAND });
    // The device's role is unchanged - it never silently became LEFT_HAND.
    expect(resolveRole(store, "one-physical-sensor")).toBe(PhysicalRole.RIGHT_HAND);
  });

  it("M2: a second physical device cannot steal a role another device already owns", () => {
    const store = new InMemoryRoleAssignmentStore();
    assignRole(store, "sensor-a", PhysicalRole.RIGHT_HAND);
    const conflict = assignRole(store, "sensor-b", PhysicalRole.RIGHT_HAND);
    expect(conflict).toEqual({ requestedRole: PhysicalRole.RIGHT_HAND, currentOwnerDeviceId: "sensor-a" });
  });

  it("M3: an explicit therapist 'replace' flow (clear then reassign) is the only way to change a role", () => {
    const store = new InMemoryRoleAssignmentStore();
    assignRole(store, "old-right-sensor", PhysicalRole.RIGHT_HAND);
    store.clear("old-right-sensor");
    expect(assignRole(store, "new-right-sensor", PhysicalRole.RIGHT_HAND)).toBeNull();
    expect(resolveRole(store, "old-right-sensor")).toBeNull();
    expect(resolveRole(store, "new-right-sensor")).toBe(PhysicalRole.RIGHT_HAND);
  });
});

/** Tiny in-test helper mirroring the "discover -> assignRole -> persist" flow a real role-assignment UI performs against LocalStorageRoleAssignmentStore, for scenario L only. */
class LocalStorageBackedRoleFlow {
  private readonly store = new LocalStorageRoleAssignmentStore();

  assign(deviceId: string, role: PhysicalRole): this {
    const conflict = assignRole(this.store, deviceId, role);
    if (conflict) throw new Error(`unexpected conflict in test setup: ${JSON.stringify(conflict)}`);
    return this;
  }
}
