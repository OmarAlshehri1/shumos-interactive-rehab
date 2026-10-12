import { describe, expect, it } from "vitest";
import { PhysicalInputManager } from "../PhysicalInputManager";
import { NullSemanticDetector, ThresholdTestDetector } from "../SemanticDetector";
import { SimulatedInputSource } from "../SimulatedInputSource";
import { createCalibratedProfile, createUncalibratedProfile } from "../calibrationProfile";
import { ConnectionState, PhysicalRole, type MotionSample } from "../types";
import { ContinuousMotionController } from "../ContinuousMotionController";

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

async function connected(deviceId: string): Promise<SimulatedInputSource> {
  const source = new SimulatedInputSource(deviceId);
  await source.connect();
  return source;
}

describe("PhysicalInputManager - role isolation", () => {
  it("never lets one role's samples trigger another role's detector", async () => {
    const manager = new PhysicalInputManager();
    const rightHand = await connected("dev-right");
    const leftHand = await connected("dev-left");

    manager.assignRole(
      PhysicalRole.RIGHT_HAND,
      rightHand,
      new ThresholdTestDetector(PhysicalRole.RIGHT_HAND, "RIGHT_HAND_RAISE"),
      createCalibratedProfile(PhysicalRole.RIGHT_HAND, "dev-right", null),
    );
    manager.assignRole(
      PhysicalRole.LEFT_HAND,
      leftHand,
      new ThresholdTestDetector(PhysicalRole.LEFT_HAND, "LEFT_HAND_RAISE"),
      createCalibratedProfile(PhysicalRole.LEFT_HAND, "dev-left", null),
    );

    const events: string[] = [];
    manager.onEvent((event) => events.push(`${event.role}:${event.gesture}`));

    rightHand.pushOne(fastSample(1));
    expect(events).toEqual(["RIGHT_HAND:RIGHT_HAND_RAISE"]);

    leftHand.pushOne(fastSample(2));
    expect(events).toEqual(["RIGHT_HAND:RIGHT_HAND_RAISE", "LEFT_HAND:LEFT_HAND_RAISE"]);
  });

  it("routes each role's raw samples only to that role's onSampleObserved tag", async () => {
    const manager = new PhysicalInputManager();
    const rightHand = await connected("dev-right");
    manager.assignRole(
      PhysicalRole.RIGHT_HAND,
      rightHand,
      new NullSemanticDetector(),
      createCalibratedProfile(PhysicalRole.RIGHT_HAND, "dev-right", null),
    );

    const seen: PhysicalRole[] = [];
    manager.onSampleObserved((role) => seen.push(role));
    rightHand.pushOne(sample());
    expect(seen).toEqual([PhysicalRole.RIGHT_HAND]);
  });

  it("throws (rather than silently rebinding) when a role is assigned twice", async () => {
    const manager = new PhysicalInputManager();
    const source = await connected("dev-1");
    manager.assignRole(
      PhysicalRole.RIGHT_HAND,
      source,
      new NullSemanticDetector(),
      createCalibratedProfile(PhysicalRole.RIGHT_HAND, "dev-1", null),
    );
    expect(() =>
      manager.assignRole(
        PhysicalRole.RIGHT_HAND,
        source,
        new NullSemanticDetector(),
        createCalibratedProfile(PhysicalRole.RIGHT_HAND, "dev-1", null),
      ),
    ).toThrow();
  });
});

describe("PhysicalInputManager - calibration gating", () => {
  it("emits nothing for an uncalibrated (or corrupted/missing-calibration) role", async () => {
    const manager = new PhysicalInputManager();
    const source = await connected("dev-1");
    manager.assignRole(
      PhysicalRole.RIGHT_HAND,
      source,
      new ThresholdTestDetector(PhysicalRole.RIGHT_HAND, "RIGHT_HAND_RAISE"),
      createUncalibratedProfile(PhysicalRole.RIGHT_HAND, "dev-1"),
    );
    const events: unknown[] = [];
    manager.onEvent((event) => events.push(event));
    source.pushOne(fastSample(1));
    expect(events).toEqual([]);
  });

  it("resumes emitting once recalibrate() supplies a CALIBRATED profile", async () => {
    const manager = new PhysicalInputManager();
    const source = await connected("dev-1");
    manager.assignRole(
      PhysicalRole.RIGHT_HAND,
      source,
      new ThresholdTestDetector(PhysicalRole.RIGHT_HAND, "RIGHT_HAND_RAISE"),
      createUncalibratedProfile(PhysicalRole.RIGHT_HAND, "dev-1"),
    );
    manager.recalibrate(PhysicalRole.RIGHT_HAND, createCalibratedProfile(PhysicalRole.RIGHT_HAND, "dev-1", null));

    const events: unknown[] = [];
    manager.onEvent((event) => events.push(event));
    source.pushOne(fastSample(1));
    expect(events).toHaveLength(1);
  });
});

