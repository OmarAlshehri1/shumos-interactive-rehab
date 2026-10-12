import { describe, expect, it } from "vitest";
import {
  Difficulty as BqDifficulty,
  GameState,
  PlayArea,
  TargetSize,
  TargetSpacing,
  applyGameTransition,
  createSession,
  selectBalloon,
} from "@/lib/game";
import {
  Difficulty as FsDifficulty,
  PathStyle,
  PathWidth,
  StepLength,
  applyFootstepsGameTransition,
  confirmCurrentFootstep,
  createFootstepsSession,
} from "@/lib/footsteps";
import {
  BubbleSize,
  Difficulty as BpDifficulty,
  ReachHeight as BpReachHeight,
  ReachSide as BpReachSide,
  TargetMode,
  applyBubblePopGameTransition,
  confirmBubblePopColor,
  createBubblePopSession,
} from "@/lib/bubblepop";
import { PAD_IDS } from "@/lib/colorchase";
import {
  balloonSensorTargets,
  bubblePopSensorTargets,
  bubblePopStationItems,
  colorChaseSensorTargets,
  footstepsSensorTargets,
  isColorChasePadId,
  resolveBubblePopStationContact,
} from "../gameSensorTargets";

function toPlaying<T>(state: T, apply: (state: T, next: GameState, now: number) => { state: T }): T {
  let next = state;
  for (const phase of [GameState.SETUP, GameState.START_ZONE, GameState.INSTRUCTIONS, GameState.COUNTDOWN, GameState.PLAYING]) {
    next = apply(next, phase, Date.now()).state;
  }
  return next;
}

describe("balloonSensorTargets (Balloon Quest)", () => {
  it("targets every unpopped balloon at its real engine position, and drops popped ones", () => {
    const playing = toPlaying(
      createSession({ childFirstName: "طفل", difficulty: BqDifficulty.EASY, targetSize: TargetSize.LARGE, targetSpacing: TargetSpacing.WIDE, playArea: PlayArea.FULL, seed: "gst-balloon", now: Date.now() }),
      applyGameTransition,
    );
    const targets = balloonSensorTargets(playing.currentStage.balloons);
    expect(targets.length).toBe(playing.currentStage.balloons.filter((b) => !b.isPopped).length);
    for (const target of targets) {
      const balloon = playing.currentStage.balloons.find((b) => b.id === target.id);
      expect(balloon).toBeDefined();
      expect(balloon!.isPopped).toBe(false);
      expect(target.x).toBe(balloon!.position.x);
      expect(target.y).toBe(balloon!.position.y);
      expect(target.radius).toBeCloseTo(balloon!.size / 2);
    }

    // Pop one balloon (the real target) via the real canonical action, then confirm it drops out.
    const targetBalloon = playing.currentStage.balloons.find((b) => b.isTarget)!;
    const afterPop = selectBalloon(playing, targetBalloon.id, Date.now()).state;
    const targetsAfterPop = balloonSensorTargets(afterPop.currentStage.balloons);
    expect(targetsAfterPop.find((t) => t.id === targetBalloon.id)).toBeUndefined();
  });
});

describe("footstepsSensorTargets (Follow the Footsteps)", () => {
  it("is always exactly the one current footprint, never a future/completed one", () => {
    expect(footstepsSensorTargets(null)).toEqual([]);

    const playing = toPlaying(
      createFootstepsSession({ childFirstName: "طفل", difficulty: FsDifficulty.EASY, stepLength: StepLength.LONG, pathStyle: PathStyle.STRAIGHT, pathWidth: PathWidth.WIDE, seed: "gst-footsteps" }),
      applyFootstepsGameTransition,
    );
    const stage = playing.currentStage;
    const current = stage.footprints.find((f) => f.index === stage.currentIndex)!;
    const targets = footstepsSensorTargets(current);
    expect(targets).toHaveLength(1);
    expect(targets[0].id).toBe(current.id);
    expect(targets[0].x).toBe(current.position.x);

    // confirmCurrentFootstep never takes a target id — the sensor wiring only uses this module to detect contact, not to name a target.
    const result = confirmCurrentFootstep(playing, Date.now());
    expect(result.success).toBe(true);
  });
});

describe("bubblePopStationItems / bubblePopSensorTargets / resolveBubblePopStationContact (Bubble Pop Wall)", () => {
  it("mirrors StationBar's own station derivation, and round-trips a contact id back to a real (color, shape)", () => {
    const playing = toPlaying(
      createBubblePopSession({ childFirstName: "طفل", difficulty: BpDifficulty.EASY, bubbleSize: BubbleSize.LARGE, reachHeight: BpReachHeight.FULL, reachSide: BpReachSide.FULL, targetMode: TargetMode.COLOR_ONLY, seed: "gst-bubblepop" }),
      applyBubblePopGameTransition,
    );
    const stage = playing.currentStage;
    const items = bubblePopStationItems(stage);
    expect(items.length).toBeGreaterThan(0);
    expect(items.filter((i) => i.isCurrent)).toHaveLength(1);

    const targets = bubblePopSensorTargets(items);
    expect(targets).toHaveLength(items.length);
    // Station x positions are evenly spread and strictly increasing left-to-right, matching stationScreenX's own contract.
    for (let i = 1; i < targets.length; i += 1) expect(targets[i].x).toBeGreaterThan(targets[i - 1].x);
    for (const target of targets) {
      expect(target.x).toBeGreaterThanOrEqual(0);
      expect(target.x).toBeLessThanOrEqual(1);
    }

    const currentItem = items.find((i) => i.isCurrent)!;
    const resolved = resolveBubblePopStationContact(items, currentItem.key);
    expect(resolved).toEqual({ color: currentItem.color, shape: currentItem.shape });
    expect(resolveBubblePopStationContact(items, "not-a-real-key")).toBeNull();

    const result = confirmBubblePopColor(playing, resolved!.color, Date.now(), resolved!.shape);
    expect(result.success).toBe(true);
  });
});

describe("colorChaseSensorTargets (Color Chase)", () => {
  it("produces exactly the 9 real pad ids, all inside [0,1] and mirroring ColorPadGrid's fixed 3x3 region", () => {
    const targets = colorChaseSensorTargets();
    expect(targets).toHaveLength(PAD_IDS.length);
    expect(new Set(targets.map((t) => t.id)).size).toBe(PAD_IDS.length);
    for (const target of targets) {
      expect(isColorChasePadId(target.id)).toBe(true);
      expect(target.x).toBeGreaterThan(0);
      expect(target.x).toBeLessThan(1);
      expect(target.y).toBeGreaterThan(0);
      expect(target.y).toBeLessThan(1);
    }
  });

  it("isColorChasePadId rejects ids that are not real pads", () => {
    expect(isColorChasePadId("NOT_A_PAD")).toBe(false);
  });
});