describe("PhysicalInputManager - disconnect safety", () => {
  it("invalidates continuous pointer output on disconnect and emits no phantom pointer", async () => {
    const manager = new PhysicalInputManager();
    const source = await connected("dev-1");
    const controller = new ContinuousMotionController({ smoothing: 0, deadZoneDeg: 0 });
    manager.assignRole(
      PhysicalRole.RIGHT_HAND,
      source,
      new NullSemanticDetector(),
      createUncalibratedProfile(PhysicalRole.RIGHT_HAND, "dev-1"),
    );
    manager.attachContinuousController(PhysicalRole.RIGHT_HAND, controller);
    const pointers: unknown[] = [];
    manager.onPointerChanged((_role, pointer) => pointers.push(pointer));

    source.pushOne(sample({ anglesDeg: [0, 0, 0] }));
    controller.recenter();
    source.pushOne(sample({ anglesDeg: [5, 8, 10] }));
    expect(pointers).toHaveLength(1);

    source.simulateUnexpectedDrop();
    expect(pointers).toHaveLength(2);
    expect(pointers.at(-1)).toBeNull();
    expect(controller.currentPointer).toBeNull();
  });

  it("cancels the active detector state and reports DISCONNECTED, emitting no phantom event", async () => {
    const manager = new PhysicalInputManager();
    const source = await connected("dev-1");
    manager.assignRole(
      PhysicalRole.RIGHT_HAND,
      source,
      new ThresholdTestDetector(PhysicalRole.RIGHT_HAND, "RIGHT_HAND_RAISE"),
      createCalibratedProfile(PhysicalRole.RIGHT_HAND, "dev-1", null),
    );
    const events: unknown[] = [];
    manager.onEvent((event) => events.push(event));

    source.simulateUnexpectedDrop();
    expect(manager.connectionStateOf(PhysicalRole.RIGHT_HAND)).toBe(ConnectionState.DISCONNECTED);

    // A disconnected SimulatedInputSource refuses to emit at all (see
    // SimulatedInputSource.pushOne), which already covers "no phantom event
    // after disconnect" for this adapter - this assertion additionally
    // confirms the manager itself produced zero events across the drop.
    expect(events).toEqual([]);
  });

  it("does not require recalibration after a short disconnect", async () => {
    let clock = 0;
    const manager = new PhysicalInputManager({ recalibrationRequiredAfterDisconnectMs: 3000, now: () => clock });
    const source = await connected("dev-1");
    manager.assignRole(
      PhysicalRole.RIGHT_HAND,
      source,
      new ThresholdTestDetector(PhysicalRole.RIGHT_HAND, "RIGHT_HAND_RAISE"),
      createCalibratedProfile(PhysicalRole.RIGHT_HAND, "dev-1", null),
    );

    source.simulateUnexpectedDrop();
    clock += 500; // well under the 3000ms threshold
    await source.connect();

    expect(manager.calibrationStatusOf(PhysicalRole.RIGHT_HAND)).toBe("CALIBRATED");
    const events: unknown[] = [];
    manager.onEvent((event) => events.push(event));
    source.pushOne(fastSample(1));
    expect(events).toHaveLength(1); // detector still usable - no recalibration was required
  });

  it("requires recalibration after a long disconnect, and blocks events until it happens", async () => {
    let clock = 0;
    const manager = new PhysicalInputManager({ recalibrationRequiredAfterDisconnectMs: 3000, now: () => clock });
    const source = await connected("dev-1");
    manager.assignRole(
      PhysicalRole.RIGHT_HAND,
      source,
      new ThresholdTestDetector(PhysicalRole.RIGHT_HAND, "RIGHT_HAND_RAISE"),
      createCalibratedProfile(PhysicalRole.RIGHT_HAND, "dev-1", null),
    );

    source.simulateUnexpectedDrop();
    clock += 5000; // over the threshold - device may have been repositioned
    await source.connect();

    expect(manager.calibrationStatusOf(PhysicalRole.RIGHT_HAND)).toBe("NEEDS_RECALIBRATION");
    const events: unknown[] = [];
    manager.onEvent((event) => events.push(event));
    source.pushOne(fastSample(1));
    expect(events).toEqual([]); // blocked despite a real, otherwise-triggering sample

    manager.recalibrate(PhysicalRole.RIGHT_HAND, createCalibratedProfile(PhysicalRole.RIGHT_HAND, "dev-1", null));
    source.pushOne(fastSample(2));
    expect(events).toHaveLength(1);
  });

  it("reconnecting never replays samples pushed while disconnected", async () => {
    const manager = new PhysicalInputManager();
    const source = await connected("dev-1");
    manager.assignRole(
      PhysicalRole.RIGHT_HAND,
      source,
      new ThresholdTestDetector(PhysicalRole.RIGHT_HAND, "RIGHT_HAND_RAISE"),
      createCalibratedProfile(PhysicalRole.RIGHT_HAND, "dev-1", null),
    );

    await source.disconnect();
    source.pushOne(fastSample(1)); // dropped by SimulatedInputSource itself - not connected
    await source.connect();

    const events: unknown[] = [];
    manager.onEvent((event) => events.push(event));
    // Only the post-reconnect sample below should ever reach the manager;
    // nothing about reconnecting re-delivers the one pushed while disconnected.
    source.pushOne(fastSample(2));
    expect(events).toHaveLength(1);
  });
});
